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
import { applyV2613LiveSupportChatPatches, improveV2613Js, improveV2613Css, mirrorHtml } from "../lib/v26-13-live-support-chat-patches.mjs";
import { applyV2612LiveSupportFluencyPatches } from "../lib/v26-12-live-support-fluency-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
function restoreGeneratedTemplates(source,startMarker,endMarker){const start=source.indexOf(startMarker),end=source.indexOf(endMarker,start+startMarker.length);assert.ok(start>=0&&end>start,`No se encontró ${startMarker}`);const block=source.slice(start,end).replaceAll("\\`","`").replaceAll("\\${","${");return source.slice(0,start)+block+source.slice(end);}

const uiSource = await readFile(path.join(appDir, "public", "v26-10.js"), "utf8");
const cssSource = await readFile(path.join(appDir, "public", "v26-10.css"), "utf8");
const improvedUi = improveV2613Js(uiSource);
const improvedCss = improveV2613Css(cssSource);
assert.match(improvedUi,/src="\/v26-13-live-mirror"/,"El visor debe usar una página espejo estable y no srcdoc.");
assert.doesNotMatch(improvedUi,/frame\.srcdoc\s*=/,"El visor V26.13 no debe reconstruirse con srcdoc.");
assert.match(improvedUi,/v2613-admin-chat-form/,"El Admin debe tener chat dentro del visor.");
assert.match(improvedUi,/v2613-agent-chat-form/,"El agente debe tener chat flotante de soporte.");
assert.match(improvedUi,/addEventListener\("chat"/,"Admin y agente deben recibir chat por SSE.");
assert.match(improvedUi,/postMessage\(\{ type: "v2613-snapshot"/,"La pantalla debe viajar a la página espejo mediante postMessage.");
assert.match(improvedCss,/v2613-admin-chat/,"El chat del Admin debe tener layout propio.");
assert.match(improvedCss,/v2613-agent-chat/,"El chat del agente debe ser visible y minimizable.");
assert.match(mirrorHtml,/v2613-snapshot/,"La página espejo debe aceptar instantáneas del CRM.");
assert.match(mirrorHtml,/document\.body\.innerHTML=html/,"La página espejo debe pintar el DOM recibido sin recargar el iframe.");

const uiCheck = path.join(appDir, ".v26-13-ui-check.js");
await writeFile(uiCheck, improvedUi, "utf8");
const uiSyntax = spawnSync(process.execPath, ["--check", uiCheck], { encoding: "utf8" });
await rm(uiCheck, { force: true });
assert.equal(uiSyntax.status, 0, `La UI V26.13 debe ser JavaScript válido: ${uiSyntax.stderr || uiSyntax.stdout}`);

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
patched = applyV2613LiveSupportChatPatches(patched);
patched = applyV2612LiveSupportFluencyPatches(patched);

assert.match(patched,/app\.post\("\/api\/live-support\/:id\/chat"/,"Debe existir endpoint de chat por sesión.");
assert.match(patched,/senderUserId: user\.id/,"Cada mensaje de soporte debe identificar a su autor.");
assert.match(patched,/v2610SupportBroadcast\(session, "chat", message\)/,"El chat debe llegar en vivo por SSE.");
assert.match(patched,/chat: \(session\.chat \|\| \[\]\)\.slice\(-120\)/,"La sesión debe entregar historial reciente de chat.");
assert.match(patched,/app\.get\("\/v26-13-live-mirror"/,"Debe existir la página espejo autenticada.");
assert.match(patched,/if \(!currentUser\(request\)\) return response\.status\(401\)/,"La página espejo requiere sesión.");

const generated = path.join(appDir, ".v26-13-generated-check.mjs");
await writeFile(generated, patched, "utf8");
const syntax = spawnSync(process.execPath, ["--check", generated], { encoding: "utf8" });
await rm(generated, { force: true });
assert.equal(syntax.status, 0, `El servidor generado V26.13 debe ser válido: ${syntax.stderr || syntax.stdout}`);

const server = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.match(server,/applyV2613LiveSupportChatPatches/,"server.mjs debe activar V26.13.");
console.log("OK · V26.13 visor estable y chat en vivo de soporte validados.");
