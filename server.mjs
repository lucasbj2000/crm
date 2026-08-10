import { spawn } from "node:child_process";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import QRCode from "qrcode";
import pino from "pino";

import {
  OPEN_STAGES,
  STAGES,
  addActivity,
  adjustStock,
  automationActions,
  cleanText,
  closeLost,
  createDeal,
  closeWon,
  findClient,
  findDeal,
  findOpenDeal,
  findProductByQuery,
  makeId,
  normalizeData,
  publicData,
  recordCall,
  recordBotOutgoing,
  recordHumanOutgoing,
  recordIncoming,
  removeReservedItem,
  reserveProduct,
  timestamp,
  updateClient,
  upsertProduct,
} from "./lib/domain.mjs";
import { buildReports } from "./lib/reports.mjs";
import { JsonStore } from "./lib/store.mjs";
import { createStoredZip, listFilesRecursive, parseStoredZip } from "./lib/backup-zip.mjs";

const currentFile = fileURLToPath(import.meta.url);
const appDirectory = path.dirname(currentFile);
const publicDirectory = path.join(appDirectory, "public");
const dataDirectory = process.env.WHATSBOT_DATA_DIR
  ? path.resolve(process.env.WHATSBOT_DATA_DIR)
  : path.join(appDirectory, "data");
const authDirectory = path.join(dataDirectory, "whatsapp-session");
const mediaDirectory = path.join(dataDirectory, "media");
const databasePath = path.join(dataDirectory, "whatsbot-crm.json");
const port = Number.parseInt(process.env.PORT || "3030", 10);
const host = process.env.WHATSBOT_HOST || "0.0.0.0";
const mockMode = process.env.WHATSAPP_MOCK === "1";
const maximumMediaBytes = 64 * 1024 * 1024;
const whatsappLogger = pino({ level: "silent" });

const store = new JsonStore(databasePath);
await store.load();
const data = store.data;
const initialAdminPasswordHash = "7bf3f828f2da9830f7817c4e5e719c1a:61464159a9ece0d5397ea31ddb7b401d12c0d38d22bc17c7691648db0eb2411a96ac6fab8a4fc7e08bc8017fdad2b18feebf07d98ad557343879be90e34557e7";

if (!Array.isArray(data.users)) data.users = [];
if (!Array.isArray(data.clientLoads)) data.clientLoads = [];
if (!data.users.length) {
  data.users.push({
    id: makeId("user"),
    username: "admin",
    name: "Administrador",
    role: "admin",
    passwordHash: initialAdminPasswordHash,
    active: true,
    clientDailyLimit: 50,
    createdAt: timestamp(),
    updatedAt: timestamp(),
  });
  await store.save();
}

let connectionStatus = "disconnected";
let qrDataUrl = null;
let connectedAccount = null;
let lastError = null;
let whatsappSocket = null;
let reconnectTimer = null;
let manualLogout = false;
let startingPromise = null;
let automationRunning = false;
let downloadMediaMessage = null;
const firstConnectionHistoryMs = 30 * 24 * 60 * 60 * 1000;
let syncCutoffAt = Date.parse(data.sync?.lastActiveAt) || Date.now() - firstConnectionHistoryMs;
let historySyncing = false;
const seenMessages = new Set((data.processedMessageIds || []).slice(-1200));
const sessions = new Map();

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, digest] = String(stored).split(":");
    const expected = Buffer.from(digest, "hex");
    const actual = scryptSync(password, salt, 64);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

if (!data.settings.passwordHash) {
  data.settings.passwordHash = initialAdminPasswordHash;
  await store.save();
}

function rememberSeen(id) {
  if (!id) return;
  seenMessages.add(id);
  if (seenMessages.size > 1200) {
    const oldest = seenMessages.values().next().value;
    if (oldest) seenMessages.delete(oldest);
  }
}

function addLog(text, tone = "neutral") {
  addActivity(data, text, tone);
  void store.save();
}

function formatAccount(id) {
  if (!id) return null;
  const number = String(id).split(":")[0].split("@")[0];
  return number ? `+${number}` : "Cuenta vinculada";
}

function cloudApiConfigured() {
  const config = data.settings.whatsappApi || {};
  return Boolean(config.phoneNumberId && config.accessToken);
}

function connectionState() {
  const cloud = data.settings.whatsappMode === "cloud";
  return {
    status: cloud ? (cloudApiConfigured() ? "connected" : "disconnected") : connectionStatus,
    qr: cloud ? null : qrDataUrl,
    account: cloud ? (data.settings.whatsappApi?.phoneNumberId || null) : connectedAccount,
    error: lastError,
    provider: cloud ? "cloud" : "qr",
    mockMode,
    syncing: cloud ? false : historySyncing,
    lastHistorySyncAt: data.sync?.lastHistorySyncAt || null,
    lastImportAt: data.sync?.lastImportAt || null,
    lastImportCount: Number(data.sync?.lastImportCount || 0),
    totalImported: Number(data.sync?.totalImported || 0),
  };
}

function publicUsers() {
  const now = Date.now();
  const today = paraguayDateKey(now);
  return data.users.map((user) => ({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active !== false,
    clientDailyLimit: Number(user.clientDailyLimit || 0),
    clientLoadsToday: data.clientLoads.filter((entry) => entry.userId === user.id && entry.date === today).length,
    online: [...sessions.values()].some((session) => session.userId === user.id && session.expiresAt > now && now - (session.lastSeenAt || 0) < 20000),
  }));
}

function canSeeAll(user) {
  return Boolean(user && ["admin", "manager"].includes(user.role));
}

function stateResponse(request = null) {
  const user = request ? currentUser(request) : null;
  const payload = publicData(data);
  if (user && !canSeeAll(user)) {
    const visibleDeals = payload.deals.filter((deal) => !deal.ownerUserId || deal.ownerUserId === user.id);
    const visibleClientIds = new Set(visibleDeals.map((deal) => deal.clientId).filter(Boolean));
    payload.deals = visibleDeals;
    payload.clients = (payload.clients || []).filter((client) => visibleClientIds.has(client.id) || !client.ownerUserId || client.ownerUserId === user.id);
  }
  return {
    connection: connectionState(),
    ...payload,
    users: publicUsers(),
    currentUser: user ? { id: user.id, username: user.username, name: user.name, role: user.role, clientDailyLimit: Number(user.clientDailyLimit || 0) } : undefined,
  };
}

function unwrapMessage(message) {
  let current = message;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
      continue;
    }
    if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
      continue;
    }
    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
      continue;
    }
    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
      continue;
    }
    break;
  }
  return current || {};
}

function extractText(message) {
  const content = unwrapMessage(message);
  return cleanText(
    content.conversation ||
      content.extendedTextMessage?.text ||
      content.imageMessage?.caption ||
      content.videoMessage?.caption ||
      content.documentMessage?.caption ||
      content.buttonsResponseMessage?.selectedDisplayText ||
      content.listResponseMessage?.title ||
      "",
    6000,
  );
}

function messageTime(messageTimestamp) {
  if (!messageTimestamp) return Date.now();
  const seconds = Number(messageTimestamp);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now();
}

function safeFileName(value, fallback = "archivo") {
  const cleaned = String(value || fallback)
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

function extensionForMime(mimeType, kind = "document") {
  const mime = String(mimeType || "").split(";")[0].toLowerCase();
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/webm": ".webm",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
  };
  return map[mime] || { image: ".jpg", video: ".mp4", audio: ".ogg", document: ".bin" }[kind] || ".bin";
}

function mediaInfo(message) {
  const content = unwrapMessage(message);
  const candidates = [
    ["image", content.imageMessage],
    ["video", content.videoMessage || content.ptvMessage],
    ["audio", content.audioMessage],
    ["document", content.documentMessage],
    ["image", content.stickerMessage],
  ];
  const [kind, media] = candidates.find(([, value]) => value) || [];
  if (!kind || !media) return null;
  const mimeType = cleanText(media.mimetype, 160) || {
    image: "image/jpeg",
    video: "video/mp4",
    audio: "audio/ogg",
    document: "application/octet-stream",
  }[kind];
  const caption = cleanText(media.caption, 4000);
  const defaultName = `${kind}-${Date.now()}${extensionForMime(mimeType, kind)}`;
  return {
    kind,
    mimeType,
    caption,
    fileName: safeFileName(media.fileName, defaultName),
    declaredSize: Math.max(0, Number(media.fileLength) || 0),
    duration: Math.max(0, Number(media.seconds) || 0),
    ptt: Boolean(media.ptt),
  };
}

function messageLabel(info) {
  if (!info) return "";
  const labels = {
    image: "Imagen",
    video: "Video",
    audio: info.ptt ? "Mensaje de voz" : "Audio",
    document: `Documento: ${info.fileName}`,
  };
  return info.caption || `[${labels[info.kind] || "Archivo"}]`;
}

function isKnownMessage(messageId) {
  return Boolean(
    messageId &&
      (seenMessages.has(messageId) || (data.processedMessageIds || []).includes(messageId)),
  );
}

function shouldImportMessage(item, source) {
  if (source === "notify") return true;
  const occurredAt = messageTime(item.messageTimestamp);
  const oldestAllowed = syncCutoffAt - 2 * 60 * 1000;
  return occurredAt >= oldestAllowed && occurredAt <= Date.now() + 5 * 60 * 1000;
}

function isDirectChat(jid) {
  return Boolean(
    jid &&
      jid !== "status@broadcast" &&
      !jid.endsWith("@g.us") &&
      !jid.endsWith("@broadcast") &&
      !jid.endsWith("@newsletter"),
  );
}

async function saveAttachmentBuffer(buffer, info, attachmentId = makeId("attachment")) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("El archivo está vacío.");
  if (buffer.length > maximumMediaBytes) {
    throw new Error("El archivo supera el límite de 64 MB.");
  }
  await mkdir(mediaDirectory, { recursive: true });
  const suppliedExtension = path.extname(info.fileName || "")
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "")
    .slice(0, 12);
  const storedName = `${attachmentId}${suppliedExtension || extensionForMime(info.mimeType, info.kind)}`;
  await writeFile(path.join(mediaDirectory, storedName), buffer, { mode: 0o600 });
  return {
    id: attachmentId,
    kind: info.kind,
    fileName: safeFileName(info.fileName),
    mimeType: cleanText(info.mimeType, 160) || "application/octet-stream",
    size: buffer.length,
    duration: Math.max(0, Number(info.duration) || 0),
    storedName,
    available: true,
  };
}

async function downloadIncomingAttachment(item, info) {
  const attachmentId = makeId("attachment");
  const unavailable = {
    id: attachmentId,
    kind: info.kind,
    fileName: safeFileName(info.fileName),
    mimeType: info.mimeType,
    size: info.declaredSize,
    duration: info.duration,
    storedName: null,
    available: false,
  };
  if (info.declaredSize > maximumMediaBytes || !downloadMediaMessage) return unavailable;
  try {
    const buffer = await downloadMediaMessage(item, "buffer", {}, {
      logger: whatsappLogger,
      reuploadRequest: (message) => whatsappSocket?.updateMediaMessage(message),
    });
    return await saveAttachmentBuffer(buffer, info, attachmentId);
  } catch (error) {
    console.error("[media download]", error?.message || error);
    return unavailable;
  }
}

function findAttachment(attachmentId) {
  for (const deal of data.deals) {
    for (const message of deal.messages || []) {
      if (message.attachment?.id === attachmentId) return message.attachment;
    }
  }
  return null;
}

function stockContext() {
  const active = data.products.filter((product) => product.active !== false);
  if (!active.length) return "No hay productos cargados en el stock.";
  return active
    .slice(0, 120)
    .map(
      (product) =>
        `${product.sku} | ${product.name} | disponible: ${product.available}` +
        (product.price ? ` | precio: ${product.price}` : ""),
    )
    .join("\n");
}

function hasExplicitConfirmation(message, evidence) {
  const text = cleanText(message, 6000).toLocaleLowerCase("es");
  const proof = cleanText(evidence, 300).toLocaleLowerCase("es");
  if (!proof || !text.includes(proof)) return false;
  return /\b(si|sí|confirmo|confirmado|quiero|dale|de acuerdo|ok|okay|reservá|reserva|llevo|dame|agregá|agrega)\b/i.test(
    proof,
  );
}

async function executeAiTool(toolCall, deal, clientMessage) {
  let args = {};
  try {
    args = JSON.parse(toolCall.function?.arguments || "{}");
  } catch {
    return { ok: false, error: "Argumentos inválidos." };
  }

  if (toolCall.function?.name === "consultar_stock") {
    const matches = findProductByQuery(data, args.consulta).map((product) => ({
      id: product.id,
      codigo: product.sku,
      producto: product.name,
      disponible: product.available,
      precio: product.price || null,
    }));
    return { ok: true, resultados: matches };
  }

  if (toolCall.function?.name === "reservar_stock") {
    if (!data.settings.botCanReserve) {
      return { ok: false, error: "La reserva automática está desactivada." };
    }
    if (args.confirmado !== true || !hasExplicitConfirmation(clientMessage, args.evidencia)) {
      return {
        ok: false,
        error: "No existe una confirmación explícita verificable en el mensaje del cliente.",
      };
    }
    const query = cleanText(args.producto, 160);
    const matches = findProductByQuery(data, query);
    const exact = matches.find(
      (product) =>
        product.sku.toLowerCase() === query.toLowerCase() ||
        product.name.toLowerCase() === query.toLowerCase(),
    );
    const product = exact || (matches.length === 1 ? matches[0] : null);
    if (!product) {
      return { ok: false, error: "No se encontró un único producto para reservar." };
    }
    try {
      const result = reserveProduct(
        data,
        deal.id,
        product.id,
        args.cantidad,
        "bot",
      );
      addActivity(
        data,
        `El bot reservó ${Math.max(1, Math.trunc(Number(args.cantidad) || 1))} × ${product.name}.`,
        "success",
      );
      await store.save();
      return {
        ok: true,
        producto: result.product.name,
        cantidad: Math.max(1, Math.trunc(Number(args.cantidad) || 1)),
        disponible_restante: result.product.available,
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  return { ok: false, error: "Herramienta no reconocida." };
}

async function requestAi(messages, tools) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: data.settings.model,
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: 600,
      temperature: 0.4,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Servicio de IA: ${response.status} ${body.slice(0, 180)}`);
  }
  return response.json();
}

async function createAiReply(deal, userMessage) {
  if (!data.settings.apiKey) return null;
  const tools = [
    {
      type: "function",
      function: {
        name: "consultar_stock",
        description: "Consulta productos disponibles antes de informar disponibilidad.",
        parameters: {
          type: "object",
          properties: {
            consulta: { type: "string", description: "Código o nombre del producto." },
          },
          required: ["consulta"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "reservar_stock",
        description:
          "Reserva stock solo cuando el cliente confirmó explícitamente el producto y la cantidad en su último mensaje.",
        parameters: {
          type: "object",
          properties: {
            producto: { type: "string" },
            cantidad: { type: "integer", minimum: 1 },
            confirmado: { type: "boolean" },
            evidencia: {
              type: "string",
              description: "Fragmento textual exacto del mensaje que demuestra la confirmación.",
            },
          },
          required: ["producto", "cantidad", "confirmado", "evidencia"],
          additionalProperties: false,
        },
      },
    },
  ];
  const recent = (deal.messages || [])
    .slice(-12, -1)
    .map((message) => ({
      role: message.direction === "incoming" ? "user" : "assistant",
      content: message.text,
    }));
  const messages = [
    {
      role: "system",
      content:
        `${data.settings.instructions}\n\n` +
        "REGLAS DEL SISTEMA:\n" +
        "- Nunca inventes stock, precios ni reservas.\n" +
        "- Consultá el stock con la herramienta cuando el cliente pregunte por un producto.\n" +
        "- Solo reservá si el último mensaje contiene confirmación explícita del producto y la cantidad.\n" +
        "- Si falta información, preguntá antes de reservar.\n" +
        "- Respondé solamente con el mensaje final destinado al cliente.\n\n" +
        `STOCK ACTUAL:\n${stockContext()}`,
    },
    ...recent,
    { role: "user", content: userMessage },
  ];

  for (let round = 0; round < 3; round += 1) {
    const result = await requestAi(messages, tools);
    const message = result.choices?.[0]?.message;
    if (!message) throw new Error("La IA no devolvió una respuesta.");
    if (!message.tool_calls?.length) {
      const reply = cleanText(message.content, 4000);
      if (!reply) throw new Error("La IA no devolvió texto.");
      return reply;
    }
    messages.push({
      role: "assistant",
      content: message.content || null,
      tool_calls: message.tool_calls,
    });
    for (const call of message.tool_calls) {
      const output = await executeAiTool(call, deal, userMessage);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(output),
      });
    }
  }
  throw new Error("La IA realizó demasiadas consultas sin responder.");
}

function cloudApiBase() {
  const version = cleanText(data.settings.whatsappApi?.apiVersion || "v23.0", 20).replace(/[^v0-9.]/gi, "") || "v23.0";
  return `https://graph.facebook.com/${version}`;
}

async function cloudFetch(endpoint, options = {}) {
  const token = data.settings.whatsappApi?.accessToken;
  if (!token) throw new Error("Configurá el token de acceso de WhatsApp API.");
  const response = await fetch(`${cloudApiBase()}/${String(endpoint).replace(/^\//, "")}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`WhatsApp API: ${response.status} ${detail.slice(0, 260)}`);
  }
  const type = response.headers.get("content-type") || "";
  return type.includes("application/json") ? response.json() : response.arrayBuffer();
}

async function sendCloudPayload(payload) {
  const phoneNumberId = data.settings.whatsappApi?.phoneNumberId;
  if (!phoneNumberId) throw new Error("Configurá el ID del número de WhatsApp API.");
  return cloudFetch(`${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
}

async function sendProviderText(deal, text) {
  if (mockMode) return makeId("mockmessage");
  if (data.settings.whatsappMode === "cloud") {
    const result = await sendCloudPayload({
      to: normalizePhone(deal.phone),
      type: "text",
      text: { body: text, preview_url: false },
    });
    return result.messages?.[0]?.id || makeId("cloudmessage");
  }
  if (!whatsappSocket || connectionStatus !== "connected") throw new Error("WhatsApp no está conectado.");
  const sent = await whatsappSocket.sendMessage(deal.jid, { text });
  return sent?.key?.id || makeId("qrmessage");
}

async function uploadCloudMedia(buffer, info) {
  const phoneNumberId = data.settings.whatsappApi?.phoneNumberId;
  if (!phoneNumberId) throw new Error("Configurá el ID del número de WhatsApp API.");
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", info.mimeType);
  form.append("file", new Blob([buffer], { type: info.mimeType }), info.fileName);
  const result = await cloudFetch(`${phoneNumberId}/media`, { method: "POST", body: form });
  if (!result.id) throw new Error("WhatsApp API no devolvió el identificador del archivo.");
  return result.id;
}

async function sendProviderMedia(deal, buffer, info) {
  if (mockMode) return makeId("mockmedia");
  if (data.settings.whatsappMode === "cloud") {
    const cloudAudioTypes = new Set(["audio/aac", "audio/amr", "audio/mpeg", "audio/mp4", "audio/ogg"]);
    const type = info.kind === "audio" && !cloudAudioTypes.has(info.mimeType)
      ? "document"
      : info.kind === "document" ? "document" : info.kind;
    const uploadInfo = type === "document" && info.kind === "audio"
      ? { ...info, kind: "document", mimeType: "application/octet-stream" }
      : info;
    const mediaId = await uploadCloudMedia(buffer, uploadInfo);
    const object = { id: mediaId };
    if (info.caption && ["image", "video", "document"].includes(type)) object.caption = info.caption;
    if (type === "document") object.filename = info.fileName;
    const result = await sendCloudPayload({ to: normalizePhone(deal.phone), type, [type]: object });
    return result.messages?.[0]?.id || makeId("cloudmedia");
  }
  if (!whatsappSocket || connectionStatus !== "connected") throw new Error("WhatsApp no está conectado.");
  let content;
  if (info.kind === "image") content = { image: buffer, caption: info.caption, mimetype: info.mimeType };
  else if (info.kind === "video") content = { video: buffer, caption: info.caption, mimetype: info.mimeType };
  else if (info.kind === "audio") content = { audio: buffer, mimetype: info.mimeType, ptt: info.ptt && info.mimeType.includes("ogg") };
  else content = { document: buffer, mimetype: info.mimeType, fileName: info.fileName, caption: info.caption };
  const sent = await whatsappSocket.sendMessage(deal.jid, content);
  return sent?.key?.id || makeId("qrmedia");
}

async function downloadCloudAttachment(media) {
  if (!media?.id) return null;
  try {
    const metadata = await cloudFetch(media.id);
    if (!metadata.url) return null;
    const response = await fetch(metadata.url, { headers: { Authorization: `Bearer ${data.settings.whatsappApi.accessToken}` } });
    if (!response.ok) throw new Error(`No se pudo descargar el archivo (${response.status}).`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = cleanText(media.mime_type || response.headers.get("content-type"), 160) || "application/octet-stream";
    const kind = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : mimeType.startsWith("audio/") ? "audio" : "document";
    const info = {
      kind,
      mimeType,
      fileName: safeFileName(media.filename || `${kind}-${Date.now()}${extensionForMime(mimeType, kind)}`),
      caption: cleanText(media.caption, 1000),
      duration: 0,
      ptt: Boolean(media.voice),
    };
    return saveAttachmentBuffer(buffer, info);
  } catch (error) {
    console.error("[cloud media]", error?.message || error);
    return null;
  }
}

async function processCloudWebhook(body) {
  const messages = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const names = new Map((value.contacts || []).map((contact) => [contact.wa_id, contact.profile?.name || ""]));
      for (const item of value.messages || []) messages.push({ item, name: names.get(item.from) || "" });
    }
  }
  for (const { item, name } of messages) {
    if (!item?.id || seenMessages.has(item.id)) continue;
    rememberSeen(item.id);
    const phone = normalizePhone(item.from);
    const jid = `${phone}@s.whatsapp.net`;
    const media = item.image || item.video || item.audio || item.document || null;
    const attachment = media ? await downloadCloudAttachment(media) : null;
    const text = cleanText(item.text?.body || item.button?.text || item.interactive?.button_reply?.title || media?.caption || messageLabel(attachment), 6000);
    const { deal, created } = recordIncoming(data, {
      jid,
      name,
      text: text || "Archivo recibido",
      messageId: item.id,
      attachment,
      now: Number(item.timestamp || 0) * 1000 || Date.now(),
    });
    addActivity(data, created ? `Nueva negociación creada para ${deal.name}.` : `${deal.name} espera una respuesta.`, created ? "success" : "warning");
    if (data.settings.botEnabled && deal.botActive && text) void maybeReplyWithBot(deal, text);
  }
  if (messages.length) await store.save();
}

async function sendBotMessage(deal, text, origin = "bot") {
  if (mockMode) {
    const id = makeId("mockbot");
    recordBotOutgoing(data, { deal, text, messageId: id, origin });
    await store.save();
    return id;
  }
  const id = await sendProviderText(deal, text);
  rememberSeen(id);
  recordBotOutgoing(data, { deal, text, messageId: id, origin });
  await store.save();
  return id;
}

async function maybeReplyWithBot(deal, text) {
  if (!data.settings.botEnabled || !deal.botActive) return;
  if (!data.settings.apiKey) {
    addLog(`Mensaje de ${deal.name}: falta configurar la clave de IA.`, "warning");
    return;
  }
  try {
    addLog(`El bot está preparando una respuesta para ${deal.name}.`);
    if (!mockMode && data.settings.whatsappMode !== "cloud") await whatsappSocket?.sendPresenceUpdate("composing", deal.jid);
    const reply = await createAiReply(deal, text);
    if (reply) await sendBotMessage(deal, reply, "bot");
    if (!mockMode && data.settings.whatsappMode !== "cloud") await whatsappSocket?.sendPresenceUpdate("paused", deal.jid);
    addLog(`Respuesta automática enviada a ${deal.name}.`, "success");
  } catch (error) {
    if (!mockMode && data.settings.whatsappMode !== "cloud") await whatsappSocket?.sendPresenceUpdate("paused", deal.jid).catch(() => {});
    addLog(`No se pudo responder automáticamente a ${deal.name}.`, "warning");
    console.error("[bot]", error?.message || error);
  }
}

async function handleIncomingMessages(event, { history = false } = {}) {
  const source = history ? "history" : event.type;
  if (!["notify", "append", "history"].includes(source)) return;
  const botQueue = new Map();
  let imported = 0;
  const messages = (event.messages || [])
    .slice()
    .sort((a, b) => messageTime(a.messageTimestamp) - messageTime(b.messageTimestamp));
  for (const item of messages) {
    const jid = item.key?.remoteJid || "";
    const messageId = item.key?.id || "";
    if (
      !isDirectChat(jid) ||
      !shouldImportMessage(item, source) ||
      isKnownMessage(messageId)
    ) {
      continue;
    }
    rememberSeen(messageId);
    const info = mediaInfo(item.message);
    const text = extractText(item.message) || messageLabel(info);
    if (!text && !info) continue;
    const attachment = info ? await downloadIncomingAttachment(item, info) : null;
    const occurredAt = messageTime(item.messageTimestamp);
    const historical = source !== "notify" || Date.now() - occurredAt >= 3 * 60 * 1000;

    if (item.key?.fromMe) {
      if (data.botMessageIds.includes(messageId)) continue;
      const deal = recordHumanOutgoing(data, {
        jid,
        name: item.pushName,
        text,
        messageId,
        attachment,
        now: occurredAt,
      });
      addActivity(
        data,
        `${deal.name} pasó a Contactado y el bot salió de la conversación.`,
        "success",
      );
      if (historical) imported += 1;
      continue;
    }

    const { deal, created } = recordIncoming(data, {
      jid,
      name: item.pushName,
      text,
      messageId,
      attachment,
      historical,
      now: occurredAt,
    });
    addActivity(
      data,
      created
        ? `Nueva negociación creada para ${deal.name}.`
        : `${deal.name} espera una respuesta.`,
      created ? "success" : "warning",
    );
    if (historical) imported += 1;
    botQueue.set(deal.id, { deal, text, occurredAt });
  }
  if (imported > 0) {
    data.sync.lastImportAt = timestamp();
    data.sync.lastImportCount = imported;
    data.sync.totalImported = Number(data.sync.totalImported || 0) + imported;
    addActivity(
      data,
      `${imported} mensaje${imported === 1 ? " pendiente recuperado" : "s pendientes recuperados"}.`,
      "success",
    );
  }
  if (history) data.sync.lastHistorySyncAt = timestamp();
  if (messages.length) await store.save();
  for (const { deal, text, occurredAt } of botQueue.values()) {
    if (deal.lastDirection !== "incoming") continue;
    const recentBacklog = Date.now() - occurredAt <= 24 * 60 * 60 * 1000;
    if (source === "notify" || (source === "append" && recentBacklog)) {
      void maybeReplyWithBot(deal, text);
    }
  }
}

async function handleCalls(calls) {
  let changed = false;
  for (const input of calls || []) {
    const jid = input.chatId || input.callerPn || input.from || "";
    if (!isDirectChat(jid) || input.isGroup) continue;
    const call = recordCall(data, { ...input, jid, direction: "incoming" }, input.date || Date.now());
    changed = true;
    if (input.status === "offer") {
      addActivity(
        data,
        `${call.isVideo ? "Videollamada" : "Llamada"} entrante de ${call.name}. Atendela desde WhatsApp.`,
        "warning",
      );
    } else if (input.status === "timeout") {
      addActivity(data, `Llamada perdida de ${call.name}.`, "warning");
    }
  }
  if (changed) await store.save();
}

async function startMockConnection() {
  connectionStatus = "starting";
  lastError = null;
  qrDataUrl = await QRCode.toDataURL(`whatsbot-crm-mock-${Date.now()}`, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
    color: { dark: "#10261eff", light: "#ffffffff" },
  });
  connectionStatus = "qr";
  addLog("Código QR de prueba generado.", "success");
}

async function startConnection() {
  if (mockMode) return startMockConnection();
  if (["starting", "qr", "connected"].includes(connectionStatus)) return;
  if (startingPromise) return startingPromise;

  startingPromise = (async () => {
    connectionStatus = "starting";
    qrDataUrl = null;
    lastError = null;
    manualLogout = false;
    syncCutoffAt = Date.parse(data.sync?.lastActiveAt) || Date.now() - firstConnectionHistoryMs;
    historySyncing = false;
    clearTimeout(reconnectTimer);
    addLog("Solicitando vinculación a WhatsApp…");

    try {
      const baileys = await import("@whiskeysockets/baileys");
      const makeWASocket = baileys.default;
      const {
        Browsers,
        DisconnectReason,
        downloadMediaMessage: baileysDownloadMediaMessage,
        fetchLatestBaileysVersion,
        useMultiFileAuthState,
      } = baileys;
      downloadMediaMessage = baileysDownloadMediaMessage;
      await mkdir(authDirectory, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(authDirectory);
      const { version } = await fetchLatestBaileysVersion();

      whatsappSocket = makeWASocket({
        auth: state,
        version,
        browser: Browsers.windows("WhatsBot CRM"),
        logger: whatsappLogger,
        markOnlineOnConnect: false,
        syncFullHistory: true,
        generateHighQualityLinkPreview: false,
        getMessage: async () => undefined,
      });

      whatsappSocket.ev.on("creds.update", saveCreds);
      whatsappSocket.ev.on("messages.upsert", (event) => {
        void handleIncomingMessages(event);
      });
      whatsappSocket.ev.on("messaging-history.set", (event) => {
        historySyncing = true;
        void handleIncomingMessages({ ...event, type: "history" }, { history: true })
          .finally(() => { historySyncing = false; });
      });
      whatsappSocket.ev.on("call", (calls) => {
        void handleCalls(calls);
      });
      whatsappSocket.ev.on("connection.update", async (update) => {
        const { connection, qr, lastDisconnect } = update;
        if (qr) {
          qrDataUrl = await QRCode.toDataURL(qr, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 360,
            color: { dark: "#10261eff", light: "#ffffffff" },
          });
          connectionStatus = "qr";
          lastError = null;
          addLog("Código QR listo para escanear.", "success");
        }
        if (connection === "open") {
          connectionStatus = "connected";
          historySyncing = true;
          qrDataUrl = null;
          connectedAccount = formatAccount(whatsappSocket?.user?.id);
          lastError = null;
          addLog("WhatsApp conectado; recuperando mensajes pendientes.", "success");
          setTimeout(() => { historySyncing = false; }, 12_000).unref();
        }
        if (connection === "close") {
          const statusCode =
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.statusCode ||
            lastDisconnect?.error?.data?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          whatsappSocket = null;
          qrDataUrl = null;
          connectedAccount = null;
          historySyncing = false;
          data.sync.lastActiveAt = timestamp();
          void store.save();
          if (manualLogout || loggedOut) {
            connectionStatus = "disconnected";
            addLog("La cuenta fue desvinculada.");
            return;
          }
          connectionStatus = "starting";
          addLog("La conexión se interrumpió; reintentando…", "warning");
          reconnectTimer = setTimeout(() => {
            connectionStatus = "disconnected";
            void startConnection();
          }, 2500);
        }
      });
    } catch (error) {
      connectionStatus = "error";
      qrDataUrl = null;
      whatsappSocket = null;
      lastError = "No se pudo iniciar la vinculación. Volvé a intentarlo.";
      addLog(lastError, "warning");
      console.error("[whatsapp]", error?.message || error);
    } finally {
      startingPromise = null;
    }
  })();
  return startingPromise;
}

async function disconnect() {
  manualLogout = true;
  clearTimeout(reconnectTimer);
  try {
    if (whatsappSocket) await whatsappSocket.logout();
  } catch {
    // Remove the local credentials even when WhatsApp is unavailable.
  }
  whatsappSocket = null;
  await rm(authDirectory, { recursive: true, force: true });
  connectionStatus = "disconnected";
  qrDataUrl = null;
  connectedAccount = null;
  lastError = null;
  historySyncing = false;
  data.sync.lastActiveAt = timestamp();
  addLog("Sesión de WhatsApp eliminada.");
}

function cookieValue(request, name) {
  const cookies = String(request.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function currentSession(request) {
  const token = cookieValue(request, "whatsbot_session");
  const session = sessions.get(token);
  if (!token || !session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  const user = data.users.find((entry) => entry.id === session.userId && entry.active !== false);
  if (!user) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  session.lastSeenAt = Date.now();
  return { token, session, user };
}

function currentUser(request) {
  return currentSession(request)?.user || null;
}

function isAuthenticated(request) {
  return Boolean(currentSession(request));
}

function requireAdmin(request, response, next) {
  const user = currentUser(request);
  if (!user || user.role !== "admin") return response.status(403).json({ error: "Solo un administrador puede realizar esta acción." });
  request.currentUser = user;
  return next();
}

function requireManagerOrAdmin(request, response, next) {
  const user = currentUser(request);
  if (!user || !["admin", "manager"].includes(user.role)) return response.status(403).json({ error: "Esta acción requiere permisos de gerente o administrador." });
  request.currentUser = user;
  return next();
}

function paraguayDateKey(value = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) digits = `595${digits.slice(1)}`;
  if (!digits.startsWith("595") && digits.length <= 10) digits = `595${digits}`;
  return digits;
}

function ensureDealOwnership(deal, user, { claim = false } = {}) {
  if (!deal || !user) throw new Error("Negociación no encontrada.");
  if (!deal.ownerUserId && claim) {
    deal.ownerUserId = user.id;
    deal.ownerName = user.name;
    deal.updatedAt = timestamp();
    const client = findClient(data, deal.clientId);
    if (client) { client.ownerUserId = user.id; client.ownerName = user.name; client.updatedAt = timestamp(); }
    for (const related of data.deals.filter((entry) => entry.clientId && entry.clientId === deal.clientId && !entry.ownerUserId)) { related.ownerUserId = user.id; related.ownerName = user.name; }
    addActivity(data, `${user.name} tomó la conversación de ${deal.name}.`, "success");
  }
  if (deal.ownerUserId && deal.ownerUserId !== user.id && user.role !== "admin") {
    throw new Error(`Esta conversación pertenece a ${deal.ownerName || "otro asesor"}.`);
  }
  return deal;
}

function isAllowedOrigin(origin, request = null) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const requestHost = String(request?.headers?.host || "").toLowerCase();
    if (requestHost && url.host.toLowerCase() === requestHost) return true;
    return ["127.0.0.1", "localhost", "terminal.local"].includes(url.hostname);
  } catch {
    return false;
  }
}

function openBrowser(url) {
  if (process.env.NO_OPEN === "1") return;
  let command;
  let args;
  if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

function validateAutomationSettings(input) {
  const result = {};
  if (input.followup && typeof input.followup === "object") {
    result.followup = {
      enabled: input.followup.enabled !== false,
      value: Math.max(1, Number(input.followup.value) || 1),
      unit: ["minutes", "hours", "days"].includes(input.followup.unit)
        ? input.followup.unit
        : "minutes",
      message: cleanText(input.followup.message, 1000),
    };
    if (!result.followup.message) throw new Error("Ingresá el mensaje de seguimiento.");
  }
  if (input.autoClose && typeof input.autoClose === "object") {
    result.autoClose = {
      enabled: input.autoClose.enabled !== false,
      value: Math.max(1, Number(input.autoClose.value) || 1),
      unit: ["minutes", "hours", "days"].includes(input.autoClose.unit)
        ? input.autoClose.unit
        : "hours",
    };
  }
  if (input.heatMinutes && typeof input.heatMinutes === "object") {
    const values = [
      Number(input.heatMinutes.warm),
      Number(input.heatMinutes.hot),
      Number(input.heatMinutes.red),
      Number(input.heatMinutes.critical),
    ].map((value) => Math.max(1, value || 1));
    if (!(values[0] < values[1] && values[1] < values[2] && values[2] < values[3])) {
      throw new Error("Los tiempos de color deben aumentar de menor a mayor.");
    }
    result.heatMinutes = {
      warm: values[0],
      hot: values[1],
      red: values[2],
      critical: values[3],
    };
  }
  return result;
}

function decodeHeader(value, fallback = "") {
  try {
    return decodeURIComponent(String(value || fallback));
  } catch {
    return String(value || fallback);
  }
}

function outgoingMediaInfo(request) {
  const mimeType = cleanText(request.headers["content-type"], 160).split(";")[0].toLowerCase() || "application/octet-stream";
  const requestedKind = cleanText(request.headers["x-media-kind"], 20).toLowerCase();
  const safeImages = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  let kind = "document";
  if (safeImages.has(mimeType)) kind = "image";
  else if (mimeType.startsWith("video/")) kind = "video";
  else if (mimeType.startsWith("audio/")) kind = "audio";
  if (["image", "video", "audio", "document"].includes(requestedKind) && requestedKind === kind) {
    kind = requestedKind;
  }
  const fallback = `${kind}-${Date.now()}${extensionForMime(mimeType, kind)}`;
  return {
    kind,
    mimeType,
    fileName: safeFileName(decodeHeader(request.headers["x-file-name"], fallback), fallback),
    caption: cleanText(decodeHeader(request.headers["x-caption"]), 1000),
    duration: Math.max(0, Number(request.headers["x-duration"]) || 0),
    ptt: request.headers["x-voice-note"] === "1",
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === "," || char === ";") { row.push(cell.trim()); cell = ""; }
    else if (char === "\n") { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else if (char !== "\r") cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function headerKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",;\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvText(headers, rows) {
  return `\uFEFF${headers.map(csvEscape).join(",")}\r\n${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;
}

const dataFormats = {
  stock: {
    file: "stock",
    headers: ["codigo", "nombre", "descripcion", "stock", "stock_minimo", "precio", "activo"],
    example: [["SKU001", "Producto de ejemplo", "Descripción", "25", "5", "150000", "SI"]],
  },
  contacts: {
    file: "contactos",
    headers: ["id", "nombre", "telefono", "documento", "correo", "empresa", "ciudad", "direccion", "etiquetas", "notas", "responsable_usuario"],
    example: [["", "Cliente Ejemplo", "0981123456", "", "cliente@empresa.com", "Empresa SA", "Asunción", "", "VIP,Mayorista", "", ""]],
  },
  users: {
    file: "usuarios",
    headers: ["usuario", "nombre", "rol", "limite_clientes_dia", "activo", "password"],
    example: [["vendedor1", "Vendedor Uno", "agente", "30", "SI", "Cambiar123*"]],
  },
  replies: {
    file: "respuestas-rapidas",
    headers: ["titulo", "atajo", "categoria", "respuesta", "activo"],
    example: [["Sucursales", "/sucursales", "Información", "Tenemos sucursales en...", "SI"]],
  },
};

function csvBoolean(value, fallback = true) {
  const normalized = cleanText(value, 20).toLowerCase();
  if (!normalized) return fallback;
  return !["no", "false", "0", "inactivo", "n"].includes(normalized);
}

function brandingResponse() {
  const brand = data.settings.branding || {};
  return {
    systemName: cleanText(brand.systemName, 80) || "WhatsBot CRM",
    shortName: cleanText(brand.shortName, 40) || "WhatsBot",
    subtitle: cleanText(brand.subtitle, 40) || "CRM LOCAL",
    primaryColor: /^#[0-9a-fA-F]{6}$/.test(brand.primaryColor || "") ? brand.primaryColor : "#143c2f",
    accentColor: /^#[0-9a-fA-F]{6}$/.test(brand.accentColor || "") ? brand.accentColor : "#b9d977",
    backgroundColor: /^#[0-9a-fA-F]{6}$/.test(brand.backgroundColor || "") ? brand.backgroundColor : "#f4f2ea",
    logoUrl: brand.logoFileName ? "/api/branding/logo" : "",
  };
}

async function backupEntries() {
  await store.save();
  const files = await listFilesRecursive(dataDirectory);
  const entries = [];
  for (const file of files) entries.push({ name: file.relative, data: await readFile(file.absolute) });
  entries.push({
    name: "BACKUP-INFO.json",
    data: Buffer.from(JSON.stringify({ product: "WhatsBot CRM", version: 5, createdAt: timestamp(), includes: ["base de datos", "archivos multimedia", "sesión WhatsApp QR", "configuración", "usuarios", "credenciales cifradas/configuradas"] }, null, 2)),
  });
  return entries;
}

function visibleContactsFor(user) {
  if (canSeeAll(user)) return data.clients || [];
  return (data.clients || []).filter((client) => !client.ownerUserId || client.ownerUserId === user.id);
}


const app = express();
app.disable("x-powered-by");
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Resource-Policy", "same-site");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'",
  );
  const origin = request.headers.origin;
  if (origin && isAllowedOrigin(origin, request)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(origin, request)) return response.sendStatus(403);
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return response.sendStatus(204);
  }
  if (origin && !isAllowedOrigin(origin, request)) return response.sendStatus(403);
  return next();
});
const jsonParser = express.json({ limit: "128kb" });
app.use((request, response, next) => {
  if (request.method === "POST" && /^\/api\/deals\/[^/]+\/media$/.test(request.path)) {
    return next();
  }
  return jsonParser(request, response, next);
});
app.use(express.static(publicDirectory, { extensions: ["html"] }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, mockMode });
});

app.get("/api/auth/status", (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  const user = currentUser(request);
  response.json({ authenticated: Boolean(user), user: user ? { id: user.id, username: user.username, name: user.name, role: user.role } : null });
});

app.post("/api/auth/login", (request, response) => {
  const username = cleanText(request.body?.username, 80).toLowerCase();
  const password = String(request.body?.password || "");
  const user = data.users.find((entry) => entry.username.toLowerCase() === username && entry.active !== false);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return response.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + 12 * 60 * 60 * 1000, lastSeenAt: Date.now() });
  response.setHeader(
    "Set-Cookie",
    `whatsbot_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
  );
  return response.json({ authenticated: true, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
});

app.post("/api/auth/logout", (request, response) => {
  sessions.delete(cookieValue(request, "whatsbot_session"));
  response.setHeader(
    "Set-Cookie",
    "whatsbot_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
  );
  response.json({ authenticated: false });
});

app.get("/api/whatsapp/webhook", (request, response) => {
  const mode = request.query["hub.mode"];
  const token = request.query["hub.verify_token"];
  const challenge = request.query["hub.challenge"];
  if (mode === "subscribe" && token && token === data.settings.whatsappApi?.verifyToken) return response.status(200).send(String(challenge || ""));
  return response.sendStatus(403);
});

app.post("/api/whatsapp/webhook", (request, response) => {
  response.sendStatus(200);
  void processCloudWebhook(request.body).catch((error) => console.error("[cloud webhook]", error?.message || error));
});

app.get("/api/mobile/access", async (_request, response) => {
  const urls = lanAddresses();
  const entries = await Promise.all(urls.map(async (url) => ({
    url,
    qr: await QRCode.toDataURL(url, { margin: 1, width: 280 }),
  })));
  response.json({ entries, port, note: "Conectá el teléfono a la misma red Wi-Fi." });
});

app.get("/api/branding/public", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json(brandingResponse());
});

app.get("/api/branding/logo", (_request, response) => {
  const fileName = path.basename(data.settings.branding?.logoFileName || "");
  if (!fileName) return response.sendStatus(404);
  const ext = path.extname(fileName).toLowerCase();
  const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[ext] || "application/octet-stream";
  response.setHeader("Content-Type", mime);
  response.setHeader("Cache-Control", "no-store");
  return response.sendFile(path.join(dataDirectory, "branding", fileName));
});

app.use("/api", (request, response, next) => {
  if (!isAuthenticated(request)) return response.status(401).json({ error: "Iniciá sesión." });
  return next();
});

app.get("/api/state", (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json(stateResponse(request));
});

app.get("/api/reports", (request, response) => {
  const days = Number(request.query.days);
  const user = currentUser(request);
  let ownerUserId = user && !canSeeAll(user) ? user.id : cleanText(request.query.userId, 120);
  if (ownerUserId === "all") ownerUserId = "";
  if (ownerUserId && canSeeAll(user) && !data.users.some((entry) => entry.id === ownerUserId)) ownerUserId = "";
  response.setHeader("Cache-Control", "no-store");
  response.json({ ...buildReports(data, { days, ownerUserId: ownerUserId || null }), scopeUserId: ownerUserId || null });
});

app.get("/api/media/:id", (request, response, next) => {
  const attachment = findAttachment(request.params.id);
  if (!attachment?.available || !attachment.storedName) {
    return response.status(404).json({ error: "El archivo ya no está disponible en este equipo." });
  }
  const filePath = path.join(mediaDirectory, path.basename(attachment.storedName));
  const disposition = attachment.kind === "document" ? "attachment" : "inline";
  response.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
  response.setHeader(
    "Content-Disposition",
    `${disposition}; filename*=UTF-8''${encodeURIComponent(safeFileName(attachment.fileName))}`,
  );
  return response.sendFile(filePath, (error) => {
    if (error && !response.headersSent) next(error);
  });
});

app.get("/api/data/template/:type.csv", (request, response, next) => {
  try {
    const type = cleanText(request.params.type, 40);
    const format = dataFormats[type];
    if (!format) throw new Error("Formato no encontrado.");
    const user = currentUser(request);
    if (type === "users" && user?.role !== "admin") return response.status(403).json({ error: "Solo un administrador puede descargar esta plantilla." });
    if (["stock", "replies"].includes(type) && !canSeeAll(user)) return response.status(403).json({ error: "Esta plantilla requiere permisos de gerente o administrador." });
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="PLANTILLA-${format.file.toUpperCase()}.csv"`);
    response.send(csvText(format.headers, format.example));
  } catch (error) { next(error); }
});

app.get("/api/data/export/:type.csv", (request, response, next) => {
  try {
    const type = cleanText(request.params.type, 40);
    const format = dataFormats[type];
    if (!format) throw new Error("Exportación no encontrada.");
    const user = currentUser(request);
    let rows = [];
    if (type === "stock") {
      if (!canSeeAll(user)) return response.status(403).json({ error: "Esta exportación requiere permisos de gerente o administrador." });
      rows = (data.products || []).map((item) => [item.sku, item.name, item.description || "", item.available || 0, item.minStock || 0, item.price || 0, item.active === false ? "NO" : "SI"]);
    } else if (type === "contacts") {
      rows = visibleContactsFor(user).map((client) => [client.id, client.name || "", client.phone || "", client.document || "", client.email || "", client.company || "", client.city || "", client.address || "", (client.tags || []).join(","), client.notes || "", data.users.find((entry) => entry.id === client.ownerUserId)?.username || ""]);
    } else if (type === "users") {
      if (user?.role !== "admin") return response.status(403).json({ error: "Solo un administrador puede exportar usuarios." });
      rows = (data.users || []).map((entry) => [entry.username, entry.name, entry.role === "agent" ? "agente" : entry.role === "manager" ? "gerente" : "admin", entry.clientDailyLimit || 0, entry.active === false ? "NO" : "SI", ""]);
    } else if (type === "replies") {
      if (!canSeeAll(user)) return response.status(403).json({ error: "Esta exportación requiere permisos de gerente o administrador." });
      rows = (data.quickReplies || []).map((entry) => [entry.title, entry.shortcut, entry.category || "General", entry.body, entry.active === false ? "NO" : "SI"]);
    }
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="EXPORT-${format.file.toUpperCase()}-${paraguayDateKey()}.csv"`);
    response.send(csvText(format.headers, rows));
  } catch (error) { next(error); }
});

app.post("/api/data/import/:type", express.text({ type: () => true, limit: "10mb" }), async (request, response, next) => {
  try {
    const type = cleanText(request.params.type, 40);
    const format = dataFormats[type];
    if (!format) throw new Error("Importación no encontrada.");
    const actor = currentUser(request);
    if (type === "users" && actor.role !== "admin") return response.status(403).json({ error: "Solo un administrador puede importar usuarios." });
    if (["stock", "replies"].includes(type) && !canSeeAll(actor)) return response.status(403).json({ error: "Esta importación requiere permisos de gerente o administrador." });
    const rows = parseCsv(request.body);
    if (rows.length < 2) throw new Error("El CSV debe incluir encabezados y al menos una fila.");
    const headers = rows[0].map(headerKey);
    const col = (...names) => headers.findIndex((value) => names.includes(value));
    let created = 0; let updated = 0; let skipped = 0; const errors = [];

    if (type === "stock") {
      const ix = { sku: col("codigo", "codigoproducto", "sku"), name: col("nombre", "producto"), description: col("descripcion", "detalle"), available: col("stock", "disponible", "cantidad"), minStock: col("stockminimo", "minimo", "minstock"), price: col("precio", "price"), active: col("activo", "active") };
      if (ix.sku < 0 || ix.name < 0) throw new Error("La plantilla necesita Código y Nombre.");
      for (let i = 1; i < rows.length; i += 1) {
        try {
          const row = rows[i]; const sku = cleanText(row[ix.sku], 80); const name = cleanText(row[ix.name], 160);
          if (!sku || !name) { skipped += 1; continue; }
          const existing = data.products.find((item) => item.sku.toLowerCase() === sku.toLowerCase());
          upsertProduct(data, { id: existing?.id, sku, name, description: ix.description >= 0 ? row[ix.description] : existing?.description, available: ix.available >= 0 ? Number(String(row[ix.available]).replace(",", ".")) : existing?.available || 0, minStock: ix.minStock >= 0 ? Number(String(row[ix.minStock]).replace(",", ".")) : existing?.minStock || 0, price: ix.price >= 0 ? Number(String(row[ix.price]).replace(/\./g, "").replace(",", ".")) : existing?.price || 0, active: ix.active >= 0 ? csvBoolean(row[ix.active], existing?.active !== false) : existing?.active !== false });
          existing ? updated += 1 : created += 1;
        } catch (error) { errors.push(`Fila ${i + 1}: ${error.message}`); }
      }
    }

    if (type === "contacts") {
      const ix = { id: col("id"), name: col("nombre", "name"), phone: col("telefono", "phone", "whatsapp"), document: col("documento", "ruc", "ci"), email: col("correo", "email"), company: col("empresa", "company"), city: col("ciudad", "city"), address: col("direccion", "address"), tags: col("etiquetas", "tags"), notes: col("notas", "notes"), owner: col("responsableusuario", "responsable", "owner") };
      if (ix.name < 0 || ix.phone < 0) throw new Error("La plantilla necesita Nombre y Teléfono.");
      const today = paraguayDateKey();
      for (let i = 1; i < rows.length; i += 1) {
        try {
          const row = rows[i]; const phone = normalizePhone(row[ix.phone]); const name = cleanText(row[ix.name], 120);
          if (!phone || phone.length < 10 || phone.length > 15 || !name) { skipped += 1; continue; }
          const jid = `${phone}@s.whatsapp.net`;
          let client = ix.id >= 0 && row[ix.id] ? findClient(data, cleanText(row[ix.id], 120)) : data.clients.find((entry) => entry.jid === jid || normalizePhone(entry.phone) === phone);
          const wasExisting = Boolean(client);
          if (client && !canSeeAll(actor) && client.ownerUserId && client.ownerUserId !== actor.id) throw new Error("Ese cliente pertenece a otro agente.");
          if (!client && actor.role === "agent") {
            const used = data.clientLoads.filter((entry) => entry.userId === actor.id && entry.date === today).length;
            const limit = Math.max(1, Number(actor.clientDailyLimit) || 1);
            if (used >= limit) throw new Error(`Límite diario de ${limit} clientes alcanzado.`);
          }
          let deal = findOpenDeal(data, jid);
          if (!deal) deal = createDeal(data, { jid, name });
          client = findClient(data, deal.clientId) || client;
          if (!client) throw new Error("No se pudo crear la ficha del cliente.");
          let owner = null;
          if (actor.role === "admin" && ix.owner >= 0 && cleanText(row[ix.owner], 80)) owner = data.users.find((entry) => entry.username.toLowerCase() === cleanText(row[ix.owner], 80).toLowerCase() && entry.active !== false) || null;
          if (!owner && actor.role === "agent") owner = actor;
          if (!owner && client.ownerUserId) owner = data.users.find((entry) => entry.id === client.ownerUserId) || null;
          if (owner) { client.ownerUserId = owner.id; client.ownerName = owner.name; deal.ownerUserId = owner.id; deal.ownerName = owner.name; }
          updateClient(data, client.id, { name, document: ix.document >= 0 ? row[ix.document] : client.document, email: ix.email >= 0 ? row[ix.email] : client.email, company: ix.company >= 0 ? row[ix.company] : client.company, city: ix.city >= 0 ? row[ix.city] : client.city, address: ix.address >= 0 ? row[ix.address] : client.address, notes: ix.notes >= 0 ? row[ix.notes] : client.notes, tags: ix.tags >= 0 ? String(row[ix.tags] || "").split(/[,|]/).map((v) => v.trim()).filter(Boolean) : client.tags });
          deal.source = "csv"; deal.createdByUserId = actor.id;
          if (!wasExisting && actor.role === "agent") data.clientLoads.push({ id: makeId("clientload"), userId: actor.id, dealId: deal.id, date: today, at: timestamp() });
          wasExisting ? updated += 1 : created += 1;
        } catch (error) { errors.push(`Fila ${i + 1}: ${error.message}`); }
      }
    }

    if (type === "users") {
      const ix = { username: col("usuario", "username"), name: col("nombre", "name"), role: col("rol", "role"), limit: col("limiteclientesdia", "limite", "clientdailylimit"), active: col("activo", "active"), password: col("password", "contrasena", "clave") };
      if (ix.username < 0 || ix.name < 0) throw new Error("La plantilla necesita Usuario y Nombre.");
      for (let i = 1; i < rows.length; i += 1) {
        try {
          const row = rows[i]; const username = cleanText(row[ix.username], 80).toLowerCase(); const name = cleanText(row[ix.name], 120);
          if (!username || !name || !/^[a-z0-9._-]{3,80}$/.test(username)) { skipped += 1; continue; }
          let user = data.users.find((entry) => entry.username.toLowerCase() === username); const existed = Boolean(user);
          const rawRole = ix.role >= 0 ? cleanText(row[ix.role], 30).toLowerCase() : "agent";
          const role = ["admin", "administrador"].includes(rawRole) ? "admin" : ["manager", "gerente"].includes(rawRole) ? "manager" : "agent";
          const password = ix.password >= 0 ? String(row[ix.password] || "") : "";
          if (!user) {
            if (password.length < 8) throw new Error("Para crear un usuario, la contraseña debe tener al menos 8 caracteres.");
            user = { id: makeId("user"), username, name, role, passwordHash: hashPassword(password), active: ix.active >= 0 ? csvBoolean(row[ix.active]) : true, clientDailyLimit: Math.max(1, Number(ix.limit >= 0 ? row[ix.limit] : 30) || 30), createdAt: timestamp(), updatedAt: timestamp() };
            data.users.push(user);
          } else {
            user.name = name; user.role = role; user.active = ix.active >= 0 ? csvBoolean(row[ix.active], user.active !== false) : user.active !== false; user.clientDailyLimit = Math.max(1, Number(ix.limit >= 0 ? row[ix.limit] : user.clientDailyLimit) || 30); if (password) { if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres."); user.passwordHash = hashPassword(password); } user.updatedAt = timestamp();
          }
          existed ? updated += 1 : created += 1;
        } catch (error) { errors.push(`Fila ${i + 1}: ${error.message}`); }
      }
    }

    if (type === "replies") {
      const ix = { title: col("titulo", "title"), shortcut: col("atajo", "shortcut"), category: col("categoria", "category"), body: col("respuesta", "body", "mensaje"), active: col("activo", "active") };
      if (ix.title < 0 || ix.body < 0) throw new Error("La plantilla necesita Título y Respuesta.");
      for (let i = 1; i < rows.length; i += 1) {
        try {
          const row = rows[i]; const title = cleanText(row[ix.title], 120); const body = cleanText(row[ix.body], 3000); if (!title || !body) { skipped += 1; continue; }
          const shortcut = ix.shortcut >= 0 ? cleanText(row[ix.shortcut], 40) : "";
          let reply = data.quickReplies.find((entry) => shortcut && entry.shortcut.toLowerCase() === shortcut.toLowerCase()) || data.quickReplies.find((entry) => entry.title.toLowerCase() === title.toLowerCase()); const existed = Boolean(reply);
          if (!reply) { reply = { id: makeId("reply"), createdAt: timestamp(), order: data.quickReplies.length }; data.quickReplies.push(reply); }
          Object.assign(reply, { title, shortcut, category: ix.category >= 0 ? cleanText(row[ix.category], 80) || "General" : reply.category || "General", body, active: ix.active >= 0 ? csvBoolean(row[ix.active], reply.active !== false) : reply.active !== false, updatedAt: timestamp() });
          existed ? updated += 1 : created += 1;
        } catch (error) { errors.push(`Fila ${i + 1}: ${error.message}`); }
      }
    }

    if (data.clientLoads.length > 10000) data.clientLoads.splice(0, data.clientLoads.length - 10000);
    addActivity(data, `${actor.name} importó ${format.file}: ${created} nuevos, ${updated} actualizados.`, "success");
    await store.save();
    response.json({ ...stateResponse(request), importResult: { type, created, updated, skipped, errors: errors.slice(0, 50) } });
  } catch (error) { next(error); }
});

app.get("/api/backup/export", requireAdmin, async (_request, response, next) => {
  try {
    const zip = createStoredZip(await backupEntries());
    response.setHeader("Content-Type", "application/zip");
    response.setHeader("Content-Disposition", `attachment; filename="WhatsBot-CRM-Backup-${paraguayDateKey()}.zip"`);
    response.setHeader("Content-Length", String(zip.length));
    response.send(zip);
  } catch (error) { next(error); }
});

app.post("/api/backup/import", express.raw({ type: () => true, limit: "512mb" }), requireAdmin, async (request, response, next) => {
  const tempDirectory = `${dataDirectory}.restore-${Date.now()}`;
  try {
    if (!Buffer.isBuffer(request.body) || request.body.length < 22) throw new Error("Seleccioná un respaldo ZIP válido.");
    const entries = parseStoredZip(request.body);
    const dbEntry = entries.find((entry) => entry.name === "whatsbot-crm.json");
    if (!dbEntry) throw new Error("El respaldo no contiene la base de datos de WhatsBot CRM.");
    const restored = normalizeData(JSON.parse(dbEntry.data.toString("utf8")));
    await rm(tempDirectory, { recursive: true, force: true });
    await mkdir(tempDirectory, { recursive: true });
    for (const entry of entries) {
      if (entry.name === "BACKUP-INFO.json") continue;
      const destination = path.join(tempDirectory, ...entry.name.split("/"));
      const relative = path.relative(tempDirectory, destination);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("El respaldo contiene rutas no permitidas.");
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, entry.data, { mode: 0o600 });
    }
    if (whatsappSocket || connectionStatus !== "disconnected") await disconnect();
    await rm(dataDirectory, { recursive: true, force: true });
    await rename(tempDirectory, dataDirectory);
    for (const key of Object.keys(data)) delete data[key];
    Object.assign(data, restored);
    store.data = data;
    await store.save();
    connectionStatus = "disconnected"; qrDataUrl = null; connectedAccount = null; lastError = null; manualLogout = false;
    addActivity(data, "Respaldo completo importado correctamente.", "success");
    await store.save();
    response.json({ imported: true, message: "Respaldo restaurado. Volvé a iniciar sesión para cargar la información restaurada." });
    sessions.clear();
    if (!mockMode && data.settings.whatsappMode !== "cloud" && existsSync(path.join(authDirectory, "creds.json"))) setTimeout(() => void startConnection(), 500);
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
    next(error);
  }
});

app.post("/api/branding", requireAdmin, async (request, response, next) => {
  try {
    const input = request.body || {};
    const brand = data.settings.branding || (data.settings.branding = {});
    if (typeof input.systemName === "string") brand.systemName = cleanText(input.systemName, 80) || "WhatsBot CRM";
    if (typeof input.shortName === "string") brand.shortName = cleanText(input.shortName, 40) || brand.systemName || "WhatsBot";
    if (typeof input.subtitle === "string") brand.subtitle = cleanText(input.subtitle, 40) || "CRM LOCAL";
    for (const field of ["primaryColor", "accentColor", "backgroundColor"]) {
      if (typeof input[field] === "string") {
        if (!/^#[0-9a-fA-F]{6}$/.test(input[field])) throw new Error("Los colores deben estar en formato hexadecimal, por ejemplo #143C2F.");
        brand[field] = input[field].toUpperCase();
      }
    }
    addActivity(data, "Identidad visual del sistema actualizada.", "success");
    await store.save();
    response.json({ ...stateResponse(request), branding: brandingResponse() });
  } catch (error) { next(error); }
});

app.post("/api/branding/logo", express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "2mb" }), requireAdmin, async (request, response, next) => {
  try {
    if (!Buffer.isBuffer(request.body) || !request.body.length) throw new Error("Seleccioná una imagen PNG, JPG o WEBP de hasta 2 MB.");
    const mime = String(request.headers["content-type"] || "").split(";")[0].toLowerCase();
    const ext = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" }[mime];
    if (!ext) throw new Error("Formato de logo no permitido. Usá PNG, JPG o WEBP.");
    const brandingDirectory = path.join(dataDirectory, "branding");
    await mkdir(brandingDirectory, { recursive: true });
    for (const oldExt of [".png", ".jpg", ".jpeg", ".webp"]) await unlink(path.join(brandingDirectory, `logo${oldExt}`)).catch(() => {});
    const fileName = `logo${ext}`;
    await writeFile(path.join(brandingDirectory, fileName), request.body, { mode: 0o600 });
    data.settings.branding.logoFileName = fileName;
    addActivity(data, "Logo del sistema actualizado.", "success");
    await store.save();
    response.json({ ...stateResponse(request), branding: brandingResponse() });
  } catch (error) { next(error); }
});

app.delete("/api/branding/logo", requireAdmin, async (request, response, next) => {
  try {
    const fileName = path.basename(data.settings.branding?.logoFileName || "");
    if (fileName) await unlink(path.join(dataDirectory, "branding", fileName)).catch(() => {});
    data.settings.branding.logoFileName = "";
    await store.save();
    response.json({ ...stateResponse(request), branding: brandingResponse() });
  } catch (error) { next(error); }
});

app.post("/api/settings", requireAdmin, async (request, response, next) => {
  try {
    const input = request.body || {};
    if (typeof input.instructions === "string") {
      const instructions = cleanText(input.instructions, 12000);
      if (instructions.length < 10) throw new Error("Las instrucciones son demasiado cortas.");
      data.settings.instructions = instructions;
    }
    if (typeof input.model === "string") {
      const model = cleanText(input.model, 100);
      if (!model) throw new Error("Ingresá un modelo válido.");
      data.settings.model = model;
    }
    if (typeof input.apiKey === "string" && input.apiKey.trim()) {
      data.settings.apiKey = input.apiKey.trim();
    }
    if (input.clearApiKey === true) data.settings.apiKey = "";
    if (typeof input.botEnabled === "boolean") data.settings.botEnabled = input.botEnabled;
    if (typeof input.botCanReserve === "boolean") data.settings.botCanReserve = input.botCanReserve;
    if (typeof input.whatsappMode === "string") {
      const mode = input.whatsappMode === "cloud" ? "cloud" : "qr";
      data.settings.whatsappMode = mode;
      if (mode === "cloud" && whatsappSocket) await disconnect();
    }
    if (input.whatsappApi && typeof input.whatsappApi === "object") {
      const config = input.whatsappApi;
      if (typeof config.phoneNumberId === "string") data.settings.whatsappApi.phoneNumberId = cleanText(config.phoneNumberId, 80);
      if (typeof config.businessAccountId === "string") data.settings.whatsappApi.businessAccountId = cleanText(config.businessAccountId, 80);
      if (typeof config.apiVersion === "string") data.settings.whatsappApi.apiVersion = cleanText(config.apiVersion, 20) || "v23.0";
      if (typeof config.accessToken === "string" && config.accessToken.trim()) data.settings.whatsappApi.accessToken = config.accessToken.trim();
      if (typeof config.verifyToken === "string" && config.verifyToken.trim()) data.settings.whatsappApi.verifyToken = config.verifyToken.trim();
      if (config.clearAccessToken === true) data.settings.whatsappApi.accessToken = "";
      if (config.clearVerifyToken === true) data.settings.whatsappApi.verifyToken = "";
    }
    Object.assign(data.settings, validateAutomationSettings(input));
    addActivity(data, "Configuración guardada.", "success");
    await store.save();
    response.json(stateResponse());
  } catch (error) {
    next(error);
  }
});

app.post("/api/password", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const current = String(request.body?.current || "");
    const password = String(request.body?.password || "");
    if (!user || !verifyPassword(current, user.passwordHash)) {
      return response.status(400).json({ error: "La contraseña actual no coincide." });
    }
    if (password.length < 8 || password.length > 128) throw new Error("La nueva contraseña debe tener entre 8 y 128 caracteres.");
    user.passwordHash = hashPassword(password);
    user.updatedAt = timestamp();
    for (const [token, session] of sessions.entries()) if (session.userId === user.id) sessions.delete(token);
    await store.save();
    response.setHeader("Set-Cookie", "whatsbot_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    response.json({ ok: true, reauth: true });
  } catch (error) { next(error); }
});

app.post("/api/users", requireAdmin, async (request, response, next) => {
  try {
    const username = cleanText(request.body?.username, 80).toLowerCase();
    const name = cleanText(request.body?.name, 120);
    const password = String(request.body?.password || "");
    if (!/^[a-z0-9._-]{3,80}$/.test(username)) throw new Error("El usuario debe tener al menos 3 caracteres y usar letras, números, punto, guion o guion bajo.");
    if (!name) throw new Error("Ingresá el nombre del usuario.");
    if (password.length < 8 || password.length > 128) throw new Error("La contraseña debe tener entre 8 y 128 caracteres.");
    if (data.users.some((entry) => entry.username.toLowerCase() === username)) throw new Error("Ese usuario ya existe.");
    const user = { id: makeId("user"), username, name, role: ["admin", "manager"].includes(request.body?.role) ? request.body.role : "agent", passwordHash: hashPassword(password), active: true, clientDailyLimit: Math.max(1, Math.min(500, Number(request.body?.clientDailyLimit) || 30)), createdAt: timestamp(), updatedAt: timestamp() };
    data.users.push(user);
    addActivity(data, `Usuario ${user.name} creado.`, "success");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.put("/api/users/:id", requireAdmin, async (request, response, next) => {
  try {
    const user = data.users.find((entry) => entry.id === request.params.id);
    if (!user) throw new Error("Usuario no encontrado.");
    if (typeof request.body?.name === "string") user.name = cleanText(request.body.name, 120) || user.name;
    if (typeof request.body?.role === "string") user.role = ["admin", "manager"].includes(request.body.role) ? request.body.role : "agent";
    if (typeof request.body?.active === "boolean") user.active = request.body.active;
    if (request.body?.clientDailyLimit !== undefined) user.clientDailyLimit = Math.max(1, Math.min(500, Number(request.body.clientDailyLimit) || 1));
    if (typeof request.body?.password === "string" && request.body.password) {
      if (request.body.password.length < 8 || request.body.password.length > 128) throw new Error("La contraseña debe tener entre 8 y 128 caracteres.");
      user.passwordHash = hashPassword(request.body.password);
      for (const [token, session] of sessions.entries()) if (session.userId === user.id) sessions.delete(token);
    }
    user.updatedAt = timestamp();
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.post("/api/clients", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const phone = normalizePhone(request.body?.phone);
    const name = cleanText(request.body?.name, 120);
    if (!phone || phone.length < 10 || phone.length > 15) throw new Error("Ingresá un número de WhatsApp válido con código de país.");
    const today = paraguayDateKey();
    const used = data.clientLoads.filter((entry) => entry.userId === user.id && entry.date === today).length;
    const limit = Math.max(1, Number(user.clientDailyLimit) || 1);
    if (used >= limit) throw new Error(`Alcanzaste el límite diario de ${limit} clientes.`);
    const jid = `${phone}@s.whatsapp.net`;
    let deal = findOpenDeal(data, jid);
    if (!deal) deal = createDeal(data, { jid, name: name || `Cliente ${phone}` });
    if (!deal.ownerUserId) { deal.ownerUserId = user.id; deal.ownerName = user.name; }
    else ensureDealOwnership(deal, user);
    const client = findClient(data, deal.clientId);
    if (client) { client.ownerUserId = deal.ownerUserId; client.ownerName = deal.ownerName; if (name) client.name = name; client.updatedAt = timestamp(); }
    deal.source = "manual";
    deal.createdByUserId = user.id;
    data.clientLoads.push({ id: makeId("clientload"), userId: user.id, dealId: deal.id, date: today, at: timestamp() });
    if (data.clientLoads.length > 10000) data.clientLoads.splice(0, data.clientLoads.length - 10000);
    addActivity(data, `${user.name} cargó al cliente ${deal.name}.`, "success");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.post("/api/deals/:id/assign", async (request, response, next) => {
  try {
    const actor = currentUser(request);
    const deal = findDeal(data, request.params.id);
    if (!deal) throw new Error("Negociación no encontrada.");
    const targetId = cleanText(request.body?.userId, 120) || actor.id;
    if (targetId !== actor.id && actor.role !== "admin") throw new Error("Solo un administrador puede reasignar clientes.");
    const target = data.users.find((entry) => entry.id === targetId && entry.active !== false);
    if (!target) throw new Error("Usuario no encontrado.");
    if (deal.ownerUserId && deal.ownerUserId !== actor.id && actor.role !== "admin") throw new Error(`Esta conversación pertenece a ${deal.ownerName || "otro asesor"}.`);
    deal.ownerUserId = target.id;
    deal.ownerName = target.name;
    deal.updatedAt = timestamp();
    const client = findClient(data, deal.clientId);
    if (client) { client.ownerUserId = target.id; client.ownerName = target.name; client.updatedAt = timestamp(); }
    for (const related of data.deals.filter((entry) => entry.clientId && entry.clientId === deal.clientId)) { related.ownerUserId = target.id; related.ownerName = target.name; }
    addActivity(data, `${deal.name} fue asignado a ${target.name}.`, "success");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.get("/api/clients/:id/profile", (request, response, next) => {
  try {
    const user = currentUser(request);
    const client = findClient(data, request.params.id);
    if (!client) throw new Error("Cliente no encontrado.");
    if (!canSeeAll(user) && client.ownerUserId && client.ownerUserId !== user.id) throw new Error("No tenés acceso a este cliente.");
    const negotiations = data.deals
      .filter((deal) => deal.clientId === client.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    response.json({ client, negotiations, owner: data.users.find((entry) => entry.id === client.ownerUserId) || null });
  } catch (error) { next(error); }
});

app.put("/api/clients/:id", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const client = findClient(data, request.params.id);
    if (!client) throw new Error("Cliente no encontrado.");
    if (!canSeeAll(user) && client.ownerUserId && client.ownerUserId !== user.id) throw new Error("No tenés acceso a este cliente.");
    updateClient(data, client.id, request.body || {});
    addActivity(data, `${user.name} actualizó la ficha de ${client.name}.`, "success");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.post("/api/quick-replies", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const title = cleanText(request.body?.title, 120);
    const body = cleanText(request.body?.body, 3000);
    if (!title || !body) throw new Error("Ingresá el título y el texto de la respuesta.");
    const shortcutRaw = cleanText(request.body?.shortcut, 40).replace(/\s+/g, "");
    const shortcut = shortcutRaw ? (shortcutRaw.startsWith("/") ? shortcutRaw : `/${shortcutRaw}`) : "";
    const reply = { id: makeId("reply"), title, shortcut, category: cleanText(request.body?.category, 80) || "General", body, active: request.body?.active !== false, order: data.quickReplies.length, createdAt: timestamp(), updatedAt: timestamp() };
    data.quickReplies.push(reply);
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.put("/api/quick-replies/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const reply = data.quickReplies.find((entry) => entry.id === request.params.id);
    if (!reply) throw new Error("Respuesta rápida no encontrada.");
    if (typeof request.body?.title === "string") reply.title = cleanText(request.body.title, 120) || reply.title;
    if (typeof request.body?.body === "string") reply.body = cleanText(request.body.body, 3000) || reply.body;
    if (typeof request.body?.category === "string") reply.category = cleanText(request.body.category, 80) || "General";
    if (typeof request.body?.shortcut === "string") { const value = cleanText(request.body.shortcut, 40).replace(/\s+/g, ""); reply.shortcut = value ? (value.startsWith("/") ? value : `/${value}`) : ""; }
    if (typeof request.body?.active === "boolean") reply.active = request.body.active;
    reply.updatedAt = timestamp();
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

app.delete("/api/quick-replies/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const index = data.quickReplies.findIndex((entry) => entry.id === request.params.id);
    if (index < 0) throw new Error("Respuesta rápida no encontrada.");
    data.quickReplies.splice(index, 1);
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});

function parseAdminCommand(command) {
  const raw = cleanText(command, 3000);
  const parts = raw.split("|").map((part) => part.trim()).filter(Boolean);
  const lower = raw.toLowerCase();
  if (lower.startsWith("crear usuario") && parts.length >= 6) return { action: "create_user", username: parts[1], name: parts[2], role: parts[3], password: parts[4], limit: parts[5] };
  let match = raw.match(/^reasignar\s+cliente\s+([^\s|]+)\s+(?:a|->)\s+([a-z0-9._-]+)$/i);
  if (match) return { action: "assign_client", clientId: match[1], username: match[2] };
  match = raw.match(/^liberar\s+cliente\s+([^\s|]+)$/i);
  if (match) return { action: "release_client", clientId: match[1] };
  match = raw.match(/^(activar|desactivar)\s+usuario\s+([a-z0-9._-]+)$/i);
  if (match) return { action: "toggle_user", active: match[1].toLowerCase() === "activar", username: match[2] };
  if (lower.startsWith("editar cliente") && parts.length >= 3) {
    const values = {};
    for (const piece of parts.slice(2)) { const [key, ...rest] = piece.split("="); if (key && rest.length) values[headerKey(key)] = rest.join("=").trim(); }
    return { action: "edit_client", clientId: parts[1], values };
  }
  match = raw.match(/^buscar\s+cliente\s+(.+)$/i);
  if (match) return { action: "find_client", query: match[1].trim() };
  match = raw.match(/^ajustar\s+stock\s+([^\s|]+)\s+(-?\d+)\s*(.*)$/i);
  if (match) return { action: "adjust_stock", sku: match[1], quantity: Number(match[2]), note: match[3].trim() || "Ajuste desde asistente admin" };
  return { action: "unknown" };
}

app.post("/api/admin-assistant", requireAdmin, async (request, response, next) => {
  try {
    const actor = request.currentUser;
    const command = cleanText(request.body?.command, 3000);
    if (!command) throw new Error("Escribí una instrucción.");
    const parsed = parseAdminCommand(command);
    let result;
    if (parsed.action === "create_user") {
      const username = cleanText(parsed.username, 80).toLowerCase();
      const name = cleanText(parsed.name, 120);
      const password = String(parsed.password || "");
      const roleMap = { administrador: "admin", admin: "admin", gerente: "manager", manager: "manager", agente: "agent", agent: "agent" };
      const role = roleMap[String(parsed.role || "").toLowerCase()] || "agent";
      if (!/^[a-z0-9._-]{3,80}$/.test(username)) throw new Error("Usuario inválido.");
      if (!name || password.length < 8) throw new Error("Faltan nombre o una contraseña de al menos 8 caracteres.");
      if (data.users.some((entry) => entry.username.toLowerCase() === username)) throw new Error("Ese usuario ya existe.");
      const user = { id: makeId("user"), username, name, role, passwordHash: hashPassword(password), active: true, clientDailyLimit: Math.max(1, Math.min(500, Number(parsed.limit) || 30)), createdAt: timestamp(), updatedAt: timestamp() };
      data.users.push(user);
      result = `Usuario ${user.username} creado como ${role}.`;
    } else if (parsed.action === "assign_client") {
      const client = findClient(data, parsed.clientId);
      const target = data.users.find((entry) => entry.username.toLowerCase() === parsed.username.toLowerCase() && entry.active !== false);
      if (!client || !target) throw new Error("Cliente o usuario no encontrado.");
      client.ownerUserId = target.id; client.ownerName = target.name; client.updatedAt = timestamp();
      for (const deal of data.deals.filter((entry) => entry.clientId === client.id)) { deal.ownerUserId = target.id; deal.ownerName = target.name; deal.updatedAt = timestamp(); }
      result = `${client.name} fue asignado a ${target.name}.`;
    } else if (parsed.action === "release_client") {
      const client = findClient(data, parsed.clientId); if (!client) throw new Error("Cliente no encontrado.");
      client.ownerUserId = null; client.ownerName = ""; client.updatedAt = timestamp();
      for (const deal of data.deals.filter((entry) => entry.clientId === client.id && OPEN_STAGES.has(entry.stage))) { deal.ownerUserId = null; deal.ownerName = ""; deal.updatedAt = timestamp(); }
      result = `${client.name} quedó sin responsable.`;
    } else if (parsed.action === "toggle_user") {
      const user = data.users.find((entry) => entry.username.toLowerCase() === parsed.username.toLowerCase()); if (!user) throw new Error("Usuario no encontrado.");
      if (user.id === actor.id && !parsed.active) throw new Error("No podés desactivar tu propio usuario desde esta consola.");
      user.active = parsed.active; user.updatedAt = timestamp();
      result = `Usuario ${user.username} ${parsed.active ? "activado" : "desactivado"}.`;
    } else if (parsed.action === "edit_client") {
      const client = findClient(data, parsed.clientId); if (!client) throw new Error("Cliente no encontrado.");
      const aliases = { nombre: "name", name: "name", documento: "document", ruc: "document", email: "email", correo: "email", empresa: "company", company: "company", ciudad: "city", direccion: "address", address: "address", notas: "notes", nota: "notes" };
      const input = {};
      for (const [key, value] of Object.entries(parsed.values || {})) if (aliases[key]) input[aliases[key]] = value;
      updateClient(data, client.id, input);
      result = `Ficha de ${client.name} actualizada.`;
    } else if (parsed.action === "find_client") {
      const q = parsed.query.toLowerCase();
      const matches = data.clients.filter((client) => [client.id, client.name, client.phone, client.document, client.company].some((value) => String(value || "").toLowerCase().includes(q))).slice(0, 10);
      return response.json({ ok: true, message: matches.length ? `${matches.length} cliente(s) encontrado(s).` : "Sin coincidencias.", matches, state: stateResponse(request) });
    } else if (parsed.action === "adjust_stock") {
      const product = data.products.find((entry) => entry.sku.toLowerCase() === String(parsed.sku).toLowerCase()); if (!product) throw new Error("Producto no encontrado.");
      adjustStock(data, product.id, parsed.quantity, parsed.note); result = `Stock de ${product.name} ajustado en ${parsed.quantity}.`;
    } else {
      throw new Error("No entendí la instrucción. Usá uno de los ejemplos disponibles en la consola.");
    }
    addActivity(data, `Admin: ${result}`, "success");
    await store.save();
    response.json({ ok: true, message: result, state: stateResponse(request) });
  } catch (error) { next(error); }
});

app.post("/api/connect", async (request, response, next) => {
  try {
    if (data.settings.whatsappMode === "cloud") {
      if (!cloudApiConfigured()) throw new Error("Completá el ID del número y el token de WhatsApp API.");
      addActivity(data, "WhatsApp API configurada como conexión activa.", "success");
      await store.save();
      return response.json(stateResponse(request));
    }
    void startConnection();
    return response.status(202).json(stateResponse(request));
  } catch (error) { return next(error); }
});

app.post("/api/disconnect", async (request, response) => {
  if (data.settings.whatsappMode !== "cloud") await disconnect();
  response.json(stateResponse(request));
});

app.post("/api/deals/:id/bot", async (request, response, next) => {
  try {
    const deal = findDeal(data, request.params.id);
    const user = currentUser(request);
    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");
    ensureDealOwnership(deal, user);
    deal.botActive = request.body?.active === true;
    deal.updatedAt = timestamp();
    addActivity(
      data,
      `Bot ${deal.botActive ? "activado" : "pausado"} para ${deal.name}.`,
      deal.botActive ? "success" : "neutral",
    );
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.post("/api/deals/:id/message", async (request, response, next) => {
  try {
    const deal = findDeal(data, request.params.id);
    const user = currentUser(request);
    const text = cleanText(request.body?.text, 4000);
    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");
    ensureDealOwnership(deal, user, { claim: true });
    if (!text) throw new Error("Escribí un mensaje.");
    const messageId = await sendProviderText(deal, text);
    rememberSeen(messageId);
    recordHumanOutgoing(data, { jid: deal.jid, name: deal.name, text, messageId, userId: user.id, userName: user.name });
    addActivity(data, `${user.name} respondió a ${deal.name}; quedó como responsable principal.`, "success");
    await store.save();
    response.json(stateResponse());
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/deals/:id/media",
  express.raw({ type: () => true, limit: maximumMediaBytes }),
  async (request, response, next) => {
    let attachment = null;
    try {
      const deal = findDeal(data, request.params.id);
      const user = currentUser(request);
      if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");
      ensureDealOwnership(deal, user, { claim: true });
      if (!Buffer.isBuffer(request.body) || !request.body.length) throw new Error("Seleccioná un archivo.");
      const info = outgoingMediaInfo(request);
      attachment = await saveAttachmentBuffer(request.body, info);
      const text = info.caption || messageLabel(info);
      const messageId = await sendProviderMedia(deal, request.body, info);
      rememberSeen(messageId);
      recordHumanOutgoing(data, {
        jid: deal.jid,
        name: deal.name,
        text,
        messageId,
        attachment,
        userId: user.id,
        userName: user.name,
      });
      addActivity(data, `${info.fileName} enviado a ${deal.name}; el bot quedó pausado.`, "success");
      await store.save();
      response.json(stateResponse());
    } catch (error) {
      if (attachment?.storedName) {
        await unlink(path.join(mediaDirectory, path.basename(attachment.storedName))).catch(() => {});
      }
      next(error);
    }
  },
);

app.post("/api/deals/:id/call-link", async (request, response, next) => {
  try {
    const deal = findDeal(data, request.params.id);
    const user = currentUser(request);
    const type = request.body?.type === "video" ? "video" : "audio";
    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");
    ensureDealOwnership(deal, user, { claim: true });
    if (data.settings.whatsappMode === "cloud") throw new Error("La API oficial no permite crear enlaces de llamada desde este panel.");
    let link;
    let messageId;
    if (mockMode) {
      link = `https://call.whatsapp.com/${type === "video" ? "video" : "voice"}/prueba-${Date.now()}`;
      messageId = makeId("mockcall");
    } else {
      if (!whatsappSocket || connectionStatus !== "connected") {
        throw new Error("WhatsApp no está conectado.");
      }
      const token = await whatsappSocket.createCallLink(type);
      if (!token) throw new Error("WhatsApp no pudo crear el enlace de llamada.");
      link = `https://call.whatsapp.com/${type === "video" ? "video" : "voice"}/${token}`;
      const sent = await whatsappSocket.sendMessage(deal.jid, {
        text: `${type === "video" ? "Videollamada" : "Llamada de voz"} por WhatsApp: ${link}`,
      });
      messageId = sent?.key?.id || makeId("callinvite");
    }
    const text = `${type === "video" ? "Videollamada" : "Llamada de voz"} por WhatsApp: ${link}`;
    rememberSeen(messageId);
    recordHumanOutgoing(data, { jid: deal.jid, name: deal.name, text, messageId, userId: user.id, userName: user.name });
    recordCall(data, {
      id: makeId("callinvite"),
      jid: deal.jid,
      direction: "outgoing",
      status: "invited",
      isVideo: type === "video",
      link,
    });
    addActivity(data, `Invitación de ${type === "video" ? "videollamada" : "llamada"} enviada a ${deal.name}.`, "success");
    await store.save();
    response.json({ ...stateResponse(), callLink: link });
  } catch (error) {
    next(error);
  }
});

app.post("/api/deals/:id/won", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const existing = findDeal(data, request.params.id);
    if (!existing || !OPEN_STAGES.has(existing.stage)) throw new Error("Negociación no encontrada.");
    ensureDealOwnership(existing, user, { claim: true });
    const deal = closeWon(data, request.params.id);
    addActivity(data, `${user.name} marcó a ${deal.name} como negociación ganada.`, "success");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.post("/api/deals/:id/lost", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const existing = findDeal(data, request.params.id);
    if (!existing || !OPEN_STAGES.has(existing.stage)) throw new Error("Negociación no encontrada.");
    ensureDealOwnership(existing, user, { claim: true });
    const deal = closeLost(data, request.params.id, request.body?.reasonId);
    addActivity(data, `${user.name} cerró a ${deal.name} como perdido (${deal.lossReasonName}).`, "warning");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.post("/api/deals/:id/reserve", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const deal = findDeal(data, request.params.id);
    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");
    ensureDealOwnership(deal, user, { claim: true });
    reserveProduct(
      data,
      request.params.id,
      request.body?.productId,
      request.body?.quantity,
      "manual",
    );
    addActivity(data, `${user.name} reservó un producto para ${deal.name}.`, "success");
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/deals/:id/items/:itemId", async (request, response, next) => {
  try {
    const user = currentUser(request);
    const deal = findDeal(data, request.params.id);
    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");
    ensureDealOwnership(deal, user, { claim: true });
    removeReservedItem(data, request.params.id, request.params.itemId);
    addActivity(data, `${user.name} devolvió una reserva de ${deal.name} al stock.`);
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

app.post("/api/products/import-csv", express.text({ type: () => true, limit: "5mb" }), requireManagerOrAdmin, async (request, response, next) => {
  try {
    const rows = parseCsv(request.body);
    if (rows.length < 2) throw new Error("El CSV debe incluir encabezados y al menos un producto.");
    const headers = rows[0].map(headerKey);
    const find = (...aliases) => headers.findIndex((value) => aliases.includes(value));
    const indexes = {
      sku: find("codigo", "codigoproducto", "sku", "code"),
      name: find("nombre", "producto", "name"),
      description: find("descripcion", "detalle", "description"),
      available: find("disponible", "stock", "cantidad", "available"),
      minStock: find("minimo", "stockminimo", "minstock"),
      price: find("precio", "price"),
      active: find("activo", "active"),
    };
    if (indexes.sku < 0 || indexes.name < 0) throw new Error("El CSV necesita las columnas Código/SKU y Nombre.");
    let created = 0; let updated = 0; const errors = [];
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index];
      const sku = cleanText(row[indexes.sku], 80);
      const name = cleanText(row[indexes.name], 160);
      if (!sku || !name) { errors.push(`Fila ${index + 1}: falta código o nombre.`); continue; }
      try {
        const existing = data.products.find((item) => item.sku.toLowerCase() === sku.toLowerCase());
        const number = (position) => position >= 0 ? Number(String(row[position] || "0").replace(/\./g, "").replace(",", ".")) || 0 : 0;
        upsertProduct(data, {
          id: existing?.id,
          sku,
          name,
          description: indexes.description >= 0 ? row[indexes.description] : existing?.description || "",
          available: indexes.available >= 0 ? number(indexes.available) : existing?.available || 0,
          minStock: indexes.minStock >= 0 ? number(indexes.minStock) : existing?.minStock || 0,
          price: indexes.price >= 0 ? number(indexes.price) : existing?.price || 0,
          active: indexes.active < 0 ? true : !["0", "no", "false", "inactivo"].includes(String(row[indexes.active] || "").toLowerCase()),
        });
        existing ? updated += 1 : created += 1;
      } catch (error) { errors.push(`Fila ${index + 1}: ${error.message}`); }
    }
    addActivity(data, `CSV de stock importado: ${created} nuevos y ${updated} actualizados.`, "success");
    await store.save();
    response.json({ ...stateResponse(request), importResult: { created, updated, errors: errors.slice(0, 20) } });
  } catch (error) { next(error); }
});

app.post("/api/products", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const product = upsertProduct(data, request.body || {});
    addActivity(data, `Producto ${product.name} guardado.`, "success");
    await store.save();
    response.json(stateResponse());
  } catch (error) {
    next(error);
  }
});

app.put("/api/products/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const product = upsertProduct(data, { ...(request.body || {}), id: request.params.id });
    addActivity(data, `Producto ${product.name} actualizado.`, "success");
    await store.save();
    response.json(stateResponse());
  } catch (error) {
    next(error);
  }
});

app.post("/api/products/:id/adjust", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const product = adjustStock(
      data,
      request.params.id,
      request.body?.quantity,
      request.body?.note,
    );
    addActivity(data, `Stock de ${product.name} ajustado.`, "success");
    await store.save();
    response.json(stateResponse());
  } catch (error) {
    next(error);
  }
});

app.delete("/api/products/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const product = data.products.find((item) => item.id === request.params.id);
    if (!product) throw new Error("Producto no encontrado.");
    product.active = false;
    product.updatedAt = timestamp();
    addActivity(data, `Producto ${product.name} archivado.`);
    await store.save();
    response.json(stateResponse());
  } catch (error) {
    next(error);
  }
});

app.post("/api/loss-reasons", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const name = cleanText(request.body?.name, 120);
    if (!name) throw new Error("Ingresá el motivo.");
    if (data.settings.lossReasons.some((reason) => reason.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("Ese motivo ya existe.");
    }
    data.settings.lossReasons.push({
      id: makeId("reason"),
      name,
      order: data.settings.lossReasons.length,
    });
    await store.save();
    response.json(stateResponse());
  } catch (error) {
    next(error);
  }
});

app.put("/api/loss-reasons/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    const reason = data.settings.lossReasons.find((item) => item.id === request.params.id);
    const name = cleanText(request.body?.name, 120);
    if (!reason) throw new Error("Motivo no encontrado.");
    if (!name) throw new Error("Ingresá el motivo.");
    reason.name = name;
    await store.save();
    response.json(stateResponse());
  } catch (error) {
    next(error);
  }
});

app.delete("/api/loss-reasons/:id", requireManagerOrAdmin, async (request, response, next) => {
  try {
    if (data.settings.lossReasons.length <= 1) {
      throw new Error("Debe quedar al menos un motivo de cierre.");
    }
    const index = data.settings.lossReasons.findIndex((item) => item.id === request.params.id);
    if (index < 0) throw new Error("Motivo no encontrado.");
    data.settings.lossReasons.splice(index, 1);
    await store.save();
    response.json(stateResponse());
  } catch (error) {
    next(error);
  }
});

if (mockMode) {
  app.post("/api/mock/connected", (_request, response) => {
    connectionStatus = "connected";
    qrDataUrl = null;
    connectedAccount = "+595981000000";
    response.json(stateResponse());
  });
  app.post("/api/mock/incoming", async (request, response, next) => {
    try {
      const jid = `${String(request.body?.phone || "595981000000").replace(/\D/g, "")}@s.whatsapp.net`;
      const result = recordIncoming(data, {
        jid,
        name: request.body?.name || "Cliente de prueba",
        text: request.body?.text || "Hola, quiero información",
        messageId: makeId("mockincoming"),
      });
      addActivity(data, `Mensaje de prueba recibido de ${result.deal.name}.`, "success");
      await store.save();
      response.json(stateResponse());
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/mock/outgoing", async (request, response, next) => {
    try {
      const deal = findDeal(data, request.body?.dealId);
      if (!deal) throw new Error("Negociación no encontrada.");
      recordHumanOutgoing(data, {
        jid: deal.jid,
        name: deal.name,
        text: request.body?.text || "Hola, ¿cómo podemos ayudarte?",
        messageId: makeId("mockoutgoing"),
      });
      await store.save();
      response.json(stateResponse());
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/mock/history", async (request, response, next) => {
    try {
      const entries = Array.isArray(request.body?.messages) ? request.body.messages : [];
      await handleIncomingMessages({
        type: "append",
        messages: entries.map((entry, index) => ({
          key: {
            remoteJid: `${String(entry.phone || "595981000000").replace(/\D/g, "")}@s.whatsapp.net`,
            fromMe: Boolean(entry.fromMe),
            id: entry.id || makeId(`mockhistory${index}`),
          },
          pushName: entry.name || "Cliente pendiente",
          messageTimestamp: Math.floor(Number(entry.at || Date.now()) / 1000),
          message: { conversation: entry.text || "Mensaje recibido mientras el equipo estaba apagado" },
        })),
      });
      response.json(stateResponse());
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/mock/call", async (request, response, next) => {
    try {
      const jid = `${String(request.body?.phone || "595981000000").replace(/\D/g, "")}@s.whatsapp.net`;
      await handleCalls([{
        id: request.body?.id || makeId("mockincomingcall"),
        chatId: jid,
        from: jid,
        status: request.body?.status || "offer",
        isVideo: Boolean(request.body?.isVideo),
        date: new Date(),
      }]);
      response.json(stateResponse());
    } catch (error) {
      next(error);
    }
  });
}

app.use((error, _request, response, _next) => {
  const status = Number(error?.status) || 400;
  response.status(status).json({ error: cleanText(error?.message || "No se pudo completar la acción.", 300) });
});

async function runAutomations() {
  if (automationRunning) return;
  automationRunning = true;
  try {
    for (const action of automationActions(data)) {
      const deal = findDeal(data, action.dealId);
      if (!deal || deal.stage !== STAGES.CONTACTED) continue;
      if (action.type === "followup") {
        if (!mockMode && connectionStatus !== "connected") continue;
        try {
          await sendBotMessage(deal, data.settings.followup.message, "followup");
          deal.followupSentAt = timestamp();
          addActivity(data, `Seguimiento automático enviado a ${deal.name}.`);
          await store.save();
        } catch (error) {
          console.error("[automation followup]", error?.message || error);
        }
      }
      if (action.type === "close") {
        const reason =
          data.settings.lossReasons.find(
            (item) => item.name.toLowerCase() === "sin retorno del cliente",
          ) || data.settings.lossReasons[0];
        if (!reason) continue;
        closeLost(data, deal.id, reason.id);
        addActivity(data, `${deal.name} se cerró automáticamente por falta de retorno.`, "warning");
        await store.save();
      }
    }
  } finally {
    automationRunning = false;
  }
}

function lanAddresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(`http://${entry.address}:${port}`);
    }
  }
  return [...new Set(addresses)];
}

const server = createServer(app);
server.listen(port, host, () => {
  const localUrl = `http://127.0.0.1:${port}`;
  console.log("");
  console.log("  WhatsBot CRM está listo");
  console.log(`  En este equipo: ${localUrl}`);
  if (["0.0.0.0", "::"].includes(host)) {
    const networkUrls = lanAddresses();
    if (networkUrls.length) {
      console.log("  Para otros usuarios de la misma red:");
      for (const networkUrl of networkUrls) console.log(`  - ${networkUrl}`);
    }
  }
  console.log("  Para mantener el bot activo, dejá esta ventana abierta.");
  console.log("");
  openBrowser(localUrl);
  if (!mockMode && existsSync(path.join(authDirectory, "creds.json"))) {
    void startConnection();
  }
});

const automationTimer = setInterval(() => void runAutomations(), 10_000);
automationTimer.unref();
const sessionTimer = setInterval(() => {
  for (const [token, session] of sessions) {
    if (!session || session.expiresAt < Date.now()) sessions.delete(token);
  }
}, 60_000);
sessionTimer.unref();

const heartbeatTimer = setInterval(() => {
  if (connectionStatus !== "connected") return;
  data.sync.lastActiveAt = timestamp();
  void store.save();
}, 30_000);
heartbeatTimer.unref();

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(reconnectTimer);
  clearInterval(automationTimer);
  clearInterval(sessionTimer);
  clearInterval(heartbeatTimer);
  if (connectionStatus === "connected") data.sync.lastActiveAt = timestamp();
  await store.save().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1800).unref();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
