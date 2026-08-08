import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = path.join(projectDir, "dist");
const reportsDir = path.join(projectDir, "reports", "seo");
const config = JSON.parse(fs.readFileSync(path.join(projectDir, "site.config.json"), "utf8"));
const sitemapXml = fs.readFileSync(path.join(outputDir, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"], [".xml", "application/xml; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"], [".txt", "text/plain; charset=utf-8"],
]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = pathname.replace(/^\/+/, "");
  let file = path.resolve(outputDir, relative);
  if (pathname.endsWith("/")) file = path.join(file, "index.html");
  if (!file.startsWith(outputDir)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    const notFound = path.join(outputDir, "404.html");
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    response.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : "Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": contentTypes.get(path.extname(file)) || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const localOrigin = `http://127.0.0.1:${address.port}`;
const errors = [];
let cursor = 0;
const worker = async () => {
  while (cursor < sitemapUrls.length) {
    const index = cursor;
    cursor += 1;
    const url = sitemapUrls[index];
    const pathname = new URL(url).pathname;
    try {
      const response = await fetch(`${localOrigin}${pathname}`);
      if (response.status !== 200) errors.push({ canonical_url: url, pathname, status: response.status });
    } catch (error) {
      errors.push({ canonical_url: url, pathname, error: error.message });
    }
  }
};
await Promise.all(Array.from({ length: 32 }, worker));

const fetchHtml = async (pathname) => {
  const response = await fetch(`${localOrigin}${pathname}`);
  return { response, html: await response.text() };
};
const missing = await fetchHtml("/catalog/product/otsutstvuyushchaya-detal-999999/");
const utm = await fetchHtml("/catalog/aito/m8/?utm_source=audit&utm_medium=test&utm_campaign=canonical");
const utmCanonical = utm.html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] || "";
const home = await fetchHtml("/");
const catalog = await fetchHtml("/catalog/");
const productPath = new URL(sitemapUrls.find((url) => /\/catalog\/product\//.test(url))).pathname;
const product = await fetchHtml(productPath);
const productSchemas = [...product.html.matchAll(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)]
  .flatMap((match) => {
    const value = JSON.parse(match[1]);
    return Array.isArray(value) ? value : [value];
  });
const productSchema = productSchemas.find((schema) => schema?.["@type"] === "Product");

assert.equal(errors.length, 0, `Sitemap HTTP errors: ${JSON.stringify(errors.slice(0, 20))}`);
assert.equal(missing.response.status, 404, "Missing product URL does not return HTTP 404");
assert.equal(utm.response.status, 200, "UTM page does not return HTTP 200");
assert.equal(utmCanonical, `${config.siteUrl}/catalog/aito/m8/`, "UTM parameters leaked into canonical URL");
assert.ok(home.html.includes('"@type":"AutoPartsStore"'), "Home lacks Organization/AutoPartsStore structured data");
assert.ok(catalog.html.includes('"@type":"BreadcrumbList"'), "Catalog lacks BreadcrumbList structured data");
assert.ok(productSchema, "Product page lacks Product structured data");
assert.equal(productSchema.offers?.["@type"], "Offer", "Product page lacks Offer structured data");
assert.ok(productSchemas.some((schema) => schema?.["@type"] === "BreadcrumbList"), "Product page lacks BreadcrumbList structured data");
assert.ok(productSchemas.some((schema) => schema?.["@type"] === "AutoPartsStore"), "Product page lacks Organization/AutoPartsStore structured data");

const report = {
  audit_version: 1,
  summary: {
    sitemap_urls_checked: sitemapUrls.length,
    sitemap_http_200: sitemapUrls.length - errors.length,
    sitemap_http_errors: errors.length,
    missing_product_http_status: missing.response.status,
    utm_page_http_status: utm.response.status,
    utm_canonical: utmCanonical,
    structured_data: { Product: true, Offer: true, BreadcrumbList: true, Organization_AutoPartsStore: true },
  },
  errors,
};
fs.writeFileSync(path.join(reportsDir, "http-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
console.log(`HTTP audit: ${sitemapUrls.length} sitemap URLs returned 200; missing product returned 404.`);
