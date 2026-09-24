const MARKER = "// V26.56 MOBILE_CONVERSATION_PRIORITY";

const APPEND = String.raw`

// V26.56 MOBILE_CONVERSATION_PRIORITY
(() => {
  function v2656InstallStyle() {
    if (document.getElementById("v2656-mobile-conversation-priority-style")) return;

    const style = document.createElement("style");
    style.id = "v2656-mobile-conversation-priority-style";
    style.textContent = [
      "@media(max-width:900px){",
      "body.v2654-mobile-detail-open #deal-drawer .drawer-panel,#deal-drawer.v2654-isolated .drawer-panel{grid-template-rows:auto auto auto minmax(0,1fr)!important}",

      "body.v2654-mobile-detail-open #deal-drawer .drawer-header,#deal-drawer.v2654-isolated .drawer-header{min-height:0!important;padding:7px 10px!important}",
      "body.v2654-mobile-detail-open #deal-drawer .drawer-header h3,#deal-drawer.v2654-isolated .drawer-header h3{margin:0!important;font-size:15px!important;line-height:1.15!important}",
      "body.v2654-mobile-detail-open #deal-drawer .drawer-header .kicker,#deal-drawer.v2654-isolated .drawer-header .kicker{margin:0 0 2px!important;font-size:8px!important}",
      "body.v2654-mobile-detail-open #deal-drawer .drawer-header #drawer-phone,#deal-drawer.v2654-isolated .drawer-header #drawer-phone{margin-top:2px!important;font-size:9px!important}",
      "body.v2654-mobile-detail-open #deal-drawer .drawer-header .icon-button.close,#deal-drawer.v2654-isolated .drawer-header .icon-button.close{width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important}",

      "body.v2654-mobile-detail-open #deal-drawer .v2651-chat-actions,#deal-drawer.v2654-isolated .v2651-chat-actions{gap:5px!important;padding:5px 7px!important;overflow-x:auto!important;overflow-y:hidden!important;white-space:nowrap!important;scrollbar-width:none!important}",
      "body.v2654-mobile-detail-open #deal-drawer .v2651-chat-actions::-webkit-scrollbar,#deal-drawer.v2654-isolated .v2651-chat-actions::-webkit-scrollbar{display:none!important}",
      "body.v2654-mobile-detail-open #deal-drawer .v2651-chat-actions>button,#deal-drawer.v2654-isolated .v2651-chat-actions>button{min-height:30px!important;padding:5px 8px!important;border-radius:8px!important;font-size:10px!important}",

      "body.v2654-mobile-detail-open #deal-drawer .drawer-mobile-tabs,#deal-drawer.v2654-isolated .drawer-mobile-tabs{display:grid!important;grid-template-columns:1fr 1fr 1fr!important;gap:4px!important;padding:4px 7px!important}",
      "body.v2654-mobile-detail-open #deal-drawer .drawer-mobile-tabs button,#deal-drawer.v2654-isolated .drawer-mobile-tabs button{min-height:30px!important;padding:4px 6px!important;border-radius:8px!important;font-size:10px!important}",

      "body.v2654-mobile-detail-open #deal-drawer .drawer-content.drawer-workspace,#deal-drawer.v2654-isolated .drawer-content.drawer-workspace{height:auto!important;min-height:0!important;max-height:none!important;overflow:hidden!important}",
      "body.v2654-mobile-detail-open #deal-drawer .deal-chat-column.active,#deal-drawer.v2654-isolated .deal-chat-column.active{height:100%!important;min-height:0!important;max-height:100%!important;overflow:hidden!important}",
      "body.v2654-mobile-detail-open #deal-drawer .chat-only-section.v2645-deal-chat,#deal-drawer.v2654-isolated .chat-only-section.v2645-deal-chat{display:grid!important;grid-template-rows:minmax(0,1fr) 32px auto!important;height:100%!important;min-height:0!important;max-height:100%!important;overflow:hidden!important}",

      "body.v2654-mobile-detail-open #deal-drawer #drawer-messages.v2645-messages,#deal-drawer.v2654-isolated #drawer-messages.v2645-messages{grid-row:1!important;height:100%!important;min-height:220px!important;max-height:none!important;padding:10px 10px 6px!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important;overscroll-behavior-y:contain!important}",
      "body.v2654-mobile-detail-open #deal-drawer #drawer-messages.v2645-messages>.message.v2511-message,#deal-drawer.v2654-isolated #drawer-messages.v2645-messages>.message.v2511-message{max-width:90%!important;margin:5px 0!important;padding:8px 10px!important}",
      "body.v2654-mobile-detail-open #deal-drawer #drawer-messages.v2645-messages>.message.v2511-message p,#deal-drawer.v2654-isolated #drawer-messages.v2645-messages>.message.v2511-message p{font-size:12px!important;line-height:1.4!important}",
      "body.v2654-mobile-detail-open #deal-drawer #drawer-messages.v2645-messages>.message.v2511-message small,#deal-drawer.v2654-isolated #drawer-messages.v2645-messages>.message.v2511-message small{margin-top:3px!important;font-size:8px!important}",
      "body.v2654-mobile-detail-open #deal-drawer #drawer-messages.v2645-messages img,#deal-drawer.v2654-isolated #drawer-messages.v2645-messages img,body.v2654-mobile-detail-open #deal-drawer #drawer-messages.v2645-messages video,#deal-drawer.v2654-isolated #drawer-messages.v2645-messages video{max-width:min(220px,100%)!important;max-height:150px!important;object-fit:cover!important}",

      "body.v2654-mobile-detail-open #deal-drawer .v2645-ai-row,#deal-drawer.v2654-isolated .v2645-ai-row{grid-row:2!important;min-height:32px!important;height:32px!important;padding:3px 8px!important;gap:5px!important}",
      "body.v2654-mobile-detail-open #deal-drawer .v2645-ai-row button,#deal-drawer.v2654-isolated .v2645-ai-row button{min-height:26px!important;padding:4px 8px!important;border-radius:8px!important;font-size:10px!important}",
      "body.v2654-mobile-detail-open #deal-drawer .v2645-ai-row span,#deal-drawer.v2654-isolated .v2645-ai-row span{display:none!important}",

      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer,#deal-drawer.v2654-isolated .v2645-composer{grid-row:3!important;max-height:168px!important;padding:6px 8px calc(7px + env(safe-area-inset-bottom))!important;overflow-y:auto!important}",
      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer .quick-reply-bar,#deal-drawer.v2654-isolated .v2645-composer .quick-reply-bar{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:5px!important;margin:0 0 5px!important}",
      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer .quick-reply-bar select,#deal-drawer.v2654-isolated .v2645-composer .quick-reply-bar select{min-height:32px!important;height:32px!important;padding:4px 8px!important;font-size:13px!important;border-radius:8px!important}",
      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer .quick-reply-bar #insert-quick-reply,#deal-drawer.v2654-isolated .v2645-composer .quick-reply-bar #insert-quick-reply{min-width:64px!important;min-height:32px!important;height:32px!important;padding:4px 8px!important;font-size:10px!important;border-radius:8px!important}",
      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer #message-form,#deal-drawer.v2654-isolated .v2645-composer #message-form{gap:6px!important}",
      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer #manual-message,#deal-drawer.v2654-isolated .v2645-composer #manual-message{min-height:40px!important;max-height:74px!important;padding:8px 10px!important;font-size:16px!important;line-height:1.3!important;border-radius:10px!important}",
      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer .composer-send,#deal-drawer.v2654-isolated .v2645-composer .composer-send{min-width:62px!important;min-height:40px!important;padding:0 9px!important;border-radius:10px!important;font-size:11px!important}",
      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer .message-tools,#deal-drawer.v2654-isolated .v2645-composer .message-tools{gap:5px!important;margin-top:5px!important;min-height:28px!important}",
      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer .message-tools>button,#deal-drawer.v2654-isolated .v2645-composer .message-tools>button{min-height:28px!important;padding:4px 8px!important;border-radius:8px!important;font-size:10px!important}",
      "body.v2654-mobile-detail-open #deal-drawer .v2645-composer .message-tools .composer-state,#deal-drawer.v2654-isolated .v2645-composer .message-tools .composer-state{display:none!important}",

      "body.v2655-keyboard-open #deal-drawer .v2645-ai-row{display:none!important}",
      "body.v2655-keyboard-open #deal-drawer .v2645-composer{max-height:112px!important;padding:5px 7px calc(6px + env(safe-area-inset-bottom))!important}",
      "body.v2655-keyboard-open #deal-drawer .v2645-composer .quick-reply-bar{display:none!important}",
      "body.v2655-keyboard-open #deal-drawer .v2645-composer .message-tools{display:none!important}",
      "body.v2655-keyboard-open #deal-drawer #drawer-messages.v2645-messages{min-height:120px!important;padding-bottom:5px!important}",

      "body.v2654-mobile-detail-open #deal-drawer .v2625-latest-button,#deal-drawer.v2654-isolated .v2625-latest-button{right:10px!important;bottom:116px!important;min-height:28px!important;padding:4px 8px!important;font-size:10px!important}",
      "body.v2655-keyboard-open #deal-drawer .v2625-latest-button{bottom:66px!important}",
      "}",
    ].join("");
    document.head.appendChild(style);
  }

  function v2656Apply() {
    if (!window.matchMedia?.("(max-width: 900px)")?.matches) return;
    const drawer = document.querySelector("#deal-drawer");
    if (!drawer?.classList.contains("open")) return;
    v2656InstallStyle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", v2656Apply, { once: true });
  } else {
    v2656Apply();
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-v2651-deal]")) {
      setTimeout(v2656Apply, 0);
      setTimeout(v2656Apply, 100);
    }
  }, true);
})();
`;

export function applyV2656MobileConversationPriorityPatches(source) {
  if (source.includes(MARKER)) return source;
  if (!source.includes("// V26.55 KEYBOARD_STABLE_MOBILE_LAYOUT")) {
    throw new Error("V26.56 requiere V26.55 aplicado antes.");
  }
  return source + APPEND;
}
