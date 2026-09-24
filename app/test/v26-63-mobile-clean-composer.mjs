import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

const runtime = await readFile(path.join(appDir, "public", "v26-62-mobile-clean-composer.js"), "utf8");
for (const marker of [
  "#deal-drawer .chat-only-section.v2645-deal-chat > .v2645-ai-row",
  ".v2645-composer > .quick-reply-bar",
  ".v2645-composer > .message-tools",
  'setImportant(node, "display", "none")',
  'setImportant(section, "grid-template-rows", "minmax(0, 1fr) auto")',
  'setImportant(messages, "overflow-y", "auto")',
  'attributeFilter: ["class", "hidden"]',
]) assert.ok(runtime.includes(marker), `Falta protección mobile V26.63: ${marker}`);

assert.ok(!runtime.includes('attributeFilter: ["class", "hidden", "style"]'), "El observer no debe vigilar sus propios cambios de style.");

const index = await readFile(path.join(appDir, "public", "index.html"), "utf8");
assert.ok(index.includes("/styles.css?v=26.63-mobile-clean-composer"), "index debe invalidar CSS V26.63.");
assert.ok(index.includes("/app.js?v=26.63-mobile-clean-composer"), "index debe invalidar app.js V26.63.");
assert.ok(index.includes("/v26-62-mobile-clean-composer.js?v=26.63"), "index debe cargar el guard mobile dedicado.");
assert.ok(index.includes("v2662-mobile-conversation-only-critical"), "Debe existir fallback crítico antes de los bundles.");

const sw = await readFile(path.join(appDir, "public", "sw.js"), "utf8");
assert.ok(sw.includes('const CACHE = "whatsbot-mobile-v26-63-mobile-clean-composer"'), "Service Worker debe invalidar el cache previo.");
assert.ok(sw.includes('"/styles.css",'), "styles.css debe ser network-first.");
assert.ok(sw.includes('"/v26-62-mobile-clean-composer.js",'), "El runtime mobile debe estar precacheado/network-first.");

console.log("OK · V26.63 elimina IA, respuestas rápidas y herramientas secundarias en mobile, y amplía mensajes.");
