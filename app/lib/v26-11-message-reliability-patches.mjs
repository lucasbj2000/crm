function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.11 mensajes: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.11 mensajes: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceRequired(source, find, replacement, label, expected = 1) {
  let out = source;
  let count = 0;
  let index = out.indexOf(find);
  while (index >= 0) {
    out = out.slice(0, index) + replacement + out.slice(index + find.length);
    count += 1;
    index = out.indexOf(find, index + replacement.length);
  }
  if (count !== expected) throw new Error(`V26.11 mensajes: ${label} esperaba ${expected} coincidencia(s) y encontró ${count}.`);
  return out;
}

const reliabilityHelpers = String.raw`
const v2611IncomingQueues = new Map();
const v2611OutgoingQueues = new Map();
const v2611RetryDelays = [250, 700, 1600, 3200];
if (!Array.isArray(data.messageOutbox)) data.messageOutbox = [];
if (!Array.isArray(data.messageReliabilityFailures)) data.messageReliabilityFailures = [];
if (!Array.isArray(data.processedMessageIds)) data.processedMessageIds = [];

function v2611Wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(25, Number(ms) || 25)));
}

function v2611TrimReliability() {
  if (data.messageOutbox.length > 1500) data.messageOutbox.splice(1500);
  if (data.messageReliabilityFailures.length > 500) data.messageReliabilityFailures.splice(500);
  if (data.processedMessageIds.length > 5000) data.processedMessageIds.splice(0, data.processedMessageIds.length - 5000);
}

function v2611RecordFailure(input = {}) {
  const row = {
    id: makeId("msgfail"),
    direction: input.direction === "outgoing" ? "outgoing" : "incoming",
    messageId: cleanText(input.messageId, 200) || null,
    lineId: cleanText(input.lineId, 160) || null,
    branchId: cleanText(input.branchId, 160) || null,
    dealId: cleanText(input.dealId, 160) || null,
    attempts: Math.max(1, Number(input.attempts) || 1),
    error: cleanText(input.error || "Fallo de mensajería", 700),
    at: timestamp(),
  };
  data.messageReliabilityFailures.unshift(row);
  v2611TrimReliability();
  return row;
}

function v2611EventMessageIds(event) {
  return [...new Set((event?.messages || []).map((item) => cleanText(item?.key?.id, 200)).filter(Boolean))];
}

function v2611CommunicationRecorded(messageId) {
  if (!messageId) return false;
  if ((data.processedMessageIds || []).includes(messageId)) return true;
  for (const deal of data.deals || []) {
    if ((deal.messages || []).some((message) => String(message?.id || "") === String(messageId))) return true;
  }
  for (const event of data.communicationEvents || []) {
    if (String(event?.messageId || "") === String(messageId)) return true;
    if (String(event?.metadata?.messageId || "") === String(messageId)) return true;
    if (String(event?.metadata?.replyMessageId || "") === String(messageId)) return true;
  }
  for (const campaign of data.campaigns || []) {
    if ((campaign.recipients || []).some((recipient) => String(recipient?.replyMessageId || "") === String(messageId))) return true;
  }
  return false;
}

function v2611CommitIncomingIds(ids = []) {
  let changed = false;
  for (const id of ids) {
    if (!id) continue;
    seenMessages.add(id);
    if (!(data.processedMessageIds || []).includes(id)) {
      data.processedMessageIds.push(id);
      changed = true;
    }
  }
  v2611TrimReliability();
  return changed;
}

function v2611ReleaseUncommitted(ids = []) {
  for (const id of ids) {
    if (!id || v2611CommunicationRecorded(id)) continue;
    seenMessages.delete(id);
    const index = (data.processedMessageIds || []).indexOf(id);
    if (index >= 0) data.processedMessageIds.splice(index, 1);
  }
}

async function v2611ProcessIncoming(event, options = {}) {
  const ids = v2611EventMessageIds(event);
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await handleIncomingMessages(event, options);
      if (v2611CommitIncomingIds(ids)) await store.save();
      return true;
    } catch (error) {
      lastError = error;
      v2611ReleaseUncommitted(ids);
      console.warn("[message reliability incoming] intento " + attempt + "/4", error?.message || error);
      if (attempt < 4) await v2611Wait(v2611RetryDelays[Math.min(attempt - 1, v2611RetryDelays.length - 1)]);
    }
  }
  for (const id of ids.filter((value) => !v2611CommunicationRecorded(value))) {
    v2611RecordFailure({ direction: "incoming", messageId: id, lineId: options.lineId, branchId: options.branchId, attempts: 4, error: lastError?.message || lastError });
  }
  addLog("WhatsApp: un mensaje entrante no pudo procesarse tras 4 intentos. Quedó registrado para diagnóstico; no se ocultó el fallo.", "warning");
  await store.save().catch(() => {});
  return false;
}

function v2611QueueIncoming(event, options = {}) {
  const key = cleanText(options.lineId || options.branchId || "primary", 180) || "primary";
  const previous = v2611IncomingQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => v2611ProcessIncoming(event, options));
  v2611IncomingQueues.set(key, next);
  void next.finally(() => { if (v2611IncomingQueues.get(key) === next) v2611IncomingQueues.delete(key); });
  return next;
}

function v2611QueueOutgoing(lineId, task) {
  const key = cleanText(lineId || "primary", 180) || "primary";
  const previous = v2611OutgoingQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  v2611OutgoingQueues.set(key, next);
  void next.finally(() => { if (v2611OutgoingQueues.get(key) === next) v2611OutgoingQueues.delete(key); });
  return next;
}

function v2611OutboxEntry(deal, line, text) {
  const entry = {
    id: makeId("outbox"),
    providerMessageId: line?.provider === "qr" ? randomBytes(16).toString("hex").toUpperCase() : null,
    dealId: deal?.id || null,
    clientId: deal?.clientId || null,
    phone: normalizePhone(deal?.phone || ""),
    jid: cleanText(deal?.jid, 220),
    lineId: line?.id || null,
    branchId: deal?.branchId || line?.branchId || null,
    provider: line?.provider || "qr",
    kind: "text",
    text: cleanText(text, 6000),
    status: "pending",
    attempts: 0,
    createdAt: timestamp(),
    updatedAt: timestamp(),
    lastAttemptAt: null,
    acceptedAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    lastError: "",
  };
  data.messageOutbox.unshift(entry);
  v2611TrimReliability();
  return entry;
}

function v2611FindOutbox(providerMessageId) {
  if (!providerMessageId) return null;
  return (data.messageOutbox || []).find((entry) => String(entry.providerMessageId || "") === String(providerMessageId)) || null;
}

function v2611SetOutboxStatus(providerMessageId, status, meta = {}) {
  const entry = v2611FindOutbox(providerMessageId);
  if (!entry) return false;
  const rank = { pending: 0, retrying: 1, accepted: 2, sent: 3, delivered: 4, read: 5, failed: 6 };
  if (status !== "failed" && (rank[status] || 0) < (rank[entry.status] || 0)) return false;
  entry.status = status;
  entry.updatedAt = timestamp();
  if (status === "accepted" || status === "sent") entry.acceptedAt = entry.acceptedAt || timestamp();
  if (status === "delivered") entry.deliveredAt = entry.deliveredAt || timestamp();
  if (status === "read") { entry.deliveredAt = entry.deliveredAt || timestamp(); entry.readAt = entry.readAt || timestamp(); }
  if (status === "failed") { entry.failedAt = timestamp(); entry.lastError = cleanText(meta.error || entry.lastError || "WhatsApp informó fallo de entrega.", 700); }
  if (meta.providerStatus !== undefined) entry.providerStatus = meta.providerStatus;
  return true;
}

function v2611RetryableError(error) {
  const text = String(error?.message || error || "").toLowerCase();
  const cloud4xx = text.match(/whatsapp api[^:]*:\s*(4\d\d)/i)?.[1];
  if (cloud4xx && !["408", "409", "425", "429"].includes(cloud4xx)) return false;
  if (/logged.?out|desvinculad|invalid token|access token|permission|forbidden|unauthor|número inválido|numero invalido/.test(text)) return false;
  return true;
}

async function v2611ReadyQrSocket(line) {
  let socket = lineSocket(line?.id);
  if (socket && lineStatus(line.id) === "connected") return socket;
  try {
    if (line?.legacyBranchSession) await startBranchConnection(line.branchId);
    else if (line?.id) await startWhatsappLineConnection(line.id);
  } catch {}
  socket = lineSocket(line?.id);
  return socket && lineStatus(line.id) === "connected" ? socket : null;
}

async function v2611SendTextReliable(deal, text, line, outbox) {
  const maxAttempts = 5;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    outbox.attempts = attempt;
    outbox.lastAttemptAt = timestamp();
    outbox.updatedAt = timestamp();
    outbox.status = attempt === 1 ? "pending" : "retrying";
    await store.save();
    try {
      let providerMessageId = outbox.providerMessageId;
      if (line.provider === "cloud") {
        if (!lineCloudConfigured(line)) throw new Error("Cloud API de " + line.name + " no está configurada.");
        const result = await sendLineCloudPayload(line, { to: normalizePhone(deal.phone), type: "text", text: { body: text, preview_url: false } });
        providerMessageId = cleanText(result?.messages?.[0]?.id, 220);
        if (!providerMessageId) throw new Error("WhatsApp Cloud API no devolvió un ID de mensaje; el envío no se considera confirmado.");
      } else {
        const socket = await v2611ReadyQrSocket(line);
        if (!socket) throw new Error("WhatsApp " + line.name + " no está conectado todavía.");
        const sent = await socket.sendMessage(deal.jid, { text }, { messageId: outbox.providerMessageId });
        providerMessageId = cleanText(sent?.key?.id || outbox.providerMessageId, 220);
        if (!providerMessageId) throw new Error("WhatsApp QR no devolvió un ID de mensaje; el envío no se considera confirmado.");
      }
      outbox.providerMessageId = providerMessageId;
      outbox.status = "accepted";
      outbox.acceptedAt = timestamp();
      outbox.updatedAt = timestamp();
      outbox.lastError = "";
      await store.save();
      return providerMessageId;
    } catch (error) {
      lastError = error;
      outbox.lastError = cleanText(error?.message || error, 700);
      outbox.updatedAt = timestamp();
      const retryable = v2611RetryableError(error);
      if (!retryable || attempt >= maxAttempts) {
        outbox.status = "failed";
        outbox.failedAt = timestamp();
        const failure = v2611RecordFailure({ direction: "outgoing", messageId: outbox.providerMessageId, lineId: line.id, branchId: deal.branchId, dealId: deal.id, attempts: attempt, error: outbox.lastError });
        recordAuditEvent(null, "mensaje_whatsapp_fallo_confirmacion", { outboxId: outbox.id, failureId: failure.id, dealId: deal.id, lineId: line.id, attempts: attempt, error: outbox.lastError }, deal.branchId, "system");
        addLog("No se confirmó un envío a " + (deal.name || deal.phone) + " tras " + attempt + " intento(s). El CRM lo marcó como fallido en lugar de mostrarlo como enviado.", "warning");
        await store.save();
        const finalError = new Error("No se pudo confirmar el envío por WhatsApp después de " + attempt + " intento(s). El mensaje NO fue marcado como enviado; podés reintentar sin perder trazabilidad.");
        finalError.cause = lastError;
        throw finalError;
      }
      await store.save();
      await v2611Wait(v2611RetryDelays[Math.min(attempt - 1, v2611RetryDelays.length - 1)]);
    }
  }
  throw lastError || new Error("No se pudo confirmar el envío por WhatsApp.");
}

function v2611HandleQrMessageUpdates(updates, lineId = null) {
  let changed = false;
  for (const item of updates || []) {
    const id = cleanText(item?.key?.id, 220);
    const numeric = Number(item?.update?.status ?? item?.status);
    if (!id || !Number.isFinite(numeric)) continue;
    if (numeric >= 4) changed = v2611SetOutboxStatus(id, "read", { providerStatus: numeric }) || changed;
    else if (numeric >= 3) changed = v2611SetOutboxStatus(id, "delivered", { providerStatus: numeric }) || changed;
    else if (numeric >= 2) changed = v2611SetOutboxStatus(id, "sent", { providerStatus: numeric }) || changed;
    else if (numeric === 0) changed = v2611SetOutboxStatus(id, "failed", { providerStatus: numeric, error: "WhatsApp QR informó error de entrega." }) || changed;
  }
  if (changed) void store.save();
}

function v2611HandleQrReceipts(updates, lineId = null) {
  let changed = false;
  for (const item of updates || []) {
    const id = cleanText(item?.key?.id || item?.messageId, 220);
    if (!id) continue;
    changed = v2611SetOutboxStatus(id, "delivered", { providerStatus: "receipt" }) || changed;
  }
  if (changed) void store.save();
}

function v2611HandleCloudStatuses(body) {
  let changed = false;
  for (const entry of body?.entry || []) for (const change of entry?.changes || []) {
    const value = change?.value || {};
    for (const status of value.statuses || []) {
      const id = cleanText(status?.id, 220);
      const state = cleanText(status?.status, 60).toLowerCase();
      if (!id) continue;
      if (state === "read") changed = v2611SetOutboxStatus(id, "read", { providerStatus: state }) || changed;
      else if (state === "delivered") changed = v2611SetOutboxStatus(id, "delivered", { providerStatus: state }) || changed;
      else if (state === "sent") changed = v2611SetOutboxStatus(id, "sent", { providerStatus: state }) || changed;
      else if (state === "failed") {
        const detail = (status?.errors || []).map((error) => cleanText(error?.title || error?.message || error?.code, 220)).filter(Boolean).join(" · ");
        changed = v2611SetOutboxStatus(id, "failed", { providerStatus: state, error: detail || "WhatsApp Cloud informó fallo de entrega." }) || changed;
        if (changed) addLog("WhatsApp informó que un mensaje no pudo entregarse. Revisá Mensajería confiable para el detalle.", "warning");
      }
    }
  }
  if (changed) void store.save();
}

function v2611ReliabilityOverview() {
  const recent = (data.messageOutbox || []).slice(0, 250);
  const count = (status) => recent.filter((entry) => entry.status === status).length;
  return {
    queuedIncomingLines: v2611IncomingQueues.size,
    queuedOutgoingLines: v2611OutgoingQueues.size,
    outbox: {
      total: recent.length,
      pending: count("pending") + count("retrying"),
      accepted: count("accepted") + count("sent"),
      delivered: count("delivered"),
      read: count("read"),
      failed: count("failed"),
    },
    recentFailures: (data.messageReliabilityFailures || []).slice(0, 50),
    recentMessages: recent.slice(0, 50).map((entry) => ({ id: entry.id, providerMessageId: entry.providerMessageId, dealId: entry.dealId, phone: entry.phone, lineId: entry.lineId, provider: entry.provider, status: entry.status, attempts: entry.attempts, createdAt: entry.createdAt, acceptedAt: entry.acceptedAt, deliveredAt: entry.deliveredAt, readAt: entry.readAt, failedAt: entry.failedAt, lastError: entry.lastError })),
  };
}
`;

const reliableSendProviderText = String.raw`async function sendProviderText(deal, text) {
  if (mockMode) return makeId("mockmessage");
  const line = dealWhatsappLine(deal);
  if (!line) throw new Error("La negociación no tiene una línea de WhatsApp disponible.");
  const outbox = v2611OutboxEntry(deal, line, text);
  await store.save();
  return v2611QueueOutgoing(line.id, () => v2611SendTextReliable(deal, text, line, outbox));
}`;

const reliabilityRoute = String.raw`
app.get("/api/message-reliability", requireAdmin, (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json(v2611ReliabilityOverview());
});

`;

export function applyV2611MessageReliabilityPatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    'async function sendProviderText(deal, text) {\n  if (mockMode) return makeId("mockmessage");\n  const line=dealWhatsappLine(deal);\n  if(!line) throw new Error("La negociación no tiene una línea de WhatsApp disponible.");\n  if(line.provider==="cloud"){\n    if(!lineCloudConfigured(line)) throw new Error(`Cloud API de ${line.name} no está configurada.`);\n    const result=await sendLineCloudPayload(line,{to:normalizePhone(deal.phone),type:"text",text:{body:text,preview_url:false}});\n    return result.messages?.[0]?.id||makeId("cloudmessage");\n  }\n  const socket=lineSocket(line.id);\n  if(!socket||lineStatus(line.id)!=="connected") throw new Error(`WhatsApp ${line.name} · ${getBranch(line.branchId)?.name||"Sucursal"} no está conectado.`);\n  const sent=await socket.sendMessage(deal.jid,{text});\n  return sent?.key?.id||makeId("qrmessage");\n}',
    reliabilityHelpers + '\n' + reliableSendProviderText,
    "envío de texto por proveedor",
  );

  patched = replaceOnce(
    patched,
    'async function processCloudWebhook(body) {\n  const messages=[];',
    'async function processCloudWebhook(body) {\n  v2611HandleCloudStatuses(body);\n  const messages=[];',
    "acuse de entrega Cloud API",
  );

  patched = replaceOnce(
    patched,
    '      whatsappSocket.ev.on("messages.upsert", (event) => {\n        void handleIncomingMessages(event, { branchId: primaryBranchId() });\n      });\n      whatsappSocket.ev.on("messages.update", (updates) => {\n        void v268HandleWhatsappUpdates(updates, { branchId: primaryBranchId() });\n      });',
    '      whatsappSocket.ev.on("messages.upsert", (event) => {\n        void v2611QueueIncoming(event, { branchId: primaryBranchId() });\n      });\n      whatsappSocket.ev.on("messages.update", (updates) => {\n        void v268HandleWhatsappUpdates(updates, { branchId: primaryBranchId() });\n        v2611HandleQrMessageUpdates(updates, defaultWhatsappLine(primaryBranchId())?.id || null);\n      });\n      whatsappSocket.ev.on("message-receipt.update", (updates) => { v2611HandleQrReceipts(updates, defaultWhatsappLine(primaryBranchId())?.id || null); });',
    "cola y acuses de la línea principal",
  );

  patched = replaceOnce(
    patched,
    '      runtime.socket.ev.on("messages.upsert", (event) => { void handleIncomingMessages(event, { branchId }); });\n      runtime.socket.ev.on("messages.update", (updates) => { void v268HandleWhatsappUpdates(updates, { branchId }); });',
    '      runtime.socket.ev.on("messages.upsert", (event) => { void v2611QueueIncoming(event, { branchId }); });\n      runtime.socket.ev.on("messages.update", (updates) => { void v268HandleWhatsappUpdates(updates, { branchId }); v2611HandleQrMessageUpdates(updates, defaultWhatsappLine(branchId)?.id || null); });\n      runtime.socket.ev.on("message-receipt.update", (updates) => { v2611HandleQrReceipts(updates, defaultWhatsappLine(branchId)?.id || null); });',
    "cola y acuses por sucursal",
  );

  patched = replaceOnce(
    patched,
    '      runtime.socket.ev.on("messages.upsert",(event)=>{void handleIncomingMessages(event,{branchId:line.branchId,lineId:line.id});});\n      runtime.socket.ev.on("messages.update",(updates)=>{void v268HandleWhatsappUpdates(updates,{branchId:line.branchId,lineId:line.id});});',
    '      runtime.socket.ev.on("messages.upsert",(event)=>{void v2611QueueIncoming(event,{branchId:line.branchId,lineId:line.id});});\n      runtime.socket.ev.on("messages.update",(updates)=>{void v268HandleWhatsappUpdates(updates,{branchId:line.branchId,lineId:line.id});v2611HandleQrMessageUpdates(updates,line.id);});\n      runtime.socket.ev.on("message-receipt.update",(updates)=>{v2611HandleQrReceipts(updates,line.id);});',
    "cola y acuses por línea adicional",
  );

  patched = replaceRequired(
    patched,
    'void handleIncomingMessages({ ...event, type: "history" }, { history: true, branchId: primaryBranchId() })',
    'void v2611QueueIncoming({ ...event, type: "history" }, { history: true, branchId: primaryBranchId() })',
    "historial principal por cola",
    1,
  );

  patched = replaceRequired(
    patched,
    'void handleIncomingMessages({ ...event, type: "history" }, { history: true, branchId })',
    'void v2611QueueIncoming({ ...event, type: "history" }, { history: true, branchId })',
    "historial de sucursal por cola",
    1,
  );

  patched = replaceRequired(
    patched,
    'void handleIncomingMessages({...event,type:"history"},{history:true,branchId:line.branchId,lineId:line.id})',
    'void v2611QueueIncoming({...event,type:"history"},{history:true,branchId:line.branchId,lineId:line.id})',
    "historial de línea por cola",
    1,
  );

  patched = replaceOnce(
    patched,
    'app.get("/api/whatsapp-lines", (request, response) => {',
    reliabilityRoute + 'app.get("/api/whatsapp-lines", (request, response) => {',
    "panel API de confiabilidad",
  );

  return patched;
}
