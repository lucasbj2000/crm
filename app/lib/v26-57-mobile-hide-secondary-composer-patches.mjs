const MARKER = "// V26.57 MOBILE_HIDE_SECONDARY_COMPOSER";

const APPEND = String.raw`

// V26.57 MOBILE_HIDE_SECONDARY_COMPOSER
(() => {
  function v2657InstallStyle() {
    if (document.getElementById("v2657-mobile-hide-secondary-composer-style")) return;

    const style = document.createElement("style");
    style.id = "v2657-mobile-hide-secondary-composer-style";
    style.textContent = [
      "@media(max-width:900px){",

      "body.v2654-mobile-detail-open #deal-drawer .chat-only-section.v2645-deal-chat,#deal-drawer.v2654-isolated .chat-only-section.v2645-deal-chat{display:grid!important;grid-template-rows:minmax(0,1fr) auto!important;height:100%!important;min-height:0!important;max-height:100%!important;overflow:hidden!important}",

      "body.v2654-mobile-detail-open #deal-drawer .v2645-ai-row,#deal-drawer.v2654-isolated .v2645-ai-row{display:none!important;height:0!important;min-height:0!important;max-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}",

      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer .quick-reply-bar,#deal-drawer.v2654-isolated .v2645-composer .quick-reply-bar{display:none!important;height:0!important;min-height:0!important;max-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important}",

      "body.v2654-mobile-detail-open #deal-drawer #drawer-messages.v2645-messages,#deal-drawer.v2654-isolated #drawer-messages.v2645-messages{grid-row:1!important;height:100%!important;min-height:260px!important;max-height:none!important;padding:10px 10px 8px!important;overflow-x:hidden!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important;overscroll-behavior-y:contain!important}",

      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer,#deal-drawer.v2654-isolated .v2645-composer{grid-row:2!important;display:block!important;max-height:118px!important;margin:0!important;padding:6px 8px calc(7px + env(safe-area-inset-bottom))!important;overflow-y:auto!important;border-top:1px solid #e5ebe7!important;background:#fff!important}",

      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer #message-form,#deal-drawer.v2654-isolated .v2645-composer #message-form{display:flex!important;gap:6px!important;margin:0!important}",

      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer #manual-message,#deal-drawer.v2654-isolated .v2645-composer #manual-message{min-height:42px!important;max-height:76px!important;padding:8px 10px!important;font-size:16px!important;line-height:1.3!important}",

      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer .composer-send,#deal-drawer.v2654-isolated .v2645-composer .composer-send{min-width:64px!important;min-height:42px!important;padding:0 10px!important;font-size:11px!important}",

      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer .message-tools,#deal-drawer.v2654-isolated .v2645-composer .message-tools{display:flex!important;gap:6px!important;margin-top:6px!important;min-height:30px!important}",

      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer .message-tools>button,#deal-drawer.v2654-isolated .v2645-composer .message-tools>button{min-height:30px!important;padding:4px 8px!important;font-size:11px!important}",

      "body.v2654-mobile-detail-open #deal-drawer .v2625-latest-button,#deal-drawer.v2654-isolated .v2625-latest-button{bottom:92px!important}",

      "body.v2655-keyboard-open #deal-drawer .v2645-composer{max-height:92px!important;padding:5px 7px calc(6px + env(safe-area-inset-bottom))!important}",
      "body.v2655-keyboard-open #deal-drawer .v2645-composer .message-tools{display:none!important}",
      "body.v2655-keyboard-open #deal-drawer #drawer-messages.v2645-messages{min-height:140px!important}",
      "body.v2655-keyboard-open #deal-drawer .v2625-latest-button{bottom:58px!important}",

      "}",
    ].join("");

    document.head.appendChild(style);
  }

  function v2657Apply() {
    if (!window.matchMedia?.("(max-width: 900px)")?.matches) return;
    const drawer = document.querySelector("#deal-drawer");
    if (!drawer?.classList.contains("open")) return;
    v2657InstallStyle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", v2657Apply, { once: true });
  } else {
    v2657Apply();
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-v2651-deal]")) {
      setTimeout(v2657Apply, 0);
      setTimeout(v2657Apply, 100);
    }
  }, true);
})();
`;

export function applyV2657MobileHideSecondaryComposerPatches(source) {
  if (source.includes(MARKER)) return source;
  if (!source.includes("// V26.56 MOBILE_CONVERSATION_PRIORITY")) {
    throw new Error("V26.57 requiere V26.56 aplicado antes.");
  }
  return source + APPEND;
}
