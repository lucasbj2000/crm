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

assert.match(patched,/lookup as dnsLookup/,"Los catálogos deben validar DNS para evitar redes privadas.");
assert.match(patched,/function v264PrivateIp/,"Debe bloquear destinos privados en catálogos externos.");
assert.match(patched,/async function v264SearchExternalCatalog/,"Debe existir el buscador externo por empresa.");
assert.match(patched,/\/api\/catalog-sources/,"Debe existir administración de enlaces de catálogo.");
assert.match(patched,/\/api\/catalog-search/,"Debe existir búsqueda externa desde Stock.");
assert.match(patched,/searchUrlTemplate/,"Debe soportar URLs de búsqueda con {query}.");
assert.match(patched,/referenciasCatalogo/,"La herramienta IA de stock debe recibir referencias externas.");
assert.match(patched,/NO afirmes disponibilidad/,"La IA nunca debe convertir un catálogo externo en disponibilidad confirmada.");
assert.match(patched,/availabilityConfirmed: false/,"Los resultados externos deben quedar explícitamente sin disponibilidad confirmada.");
assert.match(patched,/\.qr-write-test-/,"Health debe comprobar escritura real del directorio QR.");
assert.match(patched,/qrEngine: \{ ready: true/,"Health debe declarar que el motor QR está listo solo después del preflight.");
assert.match(patched,/async function createCopilotSuggestion[\s\S]*v264SearchExternalCatalog/s,"El copiloto debe consultar catálogo si el stock interno no encuentra el producto.");

const generated=path.join(appDir,".v26-4-generated-check.mjs");
await writeFile(generated,patched,"utf8");
const syntax=spawnSync(process.execPath,["--check",generated],{encoding:"utf8"});
await rm(generated,{force:true});
assert.equal(syntax.status,0,`El servidor generado V26.4 debe ser sintácticamente válido: ${syntax.stderr||syntax.stdout}`);

const ui=await readFile(path.join(appDir,"public","v26-4.js"),"utf8");
const css=await readFile(path.join(appDir,"public","v26-4.css"),"utf8");
const loader=await readFile(path.join(appDir,"public","v26-1.js"),"utf8");
const sw=await readFile(path.join(appDir,"public","sw.js"),"utf8");
const server=await readFile(path.join(appDir,"server.mjs"),"utf8");

assert.match(ui,/CATÁLOGO EXTERNO/,"Stock debe mostrar el sector de catálogo externo.");
assert.match(ui,/data-v264-fallback-search/,"Cuando el stock local queda vacío debe ofrecer búsqueda externa.");
assert.match(ui,/Agregar al stock/,"Un gerente o administrador debe poder pasar una referencia externa al stock interno.");
assert.match(ui,/Disponibilidad no confirmada/,"La interfaz debe advertir la disponibilidad no confirmada.");
assert.match(ui,/searchUrlTemplate/,"La UI debe permitir configurar el patrón de búsqueda de cada web.");
assert.match(css,/v264-catalog-zone/,"Debe existir layout responsive del catálogo externo.");
assert.match(loader,/\/v26-4\.js\?v=26040/,"El CRM debe cargar la lógica V26.4.");
assert.match(loader,/\/v26-4\.css\?v=26040/,"El CRM debe cargar los estilos V26.4.");
assert.match(sw,/whatsbot-mobile-v26-4-production-shell/,"La PWA debe invalidar la caché anterior.");
assert.match(sw,/"\/v26-4\.js"/,"La PWA debe cachear V26.4 JS.");
assert.match(sw,/"\/v26-4\.css"/,"La PWA debe cachear V26.4 CSS.");
assert.match(server,/applyV264PlatformReliabilityCatalogPatches/,"El servidor debe aplicar V26.4 después de V26.3.");
assert.doesNotMatch(ui,/new MutationObserver/,"La mejora no debe agregar observadores globales inestables.");

console.log("OK · V26.4 catálogo externo seguro, fallback IA y preflight QR validados.");
