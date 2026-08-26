import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "..");
const v253 = await readFile(path.join(app, "public", "v25-3.js"), "utf8");
const css = await readFile(path.join(app, "public", "v25-3.css"), "utf8");
const loader = await readFile(path.join(app, "public", "v22.js"), "utf8");
const sw = await readFile(path.join(app, "public", "sw.js"), "utf8");
const legacy = await readFile(path.join(app, "public", "app.js"), "utf8");
const v241 = await readFile(path.join(app, "public", "v24-1.js"), "utf8");

// Regresión exacta que impedía abrir una negociación.
assert.ok(v241.includes('record.remove()'), "La prueba espera documentar el comportamiento legacy que retiraba audio.");
assert.ok(legacy.includes('$("#record-audio-button").disabled = !canCommunicate'), "El drawer legacy ya no contiene la dependencia del botón de audio esperada.");
assert.ok(v253.includes('ensureAudioCompatibilityAnchor'), "V25.3 no crea el ancla compatible para el drawer.");
assert.ok(v253.includes('button.id = "record-audio-button"'), "V25.3 no repone el ID requerido por renderDrawer.");
assert.ok(v253.includes('Object.defineProperty(button, "remove"'), "El ancla de audio puede volver a ser eliminada por V24.1.");
assert.ok(v253.includes('style.setProperty("display", "none", "important")'), "El control de audio de compatibilidad no queda oculto.");

// Navegación debe usar la vista completa anterior, no una conversación recortada.
assert.ok(v253.includes('typeof openDrawer !== "function"'), "V25.3 no valida openDrawer.");
assert.ok(v253.includes('openDrawer(dealId)'), "V25.3 no abre la negociación completa.");
assert.ok(v253.includes('typeof openClientProfile !== "function"'), "V25.3 no valida la ficha 360°.");
assert.ok(v253.includes('void openClientProfile()'), "V25.3 no abre directamente la ficha del cliente.");
assert.ok(v253.includes('#crm-board [data-deal-id]'), "V25.3 no captura las tarjetas de negociación.");
assert.ok(v253.includes('#open-client-profile-button'), "V25.3 no protege el botón de ficha.");
assert.ok(!v253.includes('openConversation('), "V25.3 no debe volver a la vista simplificada de conversación.");

// Responsive global.
for (const marker of [
  'html,body{width:100%;max-width:100%;overflow-x:hidden}',
  '.workspace{width:auto;max-width:none;overflow-x:clip}',
  '.board{width:100%;max-width:100%',
  '.drawer-panel{width:min(760px,100vw)',
  '.client-profile-dialog{width:min(980px,calc(100vw - 20px))',
  '@media(max-width:820px)',
  '@media(max-width:600px)',
  '@media(max-width:380px)',
]) assert.ok(css.includes(marker), `Falta contrato responsive V25.3: ${marker}`);

assert.ok(loader.includes('/v25-3.css?v=25.3'), "El loader no carga el responsive V25.3.");
assert.ok(loader.includes('/v25-3.js?v=25.3'), "El loader no carga la navegación V25.3.");
assert.ok(loader.indexOf('/v24-1.js?v=24.1') < loader.indexOf('/v25-3.js?v=25.3'), "V25.3 debe instalar el ancla después de la reparación V24.1.");
assert.ok(sw.includes('whatsbot-mobile-v25-3-production-shell'), "El service worker no renueva caché a V25.3.");
assert.ok(sw.includes('/v25-3.css') && sw.includes('/v25-3.js'), "El shell offline no incluye V25.3.");

console.log("OK · V25.3 restaura negociación/ficha y fuerza responsive global.");
