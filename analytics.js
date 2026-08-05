(() => {
  const settings = window.KITRADE_SITE_CONFIG?.analytics;
  const previewHost = /(?:^|\.)onrender\.com$/i.test(window.location.hostname);
  const counterId = Number(settings?.counterId);
  const allowedEvents = new Set(settings?.events || []);

  window.KITRADE_TRACK = (eventName, params = {}) => {
    if (previewHost || !allowedEvents.has(eventName) || !counterId || typeof window.ym !== "function") return;
    window.ym(counterId, "reachGoal", eventName, params);
  };

  if (previewHost || !settings?.enabled || !counterId) return;
  window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
  window.ym.l = Date.now();
  if (!document.querySelector('script[src="https://mc.yandex.ru/metrika/tag.js"]')) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://mc.yandex.ru/metrika/tag.js";
    document.head.append(script);
  }
  window.ym(counterId, "init", {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
  });
})();
