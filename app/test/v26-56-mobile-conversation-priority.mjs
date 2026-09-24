import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2656MobileConversationPriorityPatches } from "../lib/v26-56-mobile-conversation-priority-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const raw = await readFile(path.join(appDir, "public", "app.js"), "utf8");
const synthetic = raw + "\n// V26.55 KEYBOARD_STABLE_MOBILE_LAYOUT\n";
const patched = applyV2656MobileConversationPriorityPatches(synthetic);

for (const marker of [
  "V26.56 MOBILE_CONVERSATION_PRIORITY",
  "v2656-mobile-conversation-priority-style",
  "grid-template-rows:minmax(0,1fr) 32px auto!important",
  "#drawer-messages.v2645-messages",
  "min-height:220px!important",
  ".v2645-ai-row",
  "height:32px!important",
  ".v2645-composer",
  "max-height:168px!important",
  "body.v2655-keyboard-open #deal-drawer .v2645-composer .quick-reply-bar{display:none!important}",
  "body.v2655-keyboard-open #deal-drawer .v2645-composer .message-tools{display:none!important}",
]) assert.ok(patched.includes(marker), `Falta runtime V26.56: ${marker}`);

assert.equal(
  applyV2656MobileConversationPriorityPatches(patched),
  patched,
  "V26.56 debe ser idempotente."
);

const temp = path.join(appDir, ".v2656-check.js");
await writeFile(temp, patched, "utf8");
try {
  const syntax = spawnSync(process.execPath, ["--check", temp], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `Bundle V26.56 inválido:\n${syntax.stderr || syntax.stdout}`);
} finally {
  await rm(temp, { force: true });
}

const index = await readFile(path.join(appDir, "public", "index.html"), "utf8");
assert.ok(index.includes("/styles.css?v=26.56-mobile-conversation-priority"), "index debe servir CSS V26.56.");
assert.ok(index.includes("/app.js?v=26.56-mobile-conversation-priority"), "index debe servir app.js V26.56.");
assert.ok(index.includes("/styles.css?v=26.55-keyboard-stable-mobile"), "Debe conservar compatibilidad V26.55.");

const sw = await readFile(path.join(appDir, "public", "sw.js"), "utf8");
assert.ok(sw.includes("whatsbot-mobile-v26-56-mobile-conversation-priority"), "Service Worker debe invalidar V26.55.");
assert.ok(sw.includes("whatsbot-mobile-v26-55-keyboard-stable-mobile"), "Debe conservar compatibilidad V26.55.");

const launcher = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.ok(launcher.includes("applyV2656MobileConversationPriorityPatches"), "server.mjs debe activar V26.56.");
assert.ok(
  launcher.indexOf("applyV2656MobileConversationPriorityPatches(patchedPublicApp)") >
    launcher.indexOf("applyV2655KeyboardStableMobileLayoutPatches(patchedPublicApp)"),
  "V26.56 debe ejecutarse después de V26.55."
);

console.log("OK · V26.56 conversación móvil priorizada y herramientas secundarias compactadas.");
