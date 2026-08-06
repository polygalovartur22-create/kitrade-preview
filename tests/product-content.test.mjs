import assert from "node:assert/strict";
import test from "node:test";
import { createProductContent, validatedArticle } from "../scripts/catalog/lib/product-content.mjs";

const brand = { name: "Geely", source_names: ["geely"] };
const model = { name: "Monjaro", source_names: ["Monjaro"] };
const product = { product_id: 1001, source_id: "source-1", name: "Запчасть" };

test("brand names and missing articles are never published as OEM", () => {
  assert.equal(validatedArticle({ article: "geely", brand: "Geely", model: "Monjaro" }), "");
  assert.equal(validatedArticle({ article: "нет", brand: "Geely", model: "Monjaro" }), "");
});

test("confirmed-looking OEM values are preserved without entering H1", () => {
  const content = createProductContent({ item: { id: "source-1", title: "Фара Geely Monjaro", brand: "Geely", model: "Monjaro", article: "6010179000", condition: "Новое", price: 50000 }, product, brand, model });
  assert.equal(content.article, "6010179000");
  assert.equal(content.h1, "Фара Geely Monjaro");
  assert.equal(content.title, "Фара Geely Monjaro, 6010179000 | KITRADE");
});

test("truncated parentheses and known model spelling errors are repaired", () => {
  const hunter = { name: "Hunter Plus", source_names: ["Hunter Plus"] };
  const content = createProductContent({ item: { id: "source-1", title: "Капот Changan Hanter Plus (ориги", brand: "Changan", model: "Hunter Plus", article: "12345" }, product, brand: { name: "Changan" }, model: hunter });
  assert.equal(content.h1, "Капот Changan Hunter Plus");
  assert.equal((content.h1.match(/\(/g) || []).length, (content.h1.match(/\)/g) || []).length);
});

test("safe descriptions always explain part-only price and the total order threshold", () => {
  const content = createProductContent({ item: { id: "source-1", title: "Фара Geely Monjaro", brand: "Geely", model: "Monjaro", article: "", price: 12000, description: "Авито: предоплата, доставка 15 дней" }, product, brand, model });
  assert.match(content.description, /Цена детали — 12\s000 ₽; доставка из Китая рассчитывается отдельно/);
  assert.match(content.description, /Минимальная общая сумма заказа — 50\s000 ₽/);
  assert.doesNotMatch(content.description, /Авито|предоплата|15 дней/);
});

test("vehicle names next to truncated details are not corrupted or duplicated", () => {
  const content = createProductContent({ item: { id: "source-1", title: "Geely Monjaro(колодки, салонный, масляный, воздушный", brand: "Geely", model: "Monjaro", article: "12345" }, product, brand, model });
  assert.equal(content.h1, "Колодки, салонный, масляный, воздушный Geely Monjaro");
});

test("removing a leading vehicle alias does not leave an orphan closing parenthesis", () => {
  const liContent = createProductContent({ item: { id: "source-1", title: "Lixiang L7 (колодки, фильтр салона, масляный, воздух)", brand: "Li Auto", model: "L7", article: "12345" }, product, brand: { name: "Li Auto" }, model: { name: "L7" } });
  assert.equal(liContent.h1, "Колодки, фильтр салона, масляный, воздух Li Auto L7");
});

test("common model suffixes use canonical display case", () => {
  const content = createProductContent({ item: { id: "source-1", title: "Заглушка рейлинга Livan X6 pro", brand: "Livan", model: "X6 pro", article: "12345" }, product, brand: { name: "Livan" }, model: { name: "X6 pro" } });
  assert.equal(content.h1, "Заглушка рейлинга Livan X6 Pro");
});
