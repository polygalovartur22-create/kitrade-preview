import crypto from "node:crypto";
import { buildProductTitle, createProductContent, normalizePublicName, numericPrice, schemaCondition } from "./product-content.mjs";
import { deriveWordstatPriorities } from "./wordstat.mjs";

const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const norm = (value) => clean(value).toLocaleLowerCase("ru").replaceAll("ё", "е");
const sentenceCase = (value) => {
  const text = clean(value);
  return text ? `${text[0].toLocaleUpperCase("ru")}${text.slice(1)}` : "";
};

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
  const serialized = fields.map((value) => (
    value && typeof value === "object" ? JSON.stringify(value) : norm(value)
  ));
  return crypto.createHash("sha256").update(serialized.join("|")).digest("hex").slice(0, 24);
}

function duplicateFacts(item, product) {
  return {
    product_id: product.product_id,
    source_id: product.source_id,
    canonical_path: product.canonical_path,
    title: clean(item?.title || product.name),
    detail: clean(item?.detail),
    brand: clean(item?.brand),
    model: clean(item?.model),
    category_id: product.category_id || "",
    oem: clean(item?.article),
    price: numericPrice(item?.price),
    condition: clean(item?.condition),
    origin: clean(item?.origin),
    photos: item?.photos || [],
    compatibility: item?.compatibility || [],
    side: clean(item?.side),
    generation: clean(item?.generation),
    year_from: item?.yearFrom || null,
    year_to: item?.yearTo || null,
  };
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
  let shortened = text.slice(0, max).replace(/\s+\S*$/, "").replace(/[.,;:!?/-]+$/, "");
  while ((shortened.match(/\(/g) || []).length > (shortened.match(/\)/g) || []).length) {
    shortened = shortened.slice(0, shortened.lastIndexOf("(")).trim();
  }
  return shortened || text.slice(0, max).trim();
}

function fitTitle(value, max = 75) {
  const text = clean(value);
  if (text.length <= max) return text;
  const suffixMatch = text.match(/\s+\|\s+(?:KITRADE|Китрейд)$/i);
  const suffix = suffixMatch?.[0] || "";
  const body = suffix ? text.slice(0, -suffix.length) : text;
  return `${shorten(body, Math.max(24, max - suffix.length))}${suffix}`;
}

function contentOverrides(overrides, product) {
  return {
    ...(overrides.normalization || {}),
    ...(overrides.products?.[String(product.source_id)] || overrides.products?.[String(product.product_id)] || {}),
  };
}

function productSeo(product, item, brand, model, category, overrides, preparedContent = null) {
  const content = preparedContent || createProductContent({ item, product, brand, model, category, overrides });
  const description = truncate(`Цена указана за деталь; доставка рассчитывается отдельно. Проверка по VIN. ${content.h1}${content.article ? `. OEM ${content.article}` : ""}.`, 158);
  return { ...content, description };
}

function yearRange(item) {
  const from = Number(item?.yearFrom) || 0;
  const to = Number(item?.yearTo) || 0;
  if (from && to) return from === to ? String(from) : `${from}–${to}`;
  if (from) return `с ${from}`;
  if (to) return `до ${to}`;
  return "";
}

function addContentQualifier(content, qualifier) {
  const detail = clean(`${content.detail}, ${qualifier}`);
  const h1 = normalizePublicName(`${detail} ${content.vehicle}`);
  const titleQualifier = /рестайлинг/iu.test(qualifier)
    ? "рестайлинг"
    : qualifier.match(/поколение\s+([IVX]+)/iu)?.[1] ? `${qualifier.match(/поколение\s+([IVX]+)/iu)[1]} поколения` : qualifier;
  const title = buildProductTitle({ detail: content.detail, vehicleNames: content.vehicleNames, article: content.article, qualifier: titleQualifier });
  return { ...content, detail, h1, title };
}

function titleFromContent(content) {
  return buildProductTitle({ detail: content.detail, vehicleNames: content.vehicleNames, article: content.article });
}

function comparisonFields(facts) {
  const fields = ["title", "detail", "brand", "model", "category_id", "oem", "price", "condition", "origin", "photos", "compatibility", "side", "generation", "year_from", "year_to"];
  const matching = fields.filter((field) => new Set(facts.map((entry) => JSON.stringify(entry[field]))).size === 1);
  return { matching, differing: fields.filter((field) => !matching.includes(field)) };
}

function routeSeo(type, values, rules) {
  const templates = rules.templates[type];
  return {
    title: fillTemplate(templates.title, values),
    description: truncate(fillTemplate(templates.description, values)),
    h1: fillTemplate(templates.h1, values),
  };
}

function directModelEntry(directSemantics, brand, model) {
  const exact = directSemantics.models?.[`${norm(brand.name)}|${norm(model.name)}`];
  if (exact) return exact;
  const aliases = {
    "polar stone (jishi)|01": ["polar stone/jishi|01"],
    "changan|auchan z6": ["changan|oshan z6"],
    "exeed|exlantix es": ["exlantix|es"],
    "fang cheng bao|bao 5 (leopard 5)": ["fangchengbao|bao 5"],
    "fang cheng bao|titanium 7": ["fangchengbao|titanium 7"],
  };
  const key = `${norm(brand.name)}|${norm(model.name)}`;
  return (aliases[key] || []).map((alias) => directSemantics.models?.[alias]).find(Boolean) || null;
}

export function normalizePublicQuery(value) {
  return normalizePublicName(clean(value)
    .replace(/\b(?:BYD\s+)?Fang\s*Cheng\s*Bao\s+Titanium\s*7\b/gi, "Fang Cheng Bao Titanium 7")
    .replace(/\bBYD\s+Leopard\s*7\b/gi, "Fang Cheng Bao Titanium 7")
    .replace(/\bBYD\s+Fang\s*Cheng\s*Bao\b/gi, "Fang Cheng Bao")
    .replace(/\bFangChengBao\b/gi, "Fang Cheng Bao")
    .replace(/(?:Fang Cheng Bao\s+){2,}/gi, "Fang Cheng Bao ")
    .replace(/Fang Cheng Bao\s+Fang Cheng Bao/gi, "Fang Cheng Bao")
    .replace(/\(Leopard 5\)\s*\(Leopard 5\)/gi, "(Leopard 5)"));
}

function normalizeSecondaryQuery(value) {
  const text = clean(value);
  return /Bao Bao|Polar Polar|\(Leopard 5\)\s*\(Leopard 5\)/iu.test(text) ? normalizePublicQuery(text) : text;
}

function restorePrimaryOem(value, article) {
  const text = clean(value);
  const sourceArticle = clean(article);
  if (!sourceArticle || text.includes(sourceArticle)) return text;
  const normalizedArticle = normalizePublicName(sourceArticle);
  return normalizedArticle && text.includes(normalizedArticle) ? text.replace(normalizedArticle, sourceArticle) : text;
}

export function buildSeoState({ registry, items, indexes, config, rules, overrides = {}, directSemantics = {}, wordstatAudit = {}, imageObservations = {} }) {
  const wordstatPriorities = deriveWordstatPriorities(wordstatAudit);
  const itemBySourceId = new Map(items.map((item) => [String(item.id), item]));
  const paths = routePaths(indexes);
  const products = registry.entities.products.map((product) => ({
    product,
    item: itemBySourceId.get(String(product.source_id)) || product.source_snapshot || null,
  }));
  const oemManualProductIds = new Set((overrides.oem_manual_confirmation_groups || []).flat().map(Number));

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
    rows.sort((a, b) => numericPrice(b.item?.price) - numericPrice(a.item?.price)
      || Number(a.product.product_id) - Number(b.product.product_id));
    const primary = rows[0].product;
    for (const row of rows.slice(1)) duplicateSecondaryIds.add(row.product.product_id);
    const facts = rows.map(({ item, product }) => duplicateFacts(item, product));
    const comparedFields = ["title", "detail", "brand", "model", "category_id", "oem", "price", "condition", "origin", "photos", "compatibility", "side", "generation", "year_from", "year_to"];
    const matchingFields = comparedFields.filter((field) => new Set(facts.map((entry) => JSON.stringify(entry[field]))).size === 1);
    const differingFields = comparedFields.filter((field) => !matchingFields.includes(field));
    duplicateReport.push({
      fingerprint,
      classification: "confirmed_full_duplicate",
      primary: facts[0],
      secondary_pages: facts.slice(1).map((entry) => ({
        ...entry,
        robots: "noindex,follow",
        canonical_path_target: primary.canonical_path,
        reason: "Все подтверждённые идентификационные поля совпадают с основной страницей.",
      })),
      matching_fields: matchingFields,
      differing_fields: differingFields,
      action: "secondary_noindex_canonical_to_primary",
      primary_product_id: primary.product_id,
      primary_url: primary.canonical_path,
      duplicate_product_ids: rows.slice(1).map(({ product }) => product.product_id),
      duplicate_urls: rows.slice(1).map(({ product }) => product.canonical_path),
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
    const brand = indexes.brands.get(product.brand_id);
    const model = indexes.models.get(product.model_id);
    const category = indexes.categories.get(product.category_id);
    const productOverride = contentOverrides(overrides, product);
    if (oemManualProductIds.has(Number(product.product_id))) {
      productOverride.article = "";
      productOverride.article_status = "needs_manual_confirmation";
    }
    const content = createProductContent({ item, product, brand, model, category, overrides: productOverride });
    productState.set(product.product_id, {
      indexable,
      robots: indexable ? "index,follow" : "noindex,follow",
      validationErrors,
      item,
      content,
      duplicateOf: duplicateReport.find((group) => group.duplicate_product_ids.includes(product.product_id))?.primary_product_id || null,
      canonicalPath: duplicateReport.find((group) => group.duplicate_product_ids.includes(product.product_id))?.primary_url || product.canonical_path,
    });
  }

  // Owner-confirmed duplicates are authoritative even when their public titles use
  // different word order and therefore never enter the metadata-collision groups.
  for (const [decisionKey, decision] of Object.entries(overrides.duplicate_decisions || {})) {
    if (decision?.action !== "canonical_duplicate") continue;
    const decisionIds = decisionKey.split("|").map(Number).filter(Number.isInteger);
    const decisionRows = decisionIds
      .map((productId) => products.find(({ product }) => Number(product.product_id) === productId))
      .filter(Boolean);
    if (decisionRows.length !== decisionIds.length || decisionRows.length < 2) {
      throw new Error(`Owner duplicate decision ${decisionKey} does not resolve to at least two catalog products`);
    }
    const primaryProductId = Number(decision.primary_product_id);
    const primaryIndex = decisionRows.findIndex(({ product }) => Number(product.product_id) === primaryProductId);
    if (primaryIndex < 0) throw new Error(`Owner duplicate decision ${decisionKey} has an invalid primary product`);
    const [primaryRow] = decisionRows.splice(primaryIndex, 1);
    const orderedRows = [primaryRow, ...decisionRows];
    const facts = orderedRows.map(({ item, product }) => duplicateFacts(item, product));
    const { matching, differing } = comparisonFields(facts);
    const primaryState = productState.get(primaryRow.product.product_id);
    const secondaries = orderedRows.slice(1).map(({ product }, index) => {
      const state = productState.get(product.product_id);
      state.indexable = false;
      state.robots = "noindex,follow";
      state.duplicateOf = primaryRow.product.product_id;
      state.canonicalPath = primaryRow.product.canonical_path;
      if (!state.validationErrors.includes("confirmed_owner_duplicate")) state.validationErrors.push("confirmed_owner_duplicate");
      return {
        ...facts[index + 1],
        robots: state.robots,
        canonical_path_target: state.canonicalPath,
        reason: decision.reason || "The owner confirmed that this is the same physical catalog position as the primary product.",
      };
    });
    duplicateReport.push({
      fingerprint: crypto.createHash("sha256").update(`owner|${decisionKey}`).digest("hex").slice(0, 24),
      classification: "confirmed_owner_duplicate",
      primary: facts[0],
      secondary_pages: secondaries,
      matching_fields: matching,
      differing_fields: differing,
      action: "secondary_noindex_canonical_to_primary",
      owner_decision: decision,
      primary_product_id: primaryRow.product.product_id,
      primary_url: primaryRow.product.canonical_path,
      duplicate_product_ids: orderedRows.slice(1).map(({ product }) => product.product_id),
      duplicate_urls: orderedRows.slice(1).map(({ product }) => product.canonical_path),
    });
    primaryState.content.title = titleFromContent(primaryState.content);
  }

  const currentlyIndexable = () => products.filter(({ product }) => productState.get(product.product_id)?.indexable);
  const groupsBy = (selector) => {
    const groups = new Map();
    for (const row of currentlyIndexable()) {
      const key = norm(selector(row, productState.get(row.product.product_id)));
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return [...groups.values()].filter((rows) => rows.length > 1);
  };

  // A shortened SEO title may hide a real distinction that is already present in H1.
  // Rebuild only those colliding titles from the full H1, keeping public data factual.
  for (const rows of groupsBy((row, state) => state.content.title)) {
    const distinctH1 = new Set(rows.map(({ product }) => norm(productState.get(product.product_id).content.h1)));
    if (distinctH1.size !== rows.length) continue;
    for (const { product } of rows) {
      const state = productState.get(product.product_id);
      state.content.title = titleFromContent(state.content);
    }
  }

  // If H1 really is the same, use only confirmed condition or generation/year data.
  for (const rows of groupsBy((row, state) => state.content.title)) {
    const states = rows.map(({ product }) => productState.get(product.product_id));
    const conditions = states.map((state) => clean(state.content.condition));
    const generationLabels = rows.map(({ item }) => clean([
      item?.generation && `поколение ${item.generation}`,
      yearRange(item),
    ].filter(Boolean).join(", ")));
    const conditionIsUseful = conditions.every(Boolean) && new Set(conditions.map(norm)).size === rows.length;
    const generationIsUseful = generationLabels.every(Boolean) && new Set(generationLabels.map(norm)).size === rows.length;
    if (!conditionIsUseful && !generationIsUseful) continue;
    rows.forEach(({ product }, index) => {
      const qualifier = conditionIsUseful ? conditions[index].toLocaleLowerCase("ru") : generationLabels[index];
      const state = productState.get(product.product_id);
      state.content = addContentQualifier(state.content, qualifier);
    });
  }

  // Remaining metadata collisions are either confirmed duplicates (valid OEM present)
  // or conservative manual-review candidates (OEM absent). Both pages stay accessible.
  for (const rows of groupsBy((row, state) => state.content.title)) {
    const decisionKey = rows.map(({ product }) => Number(product.product_id)).sort((a, b) => a - b).join("|");
    const ownerDecision = overrides.duplicate_decisions?.[decisionKey] || null;
    rows.sort((left, right) => {
      if (ownerDecision?.primary_product_id) {
        if (Number(left.product.product_id) === Number(ownerDecision.primary_product_id)) return -1;
        if (Number(right.product.product_id) === Number(ownerDecision.primary_product_id)) return 1;
      }
      return Number(left.product.product_id) - Number(right.product.product_id);
    });
    const primaryRow = rows[0];
    const primaryState = productState.get(primaryRow.product.product_id);
    const facts = rows.map(({ item, product }) => duplicateFacts(item, product));
    const { matching, differing } = comparisonFields(facts);
    const articles = rows.map(({ product }) => clean(productState.get(product.product_id).content.article));
    const confirmedByOwner = ownerDecision?.action === "canonical_duplicate";
    const separateByOwner = ownerDecision?.action === "keep_separate";
    const manualReview = ownerDecision?.action === "manual_review";
    const materialFields = ["detail", "condition", "origin", "compatibility", "side", "generation", "year_from", "year_to"];
    const hasMaterialDifference = materialFields.some((field) => differing.includes(field));
    const confirmed = confirmedByOwner || (!separateByOwner && !manualReview && !hasMaterialDifference
      && articles.every(Boolean) && new Set(articles.map(norm)).size === 1);
    const fingerprint = crypto.createHash("sha256")
      .update(rows.map(({ product }) => product.product_id).join("|"))
      .digest("hex").slice(0, 24);
    const secondaries = [];
    for (let index = 1; index < rows.length; index += 1) {
      const { product } = rows[index];
      const state = productState.get(product.product_id);
      state.indexable = separateByOwner || manualReview;
      state.robots = (separateByOwner || manualReview) ? "index,follow" : "noindex,follow";
      state.duplicateOf = confirmed ? primaryRow.product.product_id : null;
      state.canonicalPath = confirmed ? primaryRow.product.canonical_path : product.canonical_path;
      if (!separateByOwner && !manualReview) {
        state.validationErrors.push(confirmed ? "confirmed_metadata_duplicate" : "metadata_duplicate_needs_manual_review");
      }
      secondaries.push({
        ...facts[index],
        robots: state.robots,
        canonical_path_target: state.canonicalPath,
        reason: confirmed
          ? ownerDecision?.reason || "Confirmed detail, vehicle, OEM, condition and compatibility match the primary page."
          : ownerDecision?.reason || "The public metadata collides, but no verified OEM is available; manual identity review is required.",
      });
    }
    duplicateReport.push({
      fingerprint,
      classification: confirmed
        ? (confirmedByOwner ? "confirmed_owner_duplicate" : "confirmed_metadata_duplicate")
        : ((separateByOwner || manualReview) ? "distinct_products_pending_metadata" : "pending_manual_identity_review"),
      primary: facts[0],
      secondary_pages: secondaries,
      matching_fields: matching,
      differing_fields: differing,
      action: confirmed
        ? "secondary_noindex_canonical_to_primary"
        : ((separateByOwner || manualReview) ? "owner_kept_separate_index_self_canonical" : "secondary_noindex_self_canonical_pending_review"),
      owner_decision: ownerDecision || null,
      primary_product_id: primaryRow.product.product_id,
      primary_url: primaryRow.product.canonical_path,
      duplicate_product_ids: rows.slice(1).map(({ product }) => product.product_id),
      duplicate_urls: rows.slice(1).map(({ product }) => product.canonical_path),
    });
    primaryState.content.title = titleFromContent(primaryState.content);
  }

  const ownerSeparatedProductIds = new Set(
    Object.entries(overrides.duplicate_decisions || {})
      .filter(([, decision]) => decision?.action === "keep_separate" && decision?.use_price_qualifier !== false)
      .flatMap(([key]) => key.split("|").map(Number)),
  );
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
  for (const { product } of products) {
    if (!overrides.needs_review_products?.[String(product.product_id)]) continue;
    const key = `${product.brand_id}:${product.model_id}:${product.category_id}`;
    if (product.brand_id && product.model_id && product.category_id && !categoryRouteCounts.has(key)) {
      categoryRouteCounts.set(key, 0);
    }
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
    article_oem: row.article_oem || "",
    condition: row.condition || "",
    primary_query: restorePrimaryOem(normalizePublicQuery(row.primary_query || row.h1), row.article_oem),
    secondary_queries: [...new Set((row.secondary_queries || []).map(normalizeSecondaryQuery).map((query) => restorePrimaryOem(query, row.article_oem)).filter(Boolean))],
    search_intent: row.search_intent || "commercial",
    title: row.page_type === "product" ? row.title : normalizePublicName(row.title),
    description: row.page_type === "product" ? row.description : normalizePublicName(row.description),
    h1: normalizePublicName(row.h1),
    intro_text: normalizePublicName(row.intro_text || ""),
    faq: row.faq || [],
    indexable: Boolean(row.indexable),
    robots: row.robots || (row.indexable ? "index,follow" : "noindex,follow"),
    status: row.status || (row.indexable ? "active" : "excluded"),
    validation_errors: row.validation_errors || [],
  });

  add({
    page_type: "home", entity_id: "home", canonical_path: "/", indexable: true,
    title: "KITRADE — автозапчасти из Китая с доставкой по России",
    description: "Автозапчасти под заказ из Китая: новые и контрактные детали, проверка по VIN и доставка по России. Минимальная сумма заказа — 50 000 ₽.",
    h1: "Автозапчасти из Китая с доставкой по России",
    primary_query: "автозапчасти из Китая", secondary_queries: ["доставка автозапчастей из Китая"],
  });
  add({
    page_type: "catalog", entity_id: "catalog", canonical_path: "/catalog/", indexable: true,
    ...rules.templates.catalog,
    primary_query: wordstatPriorities.catalog?.primary_query || "автозапчасти под заказ",
    secondary_queries: [wordstatPriorities.catalog?.previous_primary_query, "каталог автозапчастей из Китая"].filter(Boolean),
    intro_text: "Детали под заказ из Китая. Цена указана за деталь, доставка рассчитывается отдельно. Совместимость проверим по VIN.",
    faq: [{ question: "Как проверить совместимость детали?", answer: "Совместимость подтверждается менеджером по VIN перед заказом." }],
  });
  add({
    page_type: "service", entity_id: "vin-selection", canonical_path: "/podbor-zapchastey-po-vin/", indexable: true,
    title: "Подбор запчастей по VIN под заказ | KITRADE",
    description: "Подбор запчастей по VIN для автомобилей. Найдём подходящую деталь у поставщиков в Китае, проверим совместимость и отдельно рассчитаем доставку.",
    h1: "Подбор запчастей по VIN",
    primary_query: "подбор запчастей по VIN",
    secondary_queries: ["найти запчасть по VIN", "проверка запчасти по VIN"],
    intro_text: "Укажите VIN, марку, модель и нужную деталь. Менеджер проведёт поиск у поставщиков, проверит совместимость и подготовит расчёт.",
    faq: [],
  });

  for (const brand of registry.entities.brands) {
    const count = brandCounts.get(brand.id) || 0;
    const publicBrand = normalizePublicName(brand.name);
    const seo = routeSeo("brand", { brand: publicBrand }, rules);
    const direct = directSemantics.brands?.[norm(brand.name)] || {};
    const audit = wordstatPriorities.brands?.[norm(brand.name)] || null;
    const displayName = normalizePublicName(audit?.display_name || publicBrand);
    const primaryQuery = audit?.primary_query || direct.primary_query || `запчасти ${brand.name}`;
    const fallbackSecondary = [`автозапчасти ${brand.name}`, `детали ${brand.name} из Китая`];
    add({ page_type: "brand", entity_id: brand.id, canonical_path: paths.brand(brand), brand: brand.name,
      brand_variants: [...new Set([...(brand.source_names || [brand.name]), ...(direct.brand_variants || [])])], indexable: count > 0, status: count ? "active" : "unlisted",
      validation_errors: count ? [] : ["no_verified_active_products"],
      title: audit ? `Каталог запчастей ${displayName} под заказ | KITRADE` : seo.title,
      description: audit ? `Каталог запчастей ${displayName} под заказ из Китая. Проверка совместимости по VIN, доставка рассчитывается отдельно.` : seo.description,
      h1: audit ? `Запчасти ${displayName}` : seo.h1,
      primary_query: primaryQuery,
      secondary_queries: [...new Set([direct.primary_query, ...(direct.secondary_queries || []), ...fallbackSecondary].filter(Boolean))].slice(0, 8),
      intro_text: `Запчасти ${publicBrand} под заказ из Китая. Цена указана за деталь; доставка рассчитывается отдельно. Проверим по VIN.`,
      faq: [],
    });
  }

  for (const model of registry.entities.models) {
    const brand = indexes.brands.get(model.parent_id);
    if (!brand) continue;
    const count = modelCounts.get(model.id) || 0;
    const publicVehicle = normalizePublicName(`${brand.name} ${model.name}`);
    const seo = routeSeo("model", { brand: "", model: publicVehicle }, rules);
    const direct = directModelEntry(directSemantics, brand, model) || {};
    const audit = wordstatPriorities.models?.[`${norm(brand.name)}|${norm(model.name)}`] || null;
    const primaryQuery = audit?.primary_query || direct.primary_query || `запчасти ${brand.name} ${model.name}`;
    const directVariants = direct.model_variants || [];
    const fallbackSecondary = [`детали ${brand.name} ${model.name}`, `${brand.name} ${model.name} запчасти из Китая`];
    add({ page_type: "model", entity_id: model.id, canonical_path: paths.model(brand, model), brand: brand.name, model: model.name,
      brand_variants: brand.source_names || [brand.name], model_variants: [...new Set([...(model.source_names || [model.name]), ...directVariants])],
      indexable: count > 0, status: count ? "active" : "unlisted", validation_errors: count ? [] : ["no_verified_active_products"],
      title: audit ? `${sentenceCase(primaryQuery)} под заказ | KITRADE` : seo.title,
      description: audit ? `${sentenceCase(primaryQuery)} под заказ из Китая. Проверка совместимости по VIN, доставка рассчитывается отдельно.` : seo.description,
      h1: audit ? `Запчасти ${publicVehicle}` : seo.h1,
      primary_query: primaryQuery,
      secondary_queries: [...new Set([direct.primary_query, ...(direct.secondary_queries || []), ...fallbackSecondary].filter(Boolean))].slice(0, 8),
      intro_text: `Запчасти для ${publicVehicle} под заказ из Китая. Цена указана за деталь; доставка рассчитывается отдельно. Проверим по VIN.`,
      faq: [],
    });
  }

  for (const [entityId, count] of categoryRouteCounts) {
    const [brandId, modelId, categoryId] = entityId.split(":");
    const brand = indexes.brands.get(brandId);
    const model = indexes.models.get(modelId);
    const category = indexes.categories.get(categoryId);
    if (!brand || !model || !category) continue;
    const categorySeoLabels = {
      "Кузов": "Кузовные запчасти", "Оптика": "Фары и оптика", "Электрика": "Автоэлектрика",
      "Стёкла": "Автомобильные стёкла", "Колёса": "Колёса и комплектующие", "Подвеска": "Запчасти подвески",
      "Двигатель": "Запчасти двигателя", "Салон": "Детали салона", "Тормозная система": "Запчасти тормозной системы",
    };
    const seoCategory = categorySeoLabels[category.name] || category.name;
    const publicVehicle = normalizePublicName(`${brand.name} ${model.name}`);
    const seo = routeSeo("category", { brand: "", model: publicVehicle, category: seoCategory }, rules);
    const canonicalPath = paths.category(brand, model, category);
    const categoryAudit = wordstatPriorities.categories?.[canonicalPath] || null;
    const primaryQuery = categoryAudit?.primary_query || `${seoCategory} ${brand.name} ${model.name}`;
    const displayQuery = categoryAudit ? `${seoCategory} для ${publicVehicle}` : "";
    add({ page_type: "category", entity_id: entityId, canonical_path: canonicalPath, brand: brand.name,
      model: model.name, category: category.name, brand_variants: brand.source_names || [brand.name], model_variants: model.source_names || [model.name],
      indexable: count > 0, status: "active", ...seo,
      title: categoryAudit ? `${sentenceCase(displayQuery)} под заказ | KITRADE` : seo.title,
      description: categoryAudit ? `${sentenceCase(displayQuery)} под заказ из Китая. Проверка совместимости по VIN, доставка рассчитывается отдельно.` : seo.description,
      h1: categoryAudit ? sentenceCase(displayQuery) : seo.h1,
      primary_query: primaryQuery,
      secondary_queries: [...new Set([categoryAudit?.previous_primary_query, `купить ${seoCategory.toLocaleLowerCase("ru")} ${brand.name} ${model.name}`, `${seoCategory} ${brand.name} ${model.name} из Китая`].filter(Boolean))],
      intro_text: `${seoCategory} для ${publicVehicle} под заказ из Китая. Цена указана за деталь; доставка рассчитывается отдельно.`,
      faq: [],
    });
  }

  for (const { product, item } of products) {
    const state = productState.get(product.product_id);
    if (!state.indexable) continue;
    const brand = indexes.brands.get(product.brand_id);
    const model = indexes.models.get(product.model_id);
    const category = indexes.categories.get(product.category_id);
    const productOverride = contentOverrides(overrides, product);
    const seo = productSeo(product, item, brand, model, category, productOverride, state.content);
    const ownerSeparated = ownerSeparatedProductIds.has(Number(product.product_id));
    const priceLabel = numericPrice(item?.price).toLocaleString("ru-RU");
    const uniqueTitle = ownerSeparated ? buildProductTitle({ detail: seo.detail, vehicleNames: seo.vehicleNames, article: seo.article, qualifier: `${priceLabel} ₽` }) : seo.title;
    const uniqueDescription = ownerSeparated
      ? truncate(`Ориентировочная цена детали — ${priceLabel} ₽; доставка рассчитывается отдельно. Проверка по VIN. ${seo.h1}.`, 158)
      : seo.description;
    const uniquePrimaryQuery = ownerSeparated
      ? `${seo.h1} ${priceLabel} ₽`
      : (seo.article ? `${seo.h1} ${seo.article}` : seo.h1);
    add({ page_type: "product", entity_id: product.product_id, canonical_path: product.canonical_path,
      brand: brand?.name, model: model?.name, category: category?.name, product_name: seo.h1,
      product_id: product.product_id, article_oem: seo.article, condition: seo.condition, indexable: true,
      title: uniqueTitle, description: uniqueDescription, h1: seo.h1,
      primary_query: uniquePrimaryQuery,
      secondary_queries: [seo.article && `${seo.h1} OEM ${seo.article}`, `${seo.h1} цена`, `${seo.h1} под заказ`].filter(Boolean),
      intro_text: "", faq: [],
    });
  }

  for (const row of seoRows) {
    if (row.page_type !== "product") row.title = fitTitle(row.title);
  }
  const seoByPath = new Map(seoRows.map((row) => [row.canonical_path, row]));

  const needsReview = products.filter(({ product }) => product.status === "needs_review").map(({ product, item }) => ({
    product_id: product.product_id, source_id: product.source_id, title: item?.title || product.name,
    brand: item?.brand || "", model: item?.model || "", canonical_path: product.canonical_path,
    status: "unlisted", robots: "noindex,follow", action: "manual_review_required",
    reasons: productState.get(product.product_id).validationErrors,
  }));
  const productConflicts = Object.entries(overrides.needs_review_products || {}).map(([productId, decision]) => {
    const row = products.find(({ product }) => Number(product.product_id) === Number(productId));
    if (!row) throw new Error(`Review rule refers to missing product ${productId}`);
    const { product, item } = row;
    return {
      product_id: product.product_id,
      source_id: product.source_id,
      canonical_path: product.canonical_path,
      structured_fields: {
        title: clean(item?.title), brand: clean(item?.brand), model: clean(item?.model),
        condition: clean(item?.condition), article_oem: clean(item?.article),
      },
      description_excerpt: clean(item?.description).slice(0, 260),
      reason: decision.reason,
      owner_resolution_required: decision.owner_resolution,
      status: "needs_review",
      robots: "noindex,follow",
      canonical_target_path: product.canonical_path,
      structured_data: "excluded_product_and_offer",
    };
  });

  const oemConflicts = (overrides.oem_manual_confirmation_groups || []).map((productIds) => {
    const rows = productIds.map((productId) => {
      const row = products.find(({ product }) => Number(product.product_id) === Number(productId));
      if (!row) throw new Error(`OEM review rule refers to missing product ${productId}`);
      return duplicateFacts(row.item, row.product);
    });
    const normalizedOem = [...new Set(rows.flatMap((row) => String(row.oem || "").split(/[\s,;/]+/))
      .map((value) => norm(value).replace(/[^\p{L}\p{N}]+/gu, "")).filter(Boolean))];
    return {
      product_ids: productIds.map(Number),
      status: "needs_manual_confirmation",
      conflicting_oem_values: [...new Set(rows.map((row) => row.oem).filter(Boolean))],
      normalized_oem_set: normalizedOem,
      cards: rows,
      conflicting_details: [...new Set(rows.map((row) => `${row.detail} | ${row.side || "side_not_set"}`))],
      action: "suppress_oem_from_public_metadata_mpn_and_product_until_owner_confirmation",
    };
  });

  const imageRowsByUrl = new Map();
  let productsWithoutImages = 0;
  for (const { product, item } of products) {
    const photos = (item?.photos || []).map((url) => String(url || "").trim()).filter(Boolean);
    if (!photos.length) {
      productsWithoutImages += 1;
      continue;
    }
    photos.forEach((rawUrl, imageIndex) => {
      if (imageRowsByUrl.has(rawUrl)) return;
      const normalizedUrl = rawUrl.match(/[?&]imageSlug=([^&]+)/)
        ? `https://80.img.avito.st${decodeURIComponent(rawUrl.match(/[?&]imageSlug=([^&]+)/)[1])}`
        : rawUrl.replace(/^http:\/\//i, "https://");
      const source = /disk\.yandex\.ru\/i\//i.test(rawUrl) ? "yandex_disk_auth_page" : (/avito|img\.avito\.st/i.test(rawUrl) ? "avito" : "other");
      const observation = imageObservations[rawUrl] || imageObservations[normalizedUrl] || {};
      const contentType = clean(observation.content_type);
      const isImageResponse = /^image\//i.test(contentType);
      imageRowsByUrl.set(rawUrl, {
        product_id: product.product_id,
        source_id: product.source_id,
        canonical_path: product.canonical_path,
        image_index: imageIndex + 1,
        raw_url: rawUrl,
        normalized_url: normalizedUrl,
        source,
        http_status: observation.http_status ?? null,
        content_type: contentType || null,
        observed_at: observation.observed_at || null,
        width: observation.width ?? null,
        height: observation.height ?? null,
        rights_status: source === "avito" ? "confirmed_by_owner" : "pending_owner_confirmation",
        rights_source: source === "avito" ? "company_avito_account" : null,
        availability_status: observation.http_status >= 200 && observation.http_status < 400 && isImageResponse ? "approved" : (observation.observed_at ? "rejected" : "not_observed"),
        resolution_status: observation.width && observation.height ? "pending_review" : "not_observed",
        product_match_status: "pending_review",
        watermark_status: "pending_review",
        cropping_status: "pending_review",
        schema_approved: false,
      });
    });
  }
  const imageReport = [...imageRowsByUrl.values()];
  const imageReportSummary = {
    unique_source_links: imageReport.length,
    avito_links: imageReport.filter((row) => row.source === "avito").length,
    yandex_disk_auth_pages: imageReport.filter((row) => row.source === "yandex_disk_auth_page").length,
    products_without_images: productsWithoutImages,
    schema_approved_images: imageReport.filter((row) => row.schema_approved).length,
  };

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

  const candidateKeys = new Map();
  const oemSet = (item) => new Set(String(item?.article || "").split(/[\s,;/]+/)
    .map((value) => norm(value).replace(/[^\p{L}\p{N}]+/gu, "")).filter((value) => value.length >= 4));
  const titleWordSet = (item) => [...new Set(norm(item?.title).match(/[\p{L}\p{N}]+/gu) || [])].sort().join(" ");
  for (const row of products.filter(({ product }) => product.status !== "unlisted")) {
    const keys = [`title_words:${titleWordSet(row.item)}`, ...[...oemSet(row.item)].map((oem) => `oem:${oem}`)];
    for (const key of keys.filter((value) => !value.endsWith(":"))) {
      if (!candidateKeys.has(key)) candidateKeys.set(key, []);
      candidateKeys.get(key).push(row);
    }
  }
  const seenCandidates = new Set();
  for (const [matchKey, rows] of candidateKeys) {
    if (rows.length < 2) continue;
    for (let leftIndex = 0; leftIndex < rows.length - 1; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
        const pair = [rows[leftIndex], rows[rightIndex]].sort((a, b) => a.product.product_id - b.product.product_id);
        const pairKey = pair.map(({ product }) => product.product_id).join("|");
        if (seenCandidates.has(pairKey)) continue;
        seenCandidates.add(pairKey);
        const facts = pair.map(({ item, product }) => duplicateFacts(item, product));
        const { matching, differing } = comparisonFields(facts);
        const blockedBy = ["detail", "condition", "origin", "compatibility", "side", "generation", "year_from", "year_to"]
          .filter((field) => differing.includes(field));
        probableMatches.push({
          product_ids: pair.map(({ product }) => product.product_id),
          source_ids: pair.map(({ product }) => product.source_id),
          match_reason: matchKey.startsWith("oem:") ? "normalized_oem_set_intersection" : "same_title_words_different_order",
          match_key: matchKey.split(":").slice(1).join(":"),
          matching_fields: matching,
          differing_fields: differing,
          automatic_merge_blocked_by: blockedBy,
          action: "manual_decision_required_no_automatic_merge",
        });
      }
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

  return { seoRows, seoByPath, productState, duplicateReport, needsReview, productConflicts, oemConflicts, imageReport, imageReportSummary, probableMatches, variants, activeProducts };
}

export function productStructuredData({ product, item, brand, model, category, seo, config, state, imageApproval = null }) {
  const content = state?.content || createProductContent({ item, product, brand, model, category });
  const offer = {
    "@type": "Offer", url: new URL(product.canonical_path, `${config.siteUrl}/`).href,
    priceCurrency: "RUB", price: content.price, availability: "https://schema.org/PreOrder",
  };
  const condition = schemaCondition(content.condition);
  if (condition) offer.itemCondition = condition;
  const schema = {
    "@context": "https://schema.org", "@type": "Product", name: seo?.h1 || content.h1,
    description: content.description, sku: String(product.product_id), url: offer.url, offers: offer,
  };
  if (content.article) schema.mpn = content.article;
  if (brand?.name) schema.brand = { "@type": "Brand", name: brand.name };
  if (category?.name) schema.category = category.name;
  if (model?.name) schema.model = model.name;
  if (imageApproval?.schema_approved
    && ["rights_status", "availability_status", "resolution_status", "product_match_status"]
      .every((field) => ["confirmed_by_owner", "approved"].includes(imageApproval[field]))) {
    schema.image = [imageApproval.normalized_url];
  }
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
