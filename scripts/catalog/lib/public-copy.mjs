const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const norm = (value) => clean(value).toLocaleLowerCase("ru").replaceAll("ё", "е");

function publicOrigin(value) {
  const origin = clean(value);
  return !origin || ["не знаю", "unknown"].includes(norm(origin)) ? "" : origin;
}

export function publicProductTitle(product, item) {
  return clean(item?.title || product?.name || "Автозапчасть") || "Автозапчасть";
}

function yearsLabel(item) {
  const from = Number(item?.yearFrom) || null;
  const to = Number(item?.yearTo) || null;
  if (from && to && from !== to) return `${from}–${to} годов выпуска`;
  if (from || to) return `${from || to} года выпуска`;
  return "";
}

function vehicleLabel(item) {
  const vehicle = [item?.brand, item?.model].map(clean).filter(Boolean).join(" ");
  if (!vehicle) return "";
  return [vehicle, clean(item?.generation) ? `поколение ${clean(item.generation)}` : "", yearsLabel(item)]
    .filter(Boolean)
    .join(", ");
}

function factsLabel(item) {
  const facts = [];
  const condition = clean(item?.condition);
  const origin = publicOrigin(item?.origin);
  if (condition) facts.push(`Состояние — ${condition.toLocaleLowerCase("ru")}`);
  if (origin) facts.push(`исполнение — ${origin.toLocaleLowerCase("ru")}`);
  return facts.length ? `${facts.join(", ")}.` : "";
}

export function publicDescription(product, item) {
  const detail = clean(item?.detail || item?.title || product?.name || "Автозапчасть") || publicProductTitle(product, item);
  const vehicle = vehicleLabel(item);
  const subject = vehicle ? `${detail} для ${vehicle}.` : `${detail}.`;
  const facts = factsLabel(item);
  const closing = vehicle
    ? "Перед оформлением проверим совместимость с автомобилем по VIN."
    : "Перед оформлением менеджер уточнит характеристики и применимость детали.";
  return [subject, facts, "Поставляется под заказ из Китая.", closing].filter(Boolean).join(" ");
}

export function publicCatalogItem(product, item) {
  return {
    id: String(product.product_id),
    title: publicProductTitle(product, item),
    brand: clean(item?.brand),
    model: clean(item?.model),
    generation: clean(item?.generation),
    yearFrom: item?.yearFrom ?? null,
    yearTo: item?.yearTo ?? null,
    years: Array.isArray(item?.years) ? item.years : [],
    category: clean(item?.category),
    subcategory: clean(item?.subcategory),
    detail: clean(item?.detail),
    article: clean(item?.article),
    condition: clean(item?.condition),
    origin: publicOrigin(item?.origin),
    price: clean(item?.price),
    photos: Array.isArray(item?.photos) ? item.photos : [],
    description: publicDescription(product, item),
    compatibility: Array.isArray(item?.compatibility) ? item.compatibility : [],
    needsReview: Boolean(item?.needsReview),
  };
}
