import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "..");
const hotfix = await readFile(path.join(app, "public", "v25-4-1.js"), "utf8");
const css = await readFile(path.join(app, "public", "v25-4-2.css"), "utf8");
const loader = await readFile(path.join(app, "public", "v22.js"), "utf8");
const sw = await readFile(path.join(app, "public", "sw.js"), "utf8");

for (const marker of [
  'makeCompactButton',
  'button.className = "button ghost v2541-compact-delete"',
  '.drawer-call-actions',
  '#client-profile-form',
  'footer.insertBefore(button, footer.firstChild)',
  'removeLegacyBars',
  '/api/auth/status',
  'Eliminar negociación',
  'Eliminar ficha',
]) assert.ok(hotfix.includes(marker), `Falta contrato compacto V25.4.2: ${marker}`);

assert.ok(!hotfix.includes('bar.className = "v2541-admin-bar"'), "V25.4.2 volvió a crear una barra administrativa que altera el layout.");
assert.ok(!hotfix.includes("Acciones permanentes sobre esta negociación"), "V25.4.2 conserva el panel visual grande anterior.");
assert.ok(css.includes(".v2541-compact-delete"), "Falta estilo del botón compacto.");
assert.ok(css.includes("width:auto!important") && css.includes("background:transparent!important"), "El botón compacto puede expandirse o crear un bloque visual.");
assert.ok(css.includes("#v2541-deal-admin-bar,#v2541-client-admin-bar{display:none!important}"), "Las barras legacy no quedan neutralizadas.");
assert.ok(loader.includes('/v25-4-2.css?v=25.4.2'), "El loader no carga el CSS compacto V25.4.2.");
assert.ok(loader.includes('/v25-4-1.js?v=25.4.2'), "El loader no fuerza el JavaScript corregido V25.4.2.");
assert.ok(sw.includes('whatsbot-mobile-v25-4-2-production-shell') && sw.includes('/v25-4-2.css'), "El service worker no renueva la caché V25.4.2.");

console.log("OK · V25.4.2 mantiene eliminar como botón compacto sin alterar el layout.");
