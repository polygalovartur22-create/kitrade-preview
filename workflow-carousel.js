"use strict";

(() => {
  const track = document.querySelector("#workflow .workflow-steps");
  const pagination = document.querySelector("#workflow .workflow-pagination");
  const cards = track ? Array.from(track.children) : [];
  const buttons = pagination ? Array.from(pagination.querySelectorAll("button")) : [];

  if (!track || cards.length === 0 || buttons.length !== cards.length) return;

  let scrollFrame = 0;

  const setActive = (activeIndex) => {
    buttons.forEach((button, index) => {
      const active = index === activeIndex;
      button.classList.toggle("is-active", active);
      if (active) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  };

  const closestCardIndex = () => {
    const trackLeft = track.getBoundingClientRect().left;
    let activeIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card, index) => {
      const distance = Math.abs(card.getBoundingClientRect().left - trackLeft);
      if (distance < closestDistance) {
        closestDistance = distance;
        activeIndex = index;
      }
    });

    return activeIndex;
  };

  track.addEventListener(
    "scroll",
    () => {
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        setActive(closestCardIndex());
      });
    },
    { passive: true },
  );

  buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      cards[index].scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "nearest",
        inline: "start",
      });
      setActive(index);
    });
  });
})();
