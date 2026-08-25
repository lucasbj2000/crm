function replaceOne(source, pattern, replacement, label) {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) {
    throw new Error(`V24 patch "${label}" esperaba 1 coincidencia y encontró ${matches.length}.`);
  }
  return source.replace(pattern, replacement);
}

const V24_MEDIA_HELPERS = String.raw`
async function v24TranscribeMediaAttachment(attachment) {
  if (!attachment?.available || !attachment?.storedName || !data.settings.apiKey) return "";
  if (!["audio", "video"].includes(attachment.kind)) return "";
  const filePath = path.join(mediaDirectory, path.basename(attachment.storedName));
  const file = await readFile(filePath);
  if (!file?.length) return "";
  const form = new FormData();
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("file", new Blob([file], { type: attachment.mimeType || "application/octet-stream" }), safeFileName(attachment.fileName || attachment.storedName));
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: \`Bearer \${data.settings.apiKey}\` },
    body: form,
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) throw new Error(\`Transcripción \${response.status}: \${cleanText(body?.error?.message || raw, 500)}\`);
  return cleanText(body?.text || "", 8000);
}

async function v24DescribeImageAttachment(attachment) {
  if (!attachment?.available || !attachment?.storedName || !data.settings.apiKey || attachment.kind !== "image") return "";
  const filePath = path.join(mediaDirectory, path.basename(attachment.storedName));
  const file = await readFile(filePath);
  if (!file?.length) return "";
  const mime = cleanText(attachment.mimeType || "image/jpeg", 120).split(";")[0] || "image/jpeg";
  const imageUrl = \`data:\${mime};base64,\${file.toString("base64")}\`;
  const model = cleanText(data.settings.model || "gpt-4.1-mini", 120) || "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: \`Bearer \${data.settings.apiKey}\`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Analizá esta imagen como entrada de un cliente de CRM. Describí de forma breve lo relevante, transcribí texto visible importante y detectá la intención si es evidente. No inventes datos." },
          { type: "input_image", image_url: imageUrl },
        ],
      }],
      max_output_tokens: 500,
    }),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) throw new Error(\`Visión \${response.status}: \${cleanText(body?.error?.message || raw, 500)}\`);
  return cleanText(responseApiText(body), 8000);
}

async function v24UnderstandIncomingMedia(originalText, attachment) {
  if (!attachment || !data.settings.apiKey) return originalText || "";
  const base = cleanText(originalText || "", 8000);
  const parts = [];
  if (base && !["🎤 Audio", "🎬 Video", "🖼️ Imagen", "Archivo recibido"].includes(base)) parts.push(base);
  try {
    if (attachment.kind === "audio") {
      const transcript = await v24TranscribeMediaAttachment(attachment);
      if (transcript) {
        attachment.ai = { ...(attachment.ai || {}), transcript, analyzedAt: timestamp() };
        parts.push(\`[Audio del cliente transcrito: \${transcript}]\`);
      }
    } else if (attachment.kind === "image") {
      const visualSummary = await v24DescribeImageAttachment(attachment);
      if (visualSummary) {
        attachment.ai = { ...(attachment.ai || {}), visualSummary, analyzedAt: timestamp() };
        parts.push(\`[Imagen del cliente: \${visualSummary}]\`);
      }
    } else if (attachment.kind === "video") {
      const transcript = await v24TranscribeMediaAttachment(attachment);
      if (transcript) {
        attachment.ai = { ...(attachment.ai || {}), transcript, analyzedAt: timestamp() };
        parts.push(\`[Video del cliente; audio transcrito: \${transcript}]\`);
      } else {
        parts.push("[El cliente envió un video. No hay transcripción disponible; no inventes su contenido y pedí contexto si hace falta.]");
      }
    } else if (attachment.kind === "document") {
      parts.push(\`[El cliente adjuntó un documento llamado "\${safeFileName(attachment.fileName || "archivo")}".]\`);
    } else if (attachment.kind === "sticker") {
      parts.push("[El cliente envió un sticker.]");
    }
  } catch (error) {
    addLog(\`Análisis multimedia IA: \${cleanText(error.message, 500)}\`, "warning");
    parts.push(\`[El cliente envió \${attachment.kind || "un archivo"}; el análisis automático no estuvo disponible.]\`);
  }
  return cleanText(parts.join("\\n") || base || messageLabel(attachment) || "Archivo recibido", 10000);
}
`;

const V24_TRANSFER_HELPERS = String.raw`
function v24ActiveObserverGrant(deal, user) {
  if (!deal || !user || !OPEN_STAGES.has(deal.stage)) return null;
  return (data.communicationRequests || []).find((request) =>
    request.clientId === deal.clientId &&
    (!request.dealId || request.dealId === deal.id) &&
    request.requestedByUserId === user.id &&
    request.status === "approved" &&
    request.mode === "temporary" &&
    (!request.grantedUntil || new Date(request.grantedUntil).getTime() > Date.now())
  ) || null;
}

function v24GrantTransferObserver(deal, actor) {
  if (!deal || !actor || actor.role === "admin") return null;
  const now = timestamp();
  for (const request of data.communicationRequests || []) {
    if (request.dealId === deal.id && request.requestedByUserId === actor.id && request.status === "approved" && request.mode === "temporary") {
      request.status = "expired";
      request.expiredAt = now;
    }
  }
  const request = {
    id: makeId("communication"),
    clientId: deal.clientId,
    dealId: deal.id,
    branchId: deal.branchId,
    requestedByUserId: actor.id,
    requestedByName: actor.name,
    status: "approved",
    mode: "temporary",
    reason: "Observador temporal por derivación",
    observerTransfer: true,
    requestedAt: now,
    reviewedAt: now,
    reviewedByUserId: actor.id,
    grantedUntil: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
  };
  data.communicationRequests = data.communicationRequests || [];
  data.communicationRequests.unshift(request);
  return request;
}

function v24TargetLineForUser(targetUser, currentLine) {
  if (currentLine && canUserUseWhatsappLine(targetUser, currentLine)) return currentLine;
  const usable = (data.whatsappLines || []).filter((line) => line.active !== false && canUserUseWhatsappLine(targetUser, line));
  return usable.find((line) => line.branchId === targetUser.branchId && line.isDefault === true)
    || usable.find((line) => line.branchId === targetUser.branchId)
    || usable.find((line) => line.isDefault === true)
    || usable[0]
    || null;
}
`;

export function applyV24ServerPatches(source) {
  let out = source;

  out = replaceOne(
    out,
    /else if\s*\(info\.kind\s*===\s*"audio"\)\s*content\s*=\s*\{audio:buffer,mimetype:info\.mimeType,ptt:info\.ptt&&info\.mimeType\.includes\("ogg"\)\};/,
    `else if(info.kind==="audio"){const audioMime=(cleanText(info.mimeType||"audio/mp4",160).split(";")[0]||"audio/mp4").toLowerCase().replace("audio/x-m4a","audio/mp4");content={audio:buffer,mimetype:audioMime,ptt:Boolean(info.ptt&&audioMime.includes("ogg"))};}`,
    "normalización de audio QR",
  );

  out = replaceOne(
    out,
    /async function maybeReplyWithBot\(deal, text\) \{/,
    `${V24_MEDIA_HELPERS}\nasync function maybeReplyWithBot(deal, text) {`,
    "helpers multimedia",
  );

  out = replaceOne(
    out,
    /const attachment = info \? await downloadIncomingAttachment\(item, info\) : null;\n    const occurredAt = messageTime\(item\.messageTimestamp\);/,
    `const attachment = info ? await downloadIncomingAttachment(item, info) : null;\n    const v24BotText = (!item.key?.fromMe && attachment) ? await v24UnderstandIncomingMedia(text, attachment) : text;\n    const occurredAt = messageTime(item.messageTimestamp);`,
    "análisis multimedia entrante",
  );

  out = replaceOne(
    out,
    /if\(text\) captureIncomingClientData\(deal,text,\{allowAi:true\}\);([\s\S]*?)queueIncomingSuperAutomation\(\{deal,text,line,created,message:\{text,id:item\.id\}\}\); if\(data\.settings\.botEnabled&&line\.botEnabled!==false&&deal\.botActive&&text\)void maybeReplyWithBot\(deal,text\);/,
    `if(v24BotText||text) captureIncomingClientData(deal,v24BotText||text,{allowAi:true});$1queueIncomingSuperAutomation({deal,text:v24BotText||text,line,created,message:{text:v24BotText||text,id:item.id}}); if(data.settings.botEnabled&&line.botEnabled!==false&&deal.botActive&&(v24BotText||text))void maybeReplyWithBot(deal,v24BotText||text);`,
    "uso de comprensión multimedia por bot",
  );

  out = replaceOne(
    out,
    /function v214ActiveCommunicationGrant\(deal, user\) \{[\s\S]*?\n\}/,
    `function v214ActiveCommunicationGrant(deal, user) { v214ExpireCommunicationRequests(); return v24ActiveObserverGrant(deal, user); }`,
    "grant temporal ligado al caso",
  );

  out = replaceOne(
    out,
    /app\.post\("\/api\/deals\/:id\/transfer",/,
    `${V24_TRANSFER_HELPERS}\napp.post("/api/deals/:id/transfer",`,
    "helpers de derivación",
  );

  out = replaceOne(
    out,
    /if \(targetUserId\) \{\n      const targetUser = data\.users\.find\(\(entry\) => entry\.id === targetUserId && entry\.active !== false\);\n      if \(!targetUser\) throw new Error\("Compañero no encontrado\."\);\n      if \(targetUser\.branchId !== sourceBranch\.id\) throw new Error\("Ese usuario pertenece a otra sucursal\. Seleccioná transferencia a sucursal\."\);[\s\S]*?return response\.json\(stateResponse\(request\)\);\n    \}/,
    `if (targetUserId) {\n      const targetUser = data.users.find((entry) => entry.id === targetUserId && entry.active !== false);\n      if (!targetUser) throw new Error("Compañero no encontrado.");\n      const currentLine = dealWhatsappLine(deal);\n      const targetLine = v24TargetLineForUser(targetUser, currentLine);\n      if (!targetLine) throw new Error("El usuario destino no tiene una línea de WhatsApp habilitada.");\n      const targetBranch = getBranch(targetUser.branchId || targetLine.branchId || deal.branchId) || sourceBranch;\n      const lineChanged = Boolean(currentLine?.id && targetLine.id !== currentLine.id);\n      const branchChanged = targetBranch.id !== sourceBranch.id;\n      const keepAsObserver = request.body?.keepAsObserver === true;\n\n      if (lineChanged || branchChanged) releaseDealReservations(data, deal, \`Transferencia a \${targetUser.name}\`);\n\n      const previousOwnerId = deal.ownerUserId;\n      const previousLineName = currentLine?.name || "";\n      deal.ownerUserId = targetUser.id;\n      deal.ownerName = targetUser.name;\n      deal.assignedUserId = targetUser.id;\n      deal.handlerKey = \`user:\${targetUser.id}\`;\n      deal.branchId = targetBranch.id;\n      deal.lineId = targetLine.id;\n      deal.updatedAt = timestamp();\n      deal.lastTransferAt = timestamp();\n\n      const client = findClient(data, deal.clientId);\n      if (client) {\n        if (!client.branchOwners || typeof client.branchOwners !== "object") client.branchOwners = {};\n        client.branchOwners[targetBranch.id] = { userId: targetUser.id, userName: targetUser.name, updatedAt: timestamp() };\n        client.ownerUserId = targetUser.id;\n        client.ownerName = targetUser.name;\n        client.updatedAt = timestamp();\n      }\n\n      if (keepAsObserver && actor.id !== targetUser.id) v24GrantTransferObserver(deal, actor);\n\n      const detail = lineChanged\n        ? \`Derivada a \${targetUser.name}. La conversación continúa con su historial y cambia de \${previousLineName || "la línea anterior"} a \${targetLine.name}.\`\n        : \`Derivada a \${targetUser.name}. Continúa en la misma conversación y línea de WhatsApp.\`;\n      deal.events = deal.events || [];\n      deal.events.unshift({ at: timestamp(), text: detail });\n      deal.messages = deal.messages || [];\n      deal.messages.push({ id: makeId("msg"), at: timestamp(), sender: "system", direction: "internal", origin: "system", text: detail });\n\n      addInternalNotification(targetUser.id, "Negociación derivada", \`\${actor.name} te derivó a \${client?.name || deal.name}.\`, { dealId: deal.id });\n\n      let introSent = false;\n      if (lineChanged && targetLine) {\n        const intro = cleanText(request.body?.introMessage, 1200)\n          || \`Hola \${client?.name || deal.name || ""}. Soy \${targetUser.name} del equipo de \${targetBranch.name}. Voy a continuar tu atención desde este número; tengo el historial de la conversación anterior.\`;\n        try {\n          await sendDealMessage(deal, intro);\n          deal.messages.push({ id: makeId("msg"), at: timestamp(), sender: "agent", senderUserId: targetUser.id, senderName: targetUser.name, direction: "outgoing", origin: "transfer-intro", text: intro });\n          deal.lastMessage = intro;\n          deal.lastDirection = "outgoing";\n          introSent = true;\n        } catch (error) {\n          addLog(\`No se pudo enviar presentación de derivación: \${cleanText(error.message, 400)}\`, "warning");\n        }\n      }\n\n      recordAuditEvent(actor, "derivacion_interna_v24", { dealId: deal.id, fromUserId: previousOwnerId, toUserId: targetUser.id, sourceBranchId: sourceBranch.id, targetBranchId: targetBranch.id, sourceLineId: currentLine?.id || null, targetLineId: targetLine.id, lineChanged, keepAsObserver, introSent }, targetBranch.id);\n      await store.save();\n      return response.json({ ok: true, lineChanged, introSent, observer: keepAsObserver, state: stateResponse(request) });\n    }`,
    "derivación directa a persona",
  );

  out = replaceOne(
    out,
    /function userCanAccessDeal\(user, deal\) \{\n  if\(!user\|\|!deal\)return false;\n  if\(user\.role==="admin"\)return true;/,
    `function userCanAccessDeal(user, deal) {\n  if(!user||!deal)return false;\n  if(user.role==="admin")return true;\n  if(v24ActiveObserverGrant(deal,user))return true;`,
    "acceso observador fuera de línea/sucursal",
  );

  out = replaceOne(
    out,
    /if \(user\.role === "agent"\) \{\n      payload\.deals = payload\.deals\.filter\(\(deal\) => \{\n        const line=dealWhatsappLine\(deal\);\n        if\(line && !canUserUseWhatsappLine\(user,line\)\) return false;/,
    `if (user.role === "agent") {\n      payload.deals = payload.deals.filter((deal) => {\n        if(v24ActiveObserverGrant(deal,user))return true;\n        const line=dealWhatsappLine(deal);\n        if(line && !canUserUseWhatsappLine(user,line)) return false;`,
    "estado visible para observador",
  );

  return out;
}
