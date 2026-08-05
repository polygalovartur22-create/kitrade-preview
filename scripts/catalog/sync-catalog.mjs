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
const seoState = buildSeoState({ registry, items, indexes, config, rules, overrides });

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
fs.writeFileSync(path.join(reportsDir, "validation-summary.json"), `${JSON.stringify({
  generated_at: new Date().toISOString(), source: rules.source, source_products: items.length,
  promoted_pages: promotedSeoRows.length, excluded_products: exportRows.filter((row) => row.entity_type === "product" && !row.indexable).length,
  needs_review: seoState.needsReview.length, duplicate_groups: seoState.duplicateReport.length,
  image_manual_review: seoState.imageReport.length, probable_identity_matches: seoState.probableMatches.length,
  pending_business_confirmation: ["organization.address", "organization.email", "organization.telephone", "analytics.counterId"],
}, null, 2)}\n`);
fs.writeFileSync(
  path.join(projectDir, "catalog-url-data.js"),
  `window.KITRADE_CATALOG_URLS = ${JSON.stringify({ site_url: config.siteUrl, products: browserProducts, routes: browserRoutes })};\n`,
);

console.log(`Catalog registry synchronized: ${registry.entities.products.length} products, ${exportRows.length} public URL records, ${promotedSeoRows.length} indexable SEO pages.`);
