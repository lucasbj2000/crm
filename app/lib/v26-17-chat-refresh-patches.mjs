const MARKER = "// V26.17 CHAT_REFRESH_STABILITY";

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`V26.17: no se encontró el bloque ${label}`);
  return source.replace(search, replacement);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`V26.17: no se encontró el bloque ${label}`);
  return source.replace(pattern, replacement);
}

const DRAWER_MESSAGE_HELPER = [
  MARKER,
  "function ensureDrawerMessageScrollArea() {",
  "  let style = document.querySelector(\"#v2617-drawer-scroll-style\");",
  "  if (!style) {",
  "    style = document.createElement(\"style\");",
  "    style.id = \"v2617-drawer-scroll-style\";",
  "    style.textContent = [",
  "      \".drawer-content.drawer-workspace{flex:1 1 0!important;min-height:0!important;overflow:hidden!important}\",",
  "      \".deal-chat-column[data-drawer-pane='conversation']{display:flex;min-height:0!important;overflow:hidden!important;flex-direction:column}\",",
  "      \".chat-only-section{flex:1 1 0!important;height:auto!important;min-height:0!important;overflow:hidden!important}\",",
  "      \".chat-only-section #drawer-messages{flex:1 1 0!important;height:0!important;min-height:0!important;max-height:none!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;scrollbar-gutter:stable;pointer-events:auto!important}\",",
  "      \".chat-only-section #drawer-messages::-webkit-scrollbar{width:10px}\",",
  "      \".chat-only-section #drawer-messages::-webkit-scrollbar-thumb{background:rgba(70,90,80,.28);border:2px solid transparent;border-radius:999px;background-clip:padding-box}\",",
  "      \"@media(max-width:900px){.drawer-content.drawer-workspace{overflow-y:auto!important}.deal-chat-column[data-drawer-pane='conversation']{overflow:hidden!important}.chat-only-section{height:calc(100dvh - 150px)!important}.chat-only-section #drawer-messages{height:0!important;min-height:0!important}}\",",
  "    ].join(\"\\n\");",
  "    document.head.appendChild(style);",
  "  }",
  "  const list = $(\"#drawer-messages\");",
  "  if (!list) return null;",
  "  if (list.dataset.wheelScrollBound !== \"1\") {",
  "    list.dataset.wheelScrollBound = \"1\";",
  "    list.addEventListener(\"wheel\", (event) => {",
  "      if (!Number.isFinite(event.deltaY) || Math.abs(event.deltaY) < Math.abs(event.deltaX || 0)) return;",
  "      const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);",
  "      if (maxScroll <= 0) return;",
  "      const before = list.scrollTop;",
  "      list.scrollTop = Math.max(0, Math.min(maxScroll, before + event.deltaY));",
  "      if (list.scrollTop !== before) { event.preventDefault(); event.stopPropagation(); }",
  "    }, { passive: false });",
  "  }",
  "  return list;",
  "}",
  "",
  "function scrollDrawerMessagesToLatest(list) {",
  "  if (!list) return;",
  "  const scroll = () => { if (list.isConnected) list.scrollTop = list.scrollHeight; };",
  "  requestAnimationFrame(() => requestAnimationFrame(scroll));",
  "  setTimeout(scroll, 120);",
  "  setTimeout(scroll, 420);",
  "  list.querySelectorAll(\"img\").forEach((image) => {",
  "    if (!image.complete) image.addEventListener(\"load\", scroll, { once: true });",
  "  });",
  "}",
  "",
  "function renderDrawerMessages(deal, { force = false } = {}) {",
  "  const list = ensureDrawerMessageScrollArea();",
  "  if (!list || !deal) return;",
  "",
  "  const messages = (deal.messages || []).slice(-80);",
  "  const signature = JSON.stringify(messages.map((message) => [",
  "    message.id || \"\",",
  "    message.at || \"\",",
  "    message.direction || \"\",",
  "    message.origin || \"\",",
  "    message.text || \"\",",
  "    message.historical === true,",
  "    message.agentName || \"\",",
  "    message.attachment?.url || message.attachment?.path || message.attachment?.name || \"\",",
  "  ]));",
  "  const sameDeal = list.dataset.dealId === String(deal.id || \"\");",
  "  const unchanged = sameDeal && list.dataset.messageSignature === signature;",
  "  if (!force && unchanged) return;",
  "",
  "  const previousScrollHeight = list.scrollHeight;",
  "  const previousScrollTop = list.scrollTop;",
  "  const previousMessageCount = Number(list.dataset.messageCount || 0);",
  "  const previousTailKey = list.dataset.lastMessageKey || \"\";",
  "  const tailMessage = messages[messages.length - 1] || null;",
  "  const tailKey = tailMessage ? String(tailMessage.id || tailMessage.providerMessageId || [tailMessage.at || \"\", tailMessage.direction || \"\", tailMessage.text || \"\"].join(\"|\")) : \"\";",
  "  const appendedMessage = sameDeal && (messages.length > previousMessageCount || Boolean(tailKey && tailKey !== previousTailKey));",
  "  const shouldScrollBottom = force || !sameDeal || appendedMessage;",
  "",
  "  list.innerHTML = messages.length",
  "    ? messages.map((message) => `<div class=\"message ${message.direction === \"outgoing\" ? \"outgoing\" : message.direction === \"system\" ? \"system\" : \"\"}\">${attachmentMarkup(message.attachment)}${message.text ? `<p>${escapeHtml(message.text)}</p>` : \"\"}<small>${message.origin === \"human\" ? escapeHtml(message.agentName || \"Asesor\") : message.origin === \"bot\" ? \"Bot\" : message.origin === \"followup\" ? \"Seguimiento\" : message.origin === \"transfer\" ? \"Transferencia interna\" : \"Cliente\"} · ${escapeHtml(formatDate(message.at))}${message.historical ? \" · recuperado\" : \"\"}</small></div>`).join(\"\")",
  "    : `<div class=\"column-empty\">Sin mensajes guardados</div>`;",
  "",
  "  list.dataset.dealId = String(deal.id || \"\");",
  "  list.dataset.messageSignature = signature;",
  "  list.dataset.messageCount = String(messages.length);",
  "  list.dataset.lastMessageKey = tailKey;",
  "",
  "  requestAnimationFrame(() => {",
  "    if (!list.isConnected) return;",
  "    if (shouldScrollBottom) scrollDrawerMessagesToLatest(list);",
  "    else list.scrollTop = Math.max(0, previousScrollTop + (list.scrollHeight - previousScrollHeight));",
  "  });",
  "}",
  "",
].join("\n");

export function applyV2617ChatRefreshPatches(source) {
  if (source.includes(MARKER)) return source;

  source = replaceOnce(
    source,
    "function renderDrawer() {",
    `${DRAWER_MESSAGE_HELPER}function renderDrawer() {`,
    "insertar renderDrawerMessages"
  );

  source = replaceRegexOnce(
    source,
    /  const messages = \(deal\.messages \|\| \[\]\)\.slice\(-80\);\n  \$\("#drawer-messages"\)\.innerHTML = messages\.length\n[\s\S]*?\n    : `<div class="column-empty">Sin mensajes guardados<\/div>`;/,
    "  renderDrawerMessages(deal);",
    "render repetitivo de mensajes"
  );

  source = replaceOnce(
    source,
    "  requestAnimationFrame(() => {\n    const list = $(\"#drawer-messages\");\n    if (list) list.scrollTop = list.scrollHeight;\n  });",
    "  // El scroll de la conversación ahora se gestiona únicamente cuando cambian los mensajes.",
    "scroll forzado del drawer"
  );

  source = replaceOnce(
    source,
    "function openDrawer(id) {\n  selectedDealId = id;\n  setDrawerPane(\"conversation\");\n  renderDrawer();\n}",
    "function openDrawer(id) {\n  selectedDealId = id;\n  const messageList = $(\"#drawer-messages\");\n  if (messageList) {\n    messageList.dataset.dealId = \"\";\n    messageList.dataset.messageSignature = \"\";\n    messageList.dataset.messageCount = \"0\";\n    messageList.dataset.lastMessageKey = \"\";\n  }\n  setDrawerPane(\"conversation\");\n  renderDrawer();\n  scrollDrawerMessagesToLatest(messageList);\n}",
    "reinicio de firma al abrir conversación"
  );

  return source;
}
