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

const here=path.dirname(fileURLToPath(import.meta.url));
const gatewayDir=path.resolve(here,"..");
const core=await readFile(path.join(gatewayDir,"gateway.mjs"),"utf8");
let patched=applyV25GatewayPatches(core);
patched=applyV255GatewayPatches(patched);
patched=applyV256GatewaySecurityPatches(patched);
patched=applyV2512GatewaySocialPlatformPatches(patched);
patched=applyV264TenantReliabilityPatches(patched);

assert.match(patched,/d\.settings\.whatsappMode='qr'/,"Toda empresa nueva debe iniciar explícitamente en modo QR.");
assert.match(patched,/recoverStuckSessions:true/,"Toda empresa nueva debe heredar recuperación de sesiones QR trabadas.");
assert.match(patched,/d\.settings\.externalCatalogs=\[\]/,"Cada empresa nueva debe tener catálogos externos aislados desde su creación.");
assert.match(patched,/await ensureTenant\(c\)/,"Crear empresa debe iniciar la instancia antes de responder éxito.");
assert.match(patched,/runtimeReady:true,qrReady:true/,"El alta debe declarar lista la empresa solo después del preflight.");
assert.match(patched,/La empresa no superó la validación inicial del motor QR/,"Un fallo QR inicial debe impedir una empresa aparentemente sana.");
assert.match(patched,/await rm\(absDataDir\(c\)/,"Un alta fallida debe limpiar el tenant incompleto.");
assert.match(patched,/cfg\.companies=cfg\.companies\.filter/,"Un alta fallida debe retirarse también del control plane.");

const generated=path.join(gatewayDir,".v26-4-gateway-check.mjs");
await writeFile(generated,patched,"utf8");
const syntax=spawnSync(process.execPath,["--check",generated],{encoding:"utf8"});
await rm(generated,{force:true});
assert.equal(syntax.status,0,`El gateway generado V26.4 debe ser sintácticamente válido: ${syntax.stderr||syntax.stdout}`);

const launcher=await readFile(path.join(gatewayDir,"v25-gateway.mjs"),"utf8");
assert.match(launcher,/applyV264TenantReliabilityPatches/,"El gateway de producción debe aplicar la confiabilidad V26.4.");

console.log("OK · V26.4 empresas nuevas nacen con QR, preflight y catálogos aislados.");
