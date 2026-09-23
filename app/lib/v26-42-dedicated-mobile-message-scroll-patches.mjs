const MARKER = "// V26.42 DEDICATED_MOBILE_MESSAGE_SCROLL";

function replaceRegexOnce(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`V26.42: no se encontró ${label}`);
  return source.replace(pattern, replacement);
}

const APPEND = String.raw`

// V26.42 DEDICATED_MOBILE_MESSAGE_SCROLL
(() => {
  function installV2642Style() {
    if (document.getElementById("v2642-dedicated-message-scroll-style")) return;
    const style = document.createElement("style");
    style.id = "v2642-dedicated-message-scroll-style";
    style.textContent = [
      "@media(max-width:900px){",
      "body.v2630-mobile .deal-chat-column[data-drawer-pane='conversation'].active{display:flex!important;flex-direction:column!important;height:100%!important;max-height:none!important;min-height:0!important;overflow:hidden!important;overscroll-behavior:auto!important;touch-action:auto!important}",
      "body.v2630-mobile .chat-only-section{display:flex!important;flex:1 1 0!important;flex-direction:column!important;width:100%!important;height:100%!important;min-height:0!important;overflow:hidden!important}",
      "body.v2630-mobile .chat-only-section .drawer-section-title{flex:0 0 auto!important}",
      "body.v2630-mobile .chat-only-section .quick-reply-bar{flex:0 0 auto!important}",
      "body.v2630-mobile .chat-only-section #drawer-messages{position:relative!important;display:grid!important;flex:1 1 0!important;width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:contain!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important;scroll-behavior:auto!important;pointer-events:auto!important}",
      "body.v2630-mobile .v2628-reply-preview{flex:0 0 auto!important}",
      "body.v2630-mobile .modern-composer,body.v2630-mobile #message-form{position:relative!important;flex:0 0 auto!important;bottom:auto!important}",
      "body.v2630-mobile .message-tools{position:relative!important;flex:0 0 auto!important;bottom:auto!important}",
      "body.v2630-mobile .media-composer{flex:0 0 auto!important}",
      "body.v2630-mobile .v2625-latest-button{position:absolute!important;right:12px!important;bottom:118px!important;float:none!important;margin:0!important}",
      "}"
    ].join("");
    document.head.appendChild(style);
  }

  function syncV2642Scroller() {
    const list = document.querySelector("#drawer-messages");
    if (!list) return;
    list.style.webkitOverflowScrolling = "touch";
    list.style.touchAction = "pan-y";
  }

  function installV2642() {
    installV2642Style();
    syncV2642Scroller();
    new MutationObserver(() => requestAnimationFrame(syncV2642Scroller))
      .observe(document.body, { subtree: true, childList: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installV2642, { once: true });
  } else {
    installV2642();
  }
})();
`;

const V2641_SCROLLER_PATTERN =
  /function v2641ConversationScroller\(list = document\.querySelector\("#drawer-messages"\)\) \{[\s\S]*?\n\}/g;

const V2641_SCROLLER_REPLACEMENT = `function v2641ConversationScroller(list = document.querySelector("#drawer-messages")) {
  return list;
}`;

function normalizeV2641ConversationScrollers(source) {
  const matches = source.match(V2641_SCROLLER_PATTERN);
  if (!matches?.length) {
    throw new Error("V26.42: no se encontró v2641ConversationScroller");
  }
  return source.replace(V2641_SCROLLER_PATTERN, V2641_SCROLLER_REPLACEMENT);
}

export function applyV2642CoreUiPatches(source) {
  if (!source.includes("// V26.41 PROGRESSIVE_CHAT_HISTORY")) {
    throw new Error("V26.42 requiere V26.41 aplicado antes.");
  }

  source = normalizeV2641ConversationScrollers(source);

  // Aunque V26.42 ya esté presente, volvemos a normalizar el scroller.
  // Durante el deploy otras capas/pruebas pueden reutilizar un app.js ya parcheado.
  if (source.includes(MARKER)) return source;

  return source + APPEND;
}
