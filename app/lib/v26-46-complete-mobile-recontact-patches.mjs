const MARKER = "// V26.46 COMPLETE_MOBILE_RUNTIME";

const APPEND = String.raw`

// V26.46 COMPLETE_MOBILE_RUNTIME
(() => {
  function v2646UpdateViewportHeight() {
    const viewport = window.visualViewport;
    const height = Math.max(
      320,
      Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 720),
    );
    document.documentElement.style.setProperty("--v2646-vh", height + "px");
  }

  function v2646SyncViewVisibility() {
    if (typeof currentView !== "string") return;
    document.querySelectorAll("[data-view-panel]").forEach((panel) => {
      const active = panel.dataset.viewPanel === currentView;
      if (panel.hidden === active) panel.hidden = !active;
      if (panel.classList.contains("active") !== active) panel.classList.toggle("active", active);
      const aria = active ? "false" : "true";
      if (panel.getAttribute("aria-hidden") !== aria) panel.setAttribute("aria-hidden", aria);
      if (active) panel.classList.remove("view-motion-enter");
    });
  }

  function v2646SyncClosedRecontactBanner() {
    const composer = document.querySelector("#deal-drawer .v2645-composer");
    if (!composer || typeof appState === "undefined") return;

    const id = typeof selectedDealId === "undefined" ? null : selectedDealId;
    const deal = (appState?.deals || []).find((entry) => entry.id === id);
    const closed = Boolean(deal && ["won", "lost"].includes(deal.stage));
    let banner = composer.querySelector(":scope > .v2646-recontact-banner");

    if (!closed) {
      if (banner) banner.remove();
      return;
    }

    if (!banner) {
      banner = document.createElement("div");
      banner.className = "v2646-recontact-banner";
      banner.innerHTML = [
        "<span>↻</span>",
        "<div>",
        "<strong>Volver a contactar</strong>",
        "<small>Esta negociación está cerrada. Al enviar un mensaje se creará una nueva negociación en Contactado y quedará asignada al agente que la recontacta.</small>",
        "<button type=\"button\">Escribir mensaje</button>",
        "</div>",
      ].join("");
      banner.querySelector("button")?.addEventListener("click", () => {
        const box = document.querySelector("#manual-message");
        box?.focus();
        box?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      });
      composer.prepend(banner);
    }

    const box = document.querySelector("#manual-message");
    const send = document.querySelector("#message-form button[type=\"submit\"], #message-form .composer-send");
    if (box) {
      box.disabled = false;
      box.placeholder = "Escribí para volver a contactar al cliente…";
    }
    if (send) {
      send.disabled = false;
      send.title = "Enviar y crear nueva negociación en Contactado";
    }
  }

  function v2646SyncChatScroll() {
    const list = document.querySelector("#drawer-messages.v2645-messages, #drawer-messages");
    if (!list) return;
    list.style.overflowY = "auto";
    list.style.webkitOverflowScrolling = "touch";
    list.style.touchAction = "pan-y";
    list.style.overscrollBehaviorY = "contain";
  }

  function v2646Sync() {
    v2646UpdateViewportHeight();
    v2646SyncViewVisibility();
    v2646SyncClosedRecontactBanner();
    v2646SyncChatScroll();
  }

  function v2646Install() {
    document.documentElement.classList.add("v2646-ready");
    v2646Sync();

    let queued = false;
    const queue = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        v2646Sync();
      });
    };

    new MutationObserver(queue).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "aria-hidden", "disabled"],
    });

    window.addEventListener("crm:state", queue);
    window.addEventListener("resize", queue, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(queue, 80), { passive: true });
    window.visualViewport?.addEventListener("resize", queue, { passive: true });
    window.visualViewport?.addEventListener("scroll", () => requestAnimationFrame(v2646UpdateViewportHeight), { passive: true });

    document.addEventListener("click", (event) => {
      const nav = event.target.closest(".nav-item[data-view]");
      if (nav) {
        document.querySelectorAll(".view-motion-enter").forEach((node) => node.classList.remove("view-motion-enter"));
        requestAnimationFrame(v2646SyncViewVisibility);
      }
    }, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", v2646Install, { once: true });
  } else {
    v2646Install();
  }
})();
`;

export function applyV2646CoreUiPatches(source) {
  if (source.includes(MARKER)) return source;
  if (!source.includes("// V26.45 DEAL_CHAT_UNIFIED_INBOX_UI")) {
    throw new Error("V26.46 requiere V26.45 aplicado antes.");
  }
  if (!source.includes("/* V26.38 closed recontact */")) {
    throw new Error("V26.46 requiere V26.38 aplicado antes.");
  }
  return source + APPEND;
}
