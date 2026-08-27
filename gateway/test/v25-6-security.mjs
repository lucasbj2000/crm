import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { applyV25GatewayPatches } from '../lib/v25-gateway-patches.mjs';
import { applyV255GatewayPatches } from '../lib/v25-5-gateway-patches.mjs';
import { applyV256GatewaySecurityPatches } from '../lib/v25-6-gateway-security-patches.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const gatewayDir=path.resolve(here,'..');
const source=await readFile(path.join(gatewayDir,'gateway.mjs'),'utf8');
let patched=applyV25GatewayPatches(source);
patched=applyV255GatewayPatches(patched);
patched=applyV256GatewaySecurityPatches(patched);

assert.match(patched,/V256_GATEWAY_LOCK=15\*60\*1000/);
assert.match(patched,/v256GatewayGuard\(req,v256Scope,5\)/);
assert.match(patched,/Demasiados intentos/);
assert.match(patched,/SameSite=Strict/);
assert.match(patched,/v256GatewaySecureCookies/);
assert.match(patched,/strict-transport-security/);
assert.match(patched,/permissions-policy/);
assert.match(patched,/La contraseña debe tener entre 12 y 128 caracteres/);
assert.doesNotMatch(patched,/La contraseña inicial debe tener al menos 8 caracteres/);
assert.doesNotMatch(patched,/La contraseña debe tener al menos 8 caracteres/);

const generated=path.join(gatewayDir,'.v25-6-security-test.generated.mjs');
try{
  await writeFile(generated,patched,'utf8');
  execFileSync(process.execPath,['--check',generated],{stdio:'pipe'});
}finally{await unlink(generated).catch(()=>{});}

const setup=await readFile(path.join(gatewayDir,'setup-master.mjs'),'utf8');
assert.match(setup,/password\.length<12/);
assert.match(setup,/groups<3/);
console.log('V25.6 gateway security contracts: OK');
