import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2643CoreUiPatches } from "../lib/v26-43-simple-responsive-conversation-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const raw = await readFile(path.join(appDir, "public", "app.js"), "utf8");

const syntheticRender = `function scrollDrawerMessagesToLatest(list) {
  if (!list) return;
  list.scrollTop = list.scrollHeight;
}

function renderDrawerMessages(deal, { force = false } = {}) {
  const list = document.querySelector("#drawer-messages");
  const allMessages = Array.isArray(deal.messages) ? deal.messages : [];
  const visibleCount = 50;
  const messages = allMessages.slice(-visibleCount);
  list.innerHTML = messages.map((message) => message.text).join("");
}
`;

const synthetic =
  "\n// V26.42 DEDICATED_MOBILE_MESSAGE_SCROLL\n" +
  `// V26.40 DEFINITIVE_MOBILE_TOUCH_SCROLL
(() => {
  document.addEventListener("touchmove", () => {});
})();
` +
  raw.replace("function renderDrawer() {", syntheticRender + "function renderDrawer() {");

const patched = applyV2643CoreUiPatches(synthetic);

for (const marker of [
  "V26.43 SIMPLE_RESPONSIVE_CONVERSATION",
  "v2643-simple-conversation-style",
  "const messages = Array.isArray(deal.messages) ? deal.messages : [];",
  "messages.map((message)",
  "overflow-y:scroll!important",
  "grid-template-rows:minmax(0,1fr) auto auto auto auto auto",
  "grid-row:1!important",
  "grid-row:2!important",
  "justify-content:flex-start!important",
  "v2643UserBrowsing",
  "v2617-drawer-scroll-style",
  "-webkit-overflow-scrolling:touch!important",
  "touch-action:pan-y!important",
  "grid-template-columns:repeat(3,minmax(0,1fr))",
  "runtime touch manual desactivado",
]) assert.ok(patched.includes(marker), `Falta V26.43: ${marker}`);

assert.ok(!patched.includes("allMessages.slice(-visibleCount)"), "No debe quedar paginación de 50 mensajes.");
assert.ok(!patched.includes('document.addEventListener("touchmove", () => {})'), "El handler touch manual V26.40 debe retirarse.");
assert.ok(!patched.includes("list.scrollTop = list.scrollHeight;\n}\n\nfunction renderDrawerMessages"), "El scroll forzado antiguo debe reemplazarse.");
assert.ok(patched.includes('#send-quick-reply{display:none!important}'), "El envio rapido duplicado debe ocultarse para simplificar mobile.");
assert.equal(applyV2643CoreUiPatches(patched), patched, "V26.43 debe ser idempotente.");

const temp = path.join(appDir, ".v2643-check.js");
await writeFile(temp, patched, "utf8");
try {
  const syntax = spawnSync(process.execPath, ["--check", temp], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `Bundle V26.43 inválido:\n${syntax.stderr || syntax.stdout}`);
} finally {
  await rm(temp, { force: true });
}

const launcher = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.ok(launcher.includes("applyV2643CoreUiPatches"), "server.mjs debe activar V26.43.");
assert.ok(
  launcher.indexOf("applyV2643CoreUiPatches(patchedPublicApp)") > launcher.indexOf("applyV2642CoreUiPatches(patchedPublicApp)"),
  "V26.43 debe ejecutarse después de V26.42."
);

console.log("OK · V26.43 conversación simple, responsive y sin límite de mensajes validada.");
