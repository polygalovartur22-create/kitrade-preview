import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = path.join(projectDir, "dist");
const reportsDir = path.join(projectDir, "reports", "seo");
const config = JSON.parse(fs.readFileSync(path.join(projectDir, "site.config.json"), "utf8"));
const seoMap = JSON.parse(fs.readFileSync(path.join(outputDir, "seo-map.json"), "utf8"));
const urlRows = JSON.parse(fs.readFileSync(path.join(outputDir, "catalog-urls.json"), "utf8"));
const searchTargetMap = JSON.parse(fs.readFileSync(path.join(outputDir, "search-target-map.json"), "utf8"));
const categoryWordstat = JSON.parse(fs.readFileSync(path.join(reportsDir, "category-wordstat-recommendations.json"), "utf8"));
const directTargetGaps = JSON.parse(fs.readFileSync(path.join(reportsDir, "direct-target-gaps.json"), "utf8"));
const sitemapUrls = new Set([...fs.readFileSync(path.join(outputDir, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));

const writeReport = (name, value) => fs.writeFileSync(path.join(reportsDir, name), `${JSON.stringify(value, null, 2)}\n`);
const normalizeSpace = (value) => String(value || "").replace(/\s+/g, " ").trim();
const decodeHtml = (value) => normalizeSpace(String(value || "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'")
  .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))));
const extract = (html, pattern) => html.match(pattern)?.[1] || "";
const routeForFile = (file) => {
  const relative = path.relative(outputDir, file).replaceAll(path.sep, "/");
  if (relative === "index.html") return "/";
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"index.html".length)}`;
  return `/${relative}`;
};
const listHtml = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const fullPath = path.join(dir, entry.name);
  return entry.isDirectory() ? listHtml(fullPath) : entry.name.endsWith(".html") ? [fullPath] : [];
});

const htmlPages = listHtml(outputDir).map((file) => {
  const html = fs.readFileSync(file, "utf8");
  return {
    file,
    route: routeForFile(file),
    html,
    robots: extract(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)/i) || "index,follow",
    canonical: extract(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i),
  };
});
const routeSet = new Set(htmlPages.map((page) => page.route));
const htmlByRoute = new Map(htmlPages.map((page) => [page.route, page]));
const indexablePathSet = new Set(seoMap.filter((row) => row.indexable !== false).map((row) => row.canonical_path));
const noindexPathSet = new Set(urlRows.filter((row) => !row.indexable).map((row) => row.canonical_path));
const productionOrigin = new URL(config.siteUrl).origin;

const resolveInternalRoute = (href, sourceRoute) => {
  if (!href || href.startsWith("#") || /^(?:mailto:|tel:|javascript:|data:)/i.test(href)) return null;
  let resolved;
  try {
    resolved = new URL(href, new URL(sourceRoute, `${config.siteUrl}/`));
  } catch {
    return { malformed: true, href };
  }
  if (resolved.origin !== productionOrigin) return null;
  let target = resolved.pathname;
  if (target === "/index.html") target = "/";
  else if (target.endsWith("/index.html")) target = target.slice(0, -"index.html".length);
  if (!routeSet.has(target) && routeSet.has(`${target}/`)) target = `${target}/`;
  return { href, route: target, query: resolved.search, hash: resolved.hash };
};

const edges = new Map(htmlPages.map((page) => [page.route, []]));
const incomingSources = new Map(htmlPages.map((page) => [page.route, new Set()]));
const incomingCounts = new Map(htmlPages.map((page) => [page.route, 0]));
const incomingAnchors = new Map(htmlPages.map((page) => [page.route, new Map()]));
const anchorTextCounts = new Map();
const brokenLinks = [];
const linksToNoindex = [];
const queryLinks = [];
const selfLinks = [];
const anchorIssues = [];
for (const page of htmlPages) {
  for (const match of page.html.matchAll(/<a\b([^>]*)\bhref=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = match[2];
    const anchor = decodeHtml(match[4]);
    const target = resolveInternalRoute(href, page.route);
    if (!target) continue;
    if (target.malformed) {
      brokenLinks.push({ source: page.route, href, reason: "malformed_url" });
      continue;
    }
    if (target.query && indexablePathSet.has(target.route)) queryLinks.push({ source: page.route, href, canonical_target: target.route });
    if (target.route === page.route && !target.hash) selfLinks.push({ source: page.route, href, anchor });
    if (noindexPathSet.has(target.route)) linksToNoindex.push({ source: page.route, href, target: target.route, anchor });
    if (!routeSet.has(target.route)) {
      if (!path.extname(target.route)) brokenLinks.push({ source: page.route, href, target: target.route, reason: "missing_html_target" });
      continue;
    }
    edges.get(page.route).push(target.route);
    incomingSources.get(target.route).add(page.route);
    incomingCounts.set(target.route, incomingCounts.get(target.route) + 1);
    if (anchor) {
      incomingAnchors.get(target.route).set(anchor, (incomingAnchors.get(target.route).get(anchor) || 0) + 1);
      anchorTextCounts.set(anchor, (anchorTextCounts.get(anchor) || 0) + 1);
    }
    if (!anchor && !/aria-label=["'][^"']+/i.test(`${match[1]} ${match[3]}`)) {
      anchorIssues.push({ source: page.route, target: target.route, href, reason: "empty_anchor_without_aria_label" });
    }
  }
}

const depth = new Map([["/", 0]]);
const queue = ["/"];
for (let index = 0; index < queue.length; index += 1) {
  const source = queue[index];
  for (const target of new Set(edges.get(source) || [])) {
    if (depth.has(target)) continue;
    depth.set(target, depth.get(source) + 1);
    queue.push(target);
  }
}

const extractBreadcrumb = (html) => {
  const source = extract(html, /<nav[^>]+class=["'][^"']*catalog-breadcrumbs[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i);
  if (!source) return { present: false, labels: [], linked_paths: [], current_label: "" };
  const labels = [...source.matchAll(/<(?:a|span)\b[^>]*>([\s\S]*?)<\/(?:a|span)>/gi)]
    .map((match) => decodeHtml(match[1])).filter((label) => label && label !== "/");
  const linkedPaths = [...source.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => resolveInternalRoute(match[1], "/")?.route).filter(Boolean);
  return {
    present: true,
    labels,
    linked_paths: linkedPaths,
    current_label: decodeHtml(extract(source, /<span[^>]+aria-current=["']page["'][^>]*>([\s\S]*?)<\/span>/i)),
  };
};
const hierarchyTargets = (row) => {
  const targets = ["/", "/catalog/"];
  if (row.page_type === "home") return [];
  if (row.page_type === "catalog" || row.page_type === "service") return ["/"];
  const brand = seoMap.find((candidate) => candidate.page_type === "brand" && candidate.brand === row.brand);
  const model = seoMap.find((candidate) => candidate.page_type === "model" && candidate.brand === row.brand && candidate.model === row.model);
  const category = seoMap.find((candidate) => candidate.page_type === "category" && candidate.brand === row.brand && candidate.model === row.model && candidate.category === row.category);
  if (brand && row.page_type !== "brand") targets.push(brand.canonical_path);
  if (model && !["brand", "model"].includes(row.page_type)) targets.push(model.canonical_path);
  if (category && row.page_type === "product") targets.push(category.canonical_path);
  return [...new Set(targets)].filter((target) => target !== row.canonical_path);
};

const internalPages = seoMap.map((row) => {
  const page = htmlByRoute.get(row.canonical_path);
  const breadcrumb = extractBreadcrumb(page?.html || "");
  const requiredHierarchy = hierarchyTargets(row);
  const outgoing = new Set(edges.get(row.canonical_path) || []);
  const missingHierarchy = requiredHierarchy.filter((target) => !outgoing.has(target));
  const errors = [];
  if (!page) errors.push("missing_html");
  if (!depth.has(row.canonical_path)) errors.push("unreachable_from_home");
  if (row.canonical_path !== "/" && (incomingSources.get(row.canonical_path)?.size || 0) === 0) errors.push("orphan");
  if (missingHierarchy.length) errors.push("missing_expected_hierarchy_links");
  const pageBroken = brokenLinks.filter((link) => link.source === row.canonical_path);
  if (pageBroken.length) errors.push("broken_outgoing_links");
  const pageNoindex = linksToNoindex.filter((link) => link.source === row.canonical_path);
  if (pageNoindex.length) errors.push("links_to_noindex");
  const appliedFixes = [];
  if (row.canonical_path.startsWith("/catalog/") && row.canonical_path !== "/catalog/") appliedFixes.push("existing_catalog_navigation_now_links_to_catalog_root");
  if (row.page_type === "category") appliedFixes.push("existing_model_filter_now_contains_static_model_links");
  return {
    canonical_path: row.canonical_path,
    page_type: row.page_type,
    incoming_internal_links: incomingCounts.get(row.canonical_path) || 0,
    unique_incoming_pages: incomingSources.get(row.canonical_path)?.size || 0,
    outgoing_internal_links: outgoing.size,
    depth_from_home: depth.get(row.canonical_path) ?? null,
    expected_hierarchy_targets: requiredHierarchy,
    missing_hierarchy_targets: missingHierarchy,
    incoming_anchor_texts: [...(incomingAnchors.get(row.canonical_path) || new Map()).entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru")).slice(0, 10)
      .map(([anchor, count]) => ({ anchor, count })),
    breadcrumb,
    pagination: {
      page_number: Number(row.canonical_path.match(/\/page\/(\d+)\/$/)?.[1] || 1),
      linked_pagination_pages: [...outgoing].filter((target) => /\/page\/\d+\/$/.test(target)),
    },
    errors,
    noindex_links: pageNoindex,
    fixes_applied: appliedFixes,
    decision: errors.length ? "review_required" : "keep_current_visible_linking",
  };
});
const internalProblemPages = internalPages.filter((page) => page.errors.length);
const priorityBrands = new Set(["Voyah", "Geely", "Haval", "Chery", "Changan", "Tank", "Omoda", "Zeekr"]);
const priorityProductSample = internalPages.filter((page) => page.page_type === "product")
  .sort((a, b) => Number(priorityBrands.has(seoMap.find((row) => row.canonical_path === b.canonical_path)?.brand))
    - Number(priorityBrands.has(seoMap.find((row) => row.canonical_path === a.canonical_path)?.brand))
    || a.canonical_path.localeCompare(b.canonical_path, "ru"))
  .slice(0, 20);

writeReport("internal-linking-audit.json", {
  audit_version: 1,
  scope: "all indexable pages in seo-map.json; incoming links are counted from every generated HTML page",
  summary: {
    indexable_pages_checked: internalPages.length,
    html_pages_scanned: htmlPages.length,
    orphan_pages: internalPages.filter((page) => page.errors.includes("orphan")).length,
    unreachable_pages: internalPages.filter((page) => page.errors.includes("unreachable_from_home")).length,
    broken_internal_links: brokenLinks.length,
    links_to_noindex: linksToNoindex.length,
    canonical_targets_with_query_parameters: queryLinks.length,
    empty_anchor_issues: anchorIssues.length,
    self_links_without_fragment: selfLinks.length,
    pages_missing_expected_hierarchy_links: internalPages.filter((page) => page.errors.includes("missing_expected_hierarchy_links")).length,
    max_depth_from_home: Math.max(...internalPages.map((page) => page.depth_from_home || 0)),
    pages_with_errors: internalProblemPages.length,
    fix_classes_applied: 2,
    pagination_pages_checked: htmlPages.filter((page) => /\/page\/\d+\/$/.test(page.route)).length,
    max_pagination_depth_from_home: Math.max(0, ...htmlPages.filter((page) => /\/page\/\d+\/$/.test(page.route)).map((page) => depth.get(page.route) || 0)),
    pagination_pages_deeper_than_10_clicks: htmlPages.filter((page) => /\/page\/\d+\/$/.test(page.route) && (depth.get(page.route) || 0) > 10).length,
  },
  cycle_assessment: {
    decision: "keep_intentional_navigation_cycles",
    note: "Links from child pages to parent sections and links from listings to products form expected navigation cycles. Self-links without a fragment are reported separately; redirect cycles are verified by the build verifier.",
  },
  noindex_link_assessment: {
    decision: linksToNoindex.length ? "error" : "none_found",
    note: "Noindex cards remain available to the quick-view interface, but their existing visual anchors have no crawlable href until the entity is approved for indexing.",
  },
  anchor_text_distribution: [...anchorTextCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru")).slice(0, 100)
    .map(([anchor, count]) => ({ anchor, count })),
  pagination_pages: htmlPages.filter((page) => /\/page\/\d+\/$/.test(page.route)).map((page) => ({
    route: page.route,
    incoming_internal_links: incomingCounts.get(page.route) || 0,
    unique_incoming_pages: incomingSources.get(page.route)?.size || 0,
    depth_from_home: depth.get(page.route) ?? null,
    next_pages: [...new Set(edges.get(page.route) || [])].filter((target) => /\/page\/\d+\/$/.test(target)),
    catalog_root_links: [...new Set(edges.get(page.route) || [])].filter((target) => target === "/catalog/"),
  })),
  global_errors: { broken_links: brokenLinks, links_to_noindex: linksToNoindex, query_links: queryLinks, anchor_issues: anchorIssues, self_links: selfLinks },
  priority_product_sample: priorityProductSample,
  pages: internalPages,
});

const normalizeQuery = (value) => normalizeSpace(value).toLocaleLowerCase("ru").replaceAll("ё", "е")
  .replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter(Boolean).sort().join("|");
const queryOwners = new Map();
for (const row of seoMap) {
  for (const [kind, query] of [["primary", row.primary_query], ...(row.secondary_queries || []).map((value) => ["secondary", value])]) {
    const key = normalizeQuery(query);
    if (!key) continue;
    if (!queryOwners.has(key)) queryOwners.set(key, []);
    queryOwners.get(key).push({ canonical_path: row.canonical_path, page_type: row.page_type, query_type: kind, query });
  }
}
const overlapGroups = [...queryOwners.entries()].filter(([, owners]) => new Set(owners.map((owner) => owner.canonical_path)).size > 1)
  .map(([normalized_query, owners]) => {
    const paths = [...new Set(owners.map((owner) => owner.canonical_path))];
    const primaryOwners = owners.filter((owner) => owner.query_type === "primary");
    const severity = primaryOwners.length > 1 ? "high" : primaryOwners.length === 1 ? "low" : "informational";
    return {
      normalized_query,
      owners,
      severity,
      decision: primaryOwners.length > 1 ? "keep_separate_pending_owner_confirmation" : "keep_primary_owner_secondary_overlap_is_contextual",
      recommended_owner: primaryOwners[0]?.canonical_path || paths[0],
    };
  });
const exactMetadataGroups = (field) => [...seoMap.reduce((groups, row) => {
  const value = normalizeSpace(row[field]).toLocaleLowerCase("ru");
  if (!value) return groups;
  if (!groups.has(value)) groups.set(value, []);
  groups.get(value).push(row.canonical_path);
  return groups;
}, new Map()).entries()].filter(([, paths]) => paths.length > 1)
  .map(([value, paths]) => ({ value, paths }));
const titleDuplicates = exactMetadataGroups("title");
const descriptionDuplicates = exactMetadataGroups("description");
const h1Duplicates = exactMetadataGroups("h1");
const h1DuplicateDecisions = h1Duplicates.map((group) => {
  const rows = group.paths.map((canonicalPath) => seoMap.find((row) => row.canonical_path === canonicalPath)).filter(Boolean);
  const uniquePrimaryQueries = new Set(rows.map((row) => normalizeQuery(row.primary_query))).size === rows.length;
  return {
    ...group,
    page_types: [...new Set(rows.map((row) => row.page_type))],
    primary_queries: rows.map((row) => ({ canonical_path: row.canonical_path, primary_query: row.primary_query, article_oem: row.article_oem || "", condition: row.condition || "" })),
    risk: uniquePrimaryQueries ? "low" : "high",
    decision: uniquePrimaryQueries ? "keep_separate_unique_primary_query_or_oem" : "keep_separate_pending_owner_confirmation",
  };
});
const primaryConflicts = overlapGroups.filter((group) => group.severity === "high");
writeReport("cannibalization-audit.json", {
  audit_version: 1,
  methodology: "Exact normalized ownership across primary and secondary queries plus exact Title, Description and H1 checks on all indexable pages. Parent/child pages are not treated as conflicts unless more than one page owns the same normalized primary query.",
  summary: {
    indexable_pages_checked: seoMap.length,
    primary_queries_checked: seoMap.filter((row) => row.primary_query).length,
    primary_query_conflicts: primaryConflicts.length,
    contextual_secondary_overlaps: overlapGroups.filter((group) => group.severity !== "high").length,
    duplicate_titles: titleDuplicates.length,
    duplicate_descriptions: descriptionDuplicates.length,
    duplicate_h1: h1Duplicates.length,
    pages_removed_or_noindexed: 0,
  },
  decisions: {
    merge: [], redirect: [], canonical: [], noindex: [],
    keep_separate: overlapGroups.filter((group) => group.severity !== "high"),
    keep_separate_pending_owner_confirmation: primaryConflicts,
  },
  conflicts: primaryConflicts,
  duplicate_metadata: { title: titleDuplicates, description: descriptionDuplicates, h1: h1DuplicateDecisions },
});

const commercialRows = seoMap.map((row) => {
  const html = htmlByRoute.get(row.canonical_path)?.html || "";
  const hasRequest = /(?:href=["'][^"']*#request|data-product-request|data-request-form|id=["']request["'])/i.test(html);
  const hasPhone = /href=["']tel:\+?\d+/i.test(html);
  const hasMinOrder = /50\s*000\s*₽/u.test(html);
  const explainsDelivery = /доставк[а-яё]*\s+(?:рассчитывается|рассчитает|отдельно)|цена\s*[—–-]\s*за деталь/iu.test(html);
  const hasVin = /\bVIN\b/iu.test(html);
  const hasPrice = /(?:product-page-price|part-price|₽)/u.test(html);
  const relevantGuaranteePage = row.page_type === "home";
  const hasGuarantee = /гарант|обмен|возврат/iu.test(html);
  const missing = [];
  if (!hasRequest) missing.push("request_path");
  if (!hasPhone) missing.push("phone_contact");
  if (!hasMinOrder) missing.push("minimum_order_50000");
  if (!["service"].includes(row.page_type) && !explainsDelivery) missing.push("part_price_and_delivery_explanation");
  if (!["home"].includes(row.page_type) && !hasVin) missing.push("vin_check");
  if (relevantGuaranteePage && !hasGuarantee) missing.push("guarantee_terms");
  return {
    canonical_path: row.canonical_path, page_type: row.page_type,
    checks: { request_path: hasRequest, phone_contact: hasPhone, minimum_order_50000: hasMinOrder, part_price_and_delivery_explanation: explainsDelivery, vin_check: hasVin, visible_price_or_price_context: hasPrice, guarantee_terms_on_home: !relevantGuaranteePage || hasGuarantee },
    missing,
    decision: missing.length ? "review_existing_copy_or_controls" : "keep",
  };
});
writeReport("commercial-factors-audit.json", {
  audit_version: 1,
  scope: "Existing visible commercial information and controls only; no new blocks were added.",
  confirmed_business_facts: { minimum_order_rub: 50000, discount_claim: "up to 30% for selected items", guarantee_and_return_terms: "confirmed by owner" },
  owner_confirmation_required: ["payment methods and payment timing are intentionally not published because they have not been confirmed"],
  summary: {
    pages_checked: commercialRows.length,
    pages_with_request_path: commercialRows.filter((row) => row.checks.request_path).length,
    pages_with_phone_contact: commercialRows.filter((row) => row.checks.phone_contact).length,
    pages_with_minimum_order: commercialRows.filter((row) => row.checks.minimum_order_50000).length,
    pages_with_price_delivery_explanation: commercialRows.filter((row) => row.checks.part_price_and_delivery_explanation).length,
    pages_with_vin_check: commercialRows.filter((row) => row.checks.vin_check).length,
    pages_requiring_review: commercialRows.filter((row) => row.missing.length).length,
  },
  pages: commercialRows,
});

const productCountForCategory = (categoryRow) => seoMap.filter((row) => row.page_type === "product"
  && row.brand === categoryRow.brand && row.model === categoryRow.model && row.category === categoryRow.category).length;
const zeroPages = (categoryWordstat.pages || []).filter((page) => page.demand?.status === "zero_demand").map((page) => {
  const seo = seoMap.find((row) => row.canonical_path === page.canonical_path);
  const linking = internalPages.find((row) => row.canonical_path === page.canonical_path);
  const productCount = seo ? productCountForCategory(seo) : 0;
  const reasons = [
    productCount > 0 ? "contains_current_products" : "no_current_products",
    seo?.title && seo?.description && seo?.h1 ? "unique_complete_metadata" : "incomplete_metadata",
    (linking?.unique_incoming_pages || 0) > 0 ? "has_internal_incoming_links" : "no_internal_incoming_links",
    "zero_frequency_is_not_a_standalone_noindex_signal",
  ];
  const keep = Boolean(seo?.indexable && productCount > 0 && linking?.unique_incoming_pages > 0);
  return {
    canonical_path: page.canonical_path, phrase_frequency: 0, strict_order_frequency: Math.max(0, ...page.checked_queries.map((query) => Number(query.strict_order_frequency || 0))),
    product_count: productCount, unique_incoming_pages: linking?.unique_incoming_pages || 0,
    metadata_complete: Boolean(seo?.title && seo?.description && seo?.h1),
    decision: keep ? "keep_indexable" : "manual_review_without_automatic_noindex",
    reasons,
  };
});
writeReport("zero-demand-decisions.json", {
  audit_version: 1,
  methodology: categoryWordstat.methodology,
  summary: {
    zero_demand_categories_reviewed: zeroPages.length,
    kept_indexable: zeroPages.filter((page) => page.decision === "keep_indexable").length,
    manual_review: zeroPages.filter((page) => page.decision !== "keep_indexable").length,
    noindexed_due_to_zero_frequency: 0,
  },
  pages: zeroPages,
});

const directRows = searchTargetMap.groups.map((group) => {
  const seo = seoMap.find((row) => row.canonical_path === group.canonical_path);
  const page = htmlByRoute.get(group.canonical_path);
  const landingCanonical = page?.canonical || "";
  const intentAligned = Boolean(seo && seo.search_intent === "commercial" && group.queries?.length);
  const ready = Boolean(group.match_status === "matched" && seo?.indexable && page && landingCanonical === seo.canonical_url && intentAligned);
  return {
    source_row: group.source_row, search_group: group.search_group, priority: group.priority,
    landing_path: group.canonical_path, canonical_url: landingCanonical,
    page_type: seo?.page_type || "", primary_query: seo?.primary_query || "", queries: group.queries || [],
    current_availability: { generated_html: Boolean(page), indexable: Boolean(seo?.indexable), in_sitemap: sitemapUrls.has(seo?.canonical_url) },
    intent_aligned: intentAligned, status: ready ? "ready_after_production_launch" : "not_ready",
    issues: [!page && "missing_html", !seo?.indexable && "not_indexable", landingCanonical !== seo?.canonical_url && "canonical_mismatch", !intentAligned && "intent_mismatch"].filter(Boolean),
  };
});
writeReport("direct-landing-audit.json", {
  audit_version: 1,
  scope: "All 107 source groups from search-target-map.json; this audit does not import or alter advertising semantics.",
  summary: {
    groups_checked: directRows.length,
    ready_after_production_launch: directRows.filter((row) => row.status === "ready_after_production_launch").length,
    not_ready: directRows.filter((row) => row.status !== "ready_after_production_launch").length,
    high_priority_groups: directRows.filter((row) => row.priority === "high").length,
    additional_semantic_gaps_without_current_catalog_target: directTargetGaps.length,
  },
  additional_semantic_gaps: directTargetGaps,
  groups: directRows,
});

const metadataRows = seoMap.map((row) => {
  const html = htmlByRoute.get(row.canonical_path)?.html || "";
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const visibleH1 = decodeHtml(extract(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i));
  const issues = [];
  if (!row.title || !row.description || !row.h1) issues.push("incomplete_metadata");
  if (h1Count !== 1) issues.push("h1_count_not_one");
  if (visibleH1 !== row.h1) issues.push("visible_h1_differs_from_seo_map");
  if (/(?:минимальная сумма заказа|заказ от|мин\. сумма заказа)\s*[—–:-]?\s*15\s*000|предоплата|оплата на карту/iu.test(`${row.title} ${row.description} ${row.h1} ${html}`)) issues.push("unconfirmed_or_old_commercial_claim");
  if (/доставка включена|цена с доставкой/iu.test(`${row.description} ${html}`)) issues.push("delivery_included_claim");
  return { canonical_path: row.canonical_path, page_type: row.page_type, title_length: [...row.title].length, description_length: [...row.description].length, h1_count: h1Count, issues };
});
writeReport("metadata-content-audit.json", {
  audit_version: 1,
  summary: {
    pages_checked: metadataRows.length,
    pages_with_issues: metadataRows.filter((row) => row.issues.length).length,
    duplicate_titles: titleDuplicates.length,
    duplicate_descriptions: descriptionDuplicates.length,
    duplicate_h1: h1Duplicates.length,
  },
  pages: metadataRows,
});

console.log(`SEO audits: ${internalPages.length} indexable pages, ${directRows.length} Direct groups, ${zeroPages.length} zero-demand category decisions.`);
