function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.5 media: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.5 media: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceBetween(source, start, end, replacement, label) {
  const first = source.indexOf(start);
  if (first < 0) throw new Error(`V26.5 media: no se encontró inicio de ${label}.`);
  const next = source.indexOf(end, first + start.length);
  if (next < 0) throw new Error(`V26.5 media: no se encontró final de ${label}.`);
  return source.slice(0, first) + replacement + "\n" + source.slice(next);
}

const robustDownloader = String.raw`
function v265MediaNode(item, info) {
  const content = unwrapMessage(item?.message || {});
  if (content.imageMessage) return { node: content.imageMessage, type: "image" };
  if (content.videoMessage) return { node: content.videoMessage, type: "video" };
  if (content.ptvMessage) return { node: content.ptvMessage, type: "video" };
  if (content.audioMessage) return { node: content.audioMessage, type: "audio" };
  if (content.documentMessage) return { node: content.documentMessage, type: "document" };
  if (content.stickerMessage) return { node: content.stickerMessage, type: "sticker" };
  return { node: null, type: info?.kind || "document" };
}

function v265UnavailableAttachment(info, attachmentId, error = "") {
  return {
    id: attachmentId,
    kind: info.kind,
    fileName: safeFileName(info.fileName),
    mimeType: info.mimeType,
    size: info.declaredSize,
    duration: info.duration,
    storedName: null,
    available: false,
    retryable: true,
    error: cleanText(error, 500),
  };
}

async function v265StreamDownload(item, info) {
  const { node, type } = v265MediaNode(item, info);
  if (!node) throw new Error("No se encontró el contenido multimedia dentro del mensaje.");
  const baileys = await import("@whiskeysockets/baileys");
  if (typeof baileys.downloadContentFromMessage !== "function") throw new Error("El descargador alternativo de WhatsApp no está disponible.");
  const stream = await baileys.downloadContentFromMessage(node, type);
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const part = Buffer.from(chunk);
    total += part.length;
    if (total > maximumMediaBytes) throw new Error("El archivo supera el límite de 64 MB.");
    chunks.push(part);
  }
  const buffer = Buffer.concat(chunks);
  if (!buffer.length) throw new Error("WhatsApp devolvió un archivo vacío.");
  return buffer;
}

async function v265RefreshMedia(item, sourceSocket) {
  if (!sourceSocket || typeof sourceSocket.updateMediaMessage !== "function") return false;
  try {
    await Promise.race([
      sourceSocket.updateMediaMessage(item),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout refrescando multimedia")), 5000)),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function downloadIncomingAttachment(item, info, sourceSocket = null) {
  const attachmentId = makeId("attachment");
  if (info.declaredSize > maximumMediaBytes) {
    return v265UnavailableAttachment(info, attachmentId, "El archivo supera el límite de 64 MB.");
  }
  if (!downloadMediaMessage) {
    return v265UnavailableAttachment(info, attachmentId, "El motor de descarga de WhatsApp todavía no está disponible.");
  }

  const socket = sourceSocket || whatsappSocket;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const buffer = await downloadMediaMessage(item, "buffer", {}, {
        logger: whatsappLogger,
        reuploadRequest: async (message) => {
          if (socket?.updateMediaMessage) await socket.updateMediaMessage(message);
        },
      });
      return await saveAttachmentBuffer(Buffer.from(buffer), info, attachmentId);
    } catch (error) {
      lastError = error;
      console.warn("[media download] intento " + attempt + "/3", error?.message || error);
      if (attempt < 3) {
        await v265RefreshMedia(item, socket);
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  }

  try {
    await v265RefreshMedia(item, socket);
    const fallbackBuffer = await v265StreamDownload(item, info);
    return await saveAttachmentBuffer(fallbackBuffer, info, attachmentId);
  } catch (fallbackError) {
    lastError = fallbackError || lastError;
    console.error("[media download final]", lastError?.message || lastError);
    return v265UnavailableAttachment(info, attachmentId, lastError?.message || "No se pudo descargar el archivo desde WhatsApp.");
  }
}
`;

export function applyV265MediaReliabilityPatches(source) {
  let patched = source;

  patched = replaceBetween(
    patched,
    "async function downloadIncomingAttachment(item, info) {",
    "function findAttachment(attachmentId) {",
    robustDownloader,
    "descargador multimedia entrante",
  );

  patched = replaceOnce(
    patched,
    "const attachment = info ? await downloadIncomingAttachment(item, info) : null;",
    "const mediaSocket = lineSocket(lineId) || branchSocket(branchId) || whatsappSocket;\n    const attachment = info ? await downloadIncomingAttachment(item, info, mediaSocket) : null;",
    "uso del socket correcto para multimedia",
  );

  return patched;
}
