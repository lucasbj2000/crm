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

assert.match(patched,/downloadIncomingAttachment\(item, info, sourceSocket = null, attachmentId = makeId\("attachment"\)\)/,"El reintento debe conservar el mismo ID del archivo.");
assert.match(patched,/setDefaultResultOrder\("ipv4first"\)/,"La descarga debe preferir IPv4 para evitar timeouts del CDN multimedia.");
assert.match(patched,/v266RetryPayload\(item, info, lineId, branchId\)/,"Los mensajes multimedia fallidos deben guardar datos suficientes para reintento.");
assert.match(patched,/app\.post\("\/api\/media\/:id\/retry"/,"Debe existir una ruta autenticada de reintento manual.");
assert.match(patched,/v266ScheduleMediaRetry\(attachment\.id, 2500\)/,"Un archivo fallido debe iniciar reintentos automáticos.");
assert.match(patched,/attachment: v266PublicAttachment\(message\.attachment\)/,"El historial no debe exponer claves internas del medio.");
assert.match(patched,/retryable: !available && Boolean\(attachment\.retry\)/,"La UI debe saber si el archivo puede recuperarse.");

const generated=path.join(appDir,".v26-6-generated-check.mjs");
await writeFile(generated,patched,"utf8");
const syntax=spawnSync(process.execPath,["--check",generated],{encoding:"utf8"});
await rm(generated,{force:true});
assert.equal(syntax.status,0,`El servidor generado V26.6 debe ser válido: ${syntax.stderr||syntax.stdout}`);

const ui=await readFile(path.join(appDir,"public","v26-2.js"),"utf8");
const silent=await readFile(path.join(appDir,"public","v26-6.js"),"utf8");
const stable=await readFile(path.join(appDir,"public","v26-7.js"),"utf8");
const css=await readFile(path.join(appDir,"public","v26-6.css"),"utf8");
const loader=await readFile(path.join(appDir,"public","v26-1.js"),"utf8");
const sw=await readFile(path.join(appDir,"public","sw.js"),"utf8");
const server=await readFile(path.join(appDir,"server.mjs"),"utf8");

const stableSyntax=spawnSync(process.execPath,["--check",path.join(appDir,"public","v26-7.js")],{encoding:"utf8"});
assert.equal(stableSyntax.status,0,`V26.7 debe ser JavaScript válido: ${stableSyntax.stderr||stableSyntax.stdout}`);

assert.match(ui,/data-v266-media-retry/,"Los archivos fallidos deben mostrar un botón de reintento.");
assert.match(ui,/data-v266-open-media/,"Las imágenes deben poder abrirse desde la conversación.");
assert.match(ui,/node\.replaceWith\(replacement\)/,"El historial debe reemplazar solo el mensaje que cambió.");
assert.match(ui,/list\.appendChild\(node\)/,"Los mensajes nuevos deben agregarse incrementalmente.");
assert.doesNotMatch(ui,/function renderFullHistory\([\s\S]{0,250}?list\.innerHTML=messages\.map/,"El historial no debe reconstruirse entero en cada sincronización.");
assert.match(silent,/backgroundStateObject/,"La capa silenciosa debe identificar las cargas originadas por polling.");
assert.match(silent,/window\.renderAll=\(\)=>\{\}/,"El polling no debe re-renderizar todo el CRM.");
assert.match(silent,/renderVisibleSlice/,"Solo la vista visible debe actualizarse después del polling.");
assert.match(css,/v266-silent-sync/,"Las actualizaciones silenciosas deben desactivar animaciones transitorias.");

assert.match(stable,/guardedIds=new Set\(\["v2511-messages","v2511-list","v2511-quick","drawer-messages","drawer-quick-reply"\]\)/,"V26.7 debe proteger la bandeja y el drawer contra reconstrucciones idénticas.");
assert.match(stable,/if\(current===next\)return;/,"Una actualización con el mismo HTML debe ser un no-op real.");
assert.match(stable,/messageIds=new Set\(\["v2511-messages","drawer-messages"\]\)/,"V26.7 debe proteger el scroll de ambos historiales.");
assert.match(stable,/age>250&&forcingBottom&&\(composing\|\|userReadingAbove\)/,"El polling no debe forzar el scroll al fondo mientras el agente escribe o lee mensajes anteriores.");
assert.match(stable,/animation:none!important;transition:none!important/,"La conversación debe permanecer visualmente estable durante sincronizaciones.");
assert.match(loader,/v26-6\.js\?v=26060/,"El loader debe conservar V26.6.");
assert.match(loader,/v26-7\.js\?v=26070/,"El loader debe cargar V26.7 después de V26.6.");
assert.match(sw,/whatsbot-mobile-v26-7-production-shell/,"La PWA debe renovar su caché a V26.7.");
assert.match(sw,/"\/v26-7\.js"/,"La PWA debe cachear el estabilizador V26.7.");
assert.match(server,/applyV266MediaRetryPatches/,"El servidor debe conservar la recuperación multimedia V26.6.");

console.log("OK · V26.7 multimedia recuperable y conversación visualmente estable validados.");
