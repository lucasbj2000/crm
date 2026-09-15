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

const here=path.dirname(fileURLToPath(import.meta.url));
const gatewayDir=path.resolve(here,"..");
const root=path.resolve(gatewayDir,"..");
const core=await readFile(path.join(gatewayDir,"gateway.mjs"),"utf8");
let patched=applyV25GatewayPatches(core);
patched=applyV255GatewayPatches(patched);
patched=applyV256GatewaySecurityPatches(patched);
patched=applyV2512GatewaySocialPlatformPatches(patched);
patched=applyV264TenantReliabilityPatches(patched);
patched=applyV2618GatewayAlwaysOnPatches(patched);

assert.match(patched,/const v2618TenantStarting=new Map\(\)/,"Debe existir lock de arranque por tenant.");
assert.match(patched,/if\(inFlight\)return inFlight/,"Dos solicitudes concurrentes deben reutilizar el mismo arranque.");
assert.match(patched,/async function v2618BootTenants\(\)/,"El Gateway debe prelevantar tenants activos.");
assert.match(patched,/cfg\.companies\.filter\(company=>company\.active!==false\)/,"Solo tenants activos deben prelevantarse.");
assert.match(patched,/v2618ScheduleRespawn\(c,'process-exit'\)/,"Una caída de tenant debe programar recuperación automática.");
assert.match(patched,/Math\.min\(previous\*2,30000\)/,"El respawn debe usar backoff acotado.");
assert.match(patched,/v2618GatewayShuttingDown=true/,"El cierre del Gateway debe impedir respawns durante shutdown.");
assert.doesNotMatch(patched,/delete out\['content-security-policy'\]/,"El Gateway no debe eliminar la CSP del tenant.");
assert.match(patched,/json\(res,500,\{error:'Error interno del Gateway\.'/,"Los errores 500 no deben exponer e.message al cliente.");
assert.match(patched,/v2618CleanupMasterSessions/,"Las sesiones maestras expiradas deben limpiarse.");
assert.match(patched,/Empresas activas: modo always-on/,"El modo de producción debe declarar tenants always-on.");

const generated=path.join(gatewayDir,".v26-18-gateway-check.mjs");
await writeFile(generated,patched,"utf8");
const syntax=spawnSync(process.execPath,["--check",generated],{encoding:"utf8"});
await rm(generated,{force:true});
assert.equal(syntax.status,0,`El Gateway V26.18 generado debe ser sintácticamente válido: ${syntax.stderr||syntax.stdout}`);

const launcher=await readFile(path.join(gatewayDir,"v25-gateway.mjs"),"utf8");
assert.match(launcher,/applyV2618GatewayAlwaysOnPatches/,"Producción debe aplicar V26.18 al Gateway generado.");

const serverCore=await readFile(path.join(root,"app","server-core.mjs"),"utf8");
assert.match(serverCore,/useMultiFileAuthState\(authDirectory\)/,"La sesión QR principal debe persistir en disco.");
assert.match(serverCore,/useMultiFileAuthState\(authPath\)/,"Las sesiones QR de sucursal/línea deben persistir en disco.");
assert.match(serverCore,/runtime\.socket\.ev\.on\("creds\.update", saveCreds\)|runtime\.socket\.ev\.on\("creds\.update",saveCreds\)/,"Baileys debe persistir actualizaciones de credenciales.");

const start=await readFile(path.join(root,"start-vps.sh"),"utf8");
assert.match(start,/internal-gateway-secret/,"El secreto interno debe persistir fuera del código.");
assert.match(start,/CRM_GATEWAY_SECRET="\$\(cat "\$SECRET_FILE"\)"/,"El arranque debe reutilizar el secreto persistente.");

console.log("OK · V26.18 Gateway always-on, lock de spawn, respawn, CSP y sesión QR persistente validados.");
