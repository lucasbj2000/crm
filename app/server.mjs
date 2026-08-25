import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyV24ServerPatches } from "./lib/v24-server-patches.mjs";
import { applyV24CloudPatches } from "./lib/v24-cloud-patches.mjs";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const corePath = path.join(appDir, "server-core.mjs");
const generatedPath = path.join(appDir, ".server-v24.generated.mjs");

function restoreGeneratedTemplates(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`No se pudo normalizar el bloque V24: ${startMarker}`);
  const block = source.slice(start, end).replaceAll("\\`", "`").replaceAll("\\${", "${");
  return source.slice(0, start) + block + source.slice(end);
}

const source = await readFile(corePath, "utf8");
let patched = applyV24ServerPatches(source);
patched = applyV24CloudPatches(patched);
patched = restoreGeneratedTemplates(patched, "async function v24TranscribeMediaAttachment", "async function maybeReplyWithBot");
patched = restoreGeneratedTemplates(patched, "function v24ActiveObserverGrant", "app.post(\"/api/deals/:id/transfer\"");
await writeFile(generatedPath, patched, "utf8");
await import(`${pathToFileURL(generatedPath).href}?v24=${Date.now()}`);
