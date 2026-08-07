import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePhoto, readCatalogData } from "./lib/data.mjs";
import { isVisibleCatalogItem } from "./lib/domain.mjs";
import { createEmptyRegistry, registryIndexes, syncRegistry, validateRegistry } from "./lib/registry.mjs";
import { buildSeoState, toCsv } from "./lib/seo.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const registryPath = path.join(projectDir, "catalog-url-map.json");
const publicDir = path.join(projectDir, "public");
const config = JSON.parse(fs.readFileSync(path.join(projectDir, "site.config.json"), "utf8"));
const rules = JSON.parse(fs.readFileSync(path.join(projectDir, "seo", "seo-rules.json"), "utf8"));
const overrides = JSON.parse(fs.readFileSync(path.join(projectDir, "seo", "seo-overrides.json"), "utf8"));
const items = readCatalogData(path.join(projectDir, "kitrade-parts-data.js"));
const previous = fs.existsSync(registryPath)
  ? JSON.parse(fs.readFileSync(registryPath, "utf8"))
  : createEmptyRegistry();
const registry = syncRegistry(previous, items, overrides);
validateRegistry(registry);
const indexes = registryIndexes(registry);
const directSemanticsPath = path.join(projectDir, "seo", "direct-semantics.json");
const directSemantics = fs.existsSync(directSemanticsPath) ? JSON.parse(fs.readFileSync(directSemanticsPath, "utf8")) : {};
const wordstatAuditPath = path.join(projectDir, "seo", "wordstat-audit.json");
const wordstatAudit = fs.existsSync(wordstatAuditPath) ? JSON.parse(fs.readFileSync(wordstatAuditPath, "utf8")) : {};
const sourceLandingMapPath = path.join(projectDir, "seo", "source-landing-page-map.csv");
const sourceLandingMapLabel = "yandex_direct_prelaunch_2026-07-21/landing_page_map.csv";
const seoState = buildSeoState({ registry, items, indexes, config, rules, overrides, directSemantics, wordstatAudit });

function canonicalUrl(canonicalPath) {
  return new URL(canonicalPath, `${config.siteUrl}/`).href;
}

function brandPath(brand) {
  return `/catalog/${brand.slug}/`;
}

function modelPath(brand, model) {
  return `${brandPath(brand)}${model.slug}/`;
}

function categoryPath(brand, model, category) {
  return `${modelPath(brand, model)}${category.slug}/`;
}

const exportRows = [];
for (const seo of seoState.seoRows.filter((row) => row.page_type === "service")) {
  exportRows.push({
    entity_type: "service", id: seo.entity_id, name: seo.h1, brand: null,
    model: null, category: null, slug: seo.canonical_path.replace(/^\/+|\/+$/g, ""), canonical_path: seo.canonical_path,
    canonical_url: seo.canonical_url, status: "active", entity_id: seo.entity_id,
    indexable: Boolean(seo.indexable), robots: seo.robots,
  });
}
for (const brand of registry.entities.brands) {
  const canonical_path = brandPath(brand);
  const seo = seoState.seoByPath.get(canonical_path);
  exportRows.push({
    entity_type: "brand", id: brand.id, name: brand.name, brand: brand.name,
    model: null, category: null, slug: brand.slug, canonical_path,
    canonical_url: canonicalUrl(canonical_path), status: brand.status,
    entity_id: brand.id, indexable: Boolean(seo?.indexable), robots: seo?.robots || "noindex,follow",
  });
}
for (const model of registry.entities.models) {
  const brand = indexes.brands.get(model.parent_id);
  if (!brand) continue;
  const canonical_path = modelPath(brand, model);
  const seo = seoState.seoByPath.get(canonical_path);
  exportRows.push({
    entity_type: "model", id: model.id, name: model.name, brand: brand.name,
    model: model.name, category: null, slug: model.slug, canonical_path,
    canonical_url: canonicalUrl(canonical_path), status: model.status,
    entity_id: model.id, indexable: Boolean(seo?.indexable), robots: seo?.robots || "noindex,follow",
  });
}

const categoryRouteKeys = new Set();
for (const product of registry.entities.products) {
  const brand = indexes.brands.get(product.brand_id);
  const model = indexes.models.get(product.model_id);
  const category = indexes.categories.get(product.category_id);
  if (brand && model && category) {
    const routeKey = `${brand.id}|${model.id}|${category.id}`;
    if (!categoryRouteKeys.has(routeKey)) {
      categoryRouteKeys.add(routeKey);
      const canonical_path = categoryPath(brand, model, category);
      const seo = seoState.seoByPath.get(canonical_path);
      exportRows.push({
        entity_type: "category", id: category.id, name: category.name, brand: brand.name,
        model: model.name, category: category.name, slug: category.slug, canonical_path,
        canonical_url: canonicalUrl(canonical_path), status: seo?.indexable ? "active" : "unlisted",
        entity_id: `${brand.id}:${model.id}:${category.id}`, indexable: Boolean(seo?.indexable), robots: seo?.robots || "noindex,follow",
      });
    }
  }

  const state = seoState.productState.get(product.product_id);
  exportRows.push({
    entity_type: "product", id: product.product_id, name: product.name,
    brand: brand?.name || null, model: model?.name || null,
    category: category?.name || product.public_category || null,
    slug: product.slug, canonical_path: product.canonical_path,
    canonical_url: canonicalUrl(product.canonical_path), status: product.status,
    entity_id: String(product.product_id), indexable: Boolean(state?.indexable), robots: state?.robots || "noindex,follow",
    validation_errors: state?.validationErrors || [], duplicate_of: state?.duplicateOf || null,
    canonical_target_path: state?.canonicalPath || product.canonical_path,
  });
}

const browserProducts = {};
const browserRoutes = { brands: {}, models: {}, categories: {} };
const routeKey = (...values) => values.map((value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru")).join("|");

for (const brand of registry.entities.brands) {
  const route = brandPath(brand);
  for (const name of new Set([brand.name, ...(brand.source_names || [])])) {
    browserRoutes.brands[routeKey(name)] = route;
  }
}
for (const model of registry.entities.models) {
  const brand = indexes.brands.get(model.parent_id);
  if (!brand) continue;
  const route = modelPath(brand, model);
  for (const brandName of new Set([brand.name, ...(brand.source_names || [])])) {
    for (const modelName of new Set([model.name, ...(model.source_names || [])])) {
      browserRoutes.models[routeKey(brandName, modelName)] = route;
    }
  }
}
for (const product of registry.entities.products) {
  const brand = indexes.brands.get(product.brand_id);
  const model = indexes.models.get(product.model_id);
  const category = indexes.categories.get(product.category_id);
  if (!brand || !model || !category) continue;
  browserRoutes.categories[routeKey(brand.name, model.name, category.name)] = categoryPath(brand, model, category);
}

for (const product of registry.entities.products) {
  const brand = indexes.brands.get(product.brand_id);
  const model = indexes.models.get(product.model_id);
  const category = indexes.categories.get(product.category_id);
  const content = seoState.productState.get(product.product_id)?.content || {};
  browserProducts[String(product.source_id)] = {
    product_id: product.product_id,
    slug: product.slug,
    canonical_path: product.canonical_path,
    public_category: category?.name || product.public_category || null,
    brand_slug: brand?.slug || null,
    model_slug: model?.slug || null,
    category_slug: category?.slug || null,
    status: product.status,
    indexable: Boolean(seoState.productState.get(product.product_id)?.indexable),
    title: content.h1 || product.name,
    article: content.article || "",
    condition: content.condition || "",
    origin: content.origin || "",
    description: content.description || "",
    card_description: content.cardDescription || "",
    quick_description: content.quickDescription || "",
    meta: content.meta || "",
    price_label: content.priceLabel || "Цена по запросу",
  };
  for (const alias of product.source_aliases || []) browserProducts[String(alias)] = browserProducts[String(product.source_id)];
}

fs.mkdirSync(publicDir, { recursive: true });
const reportsDir = path.join(projectDir, "reports", "seo");
fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
fs.writeFileSync(path.join(publicDir, "catalog-urls.json"), `${JSON.stringify(exportRows, null, 2)}\n`);
const promotedSeoRows = seoState.seoRows.filter((row) => row.indexable);
fs.writeFileSync(path.join(publicDir, "seo-map.json"), `${JSON.stringify(promotedSeoRows, null, 2)}\n`);
fs.writeFileSync(path.join(publicDir, "seo-map.csv"), toCsv(promotedSeoRows));
fs.writeFileSync(path.join(reportsDir, "needs-review.json"), `${JSON.stringify(seoState.needsReview, null, 2)}\n`);
fs.writeFileSync(path.join(reportsDir, "needs-review.csv"), toCsv(seoState.needsReview));
fs.writeFileSync(path.join(reportsDir, "duplicates.json"), `${JSON.stringify(seoState.duplicateReport, null, 2)}\n`);
fs.writeFileSync(path.join(reportsDir, "duplicates.csv"), toCsv(seoState.duplicateReport));
fs.writeFileSync(path.join(reportsDir, "images-review.json"), `${JSON.stringify(seoState.imageReport, null, 2)}\n`);
fs.writeFileSync(path.join(reportsDir, "images-review.csv"), toCsv(seoState.imageReport));
fs.writeFileSync(path.join(reportsDir, "identity-probable-matches.json"), `${JSON.stringify(seoState.probableMatches, null, 2)}\n`);
fs.writeFileSync(path.join(reportsDir, "search-variants-draft.json"), `${JSON.stringify(seoState.variants, null, 2)}\n`);
const normalizationRows = registry.entities.products.map((product) => {
  const item = items.find((entry) => String(entry.id) === String(product.source_id)) || product.source_snapshot || {};
  const content = seoState.productState.get(product.product_id)?.content || {};
  const rawTitle = String(item.title || "").trim();
  const rawArticle = String(item.article || "").trim();
  const unbalancedBefore = (rawTitle.match(/\(/g) || []).length !== (rawTitle.match(/\)/g) || []).length;
  return {
    product_id: product.product_id, source_id: product.source_id, canonical_path: product.canonical_path,
    raw_title: rawTitle, public_h1: content.h1 || "", raw_article: rawArticle, public_oem: content.article || "",
    repaired_parentheses: unbalancedBefore,
    corrected_name_or_case: rawTitle !== (content.h1 || ""),
    suppressed_invalid_article: Boolean(rawArticle && !content.article),
  };
});
fs.writeFileSync(path.join(reportsDir, "catalog-content-normalization.json"), `${JSON.stringify({
  products: normalizationRows.length,
  repaired_parentheses: normalizationRows.filter((row) => row.repaired_parentheses).length,
  corrected_name_or_case: normalizationRows.filter((row) => row.corrected_name_or_case).length,
  suppressed_invalid_articles: normalizationRows.filter((row) => row.suppressed_invalid_article).length,
  rows: normalizationRows.filter((row) => row.repaired_parentheses || row.suppressed_invalid_article || row.corrected_name_or_case),
}, null, 2)}\n`);

const directModelAliases = {
  "polar stone (jishi)|01": "polar stone/jishi|01",
  "changan|auchan z6": "changan|oshan z6",
  "exeed|exlantix es": "exlantix|es",
  "fang cheng bao|bao 5 (leopard 5)": "fangchengbao|bao 5",
  "fang cheng bao|titanium 7": "fangchengbao|titanium 7",
};
const directCoverage = {
  sources: directSemantics.generated_from || [],
  brands: registry.entities.brands.map((brand) => ({
    entity_id: brand.id, name: brand.name, canonical_path: brandPath(brand),
    direct_material_match: Boolean(directSemantics.brands?.[String(brand.name).toLocaleLowerCase("ru").replaceAll("ё", "е")]),
    primary_query: seoState.seoByPath.get(brandPath(brand))?.primary_query || "",
    secondary_queries: seoState.seoByPath.get(brandPath(brand))?.secondary_queries || [],
  })),
  models: registry.entities.models.map((model) => {
    const brand = indexes.brands.get(model.parent_id);
    const key = `${String(brand?.name || "").toLocaleLowerCase("ru").replaceAll("ё", "е")}|${String(model.name).toLocaleLowerCase("ru").replaceAll("ё", "е")}`;
    const route = brand ? modelPath(brand, model) : "";
    const seo = seoState.seoByPath.get(route);
    const directKey = directSemantics.models?.[key] ? key : directModelAliases[key];
    return { entity_id: model.id, brand: brand?.name || "", model: model.name, canonical_path: route,
      direct_material_match: Boolean(directKey && directSemantics.models?.[directKey]), primary_query: seo?.primary_query || "",
      secondary_queries: seo?.secondary_queries || [], model_variants: seo?.model_variants || [] };
  }),
};
directCoverage.summary = {
  brands_total: directCoverage.brands.length,
  brands_from_direct: directCoverage.brands.filter((row) => row.direct_material_match).length,
  models_total: directCoverage.models.length,
  models_from_direct: directCoverage.models.filter((row) => row.direct_material_match).length,
  pages_with_2_to_6_secondary_queries: [...directCoverage.brands, ...directCoverage.models].filter((row) => row.secondary_queries.length >= 2 && row.secondary_queries.length <= 6).length,
};
fs.writeFileSync(path.join(reportsDir, "direct-semantics-coverage.json"), `${JSON.stringify(directCoverage, null, 2)}\n`);

const priorityModelNames = new Set([
  "voyah|free", "geely|monjaro", "geely|coolray", "haval|f7", "haval|jolion",
  "chery|tiggo 7 pro max", "changan|cs75 plus", "haval|h3", "tank|500",
  "omoda|c5", "changan|uni-k", "zeekr|9x",
]);
const legacyUrlsFor = (canonicalPath) => Object.entries(overrides.redirects || {})
  .filter(([, destination]) => destination === canonicalPath)
  .map(([legacyPath]) => canonicalUrl(legacyPath));
if (!fs.existsSync(sourceLandingMapPath)) throw new Error(`Missing source landing map: ${sourceLandingMapPath}`);
const sourceLandingLines = fs.readFileSync(sourceLandingMapPath, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
const sourceLandingHeaders = sourceLandingLines.shift().split(";");
const sourceLandingRows = sourceLandingLines.map((line, sourceIndex) => {
  const values = line.split(";");
  return Object.fromEntries([...sourceLandingHeaders.map((header, index) => [header, values[index] || ""]), ["source_row", sourceIndex + 2]]);
});
const semanticKey = (value) => String(value || "").trim().toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const brandAliases = new Map();
for (const brand of registry.entities.brands) {
  for (const name of new Set([brand.name, ...(brand.source_names || [])])) brandAliases.set(semanticKey(name), brand);
}
brandAliases.set("fangchengbao", brandAliases.get("fang cheng bao"));
brandAliases.set("polar stone jishi", brandAliases.get("polar stone jishi") || brandAliases.get("polar stone"));
const modelAliases = new Map();
for (const model of registry.entities.models) {
  const brand = indexes.brands.get(model.parent_id);
  if (!brand) continue;
  for (const brandName of new Set([brand.name, ...(brand.source_names || [])])) {
    for (const modelName of new Set([model.name, ...(model.source_names || [])])) {
      modelAliases.set(`${semanticKey(brandName)}|${semanticKey(modelName)}`, { brand, model });
    }
  }
}
const resolveSourceTarget = (source) => {
  if (source.group_type === "WIDE") return { canonicalPath: "/catalog/", seo: seoState.seoByPath.get("/catalog/") };
  const suggested = source.suggested_path || "";
  const redirected = overrides.redirects?.[suggested] || suggested;
  if (seoState.seoByPath.has(redirected)) return { canonicalPath: redirected, seo: seoState.seoByPath.get(redirected) };
  const brand = brandAliases.get(semanticKey(source.brand));
  if (source.group_type === "BRAND" && brand) {
    const canonicalPath = brandPath(brand);
    return { canonicalPath, seo: seoState.seoByPath.get(canonicalPath) };
  }
  const manualModelAliases = {
    "fangchengbao|bao 5": "fang cheng bao|bao 5 leopard 5",
    "polar stone jishi|01": "polar stone jishi|01",
    "changan|oshan z6": "changan|auchan z6",
    "exlantix|es": "exeed|exlantix es",
  };
  const sourceKey = `${semanticKey(source.brand)}|${semanticKey(source.model)}`;
  const resolved = modelAliases.get(sourceKey) || modelAliases.get(manualModelAliases[sourceKey]);
  if (!resolved) return { canonicalPath: "", seo: null };
  const canonicalPath = modelPath(resolved.brand, resolved.model);
  return { canonicalPath, seo: seoState.seoByPath.get(canonicalPath) };
};
const searchTargetGroups = sourceLandingRows.map((source) => {
  const target = resolveSourceTarget(source);
  const matched = Boolean(target.canonicalPath && target.seo);
  const legacyPaths = matched && source.suggested_path && source.suggested_path !== target.canonicalPath ? [source.suggested_path] : [];
  return {
    source_row: source.source_row,
    source_group_type: source.group_type,
    source_group_name: source.group_name,
    search_group: `${String(source.group_type).toLocaleLowerCase("ru")}:${semanticKey(source.brand || source.group_name)}${source.model ? `|${semanticKey(source.model)}` : ""}`,
    page_type: String(source.group_type).toLocaleLowerCase("ru") === "wide" ? "catalog" : String(source.group_type).toLocaleLowerCase("ru"),
    brand: source.brand,
    model: source.model,
    priority: source.economic_priority || (priorityModelNames.has(`${semanticKey(source.brand)}|${semanticKey(source.model)}`) ? "high" : "standard"),
    queries: matched ? [...new Set([target.seo.primary_query, ...(target.seo.secondary_queries || [])].filter(Boolean))] : [],
    canonical_path: matched ? target.canonicalPath : "",
    canonical_url: matched ? canonicalUrl(target.canonicalPath) : "",
    legacy_urls: matched ? [...new Set([...legacyPaths.map(canonicalUrl), ...legacyUrlsFor(target.canonicalPath)])] : [source.suggested_path].filter(Boolean).map(canonicalUrl),
    source_suggested_path: source.suggested_path,
    source_final_url: source.final_url,
    source_status: source.status,
    match_status: matched ? "matched" : "missing_target",
    missing_reason: matched ? "" : "No verified current canonical page matches the source group.",
  };
});
if (searchTargetGroups.length !== 107) throw new Error(`Expected 107 source search groups, got ${searchTargetGroups.length}`);
fs.writeFileSync(path.join(publicDir, "search-target-map.json"), `${JSON.stringify({
  version: 2,
  generated_from: [sourceLandingMapLabel, ...(directSemantics.generated_from || [])],
  source_groups: { total: 107, wide: 1, brands: 25, models: 81 },
  matched_groups: searchTargetGroups.filter((group) => group.match_status === "matched").length,
  missing_groups: searchTargetGroups.filter((group) => group.match_status !== "matched").length,
  groups: searchTargetGroups,
}, null, 2)}\n`);
const coveredPrimaryQueries = new Set(searchTargetGroups.flatMap((row) => row.queries));
const unresolvedDirectGroups = [
  ...Object.entries(directSemantics.brands || {}),
  ...Object.entries(directSemantics.models || {}),
].filter(([, entry]) => !coveredPrimaryQueries.has(entry.primary_query))
  .map(([source_group, entry]) => ({ source_group, primary_query: entry.primary_query, status: "no_current_catalog_target" }));
fs.writeFileSync(path.join(reportsDir, "direct-target-gaps.json"), `${JSON.stringify(unresolvedDirectGroups, null, 2)}\n`);

fs.writeFileSync(path.join(reportsDir, "form-submission-audit.json"), `${JSON.stringify({
  status: "server_confirmation_unavailable",
  current_transport: "Google Apps Script with fetch mode no-cors",
  analytics: {
    attempt_event: "request_submit_attempt",
    success_event: "request_submit_success",
    personal_data_in_events: false,
    online_events: config.analytics?.events || [],
    offline_events: config.analytics?.offlineEvents || [],
  },
  saved_with_request: ["metrika_client_id", "yclid", "utm", "first_landing_url", "order_id", "selected_products", "preliminary_sum", "currency"],
  client_behavior: "An opaque no-cors response is not counted or shown as confirmed success.",
  offline_event_policy: "qualified_50000, quote_sent, order_confirmed_50000 and order_paid_50000 are server/CRM-only and are not callable through the browser event allowlist.",
  paid_revenue_policy: "order_paid_50000 must use the actually paid RUB amount and must not contain phone, name, email, VIN or other personal data.",
  server_change_required: "Return a CORS-enabled JSON response with a 2xx status only after the request and attribution payload have been saved successfully; later send qualified, quote, confirmed and paid statuses from the server or CRM.",
}, null, 2)}\n`);

const categoryWordstatResults = wordstatAudit.category_results || [];
const categoryWordstatQueries = categoryWordstatResults.flatMap((page) => page.checked_queries || []);
const categoryPhraseMatchSets = new Set(categoryWordstatResults.flatMap((page) => (page.checked_queries || [])
  .map((query) => `${page.canonical_path}|${query.phrase_match_set}`)));
const categoryDemandMatchSets = new Set(categoryWordstatResults.flatMap((page) => (page.checked_queries || [])
  .filter((query) => query.phrase_frequency > 0)
  .map((query) => `${page.canonical_path}|${query.phrase_match_set}`)));
const categoryPagesWithDemand = categoryWordstatResults.filter((page) => (page.checked_queries || [])
  .some((query) => query.phrase_frequency > 0));
const categoryWordstatComputed = {
  query_strings_checked: categoryWordstatQueries.length,
  unique_phrase_match_sets: categoryPhraseMatchSets.size,
  phrase_query_strings_with_demand: categoryWordstatQueries.filter((query) => query.phrase_frequency > 0).length,
  unique_phrase_match_sets_with_demand: categoryDemandMatchSets.size,
  strict_order_queries_checked: categoryWordstatQueries.filter((query) => query.strict_order_query).length,
  strict_order_queries_with_demand: categoryWordstatQueries.filter((query) => query.strict_order_frequency > 0).length,
  category_pages_checked: categoryWordstatResults.length,
  category_pages_with_demand: categoryPagesWithDemand.length,
  zero_demand_categories: categoryWordstatResults.length - categoryPagesWithDemand.length,
};
const categoryRecommendations = categoryWordstatResults
  .map((row) => ({
    ...row,
    applied_primary_query: seoState.seoRows.find((seoRow) => seoRow.canonical_path === row.canonical_path)?.primary_query || "",
  }))
  .sort((left, right) => left.canonical_path.localeCompare(right.canonical_path, "ru"));
fs.writeFileSync(path.join(reportsDir, "category-wordstat-recommendations.json"), `${JSON.stringify({
  methodology: wordstatAudit.methodology || {}, summary: categoryWordstatComputed,
  count: categoryRecommendations.length, pages: categoryRecommendations,
}, null, 2)}\n`);
fs.writeFileSync(path.join(reportsDir, "category-wordstat-candidates.json"), `${JSON.stringify({
  count: (wordstatAudit.category_candidates || []).length,
  candidates: wordstatAudit.category_candidates || [],
  policy: "Candidates require an explicit owner decision and are never applied automatically.",
}, null, 2)}\n`);
fs.writeFileSync(path.join(reportsDir, "wordstat-audit-summary.json"), `${JSON.stringify({
  ...wordstatAudit.summary,
  ...categoryWordstatComputed,
  methodology: wordstatAudit.methodology || {},
  applied_catalog_changes: wordstatAudit.priorities?.catalog ? 1 : 0,
  applied_brand_changes: Object.keys(wordstatAudit.priorities?.brands || {}).length,
  applied_model_changes: Object.keys(wordstatAudit.priorities?.models || {}).length,
  applied_category_primary_queries: Object.keys(wordstatAudit.priorities?.categories || {}).length,
  category_results_count: (wordstatAudit.category_results || []).length,
  variants_retained: true,
}, null, 2)}\n`);

const ownerConfirmationHistory = [
  { claim: "До 30% ниже рынка / 20–30% ниже предложений", location: "/#top, /#about", status: "confirmed-by-owner", action: "Подтверждено владельцем 2026-08-07; формулировка возвращена в первый экран и сохранена в карточке преимуществ." },
  { claim: "4 570 доставленных запчастей", location: "/#company", status: "confirmed-by-owner", action: "Подтверждено владельцем 2026-08-07; защищённый блок №3 оставлен без изменений." },
  { claim: "1 650 обработанных заказов", location: "/#company", status: "confirmed-by-owner", action: "Подтверждено владельцем 2026-08-07; защищённый блок №3 оставлен без изменений." },
  { claim: "Гарантия и обмен новых деталей", location: "/#guarantee", status: "confirmed-by-owner", action: "Условия гарантии и возврата подтверждены владельцем 2026-08-07." },
  { claim: "Контрактные запчасти обмену и возврату не подлежат", location: "/#guarantee", status: "confirmed-by-owner", action: "Условия гарантии и возврата подтверждены владельцем 2026-08-07." },
  { claim: "Фиксированные сроки 15–45 дней и авиадоставка от 2 дней", location: "/#faq", status: "neutralized", action: "Заменено на расчёт срока после проверки заказа." },
  { claim: "Автомобили только от 2020 года", location: "/#request", status: "removed", action: "Неподтверждённое ограничение удалено из видимой формы." },
];
const ownerConfirmation = ownerConfirmationHistory.filter((entry) => entry.status === "pending");
fs.writeFileSync(path.join(reportsDir, "needs-owner-confirmation.json"), `${JSON.stringify(ownerConfirmation, null, 2)}\n`);
fs.writeFileSync(path.join(reportsDir, "legacy-content-audit.json"), `${JSON.stringify({
  status: "removed_after_dependency_audit",
  css_evidence: "reference-hero.css hides every main section outside the reference-only allowlist",
  javascript_evidence: "script.js binds the first data-request-form, which is the visible reference form; removed duplicate fields were later in DOM",
  removed_blocks: ["catalog-dock", "advantages", "about-legacy", "gallery", "supplier-section", "cases", "legacy-request", "legacy-contacts"],
  retained_blocks: ["reference-hero", "reference-catalog-preview", "reference-process", "reference-company", "reference-workflow", "reference-suppliers", "reference-orders", "guarantee-section", "reference-faq", "reference-request", "reference-contacts"],
}, null, 2)}\n`);
fs.writeFileSync(path.join(reportsDir, "validation-summary.json"), `${JSON.stringify({
  source: rules.source, source_products: items.length,
  promoted_pages: promotedSeoRows.length, excluded_products: exportRows.filter((row) => row.entity_type === "product" && !row.indexable).length,
  insufficient_data_products: seoState.needsReview.length,
  duplicate_secondary_products: seoState.duplicateReport.reduce((total, group) => total + group.duplicate_product_ids.length, 0),
  confirmed_full_duplicate_groups: seoState.duplicateReport.filter((group) => group.classification === "confirmed_full_duplicate").length,
  confirmed_metadata_duplicate_groups: seoState.duplicateReport.filter((group) => group.classification === "confirmed_metadata_duplicate").length,
  pending_manual_duplicate_groups: seoState.duplicateReport.filter((group) => group.classification === "pending_manual_identity_review").length,
  needs_review: seoState.needsReview.length, duplicate_groups: seoState.duplicateReport.length,
  image_rights_confirmed: seoState.imageReport.filter((row) => row.rights_status === "confirmed_by_owner").length,
  image_rights_pending: seoState.imageReport.filter((row) => row.rights_status !== "confirmed_by_owner").length,
  image_quality_review_pending: seoState.imageReport.filter((row) => row.quality_review_pending).length,
  probable_identity_matches: seoState.probableMatches.length,
  wordstat: categoryWordstatComputed,
  direct_semantics: directCoverage.summary,
  pending_business_confirmation: [
    ...(config.organization?.businessDetailsStatus === "confirmed" ? [] : ["organization.address", "organization.email", "organization.telephone"]),
    ...(config.analytics?.counterStatus === "confirmed" ? [] : ["analytics.counterId"]),
    ...(ownerConfirmation.length ? ["reports/seo/needs-owner-confirmation.json"] : []),
  ],
}, null, 2)}\n`);
fs.writeFileSync(
  path.join(projectDir, "catalog-url-data.js"),
  `window.KITRADE_CATALOG_URLS = ${JSON.stringify({ site_url: config.siteUrl, products: browserProducts, routes: browserRoutes })};\n`,
);
const runtimeItems = registry.entities.products.map((product) => {
  const item = items.find((entry) => String(entry.id) === String(product.source_id)) || product.source_snapshot || null;
  if (product.status !== "active" || !isVisibleCatalogItem(item)) return null;
  const brand = indexes.brands.get(product.brand_id);
  const model = indexes.models.get(product.model_id);
  const category = indexes.categories.get(product.category_id);
  const content = seoState.productState.get(product.product_id)?.content || {};
  const photo = normalizePhoto(item?.photos?.[0]);
  return {
    id: String(item?.id || product.source_id),
    product_id: product.product_id,
    title: content.h1 || product.name,
    detail: content.detail || item?.detail || "",
    brand: brand?.name || item?.brand || "",
    model: model?.name || item?.model || "",
    generation: item?.generation || "",
    yearFrom: item?.yearFrom || null,
    yearTo: item?.yearTo || null,
    years: Array.isArray(item?.years) ? item.years : [],
    category: category?.name || product.public_category || item?.category || "Запчасти",
    subcategory: item?.subcategory || "",
    public_category: category?.name || product.public_category || item?.category || "Запчасти",
    condition: content.condition || "",
    origin: content.origin || "",
    price: item?.price || "",
    article: content.article || "",
    photos: photo ? [photo] : [],
    canonical_path: product.canonical_path,
    card_description: content.cardDescription || "",
    quick_description: content.quickDescription || "",
    meta: content.meta || "",
  };
}).filter(Boolean);
fs.writeFileSync(
  path.join(projectDir, "catalog-runtime-data.js"),
  `window.KITRADE_CATALOG_DATA = ${JSON.stringify({ site_url: config.siteUrl, items: runtimeItems, routes: browserRoutes })};\n`,
);

console.log(`Catalog registry synchronized: ${registry.entities.products.length} products, ${exportRows.length} public URL records, ${promotedSeoRows.length} indexable SEO pages.`);
