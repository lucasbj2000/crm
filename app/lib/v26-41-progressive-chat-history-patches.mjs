const MARKER = "// V26.41 PROGRESSIVE_CHAT_HISTORY";

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.41: no se encontró inicio de ${label}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`V26.41: no se encontró fin de ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`V26.41: no se encontró ${label}`);
  return source.replace(pattern, replacement);
}

const RENDER = String.raw`function renderDrawerMessages(deal, { force = false } = {}) {
  const list = ensureDrawerMessageScrollArea();
  if (!list || !deal) return;

  const allMessages = Array.isArray(deal.messages) ? deal.messages : [];
  const sameDeal = list.dataset.dealId === String(deal.id || "");
  const requestedCount = sameDeal ? Math.max(50, Number(list.dataset.v2641VisibleCount || 50)) : 50;
  const visibleCount = Math.min(Math.max(50, requestedCount), Math.max(50, allMessages.length));
  const messages = allMessages.slice(-visibleCount);
  const remaining = Math.max(0, allMessages.length - messages.length);
  const scroller = v2641ConversationScroller(list);

  const signature = JSON.stringify([
    visibleCount,
    allMessages.length,
    messages.map((message) => [
      message.id || "",
      message.at || "",
      message.direction || "",
      message.origin || "",
      message.text || "",
      message.historical === true,
      message.agentName || "",
      message.attachment?.url || message.attachment?.path || message.attachment?.name || "",
    ]),
  ]);

  const unchanged = sameDeal && list.dataset.messageSignature === signature;
  if (!force && unchanged) return;

  const previousScrollHeight = scroller?.scrollHeight || 0;
  const previousScrollTop = scroller?.scrollTop || 0;
  const previousTotal = Number(list.dataset.v2641TotalCount || 0);
  const wasNearBottom = scroller
    ? Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop) <= 90
    : true;
  const loadingOlder = list.dataset.v2641LoadingOlder === "1";
  const appendedMessage = sameDeal && allMessages.length > previousTotal;

  const loadMore = remaining > 0
    ? '<div class="v2641-load-more-wrap"><button class="v2641-load-more" type="button" data-v2641-load-more="1">↑ Cargar 50 anteriores <small>' + remaining + ' anteriores disponibles</small></button></div>'
    : (allMessages.length > 50 ? '<div class="v2641-history-start">Inicio del historial cargado</div>' : '');

  list.innerHTML = loadMore + (messages.length
    ? messages.map((message) => `<div class="message ${message.direction === "outgoing" ? "outgoing" : message.direction === "system" ? "system" : ""}">${attachmentMarkup(message.attachment)}${message.text ? `<p>${escapeHtml(message.text)}</p>` : ""}<small>${message.origin === "human" ? escapeHtml(message.agentName || "Asesor") : message.origin === "bot" ? "Bot" : message.origin === "followup" ? "Seguimiento" : message.origin === "transfer" ? "Transferencia interna" : "Cliente"} · ${escapeHtml(formatDate(message.at))}${message.historical ? " · recuperado" : ""}</small></div>`).join("")
    : '<div class="column-empty">Sin mensajes guardados</div>');

  list.dataset.dealId = String(deal.id || "");
  list.dataset.messageSignature = signature;
  list.dataset.messageCount = String(messages.length);
  list.dataset.v2641VisibleCount = String(visibleCount);
  list.dataset.v2641TotalCount = String(allMessages.length);
  const tailMessage = messages[messages.length - 1] || null;
  list.dataset.lastMessageKey = tailMessage
    ? String(tailMessage.id || tailMessage.providerMessageId || [tailMessage.at || "", tailMessage.direction || "", tailMessage.text || ""].join("|"))
    : "";

  requestAnimationFrame(() => {
    if (!list.isConnected || !scroller?.isConnected) return;
    const delta = Math.max(0, scroller.scrollHeight - previousScrollHeight);
    if (loadingOlder) {
      scroller.scrollTop = Math.max(0, previousScrollTop + delta);
    } else if (!sameDeal || force || (appendedMessage && wasNearBottom)) {
      scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    } else {
      scroller.scrollTop = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, previousScrollTop));
    }
    list.dataset.v2641LoadingOlder = "0";
  });
}`;

const APPEND = String.raw`

// V26.41 PROGRESSIVE_CHAT_HISTORY
function v2641IsMobileConversation() {
  return window.matchMedia?.("(max-width: 900px)")?.matches === true;
}

function v2641ConversationScroller(list = document.querySelector("#drawer-messages")) {
  if (v2641IsMobileConversation()) {
    return document.querySelector(".deal-chat-column[data-drawer-pane='conversation']");
  }
  return list;
}

function v2641InstallStyle() {
  if (document.querySelector("#v2641-progressive-history-style")) return;
  const style = document.createElement("style");
  style.id = "v2641-progressive-history-style";
  style.textContent = [
    ".v2641-load-more-wrap{display:flex;justify-content:center;padding:8px 10px 12px}",
    ".v2641-load-more{display:flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:8px 13px;border:1px solid #d8e1dc;border-radius:999px;background:#fff;color:#355448;font-size:10px;font-weight:850;box-shadow:0 4px 14px rgba(28,50,41,.06);cursor:pointer}",
    ".v2641-load-more small{color:#87958e;font-size:8px;font-weight:700}",
    ".v2641-history-start{text-align:center;padding:8px 10px 12px;color:#98a49e;font-size:8px;font-weight:750}",
    "@media(max-width:900px){",
    "body.v2630-mobile .drawer-content.drawer-workspace{overflow:hidden!important}",
    "body.v2630-mobile .deal-chat-column[data-drawer-pane='conversation'].active{display:block!important;height:100%!important;min-height:0!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:contain!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important}",
    "body.v2630-mobile .chat-only-section{display:block!important;height:auto!important;min-height:100%!important;overflow:visible!important}",
    "body.v2630-mobile .chat-only-section #drawer-messages{display:grid!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;touch-action:auto!important;-webkit-overflow-scrolling:auto!important;overscroll-behavior:auto!important;padding-bottom:12px!important}",
    "body.v2630-mobile .modern-composer,body.v2630-mobile #message-form{position:relative!important;bottom:auto!important}",
    "body.v2630-mobile .message-tools{position:relative!important;bottom:auto!important}",
    "body.v2630-mobile .v2625-latest-button{position:sticky!important;float:right!important;right:10px!important;bottom:10px!important;margin:-52px 10px 8px auto!important;width:max-content!important}",
    "}"
  ].join("");
  document.head.appendChild(style);
}

function v2641ScrollConversationToLatest() {
  const list = document.querySelector("#drawer-messages");
  const scroller = v2641ConversationScroller(list);
  if (!scroller) return;
  requestAnimationFrame(() => {
    scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  });
}

function v2641LoadOlder() {
  const list = document.querySelector("#drawer-messages");
  if (!list || !selectedDealId) return;
  const deal = (appState?.deals || []).find((entry) => entry.id === selectedDealId);
  if (!deal) return;
  const current = Math.max(50, Number(list.dataset.v2641VisibleCount || 50));
  list.dataset.v2641VisibleCount = String(current + 50);
  list.dataset.v2641LoadingOlder = "1";
  list.dataset.messageSignature = "";
  renderDrawerMessages(deal, { force: false });
}

function v2641Install() {
  v2641InstallStyle();
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-v2641-load-more]");
    if (!button) return;
    event.preventDefault();
    v2641LoadOlder();
  }, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", v2641Install, { once: true });
else v2641Install();
`;

export function applyV2641CoreUiPatches(source) {
  if (source.includes(MARKER)) return source;
  if (!source.includes("// V26.40 DEFINITIVE_MOBILE_TOUCH_SCROLL")) {
    throw new Error("V26.41 requiere V26.40 aplicado antes.");
  }

  source = replaceBetween(
    source,
    "function renderDrawerMessages(deal, { force = false } = {}) {",
    "\n\nfunction renderDrawer()",
    RENDER,
    "renderDrawerMessages"
  );

  source = replaceRegexOnce(
    source,
    /function scrollDrawerMessagesToLatest\(list\) \{[\s\S]*?\n\}\n\nfunction renderDrawerMessages/,
    `function scrollDrawerMessagesToLatest(list) {
  if (!list) return;
  try { if (typeof v2626BindDrawerNativeScroll === "function") v2626BindDrawerNativeScroll(list); } catch {}
  const scroller = typeof v2641ConversationScroller === "function" ? v2641ConversationScroller(list) : list;
  const scroll = () => {
    if (!scroller?.isConnected) return;
    scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  };
  requestAnimationFrame(() => requestAnimationFrame(scroll));
  setTimeout(scroll, 80);
  setTimeout(scroll, 240);
}

function renderDrawerMessages`,
    "scroll al último mensaje"
  );

  return source + APPEND;
}
