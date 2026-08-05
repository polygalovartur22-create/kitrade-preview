(() => {
  const source = Array.isArray(window.KITRADE_PARTS) ? window.KITRADE_PARTS : [];
  const urlMap = window.KITRADE_CATALOG_URLS?.products || {};
  const root = document.querySelector(".vehicle-picker");
  if (!root || !source.length) return;

  const brandSelect = root.querySelector("[data-vehicle-brand]");
  const modelSelect = root.querySelector("[data-vehicle-model]");
  const yearSelect = root.querySelector("[data-vehicle-year]");
  const categorySelect = root.querySelector("[data-vehicle-category]");
  const searchForm = root.querySelector("[data-vehicle-search]");
  const searchInput = searchForm.querySelector("input");
  const resultsWrap = root.querySelector("[data-vehicle-results-wrap]");
  const resultsGrid = root.querySelector("[data-vehicle-results]");
  const resultCount = root.querySelector("[data-vehicle-result-count]");
  const resultTitle = root.querySelector("[data-vehicle-result-title]");
  const empty = root.querySelector("[data-vehicle-empty]");
  const resetButton = root.querySelector("[data-vehicle-reset]");
  const requestCount = root.querySelector("[data-vehicle-request-count]");
  const requestEmpty = root.querySelector("[data-vehicle-request-empty]");
  const requestList = root.querySelector("[data-vehicle-request-list]");
  const requestButton = root.querySelector("[data-vehicle-to-request]");

  const normalizePhoto = (url) => {
    const value = String(url || "").trim();
    const match = value.match(/[?&]imageSlug=([^&]+)/);
    if (match) return `https://80.img.avito.st${decodeURIComponent(match[1])}`;
    return value.replace(/^http:\/\//i, "https://");
  };

  const fallbackPhoto = (item) => {
    const value = [item.title, item.detail, item.category].filter(Boolean).join(" ").toLocaleLowerCase("ru");
    if (/фар|фонар|оптик/.test(value)) return "/assets/01-catalog-led-headlamp.png";
    if (/крыл/.test(value)) return "/assets/02-catalog-front-fender.png";
    if (/реш[её]тк|бампер/.test(value)) return "/assets/03-catalog-lower-grille.png";
    return "";
  };

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const unique = (values) => [...new Set(values.filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), "ru", { numeric: true }));

  const normalizeSearch = (value) => String(value || "")
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

  const compactSearch = (value) => normalizeSearch(value).replace(/\s+/g, "");

  const editDistanceWithin = (left, right, limit) => {
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
  };

  const tokenScore = (queryToken, candidateWords) => {
    let best = -1;

    candidateWords.forEach((word) => {
      if (word === queryToken) {
        best = Math.max(best, 48);
        return;
      }
      if (word.startsWith(queryToken) || (queryToken.length >= 4 && queryToken.startsWith(word))) {
        best = Math.max(best, 39);
        return;
      }
      if (queryToken.length >= 3 && word.includes(queryToken)) {
        best = Math.max(best, 34);
        return;
      }
      if (queryToken.length < 3 || word.length < 3) return;

      const limit = queryToken.length <= 4 ? 1 : queryToken.length <= 8 ? 2 : 3;
      const distance = editDistanceWithin(queryToken, word, limit);
      if (distance <= limit) best = Math.max(best, 29 - (distance * 4));
    });

    return best;
  };

  const fuzzyScore = (query, candidate, candidateWords = normalizeSearch(candidate).split(" ")) => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return 1;

    const normalizedCandidate = normalizeSearch(candidate);
    if (normalizedCandidate.includes(normalizedQuery)) return 100;

    const scores = normalizedQuery.split(" ").map((token) => tokenScore(token, candidateWords));
    if (scores.some((score) => score < 0)) return -1;
    return scores.reduce((total, score) => total + score, 0) / scores.length;
  };

  const formatPrice = (value) => {
    const price = Number(String(value || "").replace(/\D/g, ""));
    return price ? `от ${new Intl.NumberFormat("ru-RU").format(price)} ₽` : "Цена по запросу";
  };

  const formatPositionCount = (value) => {
    const number = Math.abs(Number(value));
    const mod100 = number % 100;
    const mod10 = number % 10;
    const word = mod100 >= 11 && mod100 <= 14 ? "позиций" : mod10 === 1 ? "позиция" : mod10 >= 2 && mod10 <= 4 ? "позиции" : "позиций";
    return `${new Intl.NumberFormat("ru-RU").format(number)} ${word}`;
  };

  const items = source
    .filter((item) => item?.title
      && String(item.brand || "").trim().toLocaleLowerCase("ru") !== "маз"
      && (!urlMap[String(item.id)] || urlMap[String(item.id)].status === "active"))
    .map((item) => ({
      ...item,
      canonicalPath: urlMap[String(item.id)]?.canonical_path || "/catalog/",
      image: normalizePhoto(item.photos?.[0]) || fallbackPhoto(item),
      search: [item.title, item.brand, item.model, item.catalogCode, item.category, item.detail]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ru"),
      searchNormalized: normalizeSearch([item.title, item.brand, item.model, item.catalogCode, item.category, item.detail]
        .filter(Boolean)
        .join(" ")),
      searchCompact: compactSearch([item.title, item.catalogCode].filter(Boolean).join(" ")),
    }));

  const selected = new Map();
  let currentResults = [];
  const comboboxSyncers = new WeakMap();

  const setOptions = (select, values, placeholder) => {
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${values
      .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
      .join("")}`;
    comboboxSyncers.get(select)?.();
  };

  const setEnabled = (select, enabled) => {
    select.disabled = !enabled;
    select.closest("label").classList.toggle("is-disabled", !enabled);
    comboboxSyncers.get(select)?.();
  };

  const brandValues = unique(items.map((item) => item.brand));
  const enhanceVehicleSelect = (select, {
    triggerLabel,
    searchPlaceholder,
    searchLabel,
    optionsLabel,
    emptyLabel,
  }) => {
    const field = select.closest("label");
    if (!field || field.querySelector("[data-vehicle-combobox]")) return;

    field.classList.add("vehicle-combobox-field");
    select.classList.add("vehicle-native-select");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    const combobox = document.createElement("div");
    combobox.className = "vehicle-brand-combobox";
    combobox.dataset.vehicleCombobox = "";
    combobox.innerHTML = `
      <button class="vehicle-brand-trigger" type="button" data-vehicle-filter-trigger aria-label="${escapeHtml(triggerLabel)}" aria-haspopup="listbox" aria-expanded="false">
        <span data-vehicle-filter-value></span>
        <i aria-hidden="true"></i>
      </button>
      <div class="vehicle-brand-popover" data-vehicle-filter-popover hidden>
        <div class="vehicle-brand-search">
          <input type="search" data-vehicle-filter-search autocomplete="off" placeholder="${escapeHtml(searchPlaceholder)}" aria-label="${escapeHtml(searchLabel)}" />
        </div>
        <div class="vehicle-brand-options" data-vehicle-filter-options role="listbox" aria-label="${escapeHtml(optionsLabel)}"></div>
        <p class="vehicle-brand-empty" data-vehicle-filter-empty hidden>${escapeHtml(emptyLabel)}</p>
      </div>`;
    select.before(combobox);

    const trigger = combobox.querySelector("[data-vehicle-filter-trigger]");
    const valueLabel = combobox.querySelector("[data-vehicle-filter-value]");
    const popover = combobox.querySelector("[data-vehicle-filter-popover]");
    const input = combobox.querySelector("[data-vehicle-filter-search]");
    const options = combobox.querySelector("[data-vehicle-filter-options]");
    const emptyMessage = combobox.querySelector("[data-vehicle-filter-empty]");
    let visibleValues = [];
    let activeIndex = -1;

    const updateActiveOption = () => {
      const buttons = [...options.querySelectorAll("[data-vehicle-filter-option]")];
      buttons.forEach((button, index) => {
        const active = index === activeIndex;
        button.classList.toggle("is-active", active);
        button.tabIndex = active ? 0 : -1;
        if (active) button.scrollIntoView({ block: "nearest" });
      });
    };

    const renderOptions = (query = "") => {
      const selectValues = [...select.options].map((option) => option.value).filter(Boolean);
      visibleValues = selectValues
        .map((value) => ({ value, score: fuzzyScore(query, value) }))
        .filter(({ score }) => score >= 0)
        .sort((left, right) => right.score - left.score || left.value.localeCompare(right.value, "ru", { numeric: true }));

      options.innerHTML = visibleValues.map(({ value }) => `
        <button type="button" role="option" data-vehicle-filter-option="${escapeHtml(value)}" aria-selected="${value === select.value}">
          <span>${escapeHtml(value)}</span>
          <i aria-hidden="true"></i>
        </button>`).join("");
      emptyMessage.hidden = visibleValues.length > 0;
      activeIndex = visibleValues.findIndex(({ value }) => value === select.value);
      if (activeIndex < 0 && visibleValues.length) activeIndex = 0;
      updateActiveOption();
    };

    const close = ({ restoreFocus = false } = {}) => {
      popover.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      combobox.classList.remove("is-open");
      input.value = "";
      renderOptions();
      if (restoreFocus) trigger.focus();
    };

    const open = () => {
      if (select.disabled) return;
      popover.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      combobox.classList.add("is-open");
      renderOptions();
      requestAnimationFrame(() => input.focus());
    };

    const chooseOption = (value) => {
      select.value = value;
      sync();
      select.dispatchEvent(new Event("change", { bubbles: true }));
      close({ restoreFocus: true });
    };

    const sync = () => {
      valueLabel.textContent = select.selectedOptions[0]?.textContent || triggerLabel;
      trigger.classList.toggle("has-value", Boolean(select.value));
      trigger.disabled = select.disabled;
      if (select.disabled && !popover.hidden) close();
      renderOptions(input.value);
    };
    comboboxSyncers.set(select, sync);

    trigger.addEventListener("click", () => {
      if (popover.hidden) open();
      else close();
    });

    input.addEventListener("input", () => renderOptions(input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        activeIndex = Math.max(0, Math.min(visibleValues.length - 1, activeIndex + direction));
        updateActiveOption();
      } else if (event.key === "Enter" && visibleValues[activeIndex]) {
        event.preventDefault();
        chooseOption(visibleValues[activeIndex].value);
      } else if (event.key === "Escape") {
        close({ restoreFocus: true });
      }
    });

    options.addEventListener("click", (event) => {
      const button = event.target.closest("[data-vehicle-filter-option]");
      if (button) chooseOption(button.dataset.vehicleFilterOption);
    });

    document.addEventListener("pointerdown", (event) => {
      if (!popover.hidden && !combobox.contains(event.target)) close();
    });

    sync();
  };

  const itemMatchesYear = (item, year) => {
    if (!year) return true;
    const number = Number(year);
    if (Array.isArray(item.years) && item.years.length) return item.years.includes(number);
    return (!item.yearFrom || number >= Number(item.yearFrom)) && (!item.yearTo || number <= Number(item.yearTo));
  };

  const vehicleItems = () => items.filter((item) => (
    (!brandSelect.value || item.brand === brandSelect.value)
    && (!modelSelect.value || item.model === modelSelect.value)
    && itemMatchesYear(item, yearSelect.value)
    && (!categorySelect.value || item.category === categorySelect.value)
  ));

  const imageMarkup = (item) => item.image
    ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false" /><div class="vehicle-result-no-photo" hidden>Фото уточняется</div>`
    : `<div class="vehicle-result-no-photo">Фото уточняется</div>`;

  const resultCard = (item) => `
    <article class="vehicle-result-card">
      <a class="vehicle-result-photo" href="${escapeHtml(item.canonicalPath)}" data-product-link data-product-id="${escapeHtml(item.id)}">${imageMarkup(item)}</a>
      <div class="vehicle-result-copy">
        <p>${escapeHtml([item.brand, item.model, item.catalogCode].filter(Boolean).join(" · ") || item.category)}</p>
        <h4><a class="vehicle-result-title-link" href="${escapeHtml(item.canonicalPath)}" data-product-link data-product-id="${escapeHtml(item.id)}">${escapeHtml(item.title)}</a></h4>
        <small>${escapeHtml([item.condition, item.origin].filter(Boolean).join(" · ") || "Проверим по VIN")}</small>
        <div>
          <strong>${formatPrice(item.price)}</strong>
          <button type="button" data-add-part="${escapeHtml(item.id)}">${selected.has(String(item.id)) ? "Добавлено" : "В заявку"}</button>
        </div>
      </div>
    </article>`;

  const renderResults = (results, title) => {
    currentResults = results;
    resultsWrap.hidden = false;
    resultCount.textContent = formatPositionCount(results.length);
    resultTitle.textContent = title;
    empty.hidden = results.length > 0;
    resultsGrid.innerHTML = results.slice(0, 4).map(resultCard).join("");
  };

  const renderRequest = () => {
    const values = [...selected.values()];
    requestCount.textContent = values.length;
    requestEmpty.hidden = values.length > 0;
    requestButton.disabled = values.length === 0;
    requestList.innerHTML = values.map((item) => `
      <div class="vehicle-request-item">
        <div><span>${escapeHtml(item.brand || "Запчасть")}</span><strong>${escapeHtml(item.title)}</strong></div>
        <button type="button" data-remove-part="${escapeHtml(item.id)}" aria-label="Удалить ${escapeHtml(item.title)}">×</button>
      </div>`).join("");

    resultsGrid.querySelectorAll("[data-add-part]").forEach((button) => {
      button.textContent = selected.has(button.dataset.addPart) ? "Добавлено" : "В заявку";
      button.classList.toggle("is-added", selected.has(button.dataset.addPart));
    });
  };

  const resetAfterBrand = () => {
    setOptions(modelSelect, unique(items.filter((item) => item.brand === brandSelect.value).map((item) => item.model)), "Выберите модель");
    setEnabled(modelSelect, Boolean(brandSelect.value));
    setOptions(yearSelect, [], "Сначала модель");
    setEnabled(yearSelect, false);
    setOptions(categorySelect, [], "Сначала год");
    setEnabled(categorySelect, false);
  };

  const resetAfterModel = () => {
    const relevant = items.filter((item) => item.brand === brandSelect.value && item.model === modelSelect.value);
    const years = unique(relevant.flatMap((item) => item.years?.length
      ? item.years
      : Array.from({ length: Math.max(0, Number(item.yearTo) - Number(item.yearFrom) + 1) }, (_, index) => Number(item.yearFrom) + index)))
      .sort((a, b) => Number(b) - Number(a));
    setOptions(yearSelect, years, "Выберите год");
    setEnabled(yearSelect, Boolean(modelSelect.value));
    setOptions(categorySelect, [], "Сначала год");
    setEnabled(categorySelect, false);
  };

  const resetAfterYear = () => {
    const categories = unique(items
      .filter((item) => item.brand === brandSelect.value && item.model === modelSelect.value && itemMatchesYear(item, yearSelect.value))
      .map((item) => item.category));
    setOptions(categorySelect, categories, "Выберите категорию");
    setEnabled(categorySelect, Boolean(yearSelect.value));
  };

  setOptions(brandSelect, brandValues, "Выберите марку");
  enhanceVehicleSelect(brandSelect, {
    triggerLabel: "Выберите марку автомобиля",
    searchPlaceholder: "Найти марку",
    searchLabel: "Поиск марки",
    optionsLabel: "Марки автомобилей",
    emptyLabel: "Марка не найдена",
  });
  enhanceVehicleSelect(modelSelect, {
    triggerLabel: "Выберите модель автомобиля",
    searchPlaceholder: "Найти модель",
    searchLabel: "Поиск модели",
    optionsLabel: "Модели автомобилей",
    emptyLabel: "Модель не найдена",
  });
  enhanceVehicleSelect(yearSelect, {
    triggerLabel: "Выберите год выпуска",
    searchPlaceholder: "Найти год",
    searchLabel: "Поиск года выпуска",
    optionsLabel: "Годы выпуска",
    emptyLabel: "Год не найден",
  });
  enhanceVehicleSelect(categorySelect, {
    triggerLabel: "Выберите категорию запчасти",
    searchPlaceholder: "Найти категорию",
    searchLabel: "Поиск категории",
    optionsLabel: "Категории запчастей",
    emptyLabel: "Категория не найдена",
  });

  brandSelect.addEventListener("change", () => {
    resetAfterBrand();
    searchInput.value = "";
    resultsWrap.hidden = true;
  });

  modelSelect.addEventListener("change", () => {
    resetAfterModel();
    resultsWrap.hidden = true;
  });

  yearSelect.addEventListener("change", () => {
    resetAfterYear();
    resultsWrap.hidden = true;
  });

  categorySelect.addEventListener("change", () => {
    if (categorySelect.value) renderResults(vehicleItems(), categorySelect.value);
    else resultsWrap.hidden = true;
  });

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;
    const normalizedQuery = normalizeSearch(query);
    const compactQuery = compactSearch(query);
    const codeQuery = /^kt\d+$/.test(compactQuery) ? `KT-${compactQuery.slice(2)}` : "";
    const results = items
      .map((item) => {
        const exactCodeMatch = codeQuery && item.catalogCode === codeQuery;
        const score = exactCodeMatch
          ? 130
          : codeQuery
            ? -1
          : fuzzyScore(normalizedQuery, item.searchNormalized, item.searchNormalized.split(" "));
        return { item, score };
      })
      .filter(({ score }) => score >= 0)
      .sort((left, right) => right.score - left.score)
      .map(({ item }) => item);
    renderResults(results, `Результаты поиска «${query}»`);
  });

  resultsGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-part]");
    if (!button) return;
    const item = currentResults.find((candidate) => String(candidate.id) === button.dataset.addPart);
    if (!item) return;
    if (selected.has(String(item.id))) selected.delete(String(item.id));
    else selected.set(String(item.id), item);
    renderRequest();
  });

  requestList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-part]");
    if (!button) return;
    selected.delete(button.dataset.removePart);
    renderRequest();
  });

  document.addEventListener("kitrade:add-product", (event) => {
    const id = String(event.detail?.id || "");
    const item = items.find((candidate) => String(candidate.id) === id);
    if (!item || selected.has(id)) return;
    selected.set(id, item);
    renderRequest();
  });

  resetButton.addEventListener("click", () => {
    brandSelect.value = "";
    comboboxSyncers.get(brandSelect)?.();
    resetAfterBrand();
    searchInput.value = "";
    resultsWrap.hidden = true;
    currentResults = [];
  });

  requestButton.addEventListener("click", () => {
    const textarea = document.querySelector("#details");
    const vehicle = [brandSelect.value, modelSelect.value, yearSelect.value].filter(Boolean).join(", ");
    const lines = [...selected.values()].map((item) => `• ${item.title}${item.catalogCode ? `, код KITRADE ${item.catalogCode}` : ""}`);
    if (textarea) textarea.value = `${vehicle ? `Автомобиль: ${vehicle}\n` : ""}Нужные детали:\n${lines.join("\n")}`;
    document.querySelector("#request")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  renderRequest();
})();
