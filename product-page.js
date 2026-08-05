(() => {
  const dataNode = document.querySelector("#product-page-data");
  const button = document.querySelector("[data-product-request]");
  if (!dataNode || !button) return;
  let product;
  try { product = JSON.parse(dataNode.textContent); } catch { return; }
  window.KITRADE_TRACK?.("product_view", { product_id: product.id, page_type: "product" });
  button.addEventListener("click", () => {
    window.KITRADE_TRACK?.("add_to_request", { product_id: product.id, page_type: "product" });
    window.KITRADE_TRACK?.("request_open", { source: "product_page" });
    sessionStorage.setItem("kitradeCatalogDraft", JSON.stringify({
      details: `Позиция из каталога:\n1. ${product.title}${product.catalogCode ? `, код KITRADE ${product.catalogCode}` : ""}`,
      createdAt: Date.now(),
    }));
    window.location.href = "/#request";
  });
})();
