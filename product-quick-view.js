(() => {
  const sitePath = (value) => {
    const path = String(value || "/");
    const base = String(window.KITRADE_SITE_CONFIG?.basePath || "").replace(/\/$/, "");
    return base && path.startsWith("/") && !path.startsWith(`${base}/`) ? `${base}${path}` : path;
  };
  const source = Array.isArray(window.KITRADE_PARTS) ? window.KITRADE_PARTS : [];
  const urlMap = window.KITRADE_CATALOG_URLS?.products || {};
  const itemsById = new Map(source.map((item) => [String(item.id), item]));
  let dialog;
  let activeItem;

  const normalizePhoto = (url) => {
    const value = String(url || "").trim();
    if (!value) return "";
    const match = value.match(/[?&]imageSlug=([^&]+)/);
    if (match) return `https://80.img.avito.st${decodeURIComponent(match[1])}`;
    return value.replace(/^http:\/\//i, "https://");
  };

  const fallbackPhoto = (item) => {
    const subject = [item.title, item.detail, item.category].filter(Boolean).join(" ").toLocaleLowerCase("ru");
    if (/фар|фонар|оптик/.test(subject)) return sitePath("/assets/01-catalog-led-headlamp.png");
    if (/крыл/.test(subject)) return sitePath("/assets/02-catalog-front-fender.png");
    if (/реш[её]тк|бампер/.test(subject)) return sitePath("/assets/03-catalog-lower-grille.png");
    return "";
  };

  const formatPrice = (value) => {
    const price = Number(String(value || "").replace(/\D/g, ""));
    return price ? `${new Intl.NumberFormat("ru-RU").format(price)} ₽` : "Цена по запросу";
  };

  function createDialog() {
    const element = document.createElement("dialog");
    element.className = "product-quick-view";
    element.setAttribute("aria-labelledby", "product-quick-view-title");
    element.innerHTML = `
      <div class="product-quick-view__shell">
        <button class="product-quick-view__close" type="button" aria-label="Закрыть" data-quick-close>×</button>
        <div class="product-quick-view__media" data-quick-media></div>
        <div class="product-quick-view__content">
          <p class="product-quick-view__category" data-quick-category></p>
          <h2 id="product-quick-view-title" data-quick-title></h2>
          <p class="product-quick-view__meta" data-quick-meta></p>
          <p class="product-quick-view__description" data-quick-description></p>
          <strong class="product-quick-view__price" data-quick-price></strong>
          <div class="product-quick-view__actions">
            <button type="button" data-quick-add>В заявку</button>
            <a href="/catalog/" data-quick-page>Открыть страницу товара</a>
          </div>
        </div>
      </div>`;
    element.querySelector("[data-quick-close]").addEventListener("click", () => element.close());
    element.querySelector("[data-quick-add]").addEventListener("click", () => {
      if (!activeItem) return;
      window.KITRADE_TRACK?.("add_to_request", { product_id: String(activeItem.id), page_type: "quick_view" });
      document.dispatchEvent(new CustomEvent("kitrade:add-product", { detail: { id: String(activeItem.id) } }));
    });
    element.addEventListener("click", (event) => {
      if (event.target === element) element.close();
    });
    document.body.append(element);
    return element;
  }

  function openQuickView(item) {
    const route = urlMap[String(item.id)];
    if (!route?.canonical_path) return false;
    activeItem = item;
    dialog ||= createDialog();
    const photo = normalizePhoto(item.photos?.[0]) || fallbackPhoto(item);
    const media = dialog.querySelector("[data-quick-media]");
    media.replaceChildren();
    if (photo) {
      const image = document.createElement("img");
      image.src = photo;
      image.alt = item.title || "Автозапчасть";
      image.addEventListener("error", () => image.remove(), { once: true });
      media.append(image);
    } else {
      media.textContent = "Фото уточняется";
    }
    dialog.querySelector("[data-quick-category]").textContent = route.public_category || item.category || "Запчасть";
    dialog.querySelector("[data-quick-title]").textContent = route.title || item.title || "Автозапчасть";
    dialog.querySelector("[data-quick-meta]").textContent = route.meta || [item.brand, item.model].filter(Boolean).join(" · ");
    dialog.querySelector("[data-quick-description]").textContent = route.quick_description || "Цена — за деталь. Доставка отдельно. Проверка по VIN. Заказ — от 50 000 ₽; детали можно объединить.";
    dialog.querySelector("[data-quick-price]").textContent = formatPrice(item.price);
    dialog.querySelector("[data-quick-page]").href = sitePath(route.canonical_path);
    dialog.showModal();
    window.KITRADE_TRACK?.("product_view", { product_id: String(item.id), page_type: "quick_view" });
    return true;
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-product-link]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const item = itemsById.get(String(link.dataset.productId || ""));
    if (!item) return;
    if (openQuickView(item)) event.preventDefault();
  });
})();
