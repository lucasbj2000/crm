import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyV24ServerPatches } from "../lib/v24-server-patches.mjs";
import { applyV24CloudPatches } from "../lib/v24-cloud-patches.mjs";
import { applyV241ServerPatches } from "../lib/v24-1-server-patches.mjs";
import { applyV254ServerPatches } from "../lib/v25-4-server-patches.mjs";
import { applyV257FormPatches } from "../lib/v25-7-form-patches.mjs";
import { applyV256SecurityPatches } from "../lib/v25-6-security-patches.mjs";
import { applyV258ReportAiPatches } from "../lib/v25-8-report-ai-patches.mjs";
import { applyV259SupportPatches } from "../lib/v25-9-support-patches.mjs";
import { applyV2510SocialPatches } from "../lib/v25-10-social-patches.mjs";
import { applyV2511OmnichannelPatches } from "../lib/v25-11-omnichannel-patches.mjs";
import { applyV2512SocialPlatformPatches } from "../lib/v25-12-social-platform-patches.mjs";
import { applyV262WhatsappPatches } from "../lib/v26-2-whatsapp-patches.mjs";
import { applyV263QrRecoveryPatches } from "../lib/v26-3-qr-recovery-patches.mjs";
import { applyV264PlatformReliabilityCatalogPatches } from "../lib/v26-4-platform-reliability-catalog-patches.mjs";
import { applyV265MediaReliabilityPatches } from "../lib/v26-5-media-reliability-patches.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const appDir=path.resolve(here,"..");

function restoreGeneratedTemplates(source,startMarker,endMarker){
  const start=source.indexOf(startMarker);
  const end=source.indexOf(endMarker,start+startMarker.length);
  assert.ok(start>=0&&end>start,`No se encontró bloque ${startMarker}`);
  const block=source.slice(start,end).replaceAll("\\`","`").replaceAll("\\${","${");
  return source.slice(0,start)+block+source.slice(end);
}

const core=await readFile(path.join(appDir,"server-core.mjs"),"utf8");
let patched=applyV24ServerPatches(core);
patched=applyV24CloudPatches(patched);
patched=applyV241ServerPatches(patched);
patched=applyV254ServerPatches(patched);
patched=restoreGeneratedTemplates(patched,"async function v24TranscribeMediaAttachment","async function maybeReplyWithBot");
patched=restoreGeneratedTemplates(patched,'function v24ActiveObserverGrant','app.post("/api/deals/:id/transfer"');
patched=applyV257FormPatches(patched);
patched=applyV256SecurityPatches(patched);
patched=applyV258ReportAiPatches(patched);
patched=applyV259SupportPatches(patched);
patched=applyV2510SocialPatches(patched);
patched=applyV2511OmnichannelPatches(patched);
patched=applyV2512SocialPlatformPatches(patched);
patched=applyV262WhatsappPatches(patched);
patched=applyV263QrRecoveryPatches(patched);
patched=applyV264PlatformReliabilityCatalogPatches(patched);
patched=applyV265MediaReliabilityPatches(patched);

assert.match(patched,/async function downloadIncomingAttachment\(item, info, sourceSocket = null\)/,"La descarga debe recibir el socket que originó el mensaje.");
assert.match(patched,/lineSocket\(lineId\) \|\| branchSocket\(branchId\) \|\| whatsappSocket/,"Cada línea debe usar su propio socket para multimedia.");
assert.match(patched,/for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/,"La descarga debe reintentar antes de marcar el archivo como fallido.");
assert.match(patched,/let workingItem = item/,"Los reintentos deben trabajar sobre el mensaje multimedia más reciente.");
assert.match(patched,/const refreshed = await socket\.updateMediaMessage\(message\)/,"El reupload debe pedir a WhatsApp un mensaje actualizado.");
assert.match(patched,/workingItem = usable/,"El mensaje actualizado debe reemplazar al mensaje viejo durante la descarga.");
assert.match(patched,/return usable;/,"El callback reuploadRequest debe devolver el mensaje actualizado a Baileys.");
assert.match(patched,/workingItem = await v265RefreshMedia\(workingItem, socket\)/,"Los reintentos manuales también deben conservar el mensaje refrescado.");
assert.match(patched,/downloadContentFromMessage/,"Debe existir un segundo método de descarga por stream.");
assert.match(patched,/v265StreamDownload\(workingItem, info\)/,"El fallback por stream debe usar el mensaje refrescado y no el original vencido.");
assert.match(patched,/content\.imageMessage/,"Debe cubrir imágenes.");
assert.match(patched,/content\.videoMessage/,"Debe cubrir videos.");
assert.match(patched,/content\.audioMessage/,"Debe cubrir audios y notas de voz.");
assert.match(patched,/content\.documentMessage/,"Debe cubrir documentos.");
assert.match(patched,/content\.stickerMessage/,"Debe cubrir stickers.");
assert.match(patched,/maximumMediaBytes/,"La recuperación debe conservar el límite de seguridad de archivos.");

const generated=path.join(appDir,".v26-5-generated-check.mjs");
await writeFile(generated,patched,"utf8");
const syntax=spawnSync(process.execPath,["--check",generated],{encoding:"utf8"});
await rm(generated,{force:true});
assert.equal(syntax.status,0,`El servidor generado V26.5 debe ser sintácticamente válido: ${syntax.stderr||syntax.stdout}`);

const server=await readFile(path.join(appDir,"server.mjs"),"utf8");
const ui=await readFile(path.join(appDir,"public","app.js"),"utf8");
assert.match(server,/applyV265MediaReliabilityPatches/,"El servidor debe activar V26.5 después de V26.4.");
assert.match(ui,/attachment\.kind === "image"/,"La conversación debe renderizar imágenes inline.");
assert.match(ui,/attachment\.kind === "video"/,"La conversación debe renderizar videos con controles.");
assert.match(ui,/attachment\.kind === "audio"/,"La conversación debe renderizar audios con controles.");
assert.match(ui,/download=/,"Los documentos deben seguir disponibles para descarga.");

console.log("OK · V26.5.1 reupload devuelve y reutiliza el mensaje multimedia actualizado de WhatsApp.");
