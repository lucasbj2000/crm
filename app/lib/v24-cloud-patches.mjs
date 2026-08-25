function replaceOne(source, pattern, replacement, label) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) {
    throw new Error(`V24 Cloud patch "${label}" esperaba 1 coincidencia y encontró ${matches.length}.`);
  }
  return source.replace(pattern, replacement);
}

export function applyV24CloudPatches(source) {
  let out = source;

  out = replaceOne(
    out,
    /const cloudAudioTypes=new Set\(\["audio\/aac","audio\/amr","audio\/mpeg","audio\/mp4","audio\/ogg"\]\);\n    const type=info\.kind==="audio"&&!cloudAudioTypes\.has\(info\.mimeType\)\?"document":info\.kind==="document"\?"document":info\.kind;\n    const uploadInfo=type==="document"&&info\.kind==="audio"\?\{\.\.\.info,kind:"document",mimeType:"application\/octet-stream"\}:info;/,
    `const cloudAudioTypes=new Set(["audio/aac","audio/amr","audio/mpeg","audio/mp4","audio/ogg"]);\n    const normalizedAudioMime=info.kind==="audio"?(cleanText(info.mimeType||"audio/mp4",160).split(";")[0]||"audio/mp4").toLowerCase().replace("audio/x-m4a","audio/mp4"):info.mimeType;\n    const normalizedMediaInfo=info.kind==="audio"?{...info,mimeType:normalizedAudioMime}:info;\n    const type=info.kind==="audio"&&!cloudAudioTypes.has(normalizedAudioMime)?"document":info.kind==="document"?"document":info.kind;\n    const uploadInfo=type==="document"&&info.kind==="audio"?{...normalizedMediaInfo,kind:"document",mimeType:"application/octet-stream"}:normalizedMediaInfo;`,
    "audio saliente API oficial",
  );

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

  out = replaceOne(
    out,
    /if\(text\) captureIncomingClientData\(deal,text,\{allowAi:true\}\);/,
    `if(v24CloudBotText||text) captureIncomingClientData(deal,v24CloudBotText||text,{allowAi:true});`,
    "captura inteligente multimedia API",
  );

  out = replaceOne(
    out,
    /queueIncomingSuperAutomation\(\{deal,text,line,created,message:\{text,id:item\.id\}\}\); if\(data\.settings\.botEnabled&&line\.botEnabled!==false&&deal\.botActive&&text\)void maybeReplyWithBot\(deal,text\);/,
    `queueIncomingSuperAutomation({deal,text:v24CloudBotText||text,line,created,message:{text:v24CloudBotText||text,id:item.id}}); if(data.settings.botEnabled&&line.botEnabled!==false&&deal.botActive&&(v24CloudBotText||text))void maybeReplyWithBot(deal,v24CloudBotText||text);`,
    "bot multimedia API oficial",
  );

  return out;
}
