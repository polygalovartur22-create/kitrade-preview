import assert from "node:assert/strict";
import test from "node:test";
import { createProductContent, formatPartPrice, productTitleHasMainNoun, productTitleHasVehicle, validatedArticle } from "../scripts/catalog/lib/product-content.mjs";

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

test("only the primary OEM is published in titles and descriptions", () => {
  const content = createProductContent({ item: { id: "source-1", title: "Фара Geely Monjaro", brand: "Geely", model: "Monjaro", article: "6010179000 / 6010179001; 6010179002" }, product, brand, model });
  assert.equal(content.article, "6010179000");
  assert.match(content.title, /6010179000/);
  assert.doesNotMatch(content.title, /6010179001|6010179002/);
  assert.ok(content.title.length <= 75);
});

test("confirmed compatibility is deduplicated and rendered without double punctuation", () => {
  const compatibility = { brand: "Geely", model: "Monjaro", generation: "I", yearFrom: 2021, yearTo: 2025 };
  const content = createProductContent({ item: { id: "source-1", title: "Фара", brand: "Geely", model: "Monjaro", compatibility: [compatibility, compatibility] }, product, brand, model });
  assert.match(content.description, /Совместимость: Geely Monjaro, поколение I, 2021–2025 г\./);
  assert.doesNotMatch(content.description, /г\.\./);
  assert.equal((content.description.match(/2021–2025/g) || []).length, 1);
});

test("decimal catalog prices keep their decimal separator", () => {
  assert.equal(formatPartPrice("4329.6"), "4 329,6 ₽");
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
  assert.match(content.description, /Минимальная сумма заказа — 50\s000 ₽/);
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

test("Fang Cheng Bao 5 uses one idempotent public entity name", () => {
  const baoBrand = { name: "Fang Cheng Bao" };
  const baoModel = { name: "Bao 5 (Leopard 5)" };
  const content = createProductContent({ item: { id: "source-1", title: "Подушка безопасности BYD FangChengBao Bao 5", brand: baoBrand.name, model: baoModel.name }, product, brand: baoBrand, model: baoModel });
  assert.equal(content.h1, "Подушка безопасности Fang Cheng Bao 5 (Leopard 5)");
  assert.doesNotMatch(`${content.title} ${content.h1}`, /Bao Bao|(?:Fang Cheng Bao\s+){2}|\(Leopard 5\)\s*\(Leopard 5\)/);
});

test("product 1730 public entity is normalized without changing source data", () => {
  const polarBrand = { name: "Polar Stone (Jishi)" };
  const polarModel = { name: "01" };
  const source = { id: "7724647009", title: "Задний стабилизатор поперечной устойчивости Polar", brand: polarBrand.name, model: polarModel.name, article: "Polar" };
  const content = createProductContent({ item: source, product: { ...product, product_id: 1730 }, brand: polarBrand, model: polarModel });
  assert.equal(content.h1, "Задний стабилизатор поперечной устойчивости Polar Stone (Jishi) 01");
  assert.doesNotMatch(content.description, /Polar Polar/);
  assert.equal(source.title, "Задний стабилизатор поперечной устойчивости Polar");
});

test("long product titles retain the part noun, vehicle and primary OEM", () => {
  const hunterBrand = { name: "Changan" };
  const hunterModel = { name: "Hunter Plus" };
  const content = createProductContent({ item: { id: "source-1", title: "Передняя противотуманная фара правая Changan Hunter Plus", brand: hunterBrand.name, model: hunterModel.name, article: "P201F280501-0901-AA" }, product, brand: hunterBrand, model: hunterModel });
  assert.ok(content.title.length <= 75);
  assert.ok(productTitleHasMainNoun(content.title, content.h1, hunterBrand, hunterModel));
  assert.ok(productTitleHasVehicle(content.title, hunterBrand, hunterModel));
  assert.ok(content.title.includes("P201F280501-0901-AA"));
});

test("confirmed short model alias protects the part noun in a long Title", () => {
  const deepalBrand = { name: "Changan" };
  const deepalModel = { name: "Shenlan (Deepal) S07" };
  const content = createProductContent({ item: { id: "source-1", title: "Задний противотуманный фонарь правый Changan Shenlan (Deepal) S07", brand: deepalBrand.name, model: deepalModel.name, article: "C673F2805030000AA-01" }, product, brand: deepalBrand, model: deepalModel });
  assert.match(content.title, /Changan Deepal S07/);
  assert.ok(productTitleHasMainNoun(content.title, content.h1, deepalBrand, deepalModel));
  assert.ok(content.title.includes("C673F2805030000AA-01"));
});

test("public explanatory parentheses are spaced while OEM is preserved verbatim", () => {
  const content = createProductContent({ item: { id: "source-1", title: "Подушка безопасности правая(шторка) Changan Uni-K", brand: "Changan", model: "Uni-K", article: "6303010CR03АА" }, product, brand: { name: "Changan" }, model: { name: "Uni-K" } });
  assert.match(content.h1, /правая \(шторка\) Changan UNI-K/);
  assert.ok(content.title.includes("6303010CR03АА"));
  assert.doesNotMatch(content.title, /6303010CR03AA/);
});
