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
import { applyV269AccessControlStable } from "../lib/v26-9-access-control-wrapper.mjs";
import { applyV2610LiveSupportBotLinePatches } from "../lib/v26-10-live-support-bot-lines-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
function restoreGeneratedTemplates(source,startMarker,endMarker){const start=source.indexOf(startMarker),end=source.indexOf(endMarker,start+startMarker.length);assert.ok(start>=0&&end>start,`No se encontró ${startMarker}`);const block=source.slice(start,end).replaceAll("\\`","`").replaceAll("\\${","${");return source.slice(0,start)+block+source.slice(end);}

const core = await readFile(path.join(appDir, "server-core.mjs"), "utf8");
let patched = applyV24ServerPatches(core);
patched = applyV24CloudPatches(patched);
patched = applyV241ServerPatches(patched);
patched = applyV254ServerPatches(patched);
patched = restoreGeneratedTemplates(patched,"async function v24TranscribeMediaAttachment","async function maybeReplyWithBot");
patched = restoreGeneratedTemplates(patched,'function v24ActiveObserverGrant','app.post("/api/deals/:id/transfer"');
patched = applyV257FormPatches(patched);
patched = applyV256SecurityPatches(patched);
patched = applyV258ReportAiPatches(patched);
patched = applyV259SupportPatches(patched);
patched = applyV2510SocialPatches(patched);
patched = applyV2511OmnichannelPatches(patched);
patched = applyV2512SocialPlatformPatches(patched);
patched = applyV262WhatsappPatches(patched);
patched = applyV263QrRecoveryPatches(patched);
patched = applyV264PlatformReliabilityCatalogPatches(patched);
patched = applyV265MediaReliabilityPatches(patched);
patched = applyV266MediaRetryPatches(patched);
patched = applyV268WhatsappEditPatches(patched);
patched = applyV269AccessControlStable(patched);
patched = applyV2610LiveSupportBotLinePatches(patched);

assert.doesNotMatch(patched,/\/api\/live-support/,"El backend no debe conservar endpoints de soporte en vivo.");
assert.doesNotMatch(patched,/v2610LiveSupportSessions|v2610LiveSupportSubscribers/,"El backend no debe mantener sesiones ni streams de soporte.");
assert.match(patched,/app\.post\("\/api\/whatsapp-lines\/:id\/bot-config", requireAdmin/,"La configuración del bot por número debe seguir siendo exclusiva del Admin.");
assert.match(patched,/botConfig:v2610PublicBotConfig\(line\)/,"Cada línea pública debe exponer su configuración de bot sin secretos.");
assert.match(patched,/v2610BotBaseInstructions\(deal\)/,"La respuesta automática debe usar instrucciones por número.");
assert.match(patched,/model: v2610BotModelFor\(deal\)/,"La respuesta automática debe usar modelo por número.");
assert.match(patched,/if \(!v2610BotCanReserveFor\(deal\)\)/,"La reserva automática debe respetar la configuración de la línea.");
assert.match(patched,/!v2610BotFollowupEnabled\(deal\)/,"El seguimiento debe poder activarse o desactivarse por número.");

const generated = path.join(appDir, ".v26-14-bot-generated-check.mjs");
await writeFile(generated, patched, "utf8");
const syntax = spawnSync(process.execPath, ["--check", generated], { encoding: "utf8" });
await rm(generated, { force: true });
assert.equal(syntax.status, 0, `El servidor generado debe ser válido: ${syntax.stderr || syntax.stdout}`);

const ui = await readFile(path.join(appDir, "public", "v26-10.js"), "utf8");
const css = await readFile(path.join(appDir, "public", "v26-10.css"), "utf8");
const loader = await readFile(path.join(appDir, "public", "v26-1.js"), "utf8");
const server = await readFile(path.join(appDir, "server.mjs"), "utf8");

assert.match(ui,/Bots por número/,"Admin debe conservar el editor de bots por número.");
assert.match(ui,/v2610-bot-instructions/,"Cada número debe aceptar instrucciones propias.");
assert.match(ui,/v2610-bot-tone/,"Cada número debe aceptar tono propio.");
assert.doesNotMatch(ui,/live-support|Soporte en vivo|EventSource|sendAgentTelemetry|buildSnapshot/,"El frontend no debe conservar captura, polling ni streams de soporte en vivo.");
assert.doesNotMatch(css,/v2610-live-viewer|v2610-support-request|v2610-agent-indicator|v2610-remote-cursor/,"El CSS no debe conservar componentes del soporte en vivo.");
assert.match(loader,/\/v26-14\.js\?v=26140/,"El loader debe activar la capa de rendimiento V26.14.");
assert.match(server,/applyV2614PerformancePatches/,"El servidor debe activar V26.14.");
assert.doesNotMatch(server,/applyV2612LiveSupportFluencyPatches|applyV2613LiveSupportChatPatches/,"El servidor no debe reactivar versiones de soporte en vivo.");

for (const file of ["v26-10.js","v26-14.js"]) {
  const check = spawnSync(process.execPath, ["--check", path.join(appDir,"public",file)], { encoding:"utf8" });
  assert.equal(check.status,0,`${file} debe tener sintaxis válida: ${check.stderr||check.stdout}`);
}

console.log("OK · V26.14 soporte en vivo retirado y bot independiente por número conservado.");
