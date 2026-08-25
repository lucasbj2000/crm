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

function restoreGeneratedTemplates(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `No se encontró el bloque ${startMarker}`);
  const block = source.slice(start, end).replaceAll("\\`", "`").replaceAll("\\${", "${");
  return source.slice(0, start) + block + source.slice(end);
}

const source = await readFile(corePath, "utf8");
let patched = applyV24ServerPatches(source);
patched = restoreGeneratedTemplates(patched, "async function v24TranscribeMediaAttachment", "async function maybeReplyWithBot");
patched = restoreGeneratedTemplates(patched, "function v24ActiveObserverGrant", "app.post(\"/api/deals/:id/transfer\"");

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
