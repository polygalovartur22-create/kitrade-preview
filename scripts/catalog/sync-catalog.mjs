import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCatalogData } from "./lib/data.mjs";
import { createEmptyRegistry, registryIndexes, syncRegistry, validateRegistry } from "./lib/registry.mjs";
import { buildSeoState, toCsv } from "./lib/seo.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const registryPath = path.join(projectDir, "catalog-url-map.json");
const publicDir = path.join(projectDir, "public");
const config = JSON.parse(fs.readFileSync(path.join(projectDir, "site.config.json"), "utf8"));
const items = readCatalogData(path.join(projectDir, "kitrade-parts-data.js"));
const previous = fs.existsSync(registryPath)
  ? JSON.parse(fs.readFileSync(registryPath, "utf8"))
  : createEmptyRegistry();
const registry = syncRegistry(previous, items);
validateRegistry(registry);
const indexes = registryIndexes(registry);
const rules = JSON.parse(fs.readFileSync(path.join(projectDir, "seo", "seo-rules.json"), "utf8"));
const overrides = JSON.parse(fs.readFileSync(path.join(projectDir, "seo", "seo-overrides.json"), "utf8"));
const directSemanticsPath = path.join(projectDir, "seo", "direct-semantics.json");
const directSemantics = fs.existsSync(directSemanticsPath) ? JSON.parse(fs.readFileSync(directSemanticsPath, "utf8")) : {};
const seoState = buildSeoState({ registry, items, indexes, config, rules, overrides, directSemantics });

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

const categoryRecommendations = seoState.seoRows.filter((row) => row.page_type === "category")
  .map((row) => ({ canonical_path: row.canonical_path, brand: row.brand, model: row.model, category: row.category,
    primary_query: row.primary_query, recommendation: "Проверить точную частотность и коммерческий интент в Wordstat перед расширением текста." }))
  .sort((left, right) => left.canonical_path.localeCompare(right.canonical_path, "ru"))
  .slice(0, 40);
fs.writeFileSync(path.join(reportsDir, "category-wordstat-recommendations.json"), `${JSON.stringify({ count: categoryRecommendations.length, pages: categoryRecommendations }, null, 2)}\n`);

const ownerConfirmation = [
  { claim: "До 30% ниже рынка / 20–30% ниже предложений", location: "/#top, /#about", status: "confirmed-by-owner", action: "Подтверждено владельцем 2026-08-07; формулировка возвращена в первый экран и сохранена в карточке преимуществ." },
  { claim: "4 570 доставленных запчастей", location: "/#company", status: "confirmed-by-owner", action: "Подтверждено владельцем 2026-08-07; защищённый блок №3 оставлен без изменений." },
  { claim: "1 650 обработанных заказов", location: "/#company", status: "confirmed-by-owner", action: "Подтверждено владельцем 2026-08-07; защищённый блок №3 оставлен без изменений." },
  { claim: "Гарантия и обмен новых деталей", location: "/#guarantee", status: "confirmed-by-owner", action: "Условия гарантии и возврата подтверждены владельцем 2026-08-07." },
  { claim: "Контрактные запчасти обмену и возврату не подлежат", location: "/#guarantee", status: "confirmed-by-owner", action: "Условия гарантии и возврата подтверждены владельцем 2026-08-07." },
  { claim: "Фиксированные сроки 15–45 дней и авиадоставка от 2 дней", location: "/#faq", status: "neutralized", action: "Заменено на расчёт срока после проверки заказа." },
  { claim: "Автомобили только от 2020 года", location: "/#request", status: "removed", action: "Неподтверждённое ограничение удалено из видимой формы." },
];
fs.writeFileSync(path.join(reportsDir, "needs-owner-confirmation.json"), `${JSON.stringify(ownerConfirmation, null, 2)}\n`);
fs.writeFileSync(path.join(reportsDir, "legacy-content-audit.json"), `${JSON.stringify({
  status: "removed_after_dependency_audit",
  css_evidence: "reference-hero.css hides every main section outside the reference-only allowlist",
  javascript_evidence: "script.js binds the first data-request-form, which is the visible reference form; removed duplicate fields were later in DOM",
  removed_blocks: ["catalog-dock", "advantages", "about-legacy", "gallery", "supplier-section", "cases", "legacy-request", "legacy-contacts"],
  retained_blocks: ["reference-hero", "reference-catalog-preview", "reference-process", "reference-company", "reference-workflow", "reference-suppliers", "reference-orders", "guarantee-section", "reference-faq", "reference-request", "reference-contacts"],
}, null, 2)}\n`);
fs.writeFileSync(path.join(reportsDir, "validation-summary.json"), `${JSON.stringify({
  generated_at: new Date().toISOString(), source: rules.source, source_products: items.length,
  promoted_pages: promotedSeoRows.length, excluded_products: exportRows.filter((row) => row.entity_type === "product" && !row.indexable).length,
  needs_review: seoState.needsReview.length, duplicate_groups: seoState.duplicateReport.length,
  image_manual_review: seoState.imageReport.length, probable_identity_matches: seoState.probableMatches.length,
  direct_semantics: directCoverage.summary,
  pending_business_confirmation: ["organization.address", "organization.email", "organization.telephone", "analytics.counterId", "reports/seo/needs-owner-confirmation.json"],
}, null, 2)}\n`);
fs.writeFileSync(
  path.join(projectDir, "catalog-url-data.js"),
  `window.KITRADE_CATALOG_URLS = ${JSON.stringify({ site_url: config.siteUrl, products: browserProducts, routes: browserRoutes })};\n`,
);

console.log(`Catalog registry synchronized: ${registry.entities.products.length} products, ${exportRows.length} public URL records, ${promotedSeoRows.length} indexable SEO pages.`);
