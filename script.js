"use strict";

const FORM_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbwYrw2uPwJi8Cgx5uPJq2rtwTXXvFWWhd_WHFW38QWvsG-nvlaku8TkUMZHN7dNh2oqlw/exec";
const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const menuToggle = document.querySelector("[data-menu-toggle]");
const mobileNav = document.querySelector("[data-mobile-nav]");

function setMenu(open) {
  if (!menuToggle || !mobileNav) return;

  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
  mobileNav.hidden = !open;
  document.body.classList.toggle("menu-open", open);
}

menuToggle?.addEventListener("click", () => {
  setMenu(menuToggle.getAttribute("aria-expanded") !== "true");
});

mobileNav?.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenu(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuToggle?.getAttribute("aria-expanded") === "true") {
    setMenu(false);
    menuToggle.focus();
  }
});

const requestSection = document.querySelector("#request");
const detailsField = document.querySelector("#details");
const catalogSearch = document.querySelector("[data-catalog-search]");
const catalogQuery = document.querySelector("#catalog-query");
const categoryButtons = [...document.querySelectorAll("[data-category]")];
let selectedCategory = "";

try {
  const draft = JSON.parse(sessionStorage.getItem("kitradeCatalogDraft") || "null");
  const isFresh = draft?.createdAt && Date.now() - draft.createdAt < 24 * 60 * 60 * 1000;
  if (detailsField && isFresh && draft.details) {
    detailsField.value = draft.details;
    sessionStorage.removeItem("kitradeCatalogDraft");
  }
} catch {
  sessionStorage.removeItem("kitradeCatalogDraft");
}

categoryButtons.forEach((button) => {
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => {
    const shouldSelect = button.getAttribute("aria-pressed") !== "true";

    categoryButtons.forEach((item) => item.setAttribute("aria-pressed", "false"));
    button.setAttribute("aria-pressed", String(shouldSelect));
    selectedCategory = shouldSelect ? button.dataset.category : "";
  });
});

catalogSearch?.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = catalogQuery.value.trim();

  if (!query && !selectedCategory) {
    catalogQuery.focus();
    return;
  }

  const prefix = selectedCategory ? `Категория: ${selectedCategory}\n` : "";
  detailsField.value = `${prefix}${query}`.trim();
  requestSection.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => detailsField.focus({ preventScroll: true }), 450);
});

document.querySelectorAll("[data-case]").forEach((link) => {
  link.addEventListener("click", () => {
    detailsField.value = link.dataset.case || "";
  });
});

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealItems = [...document.querySelectorAll("[data-reveal]")];

revealItems.forEach((item, index) => {
  item.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 65}ms`);
});

if (reducedMotion || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -10%", threshold: 0.12 },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}

const header = document.querySelector("[data-header]");
const scrollProgress = document.querySelector("[data-scroll-progress]");
let scrollFrame = 0;

function updateScrollEffects() {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const scrollRange = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
  const progress = Math.min(scrollTop / scrollRange, 1);

  header?.classList.toggle("is-scrolled", scrollTop > 24);
  if (scrollProgress) scrollProgress.style.transform = `scaleX(${progress})`;
  scrollFrame = 0;
}

function requestScrollEffects() {
  if (scrollFrame) return;
  scrollFrame = window.requestAnimationFrame(updateScrollEffects);
}

window.addEventListener("scroll", requestScrollEffects, { passive: true });
window.addEventListener("resize", requestScrollEffects, { passive: true });
updateScrollEffects();

const heroStage = document.querySelector("[data-hero-stage]");

if (heroStage && !reducedMotion && window.matchMedia("(pointer: fine)").matches) {
  let pointerFrame = 0;
  let pointerX = 0;
  let pointerY = 0;

  heroStage.addEventListener("pointermove", (event) => {
    const bounds = heroStage.getBoundingClientRect();
    pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 16;
    pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 12;

    if (pointerFrame) return;
    pointerFrame = window.requestAnimationFrame(() => {
      heroStage.style.setProperty("--pointer-x", `${pointerX}px`);
      heroStage.style.setProperty("--pointer-y", `${pointerY}px`);
      pointerFrame = 0;
    });
  });

  heroStage.addEventListener("pointerleave", () => {
    heroStage.style.setProperty("--pointer-x", "0px");
    heroStage.style.setProperty("--pointer-y", "0px");
  });
}

const breakoutShowcase = document.querySelector("[data-breakout]");

if (breakoutShowcase && !reducedMotion && window.matchMedia("(pointer: fine)").matches) {
  let breakoutFrame = 0;

  breakoutShowcase.addEventListener("pointermove", (event) => {
    const bounds = breakoutShowcase.getBoundingClientRect();
    const rotateY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 5;
    const rotateX = ((event.clientY - bounds.top) / bounds.height - 0.5) * -4;

    if (breakoutFrame) return;
    breakoutFrame = window.requestAnimationFrame(() => {
      breakoutShowcase.style.setProperty("--breakout-x", `${rotateY}deg`);
      breakoutShowcase.style.setProperty("--breakout-y", `${rotateX}deg`);
      breakoutFrame = 0;
    });
  });

  breakoutShowcase.addEventListener("pointerleave", () => {
    breakoutShowcase.style.setProperty("--breakout-x", "0deg");
    breakoutShowcase.style.setProperty("--breakout-y", "0deg");
  });
}

const counters = [...document.querySelectorAll(".about-index strong")];

if (!reducedMotion && "IntersectionObserver" in window) {
  const counterObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const element = entry.target;
        const target = Number(element.textContent.replace(/\D/g, ""));
        const startedAt = performance.now();
        const duration = 1300;

        function drawCounter(now) {
          const elapsed = Math.min((now - startedAt) / duration, 1);
          const eased = 1 - Math.pow(1 - elapsed, 4);
          element.textContent = Math.round(target * eased).toLocaleString("ru-RU");
          if (elapsed < 1) window.requestAnimationFrame(drawCounter);
        }

        window.requestAnimationFrame(drawCounter);
        observer.unobserve(element);
      });
    },
    { threshold: 0.7 },
  );

  counters.forEach((counter) => counterObserver.observe(counter));
}

const companyCounters = [...document.querySelectorAll("[data-company-count]")];

if (!reducedMotion && "IntersectionObserver" in window) {
  const companyCounterObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const element = entry.target;
        const target = Number(element.dataset.companyCount);
        const startedAt = performance.now();
        const duration = 1400;

        function drawCompanyCounter(now) {
          const elapsed = Math.min((now - startedAt) / duration, 1);
          const eased = 1 - Math.pow(1 - elapsed, 4);
          element.textContent = Math.round(target * eased).toLocaleString("ru-RU");
          if (elapsed < 1) window.requestAnimationFrame(drawCompanyCounter);
        }

        element.textContent = "0";
        window.requestAnimationFrame(drawCompanyCounter);
        observer.unobserve(element);
      });
    },
    { threshold: 0.6 },
  );

  companyCounters.forEach((counter) => companyCounterObserver.observe(counter));
}

const requestForm = document.querySelector("[data-request-form]");

if (requestForm) {
  const stepOne = requestForm.querySelector('[data-form-step="1"]');
  const stepTwo = requestForm.querySelector('[data-form-step="2"]');
  const formHead = requestForm.querySelector(".form-head");
  const stepLabel = requestForm.querySelector("[data-step-label]");
  const stepPercent = requestForm.querySelector("[data-step-percent]");
  const photosInput = requestForm.elements.photos;
  const carModelInput = requestForm.elements.carModel;
  const carYearInput = requestForm.elements.carYear;
  const vinInput = requestForm.elements.vin;
  const nameInput = requestForm.elements.name;
  const phoneInput = requestForm.elements.phone;
  const consentInput = requestForm.elements.privacyConsent;
  const contactLabel = requestForm.querySelector("[data-contact-label]");
  const fileList = requestForm.querySelector("[data-file-list]");
  const status = requestForm.querySelector("[data-form-status]");
  const submitButton = requestForm.querySelector("[data-submit-button]");
  const successView = requestForm.querySelector("[data-form-success]");
  let selectedFiles = [];

  function setError(name, message = "") {
    const error = requestForm.querySelector(`[data-error="${name}"]`);
    const field = requestForm.elements[name];

    if (error) error.textContent = message;
    if (field && "setAttribute" in field) {
      if (message) field.setAttribute("aria-invalid", "true");
      else field.removeAttribute("aria-invalid");
    }
  }

  function showStep(step, { scroll = false } = {}) {
    const isFirst = step === 1;
    requestForm.dataset.currentStep = String(step);
    stepOne.hidden = !isFirst;
    stepTwo.hidden = isFirst;
    stepLabel.textContent = `Шаг ${step} из 2`;
    stepPercent.textContent = isFirst ? "50%" : "100%";

    const firstField = isFirst ? detailsField : nameInput;
    firstField.focus({ preventScroll: true });

    if (scroll) {
      window.requestAnimationFrame(() => {
        requestForm.scrollIntoView({
          behavior: "auto",
          block: "start",
        });
      });
    }
  }

  function validateStepOne() {
    const carModelValid = carModelInput.value.trim().length > 1;
    const year = carYearInput.value.trim();
    const yearValid = !year || /^(19|20)\d{2}$/.test(year);
    const vin = vinInput.value.trim().toUpperCase();
    const vinValid = !vin || /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
    const detailsValid = detailsField.value.trim().length > 0;

    setError("carModel", carModelValid ? "" : "Укажите марку и модель автомобиля.");
    setError("carYear", yearValid ? "" : "Укажите год четырьмя цифрами.");
    setError("vin", vinValid ? "" : "VIN должен состоять из 17 латинских букв и цифр.");
    setError("details", detailsValid ? "" : "Укажите название или артикул запчасти.");

    if (!carModelValid) carModelInput.focus();
    else if (!yearValid) carYearInput.focus();
    else if (!vinValid) vinInput.focus();
    else if (!detailsValid) detailsField.focus();

    return carModelValid && yearValid && vinValid && detailsValid;
  }

  function validateStepTwo() {
    const messenger = requestForm.elements.messenger.value;
    const contact = phoneInput.value.trim();
    const nameValid = nameInput.value.trim().length > 1;
    const contactValid =
      messenger === "Telegram"
        ? contact.replace(/^@/, "").trim().length >= 3
        : contact.replace(/\D/g, "").length >= 7;
    const consentValid = consentInput.checked;

    setError("name", nameValid ? "" : "Укажите ваше имя.");
    setError(
      "phone",
      contactValid
        ? ""
        : messenger === "Telegram"
          ? "Укажите корректный Telegram тег."
          : "Укажите корректный номер телефона.",
    );
    setError("privacyConsent", consentValid ? "" : "Подтвердите согласие на обработку данных.");

    if (!nameValid) nameInput.focus();
    else if (!contactValid) phoneInput.focus();
    else if (!consentValid) consentInput.focus();

    return nameValid && contactValid && consentValid;
  }

  function renderFiles() {
    fileList.replaceChildren();

    selectedFiles.forEach((file, index) => {
      const item = document.createElement("div");
      const name = document.createElement("span");
      const remove = document.createElement("button");

      item.className = "file-item";
      name.textContent = file.name;
      remove.type = "button";
      remove.textContent = "Удалить";
      remove.setAttribute("aria-label", `Удалить файл ${file.name}`);
      remove.addEventListener("click", () => {
        selectedFiles.splice(index, 1);
        renderFiles();
      });

      item.append(name, remove);
      fileList.append(item);
    });
  }

  photosInput.addEventListener("change", () => {
    const incoming = [...photosInput.files];
    let message = "";

    for (const file of incoming) {
      if (!file.type.startsWith("image/")) {
        message = "Можно прикрепить только изображения.";
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        message = "Размер одного изображения не должен превышать 5 МБ.";
        continue;
      }
      if (selectedFiles.length >= MAX_FILES) {
        message = "Можно прикрепить не более 5 изображений.";
        break;
      }

      const duplicate = selectedFiles.some(
        (item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified,
      );
      if (!duplicate) selectedFiles.push(file);
    }

    photosInput.value = "";
    setError("photos", message);
    renderFiles();
  });

  const uploadZone = requestForm.querySelector(".reference-upload-zone");
  if (uploadZone) {
    ["dragenter", "dragover"].forEach((eventName) => {
      uploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        uploadZone.classList.add("is-dragging");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      uploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        uploadZone.classList.remove("is-dragging");
      });
    });

    uploadZone.addEventListener("drop", (event) => {
      const transfer = new DataTransfer();
      [...event.dataTransfer.files].forEach((file) => transfer.items.add(file));
      photosInput.files = transfer.files;
      photosInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  requestForm.querySelector("[data-next-step]").addEventListener("click", () => {
    if (validateStepOne()) showStep(2, { scroll: true });
  });

  requestForm.querySelector("[data-prev-step]").addEventListener("click", () => showStep(1, { scroll: true }));

  requestForm.elements.messenger.forEach((radio) => {
    radio.addEventListener("change", () => {
      const telegram = radio.value === "Telegram";
      contactLabel.textContent = telegram ? "Telegram тег" : "Телефон";
      phoneInput.type = telegram ? "text" : "tel";
      phoneInput.placeholder = telegram ? "@username" : "+7 (___) ___-__-__";
      phoneInput.autocomplete = telegram ? "off" : "tel";
      setError("phone");
    });
  });

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ base64: reader.result, name: file.name });
      reader.onerror = () => reject(new Error(`Не удалось прочитать ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";

    if (!validateStepOne()) {
      showStep(1);
      return;
    }
    if (!validateStepTwo()) return;

    const messenger = requestForm.elements.messenger.value;
    const contactType = messenger === "Telegram" ? "Telegram" : "Телефон";
    const message = [
      "Услуга: Автозапчасти",
      "",
      `Автомобиль: ${carModelInput.value.trim()}`,
      `Год: ${carYearInput.value.trim() || "не указан"}`,
      `VIN: ${vinInput.value.trim().toUpperCase() || "не указан"}`,
      `Запчасть: ${detailsField.value.trim()}`,
      `Имя: ${nameInput.value.trim()}`,
      `${contactType}: ${phoneInput.value.trim()}`,
      `Мессенджер: ${messenger}`,
      `Фото: ${selectedFiles.length} шт.`,
    ].join("\n");

    submitButton.disabled = true;
      submitButton.textContent = "Отправка...";
    requestForm.setAttribute("aria-busy", "true");

    try {
      const photos = await Promise.all(selectedFiles.map(readFile));
      await fetch(FORM_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ text: message, photos }),
      });

      stepOne.hidden = true;
      stepTwo.hidden = true;
      formHead.hidden = true;
      successView.hidden = false;
      successView.focus();
      window.KITRADE_TRACK?.("request_submit_success");
    } catch (error) {
      status.textContent = "Не удалось отправить заявку. Проверьте интернет и попробуйте ещё раз.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Получить расчёт";
      requestForm.removeAttribute("aria-busy");
    }
  });

  requestForm.querySelector("[data-reset-form]").addEventListener("click", () => {
    requestForm.reset();
    selectedFiles = [];
    renderFiles();
    ["carModel", "carYear", "vin", "details", "photos", "name", "phone", "privacyConsent"].forEach((name) => setError(name));
    status.textContent = "";
    successView.hidden = true;
    formHead.hidden = false;
    contactLabel.textContent = "Телефон";
    phoneInput.type = "tel";
    phoneInput.placeholder = "+7 (___) ___-__-__";
    showStep(1);
  });
}

document.addEventListener("click", (event) => {
  if (event.target.closest('a[href="#request"], a[href$="/#request"]')) window.KITRADE_TRACK?.("request_open");
});

const localOrderCovers = [
  "./assets/order-01-cover.jpg",
  "./assets/order-02-cover.jpg",
  "./assets/order-03-cover.jpg",
  "./assets/order-04-cover.jpg",
  "./assets/order-05-cover.jpg",
  "./assets/order-06-cover.jpg",
];

const sourceDataPromise = fetch("./assets/kitrade-source-data.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Source data request failed: ${response.status}`);
    return response.json();
  })
  .then((data) => ({
    ...data,
    orders: (data.orders || []).map((order, index) => ({
      ...order,
      cover: localOrderCovers[index] || order.cover,
    })),
  }))
  .catch((error) => {
    console.error(error);
    return { videos: [], orders: [] };
  });

const suppliersDialog = document.querySelector("[data-suppliers-dialog]");
const suppliersVideo = document.querySelector("[data-suppliers-video]");
const suppliersSound = document.querySelector("[data-suppliers-sound]");
const suppliersSoundLabel = document.querySelector("[data-sound-label]");
const suppliersTimeline = document.querySelector(".suppliers-timeline i");
const suppliersDialogVideo = document.querySelector("[data-suppliers-dialog-video]");
const suppliersVideoTitle = document.querySelector("[data-suppliers-video-title]");
const suppliersVideoList = suppliersDialog?.querySelector("ol");
let supplierVideos = [];
let activeSupplierVideo = 0;

function syncDialogLock() {
  const ordersDialog = document.querySelector("[data-orders-dialog]");
  document.documentElement.classList.toggle("suppliers-dialog-open", Boolean(suppliersDialog?.open || ordersDialog?.open));
}

function updateSupplierSound() {
  if (!suppliersVideo || !suppliersSound) return;
  const soundOn = !suppliersVideo.muted;
  suppliersSound.setAttribute("aria-pressed", String(soundOn));
  suppliersSound.setAttribute("aria-label", soundOn ? "Выключить звук" : "Включить звук");
  if (suppliersSoundLabel) suppliersSoundLabel.textContent = soundOn ? "Звук вкл." : "Звук выкл.";
}

suppliersSound?.addEventListener("click", () => {
  if (!suppliersVideo) return;
  suppliersVideo.muted = !suppliersVideo.muted;
  suppliersVideo.play().catch(() => {});
  updateSupplierSound();
});

suppliersVideo?.addEventListener("timeupdate", () => {
  if (!suppliersTimeline || !suppliersVideo.duration) return;
  suppliersTimeline.style.width = `${(suppliersVideo.currentTime / suppliersVideo.duration) * 100}%`;
});

function selectSupplierVideo(index) {
  const item = supplierVideos[index];
  if (!item || !suppliersDialogVideo) return;
  activeSupplierVideo = index;
  suppliersDialogVideo.src = item.src;
  suppliersDialogVideo.poster = item.poster;
  suppliersDialogVideo.load();
  suppliersDialogVideo.play().catch(() => {});
  if (suppliersVideoTitle) suppliersVideoTitle.textContent = item.title;
  suppliersVideoList?.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.videoIndex) === index);
  });
}

function renderSupplierVideos(videos) {
  supplierVideos = videos;
  if (!suppliersVideoList || !videos.length) return;
  const fragment = document.createDocumentFragment();
  videos.forEach((video, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const number = document.createElement("span");
    const title = document.createElement("strong");
    const marker = document.createElement("time");
    button.type = "button";
    button.dataset.videoIndex = String(index);
    button.classList.toggle("is-active", index === activeSupplierVideo);
    number.textContent = String(index + 1).padStart(2, "0");
    title.textContent = video.title;
    marker.textContent = "MP4";
    button.append(number, title, marker);
    button.addEventListener("click", () => selectSupplierVideo(index));
    item.append(button);
    fragment.append(item);
  });
  suppliersVideoList.replaceChildren(fragment);
}

sourceDataPromise.then((data) => renderSupplierVideos(data.videos));

document.querySelectorAll("[data-suppliers-open]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (!suppliersDialog || suppliersDialog.open) return;
    const data = await sourceDataPromise;
    if (!supplierVideos.length) renderSupplierVideos(data.videos);
    suppliersDialog.showModal();
    syncDialogLock();
    selectSupplierVideo(activeSupplierVideo);
  });
});

suppliersDialog?.querySelector("[data-suppliers-close]").addEventListener("click", () => {
  suppliersDialog.close();
});

suppliersDialog?.addEventListener("close", () => {
  suppliersDialogVideo?.pause();
  syncDialogLock();
});

suppliersDialog?.addEventListener("click", (event) => {
  if (event.target === suppliersDialog) suppliersDialog.close();
});

const ordersViewport = document.querySelector(".orders-viewport");
const ordersStatus = document.querySelector("[data-orders-status]");
const ordersPrev = document.querySelector("[data-orders-prev]");
const ordersNext = document.querySelector("[data-orders-next]");
const orderProgressItems = [...document.querySelectorAll("[data-orders-progress] i")];

function updateOrdersCarousel() {
  if (!ordersViewport) return;
  const maxScroll = Math.max(0, ordersViewport.scrollWidth - ordersViewport.clientWidth);
  const progress = maxScroll ? ordersViewport.scrollLeft / maxScroll : 0;
  const page = Math.min(orderProgressItems.length - 1, Math.round(progress * (orderProgressItems.length - 1)));
  orderProgressItems.forEach((item, index) => item.classList.toggle("is-active", index === page));
  if (ordersPrev) ordersPrev.disabled = ordersViewport.scrollLeft <= 2;
  if (ordersNext) ordersNext.disabled = ordersViewport.scrollLeft >= maxScroll - 2;
  if (ordersStatus) ordersStatus.textContent = `Позиция ${page + 1} из ${orderProgressItems.length}`;
}

ordersPrev?.addEventListener("click", () => {
  const step = Math.max(220, (ordersViewport?.clientWidth || 0) * 0.15);
  ordersViewport?.scrollBy({ left: -step, behavior: "smooth" });
});

ordersNext?.addEventListener("click", () => {
  const step = Math.max(220, (ordersViewport?.clientWidth || 0) * 0.15);
  ordersViewport?.scrollBy({ left: step, behavior: "smooth" });
});

ordersViewport?.addEventListener("scroll", updateOrdersCarousel, { passive: true });
window.addEventListener("resize", updateOrdersCarousel);
updateOrdersCarousel();

const ordersDialog = document.querySelector("[data-orders-dialog]");
const ordersDialogList = document.querySelector(".orders-dialog-list");
const orderDetailImage = document.querySelector("[data-order-detail-image]");
const orderDetailLabel = document.querySelector("[data-order-detail-label]");
const orderDetailTitle = document.querySelector("[data-order-detail-title]");
const orderDetailLocation = document.querySelector("[data-order-detail-location]");
const orderImageStatus = document.querySelector("[data-order-image-status]");
let sourceOrders = [];
let activeOrder = 0;
let activeOrderImage = 0;

function showOrderImage(index) {
  const order = sourceOrders[activeOrder];
  if (!order?.images.length || !orderDetailImage) return;
  activeOrderImage = (index + order.images.length) % order.images.length;
  orderDetailImage.src = order.images[activeOrderImage];
  orderDetailImage.onerror = () => {
    orderDetailImage.onerror = null;
    orderDetailImage.src = order.cover;
  };
  orderDetailImage.alt = `${order.title}, фотография ${activeOrderImage + 1}`;
  if (orderImageStatus) orderImageStatus.textContent = `${activeOrderImage + 1} / ${order.images.length}`;
}

function selectOrder(index) {
  const order = sourceOrders[index];
  if (!order) return;
  activeOrder = index;
  activeOrderImage = 0;
  if (orderDetailLabel) orderDetailLabel.textContent = `ЗАКАЗ #${String(order.id).padStart(2, "0")}`;
  if (orderDetailTitle) orderDetailTitle.textContent = order.title;
  if (orderDetailLocation) orderDetailLocation.textContent = order.location;
  let activeOrderButton = null;
  ordersDialogList?.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.orderIndex) === index);
    if (Number(button.dataset.orderIndex) === index) activeOrderButton = button;
  });
  showOrderImage(0);
  if (ordersDialog?.open && window.matchMedia("(max-width: 599px)").matches) {
    activeOrderButton?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }
}

function renderOrders(orders) {
  sourceOrders = orders;
  const carouselCards = [...document.querySelectorAll("[data-order-item]")];
  carouselCards.forEach((card, index) => {
    const order = orders[index];
    if (!order) return;
    const image = card.querySelector("img");
    const label = card.querySelector("span");
    const title = card.querySelector("h3");
    const location = card.querySelector("p");
    image.src = order.cover;
    image.alt = order.title;
    label.textContent = `ЗАКАЗ #${String(order.id).padStart(2, "0")}`;
    title.textContent = order.title;
    location.textContent = order.location;
  });

  if (!ordersDialogList) return;
  const fragment = document.createDocumentFragment();
  orders.forEach((order, index) => {
    const button = document.createElement("button");
    const image = document.createElement("img");
    const number = document.createElement("span");
    const title = document.createElement("strong");
    button.type = "button";
    button.dataset.orderIndex = String(index);
    button.classList.toggle("is-active", index === activeOrder);
    image.src = order.cover;
    image.alt = order.title;
    image.loading = "lazy";
    number.textContent = String(order.id).padStart(2, "0");
    title.textContent = order.title;
    button.append(image, number, title);
    button.addEventListener("click", () => selectOrder(index));
    fragment.append(button);
  });
  ordersDialogList.replaceChildren(fragment);
  selectOrder(activeOrder);
}

async function openOrdersDialog(index = 0) {
  if (!ordersDialog || ordersDialog.open) return;
  const data = await sourceDataPromise;
  if (!sourceOrders.length) renderOrders(data.orders);
  selectOrder(index);
  ordersDialog.showModal();
  syncDialogLock();
}

sourceDataPromise.then((data) => renderOrders(data.orders));

document.querySelector("[data-orders-open]")?.addEventListener("click", () => openOrdersDialog(0));
document.querySelectorAll("[data-order-item]").forEach((card) => {
  const open = () => openOrdersDialog(Number(card.dataset.orderIndex));
  card.addEventListener("click", open);
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open();
  });
});

document.querySelector("[data-order-image-prev]")?.addEventListener("click", () => showOrderImage(activeOrderImage - 1));
document.querySelector("[data-order-image-next]")?.addEventListener("click", () => showOrderImage(activeOrderImage + 1));
document.querySelector("[data-orders-close]")?.addEventListener("click", () => ordersDialog?.close());
ordersDialog?.addEventListener("close", syncDialogLock);

const orderDetail = document.querySelector("[data-order-detail]");
let orderSwipeStartX = 0;
let orderSwipeStartY = 0;

orderDetail?.addEventListener("touchstart", (event) => {
  const touch = event.changedTouches[0];
  orderSwipeStartX = touch.clientX;
  orderSwipeStartY = touch.clientY;
}, { passive: true });

orderDetail?.addEventListener("touchend", (event) => {
  if (!window.matchMedia("(max-width: 599px)").matches) return;
  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - orderSwipeStartX;
  const deltaY = touch.clientY - orderSwipeStartY;
  if (Math.abs(deltaX) < 52 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
  showOrderImage(activeOrderImage + (deltaX < 0 ? 1 : -1));
}, { passive: true });

const privacyDialog = document.querySelector("[data-privacy-dialog]");

document.querySelectorAll("[data-open-privacy]").forEach((button) => {
  button.addEventListener("click", () => privacyDialog?.showModal());
});

privacyDialog?.querySelector("[data-close-privacy]").addEventListener("click", () => {
  privacyDialog.close();
});

privacyDialog?.addEventListener("click", (event) => {
  if (event.target === privacyDialog) privacyDialog.close();
});

const faqItems = [...document.querySelectorAll(".reference-faq-list details")];

faqItems.forEach((item) => {
  item.addEventListener("toggle", () => {
    if (!item.open) return;
    faqItems.forEach((otherItem) => {
      if (otherItem !== item) otherItem.open = false;
    });
  });
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-requisites]");
  if (!button) return;
  const text = "ИП Заварзин Дмитрий Александрович\nИНН: 041000625377\nОГРНИП: 325040000001470";
  button.firstChild.textContent = "Копируем... ";
  try {
    await navigator.clipboard.writeText(text);
    button.firstChild.textContent = "Реквизиты скопированы ";
    window.setTimeout(() => {
      button.firstChild.textContent = "Скопировать реквизиты ";
    }, 1800);
  } catch {
    button.firstChild.textContent = "Не удалось скопировать ";
  }
});
