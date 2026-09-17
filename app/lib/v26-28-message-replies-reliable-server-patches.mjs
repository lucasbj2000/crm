const MARKER = "// V26.28 MESSAGE_REPLY_PROVIDER";

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`V26.28 reliable: no se encontró ${label}`);
  return source.replace(search, replacement);
}

const HELPERS = String.raw`

// V26.28 MESSAGE_REPLY_PROVIDER
function v2628ReplySource(deal, replyToMessageId) {
  const id = cleanText(replyToMessageId, 220);
  if (!id) return null;
  return (deal?.messages || []).find((message) => String(message?.id || "") === id) || null;
}

function v2628ReplySnapshot(message) {
  if (!message) return null;
  const attachment = message.attachment || {};
  const text = cleanText(message.text || attachment.fileName || attachment.name || attachment.kind || "Mensaje", 600);
  return {
    messageId: String(message.id || ""),
    text: text || "Mensaje",
    direction: message.direction || "",
    origin: message.origin || "",
    agentName: cleanText(message.agentName, 120),
    author: message.direction === "incoming" ? "Cliente" : (message.origin === "human" ? cleanText(message.agentName || "Asesor", 120) : message.origin === "bot" ? "Bot" : "Mensaje enviado"),
  };
}

function v2628BuildQrQuotedMessage(deal, message) {
  if (!deal?.jid || !message?.id) return null;
  const snapshot = v2628ReplySnapshot(message);
  const seconds = Math.floor(new Date(message.at || Date.now()).getTime() / 1000);
  return {
    key: {
      remoteJid: deal.jid,
      fromMe: message.direction === "outgoing",
      id: String(message.id),
    },
    message: { conversation: snapshot?.text || "Mensaje" },
    messageTimestamp: Number.isFinite(seconds) ? seconds : undefined,
    pushName: message.direction === "incoming" ? cleanText(deal.name || "Cliente", 120) : cleanText(message.agentName || "Asesor", 120),
  };
}
`;

export function applyV2628ServerPatches(source) {
  if (source.includes(MARKER)) return source;

  source = replaceOnce(
    source,
    "async function sendProviderText(deal, text) {",
    `${HELPERS}\nasync function sendProviderText(deal, text, options = {}) {`,
    "sendProviderText confiable"
  );

  source = replaceOnce(
    source,
    "  const outbox = v2611OutboxEntry(deal, line, text);\n  await store.save();\n  return v2611QueueOutgoing(line.id, () => v2611SendTextReliable(deal, text, line, outbox));",
    "  const outbox = v2611OutboxEntry(deal, line, text);\n  outbox.replyToMessageId = cleanText(options?.replyToMessageId, 220) || null;\n  await store.save();\n  return v2611QueueOutgoing(line.id, () => v2611SendTextReliable(deal, text, line, outbox));",
    "outbox con referencia citada"
  );

  source = replaceOnce(
    source,
    "async function v2611SendTextReliable(deal, text, line, outbox) {\n  const maxAttempts = 5;\n  let lastError = null;",
    "async function v2611SendTextReliable(deal, text, line, outbox) {\n  const maxAttempts = 5;\n  let lastError = null;\n  const replySource = v2628ReplySource(deal, outbox?.replyToMessageId);",
    "resolución de cita en la cola confiable"
  );

  source = replaceOnce(
    source,
    "        const result = await sendLineCloudPayload(line, { to: normalizePhone(deal.phone), type: \"text\", text: { body: text, preview_url: false } });",
    "        const payload = { to: normalizePhone(deal.phone), type: \"text\", text: { body: text, preview_url: false } };\n        if (replySource?.id) payload.context = { message_id: String(replySource.id) };\n        const result = await sendLineCloudPayload(line, payload);",
    "cita Cloud API confiable"
  );

  source = replaceOnce(
    source,
    "        const sent = await socket.sendMessage(deal.jid, { text }, { messageId: outbox.providerMessageId });",
    "        const quoted = v2628BuildQrQuotedMessage(deal, replySource);\n        const sendOptions = { messageId: outbox.providerMessageId };\n        if (quoted) sendOptions.quoted = quoted;\n        const sent = await socket.sendMessage(deal.jid, { text }, sendOptions);",
    "cita QR confiable"
  );

  source = replaceOnce(
    source,
    "    const user = currentUser(request);\n    const text = cleanText(request.body?.text, 4000);",
    "    const user = currentUser(request);\n    const text = cleanText(request.body?.text, 4000);\n    const replyToMessageId = cleanText(request.body?.replyToMessageId, 220);",
    "replyToMessageId del endpoint"
  );

  source = replaceOnce(
    source,
    "    const temporaryGrant = v214ActiveCommunicationGrant(deal, user);\n    ensureDealOwnership(deal, user, { claim: true, allowTemporaryCommunication: true });\n    if (!text) throw new Error(\"Escribí un mensaje.\");\n    const messageId = await sendProviderText(deal, text);",
    "    const temporaryGrant = v214ActiveCommunicationGrant(deal, user);\n    ensureDealOwnership(deal, user, { claim: true, allowTemporaryCommunication: true });\n    if (!text) throw new Error(\"Escribí un mensaje.\");\n    const replySource = v2628ReplySource(deal, replyToMessageId);\n    const messageId = await sendProviderText(deal, text, { replyToMessageId: replySource?.id || \"\" });",
    "envío manual con cita"
  );

  const recordCall = "    recordHumanOutgoing(data, { jid: deal.jid, name: deal.name, text, messageId, userId: user.id, userName: user.name, branchId: deal.branchId, lineId: dealLineId(deal) });";
  source = replaceOnce(
    source,
    recordCall,
    `${recordCall}\n    if (replySource) {\n      const storedReply = [...(deal.messages || [])].reverse().find((message) => String(message?.id || \"\") === String(messageId || \"\"));\n      if (storedReply) storedReply.replyTo = v2628ReplySnapshot(replySource);\n    }`,
    "persistencia de cita"
  );

  return source;
}
