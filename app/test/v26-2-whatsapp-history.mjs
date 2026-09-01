import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
import { createInitialData, recordIncoming } from "../lib/domain-v26.mjs";

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

assert.match(patched,/from "\.\/lib\/domain-v26\.mjs";/,"El servidor debe usar el adaptador que preserva mensajes.");
assert.match(patched,/\/api\/deals\/:id\/full-history/,"Debe existir un endpoint de historial completo.");
assert.match(patched,/function v262WhatsappHistory/,"Debe agrupar el historial por cliente/teléfono.");
assert.match(patched,/messages: v262WhatsappHistory\(deal, user\)/,"La bandeja debe recibir el historial completo.");
assert.match(patched,/connection\?\.status!=="connected"[\s\S]*disconnectWhatsappLineConnection\(line\.id\)[\s\S]*startWhatsappLineConnection\(line\.id\)/,"Un reintento QR debe limpiar la sesión antes de generar otra.");
assert.doesNotMatch(patched,/thread\.messages\.length>500/,"Las redes sociales no deben borrar mensajes antiguos.");
assert.doesNotMatch(patched,/messages:\(thread\.messages\|\|\[\]\)\.slice\(-250\)/,"La API social no debe recortar el historial.");

const data=createInitialData();
const jid="595981123456@s.whatsapp.net";
for(let index=0;index<360;index+=1){
  recordIncoming(data,{jid,name:"Cliente Historial",text:`Mensaje ${index+1}`,messageId:`history-test-${index+1}`,now:Date.now()+index});
}
const deal=data.deals.find((entry)=>entry.jid===jid);
assert.ok(deal,"La prueba debe crear una negociación.");
assert.equal(deal.messages.length,360,"V26.2 no debe perder mensajes al superar el límite legacy de 300.");
assert.equal(deal.messages[0].text,"Mensaje 1","El primer mensaje debe seguir almacenado.");
assert.equal(deal.messages.at(-1).text,"Mensaje 360","El último mensaje debe seguir almacenado.");

const css=await readFile(path.join(appDir,"public","v26-2.css"),"utf8");
const js=await readFile(path.join(appDir,"public","v26-2.js"),"utf8");
const loader=await readFile(path.join(appDir,"public","v26-1.js"),"utf8");
const sw=await readFile(path.join(appDir,"public","sw.js"),"utf8");

assert.match(css,/\.v2511-message\{[\s\S]*width:fit-content/s,"La burbuja omnicanal debe ajustarse al texto.");
assert.match(css,/#drawer-messages\.message-list \.message:not\(\.system\)\{[\s\S]*width:fit-content/s,"La burbuja del drawer debe ajustarse al texto.");
assert.match(js,/\/api\/deals\/\$\{encodeURIComponent\(dealId\)\}\/full-history/,"El drawer debe solicitar el historial completo.");
assert.match(js,/window\.openDrawer=wrapped/,"La apertura de una negociación debe recargar su historial completo.");
assert.doesNotMatch(js,/new MutationObserver/,"La mejora no debe introducir observadores globales.");
assert.match(loader,/\/v26-2\.css\?v=26020/,"V26.1.1 debe cargar los estilos V26.2.");
assert.match(loader,/\/v26-2\.js\?v=26020/,"V26.1.1 debe cargar la lógica V26.2.");
assert.match(sw,/whatsbot-mobile-v26-2-production-shell/,"La PWA debe renovar la caché para V26.2.");
assert.match(sw,/"\/v26-2\.css"/,"La PWA debe cachear los estilos V26.2.");
assert.match(sw,/"\/v26-2\.js"/,"La PWA debe cachear la lógica V26.2.");

console.log("OK · V26.2 QR renovable, historial completo y burbujas naturales validados.");
