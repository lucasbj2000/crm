function replaceOne(source, pattern, replacement, label) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) {
    throw new Error(`V24 runtime patch "${label}" esperaba 1 coincidencia y encontró ${matches.length}.`);
  }
  return source.replace(pattern, replacement);
}

export function applyV24CloudPatches(source) {
  let out = source;

  // Audio saliente por API oficial: MediaRecorder suele entregar MIME con parámetros
  // (ej. audio/mp4;codecs=mp4a.40.2). Meta valida el MIME base, por eso se normaliza
  // antes de decidir si es audio o documento.
  out = replaceOne(
    out,
    /const cloudAudioTypes=new Set\(\["audio\/aac","audio\/amr","audio\/mpeg","audio\/mp4","audio\/ogg"\]\);\n    const type=info\.kind==="audio"&&!cloudAudioTypes\.has\(info\.mimeType\)\?"document":info\.kind==="document"\?"document":info\.kind;\n    const uploadInfo=type==="document"&&info\.kind==="audio"\?\{\.\.\.info,kind:"document",mimeType:"application\/octet-stream"\}:info;/,
    `const cloudAudioTypes=new Set(["audio/aac","audio/amr","audio/mpeg","audio/mp4","audio/ogg"]);\n    const normalizedAudioMime=info.kind==="audio"?(cleanText(info.mimeType||"audio/mp4",160).split(";")[0]||"audio/mp4").toLowerCase().replace("audio/x-m4a","audio/mp4"):info.mimeType;\n    const normalizedMediaInfo=info.kind==="audio"?{...info,mimeType:normalizedAudioMime}:info;\n    const type=info.kind==="audio"&&!cloudAudioTypes.has(normalizedAudioMime)?"document":info.kind==="document"?"document":info.kind;\n    const uploadInfo=type==="document"&&info.kind==="audio"?{...normalizedMediaInfo,kind:"document",mimeType:"application/octet-stream"}:normalizedMediaInfo;`,
    "audio saliente API oficial",
  );

  // Cloud API: analiza el archivo descargado y alimenta bot, captura inteligente y
  // automatizaciones con el contenido comprendido.
  out = replaceOne(
    out,
    /const attachment=rawMedia\?await downloadLineCloudAttachment\(line,rawMedia\):null; const localClient=/,
    `const attachment=rawMedia?await downloadLineCloudAttachment(line,rawMedia):null; const v24CloudBotText=attachment?await v24UnderstandIncomingMedia(text,attachment):text; const localClient=`,
    "comprensión multimedia API oficial",
  );

  out = replaceOne(
    out,
    /const isolated=await tryConsumeIsolatedCommunication\(\{phone,text:text\|\|messageLabel\(attachment\)\|\|"Archivo recibido",lineId:line\.id,branchId:line\.branchId,messageId:item\.id\}\);/,
    `const isolated=await tryConsumeIsolatedCommunication({phone,text:v24CloudBotText||text||messageLabel(attachment)||"Archivo recibido",lineId:line.id,branchId:line.branchId,messageId:item.id});`,
    "multimedia API en comunicación aislada",
  );

  // El parche base V24 usaba el nombre v24BotText en el bloque compacto de Cloud.
  // Se reemplaza por una variable exclusiva de Cloud para que nunca dependa del flujo QR.
  out = replaceOne(
    out,
    /if\(v24BotText\|\|text\) captureIncomingClientData\(deal,v24BotText\|\|text,\{allowAi:true\}\);/,
    `if(v24CloudBotText||text) captureIncomingClientData(deal,v24CloudBotText||text,{allowAi:true});`,
    "captura inteligente multimedia API",
  );

  out = replaceOne(
    out,
    /queueIncomingSuperAutomation\(\{deal,text:v24BotText\|\|text,line,created,message:\{text:v24BotText\|\|text,id:item\.id\}\}\); if\(data\.settings\.botEnabled&&line\.botEnabled!==false&&deal\.botActive&&\(v24BotText\|\|text\)\)void maybeReplyWithBot\(deal,v24BotText\|\|text\);/,
    `queueIncomingSuperAutomation({deal,text:v24CloudBotText||text,line,created,message:{text:v24CloudBotText||text,id:item.id}}); if(data.settings.botEnabled&&line.botEnabled!==false&&deal.botActive&&(v24CloudBotText||text))void maybeReplyWithBot(deal,v24CloudBotText||text);`,
    "bot multimedia API oficial",
  );

  // QR: la comprensión multimedia se ejecuta únicamente sobre mensajes nuevos, no
  // durante una recuperación masiva del historial, y el texto enriquecido recorre
  // aislamiento, captura inteligente, opt-out, automatizaciones y bot.
  out = replaceOne(
    out,
    /const v24BotText = \(!item\.key\?\.fromMe && attachment\) \? await v24UnderstandIncomingMedia\(text, attachment\) : text;\n    const occurredAt = messageTime\(item\.messageTimestamp\);\n    const historical = source !== "notify" \|\| Date\.now\(\) - occurredAt >= 3 \* 60 \* 1000;/,
    `const v24MediaCandidate = !item.key?.fromMe && attachment;\n    const occurredAt = messageTime(item.messageTimestamp);\n    const historical = source !== "notify" || Date.now() - occurredAt >= 3 * 60 * 1000;\n    const v24BotText = (!historical && v24MediaCandidate) ? await v24UnderstandIncomingMedia(text, attachment) : text;`,
    "multimedia QR solo en mensajes nuevos",
  );

  out = replaceOne(
    out,
    /const isolated = await tryConsumeIsolatedCommunication\(\{ phone, text, lineId, branchId, messageId \}\);/,
    `const isolated = await tryConsumeIsolatedCommunication({ phone, text: v24BotText || text, lineId, branchId, messageId });`,
    "multimedia QR en comunicación aislada",
  );

  out = replaceOne(
    out,
    /if \(!historical && text\) captureIncomingClientData\(deal,text,\{allowAi:true\}\);/,
    `if (!historical && (v24BotText || text)) captureIncomingClientData(deal,v24BotText || text,{allowAi:true});`,
    "captura inteligente multimedia QR",
  );

  out = replaceOne(
    out,
    /applyMarketingOptOut\(deal, text\);/,
    `applyMarketingOptOut(deal, v24BotText || text);`,
    "opt-out por audio QR",
  );

  out = replaceOne(
    out,
    /queueIncomingSuperAutomation\(\{ deal, text, line: incomingLine, created, message: \{ text, id: messageId \} \}\);/,
    `queueIncomingSuperAutomation({ deal, text: v24BotText || text, line: incomingLine, created, message: { text: v24BotText || text, id: messageId } });`,
    "automatización multimedia QR",
  );

  out = replaceOne(
    out,
    /botQueue\.set\(deal\.id, \{ deal, text, occurredAt \}\);/,
    `botQueue.set(deal.id, { deal, text: v24BotText || text, occurredAt });`,
    "bot multimedia QR",
  );

  // La versión base no tiene un helper addInternalNotification. La derivación debe
  // usar el registro de actividad ya existente en el CRM en lugar de llamar una API inexistente.
  out = replaceOne(
    out,
    /addInternalNotification\(targetUser\.id, "Negociación derivada", [^;]+\);/,
    `addActivity(data, actor.name + " derivó a " + (client?.name || deal.name) + " a " + targetUser.name + ".", "success");`,
    "actividad interna de derivación",
  );

  return out;
}
