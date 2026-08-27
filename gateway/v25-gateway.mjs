import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyV25GatewayPatches } from "./lib/v25-gateway-patches.mjs";
import { applyV255GatewayPatches } from "./lib/v25-5-gateway-patches.mjs";
import { applyV256GatewaySecurityPatches } from "./lib/v25-6-gateway-security-patches.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const corePath=path.join(here,"gateway.mjs");
const generatedPath=path.join(here,".gateway-v25.generated.mjs");
const source=await readFile(corePath,"utf8");
let patched=applyV25GatewayPatches(source);
patched=applyV255GatewayPatches(patched);
patched=applyV256GatewaySecurityPatches(patched);
await writeFile(generatedPath,patched,"utf8");
await import(`${pathToFileURL(generatedPath).href}?v25=${Date.now()}`);
