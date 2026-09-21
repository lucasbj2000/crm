import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV25GatewayPatches } from "../lib/v25-gateway-patches.mjs";
import { applyV255GatewayPatches } from "../lib/v25-5-gateway-patches.mjs";
import { applyV256GatewaySecurityPatches } from "../lib/v25-6-gateway-security-patches.mjs";
import { applyV2512GatewaySocialPlatformPatches } from "../lib/v25-12-social-platform-patches.mjs";
import { applyV264TenantReliabilityPatches } from "../lib/v26-4-tenant-reliability-patches.mjs";
import { applyV2618GatewayAlwaysOnPatches } from "../lib/v26-18-always-on-patches.mjs";
import { applyV26181RuntimeStabilityPatches } from "../lib/v26-18-1-runtime-stability-patches.mjs";
import { applyV2637GatewayGuardianPatches } from "../lib/v26-37-guardian-24x7-patches.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const gatewayDir=path.resolve(here,"..");
const core=await readFile(path.join(gatewayDir,"gateway.mjs"),"utf8");
let patched=applyV25GatewayPatches(core);
patched=applyV255GatewayPatches(patched);
patched=applyV256GatewaySecurityPatches(patched);
patched=applyV2512GatewaySocialPlatformPatches(patched);
patched=applyV264TenantReliabilityPatches(patched);
patched=applyV2618GatewayAlwaysOnPatches(patched);
patched=applyV26181RuntimeStabilityPatches(patched);
patched=applyV2637GatewayGuardianPatches(patched);

assert.match(patched,/setInterval\(\(\)=>\{ void v2637GuardianSweep\(\); \},30_000\)/,"El Gateway debe revisar tenants cada 30 segundos.");
assert.match(patched,/row\.failures >= 3/,"Debe exigir tres fallos consecutivos antes de reiniciar.");
assert.match(patched,/AbortSignal\.timeout\(4000\)/,"Cada health-check debe tener timeout para detectar procesos congelados.");
assert.match(patched,/await v26181RestartTenant\(company\)/,"Un tenant congelado debe reiniciarse de forma segura.");
assert.match(patched,/await ensureTenant\(company\)/,"Un tenant ausente debe levantarse aunque no haya usuarios.");
assert.match(patched,/v2637TenantGuardianBusy/,"Debe evitar health-checks/reinicios concurrentes del mismo tenant.");
assert.match(patched,/guardian:v2637GuardianPublic\(\)/,"El health del Gateway debe exponer diagnóstico del guardian.");
assert.match(patched,/clearInterval\(v2637TenantGuardianTimer\)/,"El cierre debe detener el guardian limpiamente.");

const generated=path.join(gatewayDir,".v26-37-gateway-check.mjs");
await writeFile(generated,patched,"utf8");
const syntax=spawnSync(process.execPath,["--check",generated],{encoding:"utf8"});
await rm(generated,{force:true});
assert.equal(syntax.status,0,`El Gateway V26.37 generado debe ser válido: ${syntax.stderr||syntax.stdout}`);

const launcher=await readFile(path.join(gatewayDir,"v25-gateway.mjs"),"utf8");
assert.match(launcher,/applyV2637GatewayGuardianPatches/,"Producción debe activar el guardian V26.37.");
assert.ok(launcher.indexOf("applyV2637GatewayGuardianPatches")>launcher.indexOf("applyV26181RuntimeStabilityPatches"),"V26.37 debe aplicarse después de V26.18.1.");

console.log("OK · V26.37 guardian de tenants 24/7 validado.");
