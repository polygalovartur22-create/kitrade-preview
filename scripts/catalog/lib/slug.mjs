const CYRILLIC_MAP = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h",
  ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(value) {
  const transliterated = String(value ?? "")
    .normalize("NFKD")
    .toLocaleLowerCase("ru")
    .split("")
    .map((character) => CYRILLIC_MAP[character] ?? character)
    .join("");

  return transliterated
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function stableSlug(name, id, existingSlugs = new Set(), { alwaysAppendId = false, maxBaseLength = 88 } = {}) {
  let base = slugify(name) || "item";
  base = base.slice(0, maxBaseLength).replace(/-+$/g, "") || "item";
  let candidate = alwaysAppendId ? `${base}-${id}` : base;
  if (existingSlugs.has(candidate)) candidate = `${base}-${id}`;
  if (existingSlugs.has(candidate)) throw new Error(`Unable to create a unique slug for ${name} (${id})`);
  return candidate;
}

export function normalizedSourceName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}
