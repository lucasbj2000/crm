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
import { applyV26111MessageQueueSafetyPatches } from "../lib/v26-11-1-message-queue-safety-patches.mjs";
import { applyV2614PerformancePatches } from "../lib/v26-14-performance-patches.mjs";
import { applyV2615WhatsappWatchdogPatches } from "../lib/v26-15-whatsapp-watchdog-patches.mjs";
import { applyV2616NewContactIntakePatches } from "../lib/v26-16-new-contact-intake-patches.mjs";
import { applyV2620AutoBranchRoutingStable } from "../lib/v26-20-auto-branch-routing-wrapper.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

function restoreGeneratedTemplates(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `No se encontró bloque ${startMarker}`);
  const block = source.slice(start, end).replaceAll("\\`", "`").replaceAll("\\${", "${");
  return source.slice(0, start) + block + source.slice(end);
}

const core = await readFile(path.join(appDir, "server-core.mjs"), "utf8");
let patched = applyV24ServerPatches(core);
patched = applyV24CloudPatches(patched);
patched = applyV241ServerPatches(patched);
patched = applyV254ServerPatches(patched);
patched = restoreGeneratedTemplates(patched, "async function v24TranscribeMediaAttachment", "async function maybeReplyWithBot");
patched = restoreGeneratedTemplates(patched, "function v24ActiveObserverGrant", 'app.post("/api/deals/:id/transfer"');
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
patched = applyV26111MessageQueueSafetyPatches(patched);
patched = applyV2614PerformancePatches(patched);
patched = applyV2615WhatsappWatchdogPatches(patched);
patched = applyV2616NewContactIntakePatches(patched);
patched = applyV2620AutoBranchRoutingStable(patched);

assert.match(patched, /v2620NearestBranchForCity/, "Debe calcular la sucursal más cercana según ciudad.");
assert.match(patched, /nominatim\.openstreetmap\.org/, "Debe poder geocodificar ciudades paraguayas cuando no hay coincidencia exacta.");
assert.match(patched, /v2620ExplicitTransferRequest/, "Debe reconocer solicitudes explícitas de otra sucursal.");
assert.match(patched, /No hace falta que elijas un número de sucursal/, "El bot ya no debe pedir un número de sucursal.");
assert.doesNotMatch(patched, /Respondé con el número o el nombre de la sucursal\./, "Debe eliminarse la selección numérica legacy.");
assert.match(patched, /assignmentSource = "automatic_nearest_branch"/, "El destino debe quedar identificado como derivación geográfica automática.");
assert.match(patched, /targetDeal\.ownerUserId = null/, "La sucursal destino debe recibir el caso sin responsable.");
assert.match(patched, /targetDeal\.stage = STAGES\.NEW/, "La derivación debe entrar como nuevo ingreso.");
assert.match(patched, /targetDeal\.botActive = true/, "El bot debe seguir activo en la sucursal destino mientras ningún agente tome el caso.");
assert.match(patched, /recordBotOutgoing\(data, \{ deal: targetDeal/, "La bienvenida de la nueva línea debe registrarse como bot, no como respuesta humana.");
assert.match(patched, /v2620RouteIncomingOrBot\(deal,v24BotText\|\|text,\{created,lineEnabled:line\.botEnabled!==false\}\)/, "Cada nuevo mensaje debe evaluar primero la derivación automática conservando la comprensión multimedia V24.");
assert.match(patched, /app\.post\("\/api\/deals\/:id\/transfer"/, "La derivación manual debe seguir disponible.");

const generated = path.join(appDir, ".v26-20-generated-check.mjs");
await writeFile(generated, patched, "utf8");
const syntax = spawnSync(process.execPath, ["--check", generated], { encoding: "utf8" });
await rm(generated, { force: true });
assert.equal(syntax.status, 0, `El servidor generado V26.20 debe ser JavaScript válido: ${syntax.stderr || syntax.stdout}`);

console.log("OK · V26.20 derivación automática por ciudad/sucursal cercana, ingreso sin responsable y derivación manual preservada.");
