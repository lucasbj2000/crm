import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialData, timestamp } from '../../app/lib/domain.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const gateway=path.resolve(here,'..');
const root=path.resolve(gateway,'..');
const dir=await mkdtemp(path.join(tmpdir(),'crm-v255-master-'));
const storage=path.join(dir,'storage');
const tenant=path.join(dir,'tenant');
await mkdir(path.join(storage,'gateway'),{recursive:true});await mkdir(tenant,{recursive:true});
const port=6300+Math.floor(Math.random()*200);
const tenantPort=port+300;
const password='Master-V25.5-Test';
const salt=randomBytes(16).toString('hex');
const masterPasswordHash=`${salt}:${scryptSync(password,salt,64).toString('hex')}`;
const company={id:'tenant_alpha',slug:'alpha',code:'alpha',name:'Alpha',active:true,port:tenantPort,dataDir:tenant,branding:{}};
await writeFile(path.join(storage,'gateway','companies.json'),JSON.stringify({version:25,masterPasswordHash,companies:[company]}));
const data=createInitialData();
const admin={id:'user_admin',username:'admin',name:'Admin',role:'admin',branchId:null,passwordHash:'x',active:true,permissions:{},createdAt:timestamp(),updatedAt:timestamp()};
const agent={id:'user_agent',username:'agent',name:'Agente Saliente',role:'agent',branchId:null,passwordHash:'x',active:true,permissions:{},createdAt:timestamp(),updatedAt:timestamp()};
data.users=[admin,agent];
data.deals=[{id:'deal_1',name:'Cliente Uno',ownerUserId:agent.id,stage:'waiting',messages:[{id:'m1',userId:agent.id,text:'Histórico',direction:'out'}]}];
data.clients=[{id:'client_1',name:'Cliente Uno',branchRelationships:[{branchId:'b1',ownerUserId:agent.id}]}];
data.tasks=[{id:'task_1',title:'Seguimiento',assigneeUserId:agent.id}];
await writeFile(path.join(tenant,'whatsbot-crm.json'),JSON.stringify(data));
const child=spawn(process.execPath,[path.join(gateway,'v25-gateway.mjs')],{cwd:root,env:{...process.env,PORT:String(port),GATEWAY_HOST:'127.0.0.1',CRM_STORAGE_DIR:storage,NO_OPEN:'1',WHATSAPP_MOCK:'1'},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
async function wait(){const until=Date.now()+20000;while(Date.now()<until){try{const r=await fetch(`http://127.0.0.1:${port}/api/gateway/master/status`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,120));}throw new Error(`Gateway no inició\n${output}`)}
async function req(url,{method='GET',cookie='',body}={}){const r=await fetch(`http://127.0.0.1:${port}${url}`,{method,headers:{...(cookie?{cookie}:{}),...(body!==undefined?{'content-type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let payload={};try{payload=text?JSON.parse(text):{}}catch{payload=text}return {r,payload,text};}
try{
  await wait();
  const login=await req('/api/gateway/master/login',{method:'POST',body:{password}});assert.equal(login.r.ok,true,'No autenticó Master V25.5');
  const cookie=String(login.r.headers.get('set-cookie')||'').split(';')[0];assert.ok(cookie.includes('crm_master='));
  const master=await req('/master',{cookie});assert.match(master.text,/master-v25-5\.js\?v=25\.5/);assert.match(master.text,/master-v25-5\.css\?v=25\.5/);
  const created=await req('/api/gateway/master/companies/alpha/users',{method:'POST',cookie,body:{name:'Nuevo Agente',username:'nuevo',password:'12345678',role:'agent'}});assert.equal(created.r.status,201);assert.equal(created.payload.user.username,'nuevo');
  const removed=await req('/api/gateway/master/companies/alpha/users/user_agent',{method:'DELETE',cookie,body:{transferToUserId:'user_admin'}});assert.equal(removed.r.ok,true,JSON.stringify(removed.payload));assert.equal(removed.payload.transferredTo.id,'user_admin');
  const saved=JSON.parse(await readFile(path.join(tenant,'whatsbot-crm.json'),'utf8'));
  assert.equal(saved.users.some(x=>x.id==='user_agent'),false,'Usuario eliminado sigue en users');
  assert.equal(saved.deals[0].ownerUserId,'user_admin','Negociación no reasignada');
  assert.equal(saved.clients[0].branchRelationships[0].ownerUserId,'user_admin','Cliente no reasignado');
  assert.equal(saved.tasks[0].assigneeUserId,'user_admin','Tarea no reasignada');
  assert.equal(saved.deals[0].messages[0].userId,'user_agent','Se alteró autoría histórica de mensajes');
  const lastAdmin=await req('/api/gateway/master/companies/alpha/users/user_admin',{method:'DELETE',cookie,body:{transferToUserId:created.payload.user.id}});assert.equal(lastAdmin.r.status,400,'Permitió borrar último administrador');
  console.log('OK · V25.5 Master personal + reasignación segura validada.');
}finally{child.kill('SIGTERM');await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,2500).unref()});await rm(dir,{recursive:true,force:true});}
