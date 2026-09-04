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
import { applyV2611MessageReliabilityPatches } from "../lib/v26-11-message-reliability-patches.mjs";

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
patched = applyV2611MessageReliabilityPatches(patched);

assert.match(patched,/const v2611IncomingQueues = new Map\(\)/,"Los mensajes entrantes deben serializarse por línea.");
assert.match(patched,/const v2611OutgoingQueues = new Map\(\)/,"Los mensajes salientes deben serializarse por línea.");
assert.match(patched,/for \(let attempt = 1; attempt <= 4; attempt \+= 1\)/,"La entrada debe reintentarse hasta cuatro veces.");
assert.match(patched,/const maxAttempts = 5/,"La salida debe tener hasta cinco intentos controlados.");
assert.match(patched,/v2611ReleaseUncommitted\(ids\)/,"Un mensaje que falló antes de guardarse debe liberarse para poder reintentarse.");
assert.match(patched,/data\.processedMessageIds\.push\(id\)/,"Los mensajes procesados deben persistirse para deduplicación tras reinicio.");
assert.match(patched,/socket\.sendMessage\(deal\.jid, \{ text \}, \{ messageId: outbox\.providerMessageId \}\)/,"Los reintentos QR deben reutilizar el mismo ID para reducir duplicados.");
assert.match(patched,/message-receipt\.update/,"Se deben escuchar acuses de entrega QR.");
assert.match(patched,/v2611HandleCloudStatuses\(body\)/,"Se deben procesar estados sent\/delivered\/read\/failed de Cloud API.");
assert.match(patched,/app\.get\("\/api\/message-reliability", requireAdmin/,"El Administrador debe poder auditar la confiabilidad de mensajes.");
assert.match(patched,/mensaje_whatsapp_fallo_confirmacion/,"Un fallo saliente definitivo debe quedar auditado.");
assert.match(patched,/no pudo procesarse tras 4 intentos/,"Un fallo entrante definitivo debe quedar visible y no ocultarse.");
assert.doesNotMatch(patched,/return result\.messages\?\.\[0\]\?\.id\|\|makeId\("cloudmessage"\)/,"Cloud API no debe fabricar un ID cuando el proveedor no confirmó el envío.");
assert.doesNotMatch(patched,/return sent\?\.key\?\.id\|\|makeId\("qrmessage"\)/,"QR no debe fabricar un ID cuando el proveedor no confirmó el envío.");
assert.doesNotMatch(patched,/messages\.upsert[\s\S]{0,180}void handleIncomingMessages\(/,"messages.upsert no debe saltarse la cola confiable.");

const generated = path.join(appDir, ".v26-11-generated-check.mjs");
await writeFile(generated, patched, "utf8");
const syntax = spawnSync(process.execPath, ["--check", generated], { encoding: "utf8" });
await rm(generated, { force: true });
assert.equal(syntax.status, 0, `El servidor generado V26.11 debe ser válido: ${syntax.stderr || syntax.stdout}`);

const server = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.match(server,/applyV2611MessageReliabilityPatches/,"El servidor debe activar V26.11.");

console.log("OK · V26.11 mensajería confiable: colas, reintentos, deduplicación y acuses validados.");
