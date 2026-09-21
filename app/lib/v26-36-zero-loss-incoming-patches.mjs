function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.36 ingreso cero pérdida: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.36 ingreso cero pérdida: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceFirstAfter(source, startMarker, find, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.36 ingreso cero pérdida: no se encontró inicio de ${label}.`);
  const index = source.indexOf(find, start);
  if (index < 0) throw new Error(`V26.36 ingreso cero pérdida: no se encontró ${label}.`);
  return source.slice(0, index) + replacement + source.slice(index + find.length);
}

const durableIngressHelpers = String.raw`
if (!Array.isArray(data.pendingIncomingEvents)) data.pendingIncomingEvents = [];
if (!Array.isArray(data.pendingCloudWebhooks)) data.pendingCloudWebhooks = [];

const v2636PendingIncomingTimers = new Map();
const v2636CloudWebhookTimers = new Map();
const v2636RetryDelays = [1_000, 3_000, 10_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000];

function v2636JsonClone(value) {
  try {
    return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));
  } catch {
    return null;
  }
}

function v2636MessageMaterialized(messageId) {
  if (!messageId) return false;
  const id = String(messageId);
  for (const deal of data.deals || []) {
    if ((deal.messages || []).some((message) => String(message?.id || "") === id)) return true;
  }
  for (const event of data.communicationEvents || []) {
    if (String(event?.messageId || "") === id) return true;
    if (String(event?.metadata?.messageId || "") === id) return true;
    if (String(event?.metadata?.replyMessageId || "") === id) return true;
  }
  for (const campaign of data.campaigns || []) {
    if ((campaign.recipients || []).some((recipient) => String(recipient?.replyMessageId || "") === id)) return true;
  }
  return false;
}

function v2636EventIds(event) {
  return [...new Set((event?.messages || []).map((item) => cleanText(item?.key?.id, 220)).filter(Boolean))];
}

function v2636EventScope(options = {}) {
  return cleanText(options.lineId || options.branchId || "primary", 180) || "primary";
}

function v2636SerializableEvent(event) {
  return v2636JsonClone({
    type: cleanText(event?.type || "notify", 40) || "notify",
    requestId: cleanText(event?.requestId, 200) || undefined,
    messages: Array.isArray(event?.messages) ? event.messages : [],
  });
}

function v2636IncomingEventKey(event, options = {}, serializable = null) {
  const ids = v2636EventIds(event).sort();
  if (ids.length) return v2636EventScope(options) + ":" + ids.join("|");
  const raw = JSON.stringify(serializable || v2636SerializableEvent(event) || {});
  return v2636EventScope(options) + ":hash:" + createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function v2636PersistIncomingEvent(event, options = {}) {
  const serializable = v2636SerializableEvent(event);
  if (!serializable || !Array.isArray(serializable.messages) || !serializable.messages.length) return null;
  const ids = v2636EventIds(serializable);
  if (ids.length && ids.every((id) => v2636MessageMaterialized(id))) return null;
  const key = v2636IncomingEventKey(serializable, options, serializable);
  let row = data.pendingIncomingEvents.find((entry) => entry.key === key);
  if (!row) {
    row = {
      key,
      event: serializable,
      options: {
        branchId: cleanText(options.branchId, 160) || null,
        lineId: cleanText(options.lineId, 160) || null,
        history: options.history === true,
      },
      attempts: 0,
      createdAt: timestamp(),
      updatedAt: timestamp(),
      nextRetryAt: null,
      lastError: "",
    };
    data.pendingIncomingEvents.push(row);
  } else {
    row.event = serializable;
    row.options = {
      branchId: cleanText(options.branchId, 160) || row.options?.branchId || null,
      lineId: cleanText(options.lineId, 160) || row.options?.lineId || null,
      history: options.history === true || row.options?.history === true,
    };
    row.updatedAt = timestamp();
  }
  return row;
}

function v2636IncomingItemCanBeIgnored(item, source) {
  if (!item) return true;
  if (item.key?.fromMe) return true;
  const rawJid = String(item.key?.remoteJid || item.key?.remoteJidAlt || "");
  if (rawJid === "status@broadcast" || rawJid.endsWith("@g.us") || rawJid.endsWith("@broadcast") || rawJid.endsWith("@newsletter")) return true;
  if (source === "history" && !shouldImportMessage(item, source)) return true;
  const text = extractText(item.message);
  if (text && (decodeTransferPacket(text) || decodeTransferAck(text))) return true;
  return false;
}

function v2636EventFullyHandled(event, options = {}) {
  const source = options.history === true ? "history" : cleanText(event?.type || "notify", 40);
  for (const item of event?.messages || []) {
    const id = cleanText(item?.key?.id, 220);
    if (id && v2636MessageMaterialized(id)) continue;
    if (v2636IncomingItemCanBeIgnored(item, source)) continue;
    return false;
  }
  return true;
}

function v2636RemovePendingIncoming(key) {
  const timer = v2636PendingIncomingTimers.get(key);
  if (timer) clearTimeout(timer);
  v2636PendingIncomingTimers.delete(key);
  const before = data.pendingIncomingEvents.length;
  data.pendingIncomingEvents = data.pendingIncomingEvents.filter((row) => row.key !== key);
  if (data.pendingIncomingEvents.length !== before) void store.save().catch(() => {});
}

function v2636SchedulePendingIncoming(row, error = "") {
  if (!row?.key || !row?.event || v2636PendingIncomingTimers.has(row.key)) return;
  if (v2636EventFullyHandled(row.event, row.options || {})) {
    v2636RemovePendingIncoming(row.key);
    return;
  }
  const index = Math.min(Math.max(0, Number(row.attempts) || 0), v2636RetryDelays.length - 1);
  const delay = v2636RetryDelays[index];
  row.attempts = Number(row.attempts || 0) + 1;
  row.lastError = cleanText(error || row.lastError, 700);
  row.nextRetryAt = new Date(Date.now() + delay).toISOString();
  row.updatedAt = timestamp();
  void store.save().catch(() => {});
  const timer = setTimeout(async () => {
    v2636PendingIncomingTimers.delete(row.key);
    const current = data.pendingIncomingEvents.find((entry) => entry.key === row.key);
    if (!current) return;
    try {
      const ok = await v2611QueueIncoming(current.event, { ...(current.options || {}), v2636Retry: true });
      if (ok && v2636EventFullyHandled(current.event, current.options || {})) v2636RemovePendingIncoming(current.key);
      else v2636SchedulePendingIncoming(current, current.lastError || "El mensaje todavía no pudo materializarse en el CRM.");
    } catch (retryError) {
      current.lastError = cleanText(retryError?.message || retryError, 700);
      v2636SchedulePendingIncoming(current, current.lastError);
    }
  }, delay);
  timer.unref?.();
  v2636PendingIncomingTimers.set(row.key, timer);
}

function v2636ResumePendingIncoming() {
  for (const row of data.pendingIncomingEvents || []) {
    if (!row?.key || !row?.event) continue;
    if (v2636EventFullyHandled(row.event, row.options || {})) v2636RemovePendingIncoming(row.key);
    else v2636SchedulePendingIncoming(row, row.lastError || "Recuperación tras reinicio.");
  }
}

function v2636CloudWebhookIds(body) {
  const ids = [];
  for (const entry of body?.entry || []) for (const change of entry?.changes || []) {
    const value = change?.value || {};
    for (const item of value.messages || []) if (item?.id) ids.push(String(item.id));
    for (const status of value.statuses || []) if (status?.id) ids.push("status:" + String(status.id) + ":" + String(status.status || ""));
  }
  return [...new Set(ids)].sort();
}

function v2636CloudWebhookKey(body) {
  const ids = v2636CloudWebhookIds(body);
  if (ids.length) return ids.join("|");
  const raw = JSON.stringify(v2636JsonClone(body) || {});
  return "cloud:" + createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function v2636PersistCloudWebhook(body) {
  const serializable = v2636JsonClone(body);
  if (!serializable) return null;
  const key = v2636CloudWebhookKey(serializable);
  let row = data.pendingCloudWebhooks.find((entry) => entry.key === key);
  if (!row) {
    row = { key, body: serializable, attempts: 0, createdAt: timestamp(), updatedAt: timestamp(), nextRetryAt: null, lastError: "" };
    data.pendingCloudWebhooks.push(row);
  } else {
    row.body = serializable;
    row.updatedAt = timestamp();
  }
  return row;
}

function v2636RemoveCloudWebhook(key) {
  const timer = v2636CloudWebhookTimers.get(key);
  if (timer) clearTimeout(timer);
  v2636CloudWebhookTimers.delete(key);
  const before = data.pendingCloudWebhooks.length;
  data.pendingCloudWebhooks = data.pendingCloudWebhooks.filter((row) => row.key !== key);
  if (before !== data.pendingCloudWebhooks.length) void store.save().catch(() => {});
}

function v2636ScheduleCloudWebhook(row, error = "") {
  if (!row?.key || !row?.body || v2636CloudWebhookTimers.has(row.key)) return;
  const index = Math.min(Math.max(0, Number(row.attempts) || 0), v2636RetryDelays.length - 1);
  const delay = v2636RetryDelays[index];
  row.attempts = Number(row.attempts || 0) + 1;
  row.lastError = cleanText(error || row.lastError, 700);
  row.nextRetryAt = new Date(Date.now() + delay).toISOString();
  row.updatedAt = timestamp();
  void store.save().catch(() => {});
  const timer = setTimeout(() => {
    v2636CloudWebhookTimers.delete(row.key);
    void v2636ProcessCloudWebhookRow(row.key);
  }, delay);
  timer.unref?.();
  v2636CloudWebhookTimers.set(row.key, timer);
}

async function v2636ProcessCloudWebhookRow(key) {
  const row = data.pendingCloudWebhooks.find((entry) => entry.key === key);
  if (!row) return true;
  try {
    await processCloudWebhook(row.body);
    v2636RemoveCloudWebhook(key);
    await store.save().catch(() => {});
    return true;
  } catch (error) {
    row.lastError = cleanText(error?.message || error, 700);
    row.updatedAt = timestamp();
    console.error("[cloud durable webhook]", row.lastError);
    v2636ScheduleCloudWebhook(row, row.lastError);
    await store.save().catch(() => {});
    return false;
  }
}

async function v2636AcceptCloudWebhook(body) {
  const row = v2636PersistCloudWebhook(body);
  if (!row) throw new Error("No se pudo persistir el webhook de WhatsApp antes de confirmarlo.");
  await store.save();
  void v2636ProcessCloudWebhookRow(row.key);
  return row.key;
}

function v2636ResumeCloudWebhooks() {
  for (const row of data.pendingCloudWebhooks || []) {
    if (!row?.key || !row?.body) continue;
    v2636ScheduleCloudWebhook(row, row.lastError || "Recuperación tras reinicio.");
  }
}

function v2636FallbackIncomingText(content = {}) {
  const template = content.templateButtonReplyMessage;
  if (template) return cleanText(template.selectedDisplayText || template.selectedId || "[Respuesta de botón]", 6000);

  const interactive = content.interactiveResponseMessage;
  if (interactive) {
    const native = interactive.nativeFlowResponseMessage || {};
    let detail = cleanText(native.name, 240);
    if (native.paramsJson) {
      try {
        const parsed = JSON.parse(native.paramsJson);
        detail = cleanText(parsed.title || parsed.id || parsed.flow_token || detail, 240);
      } catch {}
    }
    return detail ? "[Respuesta interactiva: " + detail + "]" : "[Respuesta interactiva]";
  }

  const contact = content.contactMessage;
  if (contact) return "[Contacto compartido" + (contact.displayName ? ": " + cleanText(contact.displayName, 240) : "") + "]";

  const contacts = content.contactsArrayMessage;
  if (contacts) return "[Contactos compartidos" + (contacts.displayName ? ": " + cleanText(contacts.displayName, 240) : "") + "]";

  if (content.locationMessage) return "[Ubicación compartida]";
  if (content.liveLocationMessage) return "[Ubicación en tiempo real]";
  if (content.pollCreationMessage || content.pollCreationMessageV2 || content.pollCreationMessageV3) {
    const poll = content.pollCreationMessage || content.pollCreationMessageV2 || content.pollCreationMessageV3;
    return "[Encuesta" + (poll?.name ? ": " + cleanText(poll.name, 500) : "") + "]";
  }
  if (content.pollUpdateMessage) return "[Respuesta de encuesta]";
  if (content.reactionMessage) return "[Reacción" + (content.reactionMessage.text ? ": " + cleanText(content.reactionMessage.text, 80) : "") + "]";
  if (content.requestPhoneNumberMessage) return "[Solicitud de número de teléfono]";
  if (content.productMessage) return "[Producto compartido]";
  if (content.orderMessage) return "[Pedido de WhatsApp]";

  const ignored = new Set([
    "messageContextInfo",
    "senderKeyDistributionMessage",
    "protocolMessage",
    "keepInChatMessage",
    "deviceSentMessage",
  ]);
  const meaningful = Object.keys(content || {}).filter((key) => !ignored.has(key) && /Message$/.test(key));
  return meaningful.length ? "[Mensaje de WhatsApp]" : "";
}

function v2636IngressOverview() {
  return {
    pendingIncomingEvents: (data.pendingIncomingEvents || []).length,
    pendingCloudWebhooks: (data.pendingCloudWebhooks || []).length,
    pendingIdentity: (data.pendingIncomingIdentity || []).length,
    oldestPendingIncomingAt: (data.pendingIncomingEvents || [])[0]?.createdAt || null,
    recentPendingIncoming: (data.pendingIncomingEvents || []).slice(0, 50).map((row) => ({
      key: row.key,
      branchId: row.options?.branchId || null,
      lineId: row.options?.lineId || null,
      attempts: Number(row.attempts || 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      nextRetryAt: row.nextRetryAt || null,
      lastError: row.lastError || "",
      messageIds: v2636EventIds(row.event),
    })),
  };
}

const v2636ResumeTimer = setTimeout(() => {
  v2636ResumePendingIncoming();
  v2636ResumeCloudWebhooks();
}, 5_000);
v2636ResumeTimer.unref?.();
`;

const durableQueue = String.raw`function v2611QueueIncoming(event, options = {}) {
  const row = v2636PersistIncomingEvent(event, options);
  const persistence = row ? store.save() : Promise.resolve();
  const key = cleanText(options.lineId || options.branchId || "primary", 180) || "primary";
  const previous = v2611IncomingQueues.get(key) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => persistence)
    .then(() => v2611ProcessIncoming(event, options))
    .then(
      (ok) => {
        if (row) {
          if (ok && v2636EventFullyHandled(row.event, row.options || {})) v2636RemovePendingIncoming(row.key);
          else v2636SchedulePendingIncoming(row, row.lastError || "El mensaje no quedó materializado en el CRM.");
        }
        return ok;
      },
      (error) => {
        if (row) v2636SchedulePendingIncoming(row, error?.message || error);
        throw error;
      },
    );
  v2611IncomingQueues.set(key, next);
  void next.then(() => { if (v2611IncomingQueues.get(key) === next) v2611IncomingQueues.delete(key); }, () => { if (v2611IncomingQueues.get(key) === next) v2611IncomingQueues.delete(key); });
  return next;
}`;

export function applyV2636ZeroLossIncomingPatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    "const v2611IncomingQueues = new Map();",
    "const v2611IncomingQueues = new Map();\n" + durableIngressHelpers.trim(),
    "helpers de ingreso persistente",
  );

  patched = replaceOnce(
    patched,
    'const seenMessages = new Set((data.processedMessageIds || []).slice(-1200));',
    'const seenMessages = new Set();',
    "deduplicación en memoria sin IDs históricos potencialmente falsos",
  );

  patched = replaceOnce(
    patched,
    'function isKnownMessage(messageId) {\n  return Boolean(\n    messageId &&\n      (seenMessages.has(messageId) || (data.processedMessageIds || []).includes(messageId)),\n  );\n}',
    'function isKnownMessage(messageId) {\n  return Boolean(messageId && (seenMessages.has(messageId) || v2636MessageMaterialized(messageId)));\n}',
    "deduplicación basada en materialización real",
  );

  patched = replaceOnce(
    patched,
    'function shouldImportMessage(item, source) {\n  if (source === "notify") return true;',
    'function shouldImportMessage(item, source) {\n  if (source === "notify" || source === "append") return true;',
    "append nunca se descarta por antigüedad",
  );

  patched = replaceOnce(
    patched,
    'function extractText(message) {',
    'function extractText(message) {',
    "ancla de extracción",
  );

  patched = replaceFirstAfter(
    patched,
    'function extractText(message) {',
    '      content.listResponseMessage?.title ||\n      "",',
    '      content.listResponseMessage?.title ||\n      content.listResponseMessage?.singleSelectReply?.selectedRowId ||\n      v2636FallbackIncomingText(content) ||\n      "",',
    "formatos entrantes adicionales",
  );

  patched = replaceOnce(
    patched,
    'function v2611CommunicationRecorded(messageId) {\n  if (!messageId) return false;\n  if ((data.processedMessageIds || []).includes(messageId)) return true;\n  for (const deal of data.deals || []) {\n    if ((deal.messages || []).some((message) => String(message?.id || "") === String(messageId))) return true;\n  }\n  for (const event of data.communicationEvents || []) {\n    if (String(event?.messageId || "") === String(messageId)) return true;\n    if (String(event?.metadata?.messageId || "") === String(messageId)) return true;\n    if (String(event?.metadata?.replyMessageId || "") === String(messageId)) return true;\n  }\n  for (const campaign of data.campaigns || []) {\n    if ((campaign.recipients || []).some((recipient) => String(recipient?.replyMessageId || "") === String(messageId))) return true;\n  }\n  return false;\n}',
    'function v2611CommunicationRecorded(messageId) {\n  return v2636MessageMaterialized(messageId);\n}',
    "confirmación real de mensaje persistido",
  );

  patched = replaceOnce(
    patched,
    'function v2611QueueIncoming(event, options = {}) {\n  const key = cleanText(options.lineId || options.branchId || "primary", 180) || "primary";\n  const previous = v2611IncomingQueues.get(key) || Promise.resolve();\n  const next = previous.catch(() => {}).then(() => v2611ProcessIncoming(event, options));\n  v2611IncomingQueues.set(key, next);\n  void next.then(() => { if (v2611IncomingQueues.get(key) === next) v2611IncomingQueues.delete(key); }, () => { if (v2611IncomingQueues.get(key) === next) v2611IncomingQueues.delete(key); });\n  return next;\n}',
    durableQueue,
    "cola entrante durable",
  );

  patched = replaceOnce(
    patched,
    'app.post("/api/whatsapp/webhook", (request, response) => {\n  response.sendStatus(200);\n  void processCloudWebhook(request.body).catch((error) => console.error("[cloud webhook]", error?.message || error));\n});',
    'app.post("/api/whatsapp/webhook", async (request, response) => {\n  try {\n    await v2636AcceptCloudWebhook(request.body);\n    response.sendStatus(200);\n  } catch (error) {\n    console.error("[cloud webhook persist]", error?.message || error);\n    response.sendStatus(500);\n  }\n});',
    "webhook Cloud confirmado solo después de persistir",
  );

  patched = replaceOnce(
    patched,
    '    if (data.pendingIncomingIdentity.length > 100) data.pendingIncomingIdentity.splice(100);',
    '    if (data.pendingIncomingIdentity.length > 5000) addLog("WhatsApp: hay más de 5.000 identidades pendientes; no se eliminará ninguna automáticamente.", "warning");',
    "no descartar identidades pendientes",
  );

  patched = replaceOnce(
    patched,
    'app.get("/api/message-reliability", requireAdmin, (request, response) => {\n  response.setHeader("Cache-Control", "no-store");\n  response.json(v2611ReliabilityOverview());\n});',
    'app.get("/api/message-reliability", requireAdmin, (request, response) => {\n  response.setHeader("Cache-Control", "no-store");\n  response.json({ ...v2611ReliabilityOverview(), ingress: v2636IngressOverview() });\n});',
    "diagnóstico de ingresos pendientes",
  );

  return patched;
}
