import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2645CoreUiPatches } from "../lib/v26-45-deal-chat-unified-inbox-ui-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const raw = await readFile(path.join(appDir, "public", "app.js"), "utf8");
const synthetic = raw + "\n// V26.43 SIMPLE_RESPONSIVE_CONVERSATION\n";

const patched = applyV2645CoreUiPatches(synthetic);

for (const marker of [
  "V26.45 DEAL_CHAT_UNIFIED_INBOX_UI",
  "v2645-deal-chat-unified-style",
  "v2511-messages",
  "v2511-message",
  "v2511-composer",
  "v2645-ai-row",
  "overflow-y:auto!important",
  "background:#f5f7f5!important",
  "background:#dff2e5!important",
  "Sugerir con IA",
  'send.textContent = "Enviar"',
]) assert.ok(patched.includes(marker), `Falta V26.45: ${marker}`);

assert.equal(applyV2645CoreUiPatches(patched), patched, "V26.45 debe ser idempotente.");

const temp = path.join(appDir, ".v2645-check.js");
await writeFile(temp, patched, "utf8");
try {
  const syntax = spawnSync(process.execPath, ["--check", temp], { encoding:"utf8" });
  assert.equal(syntax.status, 0, `Bundle V26.45 inválido:\n${syntax.stderr || syntax.stdout}`);
} finally {
  await rm(temp, { force:true });
}

const launcher = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.ok(launcher.includes("applyV2645CoreUiPatches"), "server.mjs debe activar V26.45.");
assert.ok(
  launcher.indexOf("applyV2645CoreUiPatches(patchedPublicApp)") > launcher.indexOf("applyV2643CoreUiPatches(patchedPublicApp)"),
  "V26.45 debe ejecutarse después de V26.43."
);

console.log("OK · V26.45 negociación usa diseño de chat de Bandeja unificada.");
