import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

const css = await readFile(path.join(appDir, "public", "styles.css"), "utf8");
for (const marker of [
  "V26.60 MOBILE STATIC HIDE SECONDARY TOOLS",
  "@media (max-width: 900px)",
  "#deal-drawer .chat-only-section.v2645-deal-chat .v2645-ai-row",
  "#deal-drawer .chat-only-section.v2645-deal-chat .quick-reply-bar",
  "display: none !important",
  "grid-template-rows: minmax(0, 1fr) auto !important",
  "#drawer-messages.v2645-messages",
  ".v2645-composer",
  "grid-row: 2 !important",
]) {
  assert.ok(css.includes(marker), `Falta CSS V26.60: ${marker}`);
}

const blockStart = css.indexOf("/* V26.60 MOBILE STATIC HIDE SECONDARY TOOLS */");
assert.ok(blockStart >= 0, "Debe existir el bloque V26.60.");
const block = css.slice(blockStart);
assert.ok(block.indexOf(".v2645-ai-row") < block.indexOf("display: none !important"), "IA debe quedar oculta.");
assert.ok(block.indexOf(".quick-reply-bar") < block.indexOf("display: none !important"), "Respuestas rápidas deben quedar ocultas.");

const index = await readFile(path.join(appDir, "public", "index.html"), "utf8");
assert.ok(index.includes("/styles.css?v=26.60-mobile-static-hide-secondary-tools"), "index debe forzar CSS V26.60.");
assert.ok(index.includes("/styles.css?v=26.57-hide-secondary-mobile-composer"), "Debe conservar referencia de compatibilidad V26.57.");

const sw = await readFile(path.join(appDir, "public", "sw.js"), "utf8");
assert.ok(sw.includes("whatsbot-mobile-v26-60-mobile-static-hide-secondary-tools"), "Service Worker debe usar caché V26.60.");
assert.ok(sw.includes("whatsbot-mobile-v26-57-hide-secondary-mobile-composer"), "Debe conservar referencia de compatibilidad V26.57.");

console.log("OK · V26.60 oculta de forma fija IA y respuestas rápidas en mobile y deja más espacio a mensajes.");
