import assert from "node:assert/strict";
import test from "node:test";
import { getPublicCategory } from "../scripts/catalog/lib/domain.mjs";
import { createEmptyRegistry, syncRegistry, validateRegistry } from "../scripts/catalog/lib/registry.mjs";
import { slugify } from "../scripts/catalog/lib/slug.mjs";

function item(overrides = {}) {
  return {
    id: "9000000001",
    title: "Фара правая Geely Monjaro",
    brand: "Geely",
    model: "Monjaro",
    category: "Автосвет",
    article: "A-100",
    price: "25000",
    ...overrides,
  };
}

test("Russian names receive readable ASCII slugs", () => {
  assert.equal(slugify("Фара правая Geely Monjaro"), "fara-pravaya-geely-monjaro");
});

test("technical public taxonomy maps autosvet to optika", () => {
  assert.equal(getPublicCategory(item()), "Оптика");
});

test("product ID and canonical URL remain stable when product fields change", () => {
  const first = syncRegistry(createEmptyRegistry(), [item()]);
  const original = structuredClone(first.entities.products[0]);
  const second = syncRegistry(first, [item({
    title: "Фара правая для Geely Monjaro новая",
    model: "Monjaro рестайлинг",
    category: "Кузовные запчасти",
    price: "31000",
  })]);
  const updated = second.entities.products[0];
  assert.equal(updated.product_id, original.product_id);
  assert.equal(updated.slug, original.slug);
  assert.equal(updated.canonical_path, original.canonical_path);
  assert.equal(updated.source_snapshot.price, "31000");
});

test("same product names still receive unique permanent URLs", () => {
  const registry = syncRegistry(createEmptyRegistry(), [item(), item({ id: "9000000002" })]);
  assert.equal(new Set(registry.entities.products.map((entry) => entry.canonical_path)).size, 2);
  validateRegistry(registry);
});

test("a missing import row is retained as unlisted instead of being deleted", () => {
  const first = syncRegistry(createEmptyRegistry(), [item()]);
  const canonicalPath = first.entities.products[0].canonical_path;
  const second = syncRegistry(first, []);
  assert.equal(second.entities.products.length, 1);
  assert.equal(second.entities.products[0].status, "unlisted");
  assert.equal(second.entities.products[0].canonical_path, canonicalPath);
  assert.equal(second.entities.products[0].source_snapshot.title, item().title);
});

test("previous_id preserves the permanent product URL without title matching", () => {
  const first = syncRegistry(createEmptyRegistry(), [item()]);
  const original = structuredClone(first.entities.products[0]);
  const second = syncRegistry(first, [item({ id: "9000000099", previous_id: "9000000001", title: "Полностью новое название" })]);
  const updated = second.entities.products[0];
  assert.equal(updated.product_id, original.product_id);
  assert.equal(updated.canonical_path, original.canonical_path);
  assert.equal(updated.source_id, "9000000099");
  assert.ok(updated.source_aliases.includes("9000000001"));
});
