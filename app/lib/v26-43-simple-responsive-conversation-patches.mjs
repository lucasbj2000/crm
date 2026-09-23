const MARKER = "// V26.43 SIMPLE_RESPONSIVE_CONVERSATION";

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.43: no se encontró inicio de ${label}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`V26.43: no se encontró fin de ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function removeV2640ManualTouchRuntime(source) {
  const startMarker = "// V26.40 DEFINITIVE_MOBILE_TOUCH_SCROLL\n(() => {";
  const start = source.indexOf(startMarker);
  if (start < 0) return source;
  const end = source.indexOf("\n})();", start + startMarker.length);
  if (end < 0) throw new Error("V26.43: no se pudo retirar el touch handler manual V26.40.");
  return source.slice(0, start) +
    "// V26.40 DEFINITIVE_MOBILE_TOUCH_SCROLL\n// V26.43: runtime touch manual desactivado; se usa scroll nativo." +
    source.slice(end + "\n})();".length);
}

const RENDER = String.raw`function renderDrawerMessages(deal, { force = false } = {}) {
  const list = ensureDrawerMessageScrollArea();
  if (!list || !deal) return;

  const messages = Array.isArray(deal.messages) ? deal.messages : [];
  const sameDeal = list.dataset.dealId === String(deal.id || "");
  const previousScrollHeight = Number(list.scrollHeight || 0);
  const previousScrollTop = Number(list.scrollTop || 0);
  const previousCount = Number(list.dataset.v2643MessageCount || 0);
  const previousFirstKey = String(list.dataset.v2643FirstKey || "");
  const previousLastKey = String(list.dataset.v2643LastKey || "");
  const wasNearBottom = Math.max(0, list.scrollHeight - list.clientHeight - list.scrollTop) <= 100;

  const messageKey = (message) => String(
    message?.id ||
    message?.providerMessageId ||
    [message?.at || "", message?.direction || "", message?.text || ""].join("|")
  );
  const firstKey = messages.length ? messageKey(messages[0]) : "";
  const lastKey = messages.length ? messageKey(messages[messages.length - 1]) : "";

  const signature = JSON.stringify([
    messages.length,
    messages.map((message) => [
      message.id || "",
      message.providerMessageId || "",
      message.at || "",
      message.direction || "",
      message.origin || "",
      message.text || "",
      message.editedAt || "",
      message.historical === true,
      message.agentName || "",
      message.replyToMessageId || message.replyToId || "",
      message.attachment?.url || message.attachment?.path || message.attachment?.name || "",
      Array.isArray(message.reactions) ? message.reactions : [],
    ]),
  ]);

  const unchanged = sameDeal && list.dataset.messageSignature === signature;
  if (!force && unchanged) return;

  list.innerHTML = messages.length
    ? messages.map((message) =>
        "<div class=\"message " +
        (message.direction === "outgoing" ? "outgoing" : message.direction === "system" ? "system" : "") +
        "\">" +
        attachmentMarkup(message.attachment) +
        (message.text ? "<p>" + escapeHtml(message.text) + "</p>" : "") +
        "<small>" +
        (message.origin === "human"
          ? escapeHtml(message.agentName || "Asesor")
          : message.origin === "bot"
            ? "Bot"
            : message.origin === "followup"
              ? "Seguimiento"
              : message.origin === "transfer"
                ? "Transferencia interna"
                : "Cliente") +
        " · " + escapeHtml(formatDate(message.at)) +
        (message.historical ? " · recuperado" : "") +
        "</small></div>"
      ).join("")
    : '<div class="column-empty">Sin mensajes guardados</div>';

  list.dataset.dealId = String(deal.id || "");
  list.dataset.messageSignature = signature;
  list.dataset.messageCount = String(messages.length);
  list.dataset.v2643MessageCount = String(messages.length);
  list.dataset.v2643FirstKey = firstKey;
  list.dataset.v2643LastKey = lastKey;
  list.dataset.v2641VisibleCount = String(messages.length);
  list.dataset.v2641TotalCount = String(messages.length);
  list.dataset.lastMessageKey = lastKey;

  requestAnimationFrame(() => {
    if (!list.isConnected) return;
    const max = Math.max(0, list.scrollHeight - list.clientHeight);
    const delta = Math.max(0, list.scrollHeight - previousScrollHeight);
    const appendedAtEnd = sameDeal && messages.length > previousCount && previousLastKey && lastKey !== previousLastKey;
    const prependedHistory = sameDeal && messages.length > previousCount && previousFirstKey && firstKey !== previousFirstKey && lastKey === previousLastKey;

    if (!sameDeal || force) {
      list.scrollTop = max;
    } else if (prependedHistory) {
      list.scrollTop = Math.max(0, Math.min(max, previousScrollTop + delta));
    } else if (appendedAtEnd && wasNearBottom) {
      list.scrollTop = max;
    } else {
      list.scrollTop = Math.max(0, Math.min(max, previousScrollTop));
    }
  });
}`;

const APPEND = String.raw`

// V26.43 SIMPLE_RESPONSIVE_CONVERSATION
(() => {
  function installV2643Style() {
    if (document.getElementById("v2643-simple-conversation-style")) return;
    const style = document.createElement("style");
    style.id = "v2643-simple-conversation-style";
    style.textContent = [
      "#deal-drawer{position:fixed!important;inset:0!important;z-index:11000!important;pointer-events:none!important}",
      "#deal-drawer.open{pointer-events:auto!important}",
      "#deal-drawer .drawer-backdrop{position:absolute!important;inset:0!important;display:block!important;background:rgba(10,18,15,.34)!important}",
      "#deal-drawer .drawer-panel{position:fixed!important;top:12px!important;right:12px!important;bottom:12px!important;left:auto!important;display:flex!important;flex-direction:column!important;width:min(1180px,calc(100vw - 24px))!important;max-width:none!important;height:auto!important;max-height:none!important;min-height:0!important;overflow:hidden!important;border-radius:18px!important;background:#fff!important;box-shadow:0 24px 70px rgba(8,20,15,.22)!important;transform:translateX(calc(100% + 28px))!important;transition:transform .2s ease!important}",
      "#deal-drawer.open .drawer-panel{transform:translateX(0)!important}",
      "#deal-drawer .drawer-header{position:relative!important;display:flex!important;align-items:center!important;flex:0 0 auto!important;min-height:66px!important;padding:10px 14px!important;border-bottom:1px solid #e8eeeb!important;background:#fff!important;overflow:hidden!important}",
      "#deal-drawer .drawer-header>div{min-width:0!important;flex:1 1 auto!important}",
      "#deal-drawer .drawer-header h3{margin:1px 0 2px!important;font-size:18px!important;line-height:1.15!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}",
      "#deal-drawer .drawer-header #drawer-phone{display:block!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}",
      "#deal-drawer .drawer-mobile-tabs{position:relative!important;top:auto!important;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;flex:0 0 auto!important;gap:4px!important;padding:6px!important;border-bottom:1px solid #e8eeeb!important;background:#fff!important;z-index:5!important}",
      "#deal-drawer .drawer-mobile-tabs button{min-width:0!important;min-height:40px!important;padding:8px 10px!important;border:0!important;border-radius:10px!important;background:transparent!important;font-size:13px!important;font-weight:750!important;color:#65736d!important}",
      "#deal-drawer .drawer-mobile-tabs button.active{background:#eef3f0!important;color:#173c30!important}",
      "#deal-drawer .drawer-content.drawer-workspace{position:relative!important;display:block!important;flex:1 1 0!important;width:100%!important;height:auto!important;max-height:none!important;min-height:0!important;padding:0!important;overflow:hidden!important;background:#f4f6f5!important}",
      "#deal-drawer .deal-chat-column{display:none!important;width:100%!important;height:100%!important;min-height:0!important;padding:0!important;overflow:hidden!important}",
      "#deal-drawer .deal-chat-column.active{display:flex!important;flex-direction:column!important}",
      "#deal-drawer .deal-side-column{display:contents!important}",
      "#deal-drawer .deal-side-pane{display:none!important;width:100%!important;height:100%!important;min-height:0!important;max-height:none!important;overflow-x:hidden!important;overflow-y:auto!important;padding:18px!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important;background:#fff!important}",
      "#deal-drawer .deal-side-pane.active{display:block!important}",
      "#deal-drawer .chat-only-section{position:relative!important;display:flex!important;flex:1 1 0!important;flex-direction:column!important;width:100%!important;height:100%!important;max-height:none!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;border:0!important;border-radius:0!important;background:#fff!important}",
      "#deal-drawer .chat-only-section>.drawer-section-title{display:none!important}",
      "#deal-drawer .chat-only-section .quick-reply-bar{display:grid!important;grid-template-columns:minmax(0,1fr) auto auto!important;flex:0 0 auto!important;gap:6px!important;margin:0!important;padding:8px 10px!important;border-bottom:1px solid #edf1ef!important;background:#fff!important;overflow:visible!important}",
      "#deal-drawer .chat-only-section .quick-reply-bar select{min-width:0!important;height:40px!important}",
      "#deal-drawer .chat-only-section .quick-reply-bar .button{min-height:40px!important;margin:0!important}",
      "#deal-drawer .chat-only-section #drawer-messages{position:relative!important;display:flex!important;flex:1 1 0!important;flex-direction:column!important;width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;gap:8px!important;margin:0!important;padding:14px 18px 20px!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:contain!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important;scroll-behavior:auto!important;scrollbar-gutter:stable!important;pointer-events:auto!important;background:#f2eee7!important}",
      "#deal-drawer #drawer-messages>.message{display:block!important;flex:0 0 auto!important;align-self:flex-start!important;width:auto!important;max-width:min(76%,720px)!important;min-width:0!important;margin:0!important;padding:10px 12px!important;border-radius:14px!important;overflow:visible!important;overflow-wrap:anywhere!important;word-break:break-word!important;touch-action:pan-y!important}",
      "#deal-drawer #drawer-messages>.message.outgoing{align-self:flex-end!important}",
      "#deal-drawer #drawer-messages>.message.system{align-self:center!important;max-width:90%!important}",
      "#deal-drawer #drawer-messages>.message p{margin:0 0 5px!important;white-space:pre-wrap!important}",
      "#deal-drawer #drawer-messages>.message small{display:block!important;line-height:1.25!important}",
      "#deal-drawer .v2628-reply-preview{flex:0 0 auto!important}",
      "#deal-drawer .modern-composer,#deal-drawer #message-form{position:relative!important;inset:auto!important;display:grid!important;grid-template-columns:minmax(0,1fr) 48px!important;flex:0 0 auto!important;gap:8px!important;width:100%!important;min-width:0!important;margin:0!important;padding:9px 10px 6px!important;border-top:1px solid #e7ece9!important;border-radius:0!important;background:#fff!important;z-index:5!important}",
      "#deal-drawer .modern-composer #manual-message{display:block!important;width:100%!important;min-width:0!important;max-height:132px!important;min-height:44px!important;margin:0!important;font-size:16px!important;resize:none!important}",
      "#deal-drawer .modern-composer .composer-send{width:48px!important;height:48px!important;align-self:end!important}",
      "#deal-drawer .message-tools{position:relative!important;display:flex!important;align-items:center!important;flex:0 0 auto!important;gap:6px!important;width:100%!important;min-width:0!important;margin:0!important;padding:4px 10px 9px!important;overflow-x:auto!important;overflow-y:hidden!important;border:0!important;background:#fff!important;z-index:5!important;-webkit-overflow-scrolling:touch!important}",
      "#deal-drawer .message-tools>button{flex:0 0 auto!important}",
      "#deal-drawer .message-tools .composer-state{margin-left:auto!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}",
      "#deal-drawer .media-composer{position:relative!important;flex:0 0 auto!important;max-height:36vh!important;overflow-y:auto!important;margin:0!important;padding:8px 10px!important;border-top:1px solid #edf1ef!important;background:#fff!important;z-index:6!important}",
      "#deal-drawer .v2625-latest-button{position:absolute!important;right:16px!important;bottom:116px!important;float:none!important;margin:0!important;z-index:8!important}",
      "#deal-drawer .v2641-load-more-wrap,#deal-drawer .v2641-history-start{display:none!important}",
      "@media(max-width:640px){",
      "#deal-drawer .drawer-backdrop{display:none!important}",
      "#deal-drawer .drawer-panel{top:0!important;right:0!important;bottom:0!important;left:0!important;width:100vw!important;height:var(--v2639-viewport-height,100dvh)!important;max-height:var(--v2639-viewport-height,100dvh)!important;border-radius:0!important;box-shadow:none!important}",
      "#deal-drawer .drawer-header{min-height:58px!important;padding:max(8px,env(safe-area-inset-top)) 10px 7px!important}",
      "#deal-drawer .drawer-header h3{font-size:17px!important}",
      "#deal-drawer .drawer-mobile-tabs{padding:5px 7px!important}",
      "#deal-drawer .drawer-mobile-tabs button{min-height:38px!important;padding:7px 5px!important;font-size:12px!important}",
      "#deal-drawer .chat-only-section .quick-reply-bar{grid-template-columns:minmax(0,1fr) auto!important;padding:7px 8px!important}",
      "#deal-drawer .chat-only-section .quick-reply-bar select{grid-column:1/-1!important;width:100%!important}",
      "#deal-drawer .chat-only-section .quick-reply-bar #insert-quick-reply,#deal-drawer .chat-only-section .quick-reply-bar #send-quick-reply{width:auto!important;min-width:0!important}",
      "#deal-drawer .chat-only-section #drawer-messages{gap:7px!important;padding:10px 10px 14px!important;scrollbar-gutter:auto!important}",
      "#deal-drawer #drawer-messages>.message{max-width:90%!important;padding:9px 10px!important;border-radius:13px!important}",
      "#deal-drawer .modern-composer,#deal-drawer #message-form{grid-template-columns:minmax(0,1fr) 46px!important;padding:7px 8px 5px!important}",
      "#deal-drawer .modern-composer .composer-send{width:46px!important;height:46px!important}",
      "#deal-drawer .message-tools{padding:4px 8px calc(7px + env(safe-area-inset-bottom))!important}",
      "#deal-drawer .message-tools .composer-state{display:none!important}",
      "#deal-drawer .deal-side-pane{padding:12px 10px calc(12px + env(safe-area-inset-bottom))!important}",
      "#deal-drawer .v2625-latest-button{right:10px!important;bottom:108px!important}",
      "}"
    ].join("");
    document.head.appendChild(style);
  }

  function syncV2643() {
    const list = document.querySelector("#drawer-messages");
    if (list) {
      list.style.webkitOverflowScrolling = "touch";
      list.style.touchAction = "pan-y";
      list.removeAttribute("data-v2641-loading-older");
    }
  }

  function installV2643() {
    installV2643Style();
    syncV2643();
    new MutationObserver(() => requestAnimationFrame(syncV2643))
      .observe(document.body, { subtree: true, childList: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installV2643, { once: true });
  } else {
    installV2643();
  }
})();
`;

export function applyV2643CoreUiPatches(source) {
  if (source.includes(MARKER)) return source;
  if (!source.includes("// V26.42 DEDICATED_MOBILE_MESSAGE_SCROLL")) {
    throw new Error("V26.43 requiere V26.42 aplicado antes.");
  }

  source = removeV2640ManualTouchRuntime(source);

  source = replaceBetween(
    source,
    "function renderDrawerMessages(deal, { force = false } = {}) {",
    "function renderDrawer()",
    RENDER + "\n\n",
    "renderDrawerMessages"
  );

  return source + APPEND;
}
