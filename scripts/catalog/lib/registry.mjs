import crypto from "node:crypto";
import { getPublicCategory, productNeedsReview } from "./domain.mjs";
import { normalizedSourceName, stableSlug } from "./slug.mjs";

export function createEmptyRegistry() {
  return {
    version: 1,
    nextIds: { brand: 1001, model: 1001, category: 1001, product: 1001 },
    entities: { brands: [], models: [], categories: [], products: [] },
  };
}

function claimId(registry, type) {
  const value = registry.nextIds[type];
  if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid next ID for ${type}`);
  registry.nextIds[type] += 1;
  return value;
}

function existingSlugs(entries, parentId = null) {
  return new Set(entries.filter((entry) => parentId === null || entry.parent_id === parentId).map((entry) => entry.slug));
}

function fingerprint(item) {
  const source = [item.brand, item.model, item.article, item.title, item.category]
    .map((value) => normalizedSourceName(value))
    .join("|");
  return crypto.createHash("sha256").update(source).digest("hex").slice(0, 20);
}

function findBySourceName(entries, sourceName, parentId = null) {
  const normalized = normalizedSourceName(sourceName);
  return entries.find((entry) => (
    (parentId === null || entry.parent_id === parentId)
    && (entry.source_names || []).some((name) => normalizedSourceName(name) === normalized)
  ));
}

function ensureNamedEntity(registry, type, plural, name, parentId = null) {
  const entries = registry.entities[plural];
  let entry = findBySourceName(entries, name, parentId);
  if (entry) {
    entry.name = String(name).trim();
    entry.status = "active";
    return entry;
  }

  const numericId = claimId(registry, type);
  const prefix = type[0];
  const id = `${prefix}${numericId}`;
  const slug = stableSlug(name, id, existingSlugs(entries, parentId));
  entry = {
    id,
    parent_id: parentId,
    name: String(name).trim(),
    source_names: [String(name).trim()],
    slug,
    status: "active",
    legacy_paths: [],
  };
  entries.push(entry);
  return entry;
}

function ensureProduct(registry, item, relations) {
  const sourceId = String(item.id || "").trim();
  if (!sourceId) throw new Error(`Product has no source ID: ${item.title || "unknown"}`);
  const previousIds = [item.previous_id, ...(Array.isArray(item.previous_ids) ? item.previous_ids : [])]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  let entry = registry.entities.products.find((product) => (
    product.source_id === sourceId || (product.source_aliases || []).includes(sourceId)
  ));
  if (!entry && previousIds.length) {
    entry = registry.entities.products.find((product) => previousIds.some((previousId) => (
      product.source_id === previousId || (product.source_aliases || []).includes(previousId)
    )));
  }
  const status = productNeedsReview(item) ? "needs_review" : "active";

  if (!entry) {
    const productId = claimId(registry, "product");
    const slug = stableSlug(item.title, productId, existingSlugs(registry.entities.products), {
      alwaysAppendId: true,
    });
    entry = {
      product_id: productId,
      source_id: sourceId,
      source_aliases: [],
      source_fingerprint: fingerprint(item),
      name: item.title,
      slug,
      canonical_path: `/catalog/product/${slug}/`,
      brand_id: relations.brand?.id || null,
      model_id: relations.model?.id || null,
      category_id: relations.category?.id || null,
      public_category: relations.category?.name || getPublicCategory(item),
      status,
      source_snapshot: structuredClone(item),
      legacy_paths: [],
    };
    registry.entities.products.push(entry);
  } else {
    const aliases = new Set(entry.source_aliases || []);
    if (entry.source_id !== sourceId) aliases.add(entry.source_id);
    previousIds.forEach((previousId) => aliases.add(previousId));
    aliases.delete(sourceId);
    entry.source_id = sourceId;
    entry.source_aliases = [...aliases];
    entry.name = item.title;
    entry.source_fingerprint = fingerprint(item);
    entry.brand_id = relations.brand?.id || null;
    entry.model_id = relations.model?.id || null;
    entry.category_id = relations.category?.id || null;
    entry.public_category = relations.category?.name || getPublicCategory(item);
    entry.status = status;
    entry.source_snapshot = structuredClone(item);
  }
  entry._seen = true;
  return entry;
}

export function syncRegistry(currentRegistry, items) {
  const registry = structuredClone(currentRegistry || createEmptyRegistry());
  for (const group of Object.values(registry.entities)) {
    for (const entry of group) entry._seen = false;
  }

  for (const item of items) {
    if (!item || !item.title) continue;
    const brandName = String(item.brand || "").trim();
    const modelName = String(item.model || "").trim();
    const categoryName = getPublicCategory(item);
    const brand = brandName ? ensureNamedEntity(registry, "brand", "brands", brandName) : null;
    const model = brand && modelName
      ? ensureNamedEntity(registry, "model", "models", modelName, brand.id)
      : null;
    const category = categoryName
      ? ensureNamedEntity(registry, "category", "categories", categoryName)
      : null;

    if (brand) brand._seen = true;
    if (model) model._seen = true;
    if (category) category._seen = true;
    ensureProduct(registry, item, { brand, model, category });
  }

  for (const group of Object.values(registry.entities)) {
    for (const entry of group) {
      if (!entry._seen && entry.status !== "redirected") entry.status = "unlisted";
      delete entry._seen;
    }
  }

  const activeBrandIds = new Set(registry.entities.products.filter((entry) => entry.status === "active").map((entry) => entry.brand_id).filter(Boolean));
  const activeModelIds = new Set(registry.entities.products.filter((entry) => entry.status === "active").map((entry) => entry.model_id).filter(Boolean));
  for (const brand of registry.entities.brands) {
    if (brand.status !== "redirected") brand.status = activeBrandIds.has(brand.id) ? "active" : "unlisted";
  }
  for (const model of registry.entities.models) {
    if (model.status !== "redirected") model.status = activeModelIds.has(model.id) ? "active" : "unlisted";
  }

  return registry;
}

export function registryIndexes(registry) {
  const brands = new Map(registry.entities.brands.map((entry) => [entry.id, entry]));
  const models = new Map(registry.entities.models.map((entry) => [entry.id, entry]));
  const categories = new Map(registry.entities.categories.map((entry) => [entry.id, entry]));
  const productsBySourceId = new Map();
  for (const product of registry.entities.products) {
    productsBySourceId.set(String(product.source_id), product);
    for (const alias of product.source_aliases || []) productsBySourceId.set(String(alias), product);
  }
  return { brands, models, categories, productsBySourceId };
}

export function validateRegistry(registry) {
  const errors = [];
  const allPaths = new Map();
  const productIds = new Set();
  const productSlugs = new Set();
  const namedSlugs = new Set();
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  for (const product of registry.entities.products) {
    if (productIds.has(product.product_id)) errors.push(`Duplicate product_id: ${product.product_id}`);
    if (productSlugs.has(product.slug)) errors.push(`Duplicate product slug: ${product.slug}`);
    if (!slugPattern.test(product.slug)) errors.push(`Invalid product slug: ${product.slug}`);
    productIds.add(product.product_id);
    productSlugs.add(product.slug);
  }

  for (const [plural, entries] of Object.entries(registry.entities)) {
    for (const entry of entries) {
      if (entry.slug && !slugPattern.test(entry.slug)) errors.push(`Invalid ${plural} slug: ${entry.slug}`);
      if (plural !== "products") {
        const key = `${plural}|${entry.parent_id || "root"}|${entry.slug}`;
        if (namedSlugs.has(key)) errors.push(`Duplicate ${plural} slug within parent: ${entry.slug}`);
        namedSlugs.add(key);
      }
      if (entry.canonical_path) {
        const previous = allPaths.get(entry.canonical_path);
        if (previous) errors.push(`Duplicate canonical path ${entry.canonical_path}: ${previous} and ${plural}`);
        allPaths.set(entry.canonical_path, plural);
      }
    }
  }

  if (errors.length) throw new Error(`Registry validation failed:\n${errors.join("\n")}`);
  return true;
}
