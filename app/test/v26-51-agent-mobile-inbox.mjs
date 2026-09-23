import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2651AgentMobileInboxPatches } from "../lib/v26-51-agent-mobile-inbox-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const raw = await readFile(path.join(appDir, "public", "app.js"), "utf8");
const synthetic = raw + "\n// V26.46 COMPLETE_MOBILE_RUNTIME\n";
const patched = applyV2651AgentMobileInboxPatches(synthetic);

for (const marker of [
  "V26.51 AGENT_MOBILE_INBOX",
  "v2651-mobile-inbox",
  'data-v2651-filter="pending"',
  'data-v2651-filter="answered"',
  'data-v2651-attendance="active"',
  'data-v2651-attendance="paused"',
  'data-v2651-close="won"',
  'data-v2651-close="lost"',
  '"/api/attendance/me"',
  'addEventListener("touchmove"',
  '{ passive: false }',
  "event.preventDefault()",
  "grid-template-rows:auto auto auto minmax(0,1fr)",
  "overflow-y:auto!important",
  "v2651BindTouchScroller",
]) assert.ok(patched.includes(marker), `Falta V26.51: ${marker}`);

assert.equal(
  (patched.match(/V26\.51 AGENT_MOBILE_INBOX/g) || []).length,
  1,
  "V26.51 debe agregarse una sola vez."
);
assert.equal(
  applyV2651AgentMobileInboxPatches(patched),
  patched,
  "V26.51 debe ser idempotente."
);

const temp = path.join(appDir, ".v2651-check.js");
await writeFile(temp, patched, "utf8");
try {
  const syntax = spawnSync(process.execPath, ["--check", temp], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `Bundle V26.51 inválido:\n${syntax.stderr || syntax.stdout}`);
} finally {
  await rm(temp, { force: true });
}

const launcher = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.ok(launcher.includes("applyV2651AgentMobileInboxPatches"), "server.mjs debe activar V26.51.");
assert.ok(
  launcher.indexOf("applyV2651AgentMobileInboxPatches(patchedPublicApp)") >
    launcher.indexOf("applyV2646CoreUiPatches(patchedPublicApp)"),
  "V26.51 debe ejecutarse después de V26.46."
);

const sw = await readFile(path.join(appDir, "public", "sw.js"), "utf8");
assert.ok(sw.includes("whatsbot-mobile-v26-51-agent-mobile-inbox"), "La PWA debe invalidar el cache anterior.");

console.log("OK · V26.51 bandeja móvil de agentes, disponibilidad, cierre y scroll táctil validados.");
