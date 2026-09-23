import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2654MobileDetailIsolationPatches } from "../lib/v26-54-mobile-detail-isolation-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const raw = await readFile(path.join(appDir, "public", "app.js"), "utf8");
const synthetic = raw + "\n// V26.51 AGENT_MOBILE_INBOX\n";
const patched = applyV2654MobileDetailIsolationPatches(synthetic);

for (const marker of [
  "V26.54 MOBILE_DETAIL_ISOLATION",
  "v2654-mobile-detail-open",
  "v2654-isolated",
  "window.visualViewport",
  "viewport?.height",
  "viewport?.offsetTop",
  "--v2654-vh",
  'document.querySelector("#deal-drawer")',
  'document.querySelector("#app-shell")',
  'attributeFilter: ["class", "aria-hidden"]',
]) assert.ok(patched.includes(marker), `Falta runtime V26.54: ${marker}`);

assert.equal(
  applyV2654MobileDetailIsolationPatches(patched),
  patched,
  "V26.54 debe ser idempotente."
);

const temp = path.join(appDir, ".v2654-check.js");
await writeFile(temp, patched, "utf8");
try {
  const syntax = spawnSync(process.execPath, ["--check", temp], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `Bundle V26.54 inválido:\n${syntax.stderr || syntax.stdout}`);
} finally {
  await rm(temp, { force: true });
}

const css = await readFile(path.join(appDir, "public", "styles.css"), "utf8");
for (const marker of [
  "/* V26.54 MOBILE DETAIL ISOLATION */",
  "body.v2654-mobile-detail-open #app-shell",
  "visibility:hidden!important",
  "#deal-drawer.v2654-isolated",
  "z-index:2147483000!important",
  "background:#f4f7f5!important",
  "height:var(--v2654-vh,100dvh)!important",
  "body.v2654-mobile-detail-open #v2651-mobile-inbox",
]) assert.ok(css.includes(marker), `Falta CSS V26.54: ${marker}`);

const index = await readFile(path.join(appDir, "public", "index.html"), "utf8");
assert.ok(index.includes("/styles.css?v=26.54-mobile-detail-isolation"), "index debe servir CSS V26.54.");
assert.ok(index.includes("/app.js?v=26.54-mobile-detail-isolation"), "index debe servir app.js V26.54.");
assert.ok(index.includes("/styles.css?v=26.52-mobile-inbox-cards"), "Debe conservar compatibilidad V26.52.");

const sw = await readFile(path.join(appDir, "public", "sw.js"), "utf8");
assert.ok(sw.includes("whatsbot-mobile-v26-54-mobile-detail-isolation"), "Service Worker debe invalidar V26.52.");
assert.ok(sw.includes("whatsbot-mobile-v26-52-mobile-inbox-cards"), "Debe conservar compatibilidad V26.52.");

const launcher = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.ok(launcher.includes("applyV2654MobileDetailIsolationPatches"), "server.mjs debe activar V26.54.");
assert.ok(
  launcher.indexOf("applyV2654MobileDetailIsolationPatches(patchedPublicApp)") >
    launcher.indexOf("applyV2651AgentMobileInboxPatches(patchedPublicApp)"),
  "V26.54 debe ejecutarse después de V26.51."
);

console.log("OK · V26.54 negociación móvil aislada de la bandeja principal y teclado validada.");
