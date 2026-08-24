import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { createInitialData, timestamp } from "../lib/domain.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const appDirectory=path.resolve(here,"..");
const dataDirectory=await mkdtemp(path.join(tmpdir(),"crm-feature-smoke-"));
const port=4300+Math.floor(Math.random()*400);
const base=`http://127.0.0.1:${port}`;
const password="TestPass-2026";
const hashPassword=(value)=>{const salt=randomBytes(16).toString("hex");return `${salt}:${scryptSync(value,salt,64).toString("hex")}`;};
const data=createInitialData();
data.users=[{id:"user_admin_test",username:"admin",name:"Administrador de prueba",role:"admin",branchId:null,passwordHash:hashPassword(password),active:true,clientDailyLimit:100,permissions:{},createdAt:timestamp(),updatedAt:timestamp()}];
await writeFile(path.join(dataDirectory,"whatsbot-crm.json"),JSON.stringify(data));

const child=spawn(process.execPath,[path.join(appDirectory,"server.mjs")],{
  cwd:appDirectory,
  env:{...process.env,PORT:String(port),WHATSBOT_HOST:"127.0.0.1",WHATSAPP_MOCK:"1",NO_OPEN:"1",WHATSBOT_DATA_DIR:dataDirectory,CRM_TENANT_SLUG:"main",CRM_PUBLIC_BASE_URL:base},
  stdio:["ignore","pipe","pipe"],
});
let serverOutput="";child.stdout.on("data",(chunk)=>serverOutput+=chunk);child.stderr.on("data",(chunk)=>serverOutput+=chunk);

const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const waitForServer=async()=>{const deadline=Date.now()+25_000;while(Date.now()<deadline){try{const response=await fetch(`${base}/api/health`);if(response.ok)return;}catch{}await new Promise((resolve)=>setTimeout(resolve,150));}throw new Error(`El servidor de prueba no inició.\n${serverOutput}`);};
let cookie="";
async function api(url,{method="GET",body,authenticated=true}={}){
  const headers={};if(body!==undefined)headers["content-type"]="application/json";if(authenticated&&cookie)headers.cookie=cookie;
  const response=await fetch(`${base}${url}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`${method} ${url}: ${payload.error||response.status}`);return payload;
}

try{
  await waitForServer();
  const loginResponse=await fetch(`${base}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:"admin",password})});
  assert(loginResponse.ok,"No se pudo iniciar sesión como administrador en la prueba.");
  cookie=String(loginResponse.headers.get("set-cookie")||"").split(";")[0];
  const adminCookie=cookie;
  let state=await api("/api/state");
  const primaryBranch=state.branches.find((branch)=>branch.isLocal)||state.branches[0];
  const primaryLine=state.whatsappLines.find((line)=>line.branchId===primaryBranch.id);
  assert(primaryLine,"No se creó la conexión principal de WhatsApp.");

  state=await api("/api/branches",{method:"POST",body:{name:"Sucursal Norte",code:"NORTE",city:"Asunción"}});
  const secondBranch=state.branches.find((branch)=>branch.code==="NORTE");
  const secondLine=state.whatsappLines.find((line)=>line.branchId===secondBranch.id);
  assert(secondBranch&&secondLine,"No se creó la segunda sucursal con su conexión.");

  state=await api("/api/users",{method:"POST",body:{username:"agente.multilinea",name:"Agente Multilínea",password:"AgentPass-2026",role:"agent",branchId:primaryBranch.id,clientDailyLimit:50,whatsappLineIds:[primaryLine.id,secondLine.id]}});
  const agent=state.users.find((user)=>user.username==="agente.multilinea");
  assert(agent,"No se creó el agente.");
  assert(agent.whatsappLineIds.includes(primaryLine.id)&&agent.whatsappLineIds.includes(secondLine.id),"El agente no conservó sus dos conexiones asignadas.");
  assert(state.whatsappLines.find((line)=>line.id===secondLine.id).allowedUserIds.includes(agent.id),"La asignación inversa de la conexión no quedó sincronizada.");

  state=await api(`/api/users/${encodeURIComponent(agent.id)}`,{method:"PUT",body:{name:"Agente Multilínea Editado",whatsappLineIds:[primaryLine.id,secondLine.id],active:true}});
  assert(state.users.find((user)=>user.id===agent.id).whatsappLineIds.length===2,"La edición del usuario perdió conexiones asignadas.");

  state=await api("/api/mock/incoming",{method:"POST",body:{phone:"595982345678",name:"Contacto entrante multilínea",text:"Hola, necesito información",lineId:secondLine.id}});
  const automaticallyRouted=state.deals.find((deal)=>deal.phone?.includes("595982345678")||deal.jid?.includes("595982345678"));
  assert(automaticallyRouted?.ownerUserId===agent.id,"El contacto entrante no fue asignado automáticamente al agente de la conexión.");

  const clientState=await api("/api/clients",{method:"POST",body:{name:"Cliente de otra sucursal",phone:"+595981234567",branchId:secondBranch.id}});
  const crossBranchDeal=clientState.deals.find((deal)=>deal.phone?.includes("595981234567")||deal.jid?.includes("595981234567"));
  assert(crossBranchDeal,"No se creó la negociación de prueba en la segunda sucursal.");
  await api(`/api/deals/${encodeURIComponent(crossBranchDeal.id)}/assign`,{method:"POST",body:{userId:agent.id}});
  const agentLogin=await fetch(`${base}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:"agente.multilinea",password:"AgentPass-2026"})});
  assert(agentLogin.ok,"El agente de prueba no pudo iniciar sesión.");
  cookie=String(agentLogin.headers.get("set-cookie")||"").split(";")[0];
  const agentState=await api("/api/state");
  assert(agentState.deals.some((deal)=>deal.id===crossBranchDeal.id),"El agente asignado a la conexión no puede ver la conversación de otra sucursal inicial.");
  const agentProfile=await api(`/api/clients/${encodeURIComponent(crossBranchDeal.clientId)}/profile`);
  assert(agentProfile.negotiations.some((deal)=>deal.id===crossBranchDeal.id),"El agente no puede abrir la ficha del contacto asignado por conexión.");
  cookie=adminCookie;

  const created=await api("/api/forms",{method:"POST",body:{name:"Formulario integral de prueba",description:"Encuesta y registro independiente",formType:"custom",branchId:primaryBranch.id,lineId:secondLine.id,publicAccess:true,collectIdentity:"optional",theme:{primaryColor:"#171717",accentColor:"#FF7A00"},deliveryMode:"web_link",trigger:{type:"manual"},questions:[{id:"q1",text:"¿Qué probabilidad hay de que nos recomiendes?",type:"nps",required:true},{id:"q2",text:"¿Qué servicios te interesan?",type:"checkbox",required:true,options:[{id:"o1",label:"Ventas",value:"ventas"},{id:"o2",label:"Soporte",value:"soporte"}]},{id:"q3",text:"Tu teléfono",type:"phone",required:false},{id:"q4",text:"Acepto el uso de mis respuestas",type:"consent",required:true}]}});
  assert(created.form?.id,"La API no confirmó la creación del formulario.");
  assert(created.form.formType==="custom","No se guardó el tipo de formulario.");
  assert(created.form.lineId===secondLine.id,"El formulario no aceptó una conexión con otra sucursal inicial.");
  assert(created.form.sharePath?.includes("/forms/"),"El formulario no generó un enlace público.");

  const definition=await api(`/api/public/form-definitions/${encodeURIComponent(created.form.shareToken)}`,{authenticated:false});
  assert(definition.form.name===created.form.name,"El enlace público no expone el formulario correcto.");
  const started=await api(`/api/public/form-definitions/${encodeURIComponent(created.form.shareToken)}/start`,{method:"POST",authenticated:false,body:{name:"Persona de prueba",email:"prueba@example.com"}});
  assert(started.token&&started.payload?.question?.type==="nps","No se inició una sesión pública del formulario.");
  let sessionToken=started.token;
  let answered=await api(`/api/public/forms/${encodeURIComponent(sessionToken)}/answer`,{method:"POST",authenticated:false,body:{value:9}});
  assert(answered.question?.type==="checkbox","No avanzó al campo de selección múltiple.");
  answered=await api(`/api/public/forms/${encodeURIComponent(sessionToken)}/answer`,{method:"POST",authenticated:false,body:{value:["ventas","soporte"]}});
  assert(answered.question?.type==="phone","No guardó la selección múltiple.");
  answered=await api(`/api/public/forms/${encodeURIComponent(sessionToken)}/answer`,{method:"POST",authenticated:false,body:{value:""}});
  assert(answered.question?.type==="consent","El campo opcional no pudo omitirse.");
  answered=await api(`/api/public/forms/${encodeURIComponent(sessionToken)}/answer`,{method:"POST",authenticated:false,body:{value:"si"}});
  assert(answered.session?.status==="completed","El formulario público no terminó correctamente.");

  const report=await api(`/api/forms/${encodeURIComponent(created.form.id)}/report`);
  assert(report.summary.completed===1,"El reporte no registró la respuesta completada.");
  assert(report.questions.find((question)=>question.type==="nps")?.average===9,"El reporte NPS no calculó el resultado.");
  const publicPage=await fetch(`${base}${created.form.sharePath.replace(/^\/t\/main/,"")}`);
  const publicHtml=await publicPage.text();
  assert(publicPage.ok&&publicHtml.includes('../form-public.js'),"La página pública del formulario no está disponible.");
  assert(new URL('../form-public.js',`${base}${created.form.sharePath}`).pathname==='/t/main/form-public.js',"Los recursos del formulario no resuelven dentro de la ruta de empresa.");

  console.log("OK · líneas globales multiagente, asignación desde usuarios y formularios públicos verificados.");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve)=>{child.once("exit",resolve);setTimeout(resolve,3000).unref();});
  await rm(dataDirectory,{recursive:true,force:true});
}
