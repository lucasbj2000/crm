import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(appDir, "public", "v26-18-2.js");
const loaderPath = path.join(appDir, "public", "v26-14.js");
const swPath = path.join(appDir, "public", "sw.js");

for (const file of [scriptPath, loaderPath, swPath]) {
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(check.status, 0, `${file} debe pasar node --check: ${check.stderr}`);
}

const script = await readFile(scriptPath, "utf8");
const loader = await readFile(loaderPath, "utf8");
const sw = await readFile(swPath, "utf8");

assert.match(script, /INBOX_PATH\s*=\s*"\/api\/omnichannel\/inbox"/, "debe estabilizar la bandeja unificada");
assert.match(script, /if \(index < 0 && previous\)/, "debe conservar temporalmente la conversación activa si falta en un ciclo");
assert.match(script, /current\.messages = mergeMessages\(previousMessages, incomingMessages\)/, "debe impedir que una respuesta parcial vacíe mensajes visibles");
assert.match(script, /v2511-message\[data-v2618-message-key\]/, "debe proteger los nodos de mensajes existentes");
assert.match(script, /normalizeMessageNode\(this\) === normalizeMessageNode\(next\)/, "debe evitar reemplazos cuando solo cambia la hora relativa");
assert.match(script, /oldFooter\.textContent = newFooter\.textContent/, "debe actualizar la hora sin recrear multimedia ni burbujas");
assert.match(loader, /\/v26-18-2\.js\?v=26182/, "V26.14 debe cargar la corrección V26.18.2");
assert.match(sw, /whatsbot-mobile-v26-18-2-chat-stability-shell/, "el service worker debe renovar la caché");
assert.match(sw, /"\/v26-18-2\.js"/, "el shell debe incluir V26.18.2");

console.log("OK · V26.18.2 conversación activa estable sin repintados destructivos.");
