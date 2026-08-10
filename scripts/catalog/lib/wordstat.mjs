const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const norm = (value) => clean(value).toLocaleLowerCase("ru-RU").replaceAll("ё", "е");

export function phraseMatchSet(value) {
  return norm(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "ru"))
    .join("|");
}

function uniqueTake(values, count) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const query = clean(value);
    const key = norm(query);
    if (query && !seen.has(key)) {
      seen.add(key);
      result.push(query);
    }
    if (result.length === count) break;
  }
  return result;
}

export function buildNonCategoryHypotheses(seoRows, appliedPriorities = {}) {
  const pages = seoRows.filter((row) => ["catalog", "brand", "model"].includes(row.page_type));
  return pages.flatMap((page) => {
    const vehicle = clean([page.brand, page.model].filter(Boolean).join(" "));
    const applied = page.page_type === "catalog"
      ? appliedPriorities.catalog
      : page.page_type === "brand"
        ? appliedPriorities.brands?.[norm(page.brand)]
        : appliedPriorities.models?.[`${norm(page.brand)}|${norm(page.model)}`];
    const candidates = page.page_type === "catalog"
      ? [page.primary_query, "каталог автозапчастей из Китая", "автозапчасти из Китая", "запчасти из Китая", "купить автозапчасти", "заказать автозапчасти", "каталог автозапчастей", "интернет-магазин автозапчастей", "магазин автозапчастей", "запчасти для китайских автомобилей", "доставка запчастей из Китая"]
      : page.page_type === "brand"
        ? [page.primary_query, `запчасти ${page.brand}`, `автозапчасти ${page.brand}`, `каталог запчастей ${page.brand}`, `купить запчасти ${page.brand}`, `заказать запчасти ${page.brand}`, `магазин запчастей ${page.brand}`, `цены на запчасти ${page.brand}`, `запчасти ${page.brand} из Китая`, `автозапчасти ${page.brand} из Китая`, `оригинальные запчасти ${page.brand}`, `контрактные запчасти ${page.brand}`, `детали ${page.brand}`]
        : [page.primary_query, `запчасти ${vehicle}`, `автозапчасти ${vehicle}`, `каталог запчастей ${vehicle}`, `купить запчасти ${vehicle}`, `заказать запчасти ${vehicle}`, `магазин запчастей ${vehicle}`, `цены на запчасти ${vehicle}`, `запчасти ${vehicle} из Китая`, `автозапчасти ${vehicle} из Китая`, `оригинальные запчасти ${vehicle}`, `контрактные запчасти ${vehicle}`, `детали ${vehicle}`, `каталог автозапчастей ${vehicle}`];
    const expectedCount = page.page_type === "catalog" ? 11 : page.page_type === "brand" ? 12 : 13;
    const queries = uniqueTake(candidates, expectedCount);
    if (queries.length !== expectedCount) throw new Error(`Wordstat hypothesis count differs for ${page.canonical_path}`);
    return queries.map((query, index) => ({
      page_type: page.page_type,
      canonical_path: page.canonical_path,
      entity_id: page.entity_id,
      brand: page.brand || "",
      model: page.model || "",
      original_hypothesis: query,
      query_type: index === 0 ? "current_primary" : `alternative_${index}`,
      priority_selected: index === 0,
      priority_applied: index === 0 && Boolean(applied),
      ...(index === 0 && applied?.display_name ? { display_name: applied.display_name } : {}),
      ...(index === 0 && applied?.previous_primary_query ? { previous_primary_query: applied.previous_primary_query } : {}),
    }));
  });
}

function validateNonCategoryObservation(row) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!["catalog", "brand", "model"].includes(row?.page_type)) throw new Error("Invalid non-category Wordstat page type");
  if (!row.canonical_path || !row.original_hypothesis || !row.actually_submitted_query) throw new Error(`Incomplete Wordstat observation: ${row?.canonical_path || "unknown"}`);
  if (!row.phrase_query || !Number.isInteger(row.phrase_frequency) || row.phrase_frequency < 0) throw new Error(`Invalid Wordstat frequency: ${row.canonical_path}`);
  if (!row.phrase_match_set || row.phrase_match_set !== phraseMatchSet(row.original_hypothesis)) throw new Error(`Invalid phrase-match set: ${row.canonical_path}`);
  if (row.operator_mode !== "phrase_match_quotes" || row.region !== "Россия" || row.region_id !== 225) throw new Error(`Invalid Wordstat operator or region: ${row.canonical_path}`);
  if (!row.observed_at || !datePattern.test(row.period_from) || !datePattern.test(row.period_to) || !row.result_source) throw new Error(`Incomplete Wordstat observation dates/source: ${row.canonical_path}`);
  if (row.strict_order_query) {
    if (!Number.isInteger(row.strict_order_frequency) || row.strict_order_frequency < 0
      || row.strict_order_operator_mode !== "phrase_and_strict_order"
      || row.strict_order_region !== "Россия" || row.strict_order_region_id !== 225
      || !row.strict_order_observed_at || !datePattern.test(row.strict_order_period_from)
      || !datePattern.test(row.strict_order_period_to) || !row.strict_order_result_source) {
      throw new Error(`Incomplete strict-order Wordstat observation: ${row.canonical_path}`);
    }
  }
}

export function deriveWordstatPriorities(wordstatAudit = {}) {
  const observations = wordstatAudit.non_category_results || [];
  observations.forEach(validateNonCategoryObservation);
  const selected = observations.filter((row) => row.priority_selected === true);
  const pagePaths = new Set(observations.map((row) => row.canonical_path));
  if (selected.length !== pagePaths.size) throw new Error("Every non-category page must have exactly one observed Wordstat priority");
  if (new Set(selected.map((row) => row.canonical_path)).size !== selected.length) throw new Error("A non-category page has more than one Wordstat priority");

  const priorities = { catalog: null, brands: {}, models: {}, categories: wordstatAudit.priorities?.categories || {} };
  for (const row of selected.filter((entry) => entry.priority_applied === true)) {
    const entry = { primary_query: row.original_hypothesis, frequency: row.phrase_frequency };
    if (row.display_name) entry.display_name = row.display_name;
    if (row.previous_primary_query) entry.previous_primary_query = row.previous_primary_query;
    if (row.page_type === "catalog") priorities.catalog = entry;
    if (row.page_type === "brand") priorities.brands[norm(row.brand)] = entry;
    if (row.page_type === "model") priorities.models[`${norm(row.brand)}|${norm(row.model)}`] = entry;
  }
  if (!priorities.catalog) throw new Error("Catalog Wordstat priority has no source observation");
  return priorities;
}

export function computeWordstatSummary(wordstatAudit = {}) {
  const nonCategory = wordstatAudit.non_category_results || [];
  nonCategory.forEach(validateNonCategoryObservation);
  const categoryPages = wordstatAudit.category_results || [];
  const categoryQueries = categoryPages.flatMap((page) => (page.checked_queries || []).map((query) => ({ ...query, canonical_path: page.canonical_path })));
  const allQueries = [
    ...nonCategory.map((row) => ({ ...row, strict_order_frequency: row.strict_order_frequency })),
    ...categoryQueries,
  ];
  const key = (row) => `${row.canonical_path}|${row.phrase_match_set}`;
  const nonCategoryPaths = new Set(nonCategory.map((row) => row.canonical_path));
  const categoryDemandPages = categoryPages.filter((page) => (page.checked_queries || []).some((query) => query.phrase_frequency > 0));
  const selected = nonCategory.filter((row) => row.priority_selected === true);
  return {
    non_category_query_strings_checked: nonCategory.length,
    non_category_pages_checked: nonCategoryPaths.size,
    non_category_pages_with_demand: new Set(nonCategory.filter((row) => row.phrase_frequency > 0).map((row) => row.canonical_path)).size,
    non_category_unique_phrase_match_sets: new Set(nonCategory.map(key)).size,
    query_strings_checked: allQueries.length,
    unique_phrase_match_sets: new Set(allQueries.map(key)).size,
    phrase_query_strings_with_demand: allQueries.filter((row) => row.phrase_frequency > 0).length,
    unique_phrase_match_sets_with_demand: new Set(allQueries.filter((row) => row.phrase_frequency > 0).map(key)).size,
    strict_order_queries_checked: allQueries.filter((row) => row.strict_order_query).length,
    strict_order_queries_with_demand: allQueries.filter((row) => row.strict_order_query && row.strict_order_frequency > 0).length,
    category_pages_checked: categoryPages.length,
    category_pages_with_demand: categoryDemandPages.length,
    zero_demand_categories: categoryPages.length - categoryDemandPages.length,
    catalog_changes: selected.filter((row) => row.page_type === "catalog" && row.priority_applied === true).length,
    brand_changes: selected.filter((row) => row.page_type === "brand" && row.priority_applied === true).length,
    model_changes: selected.filter((row) => row.page_type === "model" && row.priority_applied === true).length,
    applied_catalog_changes: selected.filter((row) => row.page_type === "catalog" && row.priority_applied === true).length,
    applied_brand_changes: selected.filter((row) => row.page_type === "brand" && row.priority_applied === true).length,
    applied_model_changes: selected.filter((row) => row.page_type === "model" && row.priority_applied === true).length,
    applied_category_primary_queries: Object.keys(wordstatAudit.priorities?.categories || {}).length,
    primary_queries_changed_in_this_run: 0,
  };
}
