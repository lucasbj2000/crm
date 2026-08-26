import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyV25GatewayPatches } from "./lib/v25-gateway-patches.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const corePath=path.join(here,"gateway.mjs");
const generatedPath=path.join(here,".gateway-v25.generated.mjs");
const source=await readFile(corePath,"utf8");
const patched=applyV25GatewayPatches(source);
await writeFile(generatedPath,patched,"utf8");
await import(`${pathToFileURL(generatedPath).href}?v25=${Date.now()}`);
