import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2657MobileHideSecondaryComposerPatches } from "../lib/v26-57-mobile-hide-secondary-composer-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const raw = await readFile(path.join(appDir, "public", "app.js"), "utf8");
const synthetic = raw + "\n// V26.56 MOBILE_CONVERSATION_PRIORITY\n";
const patched = applyV2657MobileHideSecondaryComposerPatches(synthetic);

for (const marker of [
  "V26.57 MOBILE_HIDE_SECONDARY_COMPOSER",
  "v2657-mobile-hide-secondary-composer-style",
  ".v2645-ai-row,#deal-drawer.v2654-isolated .v2645-ai-row{display:none!important",
  ".v2645-composer .quick-reply-bar,#deal-drawer.v2654-isolated .v2645-composer .quick-reply-bar{display:none!important",
  "grid-template-rows:minmax(0,1fr) auto!important",
  "#drawer-messages.v2645-messages",
  "min-height:260px!important",
  ".v2645-composer{grid-row:2!important",
  "max-height:118px!important",
]) assert.ok(patched.includes(marker), `Falta runtime V26.57: ${marker}`);

assert.equal(
  applyV2657MobileHideSecondaryComposerPatches(patched),
  patched,
  "V26.57 debe ser idempotente."
);

const temp = path.join(appDir, ".v2657-check.js");
await writeFile(temp, patched, "utf8");
try {
  const syntax = spawnSync(process.execPath, ["--check", temp], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `Bundle V26.57 inválido:\n${syntax.stderr || syntax.stdout}`);
} finally {
  await rm(temp, { force: true });
}

const index = await readFile(path.join(appDir, "public", "index.html"), "utf8");
assert.ok(index.includes("/styles.css?v=26.57-hide-secondary-mobile-composer"), "index debe servir CSS V26.57.");
assert.ok(index.includes("/app.js?v=26.57-hide-secondary-mobile-composer"), "index debe servir app.js V26.57.");
assert.ok(index.includes("/styles.css?v=26.56-mobile-conversation-priority"), "Debe conservar compatibilidad V26.56.");

const sw = await readFile(path.join(appDir, "public", "sw.js"), "utf8");
assert.ok(sw.includes("whatsbot-mobile-v26-57-hide-secondary-mobile-composer"), "Service Worker debe invalidar V26.56.");
assert.ok(sw.includes("whatsbot-mobile-v26-56-mobile-conversation-priority"), "Debe conservar compatibilidad V26.56.");

const launcher = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.ok(launcher.includes("applyV2657MobileHideSecondaryComposerPatches"), "server.mjs debe activar V26.57.");
assert.ok(
  launcher.indexOf("applyV2657MobileHideSecondaryComposerPatches(patchedPublicApp)") >
    launcher.indexOf("applyV2656MobileConversationPriorityPatches(patchedPublicApp)"),
  "V26.57 debe ejecutarse después de V26.56."
);

console.log("OK · V26.57 oculta IA y respuesta rápida en mobile y amplía la conversación.");
