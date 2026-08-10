import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCatalogData } from "./lib/data.mjs";
import { productTitleHasMainNoun, productTitleHasVehicle } from "./lib/product-content.mjs";
import { buildNonCategoryHypotheses, computeWordstatSummary, deriveWordstatPriorities, phraseMatchSet } from "./lib/wordstat.mjs";

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
const nonCategoryWordstatReport = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "non-category-wordstat-observations.json"), "utf8"));
const imageReport = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "images-review.json"), "utf8"));
const imageSummary = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "images-summary.json"), "utf8"));
const productConflictReport = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "product-data-conflicts.json"), "utf8"));
const oemConflictReport = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "oem-conflicts.json"), "utf8"));
const ownerConfirmation = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "needs-owner-confirmation.json"), "utf8"));
const validationSummary = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "validation-summary.json"), "utf8"));
const internalLinkingAudit = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "internal-linking-audit.json"), "utf8"));
const cannibalizationAudit = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "cannibalization-audit.json"), "utf8"));
const commercialFactorsAudit = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "commercial-factors-audit.json"), "utf8"));
const zeroDemandDecisions = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "zero-demand-decisions.json"), "utf8"));
const directLandingAudit = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "direct-landing-audit.json"), "utf8"));
const directTargetGaps = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "direct-target-gaps.json"), "utf8"));
const formSubmissionAudit = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "form-submission-audit.json"), "utf8"));
const metadataContentAudit = JSON.parse(fs.readFileSync(path.join(projectDir, "reports", "seo", "metadata-content-audit.json"), "utf8"));
const imageReviewUrls = new Set(imageReport.map((row) => row.raw_url));
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
assert.equal(internalLinkingAudit.summary.indexable_pages_checked, seoMap.length, "Internal-linking audit does not cover the full SEO map");
assert.equal(internalLinkingAudit.summary.orphan_pages, 0, "Internal-linking audit contains orphan pages");
assert.equal(internalLinkingAudit.summary.unreachable_pages, 0, "Internal-linking audit contains pages unreachable from home");
assert.equal(internalLinkingAudit.summary.broken_internal_links, 0, "Internal-linking audit contains broken links");
assert.equal(internalLinkingAudit.summary.links_to_noindex, 0, "Internal-linking audit contains crawlable links to noindex pages");
assert.equal(internalLinkingAudit.summary.hidden_terminal_pagination_links, 0, "Hidden terminal pagination contains crawlable links");
assert.equal(internalLinkingAudit.summary.pages_missing_expected_hierarchy_links, 0, "Internal-linking audit contains incomplete hierarchy links");
assert.equal(internalLinkingAudit.summary.pages_with_errors, 0, "Internal-linking audit contains unresolved page errors");
assert.equal(cannibalizationAudit.summary.indexable_pages_checked, seoMap.length, "Cannibalization audit does not cover the full SEO map");
assert.equal(cannibalizationAudit.summary.primary_query_conflicts, 0, "Unresolved normalized primary-query conflicts remain");
assert.ok(cannibalizationAudit.conflicts.every((group) => group.decision.startsWith("manual_") && group.decision.endsWith("_review_keep_separate")), "Product-query conflicts lack a safe explicit manual-review decision");
assert.equal(cannibalizationAudit.decisions.keep_separate_pending_owner_confirmation.length, 0, "An unresolved conflict lacks a classified review reason");
assert.equal(cannibalizationAudit.summary.duplicate_titles, 0, "Cannibalization audit contains duplicate titles");
assert.equal(cannibalizationAudit.summary.duplicate_descriptions, 0, "Cannibalization audit contains duplicate descriptions");
assert.equal(commercialFactorsAudit.summary.pages_checked, seoMap.length, "Commercial-factor audit does not cover the full SEO map");
assert.equal(commercialFactorsAudit.summary.pages_requiring_review, 0, "Confirmed commercial information is incomplete on some pages");
assert.equal(zeroDemandDecisions.summary.zero_demand_categories_reviewed, 316, "Zero-demand decisions do not cover all 316 categories");
assert.equal(zeroDemandDecisions.summary.noindexed_due_to_zero_frequency, 0, "A category was noindexed solely due to zero frequency");
assert.equal(directLandingAudit.summary.groups_checked, 107, "Direct landing audit does not cover all source groups");
assert.equal(directLandingAudit.summary.not_ready, 0, "A mapped Direct group is not ready after production launch");
assert.equal(directLandingAudit.summary.additional_semantic_gaps_without_current_catalog_target, 0, "A false or real Direct target gap remains");
assert.equal(metadataContentAudit.summary.pages_checked, seoMap.length, "Metadata audit does not cover the full SEO map");
assert.equal(metadataContentAudit.summary.pages_with_issues, 0, "Metadata audit contains unresolved issues");
assert.equal(metadataContentAudit.summary.duplicate_titles, 0, "Metadata audit contains duplicate titles");
assert.equal(metadataContentAudit.summary.duplicate_descriptions, 0, "Metadata audit contains duplicate descriptions");
assert.equal(metadataContentAudit.summary.product_titles_missing_main_part_noun, 0, "A product Title has lost its main part noun");
assert.equal(metadataContentAudit.summary.product_titles_missing_brand_or_model, 0, "A product Title has lost its brand/model identity");
assert.equal(metadataContentAudit.summary.product_titles_missing_primary_oem, 0, "A product Title has lost its primary OEM");
assert.equal(metadataContentAudit.summary.forbidden_public_name_forms, 0, "A forbidden public entity-name form remains");
assert.equal(metadataContentAudit.summary.joined_opening_parentheses, 0, "A public word is joined to an explanatory opening parenthesis");

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
  assert.ok(productTitleHasMainNoun(row.title, row.h1, row.brand, row.model), `Main part noun is missing from product Title: ${row.canonical_path}`);
  assert.ok(productTitleHasVehicle(row.title, row.brand, row.model), `Brand/model or approved short alias is missing from product Title: ${row.canonical_path}`);
  if (row.article_oem) {
    assert.ok(/\d/.test(row.article_oem), `OEM has no digits: ${row.canonical_path}`);
    assert.ok(!/[\/,;]/.test(row.article_oem), `More than one OEM leaked into metadata: ${row.canonical_path}`);
    assert.ok(row.title.includes(row.article_oem), `Primary OEM is missing from title: ${row.canonical_path}`);
  }
}

const publicMetadataText = (row) => [row.title, row.description, row.h1, row.intro_text, row.primary_query].filter(Boolean).join(" ");
for (const row of seoMap) {
  const publicText = publicMetadataText(row);
  assert.ok([...row.title].length <= 75, `Title exceeds 75 characters: ${row.canonical_path}`);
  assert.ok([...row.description].length <= 160, `Description exceeds 160 characters: ${row.canonical_path}`);
  assert.ok(!/Bao Bao|Polar Polar/iu.test(publicText), `Repeated public entity name remains: ${row.canonical_path}`);
  assert.ok(!/\bBmw\b|X3 pro|X6 pro|Uni-K/u.test(publicText), `Wrong public model/brand case remains: ${row.canonical_path}`);
  assert.ok(!/[\p{L}\p{N}]\(/u.test(publicText), `Missing space before explanatory parenthesis: ${row.canonical_path}`);
  assert.ok(!/\bв наличии\b|гарантируем наличие|(?:заказ|заявка) успешно (?:оформлен[а]?|отправлен[а]?)/iu.test(publicText), `False availability/success wording remains: ${row.canonical_path}`);
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
  assert.ok(!html.includes('"image":'), `Unapproved image leaked into Product schema: ${product.canonical_path}`);
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
assert.ok(formScript.includes('mode: "no-cors"'), "Current Google Apps Script transport no longer uses its required no-cors mode");
assert.ok(formScript.includes('response.type === "opaque"'), "Opaque no-cors responses are not handled separately");
const opaqueResponseBranch = formScript.match(/if \(response\.type === "opaque"\) \{([\s\S]*?)\n\s*\}/)?.[1] || "";
assert.ok(/\breturn;/.test(opaqueResponseBranch), "Opaque response can reach the success UI or request_submit_success event");
assert.ok(formScript.indexOf('KITRADE_TRACK?.("request_submit_success",') > formScript.indexOf("if (!response.ok)"), "Success is tracked before a confirmed server response");
assert.ok(formScript.indexOf("successView.hidden = false") > formScript.indexOf("if (!response.ok)"), "Error response can reach the success UI");
for (const field of ["metrika_client_id", "yclid", "first_landing_url", "order_id", "selected_products", "preliminary_sum"]) {
  assert.ok(formScript.includes(field), `Request payload architecture is missing ${field}`);
}
const analyticsScript = fs.readFileSync(path.join(outputDir, "analytics.js"), "utf8");
assert.ok(analyticsScript.includes("github\\.io"), "GitHub Pages preview is not excluded from analytics");
assert.ok(analyticsScript.includes("settings?.enabled"), "Runtime analytics switch is ignored");
assert.ok(analyticsScript.includes("__KITRADE_METRIKA_INITIALIZED__"), "Metrika lacks a single-initialization guard");
assert.equal((analyticsScript.match(/__KITRADE_METRIKA_INITIALIZED__\s*=\s*true/g) || []).length, 1, "Metrika initialization guard is assigned more than once");
assert.equal((analyticsScript.match(/window\.ym\(counterId, "init"/g) || []).length, 1, "Metrika is initialized more than once");
assert.ok(analyticsScript.includes("metrika/tag.js?id=${counterId}"), "Metrika tag URL does not include the configured counter ID");
assert.ok(analyticsScript.includes('"getClientID"'), "Metrika ClientID is not captured");
assert.ok(analyticsScript.includes("localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0"), "Metrika is not blocked on localhost");
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
const expectedVisiblePaths = new Set(exportRows.filter((row) => row.entity_type === "product" && row.status === "active" && row.indexable).map((row) => row.canonical_path));
const noindexProductPaths = new Set(exportRows.filter((row) => row.entity_type === "product" && !row.indexable).map((row) => row.canonical_path));
assert.deepEqual(crawlableProductPaths, expectedVisiblePaths, "Catalog pagination does not contain a crawlable link to every visible indexable product");
assert.equal([...crawlableProductPaths].filter((route) => noindexProductPaths.has(route)).length, 0, "Catalog pagination links to a noindex product");
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
assert.ok(runtimeConfig.includes('"counterId":111376296'), "Runtime has the wrong Metrika counter");
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
const primary1101 = exportRows.find((row) => row.entity_type === "product" && Number(row.id) === 1101);
const duplicate1173 = exportRows.find((row) => row.entity_type === "product" && Number(row.id) === 1173);
assert.ok(primary1101?.indexable && primary1101.canonical_target_path === primary1101.canonical_path, "Primary product 1101 is not indexable and self-canonical");
assert.ok(duplicate1173 && !duplicate1173.indexable && duplicate1173.robots === "noindex,follow", "Confirmed duplicate 1173 is not noindex,follow");
assert.equal(Number(duplicate1173.duplicate_of), 1101, "Confirmed duplicate 1173 does not point to product 1101");
assert.equal(duplicate1173.canonical_target_path, primary1101.canonical_path, "Confirmed duplicate 1173 has the wrong canonical target");
assert.ok(sitemap.includes(`<loc>${primary1101.canonical_url}</loc>`) && !sitemap.includes(`<loc>${duplicate1173.canonical_url}</loc>`), "Sitemap does not preserve 1101 and exclude 1173");
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
const normalizedQuery = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
const vinQuery = normalizedQuery("подбор запчастей по VIN");
assert.deepEqual(seoMap.filter((row) => normalizedQuery(row.primary_query) === vinQuery || (row.secondary_queries || []).some((query) => normalizedQuery(query) === vinQuery)).map((row) => row.canonical_path), ["/podbor-zapchastey-po-vin/"], "VIN query belongs to more than the VIN page");
const primaryOwners = new Map(seoMap.map((row) => [normalizedQuery(row.primary_query), row.canonical_path]));
const crossPagePrimarySecondary = seoMap.flatMap((row) => (row.secondary_queries || []).map((query) => ({ owner: primaryOwners.get(normalizedQuery(query)), secondary: row.canonical_path, query }))).filter((row) => row.owner && row.owner !== row.secondary);
assert.deepEqual(crossPagePrimarySecondary, [], "A page primary query is reused as another page secondary query");
const nonCategoryResults = wordstatAudit.non_category_results || [];
const derivedWordstatPriorities = deriveWordstatPriorities(wordstatAudit);
const observedPrimaryByPath = new Map(nonCategoryResults
  .filter((row) => row.priority_selected === true)
  .map((row) => [row.canonical_path, row.original_hypothesis]));
const wordstatReproductionRows = seoMap.map((row) => ({
  ...row,
  primary_query: observedPrimaryByPath.get(row.canonical_path) || row.primary_query,
}));
const reproducibleHypotheses = buildNonCategoryHypotheses(wordstatReproductionRows, derivedWordstatPriorities);
assert.equal(nonCategoryResults.length, 1728, "Non-category Wordstat audit must contain all 1,728 observations");
assert.deepEqual(nonCategoryResults.map((row) => [row.canonical_path, row.original_hypothesis]), reproducibleHypotheses.map((row) => [row.canonical_path, row.original_hypothesis]), "Non-category Wordstat hypotheses are not reproducible from the SEO map");
assert.equal(nonCategoryWordstatReport.count, 1728, "Non-category Wordstat report is incomplete");
assert.equal(new Set(nonCategoryResults.map((row) => row.canonical_path)).size, 136, "Non-category Wordstat page coverage changed");
assert.ok(nonCategoryResults.every((row) => row.region === "Россия" && row.region_id === 225 && row.operator_mode === "phrase_match_quotes" && row.phrase_match_set === phraseMatchSet(row.original_hypothesis) && row.result_source), "Non-category Wordstat observation is incomplete or not Russia/225");
assert.equal(nonCategoryResults.filter((row) => row.priority_selected).length, 136, "Every non-category page must have exactly one selected priority observation");
assert.ok(derivedWordstatPriorities.catalog && Object.keys(derivedWordstatPriorities.brands).length === 10 && Object.keys(derivedWordstatPriorities.models).length === 42, "A non-category Wordstat priority has no source observation");
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
const computedCategoryWordstat = {
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
for (const [field, value] of Object.entries(computedCategoryWordstat)) {
  assert.equal(categoryWordstatReport.summary[field], value, `Category Wordstat report summary differs: ${field}`);
}
const computedWordstat = computeWordstatSummary(wordstatAudit);
assert.deepEqual(Object.fromEntries(Object.keys(computedWordstat).map((field) => [field, wordstatSummary[field]])), computedWordstat, "Wordstat summary is not calculated from source rows");
assert.deepEqual(Object.fromEntries(Object.keys(computedWordstat).map((field) => [field, validationSummary.wordstat[field]])), computedWordstat, "Validation Wordstat summary differs from source rows");
assert.deepEqual(nonCategoryWordstatReport.summary, computedWordstat, "Non-category Wordstat report summary differs from source rows");
assert.equal(wordstatSummary.primary_queries_changed_in_this_run, 0, "A category primary query changed automatically");
assert.equal(wordstatSummary.applied_category_primary_queries, Object.keys(categoryPriorities).length, "Applied category priority count differs from source priorities");
assert.equal(categoryWordstatCandidates.count, categoryWordstatCandidates.candidates.length, "Wordstat candidate report count differs");
assert.equal(categoryWordstatCandidates.count, 0, "Unexpected category candidate was generated");
assert.ok(wordstatAudit.methodology?.phrase_frequency_definition?.includes("фиксируется количество слов, но не их порядок"), "Phrase-frequency methodology is missing");
assert.ok(wordstatAudit.methodology?.snapshot_notice?.includes("скользящего расчётного периода"), "Wordstat snapshot notice is missing");
for (const [canonicalPath, phraseQuery, expectedFrequency] of [
  ["/catalog/geely/coolray/kuzov/", '"Кузовные запчасти Geely Coolray"', 5],
  ["/catalog/hiphi/z/kuzov/", '"Кузовные запчасти HiPhi Z"', 1],
  ["/catalog/wey/07/kuzov/", '"запчасти Wey 07 кузов"', 13],
]) {
  const result = categoryResults.find((row) => row.canonical_path === canonicalPath)?.checked_queries.find((query) => query.phrase_query === phraseQuery);
  assert.equal(result?.phrase_frequency, expectedFrequency, `Confirmed Russia Wordstat value changed: ${phraseQuery}`);
  assert.equal(result?.region, "Россия", `Confirmed Wordstat region changed: ${phraseQuery}`);
  assert.equal(result?.region_id, 225, `Confirmed Wordstat region ID changed: ${phraseQuery}`);
}
const weyCategorySeo = seoMap.find((entry) => entry.canonical_path === "/catalog/wey/07/kuzov/");
assert.equal(weyCategorySeo?.primary_query, "запчасти Wey 07 кузов", "Confirmed Wey 07 category primary query changed");
assert.equal(weyCategorySeo?.h1, "Кузовные запчасти для Wey 07", "Confirmed Wey 07 category H1 changed");
assert.equal(wordstatSummary.applied_catalog_changes, computedWordstat.applied_catalog_changes, "Catalog Wordstat priority count is not row-derived");
assert.equal(wordstatSummary.applied_brand_changes, computedWordstat.applied_brand_changes, "Brand Wordstat priority count is not row-derived");
assert.equal(wordstatSummary.applied_model_changes, computedWordstat.applied_model_changes, "Model Wordstat priority count is not row-derived");
assert.equal(ownerConfirmation.length, 0, "Confirmed, neutralized or removed claims remain in the pending owner report");
assert.deepEqual(validationSummary.pending_business_confirmation, [], "Confirmed business details remain pending");
const sourceImageUrls = [...new Set(sourceItems.flatMap((item) => item.photos || []).map((url) => String(url || "").trim()).filter(Boolean))];
const productsWithoutImages = sourceItems.filter((item) => !(item.photos || []).filter(Boolean).length).length;
assert.equal(imageReport.length, sourceImageUrls.length, "Image report does not match the actual unique source-link count");
assert.equal(imageReviewUrls.size, sourceImageUrls.length, "Image report contains duplicate or missing source links");
assert.ok(sourceImageUrls.every((url) => imageReviewUrls.has(url)), "A source image link is missing from the report");
assert.equal(imageSummary.unique_source_links, sourceImageUrls.length, "Image summary link count differs from source data");
assert.equal(imageSummary.products_without_images, productsWithoutImages, "Products without images are counted incorrectly");
assert.equal(imageSummary.avito_links, sourceImageUrls.filter((url) => /avito/i.test(url)).length, "Avito image count differs from source data");
assert.equal(imageSummary.yandex_disk_auth_pages, sourceImageUrls.filter((url) => /disk\.yandex\.ru\/i\//i.test(url)).length, "Yandex Disk page count differs from source data");
assert.ok(imageReport.every((row) => row.product_id && row.source_id && row.canonical_path && row.image_index >= 1
  && row.raw_url && row.normalized_url && row.source && row.observed_at
  && Object.hasOwn(row, "http_status") && Object.hasOwn(row, "content_type")
  && Object.hasOwn(row, "width") && Object.hasOwn(row, "height")), "Image report lacks auditable per-link fields");
assert.ok(imageReport.filter((row) => row.source === "avito").every((row) => row.rights_status === "confirmed_by_owner" && row.rights_source === "company_avito_account"), "Avito rights confirmation is incomplete");
assert.ok(imageReport.filter((row) => row.source === "yandex_disk_auth_page").every((row) => row.rights_status !== "confirmed_by_owner" && row.content_type !== "image/jpeg"), "Yandex Disk auth pages were treated as approved images");
assert.ok(imageReport.every((row) => !row.schema_approved), "An image was approved for Product schema before the full review");
assert.equal(validationSummary.image_rights_confirmed, imageSummary.avito_links, "Confirmed image-rights total differs from the per-link report");
assert.equal(validationSummary.image_rights_pending, imageSummary.yandex_disk_auth_pages, "Pending image-rights total differs from the per-link report");
assert.equal(validationSummary.image_quality_review_pending, imageReport.length, "Image quality review total differs from the per-link report");

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
assert.equal(allHtmlFiles.length, 2606, "Generated HTML page count changed unexpectedly");
assert.equal(allHtmlFiles.length, internalLinkingAudit.summary.html_pages_scanned, "Favicon verification does not cover every audited HTML page");
assert.ok(fs.existsSync(path.join(outputDir, "assets", "kitrade-logo.png")), "Favicon target asset is missing");
for (const page of htmlPages) {
  const faviconLinks = page.html.match(/<link\b(?=[^>]*\brel=["'][^"']*\bicon\b[^"']*["'])[^>]*>/gi) || [];
  assert.equal(faviconLinks.length, 1, `Expected exactly one favicon link: ${page.route}`);
  assert.match(faviconLinks[0], /\bhref=["']\/assets\/kitrade-logo\.png["']/i, `Invalid favicon target: ${page.route}`);
}
const productHtmlPages = htmlPages.filter((page) => /^\/catalog\/product\/.+\/$/.test(page.route));
assert.equal(productHtmlPages.length, sourceItems.length, "Not every source product has a generated HTML page");
const productByPath = new Map(registry.entities.products.map((product) => [product.canonical_path, product]));
const parseJsonLd = (html) => [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  .flatMap((match) => {
    const value = JSON.parse(match[1]);
    return Array.isArray(value) ? value : [value];
  });
for (const page of productHtmlPages) {
  const product = productByPath.get(page.route);
  assert.ok(product, `Generated product route is absent from the registry: ${page.route}`);
  const sourceItem = sourceById.get(String(product.source_id));
  const exportRow = exportRows.find((row) => row.entity_type === "product" && Number(row.id) === Number(product.product_id));
  const schemas = parseJsonLd(page.html);
  const productSchema = schemas.find((schema) => schema?.["@type"] === "Product");
  assert.equal(Boolean(productSchema), Boolean(exportRow?.indexable), `Product/Offer presence differs from indexation state: ${page.route}`);
  if (productSchema) {
    assert.ok(productSchema.offers?.["@type"] === "Offer", `Product schema lacks Offer: ${page.route}`);
    assert.equal(Number(productSchema.offers.price), Number(sourceItem?.price), `Offer price differs from source: ${page.route}`);
    assert.ok(!productSchema.image, `Unapproved image leaked into Product schema: ${page.route}`);
  }
  assert.ok(!/<img[^>]+src=["']https?:\/\/disk\.yandex\.ru\/i\//i.test(page.html), `Yandex Disk auth page leaked into img: ${page.route}`);
  const gallery = page.html.match(/<div class="product-page-gallery">([\s\S]*?)<\/div>/i)?.[1] || "";
  const galleryImage = gallery.match(/<img\b[^>]*>/i)?.[0] || "";
  if (galleryImage) {
    const alt = galleryImage.match(/\balt=["']([^"']*)["']/i)?.[1] ?? "";
    assert.ok(alt.trim(), `Product image has an empty alt: ${page.route}`);
    const publicBrand = registry.entities.brands.find((entry) => entry.id === product.brand_id)?.name || sourceItem?.brand;
    const publicModel = registry.entities.models.find((entry) => entry.id === product.model_id)?.name || sourceItem?.model;
    assert.ok((alt.match(/[\p{L}\p{N}-]+/gu) || []).length >= 2, `Product image alt lacks a natural part description: ${page.route}`);
    for (const identity of [publicBrand, publicModel].filter(Boolean)) {
      assert.ok(alt.toLocaleLowerCase("ru").includes(String(identity).toLocaleLowerCase("ru")), `Product image alt lacks ${identity}: ${page.route}`);
    }
  }
  assert.ok(page.canonical, `Product page lacks canonical: ${page.route}`);
  if (exportRow?.indexable && !isNonProductionBuild) assert.ok(!page.robots.includes("noindex"), `Indexable production product is noindex: ${page.route}`);
  else assert.ok(page.robots.includes("noindex"), `Preview or excluded product is missing noindex: ${page.route}`);
}
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
assert.equal(new Set(seoMap.map((row) => normalizedQuery(row.primary_query))).size, seoMap.length, "Indexable SEO map contains duplicate normalized primary queries");
assert.equal(needsReviewReport.length, 25, "Needs-review report must contain the computed 25 products");
assert.equal(productConflictReport.length, 17, "Product conflict report must contain the 16 condition conflicts and one foreign-vehicle description");
const conflictIds = new Set(productConflictReport.map((row) => Number(row.product_id)));
for (const productId of [1365, 1378, 1393, 1402, 1410, 1416, 1425, 1426, 1429, 1451, 1457, 1458, 1472, 1683, 2017, 2177, 2807]) {
  assert.ok(conflictIds.has(productId), `Product conflict ${productId} is missing`);
  const row = exportRows.find((entry) => entry.entity_type === "product" && Number(entry.id) === productId);
  assert.ok(!row?.indexable && row.robots === "noindex,follow" && row.canonical_target_path === row.canonical_path, `Conflict product ${productId} is not noindex with self canonical`);
}
assert.ok(productConflictReport.find((row) => row.product_id === 1457)?.description_excerpt.includes("Geely galaxy starship 7"), "Foreign-vehicle evidence for product 1457 is missing");
assert.equal(oemConflictReport.length, 10, "OEM conflict report must contain all confirmed manual-review groups");
const oemConflictIds = new Set(oemConflictReport.flatMap((group) => group.product_ids).map(Number));
for (const productId of [1095,1187,1174,1657,1222,1239,1370,2071,1884,2040,1914,2637,2010,2742,2116,2275,2739,2117,2316,2318,2329]) {
  assert.ok(oemConflictIds.has(productId), `OEM conflict product ${productId} is missing`);
  const seo = seoMap.find((row) => Number(row.product_id) === productId);
  if (seo) assert.equal(seo.article_oem, "", `Disputed OEM leaked into SEO metadata for product ${productId}`);
}
assert.equal(duplicateReport.filter((group) => group.classification === "confirmed_full_duplicate").length, 4, "Exact duplicate report must preserve the 4 confirmed source pairs");
const ownerDuplicate = duplicateReport.find((group) => group.primary_product_id === 2346 && group.duplicate_product_ids.includes(2085));
assert.ok(ownerDuplicate?.classification === "confirmed_owner_duplicate", "Owner-confirmed duplicate 2085/2346 does not use product 2346 as primary");
const monjaroDuplicate = duplicateReport.find((group) => group.primary_product_id === 1101 && group.duplicate_product_ids.includes(1173));
assert.ok(monjaroDuplicate?.classification === "confirmed_owner_duplicate" && monjaroDuplicate.action === "secondary_noindex_canonical_to_primary", "Confirmed duplicate 1101/1173 is not handled by the owner-decision mechanism");
const primary1951 = exportRows.find((row) => row.entity_type === "product" && Number(row.id) === 1951);
const duplicate2219 = exportRows.find((row) => row.entity_type === "product" && Number(row.id) === 2219);
assert.ok(primary1951?.indexable && !duplicate2219?.indexable && duplicate2219?.robots === "noindex,follow", "Duplicate 1951/2219 indexation decision is incorrect");
assert.equal(Number(duplicate2219.duplicate_of), 1951, "Duplicate 2219 does not point to owner-selected primary 1951");
assert.equal(duplicate2219.canonical_target_path, primary1951.canonical_path, "Duplicate 2219 has the wrong canonical target");
for (const [pair, requiredTerms] of [[[1005, 1165], ["рестайлинг", "I поколения"]], [[2179, 2708], ["рестайлинга", "I поколения"]]]) {
  const rows = pair.map((productId) => seoMap.find((row) => Number(row.product_id) === productId));
  assert.ok(rows.every((row) => row?.indexable && row.robots === "index,follow"), `Verified distinct pair ${pair.join("/")} is not indexable and self-canonical`);
  assert.notEqual(normalizedQuery(rows[0].primary_query), normalizedQuery(rows[1].primary_query), `Verified distinct pair ${pair.join("/")} still has the same primary query`);
  assert.ok(rows.every((row, index) => `${row.primary_query} ${row.title} ${row.h1}`.includes(requiredTerms[index])), `Verified distinguishing metadata is missing for ${pair.join("/")}`);
}
for (const pair of [[2217, 2593]]) {
  const group = duplicateReport.find((entry) => entry.classification === "distinct_products_pending_metadata"
    && [entry.primary_product_id, ...entry.duplicate_product_ids].sort((a, b) => a - b).join("|") === pair.join("|"));
  assert.ok(group && group.action === "owner_kept_separate_index_self_canonical", `Distinct pair ${pair.join("/")} does not preserve the owner's keep-separate decision`);
  assert.ok(group.secondary_pages.every((page) => page.robots === "index,follow" && page.canonical_path_target === page.canonical_path), `Distinct pair ${pair.join("/")} does not keep indexable self-canonical pages`);
  assert.ok(pair.every((productId) => seoMap.some((row) => Number(row.product_id) === productId && row.indexable)), `Distinct pair ${pair.join("/")} is missing from the indexable SEO map`);
}
const confirmedOwnerGroups = [[1101,1173],[1149,1242],[1153,1330],[1670,1665],[1790,1831],[1870,2165],[1883,2829],[1951,2219],[2346,2085],[2263,2659],[2498,2591],[2503,2552],[2837,2504],[2844,2888]];
for (const [primaryProductId, ...secondaryProductIds] of confirmedOwnerGroups) {
  const decision = duplicateReport.find((group) => group.classification === "confirmed_owner_duplicate"
    && Number(group.primary_product_id) === primaryProductId
    && [...group.duplicate_product_ids].sort((a, b) => a - b).join("|") === secondaryProductIds.sort((a, b) => a - b).join("|"));
  assert.ok(decision?.action === "secondary_noindex_canonical_to_primary", `Confirmed duplicate group ${[primaryProductId, ...secondaryProductIds].join("/")} is missing or has the wrong primary`);
}
const confirmedSecondaryIds = new Set(duplicateReport.filter((group) => group.action === "secondary_noindex_canonical_to_primary").flatMap((group) => group.duplicate_product_ids));
assert.equal(confirmedSecondaryIds.size, 25, "Confirmed duplicate-secondary count must be derived as 25");
for (const group of duplicateReport.filter((entry) => entry.action === "secondary_noindex_canonical_to_primary")) {
  assert.ok(group.secondary_pages.every((row) => Number(group.primary.price) >= Number(row.price)), `Duplicate primary ${group.primary_product_id} does not have the maximum price`);
}
assert.equal(exportRows.filter((row) => row.entity_type === "product" && row.indexable).length, 1891, "Indexable product-page count must be derived as 1891");
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
  const cardIds = [...html.matchAll(/<article class="part-card" data-id="([^"]+)"/g)].map((match) => match[1]);
  const cardCount = cardIds.length;
  assert.ok(cardCount <= 24, `Pagination page contains more than 24 cards: ${route}`);
  assert.equal(new Set(cardIds).size, cardCount, `Pagination page contains duplicate cards: ${route}`);
  const loadMoreTag = html.match(/<a\b[^>]*\bid=["']loadMore["'][^>]*>/i)?.[0] || "";
  assert.ok(loadMoreTag, `Pagination page has no load-more element: ${route}`);
  const terminalPage = /\bhidden\b/i.test(loadMoreTag);
  if (terminalPage) {
    assert.ok(!/\bhref=["'][^"']+["']/i.test(loadMoreTag), `Hidden terminal load-more has href: ${route}`);
    assert.match(loadMoreTag, /\bstyle=["'][^"']*display\s*:\s*none/i, `Terminal load-more is not visually hidden: ${route}`);
  } else {
    assert.equal(cardCount, 24, `Non-terminal pagination page must contain exactly 24 cards: ${route}`);
    assert.ok(/\bhref=["'][^"']+["']/i.test(loadMoreTag), `Non-terminal load-more has no next href: ${route}`);
  }
  const canonical = extract(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i);
  assert.equal(canonical, new URL(route, `${config.siteUrl}/`).href, `Pagination canonical is not self-referencing: ${route}`);
  if (/\/page\/\d+\/$/.test(route)) assert.ok(sitemapUrlSet.has(canonical), `Pagination page is missing from sitemap: ${route}`);
  const description = extract(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i);
  assert.ok(!/VIN Страница|отдельно Страница|\.\.|  /u.test(description), `Broken pagination description punctuation: ${route}`);
  if (/\/page\/\d+\/$/.test(route)) assert.ok(/[.!?] Страница \d+\.$/u.test(description), `Pagination description has no sentence boundary: ${route}`);
  if (/\/page\/\d+\/$/.test(route)) {
    const schemaSource = extract(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
    const schemas = JSON.parse(schemaSource);
    const breadcrumbSchema = (Array.isArray(schemas) ? schemas : [schemas]).find((schema) => schema?.["@type"] === "BreadcrumbList");
    assert.ok(breadcrumbSchema, `Pagination page has no BreadcrumbList: ${route}`);
    assert.ok(!breadcrumbSchema.itemListElement.some((item) => /^Страница \d+$/u.test(item?.name || "")), `Pagination BreadcrumbList contains an invisible page-number item: ${route}`);
  }
}

const catalogAppSource = fs.readFileSync(path.join(outputDir, "catalog-app.js"), "utf8");
assert.ok(catalogAppSource.includes("const PAGE_SIZE = 24"), "Client pagination does not use the shared 24-card size");
assert.ok(!/visible\s*(?::|=|\+=)\s*12\b/.test(catalogAppSource), "Legacy 12-card client pagination remains");
assert.ok(catalogAppSource.includes('loadMore.removeAttribute("href")'), "Client pagination does not remove href when continuation is unavailable");
const rootPageFiles = [1, 2, 3].map((pageNumber) => pageNumber === 1
  ? path.join(outputDir, "catalog", "index.html")
  : path.join(outputDir, "catalog", "page", String(pageNumber), "index.html"));
const rootPageIds = rootPageFiles.map((file) => [...fs.readFileSync(file, "utf8").matchAll(/<article class="part-card" data-id="([^"]+)"/g)].map((match) => match[1]));
assert.deepEqual(rootPageIds.map((ids) => ids.length), [24, 24, 24], "Catalog pages 1–3 must each contain exactly 24 cards");
assert.equal(new Set(rootPageIds.flat()).size, 72, "Catalog pages 1–3 contain a gap or duplicate product");
assert.ok(fs.readFileSync(rootPageFiles[0], "utf8").includes('id="loadMore" href="/catalog/page/2/"'), "First catalog page does not link to page 2");

const searchTargetMap = JSON.parse(fs.readFileSync(path.join(outputDir, "search-target-map.json"), "utf8"));
assert.equal(searchTargetMap.groups.length, 107, "Search target map must preserve all 107 source groups");
assert.equal(searchTargetMap.matched_groups, 107, "Not all 107 Direct groups have a matched canonical target");
assert.equal(searchTargetMap.missing_groups, 0, "Direct target map still contains missing groups");
assert.deepEqual(searchTargetMap.source_groups, { total: 107, wide: 1, brands: 25, models: 81 }, "Search target source totals changed");
assert.ok(searchTargetMap.groups.every((group) => group.source_row && group.match_status && Object.hasOwn(group, "missing_reason")), "Search target group lost source traceability");
assert.equal(new Set(searchTargetMap.groups.map((group) => group.source_row)).size, 107, "Source landing rows are duplicated or missing");
assert.ok(Array.isArray(searchTargetMap.groups) && searchTargetMap.groups.length > 0, "Search target map is empty");
for (const group of searchTargetMap.groups) {
  assert.ok(group.search_group && group.queries?.length && group.canonical_path && group.canonical_url, "Search target group is incomplete");
  assert.ok(sitemapUrlSet.has(group.canonical_url), `Direct target is not indexable: ${group.search_group}`);
  assert.ok(fs.existsSync(path.join(outputDir, ...group.canonical_path.replace(/^\/+|\/+$/g, "").split("/"), "index.html")), `Direct target does not exist: ${group.search_group}`);
}
assert.ok(!/(?:onrender\.com|github\.io|netlify\.app|pages\.dev|vercel\.app)/i.test(JSON.stringify(searchTargetMap)), "Preview URL leaked into the Direct target map");
assert.ok(!directTargetGaps.some((gap) => /fang\s*cheng\s*bao|fangchengbao|bao\s*5/i.test(JSON.stringify(gap))), "Mapped Bao 5 group remains in direct-target-gaps.json");
assert.ok(directTargetGaps.every((gap) => !searchTargetMap.groups.some((group) => (
  group.match_status === "matched"
  && group.source_group_type === gap.group_type
  && group.canonical_path === gap.canonical_path
))), "A Direct group with a confirmed canonical page was placed in the target-gap report");
assert.ok(!/(?:onrender\.com|github\.io|netlify\.app|pages\.dev|vercel\.app)/i.test(JSON.stringify(directTargetGaps)), "Preview URL leaked into the Direct target-gap report");
assert.equal(formSubmissionAudit.current_state?.endpoint, "Google Apps Script", "Form audit lost the current endpoint type");
assert.equal(formSubmissionAudit.current_state?.request_mode, "no-cors", "Form audit lost the current no-cors mode");
assert.equal(formSubmissionAudit.current_state?.response_visibility, "opaque", "Form audit does not describe the opaque response");
assert.equal(formSubmissionAudit.current_state?.request_submit_success_sent, false, "Form audit falsely claims current confirmed success tracking");
assert.ok(formSubmissionAudit.required_server_change?.cors_enabled
  && formSubmissionAudit.required_server_change?.response_format === "JSON"
  && /2xx/i.test(formSubmissionAudit.required_server_change?.success_status || ""), "Form audit lacks the required server-side CORS/JSON/2xx change");
assert.ok(formSubmissionAudit.required_client_change?.remove_no_cors
  && formSubmissionAudit.required_client_change?.request_mode === "cors"
  && formSubmissionAudit.required_client_change?.read_response_json
  && formSubmissionAudit.required_client_change?.validate_server_confirmation, "Form audit lacks the required client-side CORS and JSON-confirmation change");
assert.equal(formSubmissionAudit.confirmed_success_gate?.opaque_or_error_must_not_succeed, true, "Form audit permits false success for an opaque or error response");
assert.deepEqual(formSubmissionAudit.analytics?.offline_events, config.analytics?.offlineEvents || [], "Offline analytics goals changed in the form audit");
assert.deepEqual(formSubmissionAudit.analytics?.online_events, config.analytics?.events || [], "Browser analytics goals changed in the form audit");

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
assert.ok(redirects.includes("/catalog/fang-cheng-bao/bao-5/ /catalog/fang-cheng-bao/bao-5-leopard-5/ 301!"));
const bao5Target = searchTargetMap.groups.find((group) => Number(group.source_row) === 60);
assert.ok(bao5Target?.match_status === "matched" && bao5Target.canonical_path === "/catalog/fang-cheng-bao/bao-5-leopard-5/", "Direct group 60 does not resolve to the existing Bao 5 model page");
assert.ok(bao5Target.legacy_urls.some((url) => new URL(url).pathname === "/catalog/fang-cheng-bao/bao-5/")
  && bao5Target.legacy_urls.some((url) => new URL(url).pathname === "/catalog/fangchengbao/bao-5/"), "Bao 5 legacy URLs are incomplete");
assert.ok(redirects.includes("/* /404.html 404"));

console.log(`Verified ${registry.entities.products.length} permanent product pages and ${exportRows.length} exported URL records.`);
