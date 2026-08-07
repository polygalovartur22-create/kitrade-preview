(() => {
  const sitePath = (value) => {
    const path = String(value || "/");
    const base = String(window.KITRADE_SITE_CONFIG?.basePath || "").replace(/\/$/, "");
    return base && path.startsWith("/") && !path.startsWith(`${base}/`) ? `${base}${path}` : path;
  };
  const dataNode = document.querySelector("#product-page-data");
  const button = document.querySelector("[data-product-request]");
  if (!dataNode || !button) return;
  let product;
  try { product = JSON.parse(dataNode.textContent); } catch { return; }
  window.KITRADE_TRACK?.("product_view", { product_id: product.id, page_type: "product" });
  button.addEventListener("click", () => {
    window.KITRADE_TRACK?.("add_to_request", { product_id: product.id, page_type: "product" });
    window.KITRADE_TRACK?.("request_open", { source: "product_page" });
    const article = product.article ? `, арт. ${product.article}` : "";
    sessionStorage.setItem("kitradeCatalogDraft", JSON.stringify({
      details: `Позиция из каталога:\n1. ${product.title}${article}`,
      selected_products: [{
        product_id: String(product.id || ""),
        title: product.title || "",
        article: product.article || "",
        price: Number(product.price) || 0,
      }],
      preliminary_sum: Number(product.price) || 0,
      createdAt: Date.now(),
    }));
    window.location.href = sitePath("/#request");
  });
})();
