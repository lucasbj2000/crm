import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV25GatewayPatches } from "../lib/v25-gateway-patches.mjs";
import { applyV255GatewayPatches } from "../lib/v25-5-gateway-patches.mjs";
import { applyV256GatewaySecurityPatches } from "../lib/v25-6-gateway-security-patches.mjs";
import { applyV2512GatewaySocialPlatformPatches } from "../lib/v25-12-social-platform-patches.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const gatewayDir=path.resolve(here,"..");
const source=await readFile(path.join(gatewayDir,"gateway.mjs"),"utf8");
let patched=applyV25GatewayPatches(source);
patched=applyV255GatewayPatches(patched);
patched=applyV256GatewaySecurityPatches(patched);
patched=applyV2512GatewaySocialPlatformPatches(patched);

for(const marker of [
  "/api/gateway/master/social-oauth",
  "/api/social/oauth/meta/callback",
  "/api/social/oauth/tiktok/callback",
  "/api/social/meta/webhook",
  "CRM_SOCIAL_META_APP_ID",
  "CRM_SOCIAL_META_APP_SECRET",
  "CRM_SOCIAL_TIKTOK_CLIENT_KEY",
  "createHmac",
  "master-v25-12.js",
]) assert.ok(patched.includes(marker),`Falta marcador social global: ${marker}`);

assert.ok(patched.includes("v2512TenantFromOauthState"),"El callback global debe resolver el tenant desde state.");
assert.ok(patched.includes("v2512StopAllTenants"),"Guardar credenciales globales debe reiniciar tenants para propagar el entorno.");
assert.ok(!patched.includes("/t/'+company.slug+'/api/social/oauth/meta/callback"),"El callback de Meta no debe depender de registrar una URL por empresa.");

const generated=path.join(gatewayDir,".gateway-v25-12.syntax-test.mjs");
await writeFile(generated,patched,"utf8");
const syntax=spawnSync(process.execPath,["--check",generated],{encoding:"utf8"});
await unlink(generated).catch(()=>{});
assert.equal(syntax.status,0,`Gateway V25.12 inválido: ${syntax.stderr||syntax.stdout||""}`);

const masterUi=await readFile(path.join(gatewayDir,"public","master-v25-12.js"),"utf8");
assert.match(masterUi,/Conexiones sociales de la plataforma/);
assert.match(masterUi,/App ID/);
assert.match(masterUi,/App Secret/);
assert.match(masterUi,/OAuth Redirect URI/);
assert.match(masterUi,/Verify Token/);
assert.match(masterUi,/\/api\/gateway\/master\/social-oauth/);

console.log("OK · V25.12 OAuth social global y Administrador Maestro validados.");
