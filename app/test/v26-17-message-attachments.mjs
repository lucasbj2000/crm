import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const uiPath = path.join(appDir, "public", "v26-17.js");
const ui = await readFile(uiPath, "utf8");
const loader = await readFile(path.join(appDir, "public", "v26-14.js"), "utf8");
const sw = await readFile(path.join(appDir, "public", "sw.js"), "utf8");

const syntax = spawnSync(process.execPath, ["--check", uiPath], { encoding: "utf8" });
assert.equal(syntax.status, 0, syntax.stderr || "v26-17.js debe tener sintaxis válida.");

assert.match(ui, /MAX_FILE_BYTES = 64 \* 1024 \* 1024/, "Debe respetar el límite existente de 64 MB por archivo.");
assert.match(ui, /MAX_FILES = 8/, "Debe permitir una tanda controlada de varios archivos.");
assert.match(ui, /input\.multiple = true/, "El selector debe aceptar múltiples archivos.");
assert.match(ui, /addEventListener\("paste"/, "Debe admitir pegar archivos desde el portapapeles.");
assert.match(ui, /clipboardData/, "El pegado debe leer archivos reales del ClipboardEvent.");
assert.match(ui, /addEventListener\("dragover"/, "Debe preparar una zona de arrastre.");
assert.match(ui, /addEventListener\("drop"/, "Debe aceptar soltar archivos en la mensajería.");
assert.match(ui, /Soltá los archivos para adjuntarlos/, "Debe mostrar feedback visual al arrastrar.");
assert.match(ui, /data-v2617-preview/, "Debe existir una vista previa antes de enviar.");
assert.match(ui, /URL\.createObjectURL/, "Las imágenes deben tener vista previa local sin subirlas todavía.");
assert.match(ui, /data-v2617-remove/, "El usuario debe poder quitar un archivo individual antes de enviarlo.");
assert.match(ui, /\/api\/deals\/\$\{encodeURIComponent\(dealId\)\}\/media/, "Debe reutilizar el endpoint de multimedia probado del CRM.");
assert.match(ui, /X-File-Name/, "Debe preservar el nombre del archivo.");
assert.match(ui, /X-Media-Kind/, "Debe indicar el tipo de multimedia al backend.");
assert.match(ui, /X-Caption/, "Debe poder enviar el texto como caption del primer archivo.");
assert.match(ui, /firstCaptionPending/, "El texto no debe duplicarse al enviar varios archivos.");
assert.match(ui, /state\.files\.shift\(\)/, "Los archivos ya confirmados deben retirarse uno a uno dejando pendientes los no enviados si ocurre un fallo.");
assert.match(ui, /event\.stopImmediatePropagation\(\)/, "El envío con archivos debe evitar que el manejador antiguo envíe el texto por duplicado.");
assert.match(ui, /item\.provider !== "whatsapp"/, "La bandeja unificada debe limitar el envío binario al canal WhatsApp compatible.");
assert.match(ui, /v2511-refresh/, "La bandeja unificada debe refrescarse después de terminar el lote.");
assert.match(loader, /\/v26-17\.js\?v=26170/, "V26.14 debe cargar la nueva capa de adjuntos.");
assert.match(sw, /\/v26-17\.js/, "El Service Worker debe incluir V26.17 en el shell de aplicación.");
assert.match(sw, /v26-17-message-attachments-shell/, "La caché debe renovarse para entregar V26.17 inmediatamente.");

console.log("OK · V26.17 mensajería: selector múltiple, arrastrar, pegar, vista previa y envío secuencial de adjuntos validados.");
