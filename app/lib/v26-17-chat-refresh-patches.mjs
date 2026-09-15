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
  "function renderDrawerMessages(deal, { force = false } = {}) {",
  "  const list = $(\"#drawer-messages\");",
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
  "  const nearBottom = !sameDeal || (previousScrollHeight - previousScrollTop - list.clientHeight) < 140;",
  "",
  "  list.innerHTML = messages.length",
  "    ? messages.map((message) => `<div class=\"message ${message.direction === \"outgoing\" ? \"outgoing\" : message.direction === \"system\" ? \"system\" : \"\"}\">${attachmentMarkup(message.attachment)}${message.text ? `<p>${escapeHtml(message.text)}</p>` : \"\"}<small>${message.origin === \"human\" ? escapeHtml(message.agentName || \"Asesor\") : message.origin === \"bot\" ? \"Bot\" : message.origin === \"followup\" ? \"Seguimiento\" : message.origin === \"transfer\" ? \"Transferencia interna\" : \"Cliente\"} · ${escapeHtml(formatDate(message.at))}${message.historical ? \" · recuperado\" : \"\"}</small></div>`).join(\"\")",
  "    : `<div class=\"column-empty\">Sin mensajes guardados</div>`;",
  "",
  "  list.dataset.dealId = String(deal.id || \"\");",
  "  list.dataset.messageSignature = signature;",
  "",
  "  requestAnimationFrame(() => {",
  "    if (!list.isConnected) return;",
  "    if (nearBottom) list.scrollTop = list.scrollHeight;",
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
    "function openDrawer(id) {\n  selectedDealId = id;\n  const messageList = $(\"#drawer-messages\");\n  if (messageList) {\n    messageList.dataset.dealId = \"\";\n    messageList.dataset.messageSignature = \"\";\n  }\n  setDrawerPane(\"conversation\");\n  renderDrawer();\n}",
    "reinicio de firma al abrir conversación"
  );

  return source;
}
