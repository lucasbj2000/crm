import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2625CoreUiPatches } from "../lib/v26-25-agent-messaging-ux-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(here, "..");
const source = await readFile(path.join(appDirectory, "public", "app.js"), "utf8");
const server = await readFile(path.join(appDirectory, "server.mjs"), "utf8");
const patched = applyV2625CoreUiPatches(source);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(patched.includes("V26.25 AGENT_MESSAGING_EXPERIENCE"), "Falta el marcador V26.25 en app.js.");
assert(patched.includes("v2625-focus-toggle"), "Falta el modo Solo conversación.");
assert(patched.includes("↓ Último mensaje"), "Falta el acceso directo al último mensaje.");
assert(patched.includes("deal-draft"), "Falta persistencia de borrador por negociación.");
assert(patched.includes("inbox-draft"), "Falta persistencia de borrador en bandeja unificada.");
assert(patched.includes("v2625ResizeComposer"), "Falta el autoajuste del cuadro de escritura.");
assert(patched.includes("#send-quick-reply{display:none!important}"), "La mensajería simplificada debe evitar el envío directo duplicado de respuestas rápidas.");
assert(patched.includes("animation:none!important"), "Los mensajes deben quedar libres de animaciones para priorizar estabilidad.");
assert(patched.includes("max-width:min(76%,720px)"), "Las burbujas deben tener un ancho legible y contenido.");
assert(applyV2625CoreUiPatches(patched) === patched, "V26.25 debe ser idempotente.");
assert(server.includes('import { applyV2625CoreUiPatches } from "./lib/v26-25-agent-messaging-ux-patches.mjs";'), "server.mjs no importa V26.25.");
assert(server.includes("patchedPublicApp = applyV2625CoreUiPatches(patchedPublicApp);"), "server.mjs no aplica V26.25 antes del bundle optimizado.");

console.log("OK · V26.25 simplifica la mensajería, conserva borradores, autoajusta el editor y añade modo de enfoque.");
