(() => {
  "use strict";
  const MOBILE_QUERY = "(max-width: 900px)";
  let menuButton = null;
  let overlay = null;

  function appHeight() {
    const height = Math.round(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0);
    if (height > 0) document.documentElement.style.setProperty("--v256-app-height", `${height}px`);
  }

  function isMobile() { return window.matchMedia?.(MOBILE_QUERY)?.matches === true; }

  function closeMenu() {
    document.body.classList.remove("v24-nav-open");
    menuButton?.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    if (!isMobile()) return;
    document.body.classList.add("v24-nav-open");
    menuButton?.setAttribute("aria-expanded", "true");
  }

  function ensureMobileMenu() {
    menuButton = document.querySelector(".v24-mobile-menu");
    overlay = document.querySelector(".v24-mobile-overlay");
    if (!menuButton) {
      menuButton = document.createElement("button");
      menuButton.type = "button";
      menuButton.className = "v24-mobile-menu";
      menuButton.setAttribute("aria-label", "Abrir menú");
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.innerHTML = "☰ <span>Menú</span>";
      document.body.appendChild(menuButton);
    }
    if (!overlay) {
      overlay = document.createElement("button");
      overlay.type = "button";
      overlay.className = "v24-mobile-overlay";
      overlay.hidden = false;
      overlay.setAttribute("aria-label", "Cerrar menú");
      document.body.appendChild(overlay);
    }
    if (!menuButton.dataset.v256Bound) {
      menuButton.dataset.v256Bound = "1";
      menuButton.addEventListener("click", () => document.body.classList.contains("v24-nav-open") ? closeMenu() : openMenu());
    }
    if (!overlay.dataset.v256Bound) {
      overlay.dataset.v256Bound = "1";
      overlay.addEventListener("click", closeMenu);
    }
  }

  function markViewport() {
    const mobile = isMobile();
    document.documentElement.dataset.v256 = mobile ? "mobile" : "desktop";
    document.body.classList.toggle("v256-mobile", mobile);
    if (!mobile) closeMenu();
    appHeight();
  }

  function normalizeOpenUi() {
    document.querySelectorAll("dialog[open]").forEach((dialog) => {
      dialog.scrollTop = 0;
      const card = dialog.querySelector(".dialog-card,.client-profile-dialog");
      if (card) card.scrollTop = 0;
    });
    const drawer = document.querySelector("#deal-drawer,.deal-drawer");
    if (drawer && isMobile()) {
      const content = drawer.querySelector(".drawer-content");
      if (content) content.scrollLeft = 0;
    }
  }

  function install() {
    ensureMobileMenu();
    markViewport();
    document.querySelector(".sidebar")?.addEventListener("click", (event) => {
      if (event.target.closest(".nav-item,[data-view],a")) closeMenu();
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
    window.addEventListener("resize", markViewport, { passive: true });
    window.addEventListener("orientationchange", () => { closeMenu(); setTimeout(() => { markViewport(); normalizeOpenUi(); }, 180); }, { passive: true });
    window.visualViewport?.addEventListener("resize", appHeight, { passive: true });
    document.addEventListener("toggle", (event) => { if (event.target instanceof HTMLDialogElement && event.target.open) normalizeOpenUi(); }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
