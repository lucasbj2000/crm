function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.6 media: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.6 media: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

const retryHelpers = String.raw`
let v266Ipv4Ready = false;
const v266MediaRetryTimers = new Map();
const v266MediaRetryDelays = [2500, 10000, 30000, 120000, 300000, 600000];

async function v266PreferIpv4() {
  if (v266Ipv4Ready) return;
  try {
    const dns = await import("node:dns");
    if (typeof dns.setDefaultResultOrder === "function") dns.setDefaultResultOrder("ipv4first");
  } catch {}
  v266Ipv4Ready = true;
}

function v266PackValue(value, depth = 0) {
  if (depth > 16 || value === undefined || typeof value === "function") return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return { __v266BigInt: String(value) };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { __v266Base64: Buffer.from(value).toString("base64") };
  if (Array.isArray(value)) return value.map((entry) => v266PackValue(entry, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      const packed = v266PackValue(entry, depth + 1);
      if (packed !== null || entry === null) out[key] = packed;
    }
    return out;
  }
  return null;
}

function v266UnpackValue(value, depth = 0) {
  if (depth > 16 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((entry) => v266UnpackValue(entry, depth + 1));
  if (typeof value === "object") {
    if (typeof value.__v266Base64 === "string") return Buffer.from(value.__v266Base64, "base64");
    if (typeof value.__v266BigInt === "string") {
      try { return BigInt(value.__v266BigInt); } catch { return value.__v266BigInt; }
    }
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = v266UnpackValue(entry, depth + 1);
    return out;
  }
  return value;
}

function v266RetryPayload(item, info, lineId, branchId) {
  return {
    key: v266PackValue(item?.key || {}),
    message: v266PackValue(item?.message || {}),
    messageTimestamp: v266PackValue(item?.messageTimestamp ?? null),
    pushName: cleanText(item?.pushName, 160),
    info: {
      kind: info.kind,
      fileName: safeFileName(info.fileName),
      mimeType: cleanText(info.mimeType, 180),
      declaredSize: Math.max(0, Number(info.declaredSize) || 0),
      duration: Math.max(0, Number(info.duration) || 0),
      voiceNote: info.voiceNote === true,
      caption: cleanText(info.caption, 4000),
    },
    lineId: lineId || null,
    branchId: branchId || null,
    attempts: 0,
    createdAt: timestamp(),
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: "",
  };
}

function v266FindAttachmentRecord(attachmentId) {
  for (const deal of data.deals || []) {
    for (const message of deal.messages || []) {
      if (message.attachment?.id === attachmentId) return { deal, message, attachment: message.attachment };
    }
  }
  return null;
}

function v266SourceSocket(retry = {}) {
  return lineSocket(retry.lineId) || branchSocket(retry.branchId) || whatsappSocket || null;
}

function v266PublicAttachment(attachment) {
  if (!attachment) return null;
  const available = attachment.available !== false && Boolean(attachment.storedName);
  return {
    id: attachment.id,
    kind: attachment.kind || "document",
    fileName: attachment.fileName || "Archivo",
    mimeType: attachment.mimeType || "application/octet-stream",
    size: Math.max(0, Number(attachment.size) || 0),
    duration: Math.max(0, Number(attachment.duration) || 0),
    available,
    retryable: !available && Boolean(attachment.retry),
    error: available ? "" : cleanText(attachment.error || attachment.retry?.lastError || "No se pudo descargar el archivo.", 500),
    url: available ? "/api/media/" + encodeURIComponent(attachment.id) : null,
  };
}

function v266ScheduleMediaRetry(attachmentId, delay = 2500) {
  if (!attachmentId || v266MediaRetryTimers.has(attachmentId)) return;
  const timer = setTimeout(async () => {
    v266MediaRetryTimers.delete(attachmentId);
    try { await v266RetryMediaById(attachmentId, { background: true }); }
    catch (error) { console.warn("[media auto-retry]", error?.message || error); }
  }, Math.max(500, Number(delay) || 2500));
  timer.unref?.();
  v266MediaRetryTimers.set(attachmentId, timer);
}

async function v266RetryMediaById(attachmentId, { background = false } = {}) {
  const record = v266FindAttachmentRecord(attachmentId);
  if (!record?.attachment) return null;
  const attachment = record.attachment;
  if (attachment.available !== false && attachment.storedName) return attachment;
  const retry = attachment.retry;
  if (!retry?.message || !retry?.info) return attachment;
  const attempts = Math.max(0, Number(retry.attempts) || 0);
  if (background && attempts >= v266MediaRetryDelays.length) return attachment;

  retry.attempts = attempts + 1;
  retry.lastAttemptAt = timestamp();
  await v266PreferIpv4();

  const item = {
    key: v266UnpackValue(retry.key || {}),
    message: v266UnpackValue(retry.message || {}),
    messageTimestamp: v266UnpackValue(retry.messageTimestamp),
    pushName: retry.pushName || "",
  };
  const info = { ...retry.info };
  const socket = v266SourceSocket(retry);

  try {
    const fresh = await downloadIncomingAttachment(item, info, socket, attachment.id);
    if (fresh?.available !== false && fresh?.storedName) {
      Object.assign(attachment, fresh, { id: attachment.id });
      attachment.retry = retry;
      attachment.error = "";
      attachment.retryable = false;
      retry.lastError = "";
      retry.lastSuccessAt = timestamp();
      await store.save();
      return attachment;
    }
    retry.lastError = cleanText(fresh?.error || "WhatsApp todavía no entregó el archivo.", 500);
    attachment.error = retry.lastError;
    attachment.retryable = true;
  } catch (error) {
    retry.lastError = cleanText(error?.message || error || "No se pudo recuperar el archivo.", 500);
    attachment.error = retry.lastError;
    attachment.retryable = true;
  }

  await store.save();
  if (background && retry.attempts < v266MediaRetryDelays.length) {
    v266ScheduleMediaRetry(attachment.id, v266MediaRetryDelays[Math.min(retry.attempts, v266MediaRetryDelays.length - 1)]);
  }
  return attachment;
}

async function v266ResumeFailedMedia() {
  for (const deal of data.deals || []) {
    for (const message of deal.messages || []) {
      const attachment = message.attachment;
      if (attachment?.available === false && attachment.retry) v266ScheduleMediaRetry(attachment.id, 3500);
    }
  }
}

setTimeout(() => { void v266ResumeFailedMedia(); }, 5000).unref?.();
`;

const retryRoutes = String.raw`
app.post("/api/media/:id/retry", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    const record = v266FindAttachmentRecord(request.params.id);
    if (!record) return response.status(404).json({ error: "Archivo no encontrado." });
    if (!userCanAccessDeal(user, record.deal)) return response.status(403).json({ error: "No tenés acceso a este archivo." });
    if (!record.attachment.retry && record.attachment.available === false) {
      return response.status(409).json({ error: "Este archivo falló antes de habilitar la recuperación automática. Pedí al cliente que lo reenvíe una vez." });
    }
    const attachment = await v266RetryMediaById(record.attachment.id, { background: false });
    response.setHeader("Cache-Control", "no-store");
    response.json({ ok: attachment?.available !== false && Boolean(attachment?.storedName), attachment: v266PublicAttachment(attachment) });
  } catch (error) { next(error); }
});

app.get("/api/media/:id/status", (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  const record = v266FindAttachmentRecord(request.params.id);
  if (!record) return response.status(404).json({ error: "Archivo no encontrado." });
  if (!userCanAccessDeal(user, record.deal)) return response.status(403).json({ error: "No tenés acceso a este archivo." });
  response.setHeader("Cache-Control", "no-store");
  response.json({ attachment: v266PublicAttachment(record.attachment) });
});
`;

export function applyV266MediaRetryPatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    'async function downloadIncomingAttachment(item, info, sourceSocket = null) {\n  const attachmentId = makeId("attachment");',
    'async function downloadIncomingAttachment(item, info, sourceSocket = null, attachmentId = makeId("attachment")) {\n  await v266PreferIpv4();',
    "descarga con identificador persistente e IPv4 preferente",
  );

  patched = replaceOnce(
    patched,
    'function findAttachment(attachmentId) {',
    retryHelpers + '\nfunction findAttachment(attachmentId) {',
    "helpers de recuperación multimedia",
  );

  patched = replaceOnce(
    patched,
    'const mediaSocket = lineSocket(lineId) || branchSocket(branchId) || whatsappSocket;\n    const attachment = info ? await downloadIncomingAttachment(item, info, mediaSocket) : null;',
    'const mediaSocket = lineSocket(lineId) || branchSocket(branchId) || whatsappSocket;\n    const attachment = info ? await downloadIncomingAttachment(item, info, mediaSocket) : null;\n    if (attachment && info) {\n      attachment.retry = v266RetryPayload(item, info, lineId, branchId);\n      if (attachment.available === false) {\n        attachment.retry.lastError = cleanText(attachment.error, 500);\n        v266ScheduleMediaRetry(attachment.id, 2500);\n      } else {\n        attachment.retry.lastSuccessAt = timestamp();\n      }\n    }',
    "persistencia del mensaje para reintentos",
  );

  patched = replaceOnce(
    patched,
    'attachment: message.attachment || null,',
    'attachment: v266PublicAttachment(message.attachment),',
    "historial con adjunto público seguro",
  );

  patched = replaceOnce(
    patched,
    'app.get("/api/media/:id", (request, response, next) => {',
    retryRoutes + '\napp.get("/api/media/:id", (request, response, next) => {',
    "rutas de reintento multimedia",
  );

  return patched;
}
