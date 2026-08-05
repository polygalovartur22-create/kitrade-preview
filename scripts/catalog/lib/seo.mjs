import crypto from "node:crypto";
import { catalogCode, publicCatalogItem } from "./public-copy.mjs";

const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const norm = (value) => clean(value).toLocaleLowerCase("ru").replaceAll("ё", "е");
const numericPrice = (value) => Number(String(value ?? "").replace(/[^\d.,]/g, "").replace(",", ".")) || 0;

export function fillTemplate(template, values) {
  return String(template || "").replace(/\{([a-z_]+)\}/g, (_, key) => clean(values[key]));
}

export function routePaths(indexes) {
  const brand = (entry) => `/catalog/${entry.slug}/`;
  const model = (brandEntry, modelEntry) => `${brand(brandEntry)}${modelEntry.slug}/`;
  const category = (brandEntry, modelEntry, categoryEntry) => `${model(brandEntry, modelEntry)}${categoryEntry.slug}/`;
  return { brand, model, category };
}

function structuredProductFingerprint(item, product) {
  const fields = [
    item?.title || product.name,
    item?.brand,
    item?.model,
    product.category_id,
    item?.article,
    item?.condition,
    item?.origin,
    numericPrice(item?.price),
    item?.compatibility,
    item?.side,
    item?.detail,
    item?.yearFrom,
    item?.yearTo,
  ];
  return crypto.createHash("sha256").update(fields.map(norm).join("|")).digest("hex").slice(0, 24);
}

function itemCondition(value) {
  const condition = norm(value);
  if (!condition) return "";
  if (condition.startsWith("нов")) return "https://schema.org/NewCondition";
  if (condition.includes("б/у") || condition.includes("бу") || condition.includes("used")) return "https://schema.org/UsedCondition";
  return "";
}

function validatedOrigin(value) {
  const origin = clean(value);
  return !origin || ["не знаю", "unknown"].includes(norm(origin)) ? "" : origin;
}

function truncate(value, max = 158) {
  const text = clean(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[.,;:!?-]+$/, "");
  return `${cut}.`;
}

function shorten(value, max) {
  const text = clean(value);
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "").replace(/[.,;:!?/-]+$/, "");
}

function productSeo(product, item, brand, model, category, rules) {
  const publicItem = publicCatalogItem(product, item || {});
  const price = numericPrice(item?.price);
  const publicCode = catalogCode(product);
  const condition = clean(publicItem.condition);
  const origin = validatedOrigin(publicItem.origin);
  const values = {
    product_name: publicItem.title,
    condition_clause: condition ? `, состояние: ${condition}` : "",
    origin_clause: origin ? `, происхождение: ${origin}` : "",
    price: price ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(price) : "",
  };
  const h1 = values.product_name;
  const title = `${shorten(h1, 39)} | Купить под заказ — Китрейд`;
  const suffixParts = [
    `Код KITRADE: ${publicCode}`,
    condition ? `Состояние: ${condition}` : "",
    origin ? `Происхождение: ${origin}` : "",
    price ? `Цена детали ${values.price} ₽` : "",
    "Проверка совместимости по VIN",
  ].filter(Boolean);
  while (suffixParts.join(". ").length > 92 && suffixParts.length > 2) suffixParts.splice(suffixParts.length - 3, 1);
  const suffix = `${suffixParts.join(". ")}.`;
  const description = `${shorten(values.product_name, Math.max(36, 156 - suffix.length))}. ${suffix}`;
  return { h1, title, description, price, catalogCode: publicCode, productName: publicItem.title, condition, origin, itemCondition: itemCondition(condition) };
}

function routeSeo(type, values, rules) {
  const templates = rules.templates[type];
  return {
    title: fillTemplate(templates.title, values),
    description: truncate(fillTemplate(templates.description, values)),
    h1: fillTemplate(templates.h1, values),
  };
}

function dedupeText(rows, field) {
  const groups = new Map();
  for (const row of rows.filter((entry) => entry.indexable)) {
    const key = norm(row[field]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.forEach((row, index) => {
      if (index === 0) return;
      const suffix = ` — ${clean(row.catalog_code) || `KT-${row.entity_id}`}`;
      if (field === "description") {
        const marker = suffix.replace(/^ — /, "");
        row[field] = `${truncate(row[field], Math.max(80, 156 - marker.length)).replace(/\.$/, "")} ${marker}.`;
      } else if (field === "title") {
        row[field] = `${shorten(row[field], Math.max(35, 74 - suffix.length))}${suffix}`;
      } else {
        row[field] = `${row[field]}${suffix}`;
      }
    });
  }
}

export function buildSeoState({ registry, items, indexes, config, rules }) {
  const itemBySourceId = new Map(items.map((item) => [String(item.id), item]));
  const paths = routePaths(indexes);
  const products = registry.entities.products.map((product) => ({
    product,
    item: itemBySourceId.get(String(product.source_id)) || product.source_snapshot || null,
  }));

  const duplicateGroups = new Map();
  for (const row of products.filter(({ product }) => product.status === "active")) {
    const key = structuredProductFingerprint(row.item, row.product);
    if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
    duplicateGroups.get(key).push(row);
  }
  const duplicateSecondaryIds = new Set();
  const duplicateReport = [];
  for (const [fingerprint, rows] of duplicateGroups) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => Number(a.product.product_id) - Number(b.product.product_id));
    const primary = rows[0].product;
    for (const row of rows.slice(1)) duplicateSecondaryIds.add(row.product.product_id);
    duplicateReport.push({
      fingerprint,
      primary_product_id: primary.product_id,
      primary_url: primary.canonical_path,
      duplicate_product_ids: rows.slice(1).map(({ product }) => product.product_id),
      duplicate_urls: rows.slice(1).map(({ product }) => product.canonical_path),
      action: "manual_review_no_automatic_merge",
    });
  }

  const productState = new Map();
  for (const { product, item } of products) {
    const validationErrors = [];
    if (product.status !== "active") validationErrors.push(product.status);
    if (!product.brand_id) validationErrors.push("missing_brand");
    if (!product.model_id) validationErrors.push("missing_model");
    if (!product.category_id) validationErrors.push("missing_category");
    if (duplicateSecondaryIds.has(product.product_id)) validationErrors.push("full_duplicate");
    const indexable = validationErrors.length === 0;
    productState.set(product.product_id, {
      indexable,
      robots: indexable ? "index,follow" : "noindex,follow",
      validationErrors,
      item,
      duplicateOf: duplicateReport.find((group) => group.duplicate_product_ids.includes(product.product_id))?.primary_product_id || null,
    });
  }

  const activeProducts = products.filter(({ product }) => productState.get(product.product_id).indexable);
  const brandCounts = new Map();
  const modelCounts = new Map();
  const categoryRouteCounts = new Map();
  for (const { product } of activeProducts) {
    brandCounts.set(product.brand_id, (brandCounts.get(product.brand_id) || 0) + 1);
    modelCounts.set(product.model_id, (modelCounts.get(product.model_id) || 0) + 1);
    const key = `${product.brand_id}:${product.model_id}:${product.category_id}`;
    categoryRouteCounts.set(key, (categoryRouteCounts.get(key) || 0) + 1);
  }

  const seoRows = [];
  const add = (row) => seoRows.push({
    page_type: row.page_type,
    entity_id: String(row.entity_id),
    canonical_path: row.canonical_path,
    canonical_url: new URL(row.canonical_path, `${config.siteUrl}/`).href,
    brand: row.brand || "",
    brand_variants: row.brand_variants || [],
    model: row.model || "",
    model_variants: row.model_variants || [],
    category: row.category || "",
    product_name: row.product_name || "",
    product_id: row.product_id || "",
    catalog_code: row.catalog_code || "",
    article_oem: row.article_oem || "",
    condition: row.condition || "",
    primary_query: row.primary_query || row.h1,
    secondary_queries: row.secondary_queries || [],
    search_intent: row.search_intent || "commercial",
    title: row.title,
    description: row.description,
    h1: row.h1,
    intro_text: row.intro_text || "",
    faq: row.faq || [],
    indexable: Boolean(row.indexable),
    robots: row.robots || (row.indexable ? "index,follow" : "noindex,follow"),
    status: row.status || (row.indexable ? "active" : "excluded"),
    validation_errors: row.validation_errors || [],
  });

  add({
    page_type: "home", entity_id: "home", canonical_path: "/", indexable: true,
    title: "KITRADE — автозапчасти из Китая с доставкой по России",
    description: "Найдём автозапчасть у поставщиков в Китае, проверим перед отправкой и доставим в ваш город по России.",
    h1: "Автозапчасти из Китая с доставкой по всей России",
    primary_query: "автозапчасти из Китая", secondary_queries: ["доставка автозапчастей из Китая"],
  });
  add({
    page_type: "catalog", entity_id: "catalog", canonical_path: "/catalog/", indexable: true,
    ...rules.templates.catalog,
    primary_query: "каталог автозапчастей из Китая",
    secondary_queries: ["автозапчасти под заказ", "подбор запчастей по VIN"],
    intro_text: "Каталог деталей под заказ из Китая с обязательной проверкой совместимости по VIN.",
    faq: [{ question: "Как проверить совместимость детали?", answer: "Совместимость подтверждается менеджером по VIN перед заказом." }],
  });

  for (const brand of registry.entities.brands) {
    const count = brandCounts.get(brand.id) || 0;
    const seo = routeSeo("brand", { brand: brand.name }, rules);
    add({ page_type: "brand", entity_id: brand.id, canonical_path: paths.brand(brand), brand: brand.name,
      brand_variants: brand.source_names || [brand.name], indexable: count > 0, status: count ? "active" : "unlisted",
      validation_errors: count ? [] : ["no_verified_active_products"], ...seo,
      primary_query: `запчасти ${brand.name}`, secondary_queries: [`автозапчасти ${brand.name}`, `детали ${brand.name} из Китая`],
      intro_text: `Запчасти ${brand.name} под заказ из Китая с проверкой совместимости по VIN.`,
      faq: [{ question: `Как подобрать запчасть для ${brand.name}?`, answer: "Перед заказом совместимость детали проверяется по VIN." }],
    });
  }

  for (const model of registry.entities.models) {
    const brand = indexes.brands.get(model.parent_id);
    if (!brand) continue;
    const count = modelCounts.get(model.id) || 0;
    const seo = routeSeo("model", { brand: brand.name, model: model.name }, rules);
    add({ page_type: "model", entity_id: model.id, canonical_path: paths.model(brand, model), brand: brand.name, model: model.name,
      brand_variants: brand.source_names || [brand.name], model_variants: model.source_names || [model.name],
      indexable: count > 0, status: count ? "active" : "unlisted", validation_errors: count ? [] : ["no_verified_active_products"], ...seo,
      primary_query: `запчасти ${brand.name} ${model.name}`, secondary_queries: [`детали ${brand.name} ${model.name}`, `${brand.name} ${model.name} запчасти из Китая`],
      intro_text: `Каталог запчастей для ${brand.name} ${model.name} под заказ из Китая.`,
      faq: [{ question: `Как проверить деталь для ${brand.name} ${model.name}?`, answer: "Совместимость подтверждается менеджером по VIN перед заказом." }],
    });
  }

  for (const [entityId, count] of categoryRouteCounts) {
    const [brandId, modelId, categoryId] = entityId.split(":");
    const brand = indexes.brands.get(brandId);
    const model = indexes.models.get(modelId);
    const category = indexes.categories.get(categoryId);
    if (!brand || !model || !category) continue;
    const seo = routeSeo("category", { brand: brand.name, model: model.name, category: category.name }, rules);
    add({ page_type: "category", entity_id: entityId, canonical_path: paths.category(brand, model, category), brand: brand.name,
      model: model.name, category: category.name, brand_variants: brand.source_names || [brand.name], model_variants: model.source_names || [model.name],
      indexable: count > 0, status: "active", ...seo,
      primary_query: `${category.name} ${brand.name} ${model.name}`,
      secondary_queries: [`купить ${category.name.toLocaleLowerCase("ru")} ${brand.name} ${model.name}`],
      intro_text: `${category.name} для ${brand.name} ${model.name} под заказ из Китая.`,
      faq: [{ question: "Как проверить совместимость?", answer: "Совместимость конкретной детали проверяется по VIN перед заказом." }],
    });
  }

  for (const { product, item } of products) {
    const state = productState.get(product.product_id);
    if (!state.indexable) continue;
    const brand = indexes.brands.get(product.brand_id);
    const model = indexes.models.get(product.model_id);
    const category = indexes.categories.get(product.category_id);
    const seo = productSeo(product, item, brand, model, category, rules);
    add({ page_type: "product", entity_id: product.product_id, canonical_path: product.canonical_path,
      brand: brand?.name, model: model?.name, category: category?.name, product_name: seo.productName,
      product_id: product.product_id, catalog_code: seo.catalogCode, article_oem: "", condition: seo.condition, indexable: true,
      title: seo.title, description: seo.description, h1: seo.h1,
      primary_query: seo.productName,
      secondary_queries: [`${seo.productName} ${seo.catalogCode}`, `${seo.productName} цена`],
      intro_text: "", faq: [],
    });
  }

  for (const field of ["title", "description", "h1"]) dedupeText(seoRows, field);
  const seoByPath = new Map(seoRows.map((row) => [row.canonical_path, row]));

  const needsReview = products.filter(({ product }) => product.status === "needs_review").map(({ product, item }) => ({
    product_id: product.product_id, source_id: product.source_id, title: item?.title || product.name,
    brand: item?.brand || "", model: item?.model || "", canonical_path: product.canonical_path,
    status: "unlisted", robots: "noindex,follow", action: "manual_review_required",
    reasons: productState.get(product.product_id).validationErrors,
  }));
  const imageReport = products.filter(({ item }) => !item?.photos?.length || (item.photos || []).some((url) => /avito/i.test(String(url))))
    .map(({ product, item }) => ({
      product_id: product.product_id, source_id: product.source_id, canonical_path: product.canonical_path,
      has_image: Boolean(item?.photos?.length), image_source: (item?.photos || []).some((url) => /avito/i.test(String(url))) ? "avito_external" : "missing",
      watermark_check: "manual_review_required", cropping_check: "manual_review_required",
      action: item?.photos?.length ? "confirm_rights_and_visual_quality" : "provide_real_product_photo",
    }));

  const currentSourceIds = new Set(items.map((item) => String(item.id)));
  const unlisted = registry.entities.products.filter((product) => product.status === "unlisted" && !currentSourceIds.has(String(product.source_id)));
  const probableMatches = [];
  for (const item of items) {
    const current = indexes.productsBySourceId.get(String(item.id));
    if (!current || (current.source_aliases || []).length) continue;
    for (const old of unlisted) {
      const snapshot = old.source_snapshot || {};
      const articleMatch = clean(item.article) && norm(item.article) === norm(snapshot.article) && norm(item.brand) === norm(snapshot.brand);
      const titleMatch = norm(item.title) === norm(snapshot.title) && norm(item.brand) === norm(snapshot.brand) && norm(item.model) === norm(snapshot.model);
      if (!articleMatch && !titleMatch) continue;
      probableMatches.push({ new_source_id: String(item.id), new_product_id: current.product_id, existing_source_id: old.source_id,
        existing_product_id: old.product_id, match_reason: articleMatch ? "same_article_and_brand" : "same_title_brand_model",
        action: "manual_decision_required_no_automatic_merge" });
    }
  }

  const variants = {
    approval_status: "pending_owner_approval",
    note: "Variants never change public display names. Empty Russian spellings require manual approval and are not guessed.",
    brands: registry.entities.brands.map((entry) => ({ entity_id: entry.id, canonical: entry.name,
      russian_spelling: /[А-ЯЁ]/i.test(entry.name) ? entry.name : null, transliteration: entry.slug,
      alternatives: [...new Set((entry.source_names || []).filter((name) => norm(name) !== norm(entry.name)))], approval_status: "pending" })),
    models: registry.entities.models.map((entry) => ({ entity_id: entry.id, canonical: entry.name,
      russian_spelling: /[А-ЯЁ]/i.test(entry.name) ? entry.name : null, transliteration: entry.slug,
      alternatives: [...new Set((entry.source_names || []).filter((name) => norm(name) !== norm(entry.name)))], approval_status: "pending" })),
  };

  return { seoRows, seoByPath, productState, duplicateReport, needsReview, imageReport, probableMatches, variants, activeProducts };
}

export function productStructuredData({ product, item, brand, model, category, seo, config, state, image }) {
  const offer = {
    "@type": "Offer", url: new URL(product.canonical_path, `${config.siteUrl}/`).href,
    priceCurrency: "RUB", price: numericPrice(item?.price), availability: "https://schema.org/PreOrder",
  };
  const condition = itemCondition(item?.condition);
  if (condition) offer.itemCondition = condition;
  const schema = {
    "@context": "https://schema.org", "@type": "Product", name: seo?.h1 || item?.title || product.name,
    sku: catalogCode(product), url: offer.url, offers: offer,
  };
  if (brand?.name) schema.brand = { "@type": "Brand", name: brand.name };
  if (category?.name) schema.category = category.name;
  if (model?.name) schema.model = model.name;
  if (image && !/01-catalog|02-catalog|03-catalog|placeholder|fallback/i.test(image)) schema.image = [image];
  if (!state.indexable) schema.potentialAction = undefined;
  return schema;
}

export function organizationStructuredData(config) {
  const organization = config.organization || {};
  return {
    "@context": "https://schema.org", "@type": organization.schemaType || "Organization",
    "@id": `${config.siteUrl}/#organization`, name: organization.name, legalName: organization.legalName,
    url: `${config.siteUrl}/`, email: organization.email, telephone: organization.telephone,
    address: organization.address ? { "@type": "PostalAddress", ...organization.address } : undefined,
  };
}

export function breadcrumbStructuredData(items, config) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1,
      name: item.name, item: new URL(item.path, `${config.siteUrl}/`).href })),
  };
}

export function toCsv(rows) {
  if (!rows.length) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => {
    const flat = Array.isArray(value) || (value && typeof value === "object") ? JSON.stringify(value) : String(value ?? "");
    return `"${flat.replaceAll('"', '""')}"`;
  };
  return `${columns.map(escape).join(",")}\n${rows.map((row) => columns.map((column) => escape(row[column])).join(",")).join("\n")}\n`;
}
