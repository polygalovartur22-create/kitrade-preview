import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCatalogData } from "./lib/data.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = path.join(projectDir, "dist");
const registry = JSON.parse(fs.readFileSync(path.join(projectDir, "catalog-url-map.json"), "utf8"));
const config = JSON.parse(fs.readFileSync(path.join(projectDir, "site.config.json"), "utf8"));
const exportRows = JSON.parse(fs.readFileSync(path.join(outputDir, "catalog-urls.json"), "utf8"));
const seoMap = JSON.parse(fs.readFileSync(path.join(outputDir, "seo-map.json"), "utf8"));
const publicItems = readCatalogData(path.join(outputDir, "kitrade-parts-data.js"));
const deploymentMode = process.env.KITRADE_BUILD_MODE || "production";
const isNonProductionBuild = ["preview", "github-pages"].includes(deploymentMode);

const paths = exportRows.map((row) => row.canonical_path);
assert.equal(new Set(paths).size, paths.length, "Export contains duplicate canonical paths");

for (const product of registry.entities.products) {
  const file = path.join(outputDir, ...product.canonical_path.replace(/^\/+|\/+$/g, "").split("/"), "index.html");
  assert.ok(fs.existsSync(file), `Missing product page ${product.canonical_path}`);
  const html = fs.readFileSync(file, "utf8");
  assert.ok(html.includes(`rel="canonical" href="${config.siteUrl}${product.canonical_path}"`), `Wrong canonical for ${product.canonical_path}`);
  assert.ok(html.includes("data-product-request"), `Missing request control for ${product.canonical_path}`);
  const exported = exportRows.find((row) => row.entity_type === "product" && String(row.id) === String(product.product_id));
  assert.ok(exported, `Missing exported product ${product.product_id}`);
  if (exported.indexable) {
    assert.ok(!html.includes('content="noindex,follow"'), `Indexable product is noindex: ${product.canonical_path}`);
    assert.ok(html.includes('"@type":"Product"'), `Missing Product schema for ${product.canonical_path}`);
    assert.ok(html.includes('"availability":"https://schema.org/PreOrder"'), `Wrong availability for ${product.canonical_path}`);
    const article = String(product.source_snapshot?.article || "").trim();
    if (article) {
      assert.ok(html.includes(article), `Product article is missing: ${product.canonical_path}`);
      assert.ok(html.includes('"mpn"'), `Product article is missing from schema: ${product.canonical_path}`);
    }
  } else {
    assert.ok(html.includes('content="noindex,follow"'), `Excluded product is not noindex: ${product.canonical_path}`);
    assert.ok(!html.includes('"@type":"Product"'), `Excluded product leaked into Product schema: ${product.canonical_path}`);
  }
}

assert.equal(publicItems.length, registry.entities.products.length, "Public catalog item count does not match registry");
const publicItemById = new Map(publicItems.map((item) => [String(item.id), item]));
for (const product of registry.entities.products) {
  const item = publicItemById.get(String(product.product_id));
  assert.ok(item, `Public catalog is missing product ${product.product_id}`);
  assert.equal(item.article || "", String(product.source_snapshot?.article || "").trim(), `Wrong public article for ${product.product_id}`);
  assert.ok(!Object.hasOwn(item, "sourceSheet"), `Private source sheet leaked for ${product.product_id}`);
  assert.ok(!String(item.description).match(/большой ассортимент запчастей|оплата наличными|звоните будем рады/i), `Avito boilerplate leaked for ${product.product_id}`);
}

const catalogHtml = fs.readFileSync(path.join(outputDir, "catalog", "index.html"), "utf8");
assert.ok(catalogHtml.includes('href="/catalog/product/'), "Catalog has no real product links");
assert.ok(catalogHtml.includes("data-product-link"), "Catalog links are not wired for quick view");
assert.ok(!catalogHtml.includes("data-catalog-route-links"), "Technical route index leaked into the visible catalog markup");
assert.ok(catalogHtml.includes("data-filter-option-link"), "Catalog hierarchy has no static href controls");
assert.ok(catalogHtml.includes('id="catalog-results"'), "Direct catalog results anchor is missing");
const crawlableProductPaths = new Set([...catalogHtml.matchAll(/href="(\/catalog\/product\/[^"]+\/)"/g)].map((match) => match[1]));
const expectedVisiblePaths = new Set(exportRows.filter((row) => row.entity_type === "product" && row.status === "active").map((row) => row.canonical_path));
assert.deepEqual(crawlableProductPaths, expectedVisiblePaths, "Root catalog does not contain a crawlable link to every visible product");
const sitemap = fs.readFileSync(path.join(outputDir, "sitemap.xml"), "utf8");
for (const row of exportRows) {
  if (row.indexable) assert.ok(sitemap.includes(`<loc>${row.canonical_url}</loc>`), `Sitemap is missing ${row.canonical_url}`);
  else assert.ok(!sitemap.includes(`<loc>${row.canonical_url}</loc>`), `Sitemap contains excluded URL ${row.canonical_url}`);
}
const robots = fs.readFileSync(path.join(outputDir, "robots.txt"), "utf8");
const runtimeConfig = fs.readFileSync(path.join(outputDir, "site-runtime-config.js"), "utf8");
const headers = fs.readFileSync(path.join(outputDir, "_headers"), "utf8");
if (isNonProductionBuild) {
  assert.equal(robots, "User-agent: *\nDisallow: /\n", "Preview robots.txt must block all crawling");
  assert.ok(runtimeConfig.includes(`"deploymentMode":"${deploymentMode}"`), "Preview runtime marker is missing");
  assert.ok(runtimeConfig.includes('"enabled":false'), "Analytics is enabled in preview runtime config");
  assert.ok(headers.includes("X-Robots-Tag: noindex, nofollow, noarchive"), "Preview X-Robots-Tag header is missing");
} else {
  assert.ok(robots.includes(`Sitemap: ${config.siteUrl}/sitemap.xml`));
  assert.ok(robots.includes("Allow: /"), "Production robots.txt must allow crawling");
  assert.ok(runtimeConfig.includes('"deploymentMode":"production"'), "Production runtime marker is missing");
  assert.ok(!headers.includes("X-Robots-Tag"), "Production headers must not block indexing");
}
assert.ok(seoMap.length > 0 && seoMap.every((row) => row.indexable), "Promoted SEO map contains excluded rows");
assert.ok(seoMap.filter((row) => row.page_type === "product").every((row) => typeof row.article_oem === "string"), "Product SEO map has an invalid article field");
for (const requiredField of ["page_type", "entity_id", "canonical_url", "title", "description", "h1", "robots", "validation_errors"]) {
  assert.ok(seoMap.every((row) => Object.hasOwn(row, requiredField)), `SEO map is missing ${requiredField}`);
}

const metadata = [];
for (const row of seoMap) {
  const file = row.canonical_path === "/"
    ? path.join(outputDir, "index.html")
    : path.join(outputDir, ...row.canonical_path.replace(/^\/+|\/+$/g, "").split("/"), "index.html");
  assert.ok(fs.existsSync(file), `Indexable SEO page is missing: ${row.canonical_path}`);
  const html = fs.readFileSync(file, "utf8");
  assert.ok(html.includes(`rel="canonical" href="${row.canonical_url}"`), `Wrong SEO canonical: ${row.canonical_path}`);
  metadata.push(row);
}
for (const field of ["title", "description", "h1", "canonical_url"]) {
  assert.equal(new Set(metadata.map((row) => row[field])).size, metadata.length, `SEO map contains duplicate ${field}`);
}

const redirects = fs.readFileSync(path.join(outputDir, "_redirects"), "utf8");
assert.ok(redirects.includes("/catalog.html /catalog/ 301!"));
assert.ok(redirects.includes("/* /404.html 404"));
for (const product of registry.entities.products) {
  for (const legacyPath of product.legacy_paths || []) {
    if (legacyPath !== product.canonical_path) {
      assert.ok(redirects.includes(`${legacyPath} ${product.canonical_path} 301!`), `Missing static redirect: ${legacyPath}`);
    }
  }
}

console.log(`Verified ${registry.entities.products.length} permanent product pages and ${exportRows.length} exported URL records.`);
