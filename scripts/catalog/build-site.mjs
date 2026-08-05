import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCatalogData, normalizePhoto } from "./lib/data.mjs";
import { getPublicCategory, isVisibleCatalogItem } from "./lib/domain.mjs";
import { publicCatalogItem } from "./lib/public-copy.mjs";
import { registryIndexes, validateRegistry } from "./lib/registry.mjs";
import { breadcrumbStructuredData, buildSeoState, organizationStructuredData, productStructuredData } from "./lib/seo.mjs";

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
const seoState = buildSeoState({ registry, items, indexes, config, rules, overrides });
const organizationSchema = organizationStructuredData(config);

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
  const price = Number(String(item?.price || "").replace(/\D/g, ""));
  return price ? `от ${new Intl.NumberFormat("ru-RU").format(price)} ₽` : "Цена по запросу";
}

function deliveryLabel() {
  return "срок уточнит менеджер";
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
  const publicItem = publicCatalogItem(product, item || {});
  const title = publicItem.title;
  const publicCategory = indexes.categories.get(product.category_id)?.name || product.public_category || getPublicCategory(publicItem);
  const photo = normalizePhoto(publicItem.photos?.[0]) || fallbackPhoto(publicItem);
  const image = photo
    ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(title)}" loading="lazy" /><div class="photo-fallback" hidden>Фото уточняется</div>`
    : '<div class="photo-fallback">Фото уточняется</div>';
  return `
      <article class="part-card" data-id="${escapeHtml(publicItem.id)}">
        <a class="part-photo" href="${escapeHtml(product.canonical_path)}" data-product-link data-product-id="${escapeHtml(publicItem.id)}">${image}</a>
        <div class="part-content">
          <span class="part-category">${escapeHtml(publicCategory)}</span>
          <h3><a class="part-title-link" href="${escapeHtml(product.canonical_path)}" data-product-link data-product-id="${escapeHtml(publicItem.id)}">${escapeHtml(title)}</a></h3>
          <p class="part-description">${escapeHtml(publicItem.description)}</p>
          <div class="part-meta">
            <strong class="part-price">${escapeHtml(formatPrice(publicItem))}</strong>
            <span class="part-time">${escapeHtml(deliveryLabel())}</span>
            <button class="card-action" type="button" data-add="${escapeHtml(publicItem.id)}">В заявку</button>
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

function catalogPage({ routePath, titleParts = [], brand = null, model = null, category = null, products, brandLinks = [], modelLinks = [], categoryLinks = [] }) {
  const seo = seoState.seoByPath.get(routePath) || seoState.seoByPath.get("/catalog/");
  const pageTitle = seo.title;
  const visibleCards = products.map(({ product, item }) => productCard(product, item)).join("");
  const summary = titleParts.join(" / ") || "Все марки и категории";
  const bodyAttributes = [
    brand ? `data-catalog-brand="${escapeHtml(brand.name)}"` : "",
    model ? `data-catalog-model="${escapeHtml(model.name)}"` : "",
    category ? `data-catalog-category="${escapeHtml(category.name)}"` : "",
  ].filter(Boolean).join(" ");

  const breadcrumbItems = [
    { name: "Главная", path: "/" },
    { name: "Каталог", path: "/catalog/" },
    brand ? { name: brand.name, path: brandPath(brand) } : null,
    brand && model ? { name: model.name, path: modelPath(brand, model) } : null,
    brand && model && category ? { name: category.name, path: categoryPath(brand, model, category) } : null,
  ].filter(Boolean).filter((entry, index, entries) => index === 0 || entry.path !== entries[index - 1].path);
  const schemas = [organizationSchema, breadcrumbStructuredData(breadcrumbItems, config)];
  let html = catalogTemplate
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(pageTitle)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(seo.description)}" />`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonicalUrl(routePath)}" />`)
    .replace("</head>", `  <script type="application/ld+json">${safeJson(schemas)}</script>\n  </head>`)
    .replace("<body>", `<body ${bodyAttributes}>`)
    .replace(
      /<h1 id="catalog-title">[\s\S]*?<\/h1>/,
      routePath === "/catalog/"
        ? '<h1 id="catalog-title">Автозапчасти из Китая<br />под заказ<br />для вашего автомобиля</h1>'
        : `<h1 id="catalog-title">${escapeHtml(seo.h1)}</h1>`,
    )
    .replace('<p id="resultCount">Найдено 0 позиций</p>', `<p id="resultCount">Найдено ${products.length} позиций</p>`)
    .replace('<h2 id="resultSummary">Chery / Geely / Haval</h2>', `<h2 id="resultSummary">${escapeHtml(summary)}</h2>`)
    .replace('<div class="parts-grid" id="partsGrid"></div>', `<div class="parts-grid" id="partsGrid">${visibleCards}</div>`);
  html = replaceFilterOptions(html, "brandFilters", brandLinks);
  html = replaceFilterOptions(html, "modelFilters", modelLinks);
  html = replaceFilterOptions(html, "typeFilters", categoryLinks);
  return html;
}

function currentProductRows() {
  return registry.entities.products.map((product) => {
    const item = itemBySourceId.get(String(product.source_id)) || product.source_snapshot || null;
    return { product, item };
  });
}

const allProductRows = currentProductRows();
const publicCatalogItems = allProductRows.map(({ product, item }) => publicCatalogItem(product, item || {}));
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
const productOutputDir = path.join(catalogOutputDir, "product");
fs.mkdirSync(productOutputDir, { recursive: true });
const currentProductDirectories = new Set(allProductRows.map(({ product }) => (
  product.canonical_path.replace(/^\/catalog\/product\/|\/$/g, "")
)));
for (const entry of fs.readdirSync(productOutputDir, { withFileTypes: true })) {
  if (currentProductDirectories.has(entry.name)) continue;
  const staleTarget = path.resolve(productOutputDir, entry.name);
  if (path.dirname(staleTarget) !== productOutputDir) throw new Error(`Unsafe stale product target: ${staleTarget}`);
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
const runtimeRouteKey = (...values) => values
  .map((value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru"))
  .join("|");
const publicBrowserRoutes = { brands: {}, models: {}, categories: {} };
const publicBrowserProducts = {};
for (const brand of registry.entities.brands) {
  for (const name of new Set([brand.name, ...(brand.source_names || [])])) {
    publicBrowserRoutes.brands[runtimeRouteKey(name)] = brandPath(brand);
  }
}
for (const model of registry.entities.models) {
  const brand = indexes.brands.get(model.parent_id);
  if (!brand) continue;
  for (const brandName of new Set([brand.name, ...(brand.source_names || [])])) {
    for (const modelName of new Set([model.name, ...(model.source_names || [])])) {
      publicBrowserRoutes.models[runtimeRouteKey(brandName, modelName)] = modelPath(brand, model);
    }
  }
}
for (const product of registry.entities.products) {
  const brand = indexes.brands.get(product.brand_id);
  const model = indexes.models.get(product.model_id);
  const category = indexes.categories.get(product.category_id);
  const publicId = String(product.product_id);
  publicBrowserProducts[publicId] = {
    product_id: product.product_id,
    canonical_path: product.canonical_path,
    public_category: category?.name || product.public_category || null,
    brand_slug: brand?.slug || null,
    model_slug: model?.slug || null,
    category_slug: category?.slug || null,
    status: product.status,
    indexable: Boolean(seoState.productState.get(product.product_id)?.indexable),
  };
  if (brand && model && category) {
    publicBrowserRoutes.categories[runtimeRouteKey(brand.name, model.name, category.name)] = categoryPath(brand, model, category);
  }
}
fs.writeFileSync(
  path.join(outputDir, "kitrade-parts-data.js"),
  `window.KITRADE_PARTS = ${safeJson(publicCatalogItems)};\n`,
);
fs.writeFileSync(
  path.join(outputDir, "catalog-url-data.js"),
  `window.KITRADE_CATALOG_URLS = ${safeJson({ site_url: config.siteUrl, products: publicBrowserProducts, routes: publicBrowserRoutes })};\n`,
);
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
fs.copyFileSync(path.join(projectDir, "public", "catalog-urls.json"), path.join(outputDir, "catalog-urls.json"));
for (const filename of ["seo-map.json", "seo-map.csv"]) {
  const source = path.join(projectDir, "public", filename);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(outputDir, filename));
}
const runtimeAnalytics = { ...config.analytics, enabled: isNonProductionBuild ? false : Boolean(config.analytics?.enabled) };
fs.writeFileSync(path.join(outputDir, "site-runtime-config.js"), `window.KITRADE_SITE_CONFIG = ${safeJson({
  deploymentMode,
  basePath: publicBasePath,
  analytics: runtimeAnalytics,
})};\n`);
const sitemapUrls = [canonicalUrl("/"), canonicalUrl("/catalog/"), ...publicUrlRows.filter((row) => row.indexable).map((row) => row.canonical_url)];
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
  .sort((a, b) => a.name.localeCompare(b.name, "ru"))
  .map((brand) => ({ href: brandPath(brand), label: brand.name }));
writeRoute("/catalog/", catalogPage({ routePath: "/catalog/", products: visibleRows, brandLinks: rootBrandLinks }));

for (const [brandId, brandRows] of rowsByBrand) {
  const brand = indexes.brands.get(brandId);
  if (!brand) continue;
  const modelLinks = [...(modelsByBrand.get(brandId) || [])].map((id) => indexes.models.get(id)).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((model) => ({ href: modelPath(brand, model), label: model.name }));
  writeRoute(brandPath(brand), catalogPage({ routePath: brandPath(brand), titleParts: [brand.name], brand, products: brandRows, brandLinks: rootBrandLinks, modelLinks }));
}

for (const [modelId, modelRows] of rowsByModel) {
  const model = indexes.models.get(modelId);
  const brand = model ? indexes.brands.get(model.parent_id) : null;
  if (!brand || !model) continue;
  const categoryIds = new Set(modelRows.map(({ product }) => product.category_id).filter(Boolean));
  const categoryLinks = [...categoryIds].map((id) => indexes.categories.get(id)).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((category) => ({ href: categoryPath(brand, model, category), label: category.name }));
  writeRoute(modelPath(brand, model), catalogPage({ routePath: modelPath(brand, model), titleParts: [brand.name, model.name], brand, model, products: modelRows, brandLinks: rootBrandLinks, categoryLinks }));
}

for (const [key, categoryRows] of rowsByCategoryRoute) {
  const [brandId, modelId, categoryId] = key.split("|");
  const brand = indexes.brands.get(brandId);
  const model = indexes.models.get(modelId);
  const category = indexes.categories.get(categoryId);
  if (!brand || !model || !category) continue;
  const routePath = categoryPath(brand, model, category);
  const siblingCategoryLinks = [...new Set((rowsByModel.get(modelId) || []).map(({ product }) => product.category_id).filter(Boolean))]
    .map((id) => indexes.categories.get(id)).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((entry) => ({ href: categoryPath(brand, model, entry), label: entry.name }));
  writeRoute(routePath, catalogPage({ routePath, titleParts: [brand.name, model.name, category.name], brand, model, category, products: categoryRows, brandLinks: rootBrandLinks, categoryLinks: siblingCategoryLinks }));
}

function productPage(product, item) {
  const brand = indexes.brands.get(product.brand_id);
  const model = indexes.models.get(product.model_id);
  const category = indexes.categories.get(product.category_id);
  const publicItem = publicCatalogItem(product, item || {});
  const title = publicItem.title;
  const realPhoto = normalizePhoto(publicItem.photos?.[0]);
  const photo = realPhoto || fallbackPhoto(publicItem);
  const description = publicItem.description;
  const meta = [publicItem.brand || brand?.name, publicItem.model || model?.name, publicItem.article && `арт. ${publicItem.article}`].filter(Boolean).join(" · ");
  const crumbs = [
    ['/', 'Главная'], ['/catalog/', 'Каталог'],
    brand ? [brandPath(brand), brand.name] : null,
    brand && model ? [modelPath(brand, model), model.name] : null,
    brand && model && category ? [categoryPath(brand, model, category), category.name] : null,
  ].filter(Boolean);
  const breadcrumbHtml = crumbs.map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a><span aria-hidden="true">/</span>`).join("")
    + `<span aria-current="page">${escapeHtml(title)}</span>`;
  const state = seoState.productState.get(product.product_id);
  const seo = seoState.seoByPath.get(product.canonical_path);
  const robots = state?.indexable ? "" : '<meta name="robots" content="noindex,follow" />';
  const productData = { id: publicItem.id, title, article: publicItem.article || "" };
  const breadcrumbSchema = breadcrumbStructuredData([
    { name: "Главная", path: "/" }, { name: "Каталог", path: "/catalog/" },
    brand ? { name: brand.name, path: brandPath(brand) } : null,
    brand && model ? { name: model.name, path: modelPath(brand, model) } : null,
    brand && model && category ? { name: category.name, path: categoryPath(brand, model, category) } : null,
    { name: seo?.h1 || title, path: product.canonical_path },
  ].filter(Boolean), config);
  const schemas = state?.indexable ? [
    organizationSchema,
    breadcrumbSchema,
    productStructuredData({ product, item: publicItem, brand, model, category, seo, config, state, image: realPhoto }),
  ] : [organizationSchema];
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(seo?.title || `${title} | Китрейд`)}</title>
  <meta name="description" content="${escapeHtml(seo?.description || meta || title)}" />
  ${robots}
  <link rel="canonical" href="${canonicalUrl(product.canonical_path)}" />
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
          <strong class="product-page-price">${escapeHtml(formatPrice(publicItem))}</strong>
          <button class="product-page-request" type="button" data-product-request>Добавить в заявку</button>
        </div>
      </article>
    </div>
  </main>
  <script id="product-page-data" type="application/json">${safeJson(productData)}</script>
  <script src="/site-runtime-config.js?v=1"></script>
  <script src="/analytics.js?v=1"></script>
  <script src="/product-page.js?v=2"></script>
</body>
</html>`;
}

for (const { product, item } of allProductRows) writeRoute(product.canonical_path, productPage(product, item));

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
redirects.push("/* /404.html 404");
fs.writeFileSync(path.join(outputDir, "_redirects"), `${[...new Set(redirects)].join("\n")}\n`);

const generatedProductFiles = allProductRows.filter(({ product }) => fs.existsSync(path.join(outputDir, ...product.canonical_path.replace(/^\/+|\/+$/g, "").split("/"), "index.html"))).length;
if (generatedProductFiles !== registry.entities.products.length) throw new Error("Not every product page was generated");

console.log(`Static site built in ${outputDir}`);
console.log(`${generatedProductFiles} product pages and ${1 + rowsByBrand.size + rowsByModel.size + rowsByCategoryRoute.size} catalog pages generated.`);
