import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.resolve(here,"../public");
async function checkHtml(file,markers=[]){
  const html=await readFile(path.join(publicDir,file),"utf8");
  for(const marker of markers)assert.ok(html.includes(marker),`${file}: falta ${marker}`);
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim());
  assert.ok(scripts.length,`${file}: no se encontró JavaScript inline.`);
  const temp=path.join(publicDir,`.${file}.syntax-test.js`);
  await writeFile(temp,scripts.join("\n;\n"),"utf8");
  const result=spawnSync(process.execPath,["--check",temp],{encoding:"utf8"});
  await unlink(temp).catch(()=>{});
  if(result.status!==0)throw new Error(`${file}: JavaScript inválido\n${result.stderr||result.stdout}`);
}
await checkHtml("master-v25.html",["Administrador Maestro · CRM V25","/api/gateway/master/companies/","Descargar backup JSON","Módulos habilitados"]);
await checkHtml("login.html",["Administrador Maestro · gestionar todas las empresas","/api/gateway/login","/master"]);
console.log("OK · login multiempresa y panel Administrador Maestro V25 validados.");
