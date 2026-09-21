import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  createInitialData,
  recordIncoming,
  recordBotOutgoing,
  recordHumanOutgoing,
  STAGES,
  timestamp,
} from "../lib/domain.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(here, "..");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// Contrato principal: BOT nunca pasa a Contactado; humano sí.
{
  const data = createInitialData();
  const branchId = data.branches?.[0]?.id || "branch_principal";
  const { deal } = recordIncoming(data, {
    jid: "595981340001@s.whatsapp.net",
    name: "Cliente Bot",
    text: "Hola",
    messageId: "incoming_v2634",
    branchId,
  });
  assert(deal.stage === STAGES.NEW, "El contacto nuevo no inició en Nuevos.");
  recordBotOutgoing(data, { deal, text: "Respuesta automática", messageId: "bot_v2634" });
  assert(deal.stage === STAGES.NEW, "Una respuesta del bot movió indebidamente la negociación a Contactado.");
  recordHumanOutgoing(data, {
    jid: deal.jid,
    name: deal.name,
    text: "Retorno humano",
    messageId: "human_v2634",
    userId: "agent_v2634",
    userName: "Agente V26.34",
    branchId,
  });
  assert(deal.stage === STAGES.CONTACTED, "La respuesta humana no movió la negociación a Contactado.");
}

const sourceServer = await readFile(path.join(appDirectory, "server-core.mjs"), "utf8");
const sourceApp = await readFile(path.join(appDirectory, "public", "app.js"), "utf8");
const sourceIndex = await readFile(path.join(appDirectory, "public", "index.html"), "utf8");
const sourceCss = await readFile(path.join(appDirectory, "public", "styles.css"), "utf8");
const perf = await readFile(path.join(appDirectory, "lib", "v26-14-performance-patches.mjs"), "utf8");

assert(sourceServer.includes('app.get("/api/deals/:id/audit-history"'), "Falta historial por negociación para Admin.");
assert(sourceServer.includes('origin: "transfer-intro"'), "Las presentaciones automáticas de transferencia no están marcadas como bot.");
assert(!sourceServer.includes('recordHumanOutgoing(data, { jid: targetDeal.jid, text: intro'), "Una presentación automática sigue registrándose como humana.");
assert(sourceServer.includes("Max-Age=604800"), "La cookie de sesión no fue extendida a 7 días.");
assert(sourceServer.includes("7 * 24 * 60 * 60 * 1000"), "La sesión del servidor no fue extendida.");
assert(sourceApp.includes("let dealSearchTerm ="), "Falta estado interno de búsqueda.");
assert(perf.includes('typeof dealSearchTerm!=="undefined"?dealSearchTerm'), "El pipeline optimizado sigue leyendo el filtro restaurado del navegador.");
assert(sourceIndex.includes('id="deal-search" autocomplete="off"'), "El buscador permite autocompletado/restauración no deseada.");
assert(sourceCss.includes("user-select: text !important"), "Los mensajes no quedaron seleccionables.");
assert(sourceIndex.includes('id="admin-deal-history-section"'), "Falta historial visual en la ficha.");
assert(sourceIndex.includes('id="transfer-pending-banner"'), "Falta aviso visual de transferencia.");

const dataDirectory = await mkdtemp(path.join(tmpdir(), "crm-v2634-"));
const port = 6340 + Math.floor(Math.random() * 120);
const base = `http://127.0.0.1:${port}`;
const adminPassword = "AdminTest-2634";
const agentPassword = "AgentTest-2634";
const hashPassword = (value) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`;
};
const now = timestamp();
const seed = createInitialData();
const branchId = seed.branches?.[0]?.id || "branch_principal";
seed.users = [
  { id:"admin_2634", username:"admin", name:"Admin V26.34", role:"admin", branchId:null, passwordHash:hashPassword(adminPassword), active:true, clientDailyLimit:100, permissions:{}, createdAt:now, updatedAt:now },
  { id:"agent_2634", username:"agente", name:"Agente Destino", role:"agent", branchId, passwordHash:hashPassword(agentPassword), active:true, clientDailyLimit:100, permissions:{}, attendance:{status:"active",updatedAt:now}, createdAt:now, updatedAt:now },
];
await writeFile(path.join(dataDirectory, "whatsbot-crm.json"), JSON.stringify(seed));

const child = spawn(process.execPath, [path.join(appDirectory, "server.mjs")], {
  cwd: appDirectory,
  env: { ...process.env, PORT:String(port), WHATSBOT_HOST:"127.0.0.1", WHATSAPP_MOCK:"1", NO_OPEN:"1", WHATSBOT_DATA_DIR:dataDirectory, CRM_TENANT_SLUG:"v2634", CRM_PUBLIC_BASE_URL:base },
  stdio:["ignore","pipe","pipe"],
});
let output="";
child.stdout.on("data",d=>output+=d);
child.stderr.on("data",d=>output+=d);

let cookie="";
const waitForServer=async()=>{
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    try{const r=await fetch(`${base}/api/health`);if(r.ok)return;}catch{}
    await new Promise(r=>setTimeout(r,150));
  }
  throw new Error("El servidor no inició.\n"+output);
};
async function login(username,password){
  const res=await fetch(`${base}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username,password})});
  assert(res.ok,`No se pudo iniciar sesión con ${username}.`);
  cookie=String(res.headers.get("set-cookie")||"").split(";")[0];
  return res;
}
async function api(url,{method="GET",body}={}){
  const headers=cookie?{cookie}:{};
  if(body!==undefined)headers["content-type"]="application/json";
  const res=await fetch(`${base}${url}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(`${method} ${url}: ${payload.error||res.status}`);
  return payload;
}
async function raw(url,{method="GET",body}={}){
  const headers=cookie?{cookie}:{};
  if(body!==undefined)headers["content-type"]="application/json";
  const res=await fetch(`${base}${url}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {res,payload:await res.json().catch(()=>({}))};
}

try{
  await waitForServer();
  const loginResponse=await login("admin",adminPassword);
  assert(String(loginResponse.headers.get("set-cookie")||"").includes("Max-Age=604800"), "Login no entrega cookie de 7 días.");

  let state=await api("/api/clients",{method:"POST",body:{name:"Cliente Transferencia",phone:"+595981340002",branchId}});
  let deal=state.deals.find(d=>d.name==="Cliente Transferencia");
  assert(deal,"No se creó la negociación de prueba.");

  state=await api(`/api/deals/${encodeURIComponent(deal.id)}/transfer`,{method:"POST",body:{userId:"agent_2634"}});
  deal=state.deals.find(d=>d.id===deal.id);
  assert(deal.transferPendingForUserId==="agent_2634","La transferencia no quedó marcada como pendiente para el agente destino.");
  assert(deal.transferPendingFromUserName==="Admin V26.34","No se guardó quién transfirió la negociación.");

  await login("agente",agentPassword);
  state=await api("/api/state");
  deal=state.deals.find(d=>d.id===deal.id);
  assert(deal?.transferPendingForUserId==="agent_2634","El agente destino no ve el aviso pendiente.");

  state=await api(`/api/deals/${encodeURIComponent(deal.id)}/message`,{method:"POST",body:{text:"Buen día, te doy retorno."}});
  deal=state.deals.find(d=>d.id===deal.id);
  assert(deal.stage===STAGES.CONTACTED,"La respuesta humana del agente no llevó a Contactado.");
  assert(!deal.transferPendingForUserId,"El aviso de transferencia no desapareció después de responder.");

  await login("admin",adminPassword);
  const audit=await api(`/api/deals/${encodeURIComponent(deal.id)}/audit-history`);
  assert(Array.isArray(audit.events),"El historial administrativo no devolvió eventos.");
  assert(audit.events.some(e=>e.action==="transferencia_recibida_respondida"),"El historial no registra que el agente atendió la transferencia.");

  await login("agente",agentPassword);
  const denied=await raw(`/api/deals/${encodeURIComponent(deal.id)}/audit-history`);
  assert(denied.res.status===403,"Un agente pudo consultar el historial administrativo.");

  const servedApp=await (await fetch(`${base}/app.js`)).text();
  assert(servedApp.includes("dealSearchTerm"),"El app.js servido no contiene el filtro estable.");
  assert(servedApp.includes("fetchDealAuditHistory"),"El app.js servido no contiene historial visual.");
  assert(!servedApp.includes('const search=$("#deal-search").value.trim().toLowerCase();'),"El app.js optimizado todavía usa directamente el valor restaurado del buscador.");
  console.log("OK · V26.34 flujo humano, copia de texto, historial admin, transferencias, sesión y filtro estable validados.");
} finally {
  child.kill("SIGTERM");
  await new Promise(resolve=>{child.once("exit",resolve);setTimeout(resolve,3000).unref();});
  await rm(dataDirectory,{recursive:true,force:true});
}
