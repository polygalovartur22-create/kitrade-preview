import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCatalogData, normalizePhoto } from "./lib/data.mjs";
import { getPublicCategory, isVisibleCatalogItem } from "./lib/domain.mjs";
import { registryIndexes, validateRegistry } from "./lib/registry.mjs";
import { breadcrumbStructuredData, buildSeoState, organizationStructuredData, productStructuredData } from "./lib/seo.mjs";
import { formatPartPrice, numericPrice } from "./lib/product-content.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = path.join(projectDir, "dist");
const registryPath = path.join(projectDir, "catalog-url-map.json");
const configPath = path.join(projectDir, "site.config.json");

if (!fs.existsSync(registryPath)) {
  throw new Error("Catalog registry is missing. Run `npm run catalog:sync` first.");
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const deploymentMode = process.env.KITRADE_BUILD_MODE === "github-pages"
  ? "github-pages"
  : process.env.KITRADE_BUILD_MODE === "preview"
    ? "preview"
    : "production";
const isNonProductionBuild = deploymentMode !== "production";
const publicBasePath = deploymentMode === "github-pages"
  ? String(process.env.GITHUB_PAGES_BASE_PATH || "/kitrade-preview").replace(/\/$/, "")
  : "";
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const items = readCatalogData(path.join(projectDir, "kitrade-parts-data.js"));
const publicUrlRows = JSON.parse(fs.readFileSync(path.join(projectDir, "public", "catalog-urls.json"), "utf8"));
validateRegistry(registry);
const indexes = registryIndexes(registry);
const itemBySourceId = new Map(items.map((item) => [String(item.id), item]));
const rules = JSON.parse(fs.readFileSync(path.join(projectDir, "seo", "seo-rules.json"), "utf8"));
const overrides = JSON.parse(fs.readFileSync(path.join(projectDir, "seo", "seo-overrides.json"), "utf8"));
const directSemanticsPath = path.join(projectDir, "seo", "direct-semantics.json");
const directSemantics = fs.existsSync(directSemanticsPath) ? JSON.parse(fs.readFileSync(directSemanticsPath, "utf8")) : {};
const wordstatAuditPath = path.join(projectDir, "seo", "wordstat-audit.json");
const wordstatAudit = fs.existsSync(wordstatAuditPath) ? JSON.parse(fs.readFileSync(wordstatAuditPath, "utf8")) : {};
const seoState = buildSeoState({ registry, items, indexes, config, rules, overrides, directSemantics, wordstatAudit });
const organizationSchema = organizationStructuredData(config);
const CATALOG_PAGE_SIZE = 24;

for (const item of items) {
  if (!indexes.productsBySourceId.has(String(item.id))) {
    throw new Error(`Current product ${item.id} has no permanent URL. Run npm run catalog:sync.`);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function canonicalUrl(routePath) {
  return new URL(routePath, `${config.siteUrl}/`).href;
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

function paginationPath(routePath, pageNumber) {
  if (pageNumber <= 1) return routePath;
  return `${routePath}page/${pageNumber}/`;
}

function paginatedTitle(title, pageNumber) {
  if (pageNumber <= 1) return title;
  const marker = ` — страница ${pageNumber}`;
  const suffixMatch = title.match(/\s+\|\s+(?:KITRADE|Китрейд)$/i);
  const suffix = suffixMatch?.[0] || "";
  const body = suffix ? title.slice(0, -suffix.length) : title;
  const available = Math.max(30, 75 - suffix.length - marker.length);
  const shortened = body.length <= available ? body : body.slice(0, available).replace(/\s+\S*$/, "").replace(/[.,;:!?/\-–—]+$/, "");
  return `${shortened}${marker}${suffix}`;
}

function sentence(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function writeRoute(routePath, html) {
  const relative = routePath.replace(/^\/+|\/+$/g, "");
  const directory = path.join(outputDir, ...relative.split("/"));
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "index.html");
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== html) fs.writeFileSync(file, html);
}

function copyTree(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(sourcePath, destinationPath);
    else if (entry.isFile()) {
      const sourceStat = fs.statSync(sourcePath);
      const destinationStat = fs.existsSync(destinationPath) ? fs.statSync(destinationPath) : null;
      if (!destinationStat || destinationStat.size !== sourceStat.size) fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function formatPrice(item) {
  return formatPartPrice(item?.price);
}

function deliveryLabel() {
  return "доставка отдельно";
}

function fallbackPhoto(item) {
  const subject = [item?.title, item?.detail, item?.subcategory, item?.category]
    .filter(Boolean).join(" ").toLocaleLowerCase("ru");
  if (/фара|фонарь|оптика|автосвет/.test(subject)) return "/assets/01-catalog-led-headlamp.png";
  if (/крыло/.test(subject)) return "/assets/02-catalog-front-fender.png";
  if (/реш[её]тка|нижн[^ ]* бампер/.test(subject)) return "/assets/03-catalog-lower-grille.png";
  return "";
}

function productCard(product, item) {
  const productState = seoState.productState.get(product.product_id);
  const content = productState?.content || {};
  const title = content.h1 || product.name;
  const publicCategory = indexes.categories.get(product.category_id)?.name || product.public_category || getPublicCategory(item || {});
  const photo = normalizePhoto(item?.photos?.[0]) || fallbackPhoto(item);
  const image = photo
    ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(title)}" loading="lazy" /><div class="photo-fallback" hidden>Фото уточняется</div>`
    : '<div class="photo-fallback">Фото уточняется</div>';
  const description = content.cardDescription || "Цена — за деталь. Доставка отдельно. Проверка по VIN.";
  const href = productState?.indexable ? ` href="${escapeHtml(product.canonical_path)}"` : "";
  return `
      <article class="part-card" data-id="${escapeHtml(item?.id || product.source_id)}">
        <a class="part-photo"${href} data-product-link data-product-id="${escapeHtml(item?.id || product.source_id)}">${image}</a>
        <div class="part-content">
          <span class="part-category">${escapeHtml(publicCategory)}</span>
          <h3><a class="part-title-link"${href} data-product-link data-product-id="${escapeHtml(item?.id || product.source_id)}">${escapeHtml(title)}</a></h3>
          <p class="part-description">${escapeHtml(description)}</p>
          <div class="part-meta">
            <strong class="part-price">${escapeHtml(formatPrice(item))}</strong>
            <span class="part-time">${escapeHtml(deliveryLabel(item))}</span>
            <button class="card-action" type="button" data-add="${escapeHtml(item?.id || product.source_id)}">В заявку</button>
          </div>
        </div>
      </article>`;
}

const catalogTemplate = fs.readFileSync(path.join(projectDir, "catalog.html"), "utf8");

function staticFilterOptions(links) {
  return links.map(({ href, label }) => `<label data-filter-value="${escapeHtml(label)}"><input type="checkbox" value="${escapeHtml(label)}" /><a href="${escapeHtml(href)}" data-filter-option-link>${escapeHtml(label)}</a><i aria-hidden="true"></i></label>`).join("");
}

function replaceFilterOptions(html, filterId, links) {
  if (!links.length) return html;
  const pattern = new RegExp(`(<div class="filter-group filter-dropdown[^"]*" id="${filterId}">[\\s\\S]*?<div class="filter-options" data-filter-options>)[\\s\\S]*?(</div>)`);
  return html.replace(pattern, `$1${staticFilterOptions(links)}$2`);
}

function catalogPage({ routePath, titleParts = [], brand = null, model = null, category = null, products, totalProducts = products.length, pageNumber = 1, totalPages = 1, brandLinks = [], modelLinks = [], categoryLinks = [] }) {
  const seo = seoState.seoByPath.get(routePath) || seoState.seoByPath.get("/catalog/");
  const currentRoutePath = paginationPath(routePath, pageNumber);
  const pageTitle = paginatedTitle(seo.title, pageNumber);
  const pageDescription = pageNumber > 1 ? `${sentence(seo.description)} Страница ${pageNumber}.` : seo.description;
  const visibleCards = products.map(({ product, item }) => productCard(product, item)).join("");
  const summary = titleParts.join(" / ") || "Все марки и категории";
  const bodyAttributes = [
    brand ? `data-catalog-brand="${escapeHtml(brand.name)}"` : "",
    model ? `data-catalog-model="${escapeHtml(model.name)}"` : "",
    category ? `data-catalog-category="${escapeHtml(category.name)}"` : "",
    `data-catalog-page="${pageNumber}"`,
  ].filter(Boolean).join(" ");

  const breadcrumbItems = [
    { name: "Главная", path: "/" },
    { name: "Каталог", path: "/catalog/" },
    brand ? { name: brand.name, path: brandPath(brand) } : null,
    brand && model ? { name: model.name, path: modelPath(brand, model) } : null,
    brand && model && category ? { name: category.name, path: categoryPath(brand, model, category) } : null,
    pageNumber > 1 ? { name: `Страница ${pageNumber}`, path: currentRoutePath } : null,
  ].filter(Boolean).filter((entry, index, entries) => index === 0 || entry.path !== entries[index - 1].path);
  const schemas = [organizationSchema, breadcrumbStructuredData(breadcrumbItems, config)];
  let html = catalogTemplate
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(pageTitle)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(pageDescription)}" />`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonicalUrl(currentRoutePath)}" />`)
    .replace("</head>", `  <script type="application/ld+json">${safeJson(schemas)}</script>\n  </head>`)
    .replace("<body>", `<body ${bodyAttributes}>`)
    .replace(
      /<h1 id="catalog-title">[\s\S]*?<\/h1>/,
      routePath === "/catalog/"
        ? '<h1 id="catalog-title">Автозапчасти<br />под заказ.<br />Проверим по VIN.</h1>'
        : `<h1 id="catalog-title">${escapeHtml(seo.h1)}</h1>`,
    )
    .replace(/<p class="hero-description">[\s\S]*?<\/p>/, `<p class="hero-description">${escapeHtml(seo.intro_text || seo.description)}</p>`)
    .replace('<p id="resultCount">Найдено 0 позиций</p>', `<p id="resultCount">Найдено ${totalProducts} позиций</p>`)
    .replace('<h2 id="resultSummary">Chery / Geely / Haval</h2>', `<h2 id="resultSummary">${escapeHtml(summary)}</h2>`)
    .replace('<div class="parts-grid" id="partsGrid"></div>', `<div class="parts-grid" id="partsGrid">${visibleCards}</div>`)
    .replace(
      /<a class="load-more" id="loadMore"[^>]*>Показать еще<\/a>/,
      pageNumber < totalPages
        ? `<a class="load-more" id="loadMore" href="${escapeHtml(paginationPath(routePath, pageNumber + 1))}">Показать еще</a>`
        : '<a class="load-more" id="loadMore" href="/catalog/" hidden>Показать еще</a>',
    );
  html = replaceFilterOptions(html, "brandFilters", brandLinks);
  html = replaceFilterOptions(html, "modelFilters", modelLinks);
  html = replaceFilterOptions(html, "typeFilters", categoryLinks);
  if (currentRoutePath !== "/catalog/") html = html.replaceAll('href="#catalog"', 'href="/catalog/"');
  return html;
}

function currentProductRows() {
  return registry.entities.products.map((product) => {
    const item = itemBySourceId.get(String(product.source_id)) || product.source_snapshot || null;
    return { product, item };
  });
}

const allProductRows = currentProductRows();
const visibleRows = allProductRows.filter(({ product, item }) => product.status === "active" && isVisibleCatalogItem(item));

const modelsByBrand = new Map();
const rowsByBrand = new Map();
const rowsByModel = new Map();
const rowsByCategoryRoute = new Map();
for (const row of visibleRows) {
  const { product } = row;
  if (product.brand_id) {
    if (!rowsByBrand.has(product.brand_id)) rowsByBrand.set(product.brand_id, []);
    rowsByBrand.get(product.brand_id).push(row);
  }
  if (product.model_id) {
    if (!rowsByModel.has(product.model_id)) rowsByModel.set(product.model_id, []);
    rowsByModel.get(product.model_id).push(row);
    if (!modelsByBrand.has(product.brand_id)) modelsByBrand.set(product.brand_id, new Set());
    modelsByBrand.get(product.brand_id).add(product.model_id);
  }
  if (product.brand_id && product.model_id && product.category_id) {
    const key = `${product.brand_id}|${product.model_id}|${product.category_id}`;
    if (!rowsByCategoryRoute.has(key)) rowsByCategoryRoute.set(key, []);
    rowsByCategoryRoute.get(key).push(row);
  }
}

function additionalPaginationPaths(routePath, productCount) {
  const totalPages = Math.ceil(productCount / CATALOG_PAGE_SIZE);
  return Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => paginationPath(routePath, index + 2));
}

const paginationSitemapPaths = [
  ...additionalPaginationPaths("/catalog/", visibleRows.length),
  ...[...rowsByBrand].flatMap(([brandId, rows]) => {
    const brand = indexes.brands.get(brandId);
    return brand ? additionalPaginationPaths(brandPath(brand), rows.length) : [];
  }),
  ...[...rowsByModel].flatMap(([modelId, rows]) => {
    const model = indexes.models.get(modelId);
    const brand = model ? indexes.brands.get(model.parent_id) : null;
    return brand && model ? additionalPaginationPaths(modelPath(brand, model), rows.length) : [];
  }),
  ...[...rowsByCategoryRoute].flatMap(([key, rows]) => {
    const [brandId, modelId, categoryId] = key.split("|");
    const brand = indexes.brands.get(brandId);
    const model = indexes.models.get(modelId);
    const category = indexes.categories.get(categoryId);
    return brand && model && category ? additionalPaginationPaths(categoryPath(brand, model, category), rows.length) : [];
  }),
];

if (path.resolve(outputDir) !== path.join(projectDir, "dist")) throw new Error("Unsafe output directory");
fs.mkdirSync(outputDir, { recursive: true });
const catalogOutputDir = path.join(outputDir, "catalog");
if (path.dirname(catalogOutputDir) !== outputDir) throw new Error("Unsafe catalog output directory");
fs.mkdirSync(catalogOutputDir, { recursive: true });
for (const entry of fs.readdirSync(catalogOutputDir, { withFileTypes: true })) {
  if (entry.name === "product") continue;
  const staleTarget = path.resolve(catalogOutputDir, entry.name);
  if (path.dirname(staleTarget) !== catalogOutputDir) throw new Error(`Unsafe stale route target: ${staleTarget}`);
  fs.rmSync(staleTarget, { recursive: true, force: true });
}

for (const directory of ["assets", "source-dist2"]) {
  const source = path.join(projectDir, directory);
  if (fs.existsSync(source)) copyTree(source, path.join(outputDir, directory));
}
for (const filename of fs.readdirSync(projectDir)) {
  if (!/\.(?:css|js|html)$/i.test(filename) || filename === "catalog.html") continue;
  fs.copyFileSync(path.join(projectDir, filename), path.join(outputDir, filename));
}
const homeOutputPath = path.join(outputDir, "index.html");
if (fs.existsSync(homeOutputPath)) {
  const homeHtml = fs.readFileSync(homeOutputPath, "utf8").replace(
    /<script id="organization-schema" type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script id="organization-schema" type="application/ld+json">${safeJson(organizationSchema)}</script>`,
  );
  fs.writeFileSync(homeOutputPath, homeHtml);
}
for (const filename of ["_headers"]) {
  const source = path.join(projectDir, filename);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(outputDir, filename));
}
if (isNonProductionBuild) {
  const headersPath = path.join(outputDir, "_headers");
  const headers = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, "utf8").trimEnd() : "";
  fs.writeFileSync(headersPath, `${headers}\n\n/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n`);
}
fs.copyFileSync(path.join(projectDir, "public", "catalog-urls.json"), path.join(outputDir, "catalog-urls.json"));
for (const filename of ["seo-map.json", "seo-map.csv", "search-target-map.json"]) {
  const source = path.join(projectDir, "public", filename);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(outputDir, filename));
}
const runtimeAnalytics = { ...config.analytics, enabled: isNonProductionBuild ? false : Boolean(config.analytics?.enabled) };
fs.writeFileSync(path.join(outputDir, "site-runtime-config.js"), `window.KITRADE_SITE_CONFIG = ${safeJson({
  deploymentMode,
  basePath: publicBasePath,
  analytics: runtimeAnalytics,
})};\n`);
const sitemapUrls = [canonicalUrl("/"), canonicalUrl("/catalog/"), ...publicUrlRows.filter((row) => row.indexable).map((row) => row.canonical_url), ...paginationSitemapPaths.map(canonicalUrl)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(sitemapUrls)].map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
fs.writeFileSync(path.join(outputDir, "sitemap.xml"), sitemap);
fs.writeFileSync(path.join(outputDir, "robots.txt"), isNonProductionBuild
  ? "User-agent: *\nDisallow: /\n"
  : [
      "User-agent: *",
      "Allow: /",
      "Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&ysclid /",
      `Sitemap: ${canonicalUrl("/sitemap.xml")}`,
      "",
    ].join("\n"));

const rootBrandLinks = [...rowsByBrand.keys()].map((brandId) => indexes.brands.get(brandId)).filter(Boolean)
  .filter((brand) => seoState.seoByPath.get(brandPath(brand))?.indexable)
  .sort((a, b) => a.name.localeCompare(b.name, "ru"))
  .map((brand) => ({ href: brandPath(brand), label: brand.name }));

let generatedCatalogPages = 0;
function writeCatalogSeries(options) {
  const { routePath, products } = options;
  const totalPages = Math.max(1, Math.ceil(products.length / CATALOG_PAGE_SIZE));
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const pageProducts = products.slice((pageNumber - 1) * CATALOG_PAGE_SIZE, pageNumber * CATALOG_PAGE_SIZE);
    writeRoute(paginationPath(routePath, pageNumber), catalogPage({
      ...options,
      products: pageProducts,
      totalProducts: products.length,
      pageNumber,
      totalPages,
    }));
    generatedCatalogPages += 1;
  }
}

writeCatalogSeries({ routePath: "/catalog/", products: visibleRows, brandLinks: rootBrandLinks });

for (const [brandId, brandRows] of rowsByBrand) {
  const brand = indexes.brands.get(brandId);
  if (!brand) continue;
  const modelLinks = [...(modelsByBrand.get(brandId) || [])].map((id) => indexes.models.get(id)).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((model) => ({ href: modelPath(brand, model), label: model.name }));
  writeCatalogSeries({ routePath: brandPath(brand), titleParts: [brand.name], brand, products: brandRows, brandLinks: rootBrandLinks, modelLinks });
}

for (const [modelId, modelRows] of rowsByModel) {
  const model = indexes.models.get(modelId);
  const brand = model ? indexes.brands.get(model.parent_id) : null;
  if (!brand || !model) continue;
  const categoryIds = new Set(modelRows.map(({ product }) => product.category_id).filter(Boolean));
  const categoryLinks = [...categoryIds].map((id) => indexes.categories.get(id)).filter(Boolean)
    .filter((category) => seoState.seoByPath.get(categoryPath(brand, model, category))?.indexable)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((category) => ({ href: categoryPath(brand, model, category), label: category.name }));
  writeCatalogSeries({ routePath: modelPath(brand, model), titleParts: [brand.name, model.name], brand, model, products: modelRows, brandLinks: rootBrandLinks, categoryLinks });
}

for (const [key, categoryRows] of rowsByCategoryRoute) {
  const [brandId, modelId, categoryId] = key.split("|");
  const brand = indexes.brands.get(brandId);
  const model = indexes.models.get(modelId);
  const category = indexes.categories.get(categoryId);
  if (!brand || !model || !category) continue;
  const routePath = categoryPath(brand, model, category);
  const siblingModelLinks = [...(modelsByBrand.get(brandId) || [])].map((id) => indexes.models.get(id)).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((entry) => ({ href: modelPath(brand, entry), label: entry.name }));
  const siblingCategoryLinks = [...new Set((rowsByModel.get(modelId) || []).map(({ product }) => product.category_id).filter(Boolean))]
    .map((id) => indexes.categories.get(id)).filter(Boolean)
    .filter((entry) => seoState.seoByPath.get(categoryPath(brand, model, entry))?.indexable)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((entry) => ({ href: categoryPath(brand, model, entry), label: entry.name }));
  writeCatalogSeries({ routePath, titleParts: [brand.name, model.name, category.name], brand, model, category, products: categoryRows, brandLinks: rootBrandLinks, modelLinks: siblingModelLinks, categoryLinks: siblingCategoryLinks });
}

function productPage(product, item) {
  const brand = indexes.brands.get(product.brand_id);
  const model = indexes.models.get(product.model_id);
  const category = indexes.categories.get(product.category_id);
  const state = seoState.productState.get(product.product_id);
  const content = state?.content || {};
  const title = content.h1 || product.name;
  const realPhoto = normalizePhoto(item?.photos?.[0]);
  const photo = realPhoto || fallbackPhoto(item);
  const description = content.description || "";
  const meta = content.meta || [brand?.name, model?.name].filter(Boolean).join(" · ");
  const hasIndexableRoute = (routePath) => Boolean(seoState.seoByPath.get(routePath)?.indexable);
  const crumbs = [
    ['/', 'Главная'], ['/catalog/', 'Каталог'],
    brand && hasIndexableRoute(brandPath(brand)) ? [brandPath(brand), brand.name] : null,
    brand && model && hasIndexableRoute(modelPath(brand, model)) ? [modelPath(brand, model), model.name] : null,
    brand && model && category && hasIndexableRoute(categoryPath(brand, model, category)) ? [categoryPath(brand, model, category), category.name] : null,
  ].filter(Boolean);
  const breadcrumbHtml = crumbs.map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a><span aria-hidden="true">/</span>`).join("")
    + `<span aria-current="page">${escapeHtml(title)}</span>`;
  const seo = seoState.seoByPath.get(product.canonical_path);
  const robots = state?.indexable ? "" : '<meta name="robots" content="noindex,follow" />';
  const productData = { id: String(item?.id || product.source_id), title, article: content.article || "", price: numericPrice(item?.price) || 0 };
  const breadcrumbSchema = breadcrumbStructuredData([
    { name: "Главная", path: "/" }, { name: "Каталог", path: "/catalog/" },
    brand && hasIndexableRoute(brandPath(brand)) ? { name: brand.name, path: brandPath(brand) } : null,
    brand && model && hasIndexableRoute(modelPath(brand, model)) ? { name: model.name, path: modelPath(brand, model) } : null,
    brand && model && category && hasIndexableRoute(categoryPath(brand, model, category)) ? { name: category.name, path: categoryPath(brand, model, category) } : null,
    { name: seo?.h1 || title, path: product.canonical_path },
  ].filter(Boolean), config);
  const schemas = state?.indexable ? [
    organizationSchema,
    breadcrumbSchema,
    productStructuredData({ product, item, brand, model, category, seo, config, state, image: realPhoto }),
  ] : [organizationSchema];
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(seo?.title || `${title} | Китрейд`)}</title>
  <meta name="description" content="${escapeHtml(seo?.description || meta || title)}" />
  ${robots}
  <link rel="canonical" href="${canonicalUrl(state?.canonicalPath || product.canonical_path)}" />
  <script type="application/ld+json">${safeJson(schemas)}</script>
  <link rel="stylesheet" href="/catalog-v2.css?v=10" />
  <link rel="stylesheet" href="/catalog-responsive.css?v=3" />
  <link rel="stylesheet" href="/product-page.css?v=1" />
</head>
<body>
  <header class="site-header">
    <div class="site-header-shell">
      <a class="brand" href="/" aria-label="Китрейд, на главную"><img src="/assets/external-media/cloudinary-6a8387a47ccd342e.webp" alt="Китрейд" /></a>
      <nav class="top-nav" aria-label="Навигация"><a href="/#company">О компании</a><a href="/#about">Преимущества</a><a href="/#workflow">Доставка</a><a href="/#orders">Кейсы</a><a class="active" href="/catalog/">Каталог</a></nav>
      <div class="site-header-actions"><a class="header-cta" href="tel:+79964574301">Связаться с нами</a></div>
    </div>
  </header>
  <main class="product-page-main">
    <div class="product-page-shell">
      <nav class="catalog-breadcrumbs" aria-label="Хлебные крошки">${breadcrumbHtml}</nav>
      <article class="product-page-layout">
        <div class="product-page-gallery">${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(title)}" />` : "Фото уточняется"}</div>
        <div class="product-page-content">
          <p class="product-page-category">${escapeHtml(category?.name || product.public_category || item?.category || "Запчасть")}</p>
          <h1>${escapeHtml(seo?.h1 || title)}</h1>
          <p class="product-page-meta">${escapeHtml(meta)}</p>
          ${description ? `<p class="product-page-description">${escapeHtml(description)}</p>` : ""}
          <strong class="product-page-price">${escapeHtml(formatPrice(item))}</strong>
          <button class="product-page-request" type="button" data-product-request>Добавить в заявку</button>
        </div>
      </article>
    </div>
  </main>
  <script id="product-page-data" type="application/json">${safeJson(productData)}</script>
  <script src="/site-runtime-config.js?v=1"></script>
  <script src="/analytics.js?v=2"></script>
  <script src="/product-page.js?v=1"></script>
</body>
</html>`;
}

for (const { product, item } of allProductRows) writeRoute(product.canonical_path, productPage(product, item));

function vinSelectionPage() {
  const seo = seoState.seoByPath.get("/podbor-zapchastey-po-vin/");
  if (!seo) throw new Error("VIN selection SEO entry is missing");
  const breadcrumbs = [
    { name: "Главная", path: "/" },
    { name: "Подбор запчастей по VIN", path: seo.canonical_path },
  ];
  const schemas = [
    organizationSchema,
    breadcrumbStructuredData(breadcrumbs, config),
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: seo.h1,
      description: seo.description,
      url: seo.canonical_url,
      provider: { "@type": "Organization", name: config.organization?.name || "KITRADE", url: config.siteUrl },
      areaServed: { "@type": "Country", name: "Россия" },
    },
  ];
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(seo.title)}</title>
  <meta name="description" content="${escapeHtml(seo.description)}" />
  <link rel="canonical" href="${seo.canonical_url}" />
  <script type="application/ld+json">${safeJson(schemas)}</script>
  <link rel="stylesheet" href="/catalog-v2.css?v=10" />
  <link rel="stylesheet" href="/catalog-responsive.css?v=3" />
  <link rel="stylesheet" href="/product-page.css?v=1" />
</head>
<body>
  <header class="site-header">
    <div class="site-header-shell">
      <a class="brand" href="/" aria-label="Китрейд, на главную"><img src="/assets/external-media/cloudinary-6a8387a47ccd342e.webp" alt="Китрейд" /></a>
      <nav class="top-nav" aria-label="Навигация"><a href="/#company">О компании</a><a href="/#about">Преимущества</a><a href="/#workflow">Доставка</a><a href="/#orders">Кейсы</a><a href="/catalog/">Каталог</a></nav>
      <div class="site-header-actions"><a class="header-cta" href="tel:+79964574301">Связаться с нами</a></div>
    </div>
  </header>
  <main class="product-page-main">
    <div class="product-page-shell">
      <nav class="catalog-breadcrumbs" aria-label="Хлебные крошки"><a href="/">Главная</a><span aria-hidden="true">/</span><span aria-current="page">Подбор запчастей по VIN</span></nav>
      <article class="product-page-layout">
        <div class="product-page-gallery"><img src="/assets/07-request-form-headlamp-vin.png" alt="Подбор автозапчастей по VIN" /></div>
        <div class="product-page-content">
          <p class="product-page-category">Услуга KITRADE</p>
          <h1>${escapeHtml(seo.h1)}</h1>
          <p class="product-page-meta">Марка · модель · год · VIN</p>
          <p class="product-page-description">${escapeHtml(seo.intro_text)} Минимальная сумма заказа — 50 000 ₽.</p>
          <button class="product-page-request" type="button" onclick="window.location.href='/#request'">Отправить запрос на подбор</button>
        </div>
      </article>
    </div>
  </main>
  <script src="/site-runtime-config.js?v=1"></script>
  <script src="/analytics.js?v=2"></script>
</body>
</html>`;
}

writeRoute("/podbor-zapchastey-po-vin/", vinSelectionPage());

const metrikaCounterId = Number(runtimeAnalytics.counterId);
if (!isNonProductionBuild && runtimeAnalytics.enabled && metrikaCounterId) {
  const metrikaNoscript = `<noscript data-yandex-metrika><div><img src="https://mc.yandex.ru/watch/${metrikaCounterId}" style="position:absolute; left:-9999px;" alt=""></div></noscript>`;
  const addMetrikaNoscript = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) addMetrikaNoscript(target);
      else if (entry.isFile() && entry.name.toLocaleLowerCase("ru").endsWith(".html")) {
        const html = fs.readFileSync(target, "utf8");
        if (!html.includes("</body>") || html.includes("data-yandex-metrika")) continue;
        fs.writeFileSync(target, html.replace("</body>", `  ${metrikaNoscript}\n</body>`));
      }
    }
  };
  addMetrikaNoscript(outputDir);
}

if (isNonProductionBuild) {
  const addPreviewRobotsMeta = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) addPreviewRobotsMeta(target);
      else if (entry.isFile() && entry.name.toLocaleLowerCase("ru").endsWith(".html")) {
        let html = fs.readFileSync(target, "utf8");
        if (!/<head[\s>]/i.test(html)) continue;
        html = html.replace(/\s*<meta name="robots" content="[^"]*"\s*\/>/gi, "");
        html = html.replace(/<head([^>]*)>/i, '<head$1>\n  <meta name="robots" content="noindex,nofollow,noarchive" />');
        fs.writeFileSync(target, html);
      }
    }
  };
  addPreviewRobotsMeta(outputDir);
}

const redirects = [
  "/catalog.html /catalog/ 301!",
  "/catalog /catalog/ 301!",
  "/index.html / 301!",
];
for (const group of Object.values(registry.entities)) {
  for (const entity of group) {
    for (const legacyPath of entity.legacy_paths || []) {
      const destination = entity.canonical_path || (entity.product_id ? entity.canonical_path : null);
      if (destination && legacyPath !== destination) redirects.push(`${legacyPath} ${destination} 301!`);
    }
  }
}
for (const [legacyPath, destination] of Object.entries(overrides.redirects || {})) {
  if (legacyPath && destination && legacyPath !== destination) redirects.push(`${legacyPath} ${destination} 301!`);
}
redirects.push("/* /404.html 404");
fs.writeFileSync(path.join(outputDir, "_redirects"), `${[...new Set(redirects)].join("\n")}\n`);

const generatedProductFiles = allProductRows.filter(({ product }) => fs.existsSync(path.join(outputDir, ...product.canonical_path.replace(/^\/+|\/+$/g, "").split("/"), "index.html"))).length;
if (generatedProductFiles !== registry.entities.products.length) throw new Error("Not every product page was generated");

console.log(`Static site built in ${outputDir}`);
console.log(`${generatedProductFiles} product pages and ${generatedCatalogPages} catalog pages generated.`);
