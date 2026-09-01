function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.8 WhatsApp edits: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.8 WhatsApp edits: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

const editHelpers = String.raw`
function v268UnwrapEditMessage(message) {
  let current = message || {};
  for (let index = 0; index < 10; index += 1) {
    const next = current?.ephemeralMessage?.message
      || current?.viewOnceMessage?.message
      || current?.viewOnceMessageV2?.message
      || current?.viewOnceMessageV2Extension?.message
      || current?.documentWithCaptionMessage?.message
      || null;
    if (!next) break;
    current = next;
  }
  return current || {};
}

function v268EditedText(message) {
  const content = v268UnwrapEditMessage(message);
  return cleanText(
    content?.conversation
      || content?.extendedTextMessage?.text
      || content?.imageMessage?.caption
      || content?.videoMessage?.caption
      || content?.documentMessage?.caption
      || content?.documentWithCaptionMessage?.message?.documentMessage?.caption
      || "",
    6000,
  );
}

function v268EditPayload(item) {
  const content = v268UnwrapEditMessage(item?.message || {});
  const protocol = content?.protocolMessage || null;
  if (protocol?.editedMessage && protocol?.key?.id) {
    return {
      targetId: String(protocol.key.id),
      targetJid: protocol.key.remoteJid || item?.key?.remoteJid || "",
      editedMessage: protocol.editedMessage,
    };
  }
  if (item?.editedMessage && item?.key?.id) {
    return {
      targetId: String(item.key.id),
      targetJid: item.key.remoteJid || "",
      editedMessage: item.editedMessage,
    };
  }
  return null;
}

function v268FindStoredMessage(targetId) {
  if (!targetId) return null;
  for (const deal of data.deals || []) {
    const messages = Array.isArray(deal.messages) ? deal.messages : [];
    const index = messages.findIndex((message) => String(message?.id || "") === String(targetId));
    if (index >= 0) return { deal, message: messages[index], index };
  }
  return null;
}

async function v268ApplyWhatsappEdit(item, { branchId = null, lineId = null } = {}) {
  const payload = v268EditPayload(item);
  if (!payload) return false;

  const newText = v268EditedText(payload.editedMessage);
  if (!newText) return true;

  const record = v268FindStoredMessage(payload.targetId);
  if (!record?.message) {
    console.warn("[whatsapp edit] mensaje original no encontrado", payload.targetId);
    return true;
  }

  const previousText = cleanText(record.message.text, 6000);
  const editedAt = timestamp();
  if (previousText !== newText) {
    const history = Array.isArray(record.message.editHistory) ? record.message.editHistory : [];
    if (previousText) history.push({ text: previousText, editedAt });
    if (history.length > 20) history.splice(0, history.length - 20);
    record.message.editHistory = history;
    record.message.text = newText;
  }
  record.message.edited = true;
  record.message.editedAt = editedAt;
  record.message.editCount = Math.max(1, Number(record.message.editCount) || 0, Array.isArray(record.message.editHistory) ? record.message.editHistory.length : 0);

  const messages = Array.isArray(record.deal.messages) ? record.deal.messages : [];
  if (messages.at(-1) === record.message) record.deal.lastMessage = cleanText(newText, 500);
  record.deal.lastEditedAt = editedAt;

  await store.save();
  return true;
}

async function v268HandleWhatsappUpdates(updates, context = {}) {
  for (const entry of updates || []) {
    const update = entry?.update || {};
    if (update?.message) {
      await v268ApplyWhatsappEdit({ key: entry?.key || {}, message: update.message }, context);
      continue;
    }
    if (update?.editedMessage) {
      await v268ApplyWhatsappEdit({ key: entry?.key || {}, editedMessage: update.editedMessage }, context);
    }
  }
}
`;

export function applyV268WhatsappEditPatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    'async function handleIncomingMessages(event, { history = false, branchId = null, lineId = null } = {}) {',
    editHelpers + '\nasync function handleIncomingMessages(event, { history = false, branchId = null, lineId = null } = {}) {',
    "helpers antes del manejador de mensajes",
  );

  patched = replaceOnce(
    patched,
    '  for (const item of messages) {\n    const rawJid = item.key?.remoteJid || "";',
    '  for (const item of messages) {\n    if (await v268ApplyWhatsappEdit(item, { branchId, lineId })) continue;\n    const rawJid = item.key?.remoteJid || "";',
    "detección de edición en messages.upsert",
  );

  patched = replaceOnce(
    patched,
    '      whatsappSocket.ev.on("messages.upsert", (event) => {\n        void handleIncomingMessages(event, { branchId: primaryBranchId() });\n      });',
    '      whatsappSocket.ev.on("messages.upsert", (event) => {\n        void handleIncomingMessages(event, { branchId: primaryBranchId() });\n      });\n      whatsappSocket.ev.on("messages.update", (updates) => {\n        void v268HandleWhatsappUpdates(updates, { branchId: primaryBranchId() });\n      });',
    "messages.update de la línea principal",
  );

  patched = replaceOnce(
    patched,
    '      runtime.socket.ev.on("messages.upsert", (event) => { void handleIncomingMessages(event, { branchId }); });',
    '      runtime.socket.ev.on("messages.upsert", (event) => { void handleIncomingMessages(event, { branchId }); });\n      runtime.socket.ev.on("messages.update", (updates) => { void v268HandleWhatsappUpdates(updates, { branchId }); });',
    "messages.update por sucursal",
  );

  patched = replaceOnce(
    patched,
    '      runtime.socket.ev.on("messages.upsert",(event)=>{void handleIncomingMessages(event,{branchId:line.branchId,lineId:line.id});});',
    '      runtime.socket.ev.on("messages.upsert",(event)=>{void handleIncomingMessages(event,{branchId:line.branchId,lineId:line.id});});\n      runtime.socket.ev.on("messages.update",(updates)=>{void v268HandleWhatsappUpdates(updates,{branchId:line.branchId,lineId:line.id});});',
    "messages.update por línea adicional",
  );

  patched = replaceOnce(
    patched,
    '        text: message.text || "",\n        createdAt,\n        agentName: message.agentName || message.userName || "",',
    '        text: message.text || "",\n        createdAt,\n        edited: message.edited === true || Boolean(message.editedAt),\n        editedAt: message.editedAt || null,\n        editCount: Math.max(0, Number(message.editCount) || (Array.isArray(message.editHistory) ? message.editHistory.length : 0)),\n        agentName: message.agentName || message.userName || "",',
    "metadatos públicos de edición",
  );

  return patched;
}
