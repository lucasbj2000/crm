import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2639CoreUiPatches } from "../lib/v26-39-mobile-chat-layout-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const source = await readFile(path.join(appDir, "public", "app.js"), "utf8");
const patched = applyV2639CoreUiPatches(source);

for (const marker of [
  "V26.39 MOBILE_CHAT_LAYOUT_FIX",
  "v2639-drawer-open",
  "--v2639-viewport-height",
  "touch-action:pan-y",
  "overflow-y:auto",
  "height:auto!important",
  "v2630-mobile-dock",
  "v2628-emoji-panel",
  "v2625-latest-button",
  "visualViewport",
]) assert.ok(patched.includes(marker), `Falta contrato mobile V26.39: ${marker}`);

assert.ok(
  patched.includes("body.v2630-mobile.v2639-drawer-open .v2630-mobile-dock"),
  "El dock inferior debe ocultarse mientras la conversación está abierta."
);
assert.ok(
  patched.includes("body.v2630-mobile .chat-only-section #drawer-messages"),
  "Debe existir un scroller dedicado para el historial."
);
assert.ok(
  !patched.includes("V26.39 MOBILE_CHAT_LAYOUT_FIX\n// V26.39 MOBILE_CHAT_LAYOUT_FIX"),
  "El parche no debe duplicarse."
);
assert.equal(applyV2639CoreUiPatches(patched), patched, "V26.39 debe ser idempotente.");

const temp = path.join(appDir, ".v2639-mobile-check.js");
await writeFile(temp, patched, "utf8");
try {
  const syntax = spawnSync(process.execPath, ["--check", temp], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `app.js V26.39 inválido:\n${syntax.stderr || syntax.stdout}`);
} finally {
  await rm(temp, { force: true });
}

const launcher = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.ok(launcher.includes("applyV2639CoreUiPatches"), "Producción debe activar V26.39.");
assert.ok(
  launcher.indexOf("applyV2639CoreUiPatches(patchedPublicApp)") > launcher.indexOf("applyV2638CoreUiPatches(patchedPublicApp)"),
  "V26.39 debe aplicarse después de V26.38."
);

console.log("OK · V26.39 scroll mobile, viewport dinámico y overlays corregidos.");
