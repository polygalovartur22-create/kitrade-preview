(() => {
  const root = document.querySelector(".vehicle-picker");
  if (!root) return;

  const base = String(window.KITRADE_SITE_CONFIG?.basePath || "").replace(/\/$/, "");
  const assetPath = (value) => `${base}${value}`;
  let started = false;

  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = assetPath(src);
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.head.append(script);
  });

  const start = async () => {
    if (started) return;
    started = true;
    try {
      await loadScript("/catalog-runtime-data.js?v=1");
      await loadScript("/product-quick-view.js?v=1");
      await loadScript("/home-catalog.js?v=6");
    } catch (error) {
      console.error("Каталог временно недоступен", error);
    }
  };

  root.addEventListener("focusin", start, { once: true });
  root.addEventListener("pointerdown", start, { once: true });
  if (!("IntersectionObserver" in window)) {
    start();
    return;
  }
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    start();
  }, { rootMargin: "600px 0px" });
  observer.observe(root);
})();
