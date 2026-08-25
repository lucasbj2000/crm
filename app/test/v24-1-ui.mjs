import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const ui = await readFile(path.join(appDir, "public", "v24-1.js"), "utf8");
const login = await readFile(path.resolve(appDir, "..", "gateway", "public", "login.html"), "utf8");

assert.ok(ui.includes('document.addEventListener("submit", saveForm, true)'), "V24.1 debe tomar control del guardado del formulario.");
assert.ok(ui.includes('/api/forms/${encodeURIComponent(id)}/dispatch'), "V24.1 debe implementar el envío de formularios.");
assert.ok(ui.includes('populateLineSelect'), "V24.1 debe inicializar la línea del formulario.");
assert.ok(ui.includes('branchId:'), "V24.1 debe enviar la sucursal/empresa al guardar.");
assert.ok(ui.includes('record.remove()'), "La grabación de audio saliente debe retirarse de la interfaz.");
assert.ok(ui.includes('startsWith("audio/")'), "Los adjuntos de audio saliente deben bloquearse en el selector.");
assert.ok(login.includes('/api/branding/public'), "El login debe consultar el branding real del tenant.");
assert.ok(login.includes('/api/branding/logo'), "El login debe mostrar el logo real del tenant.");
assert.ok(login.includes('/t/${encodeURIComponent(lastSlug)}'), "El branding previo al login debe resolverse dentro de la empresa seleccionada.");

console.log("V24.1 UI: formularios, audio saliente retirado y branding por empresa OK");
