"use strict";

(() => {
  const root = document.documentElement;
  const page = document.body;

  if (!page?.classList.contains("reference-only")) return;

  let resizeFrame = 0;

  const getMasterWidth = () => {
    if (window.matchMedia("(max-width: 599px)").matches) return 390;
    if (window.matchMedia("(max-width: 1199px)").matches) return 834;
    return 1920;
  };

  const syncArtboard = () => {
    resizeFrame = 0;

    const availableWidth = root.clientWidth;
    const masterWidth = getMasterWidth();
    const scale = availableWidth / masterWidth;

    root.style.setProperty("--site-artboard-width", `${masterWidth}px`);
    root.style.setProperty("--site-artboard-scale", scale.toFixed(6));
    page.dataset.artboard = String(masterWidth);
  };

  const scheduleSync = () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(syncArtboard);
  };

  syncArtboard();
  window.addEventListener("resize", scheduleSync, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleSync, { passive: true });
})();
