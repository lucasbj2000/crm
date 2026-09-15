import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const scriptPath = path.join(appDir, "public", "v26-18-1.js");
const script = await readFile(scriptPath, "utf8");
const loader = await readFile(path.join(appDir, "public", "v26-14.js"), "utf8");
const sw = await readFile(path.join(appDir, "public", "sw.js"), "utf8");

const syntax = spawnSync(process.execPath, ["--check", scriptPath], { encoding: "utf8" });
assert.equal(syntax.status, 0, `v26-18-1.js debe ser sintácticamente válido: ${syntax.stderr || syntax.stdout}`);

assert.match(script, /\/api\/omnichannel\/inbox/, "La bandeja unificada debe sincronizarse sin activar la carga global.");
assert.match(script, /\/api\/social\/oauth\/config/, "OAuth periódico debe tratarse como sincronización silenciosa.");
assert.match(script, /\/api\/live/, "El pulso principal debe reintentarse ante fallos de red transitorios.");
assert.match(script, /\/api\/state/, "La actualización de estado debe reintentarse sin recargar la interfaz.");
assert.match(script, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/, "Las llamadas silenciosas deben tener un reintento acotado.");
assert.match(script, /lastBackgroundFailureAt/, "Los fallos transitorios deben distinguirse de errores de acciones del usuario.");
assert.match(script, /tone === "warning" && recentBackgroundFailure/, "Solo el Failed to fetch de sincronización en segundo plano debe silenciarse.");
assert.match(script, /__v266SilentTracker/, "V26.18.1 debe conservar la integración de sincronización silenciosa V26.6.");
assert.match(loader, /\/v26-18-1\.js\?v=26181/, "V26.14 debe cargar el estabilizador V26.18.1.");
assert.match(sw, /whatsbot-mobile-v26-18-1-fetch-stability-shell/, "El service worker debe renovar el shell.");
assert.match(sw, /"\/v26-18-1\.js"/, "El nuevo estabilizador debe formar parte del shell PWA.");

console.log("OK · V26.18.1 fetch silencioso, retry acotado y PWA validados.");
