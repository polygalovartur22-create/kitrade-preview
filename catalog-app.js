(() => {
  const catalogHeader = document.querySelector("[data-catalog-header]");
  const catalogMenuToggle = document.querySelector("[data-catalog-menu-toggle]");
  const catalogMobileNav = document.querySelector("[data-catalog-mobile-nav]");

  function setCatalogMenu(open) {
    if (!catalogMenuToggle || !catalogMobileNav) return;

    catalogMenuToggle.setAttribute("aria-expanded", String(open));
    catalogMenuToggle.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
    catalogMobileNav.hidden = !open;
    document.body.classList.toggle("catalog-menu-open", open);
  }

  catalogMenuToggle?.addEventListener("click", () => {
    setCatalogMenu(catalogMenuToggle.getAttribute("aria-expanded") !== "true");
  });

  catalogMobileNav?.addEventListener("click", (event) => {
    if (event.target.closest("a")) setCatalogMenu(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && catalogMenuToggle?.getAttribute("aria-expanded") === "true") {
      setCatalogMenu(false);
      catalogMenuToggle.focus();
    }
  });

  const headerSentinel = document.createElement("span");
  headerSentinel.className = "catalog-header-sentinel";
  headerSentinel.setAttribute("aria-hidden", "true");
  document.body.prepend(headerSentinel);

  if ("IntersectionObserver" in window) {
    const headerObserver = new IntersectionObserver(([entry]) => {
      catalogHeader?.classList.toggle("is-scrolled", !entry.isIntersecting);
    });
    headerObserver.observe(headerSentinel);
  }

  const rawItems = Array.isArray(window.KITRADE_PARTS) ? window.KITRADE_PARTS : [];
  const urlMap = window.KITRADE_CATALOG_URLS?.products || {};
  const routeMap = window.KITRADE_CATALOG_URLS?.routes || { brands: {}, models: {}, categories: {} };
  const routeDefaults = {
    brand: document.body.dataset.catalogBrand || "",
    model: document.body.dataset.catalogModel || "",
    category: document.body.dataset.catalogCategory || "",
  };
  const items = rawItems
    .filter((item) => item && item.title
      && String(item.brand || "").trim().toLocaleLowerCase("ru") !== "маз"
      && (!urlMap[String(item.id)] || urlMap[String(item.id)].status === "active"))
    .map((item) => ({
      ...item,
      brand: item.brand || "Без марки",
      model: item.model || "Модель не указана",
      search: [item.title, item.brand, item.model, item.article, item.category, item.subcategory, item.detail]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ru"),
      group: urlMap[String(item.id)]?.public_category || getGroup(item),
      canonicalPath: urlMap[String(item.id)]?.canonical_path || "/catalog/",
      image: normalizePhoto(item.photos?.[0]) || catalogFallbackPhoto(item),
      priceNumber: Number(String(item.price || "").replace(/\D/g, "")) || 0,
    }));

  const state = {
    tab: routeDefaults.category,
    query: "",
    visible: 12,
    selected: [],
  };

  const partsGrid = document.querySelector("#partsGrid");
  const resultCount = document.querySelector("#resultCount");
  const resultSummary = document.querySelector("#resultSummary");
  const emptyState = document.querySelector("#emptyState");
  const loadMore = document.querySelector("#loadMore");
  const requestSelection = document.querySelector("#requestSelection");
  const toast = document.querySelector("#toast");
  let toastTimer;

  function normalizePhoto(url) {
    const value = String(url || "").trim();
    if (!value) return "";
    const match = value.match(/[?&]imageSlug=([^&]+)/);
    if (match) return `https://80.img.avito.st${decodeURIComponent(match[1])}`;
    return value.replace(/^http:\/\//i, "https://");
  }

  function catalogFallbackPhoto(item) {
    const subject = [item.title, item.detail, item.subcategory, item.category]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("ru");
    if (/фара|фонарь|оптика|автосвет/.test(subject)) return "/assets/01-catalog-led-headlamp.png";
    if (/крыло/.test(subject)) return "/assets/02-catalog-front-fender.png";
    if (/реш[её]тка|нижн[^ ]* бампер/.test(subject)) return "/assets/03-catalog-lower-grille.png";
    return "";
  }

  function getGroup(item) {
    const source = [item.category, item.subcategory, item.detail, item.title].filter(Boolean).join(" ").toLocaleLowerCase("ru");
    if (/фар|фонар|оптик|автосвет|дневн.*огонь/.test(source)) return "Оптика";
    if (/тормоз|суппорт|колод|диск торм/.test(source)) return "Тормозная система";
    if (/подвес|амортиз|стойк|рычаг|ступиц|пружин/.test(source)) return "Подвеска";
    if (/двигател|мотор|порш|коленвал|головк.*блок|грм/.test(source)) return "Двигатель";
    if (/салон|сиден|панел.*прибор|обшив|консол/.test(source)) return "Салон";
    if (/электр|датчик|провод|блок управ|генератор|стартер/.test(source)) return "Электрика";
    if (/кузов|крыл|бампер|капот|двер|решет|багажник|зеркал|наклад/.test(source)) return "Кузов";
    return item.category || "Запчасти";
  }

  function checkedValues(selector) {
    return [...document.querySelectorAll(`${selector} input:checked`)].map((input) => input.value).filter(Boolean);
  }

  function routeKey(...values) {
    return values.map((value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru")).join("|");
  }

  function updateCatalogRoute() {
    const brands = checkedValues("#brandFilters");
    const models = checkedValues("#modelFilters");
    const brand = brands.length === 1 ? brands[0] : "";
    const model = brand && models.length === 1 ? models[0] : "";
    const category = brand && model ? state.tab : "";
    const brandRoute = brand ? routeMap.brands?.[routeKey(brand)] : "";
    const modelRoute = model ? routeMap.models?.[routeKey(brand, model)] : "";
    const categoryRoute = category ? routeMap.categories?.[routeKey(brand, model, category)] : "";
    const path = categoryRoute || modelRoute || brandRoute || "/catalog/";
    if (window.location.pathname !== path) history.replaceState(null, "", path);
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = new URL(path, window.KITRADE_CATALOG_URLS?.site_url || window.location.origin).href;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ru", { numeric: true }));
  }

  function normalizeSearch(value) {
    return String(value || "")
      .toLocaleLowerCase("ru")
      .replaceAll("ё", "е")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function editDistanceWithin(left, right, limit) {
    if (Math.abs(left.length - right.length) > limit) return limit + 1;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const current = [leftIndex];
      let rowMinimum = current[0];
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
        current[rightIndex] = Math.min(
          current[rightIndex - 1] + 1,
          previous[rightIndex] + 1,
          previous[rightIndex - 1] + cost,
        );
        rowMinimum = Math.min(rowMinimum, current[rightIndex]);
      }
      if (rowMinimum > limit) return limit + 1;
      previous = current;
    }
    return previous[right.length];
  }

  function fuzzyScore(query, candidate) {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return 1;
    const normalizedCandidate = normalizeSearch(candidate);
    if (normalizedCandidate.includes(normalizedQuery)) return 100;

    const words = normalizedCandidate.split(" ");
    const scores = normalizedQuery.split(" ").map((token) => {
      let best = -1;
      words.forEach((word) => {
        if (word === token) best = Math.max(best, 48);
        else if (word.startsWith(token) || (token.length >= 4 && token.startsWith(word))) best = Math.max(best, 39);
        else if (token.length >= 3 && word.includes(token)) best = Math.max(best, 34);
        else if (token.length >= 3 && word.length >= 3) {
          const limit = token.length <= 4 ? 1 : token.length <= 8 ? 2 : 3;
          const distance = editDistanceWithin(token, word, limit);
          if (distance <= limit) best = Math.max(best, 29 - (distance * 4));
        }
      });
      return best;
    });
    if (scores.some((score) => score < 0)) return -1;
    return scores.reduce((total, score) => total + score, 0) / scores.length;
  }

  function updateFilterSummary(filter) {
    const selected = [...filter.querySelectorAll(".filter-options input:checked")].map((input) => input.value);
    const summary = filter.querySelector("[data-filter-summary]");
    if (!summary) return;
    if (!selected.length) {
      summary.textContent = filter.id === "brandFilters"
        ? "Все марки"
        : filter.id === "modelFilters"
          ? "Сначала выберите марку"
          : "Все категории";
      return;
    }
    summary.textContent = selected.length === 1 ? selected[0] : `Выбрано: ${selected.length}`;
  }

  function filterVisibleOptions(filter, query = "") {
    let visible = 0;
    filter.querySelectorAll(".filter-options label").forEach((label) => {
      const matches = fuzzyScore(query, label.dataset.filterValue || "") >= 0;
      label.hidden = !matches;
      if (matches) visible += 1;
    });
    const empty = filter.querySelector("[data-filter-empty]");
    if (empty) empty.hidden = visible > 0;
  }

  function renderFilterOptions(filter, values) {
    const options = filter.querySelector("[data-filter-options]");
    const selectedBrand = checkedValues("#brandFilters")[0] || routeDefaults.brand;
    const selectedModel = checkedValues("#modelFilters")[0] || routeDefaults.model;
    const hrefFor = (value) => {
      if (filter.id === "brandFilters") return routeMap.brands?.[routeKey(value)] || "/catalog/";
      if (filter.id === "modelFilters" && selectedBrand) return routeMap.models?.[routeKey(selectedBrand, value)] || "/catalog/";
      if (filter.id === "typeFilters" && selectedBrand && selectedModel) return routeMap.categories?.[routeKey(selectedBrand, selectedModel, value)] || "/catalog/";
      return "/catalog/";
    };
    options.innerHTML = values.map((value) => `
      <label data-filter-value="${escapeHtml(value)}"><input type="checkbox" value="${escapeHtml(value)}" /><a href="${escapeHtml(hrefFor(value))}" data-filter-option-link>${escapeHtml(value)}</a><i aria-hidden="true"></i></label>
    `).join("");
    const search = filter.querySelector("[data-filter-search]");
    if (search) search.value = "";
    filterVisibleOptions(filter);
    updateFilterSummary(filter);
  }

  function renderAllFilterOptions() {
    renderFilterOptions(document.querySelector("#brandFilters"), unique(items.map((item) => item.brand)));
    renderModelFilter([]);
    renderFilterOptions(document.querySelector("#typeFilters"), unique(items.map((item) => item.group)));
  }

  function renderModelFilter(brands) {
    const fieldset = document.querySelector("#modelFilters");
    const trigger = fieldset.querySelector("[data-filter-toggle]");
    const popover = fieldset.querySelector("[data-filter-popover]");
    if (!brands.length) {
      fieldset.classList.add("is-disabled");
      trigger.disabled = true;
      trigger.setAttribute("aria-expanded", "false");
      popover.hidden = true;
      fieldset.querySelector("[data-filter-options]").innerHTML = "";
      updateFilterSummary(fieldset);
      return;
    }

    const models = unique(items
      .filter((item) => brands.includes(item.brand))
      .map((item) => item.model)
      .filter((model) => model && model !== "Модель не указана"));
    fieldset.classList.remove("is-disabled");
    trigger.disabled = false;
    renderFilterOptions(fieldset, models);
  }

  function selectedCondition() {
    return document.querySelector('#conditionFilters input:checked')?.value || "";
  }

  function getFilteredItems() {
    const brands = checkedValues("#brandFilters");
    const models = checkedValues("#modelFilters");
    const types = checkedValues("#typeFilters");
    const condition = selectedCondition().toLocaleLowerCase("ru");
    const filtered = items
      .filter((item) => {
        if (brands.length && !brands.some((brand) => item.brand.toLocaleLowerCase("ru") === brand.toLocaleLowerCase("ru"))) return false;
        if (models.length && !models.includes(item.model)) return false;
        if (types.length && !types.includes(item.group)) return false;
        if (state.tab && item.group !== state.tab) return false;
        if (condition && !String(item.condition || "").toLocaleLowerCase("ru").startsWith(condition.slice(0, 5))) return false;
        if (state.query && fuzzyScore(state.query, item.search) < 0) return false;
        return true;
      });
    if (state.query) filtered.sort((left, right) => fuzzyScore(state.query, right.search) - fuzzyScore(state.query, left.search));
    return filtered;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatPrice(item) {
    if (!item.priceNumber) return "Цена по запросу";
    return `от ${new Intl.NumberFormat("ru-RU").format(item.priceNumber)} ₽`;
  }

  function deliveryLabel() {
    return "срок уточнит менеджер";
  }

  function cardMarkup(item) {
    const selected = state.selected.includes(item.id);
    const image = item.image
      ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false" /><div class="photo-fallback" hidden>Фото уточняется</div>`
      : `<div class="photo-fallback">Фото уточняется</div>`;
    return `
      <article class="part-card" data-id="${escapeHtml(item.id)}">
        <a class="part-photo" href="${escapeHtml(item.canonicalPath)}" data-product-link data-product-id="${escapeHtml(item.id)}">${image}</a>
        <div class="part-content">
          <span class="part-category">${escapeHtml(item.group)}</span>
          <h3><a class="part-title-link" href="${escapeHtml(item.canonicalPath)}" data-product-link data-product-id="${escapeHtml(item.id)}">${escapeHtml(item.title)}</a></h3>
          <p class="part-description">${escapeHtml(item.description || [item.brand, item.model, item.article].filter(Boolean).join(" · "))}</p>
          <div class="part-meta">
            <strong class="part-price">${formatPrice(item)}</strong>
            <span class="part-time">${deliveryLabel(item)}</span>
            <button class="card-action" type="button" data-add="${escapeHtml(item.id)}">${selected ? "В заявке" : "В заявку"}</button>
          </div>
        </div>
      </article>`;
  }

  function render() {
    const filtered = getFilteredItems();
    const visible = filtered.slice(0, state.visible);
    partsGrid.innerHTML = visible.map(cardMarkup).join("");
    resultCount.textContent = `Найдено ${filtered.length} ${plural(filtered.length)}`;
    const brands = checkedValues("#brandFilters");
    const models = checkedValues("#modelFilters");
    const types = checkedValues("#typeFilters");
    resultSummary.textContent = [brands.join(" / "), models.join(" / "), state.tab || types.join(" / ")]
      .filter(Boolean).join(" / ") || "Все марки и категории";
    emptyState.hidden = filtered.length > 0;
    loadMore.hidden = visible.length >= filtered.length;
    updateCatalogRoute();
  }

  function plural(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return "позиция";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "позиции";
    return "позиций";
  }

  function renderRequest() {
    const selectedItems = state.selected.map((id) => items.find((item) => item.id === id)).filter(Boolean);
    if (!selectedItems.length) {
      requestSelection.innerHTML = "<strong>Позиции не выбраны</strong><p>Добавьте нужные детали из карточек каталога.</p>";
      return;
    }
    const selectedTitle = selectedItems.length === 1
      ? "1 позиция выбрана"
      : `${selectedItems.length} ${plural(selectedItems.length)} ${selectedItems.length < 5 ? "выбраны" : "выбрано"}`;
    requestSelection.innerHTML = `
      <strong>${selectedTitle}</strong>
      ${selectedItems.map((item) => `<div class="selected-item"><span>${escapeHtml(item.title)}</span><button type="button" data-remove="${escapeHtml(item.id)}">Удалить</button></div>`).join("")}`;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
  }

  document.querySelector(".filter-panel").addEventListener("change", (event) => {
    if (!event.target.matches("input")) return;
    if (event.target.closest("#brandFilters")) {
      renderModelFilter(checkedValues("#brandFilters"));
      updateFilterSummary(document.querySelector("#modelFilters"));
    }
    const filter = event.target.closest(".filter-dropdown");
    if (filter) {
      updateFilterSummary(filter);
      filter.classList.remove("is-open");
      filter.querySelector("[data-filter-popover]").hidden = true;
      filter.querySelector("[data-filter-toggle]").setAttribute("aria-expanded", "false");
    }
    state.visible = 12;
    render();
  });

  document.querySelector(".filter-panel").addEventListener("click", (event) => {
    const optionLink = event.target.closest("[data-filter-option-link]");
    if (optionLink && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
      event.preventDefault();
      optionLink.closest("label")?.querySelector("input")?.click();
      return;
    }
    const trigger = event.target.closest("[data-filter-toggle]");
    if (!trigger || trigger.disabled) return;
    const filter = trigger.closest(".filter-dropdown");
    const popover = filter.querySelector("[data-filter-popover]");
    const opening = popover.hidden;

    document.querySelectorAll(".filter-dropdown").forEach((item) => {
      item.classList.remove("is-open");
      item.querySelector("[data-filter-popover]").hidden = true;
      item.querySelector("[data-filter-toggle]").setAttribute("aria-expanded", "false");
    });
    if (!opening) return;

    filter.classList.add("is-open");
    popover.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => filter.querySelector("[data-filter-search]")?.focus());
  });

  document.querySelector(".filter-panel").addEventListener("input", (event) => {
    if (!event.target.matches("[data-filter-search]")) return;
    filterVisibleOptions(event.target.closest(".filter-dropdown"), event.target.value);
  });

  document.addEventListener("pointerdown", (event) => {
    document.querySelectorAll(".filter-dropdown.is-open").forEach((filter) => {
      if (filter.contains(event.target)) return;
      filter.classList.remove("is-open");
      filter.querySelector("[data-filter-popover]").hidden = true;
      filter.querySelector("[data-filter-toggle]").setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".filter-dropdown.is-open").forEach((filter) => {
      filter.classList.remove("is-open");
      filter.querySelector("[data-filter-popover]").hidden = true;
      filter.querySelector("[data-filter-toggle]").setAttribute("aria-expanded", "false");
      filter.querySelector("[data-filter-toggle]").focus();
    });
  });

  document.querySelector("#catalogSearch").addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = document.querySelector("#catalogQuery").value.trim();
    state.visible = 12;
    render();
  });

  document.querySelector("#catalogQuery").addEventListener("search", (event) => {
    if (event.target.value) return;
    state.query = "";
    state.visible = 12;
    render();
  });

  document.querySelector("#catalogTabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category]");
    if (!button) return;
    document.querySelectorAll("#catalogTabs button").forEach((item) => item.classList.toggle("active", item === button));
    state.tab = button.dataset.category;
    state.visible = 12;
    render();
  });

  document.querySelector("#resetFilters").addEventListener("click", () => {
    document.querySelectorAll("#brandFilters input, #modelFilters input, #typeFilters input").forEach((input) => { input.checked = false; });
    renderModelFilter([]);
    document.querySelector('#conditionFilters input[value=""]') .checked = true;
    document.querySelector("#catalogQuery").value = "";
    state.query = "";
    updateFilterSummary(document.querySelector("#brandFilters"));
    updateFilterSummary(document.querySelector("#typeFilters"));
    document.querySelectorAll("#catalogTabs button").forEach((button) => button.classList.toggle("active", button.dataset.category === ""));
    state.tab = "";
    state.visible = 12;
    render();
  });

  partsGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-add]");
    if (!button) return;
    const id = button.dataset.add;
    if (state.selected.includes(id)) state.selected = state.selected.filter((itemId) => itemId !== id);
    else state.selected.push(id);
    if (state.selected.includes(id)) window.KITRADE_TRACK?.("add_to_request", { product_id: id, page_type: "catalog" });
    renderRequest();
    render();
    showToast(state.selected.includes(id) ? "Позиция добавлена в заявку" : "Позиция удалена из заявки");
  });

  requestSelection.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-remove]");
    if (!button) return;
    state.selected = state.selected.filter((id) => id !== button.dataset.remove);
    renderRequest();
    render();
  });

  loadMore.addEventListener("click", () => { state.visible += 12; render(); });
  document.querySelector("#requestSubmit").addEventListener("click", () => {
    if (!state.selected.length) {
      showToast("Сначала добавьте хотя бы одну позицию.");
      return;
    }

    const selectedItems = state.selected
      .map((id) => items.find((item) => String(item.id) === String(id)))
      .filter(Boolean);
    const comment = document.querySelector("#requestComment")?.value.trim();
    const lines = selectedItems.map((item, index) => {
      const article = item.article ? `, арт. ${item.article}` : "";
      return `${index + 1}. ${item.title}${article}`;
    });
    if (comment) lines.push("", `Комментарий: ${comment}`);

    sessionStorage.setItem("kitradeCatalogDraft", JSON.stringify({
      details: `Позиции из каталога:\n${lines.join("\n")}`,
      createdAt: Date.now(),
    }));
    window.KITRADE_TRACK?.("request_open", { source: "catalog", product_count: selectedItems.length });
    window.location.href = "/#request";
  });

  renderAllFilterOptions();
  if (routeDefaults.brand) {
    document.querySelectorAll("#brandFilters input").forEach((input) => {
      input.checked = input.value.toLocaleLowerCase("ru") === routeDefaults.brand.toLocaleLowerCase("ru");
    });
    renderModelFilter([routeDefaults.brand]);
    updateFilterSummary(document.querySelector("#brandFilters"));
  }
  if (routeDefaults.model) {
    document.querySelectorAll("#modelFilters input").forEach((input) => {
      input.checked = input.value.toLocaleLowerCase("ru") === routeDefaults.model.toLocaleLowerCase("ru");
    });
    updateFilterSummary(document.querySelector("#modelFilters"));
  }
  document.querySelectorAll("#catalogTabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.category === routeDefaults.category);
  });
  document.addEventListener("kitrade:add-product", (event) => {
    const id = String(event.detail?.id || "");
    if (!id || state.selected.includes(id)) return;
    state.selected.push(id);
    renderRequest();
    render();
    showToast("Позиция добавлена в заявку");
  });
  render();
  renderRequest();
})();
