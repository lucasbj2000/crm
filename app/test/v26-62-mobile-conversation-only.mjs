import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

const css = await readFile(path.join(appDir, "public", "styles.css"), "utf8");
assert.ok(css.includes("V26.62 MOBILE CONVERSATION ONLY - DEFINITIVE") || css.includes("V26.62 MOBILE DEFINITIVE CLEAN COMPOSER"));
for (const selector of [".v2645-ai-row", ".quick-reply-bar", ".message-tools"]) {
  assert.ok(css.includes(selector), `Falta ocultar ${selector} en la protección mobile`);
}
assert.ok(css.includes("grid-template-rows: minmax(0, 1fr) auto !important"));

const index = await readFile(path.join(appDir, "public", "index.html"), "utf8");
assert.ok(index.includes("v2662-mobile-conversation-only-critical"));
assert.ok(index.includes("/styles.css?v=26.63-mobile-clean-composer"));
assert.ok(index.includes("/v26-62-mobile-clean-composer.js?v=26.63"));

const runtime = await readFile(path.join(appDir, "public", "v26-62-mobile-clean-composer.js"), "utf8");
assert.ok(runtime.includes('setImportant(node, "display", "none")'));
assert.ok(runtime.includes(".v2645-composer > .message-tools"));

const sw = await readFile(path.join(appDir, "public", "sw.js"), "utf8");
assert.ok(sw.includes('const CACHE = "whatsbot-mobile-v26-63-mobile-clean-composer"'));
assert.ok(sw.includes('"/styles.css",\n  "/app.js"'));
assert.ok(sw.includes("whatsbot-mobile-v26-60-mobile-static-hide-secondary-tools"));

console.log("OK · V26.62/V26.63 mantiene conversación mobile limpia y sin herramientas secundarias.");
