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
const sourceItems = readCatalogData(path.join(projectDir, "kitrade-parts-data.js"));
const sourceById = new Map(sourceItems.map((item) => [String(item.id), item]));
const deploymentMode = process.env.KITRADE_BUILD_MODE || "production";
const isNonProductionBuild = ["preview", "github-pages"].includes(deploymentMode);

const paths = exportRows.map((row) => row.canonical_path);
assert.equal(new Set(paths).size, paths.length, "Export contains duplicate canonical paths");
assert.equal(registry.entities.products.length, 1941, "Permanent product count changed");
assert.equal(exportRows.length, 2411, "Public URL row count changed");
assert.equal(seoMap.length, 2399, "Indexable SEO page count changed");

const balanced = (value) => (String(value).match(/\(/g) || []).length === (String(value).match(/\)/g) || []).length;
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const forbiddenProductMetadata = /—\s*арт\.?\s*\||Арт\.\s*нет/i;
for (const row of seoMap.filter((entry) => entry.page_type === "product")) {
  assert.ok(row.title && row.description && row.h1, `Empty product metadata: ${row.canonical_path}`);
  assert.ok(!forbiddenProductMetadata.test(`${row.title} ${row.description} ${row.h1}`), `Invalid article leaked into metadata: ${row.canonical_path}`);
  assert.ok(balanced(row.title) && balanced(row.h1), `Unbalanced parentheses in metadata: ${row.canonical_path}`);
  const expectedTitle = row.article_oem ? `${row.h1}, ${row.article_oem} | KITRADE` : `${row.h1} под заказ | KITRADE`;
  assert.equal(row.title, expectedTitle, `Unexpected product title format: ${row.canonical_path}`);
}

for (const product of registry.entities.products) {
  const file = path.join(outputDir, ...product.canonical_path.replace(/^\/+|\/+$/g, "").split("/"), "index.html");
  assert.ok(fs.existsSync(file), `Missing product page ${product.canonical_path}`);
  const html = fs.readFileSync(file, "utf8");
  assert.ok(html.includes(`rel="canonical" href="${config.siteUrl}${product.canonical_path}"`), `Wrong canonical for ${product.canonical_path}`);
  assert.ok(html.includes("data-product-request"), `Missing request control for ${product.canonical_path}`);
  assert.ok(html.includes("Минимальная общая сумма заказа — 50 000 ₽"), `Missing total order rule: ${product.canonical_path}`);
  assert.ok(!/Минимальная сумма заказа\s*—\s*15\s*000|Мин\. сумма заказа\s*—\s*15\s*000|Заказ от 15\s*000/.test(html), `Old minimum order rule leaked: ${product.canonical_path}`);
  assert.ok(!/\b(?:предоплата|банковские реквизиты|оплата на карту)\b/i.test(html), `Unconfirmed payment wording leaked: ${product.canonical_path}`);
  const source = sourceById.get(String(product.source_id));
  const rawDescription = String(source?.description || "").trim();
  if (rawDescription.length >= 24) assert.ok(!html.includes(escapeHtml(rawDescription)), `Raw source description leaked: ${product.canonical_path}`);
  const exported = exportRows.find((row) => row.entity_type === "product" && String(row.id) === String(product.product_id));
  assert.ok(exported, `Missing exported product ${product.product_id}`);
  if (exported.indexable) {
    assert.ok(!html.includes('content="noindex,follow"'), `Indexable product is noindex: ${product.canonical_path}`);
    assert.ok(html.includes('"@type":"Product"'), `Missing Product schema for ${product.canonical_path}`);
    assert.ok(html.includes('"availability":"https://schema.org/PreOrder"'), `Wrong availability for ${product.canonical_path}`);
  } else {
    if (isNonProductionBuild) assert.ok(html.includes('content="noindex,nofollow,noarchive"'), `Excluded preview product is not noindex: ${product.canonical_path}`);
    else assert.ok(html.includes('content="noindex,follow"'), `Excluded product is not noindex: ${product.canonical_path}`);
    assert.ok(!html.includes('"@type":"Product"'), `Excluded product leaked into Product schema: ${product.canonical_path}`);
  }
}

const catalogHtml = fs.readFileSync(path.join(outputDir, "catalog", "index.html"), "utf8");
assert.ok(catalogHtml.includes('href="/catalog/product/'), "Catalog has no real product links");
assert.ok(catalogHtml.includes("data-product-link"), "Catalog links are not wired for quick view");
assert.ok(!catalogHtml.includes("data-catalog-route-links"), "Technical route index leaked into the visible catalog markup");
assert.ok(catalogHtml.includes("data-filter-option-link"), "Catalog hierarchy has no static href controls");
assert.ok(catalogHtml.includes('id="catalog-results"'), "Direct catalog results anchor is missing");
assert.ok(catalogHtml.includes("Общий заказ — от 50 000 ₽"), "Catalog request cart misses the total order rule");
assert.ok(!/Минимальная сумма заказа\s*—\s*15\s*000|Заказ от 15\s*000/.test(catalogHtml), "Catalog contains the old minimum order rule");
const homeHtml = fs.readFileSync(path.join(outputDir, "index.html"), "utf8");
assert.ok(homeHtml.includes("Минимальная общая сумма заказа — 50 000 ₽"), "Home form/FAQ misses the total order rule");
assert.ok(homeHtml.includes("Цена — за деталь · Доставка отдельно · Заказ от 50 000 ₽"), "Home request cart misses the price and order clarification");
for (const clientFile of ["catalog-app.js", "home-catalog.js", "product-quick-view.js"]) {
  const source = fs.readFileSync(path.join(outputDir, clientFile), "utf8");
  assert.ok(!/item\??\.description/.test(source), `Raw item.description is referenced by ${clientFile}`);
}
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
if (isNonProductionBuild) {
  assert.equal(robots, "User-agent: *\nDisallow: /\n", "Preview robots.txt must block all crawling");
  assert.ok(runtimeConfig.includes(`"deploymentMode":"${deploymentMode}"`), "Preview runtime marker is missing");
  assert.ok(runtimeConfig.includes('"enabled":false'), "Analytics is enabled in preview runtime config");
  const previewHeaders = fs.readFileSync(path.join(outputDir, "_headers"), "utf8");
  assert.ok(previewHeaders.includes("X-Robots-Tag: noindex, nofollow, noarchive"), "Preview X-Robots-Tag header is missing");
} else {
  assert.ok(robots.includes(`Sitemap: ${config.siteUrl}/sitemap.xml`));
  assert.ok(robots.includes("Allow: /"), "Production robots.txt must allow crawling");
  assert.ok(runtimeConfig.includes('"deploymentMode":"production"'), "Production runtime marker is missing");
}
assert.ok(seoMap.length > 0 && seoMap.every((row) => row.indexable), "Promoted SEO map contains excluded rows");
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
  if (isNonProductionBuild) assert.ok(html.includes('content="noindex,nofollow,noarchive"'), `Preview meta robots is missing: ${row.canonical_path}`);
  metadata.push(row);
}
for (const field of ["title", "description", "h1", "canonical_url"]) assert.ok(metadata.every((row) => row[field]), `SEO map contains empty ${field}`);
assert.equal(new Set(metadata.map((row) => row.canonical_url)).size, metadata.length, "SEO map contains duplicate canonical_url");

const redirects = fs.readFileSync(path.join(outputDir, "_redirects"), "utf8");
assert.ok(redirects.includes("/catalog.html /catalog/ 301!"));
assert.ok(redirects.includes("/* /404.html 404"));

console.log(`Verified ${registry.entities.products.length} permanent product pages and ${exportRows.length} exported URL records.`);
