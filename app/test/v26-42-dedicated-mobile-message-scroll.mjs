import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2642CoreUiPatches } from "../lib/v26-42-dedicated-mobile-message-scroll-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const raw = await readFile(path.join(appDir, "public", "app.js"), "utf8");

const v2641Marker = "// V26.41 PROGRESSIVE_CHAT_HISTORY";
const scrollerPattern =
  /function v2641ConversationScroller\(list = document\.querySelector\("#drawer-messages"\)\) \{[\s\S]*?\n\}/g;

const staleScroller = `function v2641ConversationScroller(list = document.querySelector("#drawer-messages")) {
  if (v2641IsMobileConversation()) {
    return document.querySelector(".deal-chat-column[data-drawer-pane='conversation']");
  }
  return list;
}`;

const dedicatedScroller = `function v2641ConversationScroller(list = document.querySelector("#drawer-messages")) {
  return list;
}`;

// El deploy puede ejecutar este test sobre app.js limpio o sobre un app.js ya
// parcheado por una prueba/runtime anterior. Construimos siempre un único
// scroller V26.41 para que el fixture sea repetible y sintácticamente válido.
const withoutExistingScroller = raw.replace(scrollerPattern, "");
const synthetic =
  withoutExistingScroller +
  (withoutExistingScroller.includes(v2641Marker) ? "\n" : `\n\n${v2641Marker}\n`) +
  staleScroller +
  "\n";

const patched = applyV2642CoreUiPatches(synthetic);

for (const marker of [
  "V26.42 DEDICATED_MOBILE_MESSAGE_SCROLL",
  dedicatedScroller,
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
assert.equal(
  (patched.match(scrollerPattern) || []).length,
  1,
  "V26.42 debe dejar una sola declaración de v2641ConversationScroller."
);
assert.equal(applyV2642CoreUiPatches(patched), patched, "V26.42 debe ser idempotente.");

const contaminated = patched.replace(dedicatedScroller, staleScroller);
assert.notEqual(contaminated, patched, "El fixture debe poder reintroducir el scroller incorrecto sin duplicar funciones.");

const repaired = applyV2642CoreUiPatches(contaminated);
assert.ok(
  !repaired.includes('return document.querySelector(".deal-chat-column[data-drawer-pane=\'conversation\']")'),
  "V26.42 debe reparar un bundle ya marcado si reaparece el scroller del contenedor padre."
);
assert.equal(
  (repaired.match(scrollerPattern) || []).length,
  1,
  "La reparación no debe duplicar v2641ConversationScroller."
);

for (const [name, source] of [["patched", patched], ["repaired", repaired]]) {
  const temp = path.join(appDir, `.v2642-${name}-check.js`);
  await writeFile(temp, source, "utf8");
  try {
    const syntax = spawnSync(process.execPath, ["--check", temp], { encoding: "utf8" });
    assert.equal(syntax.status, 0, `Bundle V26.42 ${name} inválido:\n${syntax.stderr || syntax.stdout}`);
  } finally {
    await rm(temp, { force: true });
  }
}

const launcher = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.ok(launcher.includes("applyV2642CoreUiPatches"), "server.mjs debe activar V26.42");
assert.ok(
  launcher.indexOf("applyV2642CoreUiPatches(patchedPublicApp)") > launcher.indexOf("applyV2641CoreUiPatches(patchedPublicApp)"),
  "V26.42 debe ejecutarse después de V26.41"
);

console.log("OK · V26.42 restaura un único scroller dedicado para mensajes en móvil.");
