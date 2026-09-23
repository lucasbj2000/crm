import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2655KeyboardStableMobileLayoutPatches } from "../lib/v26-55-keyboard-stable-mobile-layout-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const raw = await readFile(path.join(appDir, "public", "app.js"), "utf8");
const synthetic = raw + "\n// V26.54 MOBILE_DETAIL_ISOLATION\n";
const patched = applyV2655KeyboardStableMobileLayoutPatches(synthetic);

for (const marker of [
  "V26.55 KEYBOARD_STABLE_MOBILE_LAYOUT",
  "v2655StableHeight",
  "v2655KeyboardInset",
  "v2655-keyboard-open",
  "--v2655-stable-vh",
  "--v2655-keyboard-inset",
  "v2655EditableFocused",
  "window.visualViewport",
  "inset < 80",
]) assert.ok(patched.includes(marker), `Falta runtime V26.55: ${marker}`);

assert.equal(
  applyV2655KeyboardStableMobileLayoutPatches(patched),
  patched,
  "V26.55 debe ser idempotente."
);

const temp = path.join(appDir, ".v2655-check.js");
await writeFile(temp, patched, "utf8");
try {
  const syntax = spawnSync(process.execPath, ["--check", temp], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `Bundle V26.55 inválido:\n${syntax.stderr || syntax.stdout}`);
} finally {
  await rm(temp, { force: true });
}

const css = await readFile(path.join(appDir, "public", "styles.css"), "utf8");
for (const marker of [
  "/* V26.55 KEYBOARD STABLE MOBILE LAYOUT */",
  "height:var(--v2655-stable-vh,100dvh)!important",
  "padding-bottom:var(--v2655-keyboard-inset,0px)!important",
  "body.v2655-keyboard-open #deal-drawer #drawer-messages",
  "#deal-drawer input,",
  "font-size:16px!important",
  "#deal-drawer #manual-message",
]) assert.ok(css.includes(marker), `Falta CSS V26.55: ${marker}`);

const index = await readFile(path.join(appDir, "public", "index.html"), "utf8");
assert.ok(index.includes("/styles.css?v=26.55-keyboard-stable-mobile"), "index debe servir CSS V26.55.");
assert.ok(index.includes("/app.js?v=26.55-keyboard-stable-mobile"), "index debe servir app.js V26.55.");
assert.ok(index.includes("/styles.css?v=26.54-mobile-detail-isolation"), "Debe conservar compatibilidad V26.54.");

const sw = await readFile(path.join(appDir, "public", "sw.js"), "utf8");
assert.ok(sw.includes("whatsbot-mobile-v26-55-keyboard-stable-mobile"), "Service Worker debe invalidar V26.54.");
assert.ok(sw.includes("whatsbot-mobile-v26-54-mobile-detail-isolation"), "Debe conservar compatibilidad V26.54.");

const launcher = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.ok(launcher.includes("applyV2655KeyboardStableMobileLayoutPatches"), "server.mjs debe activar V26.55.");
assert.ok(
  launcher.indexOf("applyV2655KeyboardStableMobileLayoutPatches(patchedPublicApp)") >
    launcher.indexOf("applyV2654MobileDetailIsolationPatches(patchedPublicApp)"),
  "V26.55 debe ejecutarse después de V26.54."
);

console.log("OK · V26.55 teclado móvil reserva espacio sin deformar la vista y evita auto-zoom de iOS.");
