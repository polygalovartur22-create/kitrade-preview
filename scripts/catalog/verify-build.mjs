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
const duplicateReport = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "duplicates.json"), "utf8"));
const needsReviewReport = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "needs-review.json"), "utf8"));
const wordstatSummary = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "wordstat-audit-summary.json"), "utf8"));
const wordstatAudit = JSON.parse(fs.readFileSync(path.join(projectDir, "seo", "wordstat-audit.json"), "utf8"));
const categoryWordstatReport = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "category-wordstat-recommendations.json"), "utf8"));
const categoryWordstatCandidates = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "category-wordstat-candidates.json"), "utf8"));
const imageReport = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "images-review.json"), "utf8"));
const ownerConfirmation = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "needs-owner-confirmation.json"), "utf8"));
const validationSummary = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "validation-summary.json"), "utf8"));
const imageReviewPaths = new Set(imageReport.map((row) => row.canonical_path));
const sourceItems = readCatalogData(path.join(projectDir, "kitrade-parts-data.js"));
const sourceById = new Map(sourceItems.map((item) => [String(item.id), item]));
const deploymentMode = process.env.KITRADE_BUILD_MODE || "production";
const isNonProductionBuild = ["preview", "github-pages"].includes(deploymentMode);

const paths = exportRows.map((row) => row.canonical_path);
assert.equal(new Set(paths).size, paths.length, "Export contains duplicate canonical paths");
assert.ok(sourceItems.length > 0, "Source catalog is empty");
assert.ok(registry.entities.products.length >= sourceItems.length, "Permanent registry lost current products");
assert.ok(exportRows.length >= registry.entities.products.length, "Public URL export is incomplete");
assert.ok(seoMap.length > 0, "SEO map is empty");

const balanced = (value) => (String(value).match(/\(/g) || []).length === (String(value).match(/\)/g) || []).length;
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const forbiddenProductMetadata = /—\s*арт\.?\s*\||Арт\.\s*нет/i;
for (const row of seoMap.filter((entry) => entry.page_type === "product")) {
  assert.ok(row.title && row.description && row.h1, `Empty product metadata: ${row.canonical_path}`);
  assert.ok(!forbiddenProductMetadata.test(`${row.title} ${row.description} ${row.h1}`), `Invalid article leaked into metadata: ${row.canonical_path}`);
  assert.ok(balanced(row.title) && balanced(row.h1), `Unbalanced parentheses in metadata: ${row.canonical_path}`);
  assert.ok([...row.title].length <= 75, `Product title exceeds 75 characters: ${row.canonical_path}`);
  assert.ok(!/—\s*№\s*\d+/u.test(row.title), `Artificial product ID leaked into title: ${row.canonical_path}`);
  assert.ok(!/Каталожный номер\s+\d+/iu.test(row.description), `Artificial product ID leaked into description: ${row.canonical_path}`);
  assert.ok(!/BYD\s+FangChengBao\s+Fang Cheng Bao|Fang Cheng Bao\s+Fang Cheng Bao|\(Leopard 5\)\s*\(Leopard 5\)/iu.test(JSON.stringify(row)), `Repeated Fang Cheng Bao alias: ${row.canonical_path}`);
  if (row.article_oem) {
    assert.ok(/\d/.test(row.article_oem), `OEM has no digits: ${row.canonical_path}`);
    assert.ok(!/[\/,;]/.test(row.article_oem), `More than one OEM leaked into metadata: ${row.canonical_path}`);
    assert.ok(row.title.includes(row.article_oem), `Primary OEM is missing from title: ${row.canonical_path}`);
  }
}

for (const product of registry.entities.products) {
  const file = path.join(outputDir, ...product.canonical_path.replace(/^\/+|\/+$/g, "").split("/"), "index.html");
  assert.ok(fs.existsSync(file), `Missing product page ${product.canonical_path}`);
  const html = fs.readFileSync(file, "utf8");
  const exported = exportRows.find((row) => row.entity_type === "product" && String(row.id) === String(product.product_id));
  assert.ok(exported, `Missing exported product ${product.product_id}`);
  assert.ok(html.includes(`rel="canonical" href="${config.siteUrl}${exported.canonical_target_path || product.canonical_path}"`), `Wrong canonical for ${product.canonical_path}`);
  assert.ok(html.includes("data-product-request"), `Missing request control for ${product.canonical_path}`);
  assert.ok(html.includes("Минимальная сумма заказа — 50 000 ₽"), `Missing total order rule: ${product.canonical_path}`);
  if (imageReviewPaths.has(product.canonical_path)) assert.ok(!html.includes('"image":'), `Unreviewed Avito image leaked into Product schema: ${product.canonical_path}`);
  assert.ok(!/Минимальная сумма заказа\s*—\s*15\s*000|Мин\. сумма заказа\s*—\s*15\s*000|Заказ от 15\s*000/.test(html), `Old minimum order rule leaked: ${product.canonical_path}`);
  assert.ok(!/\b(?:предоплата|банковские реквизиты|оплата на карту)\b/i.test(html), `Unconfirmed payment wording leaked: ${product.canonical_path}`);
  const source = sourceById.get(String(product.source_id));
  const rawDescription = String(source?.description || "").trim();
  if (rawDescription.length >= 24) assert.ok(!html.includes(escapeHtml(rawDescription)), `Raw source description leaked: ${product.canonical_path}`);
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
assert.ok(catalogHtml.includes("Минимальная сумма заказа — 50 000 ₽"), "Catalog request cart misses the total order rule");
assert.ok(!/Минимальная сумма заказа\s*—\s*15\s*000|Заказ от 15\s*000/.test(catalogHtml), "Catalog contains the old minimum order rule");
const homeHtml = fs.readFileSync(path.join(outputDir, "index.html"), "utf8");
assert.deepEqual(config.organization, {
  schemaType: "AutoPartsStore",
  name: "Китрейд",
  legalName: "ИП Заварзин Дмитрий Александрович",
  email: "kitrade@bk.ru",
  telephone: "+7-996-457-43-01",
  additionalTelephones: [],
  address: { addressLocality: "Барнаул", streetAddress: "пр-т Ленина, д. 3", addressCountry: "RU" },
  businessDetailsStatus: "confirmed",
}, "Confirmed organization data changed");
for (const value of ['"@type":"AutoPartsStore"', '"name":"Китрейд"', '"legalName":"ИП Заварзин Дмитрий Александрович"', '"email":"kitrade@bk.ru"', '"telephone":"+7-996-457-43-01"', '"streetAddress":"пр-т Ленина, д. 3"']) {
  assert.ok(homeHtml.includes(value), `Organization schema misses ${value}`);
}
assert.equal((homeHtml.match(/<footer\b/g) || []).length, 1, "Home must contain exactly one user-facing footer");
assert.ok(homeHtml.includes('class="reference-footer"'), "Visible reference footer is missing");
assert.ok(!homeHtml.includes('class="site-footer"'), "Hidden legacy footer remains in DOM");
assert.ok(homeHtml.includes("Минимальная сумма заказа — 50 000 ₽"), "Home form/FAQ misses the total order rule");
assert.ok(homeHtml.includes("Цена — за деталь · Доставка отдельно · Минимальная сумма заказа — 50 000 ₽"), "Home request cart misses the price and order clarification");
assert.ok(homeHtml.includes('content="Автозапчасти под заказ из Китая: новые и контрактные детали, проверка по VIN и доставка по России. Минимальная сумма заказа — 50 000 ₽."'), "Home SEO description differs from the approved wording");
assert.ok(homeHtml.includes("по отдельным позициям до 30% дешевле дилеров"), "The qualified 30% benefit is missing from the hero");
assert.ok(homeHtml.includes('<link rel="preload" as="image" href="./assets/hero-parts-static.png"'), "The actual hero image is not preloaded");
assert.ok(!homeHtml.includes('<link rel="preload" as="image" href="./source-dist2/images/car1.jpg"'), "A secondary image is still preloaded instead of the hero");
for (const clientFile of ["catalog-app.js", "home-catalog.js", "product-quick-view.js"]) {
  const source = fs.readFileSync(path.join(outputDir, clientFile), "utf8");
  assert.ok(!/item\??\.description/.test(source), `Raw item.description is referenced by ${clientFile}`);
  assert.ok(!source.includes('.replace(/\\D/g, "")'), `Decimal catalog prices are discarded by ${clientFile}`);
}
const runtimeCatalogSource = fs.readFileSync(path.join(outputDir, "catalog-runtime-data.js"), "utf8");
assert.ok(!runtimeCatalogSource.includes('"description":'), "Raw marketplace descriptions leaked into public runtime data");
const homeCatalogLoader = fs.readFileSync(path.join(outputDir, "home-catalog-loader.js"), "utf8");
assert.ok(!homeCatalogLoader.includes("IntersectionObserver"), "Home still preloads the full catalog on viewport intersection");
assert.ok(homeCatalogLoader.includes('addEventListener("pointerdown", start') && homeCatalogLoader.includes('addEventListener("focusin", start'), "Full home catalog is not gated by a real interaction");
const nginxExample = fs.readFileSync(path.join(projectDir, "deployment", "nginx-kitrade.conf.example"), "utf8");
assert.ok(nginxExample.includes("location = /robots.txt") && nginxExample.includes("location = /sitemap.xml"), "Nginx example lacks short-cache crawler resources");
assert.ok(nginxExample.includes("catalog-runtime-data|catalog-url-data|site-runtime-config"), "Nginx example lacks mutable catalog-data caching");
assert.ok(nginxExample.includes("[0-9a-f]{8,}") && nginxExample.includes("immutable"), "Nginx example does not limit immutable caching to versioned assets");
const formScript = fs.readFileSync(path.join(outputDir, "script.js"), "utf8");
assert.ok(formScript.indexOf('KITRADE_TRACK?.("request_submit_attempt")') < formScript.indexOf("await fetch("), "Submission attempt is not tracked before the request");
assert.ok(formScript.includes('response.type === "opaque"'), "Opaque no-cors responses are not handled separately");
assert.ok(formScript.indexOf('KITRADE_TRACK?.("request_submit_success",') > formScript.indexOf("if (!response.ok)"), "Success is tracked before a confirmed server response");
for (const field of ["metrika_client_id", "yclid", "first_landing_url", "order_id", "selected_products", "preliminary_sum"]) {
  assert.ok(formScript.includes(field), `Request payload architecture is missing ${field}`);
}
const analyticsScript = fs.readFileSync(path.join(outputDir, "analytics.js"), "utf8");
assert.ok(analyticsScript.includes("github\\.io"), "GitHub Pages preview is not excluded from analytics");
assert.ok(analyticsScript.includes("settings?.enabled"), "Runtime analytics switch is ignored");
assert.ok(analyticsScript.includes("__KITRADE_METRIKA_INITIALIZED__"), "Metrika lacks a single-initialization guard");
assert.ok(analyticsScript.includes("metrika/tag.js?id=${counterId}"), "Metrika tag URL does not include the configured counter ID");
assert.ok(analyticsScript.includes('"getClientID"'), "Metrika ClientID is not captured");
assert.ok(!analyticsScript.includes("108681044"), "Old Metrika counter remains in analytics.js");
for (const eventName of ["qualified_50000", "quote_sent", "order_confirmed_50000", "order_paid_50000"]) {
  assert.ok(!formScript.includes(`KITRADE_TRACK?.("${eventName}"`), `Offline event is called by the browser: ${eventName}`);
}
const catalogIndexFiles = [];
const collectCatalogIndexes = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collectCatalogIndexes(target);
    else if (entry.isFile() && entry.name === "index.html" && !target.includes(`${path.sep}product${path.sep}`)) catalogIndexFiles.push(target);
  }
};
collectCatalogIndexes(path.join(outputDir, "catalog"));
const crawlableProductPaths = new Set(catalogIndexFiles.flatMap((file) => (
  [...fs.readFileSync(file, "utf8").matchAll(/href="(\/catalog\/product\/[^"]+\/)"/g)].map((match) => match[1])
)));
const expectedVisiblePaths = new Set(exportRows.filter((row) => row.entity_type === "product" && row.status === "active").map((row) => row.canonical_path));
assert.deepEqual(crawlableProductPaths, expectedVisiblePaths, "Catalog pagination does not contain a crawlable link to every visible product");
assert.ok((catalogHtml.match(/<article class="part-card"/g) || []).length <= 24, "First catalog page contains more than 24 cards");
if (expectedVisiblePaths.size > 24) {
  const nextMatch = catalogHtml.match(/<a class="load-more" id="loadMore" href="([^"]+)"/);
  assert.ok(nextMatch?.[1], "Catalog pagination has no crawlable next URL");
  const nextFile = path.join(outputDir, ...nextMatch[1].replace(/^\/+|\/+$/g, "").split("/"), "index.html");
  assert.ok(fs.existsSync(nextFile), "Catalog next URL does not exist");
}
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
  assert.ok(!homeHtml.includes("data-yandex-metrika"), "Preview build contains the Metrika noscript request");
} else {
  assert.ok(robots.includes(`Sitemap: ${config.siteUrl}/sitemap.xml`));
  assert.ok(robots.includes("Allow: /"), "Production robots.txt must allow crawling");
  assert.ok(runtimeConfig.includes('"deploymentMode":"production"'), "Production runtime marker is missing");
  assert.ok(runtimeConfig.includes('"counterId":111376296'), "Production runtime has the wrong Metrika counter");
  assert.equal((homeHtml.match(/data-yandex-metrika/g) || []).length, 1, "Production home must contain one Metrika noscript fallback");
}
assert.ok(!runtimeConfig.includes("108681044"), "Old Metrika counter remains in runtime config");
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
const vinSeo = seoMap.find((row) => row.canonical_path === "/podbor-zapchastey-po-vin/");
assert.ok(vinSeo?.indexable && vinSeo.primary_query === "подбор запчастей по VIN", "Indexable VIN selection page is missing");
const categoryResults = wordstatAudit.category_results || [];
const categoryPriorities = wordstatAudit.priorities?.categories || {};
const categoryQueries = categoryResults.flatMap((row) => row.checked_queries.map((query) => ({ canonical_path: row.canonical_path, ...query })));
const categoryDemandPages = categoryResults.filter((row) => row.checked_queries.some((query) => query.phrase_frequency > 0));
const phraseMatchSets = new Set(categoryQueries.map((query) => `${query.canonical_path}|${query.phrase_match_set}`));
const demandPhraseMatchSets = new Set(categoryQueries.filter((query) => query.phrase_frequency > 0)
  .map((query) => `${query.canonical_path}|${query.phrase_match_set}`));
const strictOrderQueries = categoryQueries.filter((query) => query.strict_order_query);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
assert.equal(categoryResults.length, 332, "Wordstat category audit must contain all 332 pages");
assert.equal(categoryWordstatReport.count, 332, "Category Wordstat report count changed");
assert.equal(categoryWordstatReport.pages.length, 332, "Category Wordstat report is incomplete");
assert.equal(new Set(categoryResults.map((row) => row.canonical_path)).size, 332, "Wordstat category audit contains duplicate canonicals");
assert.ok(categoryResults.every((row) => row.canonical_path && row.current_primary_query && row.recommended_primary_query && row.decision === "keep" && row.reason), "Wordstat category result is incomplete or changes SEO automatically");
for (const row of categoryResults) {
  assert.equal(new Set(row.checked_queries.map((query) => query.phrase_query)).size, row.checked_queries.length, `Repeated query string in ${row.canonical_path}`);
  assert.equal(row.current_primary_query, row.recommended_primary_query, `Primary query changed without owner approval: ${row.canonical_path}`);
}
assert.ok(categoryQueries.every((query) => query.phrase_query && Number.isInteger(query.phrase_frequency) && query.phrase_frequency >= 0
  && query.phrase_match_set && query.operator_mode === "phrase_match_quotes" && query.region === "Россия" && query.region_id === 225
  && datePattern.test(query.checked_at) && query.observed_at && datePattern.test(query.period_from) && datePattern.test(query.period_to)
  && !Object.hasOwn(query, "exact_query") && !Object.hasOwn(query, "exact_frequency")), "Wordstat phrase result contains missing, artificial or obsolete fields");
assert.ok(strictOrderQueries.every((query) => Number.isInteger(query.strict_order_frequency) && query.strict_order_frequency >= 0
  && query.strict_order_operator_mode === "phrase_and_strict_order" && query.strict_order_region === "Россия" && query.strict_order_region_id === 225
  && datePattern.test(query.strict_order_checked_at) && query.strict_order_observed_at
  && datePattern.test(query.strict_order_period_from) && datePattern.test(query.strict_order_period_to)), "Strict-order Wordstat result is incomplete");
assert.ok(categoryResults.filter((row) => !row.checked_queries.some((query) => query.phrase_frequency > 0))
  .every((row) => row.demand.status === "zero_demand" && row.decision === "keep"), "Zero-demand categories are not explicitly retained");
const computedWordstat = {
  query_strings_checked: categoryQueries.length,
  unique_phrase_match_sets: phraseMatchSets.size,
  phrase_query_strings_with_demand: categoryQueries.filter((query) => query.phrase_frequency > 0).length,
  unique_phrase_match_sets_with_demand: demandPhraseMatchSets.size,
  strict_order_queries_checked: strictOrderQueries.length,
  strict_order_queries_with_demand: strictOrderQueries.filter((query) => query.strict_order_frequency > 0).length,
  category_pages_checked: categoryResults.length,
  category_pages_with_demand: categoryDemandPages.length,
  zero_demand_categories: categoryResults.length - categoryDemandPages.length,
};
for (const [field, value] of Object.entries(computedWordstat)) {
  assert.equal(wordstatSummary[field], value, `Wordstat summary is not calculated from source rows: ${field}`);
  assert.equal(categoryWordstatReport.summary[field], value, `Category Wordstat report summary differs: ${field}`);
  assert.equal(validationSummary.wordstat[field], value, `Validation Wordstat summary differs: ${field}`);
}
assert.equal(wordstatSummary.primary_queries_changed_in_this_run, 0, "A category primary query changed automatically");
assert.equal(wordstatSummary.applied_category_primary_queries, Object.keys(categoryPriorities).length, "Applied category priority count differs from source priorities");
assert.equal(categoryWordstatCandidates.count, categoryWordstatCandidates.candidates.length, "Wordstat candidate report count differs");
assert.equal(categoryWordstatCandidates.count, 0, "Unexpected category candidate was generated");
assert.ok(wordstatAudit.methodology?.phrase_frequency_definition?.includes("фиксируется количество слов, но не их порядок"), "Phrase-frequency methodology is missing");
assert.ok(wordstatAudit.methodology?.snapshot_notice?.includes("скользящего расчётного периода"), "Wordstat snapshot notice is missing");
const weyCategorySeo = seoMap.find((entry) => entry.canonical_path === "/catalog/wey/07/kuzov/");
assert.equal(weyCategorySeo?.primary_query, "запчасти Wey 07 кузов", "Confirmed Wey 07 category primary query changed");
assert.equal(weyCategorySeo?.h1, "Кузовные запчасти для Wey 07", "Confirmed Wey 07 category H1 changed");
assert.equal(wordstatSummary.applied_catalog_changes, 1, "Catalog Wordstat priority was not applied");
assert.equal(wordstatSummary.applied_brand_changes, 10, "Brand Wordstat priorities are incomplete");
assert.equal(wordstatSummary.applied_model_changes, 42, "Model Wordstat priorities are incomplete");
assert.equal(ownerConfirmation.length, 0, "Confirmed, neutralized or removed claims remain in the pending owner report");
assert.deepEqual(validationSummary.pending_business_confirmation, [], "Confirmed business details remain pending");
assert.equal(imageReport.length, 1892, "Image review report count changed");
assert.ok(imageReport.every((row) => row.rights_status === "confirmed_by_owner" && row.rights_source === "company_avito_account"), "Image rights are not confirmed for every reviewed image");
assert.ok(imageReport.every((row) => row.quality_review_pending === true && row.availability_check === "manual_review_required" && row.resolution_check === "manual_review_required" && row.product_match_check === "manual_review_required"), "Image quality/access/resolution/relevance review status is incomplete");
assert.equal(validationSummary.image_rights_confirmed, 1892, "Confirmed image-rights total changed");
assert.equal(validationSummary.image_rights_pending, 0, "Image rights remain pending");
assert.equal(validationSummary.image_quality_review_pending, 1892, "Image quality review total changed");

const sitemapUrlSet = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
const allHtmlFiles = [];
const collectHtml = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collectHtml(target);
    else if (entry.isFile() && entry.name.toLocaleLowerCase("ru").endsWith(".html")) allHtmlFiles.push(target);
  }
};
collectHtml(outputDir);

const routeForFile = (file) => {
  const relative = path.relative(outputDir, file).replaceAll(path.sep, "/");
  if (relative === "index.html") return "/";
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"index.html".length)}`;
  return `/${relative}`;
};
const extract = (html, pattern) => html.match(pattern)?.[1]?.trim() || "";
const htmlPages = allHtmlFiles.map((file) => {
  const html = fs.readFileSync(file, "utf8");
  return {
    file,
    route: routeForFile(file),
    html,
    bytes: Buffer.byteLength(html),
    title: extract(html, /<title>([\s\S]*?)<\/title>/i),
    description: extract(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)
      || extract(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i),
    canonical: extract(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i),
    robots: extract(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)/i),
  };
});
const staticResourceExtensions = /\.(?:css|js|json|xml|png|jpe?g|webp|gif|svg|ico|woff2?|mp4)$/i;
const missingStaticResources = [];
for (const page of htmlPages) {
  for (const match of page.html.matchAll(/\b(?:src|poster|href)=["']([^"']+)["']/gi)) {
    const reference = match[1];
    if (!reference || reference.startsWith("#") || /^(?:data:|mailto:|tel:|javascript:)/i.test(reference)) continue;
    let resolved;
    try {
      resolved = new URL(reference, new URL(page.route, `${config.siteUrl}/`));
    } catch {
      continue;
    }
    if (resolved.origin !== new URL(config.siteUrl).origin || !staticResourceExtensions.test(resolved.pathname)) continue;
    const file = path.join(outputDir, ...decodeURIComponent(resolved.pathname).replace(/^\/+/, "").split("/"));
    if (!fs.existsSync(file)) missingStaticResources.push(`${page.route} -> ${reference}`);
  }
}
assert.deepEqual(missingStaticResources, [], `Missing static resources:\n${missingStaticResources.slice(0, 20).join("\n")}`);
const indexableHtmlPages = htmlPages.filter((page) => page.canonical
  && sitemapUrlSet.has(page.canonical)
  && new URL(page.canonical).pathname === page.route);
const duplicateGroups = (field) => [...indexableHtmlPages.reduce((groups, page) => {
  const key = String(page[field] || "").trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
  if (!key) return groups;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(page.route);
  return groups;
}, new Map()).values()].filter((group) => group.length > 1);
assert.equal(duplicateGroups("title").length, 0, "Indexable pages contain duplicate titles");
assert.equal(duplicateGroups("description").length, 0, "Indexable pages contain duplicate descriptions");
assert.equal(duplicateGroups("canonical").length, 0, "Indexable pages contain duplicate canonical URLs");
assert.equal(new Set(seoMap.map((row) => String(row.primary_query || "").trim().toLocaleLowerCase("ru"))).size, seoMap.length, "Indexable SEO map contains duplicate primary queries");
assert.equal(needsReviewReport.length, 8, "Insufficient-data report must contain the known 8 products");
assert.equal(duplicateReport.filter((group) => group.classification === "confirmed_full_duplicate").length, 4, "Exact duplicate report must preserve the 4 confirmed source pairs");
const ownerDuplicate = duplicateReport.find((group) => group.primary_product_id === 2346 && group.duplicate_product_ids.includes(2085));
assert.ok(ownerDuplicate?.classification === "confirmed_owner_duplicate", "Owner-confirmed duplicate 2085/2346 does not use product 2346 as primary");
for (const pair of [[2217, 2593], [2263, 2659]]) {
  const group = duplicateReport.find((entry) => entry.classification === "distinct_products_pending_metadata"
    && [entry.primary_product_id, ...entry.duplicate_product_ids].sort((a, b) => a - b).join("|") === pair.join("|"));
  assert.ok(group && group.action === "owner_kept_separate_index_self_canonical", `Distinct pair ${pair.join("/")} does not preserve the owner's keep-separate decision`);
  assert.ok(group.secondary_pages.every((page) => page.robots === "index,follow" && page.canonical_path_target === page.canonical_path), `Distinct pair ${pair.join("/")} does not keep indexable self-canonical pages`);
  assert.ok(pair.every((productId) => seoMap.some((row) => Number(row.product_id) === productId && row.indexable)), `Distinct pair ${pair.join("/")} is missing from the indexable SEO map`);
}
assert.ok(duplicateReport.every((group) => group.primary && group.secondary_pages?.length && group.matching_fields && group.differing_fields && group.action), "Duplicate report lacks transparent comparison data");
assert.ok(indexableHtmlPages.every((page) => page.title && page.description && page.canonical), "Indexable page has incomplete metadata");
assert.ok(indexableHtmlPages.every((page) => [...page.title].length <= 75), "Indexable page title exceeds 75 characters");

const pageByCanonical = new Map(indexableHtmlPages.map((page) => [page.canonical, page]));
for (const url of sitemapUrlSet) {
  assert.ok(pageByCanonical.has(url), `Sitemap contains a missing or noncanonical page: ${url}`);
}
for (const page of indexableHtmlPages) {
  assert.ok(sitemapUrlSet.has(page.canonical), `Indexable page is missing from sitemap: ${page.route}`);
  if (isNonProductionBuild) assert.ok(page.robots.includes("noindex"), `Preview page is indexable: ${page.route}`);
  else assert.ok(!page.robots.includes("noindex"), `Production sitemap page is noindex: ${page.route}`);
}
const notFoundPage = htmlPages.find((page) => page.route === "/404.html");
assert.ok(notFoundPage?.robots.includes("noindex"), "404 page must be noindex");

assert.ok(Buffer.byteLength(homeHtml) <= 100 * 1024, "Home HTML exceeds 100 KB");
assert.ok(Buffer.byteLength(catalogHtml) <= 250 * 1024, "Root catalog HTML exceeds 250 KB");
assert.ok(catalogIndexFiles.every((file) => fs.statSync(file).size <= 250 * 1024), "Catalog pagination contains HTML larger than 250 KB");
assert.ok(!/kitrade-parts-data\.js|catalog-url-data\.js|catalog-runtime-data\.js/.test(homeHtml), "Home loads the full catalog data directly");
assert.ok(homeHtml.includes("home-catalog-loader.js"), "Home catalog has no deferred data loader");

const routeSet = new Set(htmlPages.map((page) => page.route));
const incomingLinks = new Map([...routeSet].map((route) => [route, 0]));
const brokenLinks = [];
for (const page of htmlPages) {
  for (const match of page.html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const href = match[1];
    if (!href || href.startsWith("#") || /^(?:mailto:|tel:|javascript:)/i.test(href)) continue;
    let target;
    try {
      const resolved = new URL(href, new URL(page.route, `${config.siteUrl}/`));
      if (resolved.origin !== new URL(config.siteUrl).origin) continue;
      target = resolved.pathname;
    } catch {
      brokenLinks.push(`${page.route} -> ${href}`);
      continue;
    }
    const candidate = target === "/index.html" ? "/" : target;
    if (routeSet.has(candidate)) incomingLinks.set(candidate, (incomingLinks.get(candidate) || 0) + 1);
    else if (!path.extname(candidate) && !["/catalog"].includes(candidate)) brokenLinks.push(`${page.route} -> ${href}`);
  }
}
assert.deepEqual(brokenLinks, [], `Broken internal links:\n${brokenLinks.slice(0, 20).join("\n")}`);
const orphanRoutes = indexableHtmlPages.map((page) => page.route)
  .filter((route) => route !== "/" && (incomingLinks.get(route) || 0) === 0);
assert.deepEqual(orphanRoutes, [], `Indexable orphan pages:\n${orphanRoutes.slice(0, 20).join("\n")}`);

for (const file of catalogIndexFiles) {
  const html = fs.readFileSync(file, "utf8");
  const route = routeForFile(file);
  const cardCount = (html.match(/<article class="part-card"/g) || []).length;
  assert.ok(cardCount <= 24, `Pagination page contains more than 24 cards: ${route}`);
  const canonical = extract(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i);
  assert.equal(canonical, new URL(route, `${config.siteUrl}/`).href, `Pagination canonical is not self-referencing: ${route}`);
  if (/\/page\/\d+\/$/.test(route)) assert.ok(sitemapUrlSet.has(canonical), `Pagination page is missing from sitemap: ${route}`);
  const description = extract(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i);
  assert.ok(!/VIN Страница|отдельно Страница|\.\.|  /u.test(description), `Broken pagination description punctuation: ${route}`);
  if (/\/page\/\d+\/$/.test(route)) assert.ok(/[.!?] Страница \d+\.$/u.test(description), `Pagination description has no sentence boundary: ${route}`);
}

const catalogAppSource = fs.readFileSync(path.join(outputDir, "catalog-app.js"), "utf8");
assert.ok(catalogAppSource.includes("const PAGE_SIZE = 24"), "Client pagination does not use the shared 24-card size");
assert.ok(!/visible\s*(?::|=|\+=)\s*12\b/.test(catalogAppSource), "Legacy 12-card client pagination remains");
const rootPageFiles = [1, 2, 3].map((pageNumber) => pageNumber === 1
  ? path.join(outputDir, "catalog", "index.html")
  : path.join(outputDir, "catalog", "page", String(pageNumber), "index.html"));
const rootPageIds = rootPageFiles.map((file) => [...fs.readFileSync(file, "utf8").matchAll(/<article class="part-card" data-id="([^"]+)"/g)].map((match) => match[1]));
assert.deepEqual(rootPageIds.map((ids) => ids.length), [24, 24, 24], "Catalog pages 1–3 must each contain exactly 24 cards");
assert.equal(new Set(rootPageIds.flat()).size, 72, "Catalog pages 1–3 contain a gap or duplicate product");
assert.ok(fs.readFileSync(rootPageFiles[0], "utf8").includes('id="loadMore" href="/catalog/page/2/"'), "First catalog page does not link to page 2");

const searchTargetMap = JSON.parse(fs.readFileSync(path.join(outputDir, "search-target-map.json"), "utf8"));
assert.equal(searchTargetMap.groups.length, 107, "Search target map must preserve all 107 source groups");
assert.deepEqual(searchTargetMap.source_groups, { total: 107, wide: 1, brands: 25, models: 81 }, "Search target source totals changed");
assert.ok(searchTargetMap.groups.every((group) => group.source_row && group.match_status && Object.hasOwn(group, "missing_reason")), "Search target group lost source traceability");
assert.equal(new Set(searchTargetMap.groups.map((group) => group.source_row)).size, 107, "Source landing rows are duplicated or missing");
assert.ok(Array.isArray(searchTargetMap.groups) && searchTargetMap.groups.length > 0, "Search target map is empty");
for (const group of searchTargetMap.groups) {
  assert.ok(group.search_group && group.queries?.length && group.canonical_path && group.canonical_url, "Search target group is incomplete");
  assert.ok(sitemapUrlSet.has(group.canonical_url), `Direct target is not indexable: ${group.search_group}`);
  assert.ok(fs.existsSync(path.join(outputDir, ...group.canonical_path.replace(/^\/+|\/+$/g, "").split("/"), "index.html")), `Direct target does not exist: ${group.search_group}`);
}

const decodeHtml = (value) => String(value || "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+/g, " ").trim();
const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();
const parseVisiblePrice = (value) => Number(String(value || "")
  .replace(/[\s\u00a0₽]/g, "")
  .replace(",", ".")
  .replace(/[^\d.]/g, "")) || 0;
for (const page of indexableHtmlPages.filter((entry) => entry.route.startsWith("/catalog/product/"))) {
  const schemaSource = extract(page.html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  const schemas = JSON.parse(schemaSource);
  const list = Array.isArray(schemas) ? schemas : [schemas];
  const productSchema = list.find((schema) => schema?.["@type"] === "Product");
  const breadcrumbSchema = list.find((schema) => schema?.["@type"] === "BreadcrumbList");
  assert.ok(productSchema && breadcrumbSchema, `Product structured data is incomplete: ${page.route}`);
  const visibleName = decodeHtml(extract(page.html, /<h1>([\s\S]*?)<\/h1>/i));
  const visibleDescription = decodeHtml(extract(page.html, /<p class="product-page-description">([\s\S]*?)<\/p>/i));
  const visiblePrice = decodeHtml(extract(page.html, /<strong class="product-page-price">([\s\S]*?)<\/strong>/i));
  assert.equal(normalizeText(productSchema.name), visibleName, `Product schema name differs from visible H1: ${page.route}`);
  assert.equal(normalizeText(productSchema.description), visibleDescription, `Product schema description differs from visible text: ${page.route}`);
  assert.equal(Number(productSchema.offers?.price || 0), parseVisiblePrice(visiblePrice), `Product schema price differs from visible price: ${page.route}`);
  assert.ok(!productSchema.image?.some?.((image) => /avito|placeholder|fallback|01-catalog|02-catalog|03-catalog/i.test(image)), `Unconfirmed image leaked into Product schema: ${page.route}`);
  const visibleCrumbs = [...extract(page.html, /<nav class="catalog-breadcrumbs"[^>]*>([\s\S]*?)<\/nav>/i).matchAll(/<(?:a|span)[^>]*(?:aria-current="page")?[^>]*>([^<]+)<\/(?:a|span)>/g)]
    .map((match) => decodeHtml(match[1])).filter((label) => label && label !== "/");
  const schemaCrumbs = breadcrumbSchema.itemListElement?.map((item) => item.name) || [];
  assert.deepEqual(schemaCrumbs, visibleCrumbs, `Breadcrumb schema differs from visible breadcrumbs: ${page.route}`);
}

const knownNameAnomalies = [
  /\bbaik\b/i,
  /Polar Stone Polar Stone/i,
  /Pathfinder Nissan Pathfinder/i,
  /Yangwang U8L BYD Yangwang U8/i,
  /X5Li Bmw X5/i,
  /G-Class Mercedes-Benz G-/i,
];
for (const row of seoMap.filter((entry) => entry.page_type === "product")) {
  assert.ok(!knownNameAnomalies.some((pattern) => pattern.test(row.h1)), `Known vehicle name anomaly returned: ${row.canonical_path}`);
}

const redirects = fs.readFileSync(path.join(outputDir, "_redirects"), "utf8");
assert.ok(redirects.includes("/catalog.html /catalog/ 301!"));
assert.ok(redirects.includes("/catalog/fangchengbao/bao-5/ /catalog/fang-cheng-bao/bao-5-leopard-5/ 301!"));
assert.ok(redirects.includes("/* /404.html 404"));

console.log(`Verified ${registry.entities.products.length} permanent product pages and ${exportRows.length} exported URL records.`);
