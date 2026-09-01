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
import { applyV266MediaRetryPatches } from "../lib/v26-6-media-retry-patches.mjs";
import { applyV268WhatsappEditPatches } from "../lib/v26-8-whatsapp-edit-patches.mjs";

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
patched=applyV266MediaRetryPatches(patched);
patched=applyV268WhatsappEditPatches(patched);

assert.match(patched,/const protocol = content\?\.protocolMessage[\s\S]*protocol\?\.editedMessage/,"Debe reconocer protocolMessage.editedMessage de WhatsApp.");
assert.match(patched,/v268ApplyWhatsappEdit\(item, \{ branchId, lineId \}\)/,"messages.upsert debe consumir ediciones antes de tratarlas como mensajes nuevos.");
assert.ok((patched.match(/\.ev\.on\("messages\.update"/g)||[]).length>=3,"Debe escuchar messages.update en principal, sucursales y líneas adicionales.");
assert.match(patched,/record\.message\.editHistory = history/,"Debe conservar un historial interno de textos anteriores.");
assert.match(patched,/record\.message\.editedAt = editedAt/,"Debe marcar cuándo fue editado.");
assert.match(patched,/messages\.at\(-1\) === record\.message[\s\S]*deal\.lastMessage/,"Si era el último mensaje debe actualizar también el resumen de la conversación.");
assert.match(patched,/edited: message\.edited === true \|\| Boolean\(message\.editedAt\)/,"La API debe exponer el estado editado sin exponer el historial interno.");
assert.doesNotMatch(patched,/editHistory: message\.editHistory/,"La API no debe exponer versiones anteriores al navegador.");

const generated=path.join(appDir,".v26-8-generated-check.mjs");
await writeFile(generated,patched,"utf8");
const syntax=spawnSync(process.execPath,["--check",generated],{encoding:"utf8"});
await rm(generated,{force:true});
assert.equal(syntax.status,0,`El servidor generado V26.8 debe ser válido: ${syntax.stderr||syntax.stdout}`);

const ui=await readFile(path.join(appDir,"public","v26-8.js"),"utf8");
const loader=await readFile(path.join(appDir,"public","v26-1.js"),"utf8");
const sw=await readFile(path.join(appDir,"public","sw.js"),"utf8");
const server=await readFile(path.join(appDir,"server.mjs"),"utf8");

assert.match(ui,/v268-edited-label/,"La UI debe mostrar la etiqueta editado.");
assert.match(ui,/full-history/,"La UI debe detectar las respuestas de historial completo.");
assert.match(ui,/\/api\/omnichannel\/inbox/,"La bandeja unificada debe reconocer mensajes editados.");
assert.doesNotMatch(ui,/new MutationObserver/,"El indicador de edición no debe introducir observadores que repinten la pantalla.");
assert.match(loader,/\/v26-8\.js\?v=26080/,"El loader debe cargar V26.8 después de V26.7.");
assert.match(sw,/whatsbot-mobile-v26-8-production-shell/,"La PWA debe renovar la caché a V26.8.");
assert.match(sw,/"\/v26-8\.js"/,"La PWA debe cachear V26.8.");
assert.match(server,/applyV268WhatsappEditPatches/,"El servidor debe activar el parche V26.8.");

console.log("OK · V26.8 mensajes editados de WhatsApp sin duplicados y con etiqueta editado validados.");
