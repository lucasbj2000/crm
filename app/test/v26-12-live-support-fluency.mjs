import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const server = await readFile(path.join(appDir, "server.mjs"), "utf8");
const ui = await readFile(path.join(appDir, "public", "v26-10.js"), "utf8");
const compat = await readFile(path.join(appDir, "lib", "v26-12-live-support-fluency-patches.mjs"), "utf8");

assert.match(compat, /return source;/, "El puente V26.12 debe ser inerte.");
assert.doesNotMatch(server, /applyV2612LiveSupportFluencyPatches|v26-12-live-support-fluency-patches/, "El servidor activo no debe cargar soporte en vivo V26.12.");
assert.doesNotMatch(ui, /Soporte en vivo|live-support|EventSource|sendAgentTelemetry|buildSnapshot/, "La interfaz activa no debe restaurar soporte en vivo.");

console.log("OK · Compatibilidad V26.12 presente sin reactivar Soporte en vivo.");
