import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const patch = await readFile(path.join(appDir, "lib", "v26-15-whatsapp-watchdog-patches.mjs"), "utf8");
const server = await readFile(path.join(appDir, "server.mjs"), "utf8");

assert.match(patch, /v2615ProbeIntervalMs = 45_000/, "El watchdog debe revisar periódicamente la salud del transporte.");
assert.match(patch, /v2615FailureLimit = 2/, "No debe reiniciar una sesión por un único fallo transitorio.");
assert.match(patch, /fetchBlocklist/, "El probe debe realizar un round-trip real contra WhatsApp cuando Baileys lo permite.");
assert.match(patch, /fetchPrivacySettings/, "Debe existir un probe de respaldo no destructivo.");
assert.match(patch, /async function v2615RecoverPrimary/, "La línea principal debe autorrecuperarse.");
assert.match(patch, /async function v2615RecoverBranch/, "Las sesiones legacy de sucursal deben autorrecuperarse.");
assert.match(patch, /async function v2615RecoverLine/, "Cada línea QR independiente debe autorrecuperarse.");
assert.match(patch, /socket\.end\(new Error\("V26\.15 watchdog: reinicio de transporte"\)\)/, "La recuperación debe cerrar solo el transporte y conservar credenciales.");
assert.doesNotMatch(patch, /v2615SoftClose[\s\S]{0,500}logout\(/, "El watchdog no debe cerrar sesión ni borrar la vinculación.");
assert.match(patch, /v263PrimaryGeneration \+= 1/, "El reinicio debe invalidar eventos del socket anterior.");
assert.match(patch, /runtime\.generation=Number\(runtime\.generation\|\|0\)\+1/, "Las líneas adicionales deben invalidar sockets anteriores.");
assert.match(patch, /function v2615HealthForIncoming/, "La actividad entrante debe resolverse por línea o sucursal sin depender de la forma del listener.");
assert.match(patch, /v2615Touch\(v2615HealthForIncoming\(lineId, branchId\), "message"\)/, "Cada mensaje procesado debe renovar la salud de su transporte.");
assert.match(patch, /v2615StartWatch\(\{health:v2615PrimaryHealth/, "La conexión principal debe iniciar su watchdog al abrir.");
assert.match(patch, /watchdog: cloud \? null : v2615PublicHealth/, "La salud del watchdog debe quedar disponible para diagnóstico.");
assert.match(server, /applyV2615WhatsappWatchdogPatches/, "server.mjs debe activar V26.15.");
assert.ok(server.indexOf("applyV2615WhatsappWatchdogPatches") > server.indexOf("applyV2614PerformancePatches"), "El watchdog debe aplicarse después de las capas anteriores.");

console.log("OK · V26.15 watchdog de WhatsApp: probe real, doble fallo, actividad centralizada y autorrecuperación sin logout validados.");
