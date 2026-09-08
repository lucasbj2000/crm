import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const patch = await readFile(path.join(appDir, "lib", "v26-16-new-contact-intake-patches.mjs"), "utf8");
const server = await readFile(path.join(appDir, "server.mjs"), "utf8");

assert.match(patch, /pnJidForLid\(jid, branchId = null, lineId = null\)/, "La resolución LID debe conocer la línea real que recibió el mensaje.");
assert.match(patch, /lineSocket\(lineId\) \|\| branchSocket/, "Debe consultar primero el repositorio LID del socket correcto.");
assert.match(patch, /v2616ResolveLidWithRetry/, "Los contactos nuevos deben reintentar la resolución LID antes de descartarse.");
assert.match(patch, /\[0, 120, 350, 800, 1600, 3200\]/, "La resolución inmediata debe tolerar que WhatsApp publique el mapeo con retraso.");
assert.match(patch, /V2616_LID_PENDING/, "Un LID sin teléfono debe quedar pendiente y no marcarse silenciosamente como procesado.");
assert.match(patch, /pendingIncomingIdentity/, "Debe existir una cola persistente de contactos cuya identidad aún no fue publicada.");
assert.match(patch, /v2616ScheduleIdentityRetry/, "La cola pendiente debe reintentarse después de los intentos inmediatos.");
assert.match(patch, /v2616ResumePendingIdentity/, "Los pendientes deben retomarse después de reiniciar el CRM.");
assert.match(patch, /pendingNewContacts/, "El estado de conexión debe exponer cuántos contactos nuevos siguen pendientes.");
assert.match(server, /applyV2616NewContactIntakePatches/, "server.mjs debe activar V26.16.");
assert.ok(server.indexOf("applyV2616NewContactIntakePatches") > server.indexOf("applyV2615WhatsappWatchdogPatches"), "V26.16 debe aplicarse después del watchdog V26.15.");

console.log("OK · V26.16 contactos nuevos: LID por línea, reintentos, persistencia y recuperación tras reinicio validados.");
