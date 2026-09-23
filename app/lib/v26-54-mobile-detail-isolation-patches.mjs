const MARKER = "// V26.54 MOBILE_DETAIL_ISOLATION";

const APPEND = String.raw`

// V26.54 MOBILE_DETAIL_ISOLATION
(() => {
  let v2654Scheduled = false;

  function v2654IsMobile() {
    return window.matchMedia?.("(max-width: 900px)")?.matches === true;
  }

  function v2654DrawerOpen() {
    const drawer = document.querySelector("#deal-drawer");
    return Boolean(drawer?.classList.contains("open") && drawer.getAttribute("aria-hidden") !== "true");
  }

  function v2654ViewportMetrics() {
    const viewport = window.visualViewport;
    const layoutHeight = Math.max(
      320,
      Math.round(window.innerHeight || document.documentElement.clientHeight || 720),
    );
    const visibleHeight = Math.max(
      320,
      Math.round(viewport?.height || layoutHeight),
    );
    const offsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
    const bottomEdge = Math.max(
      visibleHeight,
      Math.min(layoutHeight, visibleHeight + offsetTop),
    );

    document.documentElement.style.setProperty("--v2654-vh", bottomEdge + "px");
    document.documentElement.style.setProperty("--v2654-visible-vh", visibleHeight + "px");
    document.documentElement.style.setProperty("--v2654-vv-offset", offsetTop + "px");
  }

  function v2654ApplyState() {
    v2654ViewportMetrics();
    const open = v2654IsMobile() && v2654DrawerOpen();
    document.body.classList.toggle("v2654-mobile-detail-open", open);

    const drawer = document.querySelector("#deal-drawer");
    if (drawer) drawer.classList.toggle("v2654-isolated", open);

    const shell = document.querySelector("#app-shell");
    if (shell) {
      if (open) {
        shell.setAttribute("aria-hidden", "true");
        shell.setAttribute("inert", "");
      } else {
        shell.removeAttribute("aria-hidden");
        shell.removeAttribute("inert");
      }
    }
  }

  function v2654Queue() {
    if (v2654Scheduled) return;
    v2654Scheduled = true;
    requestAnimationFrame(() => {
      v2654Scheduled = false;
      v2654ApplyState();
    });
  }

  function v2654Install() {
    const drawer = document.querySelector("#deal-drawer");
    if (!drawer) return;

    v2654ApplyState();

    new MutationObserver(v2654Queue).observe(drawer, {
      attributes: true,
      attributeFilter: ["class", "aria-hidden"],
    });

    document.addEventListener("focusin", (event) => {
      if (!event.target.closest("#deal-drawer")) return;
      setTimeout(v2654Queue, 0);
      setTimeout(v2654Queue, 120);
      setTimeout(v2654Queue, 320);
    });

    document.addEventListener("focusout", (event) => {
      if (!event.target.closest("#deal-drawer")) return;
      setTimeout(v2654Queue, 80);
      setTimeout(v2654Queue, 260);
    });

    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-drawer]")) {
        setTimeout(v2654Queue, 0);
        setTimeout(v2654Queue, 100);
      }
      if (event.target.closest("[data-v2651-deal]")) {
        setTimeout(v2654Queue, 0);
        setTimeout(v2654Queue, 100);
      }
    }, true);

    window.addEventListener("resize", v2654Queue, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(v2654Queue, 120), { passive: true });
    window.visualViewport?.addEventListener("resize", v2654Queue, { passive: true });
    window.visualViewport?.addEventListener("scroll", v2654Queue, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", v2654Install, { once: true });
  } else {
    v2654Install();
  }
})();
`;

export function applyV2654MobileDetailIsolationPatches(source) {
  if (source.includes(MARKER)) return source;
  if (!source.includes("// V26.51 AGENT_MOBILE_INBOX")) {
    throw new Error("V26.54 requiere V26.51 aplicado antes.");
  }
  return source + APPEND;
}
