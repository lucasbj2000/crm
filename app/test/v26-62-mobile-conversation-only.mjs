import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

const css = await readFile(path.join(appDir, "public", "styles.css"), "utf8");
assert.ok(css.includes("V26.62 MOBILE CONVERSATION ONLY - DEFINITIVE"));
for (const selector of [".v2645-ai-row", ".quick-reply-bar", ".message-tools"]) {
  assert.ok(css.includes(selector), `Falta ocultar ${selector} en V26.62`);
}
assert.ok(css.includes("grid-template-rows: minmax(0, 1fr) auto !important"));

const index = await readFile(path.join(appDir, "public", "index.html"), "utf8");
assert.ok(index.includes("v2662-mobile-conversation-only-critical"));
assert.ok(index.includes("/styles.css?v=26.62-mobile-conversation-only"));
assert.ok(index.includes("v2662MobileHidden"));
assert.ok(index.includes('setProperty("display","none","important")'));

const sw = await readFile(path.join(appDir, "public", "sw.js"), "utf8");
assert.ok(sw.includes('const CACHE = "whatsbot-mobile-v26-62-mobile-conversation-only"'));
assert.ok(sw.includes('"/styles.css",\n  "/app.js"'));
assert.ok(sw.includes("whatsbot-mobile-v26-60-mobile-static-hide-secondary-tools"));

console.log("OK · V26.62 elimina en mobile IA, respuestas rápidas y herramientas secundarias, incluso con caché previa.");
