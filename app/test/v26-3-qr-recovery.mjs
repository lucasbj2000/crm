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
import { applyV263QrRecoveryPatches } from "../lib/v26-3-qr-recovery-patches.mjs";

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

assert.match(patched,/let v263PrimaryGeneration = 0;/,"Debe invalidar intentos QR viejos del WhatsApp principal.");
assert.match(patched,/async function v263CloseWhatsappSocket/,"Debe cerrar sockets trabados con un límite de espera.");
assert.match(patched,/async function v263ResolveWhatsappVersion/,"La consulta de versión no debe bloquear indefinidamente el QR.");
assert.match(patched,/async function v263WaitForQrState/,"La API debe esperar un estado real de QR, conexión o error.");
assert.match(patched,/app\.post\("\/api\/connect"[\s\S]*await disconnect\(\)[\s\S]*await startConnection\(\)[\s\S]*v263WaitForQrState/s,"El botón principal debe limpiar la sesión, crear otra y esperar el QR.");
assert.match(patched,/app\.post\("\/api\/branches\/:id\/connect"[\s\S]*v263WaitForQrState/s,"Las sucursales deben esperar un QR real.");
assert.match(patched,/app\.post\("\/api\/whatsapp-lines\/:id\/connect"[\s\S]*v263WaitForQrState/s,"Las líneas adicionales deben esperar un QR real.");
assert.match(patched,/v263PrimaryGeneration \+= 1;\n  startingPromise = null;/,"Desconectar debe invalidar y liberar una generación principal anterior.");
assert.match(patched,/runtime\.generation = Number\(runtime\.generation \|\| 0\) \+ 1; runtime\.startingPromise = null;/,"Desconectar una sucursal debe liberar un intento anterior.");
assert.match(patched,/runtime\.generation=Number\(runtime\.generation\|\|0\)\+1;runtime\.startingPromise=null;/,"Desconectar una línea debe liberar un intento anterior.");
assert.match(patched,/lastError = cleanText\(error\?\.message/,"El backend debe conservar el error técnico real de generación.");
assert.match(patched,/\.\.\.\(version \? \{ version \} : \{\}\)/,"La conexión principal debe poder continuar si falla la consulta remota de versión.");

const ui=await readFile(path.join(appDir,"public","v26-3.js"),"utf8");
const loader=await readFile(path.join(appDir,"public","v26-1.js"),"utf8");
const sw=await readFile(path.join(appDir,"public","sw.js"),"utf8");
const server=await readFile(path.join(appDir,"server.mjs"),"utf8");

assert.match(ui,/#connect-button/,"V26.3 debe interceptar el botón principal Generar QR.");
assert.match(ui,/stopImmediatePropagation\(\)/,"Debe impedir la doble ejecución del handler legacy.");
assert.match(ui,/\/api\/connect/,"El controlador nuevo debe usar la ruta principal corregida.");
assert.match(ui,/data-branch-action="connect"/,"También debe controlar el QR de sucursales.");
assert.match(ui,/restoreViewport/,"La generación del QR no debe mover al usuario hacia arriba.");
assert.match(ui,/connection\.status==="qr"&&connection\.qr/,"La interfaz debe exigir un QR real antes de confirmar éxito.");
assert.match(loader,/\/v26-3\.js\?v=26030/,"El CRM debe cargar el controlador QR V26.3.");
assert.match(sw,/whatsbot-mobile-v26-3-production-shell/,"La PWA debe invalidar la caché anterior.");
assert.match(sw,/"\/v26-3\.js"/,"La PWA debe incluir el controlador QR V26.3.");
assert.match(server,/applyV263QrRecoveryPatches/,"El servidor debe aplicar V26.3 después de V26.2.");
assert.doesNotMatch(ui,/new MutationObserver/,"El hotfix QR no debe agregar observadores globales.");

console.log("OK · V26.3 recuperación QR principal, sucursales, líneas y viewport validados.");
