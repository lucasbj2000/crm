const MARKER = "// V26.40 DEFINITIVE_MOBILE_TOUCH_SCROLL";

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`V26.40: no se encontró ${label}`);
  return source.replace(search, replacement);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`V26.40: no se encontró ${label}`);
  return source.replace(pattern, replacement);
}

const APPEND = String.raw`

// V26.40 DEFINITIVE_MOBILE_TOUCH_SCROLL
(() => {
  const state = new WeakMap();

  function isMobile() {
    return window.matchMedia?.("(max-width: 900px)")?.matches === true ||
      (navigator.maxTouchPoints || 0) > 0;
  }

  function maxScroll(list) {
    return Math.max(0, list.scrollHeight - list.clientHeight);
  }

  function cancelAutoScroll(list) {
    try {
      if (typeof v2626CancelPendingDrawerAutoScroll === "function") {
        v2626CancelPendingDrawerAutoScroll(list);
      }
    } catch {}
    list.dataset.v2626ManualBrowsing = "1";
  }

  function finishTouch(list) {
    const current = state.get(list);
    if (!current) return;
    list.classList.remove("v2640-touching");
    if (current.dragged) {
      current.suppressClickUntil = Date.now() + 350;
      list.dataset.v2640SuppressClickUntil = String(current.suppressClickUntil);
    }
    current.active = false;
    current.touchId = null;
  }

  function bind(list) {
    if (!list || list.dataset.v2640TouchBound === "1") return;
    list.dataset.v2640TouchBound = "1";

    list.addEventListener("touchstart", (event) => {
      if (!isMobile() || event.touches.length !== 1) return;
      const touch = event.touches[0];
      cancelAutoScroll(list);
      state.set(list, {
        active: true,
        touchId: touch.identifier,
        lastX: touch.clientX,
        lastY: touch.clientY,
        startX: touch.clientX,
        startY: touch.clientY,
        dragged: false,
        suppressClickUntil: 0,
      });
      list.classList.add("v2640-touching");
    }, { passive: true });

    list.addEventListener("touchmove", (event) => {
      const current = state.get(list);
      if (!current?.active || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (current.touchId !== null && touch.identifier !== current.touchId) return;

      const dx = touch.clientX - current.lastX;
      const dy = touch.clientY - current.lastY;
      const totalX = touch.clientX - current.startX;
      const totalY = touch.clientY - current.startY;

      if (Math.abs(totalY) < 3 && Math.abs(totalX) < 3) return;
      if (Math.abs(totalX) > Math.abs(totalY) * 1.35 && !current.dragged) return;

      const maximum = maxScroll(list);
      if (maximum <= 0) return;

      current.dragged = true;
      cancelAutoScroll(list);

      const before = Number(list.scrollTop || 0);
      const next = Math.max(0, Math.min(maximum, before - dy));
      if (Math.abs(next - before) >= 0.25) list.scrollTop = next;

      current.lastX = touch.clientX;
      current.lastY = touch.clientY;
      list.dataset.v2626ManualBrowsing = next < maximum - 6 ? "1" : "0";

      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });

    list.addEventListener("touchend", () => finishTouch(list), { passive: true });
    list.addEventListener("touchcancel", () => finishTouch(list), { passive: true });

    list.addEventListener("click", (event) => {
      const until = Number(list.dataset.v2640SuppressClickUntil || 0);
      if (until && Date.now() < until) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    list.addEventListener("scroll", () => {
      const maximum = maxScroll(list);
      const distance = Math.max(0, maximum - list.scrollTop);
      if (distance <= 6) list.dataset.v2626ManualBrowsing = "0";
    }, { passive: true });
  }

  function installStyle() {
    if (document.querySelector("#v2640-touch-scroll-style")) return;
    const style = document.createElement("style");
    style.id = "v2640-touch-scroll-style";
    style.textContent = [
      "@media(max-width:900px){",
      "#deal-drawer #drawer-messages{position:relative!important;z-index:2!important;overflow-y:scroll!important;overflow-x:hidden!important;touch-action:pan-y!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior-y:contain!important;pointer-events:auto!important}",
      "#deal-drawer #drawer-messages.v2640-touching,#deal-drawer #drawer-messages.v2640-touching *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}",
      "#deal-drawer #drawer-messages .message{touch-action:pan-y!important}",
      "}"
    ].join("");
    document.head.appendChild(style);
  }

  function sync() {
    installStyle();
    bind(document.querySelector("#drawer-messages"));
  }

  function install() {
    sync();
    new MutationObserver(() => requestAnimationFrame(sync))
      .observe(document.body, { subtree: true, childList: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
`;

export function applyV2640CoreUiPatches(source) {
  if (source.includes(MARKER)) return source;
  if (!source.includes("// V26.39 MOBILE_CHAT_LAYOUT_FIX")) {
    throw new Error("V26.40 requiere V26.39 aplicado antes.");
  }

  source = replaceRegexOnce(
    source,
    /const\s+shouldScrollBottom\s*=\s*force\s*\|\|\s*!sameDeal\s*\|\|\s*appendedMessage\s*;/,
    'const shouldScrollBottom = force || !sameDeal || (appendedMessage && list.dataset.v2626ManualBrowsing !== "1");',
    "protección contra auto-scroll durante navegación manual"
  );

  return source + APPEND;
}
