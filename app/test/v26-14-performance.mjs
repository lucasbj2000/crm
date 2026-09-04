import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optimizeUnifiedInbox, applyV2614PerformancePatches } from "../lib/v26-14-performance-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const v2511 = await readFile(path.join(appDir, "public", "v25-11.js"), "utf8");
const optimized = optimizeUnifiedInbox(v2511);

assert.match(optimized,/let inboxLoading = false/,"La bandeja debe impedir solicitudes superpuestas.");
assert.match(optimized,/function inboxVisualSignature/,"La bandeja debe comparar contenido antes de repintar.");
assert.match(optimized,/signature!==inboxSignature\|\|minuteRefresh/,"La bandeja solo debe renderizar cuando cambie o al renovar tiempos relativos.");
assert.match(optimized,/Date\.now\(\)-lastOAuthLoadAt<60000/,"OAuth no debe consultarse en cada ciclo de bandeja.");
assert.match(optimized,/\},4000\);/,"La sincronización de bandeja debe mantenerse frecuente sin repintados innecesarios.");

const optimizedCheck = path.join(appDir, ".v26-14-v2511-check.js");
await writeFile(optimizedCheck, optimized, "utf8");
const optimizedSyntax = spawnSync(process.execPath,["--check",optimizedCheck],{encoding:"utf8"});
await rm(optimizedCheck,{force:true});
assert.equal(optimizedSyntax.status,0,`La bandeja optimizada debe tener sintaxis válida: ${optimizedSyntax.stderr||optimizedSyntax.stdout}`);

const fakeServer='const app = express();\napp.use(express.static(publicDirectory, { extensions: ["html"] }));\n';
const patchedFake=applyV2614PerformancePatches(fakeServer);
assert.match(patchedFake,/app\.get\("\/v25-11\.js"/,"V26.14 debe servir la bandeja optimizada antes del estático.");
assert.ok(patchedFake.indexOf('app.get("/v25-11.js"')<patchedFake.indexOf("app.use(express.static"),"La versión optimizada debe interceptar el asset original.");

const runtime = await readFile(path.join(appDir,"public","v26-14.js"),"utf8");
const css = await readFile(path.join(appDir,"public","v26-14.css"),"utf8");
const sw = await readFile(path.join(appDir,"public","sw.js"),"utf8");
const loader = await readFile(path.join(appDir,"public","v26-1.js"),"utf8");
const botUi = await readFile(path.join(appDir,"public","v26-10.js"),"utf8");
const server = await readFile(path.join(appDir,"server.mjs"),"utf8");

assert.match(runtime,/PerformanceObserver/,"V26.14 debe detectar tareas largas y reducir efectos si el navegador se sobrecarga.");
assert.match(runtime,/v2614-low-motion/,"Debe existir degradación automática de animaciones.");
assert.doesNotMatch(runtime,/setInterval|MutationObserver|EventSource/,"La capa de rendimiento no debe agregar polling ni observadores DOM pesados.");
assert.match(css,/content-visibility:auto/,"Las listas extensas deben omitir render fuera de pantalla cuando el navegador lo permita.");
assert.match(css,/contain:layout style/,"Las zonas pesadas deben aislar cálculos de layout.");
assert.match(sw,/whatsbot-mobile-v26-14-performance-shell/,"La PWA debe usar caché V26.14.");
assert.match(sw,/staleWhileRevalidate/,"Los recursos estáticos deben abrir desde caché y actualizarse en segundo plano.");
assert.match(sw,/STATIC_PATHS\.has\(url\.pathname\)/,"La estrategia rápida debe limitarse a recursos estáticos conocidos.");
assert.match(loader,/\/v26-14\.css\?v=26140/,"El loader debe cargar CSS V26.14.");
assert.match(loader,/\/v26-14\.js\?v=26140/,"El loader debe cargar JS V26.14.");
assert.doesNotMatch(botUi,/live-support|Soporte en vivo|EventSource|sendAgentTelemetry|buildSnapshot/,"El frontend activo debe estar libre de soporte en vivo.");
assert.match(server,/applyV2614PerformancePatches/,"El servidor debe activar la optimización V26.14.");
assert.doesNotMatch(server,/v26-12-live-support|v26-13-live-support|applyV2612LiveSupport|applyV2613LiveSupport/,"El arranque no debe cargar soporte en vivo retirado.");

for(const file of ["v26-14.js","v26-1.js","v26-10.js","sw.js"]){
  const check=spawnSync(process.execPath,["--check",path.join(appDir,"public",file)],{encoding:"utf8"});
  assert.equal(check.status,0,`${file} debe tener sintaxis válida: ${check.stderr||check.stdout}`);
}

console.log("OK · V26.14 soporte en vivo retirado, bandeja incremental, caché rápida y rendimiento adaptativo validados.");
