import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV25GatewayPatches } from "../lib/v25-gateway-patches.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const gatewayDir=path.resolve(here,"..");
const source=await readFile(path.join(gatewayDir,"gateway.mjs"),"utf8");
const patched=applyV25GatewayPatches(source);
for(const marker of ["master-v25.html","v25TenantSessionValid","v25TenantSummary","/overview","/control","/backup","Ruta pública sin empresa"]){assert.ok(patched.includes(marker),`Falta marcador Gateway V25: ${marker}`)}
assert.ok(!patched.includes("if(await publicProbe(req,res,cfg.companies.filter(x=>x.active!==false)))return"),"El Gateway V25 todavía hace búsqueda pública entre empresas.");
const generated=path.join(gatewayDir,".gateway-v25.syntax-test.mjs");await writeFile(generated,patched,"utf8");const result=spawnSync(process.execPath,["--check",generated],{encoding:"utf8"});await unlink(generated).catch(()=>{});if(result.status!==0){process.stderr.write(result.stderr||result.stdout);process.exit(result.status||1)}
console.log("OK · parches Gateway V25 y aislamiento de rutas validados.");
