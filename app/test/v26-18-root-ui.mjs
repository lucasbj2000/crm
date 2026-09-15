import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optimizeCoreApp, optimizeUnifiedInbox } from "../lib/v26-14-performance-patches.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const appDir=path.resolve(here,"..");
const appSource=await readFile(path.join(appDir,"public","app.js"),"utf8");
const inboxSource=await readFile(path.join(appDir,"public","v25-11.js"),"utf8");
const optimizedApp=optimizeCoreApp(appSource);
const optimizedInbox=optimizeUnifiedInbox(inboxSource);

assert.doesNotMatch(optimizedApp,/list\.innerHTML = entries\.map/,"El pipeline no debe destruir columnas completas para refrescar fichas.");
assert.match(optimizedApp,/function v2618PatchDealList/,"El pipeline debe reconciliar fichas por id.");
assert.match(optimizedApp,/dataset\.v2618Signature/,"Las fichas sin cambios deben conservar su nodo DOM.");
assert.match(optimizedApp,/list\.scrollTop=previousTop/,"El pipeline debe preservar la posición de scroll.");

assert.doesNotMatch(optimizedInbox,/messages\.innerHTML=rows\.length/,"La conversación no debe repintar todo el historial.");
assert.doesNotMatch(optimizedInbox,/list\.innerHTML=rows\.length/,"La bandeja no debe repintar toda la lista.");
assert.match(optimizedInbox,/data-v2618-message-key/,"Los mensajes deben reconciliarse por clave estable.");
assert.match(optimizedInbox,/setSelectionRange/,"La actualización debe conservar selección/cursor del compositor.");
assert.match(optimizedInbox,/nearBottom/,"El autoscroll debe depender de si el usuario ya estaba abajo.");
assert.match(optimizedInbox,/oldTop\+Math\.max\(0,messages\.scrollHeight-oldHeight\)/,"Leer mensajes antiguos no debe provocar saltos al llegar contenido nuevo.");

for(const [name,content] of [["app",optimizedApp],["inbox",optimizedInbox]]){
  const target=path.join(appDir,`.v26-18-${name}-check.js`);
  await writeFile(target,content,"utf8");
  const syntax=spawnSync(process.execPath,["--check",target],{encoding:"utf8"});
  await rm(target,{force:true});
  assert.equal(syntax.status,0,`${name} optimizado debe tener sintaxis válida: ${syntax.stderr||syntax.stdout}`);
}

const patch=await readFile(path.join(appDir,"lib","v26-14-performance-patches.mjs"),"utf8");
assert.match(patch,/app\.get\("\/app\.js"/,"El servidor debe entregar app.js optimizado antes de express.static.");
assert.match(patch,/app\.get\("\/v25-11\.js"/,"El servidor debe entregar la bandeja optimizada antes de express.static.");

console.log("OK · V26.18 pipeline y mensajería actualizan por ítem preservando scroll y foco.");
