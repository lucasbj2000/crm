import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV265MediaReliabilityPatches } from "../lib/v26-5-media-reliability-patches.mjs";
import { applyV266MediaRetryPatches } from "../lib/v26-6-media-retry-patches.mjs";
import { applyV2659MediaListenerSafetyPatches } from "../lib/v26-59-media-listener-safety-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const raw = await readFile(path.join(appDir, "server-core.mjs"), "utf8");

let patched = applyV265MediaReliabilityPatches(raw);
patched = applyV266MediaRetryPatches(patched);
patched = applyV2659MediaListenerSafetyPatches(patched);

for (const marker of [
  "V26.59 MEDIA_LISTENER_SAFETY",
  "const v2659MediaRefreshState = new WeakMap();",
  "const v2659MaxPendingRefreshesPerSocket = 2;",
  "state.pending.has(key)",
  "state.pending.size >= v2659MaxPendingRefreshesPerSocket",
  "v2659AwaitMediaRefresh(message, socket)",
  "v2659AwaitMediaRefresh(item, sourceSocket)",
  "[media refresh bounded]",
]) assert.ok(patched.includes(marker), `Falta V26.59: ${marker}`);

assert.ok(
  !patched.includes("const refreshed = await socket.updateMediaMessage(message);"),
  "El reupload multimedia no debe abrir updateMediaMessage sin pasar por el límite V26.59."
);

assert.ok(
  !patched.includes('sourceSocket.updateMediaMessage(item),\n      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout refrescando multimedia")), 7000))'),
  "No debe quedar el Promise.race anterior que abandona listeners internos al expirar."
);

assert.equal(
  applyV2659MediaListenerSafetyPatches(patched),
  patched,
  "V26.59 debe ser idempotente."
);

const temp = path.join(appDir, ".v2659-generated-check.mjs");
await writeFile(temp, patched, "utf8");
try {
  const syntax = spawnSync(process.execPath, ["--check", temp], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `Servidor V26.59 inválido:\n${syntax.stderr || syntax.stdout}`);
} finally {
  await rm(temp, { force: true });
}

const launcher = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.ok(launcher.includes("applyV2659MediaListenerSafetyPatches"), "server.mjs debe activar V26.59.");
assert.ok(
  launcher.indexOf("applyV2659MediaListenerSafetyPatches(patched)") >
    launcher.indexOf("applyV266MediaRetryPatches(patched)"),
  "V26.59 debe ejecutarse después de V26.6."
);

console.log("OK · V26.59 limita refresh multimedia pendientes y evita acumulación de listeners de Baileys.");
