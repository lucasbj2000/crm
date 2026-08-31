import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const appDir=path.resolve(here,"..");
const repoRoot=path.resolve(appDir,"..");
const css=await readFile(path.join(appDir,"public","v26.css"),"utf8");
const js=await readFile(path.join(appDir,"public","v26.js"),"utf8");
const loader=await readFile(path.join(appDir,"public","v25-7.js"),"utf8");
const sw=await readFile(path.join(appDir,"public","sw.js"),"utf8");
const login=await readFile(path.join(repoRoot,"gateway","public","login.html"),"utf8");

assert.match(css,/--crm-radius-xl/,"V26 debe definir un sistema global de radios.");
assert.match(css,/--crm-shadow-md/,"V26 debe definir sombras globales.");
assert.match(css,/\.v26-welcome/,"V26 debe tener portada amigable en el dashboard.");
assert.match(css,/\.v26-mobile-nav/,"V26 debe tener navegación móvil dedicada.");
assert.match(css,/#v2511-unified-inbox/,"V26 debe modernizar la bandeja omnicanal existente sin reemplazar su lógica.");
assert.match(css,/data-v26-theme="dark"/,"V26 debe soportar modo oscuro.");
assert.match(css,/@media\(max-width:760px\)/,"V26 debe ser mobile-first/responsive.");

assert.match(js,/crm_v26_theme/,"V26 debe recordar la preferencia visual del usuario.");
assert.match(js,/crm_v26_sidebar/,"V26 debe recordar el estado de la navegación lateral.");
assert.match(js,/data-v26-view="whatsapp"/,"La navegación móvil debe abrir conversaciones.");
assert.match(js,/data-v26-view="contacts"/,"La navegación móvil debe abrir clientes.");
assert.match(js,/data-v26-action="new"/,"La navegación móvil debe tener creación rápida.");
assert.match(js,/window\.addEventListener\("crm:state"/,"V26 debe actualizarse con el estado existente del CRM.");
assert.doesNotMatch(js,/new MutationObserver/,"V26 no debe introducir observadores DOM globales que puedan congelar la interfaz.");

assert.match(loader,/\/v26\.css\?v=26010/,"El loader debe cargar estilos V26 después de V25.12.");
assert.match(loader,/\/v26\.js\?v=26010/,"El loader debe cargar lógica V26 después de V25.12.");
assert.match(loader,/script\.onload = loadV26Assets/,"V26 debe cargarse solamente después de la compatibilidad V25.12.");

assert.match(sw,/whatsbot-mobile-v26-1-production-shell/,"La PWA debe renovar su caché para V26.1.");
assert.match(sw,/"\/v26\.css"/,"La PWA debe precachear V26 CSS.");
assert.match(sw,/"\/v26\.js"/,"La PWA debe precachear V26 JS.");

assert.match(login,/border-radius:38px/,"El acceso multiempresa debe adoptar el nuevo lenguaje visual redondeado.");
assert.match(login,/Una experiencia más simple/,"El login V26 debe comunicar una experiencia más amigable.");
assert.match(login,/Administrador Maestro/,"El acceso al panel maestro debe conservarse.");
assert.match(login,/\/api\/gateway\/login/,"El rediseño no debe cambiar el endpoint de autenticación.");

console.log("OK · V26.1 UI premium, responsive, tema y compatibilidad validados.");
