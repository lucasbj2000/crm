const MARKER = "// V26.39 MOBILE_CHAT_LAYOUT_FIX";

export function applyV2639CoreUiPatches(source) {
  if (source.includes(MARKER)) return source;
  const patch = String.raw`

// V26.39 MOBILE_CHAT_LAYOUT_FIX
(() => {
  function installV2639Style() {
    if (document.getElementById("v2639-mobile-chat-style")) return;
    const style = document.createElement("style");
    style.id = "v2639-mobile-chat-style";
    style.textContent = [
      "@media(max-width:900px){",
      "body.v2630-mobile .deal-drawer{z-index:11000!important;overflow:hidden!important}",
      "body.v2630-mobile .deal-drawer.open{width:100vw!important;height:var(--v2639-viewport-height,100dvh)!important;max-height:var(--v2639-viewport-height,100dvh)!important}",
      "body.v2630-mobile .deal-drawer .drawer-backdrop{display:none!important}",
      "body.v2630-mobile .deal-drawer .drawer-panel{position:fixed!important;inset:0!important;display:flex!important;width:100vw!important;max-width:none!important;height:var(--v2639-viewport-height,100dvh)!important;max-height:var(--v2639-viewport-height,100dvh)!important;min-height:0!important;overflow:hidden!important;border-radius:0!important;transform:translateX(103%)!important}",
      "body.v2630-mobile .deal-drawer.open .drawer-panel{transform:translateX(0)!important}",
      "body.v2630-mobile .drawer-header{flex:0 0 auto!important;min-height:0!important;padding:max(10px,env(safe-area-inset-top)) 12px 9px!important;overflow:hidden!important}",
      "body.v2630-mobile .drawer-header>div{min-width:0!important;flex:1 1 auto!important}",
      "body.v2630-mobile .drawer-header h3,body.v2630-mobile .drawer-header span{max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}",
      "body.v2630-mobile .drawer-header h3{font-size:18px!important;line-height:1.15!important}",
      "body.v2630-mobile .drawer-mobile-tabs{position:relative!important;top:auto!important;flex:0 0 auto!important;z-index:4!important;padding:6px 8px!important}",
      "body.v2630-mobile .drawer-mobile-tabs button{min-width:0!important;min-height:38px!important;padding:7px 5px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}",
      "body.v2630-mobile .drawer-content.drawer-workspace{display:block!important;flex:1 1 0!important;width:100%!important;height:auto!important;max-height:none!important;min-height:0!important;padding:0!important;overflow:hidden!important}",
      "body.v2630-mobile .deal-chat-column{display:none!important;width:100%!important;height:100%!important;max-height:none!important;min-height:0!important;padding:0!important;overflow:hidden!important}",
      "body.v2630-mobile .deal-chat-column.active{display:flex!important;flex-direction:column!important}",
      "body.v2630-mobile .deal-side-column{display:contents!important}",
      "body.v2630-mobile .deal-side-pane{display:none!important;width:100%!important;height:100%!important;max-height:none!important;min-height:0!important;padding:10px!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:contain!important;-webkit-overflow-scrolling:touch!important}",
      "body.v2630-mobile .deal-side-pane.active{display:block!important}",
      "body.v2630-mobile .chat-only-section{position:relative!important;display:flex!important;flex:1 1 0!important;flex-direction:column!important;width:100%!important;height:100%!important;max-height:none!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;border:0!important;border-radius:0!important}",
      "body.v2630-mobile .chat-only-section .drawer-section-title{flex:0 0 auto!important;padding:8px 12px 5px!important}",
      "body.v2630-mobile .chat-only-section .quick-reply-bar{flex:0 0 auto!important;margin:0 8px 6px!important;padding:6px!important;grid-template-columns:minmax(0,1fr) auto auto!important;overflow:visible!important}",
      "body.v2630-mobile .chat-only-section #drawer-messages{display:grid!important;flex:1 1 0!important;width:100%!important;height:auto!important;max-height:none!important;min-height:0!important;gap:8px!important;padding:10px 10px 16px!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:contain!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important;scroll-behavior:auto!important;scrollbar-gutter:stable!important}",
      "body.v2630-mobile .chat-only-section #drawer-messages>.message{max-width:88%!important;min-width:0!important;overflow-wrap:anywhere!important;word-break:break-word!important}",
      "body.v2630-mobile .v2628-reply-preview{flex:0 0 auto!important;min-width:0!important;padding:7px 10px!important}",
      "body.v2630-mobile .modern-composer,body.v2630-mobile #message-form{position:relative!important;inset:auto!important;z-index:3!important;display:grid!important;grid-template-columns:minmax(0,1fr) 44px!important;flex:0 0 auto!important;width:auto!important;min-width:0!important;margin:0!important;padding:7px 8px!important;border-radius:0!important;background:#fff!important}",
      "body.v2630-mobile .modern-composer #manual-message{width:100%!important;min-width:0!important;max-height:108px!important;font-size:16px!important}",
      "body.v2630-mobile .message-tools{position:relative!important;z-index:3!important;display:flex!important;flex:0 0 auto!important;min-width:0!important;gap:5px!important;padding:5px 8px calc(7px + env(safe-area-inset-bottom))!important;overflow-x:auto!important;overflow-y:hidden!important;background:#fff!important;-webkit-overflow-scrolling:touch!important}",
      "body.v2630-mobile .message-tools>button{flex:0 0 auto!important}",
      "body.v2630-mobile .media-composer{flex:0 0 auto!important;max-height:42vh!important;overflow-y:auto!important;padding:8px!important;background:#fff!important}",
      "body.v2630-mobile .v2625-latest-button{right:12px!important;bottom:118px!important;z-index:5!important;max-width:calc(100vw - 24px)!important}",
      "body.v2630-mobile .v2628-emoji-panel{position:absolute!important;left:8px!important;right:8px!important;bottom:92px!important;width:auto!important;max-width:none!important;max-height:min(330px,45vh)!important;overflow-y:auto!important;z-index:7!important}",
      "body.v2630-mobile .v2628-emoji-grid{grid-template-columns:repeat(7,minmax(0,1fr))!important}",
      "body.v2630-mobile.v2639-drawer-open .v2630-mobile-dock,body.v2630-mobile.v2639-drawer-open .v24-mobile-menu{display:none!important}",
      "body.v2630-mobile.v2639-drawer-open .call-alert{max-width:calc(100vw - 16px)!important;left:8px!important;right:8px!important;top:max(8px,env(safe-area-inset-top))!important}",
      "body.v2630-mobile.v2639-drawer-open .toast{left:8px!important;right:8px!important;bottom:8px!important;max-width:none!important}",
      "}",
      "@media(max-width:430px){",
      "body.v2630-mobile .chat-only-section .quick-reply-bar{grid-template-columns:minmax(0,1fr) auto!important}",
      "body.v2630-mobile .chat-only-section .quick-reply-bar select{grid-column:1/-1!important}",
      "body.v2630-mobile .chat-only-section .quick-reply-bar .button{width:auto!important;min-width:0!important;padding-inline:9px!important}",
      "body.v2630-mobile .message-tools .composer-state{display:none!important}",
      "body.v2630-mobile .v2628-emoji-grid{grid-template-columns:repeat(6,minmax(0,1fr))!important}",
      "}"
    ].join("");
    document.head.appendChild(style);
  }

  function v2639ViewportHeight() {
    const vv = window.visualViewport;
    const height = Math.max(320, Math.round(vv?.height || window.innerHeight || document.documentElement.clientHeight || 720));
    document.documentElement.style.setProperty("--v2639-viewport-height", height + "px");
  }

  function v2639SyncDrawerState() {
    const drawer = document.querySelector("#deal-drawer");
    const open = Boolean(drawer?.classList.contains("open"));
    document.body.classList.toggle("v2639-drawer-open", open);
    if (!open) return;
    v2639ViewportHeight();
    const list = document.querySelector("#drawer-messages");
    if (list) {
      list.style.webkitOverflowScrolling = "touch";
      list.style.touchAction = "pan-y";
    }
  }

  function v2639Install() {
    installV2639Style();
    v2639ViewportHeight();
    v2639SyncDrawerState();

    const drawer = document.querySelector("#deal-drawer");
    if (drawer) {
      new MutationObserver(() => requestAnimationFrame(v2639SyncDrawerState))
        .observe(drawer, { attributes: true, attributeFilter: ["class", "aria-hidden"] });
    }

    const onViewport = () => {
      v2639ViewportHeight();
      if (document.body.classList.contains("v2639-drawer-open")) {
        requestAnimationFrame(v2639SyncDrawerState);
      }
    };

    window.addEventListener("resize", onViewport, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(onViewport, 80), { passive: true });
    window.visualViewport?.addEventListener("resize", onViewport, { passive: true });
    window.visualViewport?.addEventListener("scroll", onViewport, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", v2639Install, { once: true });
  else v2639Install();
})();
`;

  return source + "\n\n" + patch + "\n" + MARKER + "\n";
}
