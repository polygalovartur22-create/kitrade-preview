import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputsDir = process.env.KITRADE_DIRECT_OUTPUTS
  ? path.resolve(process.env.KITRADE_DIRECT_OUTPUTS)
  : path.resolve(projectDir, "../../..", "crm main", "outputs");
const targetPath = path.join(projectDir, "seo", "direct-semantics.json");
const norm = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru").replaceAll("ё", "е");

function rows(relativePath, separator = ";") {
  const filePath = path.join(outputsDir, relativePath);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split(separator).map((entry) => entry.replace(/^"|"$/g, ""));
  return lines.map((line) => Object.fromEntries(line.split(separator).map((value, index) => [headers[index], value.replace(/^"|"$/g, "").replaceAll('""', '"')])));
}

const phrases = new Map();
const variants = new Map();
const ensure = (type, brand, model = "") => {
  const key = type === "brand" ? norm(brand) : `${norm(brand)}|${norm(model)}`;
  const full = `${type}:${key}`;
  if (!phrases.has(full)) phrases.set(full, { type, key, brand, model, candidates: [] });
  return phrases.get(full);
};
const add = (type, brand, model, phrase, source, score = 0) => {
  const value = String(phrase || "").trim().replace(/\s+/g, " ");
  if (!value || value.length > 90 || /(^|\s)-!/.test(value)) return;
  ensure(type, brand, model).candidates.push({ phrase: value, source, score });
};
const addVariant = (brand, model, value) => {
  const key = `${norm(brand)}|${norm(model)}`;
  if (!variants.has(key)) variants.set(key, new Set());
  if (String(value || "").trim()) variants.get(key).add(String(value).trim());
};

for (const row of rows("yandex_direct_model_keywords_2026-07-21/selected_model_keywords.csv")) {
  const volume = Number(row["Запросов за месяц"]) || 0;
  add("model", row["Марка"], row["Модель"], row["Ключевая фраза для Директа"], "selected_model_keywords", 500 + volume);
  if (row["Вариант написания"]) addVariant(row["Марка"], row["Модель"], row["Вариант написания"]);
}

for (const row of rows("yandex_direct_used_2026-07-27/used_keyword_plan.csv")) {
  const type = row.group_type === "MODEL" ? "model" : row.group_type === "BRAND" ? "brand" : "";
  if (type) add(type, row.brand, row.model, row.keyword, "used_keyword_plan", 150);
}

for (const row of rows("yandex_direct_new_expansion_2026-07-27/new_keyword_full_plan.csv")) {
  const parts = String(row.group_name || "").split("|").map((entry) => entry.trim());
  if (parts[0] === "BRAND" && parts[1]) add("brand", parts[1], "", row.keyword, "new_keyword_full_plan", row.source === "CURRENT" ? 350 : 300);
  if (parts[0] === "MODEL" && parts[1] && parts[2]) add("model", parts[1], parts[2], row.keyword, "new_keyword_full_plan", row.source === "CURRENT" ? 350 : 300);
}

for (const file of ["used_cyrillic_additions.csv", "new_cyrillic_additions.csv"]) {
  for (const row of rows(`yandex_direct_cyrillic_models_2026-07-27/${file}`)) {
    const parts = String(row.group_name || "").split("|").map((entry) => entry.trim());
    if (parts[0] !== "MODEL" || !parts[1] || !parts[2]) continue;
    add("model", parts[1], parts[2], row.keyword, file.replace(".csv", ""), row.tier === "standard" ? 240 : 180);
    addVariant(parts[1], parts[2], row.alias);
  }
}

function select(entry) {
  const unique = [...new Map(entry.candidates.map((candidate) => [norm(candidate.phrase), candidate])).values()]
    .sort((left, right) => {
      const leftPrimary = !/\b(?:бу|б\s+у)\b/i.test(left.phrase) ? 60 : 0;
      const rightPrimary = !/\b(?:бу|б\s+у)\b/i.test(right.phrase) ? 60 : 0;
      return (right.score + rightPrimary) - (left.score + leftPrimary) || left.phrase.length - right.phrase.length;
    });
  const primary = unique[0]?.phrase || "";
  const secondary = unique.filter((candidate) => norm(candidate.phrase) !== norm(primary)).slice(0, 6).map((candidate) => candidate.phrase);
  return { primary_query: primary, secondary_queries: secondary, sources: [...new Set(unique.map((candidate) => candidate.source))] };
}

const result = {
  version: 1,
  generated_from: [
    "yandex_direct_model_keywords_2026-07-21",
    "yandex_direct_used_2026-07-27",
    "yandex_direct_new_expansion_2026-07-27",
    "yandex_direct_cyrillic_models_2026-07-27",
  ],
  brands: {}, models: {},
};
for (const entry of phrases.values()) {
  const selected = select(entry);
  if (!selected.primary_query) continue;
  const value = { canonical_brand: entry.brand, ...selected };
  if (entry.type === "model") {
    value.canonical_model = entry.model;
    value.model_variants = [...(variants.get(entry.key) || [])];
    result.models[entry.key] = value;
  } else {
    value.brand_variants = [...new Set(entry.candidates.map(({ phrase }) => {
      const match = phrase.match(/(?:авто)?запчасти\s+(?:для\s+)?(.+)$/i);
      return match?.[1]?.trim() || "";
    }).filter((variant) => variant && variant.split(/\s+/).length <= 4))];
    result.brands[entry.key] = value;
  }
}

fs.writeFileSync(targetPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Direct semantics imported: ${Object.keys(result.brands).length} brands, ${Object.keys(result.models).length} models.`);
