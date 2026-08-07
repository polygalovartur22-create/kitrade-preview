const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const norm = (value) => clean(value).toLocaleLowerCase("ru").replaceAll("ё", "е");

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const mixedToLatin = new Map(Object.entries({
  А: "A", В: "B", С: "C", Е: "E", Н: "H", К: "K", М: "M", О: "O", Р: "P", Т: "T", Х: "X", У: "Y",
  а: "a", с: "c", е: "e", о: "o", р: "p", х: "x", у: "y",
}));
const mixedToCyrillic = new Map(Object.entries({
  A: "А", B: "В", C: "С", E: "Е", H: "Н", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х", Y: "У",
  a: "а", c: "с", e: "е", o: "о", p: "р", x: "х", y: "у",
}));

function normalizeMixedToken(token) {
  if (!/[A-Za-z]/.test(token) || !/[А-ЯЁа-яё]/.test(token)) return token;
  const latinCount = (token.match(/[A-Za-z]/g) || []).length;
  const cyrillicCount = (token.match(/[А-ЯЁа-яё]/g) || []).length;
  const map = /\d/.test(token) || latinCount >= cyrillicCount ? mixedToLatin : mixedToCyrillic;
  return [...token].map((character) => map.get(character) || character).join("");
}

function balancePunctuation(value) {
  let text = clean(value)
    .replace(/\bbaic\b/gi, "BAIC")
    .replace(/\baito\b/gi, "Aito")
    .replace(/\bdeepal\b/gi, "Deepal")
    .replace(/\bHanter\b/gi, "Hunter")
    .replace(/\bdfsk\b/gi, "DFSK")
    .replace(/\bHiphi\b/gi, "HiPhi")
    .replace(/\bUni-K\b/gi, "UNI-K")
    .replace(/\bX6Pro\b/gi, "X6 Pro")
    .replace(/\bSu\s*7\b/gi, "SU7");

  text = text.replace(/[\p{L}\p{N}]+/gu, normalizeMixedToken);

  let depth = 0;
  let unmatchedOpen = -1;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "(") {
      depth += 1;
      if (depth === 1) unmatchedOpen = index;
    } else if (text[index] === ")") {
      if (depth > 0) depth -= 1;
      else text = `${text.slice(0, index)}${text.slice(index + 1)}`;
      if (depth === 0) unmatchedOpen = -1;
    }
  }
  if (depth > 0 && unmatchedOpen >= 0) {
    const prefix = text.slice(0, unmatchedOpen).trim();
    const trailing = text.slice(unmatchedOpen + 1).trim();
    const normalizedTrailing = norm(trailing).replace(/[^а-я]/g, "");
    const truncatedOrigin = Boolean(normalizedTrailing) && ("оригинал".startsWith(normalizedTrailing) || normalizedTrailing.startsWith("новоеориг"));
    text = truncatedOrigin ? prefix : `${prefix}, ${trailing}`;
  }

  return clean(text)
    .replace(/\s*\((?:[^)]*(?:ориг(?:инал)?|нов(?:ое|ая))[^)]*)\)/gi, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,;:])(?=\S)/g, "$1 ")
    .replace(/[,;:/\-–—]+$/g, "")
    .trim();
}

export function normalizePublicName(value) {
  return balancePunctuation(value)
    .replace(/\bpro\b/gi, "Pro")
    .replace(/\bplus\b/gi, "Plus")
    .replace(/\bmax\b/gi, "Max");
}

export function validatedArticle(item, overrides = {}) {
  const override = Object.hasOwn(overrides, "article") ? overrides.article : item?.article;
  const candidates = clean(override).split(/[\/,;]+/).map(clean).filter(Boolean);
  const forbidden = [item?.brand, item?.model].map(norm).filter(Boolean);
  return candidates.find((article) => (
    !["нет", "не указан", "неизвестно", "n/a", "none", "-"].includes(norm(article))
    && !forbidden.includes(norm(article))
    && /\d/.test(article)
  )) || "";
}

function validatedCondition(item, overrides = {}) {
  const value = clean(Object.hasOwn(overrides, "condition") ? overrides.condition : item?.condition);
  const normalized = norm(value);
  if (normalized.startsWith("нов")) return "Новое";
  if (normalized === "б/у" || normalized === "бу" || normalized.includes("used") || normalized.includes("контракт")) return "Б/у";
  return "";
}

function validatedOrigin(item, overrides = {}) {
  const explicitlyConfirmed = overrides.origin_confirmed === true || item?.confirmed_fields?.includes?.("origin");
  if (!explicitlyConfirmed) return "";
  const value = clean(Object.hasOwn(overrides, "origin") ? overrides.origin : item?.origin);
  return ["не знаю", "unknown", "неизвестно"].includes(norm(value)) ? "" : value;
}

function titleAliases(item, brand, model, overrides = {}) {
  const aliases = new Set([
    item?.brand, brand?.name, ...(brand?.source_names || []),
    item?.model, model?.name, ...(model?.source_names || []),
  ].map(clean).filter(Boolean));
  const brandWithoutQualifier = clean(brand?.name).replace(/\s*\([^)]*\)\s*$/, "");
  const modelWithoutQualifier = clean(model?.name).replace(/\s*\([^)]*\)\s*$/, "");
  if (brandWithoutQualifier && norm(brandWithoutQualifier) !== norm(brand?.name)) aliases.add(brandWithoutQualifier);
  if (modelWithoutQualifier && norm(modelWithoutQualifier) !== norm(model?.name)) aliases.add(modelWithoutQualifier);
  const vehicleKey = `${norm(brand?.name)}|${norm(model?.name)}`;
  (overrides.vehicle_aliases?.[vehicleKey] || []).forEach((entry) => aliases.add(entry));
  if (norm(model?.name).includes("hunter plus")) aliases.add("Hanter Plus");
  if (norm(model?.name).includes("shenlan") || norm(model?.name).includes("deepal")) {
    ["Deepal S7", "Deepal S07", "Shenlan S7", "Shenlan S07"].forEach((entry) => aliases.add(entry));
  }
  if (norm(model?.name).includes("vision x6 pro")) ["X6 Pro", "X6Pro", "Vision X6Pro"].forEach((entry) => aliases.add(entry));
  if (norm(model?.name).includes("bao 5") || norm(model?.name).includes("leopard 5")) {
    ["BYD Leopard 5", "Leopard 5", "Bao 5"].forEach((entry) => aliases.add(entry));
  }
  if (norm(brand?.name) === "li auto") ["Lixiang", "Li Xiang"].forEach((entry) => aliases.add(entry));
  return [...aliases].sort((left, right) => right.length - left.length);
}

function partName(item, brand, model, article, overrides = {}) {
  let title = balancePunctuation(overrides.title || item?.title || item?.detail || item?.subcategory || item?.category || "Запчасть");
  if (article) title = title.replace(new RegExp(`(?:арт(?:икул)?\\.?|OEM)?\\s*${escapeRegExp(article)}`, "giu"), " ");
  for (const alias of titleAliases(item, brand, model, overrides)) {
    title = title.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(alias)}(?=$|[^\\p{L}\\p{N}])`, "giu"), "$1");
  }
  title = balancePunctuation(title)
    .replace(/форточкалевой/gi, "форточка левой")
    .replace(/^на\s+/i, "")
    .replace(/^для\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (title.startsWith("(") && title.endsWith(")") && balancePunctuation(title.slice(1, -1))) title = title.slice(1, -1).trim();
  if (!/[\p{L}\p{N}]/u.test(title)) {
    const fallback = balancePunctuation(item?.detail || item?.subcategory || "");
    title = /[\p{L}\p{N}]/u.test(fallback) && !fallback.startsWith("(") ? fallback : clean(item?.category || "Запчасть");
  }
  title = title.replace(/^[\s([\]{},.;:]+/, "").trim();
  title = title.replace(/[,;]?\s+(?:в|во|на|для|и|с)$/i, "").replace(/[,;]+$/, "").trim();
  title = balancePunctuation(title);
  return title ? `${title[0].toLocaleUpperCase("ru")}${title.slice(1)}` : "Запчасть";
}

function shortenWords(value, max) {
  const text = clean(value);
  if (text.length <= max) return text;
  let shortened = text.slice(0, max).replace(/\s+\S*$/, "").replace(/[,.;:!?/\-–—]+$/, "").trim();
  while ((shortened.match(/\(/g) || []).length > (shortened.match(/\)/g) || []).length) {
    shortened = shortened.slice(0, shortened.lastIndexOf("(")).trim();
  }
  return shortened || text.slice(0, max).trim();
}

function productTitle(detail, vehicle, article) {
  const suffix = article ? `, ${article} | KITRADE` : " | KITRADE";
  const targetLength = vehicle.length + suffix.length + 13 <= 65 ? 65 : 75;
  const available = Math.max(24, targetLength - suffix.length);
  const full = clean([detail, vehicle].filter(Boolean).join(" "));
  if (full.length <= available) return `${full}${suffix}`;
  const vehicleText = shortenWords(vehicle, Math.min(vehicle.length, Math.max(12, available - 12)));
  const detailLimit = Math.max(12, available - vehicleText.length - 1);
  return `${clean([shortenWords(detail, detailLimit), vehicleText].filter(Boolean).join(" "))}${suffix}`;
}

function yearsLabel(entry) {
  const from = Number(entry?.yearFrom) || 0;
  const to = Number(entry?.yearTo) || 0;
  if (from && to) return from === to ? String(from) : `${from}–${to}`;
  if (from) return `с ${from}`;
  if (to) return `до ${to}`;
  const years = [...new Set((entry?.years || []).map(Number).filter(Boolean))].sort((left, right) => left - right);
  if (!years.length) return "";
  return years.length === 1 ? String(years[0]) : `${years[0]}–${years.at(-1)}`;
}

function compatibilitySummary(item, publicBrand, publicModel) {
  const source = Array.isArray(item?.compatibility) && item.compatibility.length
    ? item.compatibility
    : [{ brand: publicBrand, model: publicModel, generation: item?.generation, yearFrom: item?.yearFrom, yearTo: item?.yearTo, years: item?.years }];
  const variants = [...new Set(source.map((entry) => {
    const vehicle = clean([entry?.brand || publicBrand, entry?.model || publicModel].filter(Boolean).join(" "));
    const generation = clean(entry?.generation);
    const years = yearsLabel(entry);
    return clean([vehicle, generation && `поколение ${generation}`, years && `${years} г`].filter(Boolean).join(", "));
  }).filter(Boolean))];
  if (!variants.length) return "";
  const visible = variants.slice(0, 3);
  const remainder = variants.length - visible.length;
  return `Совместимость: ${visible.join("; ")}${remainder ? `; ещё ${remainder}` : ""}.`;
}

export function numericPrice(value) {
  return Number(String(value ?? "").replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
}

export function formatPartPrice(value) {
  const price = numericPrice(value);
  return price ? `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(price)} ₽` : "Цена по запросу";
}

export function createProductContent({ item, product, brand, model, category, overrides = {} }) {
  const article = validatedArticle(item, overrides);
  const condition = validatedCondition(item, overrides);
  const origin = validatedOrigin(item, overrides);
  const detail = partName(item, brand, model, article, overrides);
  const publicBrand = normalizePublicName(brand?.name || item?.brand);
  const publicModel = normalizePublicName(model?.name || item?.model);
  const vehicle = clean([publicBrand, publicModel].filter(Boolean).join(" "));
  const h1 = clean([detail, vehicle].filter(Boolean).join(" "));
  const title = productTitle(detail, vehicle, article);
  const price = numericPrice(item?.price);
  const priceLabel = formatPartPrice(item?.price);
  const facts = [
    article ? `OEM — ${article}` : "",
    condition ? `Состояние — ${condition.toLocaleLowerCase("ru")}` : "",
    origin ? `Происхождение — ${origin}` : "",
  ].filter(Boolean);
  const description = [
    `${h1}${facts.length ? `. ${facts.join(". ")}` : ""}.`,
    compatibilitySummary(item, publicBrand, publicModel),
    `${price ? `Цена детали — ${priceLabel}` : "Цена детали уточняется"}; доставка из Китая рассчитывается отдельно.`,
    "Совместимость проверим по VIN.",
    "Минимальная сумма заказа — 50 000 ₽. В один заказ можно включить несколько деталей.",
  ].join(" ");
  const cardDescription = "Цена — за деталь. Доставка отдельно. Проверка по VIN.";
  const quickDescription = `${cardDescription} Минимальная сумма заказа — 50 000 ₽; детали можно объединить.`;
  const meta = [publicBrand, publicModel, article && `OEM ${article}`, condition].filter(Boolean).join(" · ");
  return {
    sourceId: String(item?.id || product?.source_id || ""), productId: String(product?.product_id || ""),
    detail, h1, title, article, condition, origin, price, priceLabel,
    description, cardDescription, quickDescription, meta, category: category?.name || product?.public_category || item?.category || "Запчасть",
  };
}

export function schemaCondition(value) {
  if (value === "Новое") return "https://schema.org/NewCondition";
  if (value === "Б/у") return "https://schema.org/UsedCondition";
  return "";
}

export const catalogOrderRule = "Минимальная сумма заказа — 50 000 ₽. В один заказ можно включить несколько деталей.";
