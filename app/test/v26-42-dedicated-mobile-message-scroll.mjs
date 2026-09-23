import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2642CoreUiPatches } from "../lib/v26-42-dedicated-mobile-message-scroll-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const raw = await readFile(path.join(appDir, "public", "app.js"), "utf8");

const synthetic = raw + `
\n// V26.41 PROGRESSIVE_CHAT_HISTORY
function v2641ConversationScroller(list = document.querySelector("#drawer-messages")) {
  if (v2641IsMobileConversation()) {
    return document.querySelector(".deal-chat-column[data-drawer-pane='conversation']");
  }
  return list;
}
`;

const patched = applyV2642CoreUiPatches(synthetic);

for (const marker of [
  "V26.42 DEDICATED_MOBILE_MESSAGE_SCROLL",
  'function v2641ConversationScroller(list = document.querySelector("#drawer-messages")) {\n  return list;',
  "v2642-dedicated-message-scroll-style",
  "overflow-y:auto!important",
  "-webkit-overflow-scrolling:touch!important",
  "touch-action:pan-y!important",
  "flex:1 1 0!important",
  "overflow:hidden!important",
]) assert.ok(patched.includes(marker), `Falta V26.42: ${marker}`);

assert.ok(
  !patched.includes('return document.querySelector(".deal-chat-column[data-drawer-pane=\'conversation\']")'),
  "En móvil el scroller no debe volver al contenedor padre."
);
assert.equal(applyV2642CoreUiPatches(patched), patched, "V26.42 debe ser idempotente.");

const temp = path.join(appDir, ".v2642-check.js");
await writeFile(temp, patched, "utf8");
try {
  const syntax = spawnSync(process.execPath, ["--check", temp], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `Bundle V26.42 inválido:\n${syntax.stderr || syntax.stdout}`);
} finally {
  await rm(temp, { force: true });
}

const launcher = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.ok(launcher.includes("applyV2642CoreUiPatches"), "server.mjs debe activar V26.42");
assert.ok(
  launcher.indexOf("applyV2642CoreUiPatches(patchedPublicApp)") > launcher.indexOf("applyV2641CoreUiPatches(patchedPublicApp)"),
  "V26.42 debe ejecutarse después de V26.41"
);

console.log("OK · V26.42 restaura un único scroller dedicado para mensajes en móvil.");
