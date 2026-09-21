import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialData, normalizeData } from "../lib/domain.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patch = await readFile(path.join(appDir, "lib", "v26-36-zero-loss-incoming-patches.mjs"), "utf8");
const server = await readFile(path.join(appDir, "server.mjs"), "utf8");

assert.match(patch, /source === "notify" \\|\\| source === "append"/, "append no debe descartarse por antigüedad.");
assert.match(patch, /const seenMessages = new Set\\(\\)/, "processedMessageIds no debe envenenar la deduplicación al arrancar.");
assert.match(patch, /v2636MessageMaterialized/, "La deduplicación debe comprobar persistencia real.");
assert.match(patch, /pendingIncomingEvents/, "Falta cola durable de ingresos QR.");
assert.match(patch, /pendingCloudWebhooks/, "Falta cola durable Cloud.");
assert.match(patch, /await v2636AcceptCloudWebhook\\(request\\.body\\)/, "Cloud debe persistirse antes de responder 200.");
assert.match(patch, /v2636FallbackIncomingText/, "Falta fallback para formatos entrantes no textuales.");
assert.ok(patch.includes("[Ubicación compartida]"), "Las ubicaciones deben impactar.");
assert.ok(patch.includes("[Contacto compartido"), "Los contactos compartidos deben impactar.");
assert.match(patch, /v2636SchedulePendingIncoming/, "Los fallos deben reintentarse.");
assert.doesNotMatch(patch, /pendingIncomingEvents\\.splice/, "No se deben borrar mensajes pendientes por límite.");
assert.match(server, /applyV2636ZeroLossIncomingPatches/, "V26.36 no está conectado al pipeline.");
assert.ok(server.indexOf("applyV2636ZeroLossIncomingPatches") > server.indexOf("applyV2635AdPromotionContextPatches"), "V26.36 debe ejecutarse después de V26.35.");

const seed = createInitialData();
seed.whatsappLines = [{ id:"line_keep" }];
seed.pendingIncomingIdentity = [{ key:"lid_keep" }];
seed.pendingIncomingEvents = [{ key:"incoming_keep" }];
seed.pendingCloudWebhooks = [{ key:"cloud_keep" }];
seed.messageOutbox = [{ id:"outbox_keep" }];
seed.messageReliabilityFailures = [{ id:"failure_keep" }];
seed.adPromotions = [{ id:"promo_keep" }];
const normalized = normalizeData(JSON.parse(JSON.stringify(seed)));
assert.equal(normalized.whatsappLines[0]?.id, "line_keep");
assert.equal(normalized.pendingIncomingIdentity[0]?.key, "lid_keep");
assert.equal(normalized.pendingIncomingEvents[0]?.key, "incoming_keep");
assert.equal(normalized.pendingCloudWebhooks[0]?.key, "cloud_keep");
assert.equal(normalized.messageOutbox[0]?.id, "outbox_keep");
assert.equal(normalized.messageReliabilityFailures[0]?.id, "failure_keep");
assert.equal(normalized.adPromotions[0]?.id, "promo_keep");

console.log("OK · V26.36 ingreso cero pérdida y persistencia validados.");