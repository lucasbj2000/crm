import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyV256SecurityPatches } from '../lib/v25-6-security-patches.mjs';

const root=new URL('../../',import.meta.url);
const read=(path)=>readFile(new URL(path,root),'utf8');
const [css,js,loader,sw,serverCore,serverEntry]=await Promise.all([
  read('app/public/v25-6.css'),read('app/public/v25-6.js'),read('app/public/v22.js'),read('app/public/sw.js'),read('app/server-core.mjs'),read('app/server.mjs')
]);

assert.match(css,/V25\.6 · Mobile estable/);
assert.match(css,/@media\(max-width:900px\)/);
assert.match(css,/#crm-board\.board,[^{]*\.board\{[^}]*display:flex!important[^}]*overflow-x:auto!important/s);
assert.match(css,/\.sidebar\{[^}]*position:fixed!important[^}]*translateX\(-105%\)/s);
assert.match(css,/\.drawer,[^{]*#deal-drawer[^\{]*\{[^}]*100vw!important[^}]*--v256-app-height/s);
assert.match(css,/dialog\{[^}]*100vw!important[^}]*--v256-app-height/s);
assert.match(css,/\.v252-shell\.mobile-chat-open \.v252-chat\{display:flex!important\}/);
assert.match(css,/safe-area-inset-bottom/);
assert.match(js,/visualViewport/);
assert.match(js,/orientationchange/);
assert.match(js,/ensureMobileMenu/);
assert.match(loader,/\/v25-6\.css\?v=25\.6/);
assert.match(loader,/\/v25-6\.js\?v=25\.6/);
assert.match(sw,/whatsbot-mobile-v25-6-production-shell/);
assert.match(sw,/"\/v25-6\.css"/);
assert.match(sw,/"\/v25-6\.js"/);
assert.match(serverEntry,/applyV256SecurityPatches/);

const secured=applyV256SecurityPatches(serverCore);
assert.match(secured,/V256_ACCOUNT_FAILURES = 5/);
assert.match(secured,/V256_IP_FAILURES = 20/);
assert.match(secured,/V256_IDLE_SESSION_MS = 60 \* 60 \* 1000/);
assert.match(secured,/absoluteExpiresAt/);
assert.match(secured,/SameSite=Strict; Path=\/; Max-Age=43200\$\{v256SecureCookieSuffix\(request\)\}/);
assert.match(secured,/Strict-Transport-Security/);
assert.match(secured,/Permissions-Policy/);
assert.match(secured,/frame-ancestors 'none'/);
assert.match(secured,/sec-fetch-site/);
assert.match(secured,/La contraseña debe tener entre 12 y 128 caracteres/);
assert.match(secured,/app\.get\("\/api\/security\/status"/);
assert.doesNotMatch(secured,/La nueva contraseña debe tener entre 8 y 128 caracteres/);
console.log('V25.6 mobile/security contracts: OK');
