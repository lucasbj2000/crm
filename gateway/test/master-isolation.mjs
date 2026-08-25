import { randomBytes, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createInitialData } from "../../app/lib/domain.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"../..");
const temp=await mkdtemp(path.join(tmpdir(),"crm-gateway-isolation-"));
const gatewayPort=4700+Math.floor(Math.random()*150);
const tenantAPort=gatewayPort+200;
const tenantBPort=gatewayPort+201;
const base=`http://127.0.0.1:${gatewayPort}`;
const password="Master-Test-2026";
const hashPassword=(value)=>{const salt=randomBytes(16).toString("hex");return `${salt}:${scryptSync(value,salt,64).toString("hex")}`;};
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

const companyA={id:"tenant_alpha",slug:"alpha",code:"alpha",name:"Empresa Alpha",active:true,port:tenantAPort,dataDir:path.join(temp,"tenants","alpha","data"),branding:{primaryColor:"#171717",accentColor:"#FF7A00",sidebarColor:"#101010"}};
const companyB={id:"tenant_beta",slug:"beta",code:"beta",name:"Empresa Beta",active:true,port:tenantBPort,dataDir:path.join(temp,"tenants","beta","data"),branding:{primaryColor:"#1a1a1a",accentColor:"#00a3ff",sidebarColor:"#101010"}};
await mkdir(path.join(temp,"gateway"),{recursive:true});
await writeFile(path.join(temp,"gateway","companies.json"),JSON.stringify({version:23,masterPasswordHash:hashPassword(password),companies:[companyA,companyB]}));
for(const [company,sku] of [[companyA,"ALPHA-ONLY"],[companyB,"BETA-ONLY"]]){
  await mkdir(company.dataDir,{recursive:true});
  const data=createInitialData();data.settings.branding.systemName=company.name;data.products=[{id:`product_${company.slug}`,sku,name:`Producto ${company.name}`,description:"",available:5,reserved:0,minStock:1,price:100,active:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}];
  await writeFile(path.join(company.dataDir,"whatsbot-crm.json"),JSON.stringify(data));
}

const child=spawn(process.execPath,[path.join(root,"gateway","gateway.mjs")],{cwd:root,env:{...process.env,PORT:String(gatewayPort),GATEWAY_HOST:"127.0.0.1",CRM_STORAGE_DIR:temp,WHATSAPP_MOCK:"1",NO_OPEN:"1"},stdio:["ignore","pipe","pipe"]});
let output="";child.stdout.on("data",chunk=>output+=chunk);child.stderr.on("data",chunk=>output+=chunk);
const jar=new Map();
function absorbCookies(response){for(const value of response.headers.getSetCookie?.()||[]){const pair=value.split(";",1)[0];const index=pair.indexOf("=");const name=pair.slice(0,index),content=pair.slice(index+1);if(!content)jar.delete(name);else jar.set(name,content);}}
const cookieHeader=()=>[...jar].map(([name,value])=>`${name}=${value}`).join("; ");
async function request(url,{method="GET",body,cookies=true,redirect="follow",headers={}}={}){const response=await fetch(`${base}${url}`,{method,redirect,headers:{...(body!==undefined?{"content-type":"application/json"}:{}),...(cookies&&jar.size?{cookie:cookieHeader()}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});absorbCookies(response);const payload=await response.json().catch(()=>({}));return {response,payload};}
async function wait(){const until=Date.now()+25_000;while(Date.now()<until){try{const {response}=await request("/api/health",{cookies:false});if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,150));}throw new Error(`Gateway no inició.\n${output}`);}

try{
  await wait();
  let result=await request("/api/gateway/master/login",{method:"POST",body:{password}});assert(result.response.ok,"No se pudo iniciar la sesión maestra.");
  result=await request("/api/gateway/master/select-company",{method:"POST",body:{slug:"alpha"}});assert(result.response.ok,"No se pudo seleccionar Alpha.");
  result=await request("/api/state");assert(result.response.ok&&result.payload.currentUser?.isMaster===true,"El acceso maestro interno no fue reconocido por Alpha.");
  assert(result.payload.products.some(product=>product.sku==="ALPHA-ONLY")&&!result.payload.products.some(product=>product.sku==="BETA-ONLY"),"Alpha recibió datos pertenecientes a Beta.");

  result=await request("/api/gateway/master/select-company",{method:"POST",body:{slug:"beta"}});assert(result.response.ok,"No se pudo seleccionar Beta.");
  result=await request("/api/state");assert(result.response.ok&&result.payload.currentUser?.isMaster===true,"El acceso maestro interno no fue reconocido por Beta.");
  assert(result.payload.products.some(product=>product.sku==="BETA-ONLY")&&!result.payload.products.some(product=>product.sku==="ALPHA-ONLY"),"Beta recibió datos pertenecientes a Alpha.");

  const spoof=await request("/api/state",{cookies:false,redirect:"manual",headers:{cookie:"crm_master_tenant=alpha","x-crm-master-secret":"falso","x-crm-master-company":"alpha"}});assert(spoof.response.status===302,"El Gateway aceptó un intento de acceso maestro sin sesión.");
  const direct=await fetch(`http://127.0.0.1:${tenantAPort}/api/state`,{headers:{"x-crm-master-secret":"falso","x-crm-master-company":"alpha"}});assert(direct.status===401,"La instancia interna aceptó una credencial maestra falsa.");
  console.log("OK · selector maestro y aislamiento estricto entre empresas verificados.");
}finally{
  child.kill("SIGTERM");
  await new Promise(resolve=>{child.once("exit",resolve);setTimeout(resolve,4000).unref();});
  await rm(temp,{recursive:true,force:true});
}
