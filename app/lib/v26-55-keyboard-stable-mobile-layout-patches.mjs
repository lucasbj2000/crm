const MARKER = "// V26.55 KEYBOARD_STABLE_MOBILE_LAYOUT";

const APPEND = String.raw`

// V26.55 KEYBOARD_STABLE_MOBILE_LAYOUT
(() => {
  let v2655StableHeight = 0;
  let v2655Queued = false;

  function v2655IsMobile() {
    return window.matchMedia?.("(max-width: 900px)")?.matches === true;
  }

  function v2655DrawerOpen() {
    return document.querySelector("#deal-drawer")?.classList.contains("open") === true;
  }

  function v2655EditableFocused() {
    const active = document.activeElement;
    if (!active?.closest?.("#deal-drawer")) return false;
    return Boolean(active.matches?.("input, textarea, select, [contenteditable='true']"));
  }

  function v2655ReadLayoutHeight() {
    const viewport = window.visualViewport;
    return Math.max(
      320,
      Math.round(
        window.innerHeight ||
        document.documentElement.clientHeight ||
        viewport?.height ||
        720
      )
    );
  }

  function v2655CaptureStableHeight(force = false) {
    const layoutHeight = v2655ReadLayoutHeight();
    if (force || !v2655StableHeight) {
      v2655StableHeight = layoutHeight;
      return;
    }
    if (!v2655EditableFocused()) {
      v2655StableHeight = Math.max(v2655StableHeight, layoutHeight);
    }
  }

  function v2655KeyboardInset() {
    if (!v2655DrawerOpen() || !v2655EditableFocused()) return 0;
    const viewport = window.visualViewport;
    if (!viewport || !v2655StableHeight) return 0;

    const visibleBottom = Math.round(
      Number(viewport.height || 0) + Number(viewport.offsetTop || 0)
    );
    let inset = Math.max(0, v2655StableHeight - visibleBottom);

    if (inset < 80) inset = 0;
    return Math.min(inset, Math.round(v2655StableHeight * 0.62));
  }

  function v2655Apply() {
    if (!v2655IsMobile()) {
      document.body.classList.remove("v2655-keyboard-open");
      document.documentElement.style.removeProperty("--v2655-stable-vh");
      document.documentElement.style.removeProperty("--v2655-keyboard-inset");
      return;
    }

    if (!v2655DrawerOpen()) {
      v2655CaptureStableHeight(true);
    } else if (!v2655StableHeight) {
      v2655CaptureStableHeight(true);
    }

    const inset = v2655KeyboardInset();
    document.documentElement.style.setProperty("--v2655-stable-vh", v2655StableHeight + "px");
    document.documentElement.style.setProperty("--v2655-keyboard-inset", inset + "px");
    document.body.classList.toggle("v2655-keyboard-open", inset > 0);
  }

  function v2655Queue() {
    if (v2655Queued) return;
    v2655Queued = true;
    requestAnimationFrame(() => {
      v2655Queued = false;
      v2655Apply();
    });
  }

  function v2655Install() {
    v2655CaptureStableHeight(true);
    v2655Apply();

    const drawer = document.querySelector("#deal-drawer");
    if (drawer) {
      new MutationObserver(() => {
        if (v2655DrawerOpen() && !v2655EditableFocused()) {
          v2655CaptureStableHeight(true);
        }
        v2655Queue();
      }).observe(drawer, {
        attributes: true,
        attributeFilter: ["class", "aria-hidden"],
      });
    }

    document.addEventListener("focusin", (event) => {
      if (!event.target.closest?.("#deal-drawer")) return;
      v2655CaptureStableHeight(false);
      setTimeout(v2655Queue, 0);
      setTimeout(v2655Queue, 120);
      setTimeout(v2655Queue, 300);
    });

    document.addEventListener("focusout", (event) => {
      if (!event.target.closest?.("#deal-drawer")) return;
      setTimeout(v2655Queue, 80);
      setTimeout(() => {
        if (!v2655EditableFocused()) v2655CaptureStableHeight(true);
        v2655Queue();
      }, 320);
    });

    window.addEventListener("resize", () => {
      if (!v2655EditableFocused()) v2655CaptureStableHeight(true);
      v2655Queue();
    }, { passive: true });

    window.addEventListener("orientationchange", () => {
      v2655StableHeight = 0;
      setTimeout(() => {
        v2655CaptureStableHeight(true);
        v2655Queue();
      }, 180);
    }, { passive: true });

    window.visualViewport?.addEventListener("resize", v2655Queue, { passive: true });
    window.visualViewport?.addEventListener("scroll", v2655Queue, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", v2655Install, { once: true });
  } else {
    v2655Install();
  }
})();
`;

export function applyV2655KeyboardStableMobileLayoutPatches(source) {
  if (source.includes(MARKER)) return source;
  if (!source.includes("// V26.54 MOBILE_DETAIL_ISOLATION")) {
    throw new Error("V26.55 requiere V26.54 aplicado antes.");
  }
  return source + APPEND;
}
