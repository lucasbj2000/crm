(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);

  function notify(message, tone = "warning") {
    try {
      if (typeof showToast === "function") return showToast(message, tone);
    } catch {}
    console.warn(message);
  }

  function protectHiddenAudioAnchor(button) {
    if (!button) return null;
    button.type = "button";
    button.hidden = true;
    button.disabled = true;
    button.tabIndex = -1;
    button.setAttribute("aria-hidden", "true");
    button.setAttribute("data-v253-audio-anchor", "1");
    button.style.setProperty("display", "none", "important");
    try {
      Object.defineProperty(button, "remove", {
        configurable: true,
        value() {
          this.hidden = true;
          this.disabled = true;
          this.style.setProperty("display", "none", "important");
        },
      });
    } catch {}
    return button;
  }

  function ensureAudioCompatibilityAnchor() {
    let button = $("#record-audio-button");
    if (button) return protectHiddenAudioAnchor(button);

    button = document.createElement("button");
    button.id = "record-audio-button";
    button.textContent = "Audio deshabilitado";
    protectHiddenAudioAnchor(button);

    const host = $("#message-form") || $("#deal-drawer .drawer-content") || document.body;
    host.appendChild(button);
    return button;
  }

  function safeOpenDeal(dealId) {
    if (!dealId) return false;
    ensureAudioCompatibilityAnchor();
    try {
      if (typeof openDrawer !== "function") throw new Error("La vista completa no está disponible.");
      openDrawer(dealId);
      const drawer = $("#deal-drawer");
      if (!drawer?.classList.contains("open")) throw new Error("La negociación no llegó a abrirse.");
      return true;
    } catch (error) {
      console.error("V25.3 · error al abrir negociación", error);
      notify(`No se pudo abrir la negociación: ${error?.message || "error inesperado"}`);
      return false;
    }
  }

  function safeOpenClientProfile() {
    ensureAudioCompatibilityAnchor();
    try {
      if (typeof openClientProfile !== "function") throw new Error("La ficha 360° no está disponible.");
      void openClientProfile();
      return true;
    } catch (error) {
      console.error("V25.3 · error al abrir ficha", error);
      notify(`No se pudo abrir la ficha del cliente: ${error?.message || "error inesperado"}`);
      return false;
    }
  }

  function installNegotiationNavigation() {
    document.addEventListener("click", (event) => {
      const card = event.target.closest?.("#crm-board [data-deal-id]");
      if (!card) return;
      if (event.target.closest?.("a,input,select,textarea,[data-v253-ignore-open]")) return;
      event.preventDefault();
      event.stopPropagation();
      safeOpenDeal(card.dataset.dealId);
    }, true);

    document.addEventListener("click", (event) => {
      const button = event.target.closest?.("#open-client-profile-button");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      safeOpenClientProfile();
    }, true);
  }

  function installCompatibilityWatch() {
    // V24.1 retiraba físicamente el botón de audio. El drawer legacy aún espera
    // que exista, por lo que V25.3 conserva un ancla oculta e inutilizable.
    ensureAudioCompatibilityAnchor();
    window.addEventListener("crm:state", ensureAudioCompatibilityAnchor);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) ensureAudioCompatibilityAnchor();
    });
  }

  function install() {
    installCompatibilityWatch();
    installNegotiationNavigation();
    document.body.classList.add("v253-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
