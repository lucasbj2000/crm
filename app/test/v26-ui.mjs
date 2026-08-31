import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const appDir=path.resolve(here,"..");
const repoRoot=path.resolve(appDir,"..");
const css=await readFile(path.join(appDir,"public","v26-1.css"),"utf8");
const js=await readFile(path.join(appDir,"public","v26-1.js"),"utf8");
const loader=await readFile(path.join(appDir,"public","v25-7.js"),"utf8");
const sw=await readFile(path.join(appDir,"public","sw.js"),"utf8");
const login=await readFile(path.join(repoRoot,"gateway","public","login.html"),"utf8");

assert.match(css,/--crm-radius-xl/,"V26.1.1 debe conservar un sistema global de radios.");
assert.match(css,/--crm-shadow-md/,"V26.1.1 debe conservar sombras globales.");
assert.match(css,/\.v26-welcome/,"V26.1.1 debe conservar la portada amigable.");
assert.match(css,/#v2511-unified-inbox/,"V26.1.1 debe estilizar la bandeja existente sin reemplazar su lógica.");
assert.match(css,/@media\(max-width:760px\)/,"V26.1.1 debe mantener adaptación responsive.");
assert.doesNotMatch(css,/#app-shell\.app-shell\{display:grid!important/,"V26.1.1 no debe reemplazar el layout principal.");
assert.doesNotMatch(css,/\.board-column\{[^}]*min-height:/s,"V26.1.1 no debe forzar alturas del kanban.");
assert.doesNotMatch(css,/input,[\s\S]*background:[^;]+!important/,"V26.1.1 no debe recolorear globalmente controles con !important.");

assert.match(js,/removeUnstableV26Controls/,"V26.1.1 debe limpiar controles experimentales anteriores.");
assert.match(js,/window\.addEventListener\("crm:state"/,"V26.1.1 debe actualizarse con el estado existente.");
assert.doesNotMatch(js,/new MutationObserver/,"V26 no debe introducir observadores DOM globales.");
assert.doesNotMatch(js,/crm_v26_sidebar/,"V26.1.1 no debe compactar el sidebar mientras se estabiliza el layout.");

assert.match(loader,/\/v26-1\.css\?v=26011/,"El loader debe cargar el skin estable V26.1.1.");
assert.match(loader,/\/v26-1\.js\?v=26011/,"El loader debe cargar la lógica estable V26.1.1.");
assert.match(loader,/script\.onload = loadV26Assets/,"V26 debe seguir cargándose luego de V25.12.");
assert.doesNotMatch(loader,/\/v26\.css\?v=26010/,"El loader no debe cargar la hoja V26.1 invasiva.");
assert.doesNotMatch(loader,/\/v26\.js\?v=26010/,"El loader no debe cargar la lógica V26.1 invasiva.");

assert.match(sw,/whatsbot-mobile-v26-1-1-production-shell/,"La PWA debe renovar caché para V26.1.1.");
assert.match(sw,/"\/v26-1\.css"/,"La PWA debe precachear V26.1.1 CSS.");
assert.match(sw,/"\/v26-1\.js"/,"La PWA debe precachear V26.1.1 JS.");

assert.match(login,/border-radius:38px/,"El acceso multiempresa conserva el lenguaje visual redondeado.");
assert.match(login,/Una experiencia más simple/,"El login V26 conserva la experiencia amigable.");
assert.match(login,/Administrador Maestro/,"El acceso al panel maestro debe conservarse.");
assert.match(login,/\/api\/gateway\/login/,"El rediseño no debe cambiar autenticación.");

console.log("OK · V26.1.1 skin premium estable y layout legacy preservado.");
