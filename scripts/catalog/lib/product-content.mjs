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
    .replace(/([\p{L}\p{N}])\(/gu, "$1 (")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,;:])(?=\S)/g, "$1 ")
    .replace(/[,;:/\-–—]+$/g, "")
    .trim();
}

const FANG_CHENG_BAO_5 = "Fang Cheng Bao 5 (Leopard 5)";

function normalizePublicEntities(value) {
  return clean(value)
    .replace(/\b(?:BYD\s+)?(?:Fang\s*Cheng\s*Bao|FangChengBao)(?:\s+Fang\s*Cheng\s*Bao)?\s+(?:(?:Bao|Leopard)\s*)?5(?:\s*\(Leopard\s*5\))?/gi, FANG_CHENG_BAO_5)
    .replace(/\bBYD\s+Leopard\s*5\b(?:\s*\(Leopard\s*5\))?/gi, FANG_CHENG_BAO_5)
    .replace(/Fang Cheng Bao 5 \(Leopard 5\)(?:\s*\(Leopard\s*5\))+/gi, FANG_CHENG_BAO_5)
    .replace(/\bPolar\s+Polar\s+Stone\s*\(Jishi\)\s*01\b/gi, "Polar Stone (Jishi) 01")
    .replace(/\bBmw\b/g, "BMW")
    .replace(/\bLivan\s+X3\s+pro\b/gi, "Livan X3 Pro")
    .replace(/\bLivan\s+X6\s+pro\b/gi, "Livan X6 Pro")
    .replace(/\bChangan\s+Uni-K\b/gi, "Changan UNI-K");
}

export function normalizePublicName(value) {
  return normalizePublicEntities(balancePunctuation(value))
    .replace(/\bpro\b/gi, "Pro")
    .replace(/\bplus\b/gi, "Plus")
    .replace(/\bmax\b/gi, "Max");
}

export function publicVehicleNames(brand, model) {
  const publicBrand = normalizePublicName(brand?.name || brand);
  const publicModel = normalizePublicName(model?.name || model);
  const key = `${norm(publicBrand)}|${norm(publicModel)}`;
  if (key === "fang cheng bao|bao 5 (leopard 5)" || /leopard\s*5|bao\s*5/i.test(publicModel) && norm(publicBrand) === "fang cheng bao") {
    return [FANG_CHENG_BAO_5];
  }

  const modelAlreadyContainsBrand = publicBrand && norm(publicModel).startsWith(`${norm(publicBrand)} `);
  const full = normalizePublicName(modelAlreadyContainsBrand ? publicModel : [publicBrand, publicModel].filter(Boolean).join(" "));
  const names = [full];
  if (key === "changan|shenlan (deepal) s07") names.push("Changan Deepal S07");
  if (/\s*\(China\)$/i.test(publicModel)) names.push(normalizePublicName(`${publicBrand} ${publicModel.replace(/\s*\(China\)$/i, "")}`));
  return [...new Set(names.map(normalizePublicName).filter(Boolean))];
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

const adjectiveEnding = /(?:ый|ий|ой|ая|яя|ое|ее|ые|ие|ого|его|ому|ему|ым|им|ом|ем|ую|юю|ых|их|ыми|ими)$/iu;
const genericPartWords = new Set(["часть", "элемент", "комплект", "узел", "деталь"]);
const functionWords = new Set(["для", "на", "в", "во", "из", "и", "с", "со", "по", "к", "от", "под", "над", "поколение", "рестайлинг", "оригинал"]);
const criticalPartWord = /^(?:лев|прав|передн|задн|верхн|нижн|центральн|боков|внутренн|наружн|дневн|ходов|габарит|противотуман|светов|стоп|поворот|парковоч|панорам|впускн|выпускн)/iu;

const wordToken = (value) => clean(value).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const normalizedWord = (value) => norm(wordToken(value));
const isWordCandidate = (value) => {
  const token = normalizedWord(value);
  return token.length >= 3 && !functionWords.has(token) && !/^\d|^[ivx]+$/i.test(token) && !adjectiveEnding.test(token);
};

export function mainPartNoun(value, vehicleNames = []) {
  let detail = normalizePublicName(value);
  for (const vehicle of [...vehicleNames].sort((left, right) => right.length - left.length)) {
    detail = detail.replace(new RegExp(escapeRegExp(vehicle), "giu"), " ");
  }
  const candidates = detail.split(/\s+/).map(wordToken).filter(Boolean).filter(isWordCandidate);
  return candidates.find((token) => !genericPartWords.has(norm(token))) || candidates[0] || "";
}

function hasMainPartNoun(value, expectedNoun) {
  if (!expectedNoun) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(expectedNoun)}(?=$|[^\\p{L}\\p{N}])`, "iu").test(value);
}

function hasDanglingEnding(value) {
  const words = clean(value).split(/\s+/).map(wordToken).filter(Boolean);
  if (!words.length) return true;
  return /(?:ого|его)$/iu.test(words.at(-1));
}

function validDetailVariant(value, expectedNoun) {
  const text = clean(value);
  return Boolean(text)
    && (text.match(/\(/g) || []).length === (text.match(/\)/g) || []).length
    && hasMainPartNoun(text, expectedNoun)
    && !hasDanglingEnding(text);
}

function simplifiedDetailVariants(value) {
  const full = normalizePublicName(value);
  const withoutGeneration = clean(full
    .replace(/,?\s*поколение\s+[IVX]+(?:\s+рестайлинг)?/giu, "")
    .replace(/,?\s*(?:19|20)\d{2}\s*[–—-]\s*(?:19|20)\d{2}/gu, "")
    .replace(/,?\s*(?:19|20)\d{2}/gu, ""));
  const withoutOptionalWords = clean(withoutGeneration.replace(/\b(?:нов(?:ый|ая|ое)|оригинал(?:ьн(?:ый|ая|ое))?)\b/giu, ""));
  const beforeExplanation = clean(withoutOptionalWords.split(/[,;]\s*/)[0]);
  const withoutParenthetical = clean(withoutOptionalWords.replace(/\s*\([^)]*\)/g, ""));
  return [...new Set([full, withoutGeneration, withoutOptionalWords, beforeExplanation, withoutParenthetical].filter(Boolean))];
}

function essentialDetail(value, expectedNoun) {
  const words = normalizePublicName(value).split(/\s+/).filter(Boolean);
  const normalized = words.map(normalizedWord);
  let nounIndex = normalized.findIndex((token, index) => token === norm(expectedNoun) && wordToken(words[index]));
  if (nounIndex < 0) nounIndex = normalized.findIndex((token) => isWordCandidate(token));
  if (nounIndex < 0) return "";

  const selected = new Set([nounIndex]);
  for (let index = 0; index < words.length; index += 1) {
    if (criticalPartWord.test(normalized[index])) selected.add(index);
    if (/\b(?:дверь|шторка|молдинг|телевизор)\b/iu.test(normalized[index])) selected.add(index);
  }
  const nextNoun = normalized.findIndex((token, index) => index > nounIndex && isWordCandidate(token));
  if (nextNoun > nounIndex) selected.add(nextNoun);
  for (const index of [...selected]) {
    if (!/(?:ого|его)$/iu.test(normalized[index])) continue;
    const completion = normalized.findIndex((token, candidateIndex) => candidateIndex > index && isWordCandidate(token));
    if (completion > index) selected.add(completion);
  }
  return clean(words.filter((_, index) => selected.has(index)).join(" "));
}

function knownCompactDetail(value) {
  const text = normalizePublicName(value);
  if (/противотуман/iu.test(text) && /фонар/iu.test(text)) {
    const side = text.match(/(?:^|\s)(лев\S*|прав\S*)(?=$|\s)/iu)?.[1] || "";
    const position = side ? "" : text.match(/(?:^|\s)(передн\S*|задн\S*)(?=$|\s)/iu)?.[1] || "";
    return clean(["Фонарь ПТФ", side || position].filter(Boolean).join(" "));
  }
  if (/противотуман/iu.test(text) && /фар/iu.test(text)) {
    const side = text.match(/(?:^|\s)(лев\S*|прав\S*)(?=$|\s)/iu)?.[1] || "";
    return clean(["Фара ПТФ", side].filter(Boolean).join(" "));
  }
  if (/(?:^|\s)(?:дневн\S*\s+)?ходов\S*\s+огонь(?=$|\s)/iu.test(text)) {
    const side = text.match(/(?:^|\s)(лев\S*|прав\S*)(?=$|\s)/iu)?.[1] || "";
    return clean(["Ходовой огонь", side].filter(Boolean).join(" "));
  }
  if (/габарит/iu.test(text) && /фонар/iu.test(text)) {
    const side = text.match(/(?:^|\s)(лев\S*|прав\S*)(?=$|\s)/iu)?.[1] || "";
    return clean(["Габаритный фонарь", side].filter(Boolean).join(" "));
  }
  return "";
}

function minimalDetail(value, expectedNoun) {
  const words = normalizePublicName(value).split(/\s+/).filter(Boolean);
  const normalized = words.map(normalizedWord);
  const nounIndex = normalized.findIndex((token) => token === norm(expectedNoun));
  if (nounIndex < 0) return "";
  const selected = [];
  const genericIndex = normalized.findIndex((token, index) => index < nounIndex && genericPartWords.has(token));
  if (genericIndex >= 0) selected.push(words[genericIndex], words[nounIndex]);
  else {
    selected.push(words[nounIndex]);
    const nextNoun = normalized.findIndex((token, index) => index > nounIndex && isWordCandidate(token));
    if (nextNoun > nounIndex) selected.push(words[nextNoun]);
  }
  const side = normalized.some((token) => /^лев/iu.test(token))
    ? "слева"
    : normalized.some((token) => /^прав/iu.test(token)) ? "справа" : "";
  const position = side ? "" : normalized.some((token) => /^передн/iu.test(token))
    ? "спереди"
    : normalized.some((token) => /^задн/iu.test(token)) ? "сзади"
      : normalized.some((token) => /^верхн/iu.test(token)) ? "сверху"
        : normalized.some((token) => /^нижн/iu.test(token)) ? "снизу" : "";
  return normalizePublicName(`${selected.join(" ")}${side || position ? `, ${side || position}` : ""}`);
}

function completedPrefix(value, max, expectedNoun) {
  const words = normalizePublicName(value).split(/\s+/).filter(Boolean);
  const selected = [];
  for (const word of words) {
    const candidate = clean([...selected, word].join(" "));
    if (candidate.length > max && validDetailVariant(selected.join(" "), expectedNoun)) break;
    selected.push(word);
  }
  while (selected.length < words.length && !validDetailVariant(selected.join(" "), expectedNoun)) selected.push(words[selected.length]);
  const result = clean(selected.join(" "));
  return result.length <= max && validDetailVariant(result, expectedNoun) ? result : "";
}

export function buildProductTitle({ detail, vehicleNames, article = "", qualifier = "" }) {
  const normalizedDetail = normalizePublicName(detail);
  const normalizedVehicles = [...new Set((vehicleNames || []).map(normalizePublicName).filter(Boolean))];
  if (!normalizedVehicles.length) normalizedVehicles.push("");
  const expectedNoun = mainPartNoun(normalizedDetail);
  const suffix = article ? `, ${article} | KITRADE` : " | KITRADE";
  const qualifierText = clean(qualifier);
  const detailVariants = simplifiedDetailVariants(normalizedDetail);
  const knownCompact = knownCompactDetail(normalizedDetail);
  if (knownCompact) detailVariants.push(knownCompact);
  const essential = essentialDetail(normalizedDetail, expectedNoun);
  if (essential) detailVariants.push(essential);
  const minimal = minimalDetail(normalizedDetail, expectedNoun);
  if (minimal) {
    detailVariants.push(minimal);
    const minimalCore = clean(minimal.split(/,\s*/)[0]);
    if (minimalCore !== minimal) detailVariants.push(minimalCore);
  }

  for (const detailVariant of [...new Set(detailVariants)]) {
    if (!validDetailVariant(detailVariant, expectedNoun)) continue;
    for (const vehicle of normalizedVehicles) {
      const title = `${clean([detailVariant, vehicle, qualifierText].filter(Boolean).join(" "))}${suffix}`;
      if ([...title].length <= 75) return title;
    }
  }

  for (const vehicle of [...normalizedVehicles].sort((left, right) => left.length - right.length)) {
    const available = 75 - [...`${vehicle}${qualifierText ? ` ${qualifierText}` : ""}${suffix}`].length - 1;
    const completed = completedPrefix(normalizedDetail, available, expectedNoun);
    if (!completed) continue;
    const title = `${clean([completed, vehicle, qualifierText].filter(Boolean).join(" "))}${suffix}`;
    if ([...title].length <= 75) return title;
  }

  throw new Error(`Cannot build a complete product Title within 75 characters: ${normalizedDetail} / ${normalizedVehicles.join(" | ")} / ${article}`);
}

export function productTitleHasMainNoun(title, h1, brand, model) {
  const vehicles = publicVehicleNames(brand, model);
  const noun = mainPartNoun(h1, vehicles);
  return Boolean(noun) && hasMainPartNoun(title, noun);
}

export function productTitleHasVehicle(title, brand, model) {
  return publicVehicleNames(brand, model).some((vehicle) => norm(title).includes(norm(vehicle)));
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
  const detail = normalizePublicName(partName(item, brand, model, article, overrides));
  const publicBrand = normalizePublicName(brand?.name || item?.brand);
  const publicModel = normalizePublicName(model?.name || item?.model);
  const vehicleNames = publicVehicleNames(brand?.name || item?.brand, model?.name || item?.model);
  const vehicle = vehicleNames[0] || clean([publicBrand, publicModel].filter(Boolean).join(" "));
  const h1 = normalizePublicName(overrides.h1 || [detail, vehicle].filter(Boolean).join(" "));
  const title = buildProductTitle({ detail: overrides.h1 ? h1.replace(new RegExp(`${escapeRegExp(vehicle)}$`, "iu"), "").trim() || h1 : detail, vehicleNames, article });
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
    detail, h1, title, article, condition, origin, price, priceLabel, vehicle, vehicleNames,
    description, cardDescription, quickDescription, meta, category: category?.name || product?.public_category || item?.category || "Запчасть",
  };
}

export function schemaCondition(value) {
  if (value === "Новое") return "https://schema.org/NewCondition";
  if (value === "Б/у") return "https://schema.org/UsedCondition";
  return "";
}

export const catalogOrderRule = "Минимальная сумма заказа — 50 000 ₽. В один заказ можно включить несколько деталей.";
