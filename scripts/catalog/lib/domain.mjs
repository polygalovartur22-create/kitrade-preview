export function getPublicCategory(item) {
  const source = [item.category, item.subcategory, item.detail, item.title]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ru");

  if (/фар|фонар|оптик|автосвет|дневн.*огонь/.test(source)) return "Оптика";
  if (/тормоз|суппорт|колод|диск торм/.test(source)) return "Тормозная система";
  if (/подвес|амортиз|стойк|рычаг|ступиц|пружин/.test(source)) return "Подвеска";
  if (/двигател|мотор|порш|коленвал|головк.*блок|грм/.test(source)) return "Двигатель";
  if (/салон|сиден|панел.*прибор|обшив|консол/.test(source)) return "Салон";
  if (/электр|датчик|провод|блок управ|генератор|стартер/.test(source)) return "Электрика";
  if (/кузов|крыл|бампер|капот|двер|решет|багажник|зеркал|наклад/.test(source)) return "Кузов";
  return item.category || "Запчасти";
}

export function productNeedsReview(item) {
  return Boolean(
    item.needsReview
    || !String(item.brand || "").trim()
    || !String(item.model || "").trim()
    || String(item.brand || "").trim().toLocaleLowerCase("ru") === "маз"
  );
}

export function isVisibleCatalogItem(item) {
  return Boolean(
    item
    && item.title
    && String(item.brand || "").trim().toLocaleLowerCase("ru") !== "маз"
  );
}
