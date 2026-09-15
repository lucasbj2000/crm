const MARKER = "// V26.17 CHAT_REFRESH_STABILITY";

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`V26.17: no se encontró el bloque ${label}`);
  return source.replace(search, replacement);
}

export function applyV2617ChatRefreshPatches(source) {
  if (source.includes(MARKER)) return source;

  source = replaceOnce(
    source,
    "function renderDrawer() {",
    `${MARKER}\nfunction renderDrawerMessages(deal, { force = false } = {}) {\n  const list = $(\"#drawer-messages\");\n  if (!list || !deal) return;\n\n  const messages = (deal.messages || []).slice(-80);\n  const signature = JSON.stringify(messages.map((message) => [\n    message.id || \"\",\n    message.at || \"\",\n    message.direction || \"\",\n    message.origin || \"\",\n    message.text || \"\",\n    message.historical === true,\n    message.agentName || \"\",\n    message.attachment?.url || message.attachment?.path || message.attachment?.name || \"\",\n  ]));\n  const sameDeal = list.dataset.dealId === String(deal.id || \"\");\n  const unchanged = sameDeal && list.dataset.messageSignature === signature;\n  if (!force && unchanged) return;\n\n  const previousScrollHeight = list.scrollHeight;\n  const previousScrollTop = list.scrollTop;\n  const nearBottom = !sameDeal || (previousScrollHeight - previousScrollTop - list.clientHeight) < 140;\n\n  list.innerHTML = messages.length\n    ? messages.map((message) => \`<div class=\"message \\${message.direction === \"outgoing\" ? \"outgoing\" : message.direction === \"system\" ? \"system\" : \"\"}\">\\${attachmentMarkup(message.attachment)}\\${message.text ? \`<p>\\${escapeHtml(message.text)}</p>\` : \"\"}<small>\\${message.origin === \"human\" ? escapeHtml(message.agentName || \"Asesor\") : message.origin === \"bot\" ? \"Bot\" : message.origin === \"followup\" ? \"Seguimiento\" : message.origin === \"transfer\" ? \"Transferencia interna\" : \"Cliente\"} · \\${escapeHtml(formatDate(message.at))}\\${message.historical ? \" · recuperado\" : \"\"}</small></div>\`).join(\"\")\n    : \`<div class=\"column-empty\">Sin mensajes guardados</div>\`;\n\n  list.dataset.dealId = String(deal.id || \"\");\n  list.dataset.messageSignature = signature;\n\n  requestAnimationFrame(() => {\n    if (!list.isConnected) return;\n    if (nearBottom) list.scrollTop = list.scrollHeight;\n    else list.scrollTop = Math.max(0, previousScrollTop + (list.scrollHeight - previousScrollHeight));\n  });\n}\n\nfunction renderDrawer() {`,
    "insertar renderDrawerMessages"
  );

  source = replaceOnce(
    source,
    `  const messages = (deal.messages || []).slice(-80);\n  $(\"#drawer-messages\").innerHTML = messages.length\n    ? messages.map((message) => \`<div class=\"message \\${message.direction === \"outgoing\" ? \"outgoing\" : message.direction === \"system\" ? \"system\" : \"\"}\">\\${attachmentMarkup(message.attachment)}\\${message.text ? \`<p>\\${escapeHtml(message.text)}</p>\` : \"\"}<small>\\${message.origin === \"human\" ? escapeHtml(message.agentName || \"Asesor\") : message.origin === \"bot\" ? \"Bot\" : message.origin === \"followup\" ? \"Seguimiento\" : message.origin === \"transfer\" ? \"Transferencia interna\" : \"Cliente\"} · \\${escapeHtml(formatDate(message.at))}\\${message.historical ? \" · recuperado\" : \"\"}</small></div>\`).join(\"\")\n    : \`<div class=\"column-empty\">Sin mensajes guardados</div>\`;`,
    `  renderDrawerMessages(deal);`,
    "render repetitivo de mensajes"
  );

  source = replaceOnce(
    source,
    `  requestAnimationFrame(() => {\n    const list = $(\"#drawer-messages\");\n    if (list) list.scrollTop = list.scrollHeight;\n  });`,
    `  // El scroll de la conversación ahora se gestiona únicamente cuando cambian los mensajes.`,
    "scroll forzado del drawer"
  );

  source = replaceOnce(
    source,
    `function openDrawer(id) {\n  selectedDealId = id;\n  setDrawerPane(\"conversation\");\n  renderDrawer();\n}`,
    `function openDrawer(id) {\n  selectedDealId = id;\n  const messageList = $(\"#drawer-messages\");\n  if (messageList) {\n    messageList.dataset.dealId = \"\";\n    messageList.dataset.messageSignature = \"\";\n  }\n  setDrawerPane(\"conversation\");\n  renderDrawer();\n}`,
    "reinicio de firma al abrir conversación"
  );

  return source;
}
