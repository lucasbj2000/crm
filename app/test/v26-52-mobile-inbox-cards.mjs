import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

const patch = await readFile(path.join(appDir, "lib", "v26-51-agent-mobile-inbox-patches.mjs"), "utf8");
const css = await readFile(path.join(appDir, "public", "styles.css"), "utf8");
const index = await readFile(path.join(appDir, "public", "index.html"), "utf8");
const sw = await readFile(path.join(appDir, "public", "sw.js"), "utf8");

assert.ok(patch.includes("function v2651CompactPreview"), "La bandeja móvil debe compactar el último mensaje.");
assert.ok(patch.includes("const preview = v2651CompactPreview(message);"), "Las tarjetas deben usar el preview compacto.");
assert.ok(patch.includes("v2651-card-owner"), "Las tarjetas deben separar responsable de la etapa.");
assert.ok(!patch.includes("'  <span class=\"v2651-card-message\">' + escapeHtml(message)"), "No debe renderizarse el mensaje completo en la tarjeta.");

for (const marker of [
  "/* V26.52 MOBILE INBOX CARDS */",
  "#v2651-mobile-inbox{display:none}",
  "#v2651-mobile-inbox button.v2651-deal-card",
  "flex-direction:column!important",
  "appearance:none!important",
  "-webkit-line-clamp:2!important",
  "max-height:38px!important",
  ".v2651-card-state.pending",
  ".v2651-card-state.answered",
]) assert.ok(css.includes(marker), `Falta CSS V26.52: ${marker}`);

assert.ok(index.includes('/styles.css?v=26.52-mobile-inbox-cards'), "El HTML debe forzar styles.css V26.52.");
assert.ok(index.includes('/app.js?v=26.52-mobile-inbox-cards'), "El HTML debe forzar app.js V26.52.");
assert.ok(sw.includes('whatsbot-mobile-v26-52-mobile-inbox-cards'), "La PWA debe invalidar el cache V26.51.");
assert.ok(sw.includes('whatsbot-mobile-v26-51-agent-mobile-inbox'), "Debe conservarse compatibilidad con la prueba V26.51.");

console.log("OK · V26.52 tarjetas móviles compactas y estilos productivos validados.");
