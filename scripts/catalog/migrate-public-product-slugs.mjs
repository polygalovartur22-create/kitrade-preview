import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCatalogData } from "./lib/data.mjs";
import { publicProductTitle } from "./lib/public-copy.mjs";
import { slugify, stableSlug } from "./lib/slug.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const registryPath = path.join(projectDir, "catalog-url-map.json");
const sourcePath = path.join(projectDir, "kitrade-parts-data.js");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const sourceItems = readCatalogData(sourcePath);
const itemBySourceId = new Map(sourceItems.map((item) => [String(item.id), item]));
const occupiedSlugs = new Set(registry.entities.products.map((product) => product.slug));
let migrated = 0;

for (const product of registry.entities.products) {
  const item = itemBySourceId.get(String(product.source_id)) || product.source_snapshot || null;
  if (!item) continue;
  const article = String(item.article || "").trim();
  const articleSlug = slugify(article);
  const publicName = publicProductTitle(product, item);
  const hidesPrivateNumber = publicName !== String(item.title || product.name).trim();
  if (!hidesPrivateNumber || !articleSlug || !product.slug.includes(articleSlug)) continue;

  const oldPath = product.canonical_path;
  occupiedSlugs.delete(product.slug);
  const newSlug = stableSlug(publicName, product.product_id, occupiedSlugs, { alwaysAppendId: true });
  occupiedSlugs.add(newSlug);
  product.slug = newSlug;
  product.canonical_path = `/catalog/product/${newSlug}/`;
  product.name = publicName;
  product.legacy_paths = [...new Set([...(product.legacy_paths || []), oldPath])];
  migrated += 1;
}

if (migrated) fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Protected ${migrated} public product URL(s).`);
