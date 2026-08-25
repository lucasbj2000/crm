import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyV24ServerPatches } from "./lib/v24-server-patches.mjs";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const corePath = path.join(appDir, "server-core.mjs");
const generatedPath = path.join(appDir, ".server-v24.generated.mjs");

const source = await readFile(corePath, "utf8");
const patched = applyV24ServerPatches(source);
await writeFile(generatedPath, patched, "utf8");
await import(`${pathToFileURL(generatedPath).href}?v24=${Date.now()}`);
