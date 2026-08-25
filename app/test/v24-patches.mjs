import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { applyV24ServerPatches } from "../lib/v24-server-patches.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(testDir, "..");
const corePath = path.join(appDir, "server-core.mjs");
const generatedPath = path.join(appDir, ".server-v24.syntax-test.mjs");

const source = await readFile(corePath, "utf8");
const patched = applyV24ServerPatches(source);

for (const marker of [
  "v24TranscribeMediaAttachment",
  "v24DescribeImageAttachment",
  "v24UnderstandIncomingMedia",
  "v24GrantTransferObserver",
  "derivacion_interna_v24",
  "audioMime",
]) {
  assert.ok(patched.includes(marker), `Falta el marcador V24: ${marker}`);
}

await writeFile(generatedPath, patched, "utf8");
const syntax = spawnSync(process.execPath, ["--check", generatedPath], { encoding: "utf8" });
await unlink(generatedPath).catch(() => {});
if (syntax.status !== 0) {
  process.stderr.write(syntax.stderr || syntax.stdout || "Falló node --check\n");
  process.exit(syntax.status || 1);
}
console.log("V24 patches OK");
