import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInitialData, makeId, timestamp } from '../app/lib/domain.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const storage=process.env.CRM_STORAGE_DIR?path.resolve(process.env.CRM_STORAGE_DIR):path.join(root,'storage');
const configPath=path.join(storage,'gateway','companies.json');
const appPath=path.join(root,'app','server.mjs');
const publicDir=path.join(here,'public');
const gatewayPort=Number(process.env.PORT||3030);
const gatewayHost=process.env.GATEWAY_HOST||'0.0.0.0';
const children=new Map();
const masterSessions=new Map();
const internalGatewaySecret=process.env.CRM_GATEWAY_SECRET||randomBytes(48).toString('hex');

const json=(res,status,body,headers={})=>{const data=Buffer.from(JSON.stringify(body));res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':data.length,'cache-control':'no-store',...headers});res.end(data)};
const html=(res,status,body)=>{const data=Buffer.from(body);res.writeHead(status,{'content-type':'text/html; charset=utf-8','content-length':data.length,'cache-control':'no-store'});res.end(data)};
const clean=(v,n=200)=>String(v??'').trim().slice(0,n);
const slugify=(v)=>clean(v,120).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const hashPassword=(password,salt=randomBytes(16).toString('hex'))=>`${salt}:${scryptSync(password,salt,64).toString('hex')}`;
const verifyPassword=(password,stored)=>{try{const [salt,digest]=String(stored||'').split(':');const e=Buffer.from(digest,'hex');const a=scryptSync(String(password||''),salt,64);return e.length===a.length&&timingSafeEqual(e,a)}catch{return false}};
const parseCookies=(req)=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [decodeURIComponent(i<0?x:x.slice(0,i)),decodeURIComponent(i<0?'':x.slice(i+1))]}));
const cookie=(name,value,maxAge=43200)=>`${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
const readBody=async(req,limit=1024*1024)=>{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error('Solicitud demasiado grande.');chunks.push(chunk)}return Buffer.concat(chunks)};
const bodyJson=async(req)=>{const b=await readBody(req);if(!b.length)return {};return JSON.parse(b.toString('utf8'))};

async function loadConfig(){
  await mkdir(path.dirname(configPath),{recursive:true});
  if(!existsSync(configPath)){
    const cfg={version:23,masterPasswordHash:'',companies:[{id:'main',slug:'main',code:'principal',name:'Empresa Principal',active:true,port:4101,dataDir:'storage/tenants/main/data',branding:{primaryColor:'#171717',accentColor:'#FF7A00',sidebarColor:'#101010'}}]};
    await writeFile(configPath,JSON.stringify(cfg,null,2));return cfg;
  }
  const cfg=JSON.parse(await readFile(configPath,'utf8'));
  cfg.companies=Array.isArray(cfg.companies)?cfg.companies:[];
  return cfg;
}
async function saveConfig(cfg){await writeFile(configPath,JSON.stringify(cfg,null,2),{mode:0o600})}
function companyFromCode(cfg,value){const q=clean(value,120).toLowerCase();return cfg.companies.find(c=>c.active!==false&&[c.code,c.slug,c.id].some(x=>String(x||'').toLowerCase()===q))||null}
function companyFromSlug(cfg,value){return cfg.companies.find(c=>c.active!==false&&c.slug===value)||null}
function absDataDir(c){return path.resolve(root,c.dataDir||`storage/tenants/${c.slug}/data`)}

async function waitHealth(port,ms=20000){const until=Date.now()+ms;let err;while(Date.now()<until){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1200)});if(r.ok)return true}catch(e){err=e}await new Promise(r=>setTimeout(r,250))}throw err||new Error('La instancia no respondió a tiempo.')}
async function ensureTenant(c){
  const existing=children.get(c.slug);if(existing?.proc&&!existing.proc.killed)return existing;
  await mkdir(absDataDir(c),{recursive:true});
  const proc=spawn(process.execPath,[appPath],{cwd:path.join(root,'app'),env:{...process.env,PORT:String(c.port),WHATSAPP_MOCK:process.env.WHATSAPP_MOCK||'0',NO_OPEN:'1',WHATSBOT_HOST:'127.0.0.1',WHATSBOT_DATA_DIR:absDataDir(c),CRM_TENANT_SLUG:c.slug,CRM_PUBLIC_BASE_URL:process.env.CRM_PUBLIC_BASE_URL||'',CRM_GATEWAY_SECRET:internalGatewaySecret},stdio:['ignore','inherit','inherit']});
  const state={proc,port:c.port};children.set(c.slug,state);proc.once('exit',()=>children.delete(c.slug));await waitHealth(c.port);return state;
}
function forwardCookieHeader(req){return req.headers.cookie||''}
async function proxy(req,res,c,overridePath=null,{master=false}={}){
  try{
    await ensureTenant(c);
    const targetPath=overridePath||req.url;
    const headers={...req.headers,host:`127.0.0.1:${c.port}`,'x-forwarded-host':req.headers.host||'','x-forwarded-proto':String(req.headers['x-forwarded-proto']||'http'),'x-crm-tenant':c.slug};
    delete headers['x-crm-master-secret'];delete headers['x-crm-master-company'];
    if(master){headers['x-crm-master-secret']=internalGatewaySecret;headers['x-crm-master-company']=c.slug;}
    delete headers['content-length'];
    const opts={hostname:'127.0.0.1',port:c.port,path:targetPath,method:req.method,headers};
    const upstream=http.request(opts,u=>{
      const out={...u.headers};
      delete out['content-security-policy'];
      if(String(targetPath).startsWith('/api/auth/logout')){
        const arr=[];for(const x of Array.isArray(out['set-cookie'])?out['set-cookie']:(out['set-cookie']?[out['set-cookie']]:[]))arr.push(x);arr.push(cookie('crm_tenant','',0));out['set-cookie']=arr;
      }
      res.writeHead(u.statusCode||502,out);u.pipe(res);
    });
    upstream.on('error',e=>json(res,502,{error:`No se pudo conectar con ${c.name}: ${e.message}`}));
    req.pipe(upstream);
  }catch(e){json(res,503,{error:`La empresa no pudo iniciar: ${e.message}`})}
}
async function loginTenant(req,res,c,username,password){
  await ensureTenant(c);
  const r=await fetch(`http://127.0.0.1:${c.port}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});
  const payload=await r.json().catch(()=>({}));
  if(!r.ok)return json(res,r.status,payload);
  let upstreamCookie='';
  const set=r.headers.getSetCookie?.()||[];for(const x of set){const m=x.match(/whatsbot_session=([^;]+)/);if(m){upstreamCookie=decodeURIComponent(m[1]);break}}
  if(!upstreamCookie){const m=String(r.headers.get('set-cookie')||'').match(/whatsbot_session=([^;]+)/);if(m)upstreamCookie=decodeURIComponent(m[1])}
  if(!upstreamCookie)return json(res,502,{error:'La empresa autenticó, pero no devolvió una sesión válida.'});
  res.setHeader('Set-Cookie',[cookie('crm_tenant',c.slug),cookie('whatsbot_session',upstreamCookie)]);
  json(res,200,{ok:true,company:{slug:c.slug,name:c.name,branding:c.branding||{}},user:payload.user});
}
function isMaster(req){const token=parseCookies(req).crm_master;const s=masterSessions.get(token);if(!s||s<Date.now()){if(token)masterSessions.delete(token);return false}return true}
function masterCookie(res){const token=randomBytes(32).toString('hex');masterSessions.set(token,Date.now()+8*60*60*1000);res.setHeader('Set-Cookie',cookie('crm_master',token,28800))}
async function initTenantData(c,input){
  const dir=absDataDir(c);await mkdir(dir,{recursive:true});const db=path.join(dir,'whatsbot-crm.json');if(existsSync(db))return;
  const d=createInitialData();d.version=23;d.settings.branding={...d.settings.branding,systemName:clean(input.name,180)||c.name,shortName:clean(input.name,40)||c.name,primaryColor:input.primaryColor||'#171717',accentColor:input.accentColor||'#FF7A00',sidebarColor:input.sidebarColor||'#101010'};
  d.users=[{id:makeId('user'),username:clean(input.adminUsername||'admin',80).toLowerCase(),name:clean(input.adminName||'Administrador',120),role:'admin',passwordHash:hashPassword(String(input.adminPassword||'')),active:true,clientDailyLimit:100,permissions:{ownReports:true,branchReports:true,teamReports:true,globalReports:true,auditReports:true},createdAt:timestamp(),updatedAt:timestamp()}];
  await writeFile(db,JSON.stringify(d),{mode:0o600});
}
async function publicProbe(req,res,candidates){
  for(const c of candidates){try{await ensureTenant(c);const r=await fetch(`http://127.0.0.1:${c.port}${req.url}`,{redirect:'manual',signal:AbortSignal.timeout(2500)});if(r.status!==404&&r.status!==401){const b=Buffer.from(await r.arrayBuffer());const h={};r.headers.forEach((v,k)=>h[k]=v);res.writeHead(r.status,h);res.end(b);return true}}catch{}}
  return false;
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);const p=url.pathname;const cfg=await loadConfig();
    if(p==='/login'||p==='/login.html'){return html(res,200,await readFile(path.join(publicDir,'login.html'),'utf8'))}
    if(p==='/master'||p==='/master/'){return html(res,200,await readFile(path.join(publicDir,'master.html'),'utf8'))}
    if(p==='/api/gateway/company'&&req.method==='GET'){const code=url.searchParams.get('code');const c=companyFromCode(cfg,code);return c?json(res,200,{company:{name:c.name,slug:c.slug,branding:c.branding||{}}}):json(res,404,{error:'Empresa no encontrada.'})}
    if(p==='/api/gateway/login'&&req.method==='POST'){const b=await bodyJson(req);const c=companyFromCode(cfg,b.company);if(!c)return json(res,404,{error:'Empresa no encontrada o inactiva.'});return loginTenant(req,res,c,b.username,b.password)}
    if(p==='/api/gateway/logout'&&req.method==='POST'){res.setHeader('Set-Cookie',[cookie('crm_tenant','',0),cookie('whatsbot_session','',0)]);return json(res,200,{ok:true})}
    if(p==='/api/auth/logout'&&req.method==='POST'&&isMaster(req)){const token=parseCookies(req).crm_master;if(token)masterSessions.delete(token);res.setHeader('Set-Cookie',[cookie('crm_master','',0),cookie('crm_master_tenant','',0),cookie('crm_tenant','',0),cookie('whatsbot_session','',0)]);return json(res,200,{authenticated:false})}
    if(p==='/api/gateway/master/status'){const cookies=parseCookies(req);const selected=isMaster(req)&&cookies.crm_master_tenant?companyFromSlug(cfg,cookies.crm_master_tenant):null;return json(res,200,{configured:Boolean(cfg.masterPasswordHash),authenticated:isMaster(req),selectedCompany:selected?{slug:selected.slug,name:selected.name}:null})}
    if(p==='/api/gateway/master/login'&&req.method==='POST'){if(!cfg.masterPasswordHash)return json(res,409,{error:'Primero configurá la contraseña maestra desde el terminal del VPS.'});const b=await bodyJson(req);if(!verifyPassword(b.password,cfg.masterPasswordHash))return json(res,401,{error:'Contraseña maestra incorrecta.'});masterCookie(res);return json(res,200,{ok:true})}
    if(p.startsWith('/api/gateway/master/')){
      if(!isMaster(req))return json(res,401,{error:'Iniciá sesión como Administrador Maestro.'});
      if(p==='/api/gateway/master/context'&&req.method==='GET'){const selected=companyFromSlug(cfg,parseCookies(req).crm_master_tenant);return json(res,200,{master:true,selectedCompany:selected?{slug:selected.slug,name:selected.name,branding:selected.branding||{}}:null,companies:cfg.companies.filter(c=>c.active!==false).map(c=>({slug:c.slug,code:c.code,name:c.name,branding:c.branding||{},running:children.has(c.slug)}))})}
      if(p==='/api/gateway/master/select-company'&&req.method==='POST'){const b=await bodyJson(req);const c=companyFromSlug(cfg,clean(b.slug,120));if(!c)return json(res,404,{error:'Empresa no encontrada o inactiva.'});res.setHeader('Set-Cookie',[cookie('crm_master_tenant',c.slug,28800),cookie('crm_tenant','',0),cookie('whatsbot_session','',0)]);return json(res,200,{ok:true,company:{slug:c.slug,name:c.name,branding:c.branding||{}}})}
      if(p==='/api/gateway/master/logout'&&req.method==='POST'){const token=parseCookies(req).crm_master;if(token)masterSessions.delete(token);res.setHeader('Set-Cookie',[cookie('crm_master','',0),cookie('crm_master_tenant','',0),cookie('crm_tenant','',0),cookie('whatsbot_session','',0)]);return json(res,200,{ok:true})}
      if(p==='/api/gateway/master/companies'&&req.method==='GET')return json(res,200,{companies:cfg.companies.map(c=>({...c,running:children.has(c.slug)}))});
      if(p==='/api/gateway/master/companies'&&req.method==='POST'){
        const b=await bodyJson(req);const name=clean(b.name,180),code=slugify(b.code||b.name),slug=slugify(b.slug||b.code||b.name);if(!name||!code||!slug)return json(res,400,{error:'Ingresá empresa y código.'});if(cfg.companies.some(c=>c.code===code||c.slug===slug))return json(res,409,{error:'Ese código de empresa ya existe.'});if(String(b.adminPassword||'').length<8)return json(res,400,{error:'La contraseña inicial debe tener al menos 8 caracteres.'});const used=new Set(cfg.companies.map(c=>Number(c.port)));let port=4101;while(used.has(port))port++;
        const c={id:`tenant_${slug}`,slug,code,name,active:true,port,dataDir:`storage/tenants/${slug}/data`,branding:{primaryColor:b.primaryColor||'#171717',accentColor:b.accentColor||'#FF7A00',sidebarColor:b.sidebarColor||'#101010'},createdAt:new Date().toISOString()};cfg.companies.push(c);await initTenantData(c,b);await saveConfig(cfg);return json(res,201,{company:c});
      }
      const m=p.match(/^\/api\/gateway\/master\/companies\/([^/]+)$/);if(m&&req.method==='PUT'){
        const c=cfg.companies.find(x=>x.slug===m[1]);if(!c)return json(res,404,{error:'Empresa no encontrada.'});const b=await bodyJson(req);if(b.name)c.name=clean(b.name,180);if(b.code)c.code=slugify(b.code);if(b.active!==undefined)c.active=b.active!==false;if(b.primaryColor)c.branding.primaryColor=clean(b.primaryColor,20);if(b.accentColor)c.branding.accentColor=clean(b.accentColor,20);await saveConfig(cfg);const db=path.join(absDataDir(c),'whatsbot-crm.json');try{const d=JSON.parse(await readFile(db,'utf8'));d.settings.branding={...d.settings.branding,systemName:c.name,primaryColor:c.branding.primaryColor,accentColor:c.branding.accentColor,sidebarColor:c.branding.sidebarColor||d.settings.branding.sidebarColor};await writeFile(db,JSON.stringify(d),{mode:0o600})}catch{}return json(res,200,{company:c});
      }
      const r=p.match(/^\/api\/gateway\/master\/companies\/([^/]+)\/restart$/);if(r&&req.method==='POST'){const c=cfg.companies.find(x=>x.slug===r[1]);if(!c)return json(res,404,{error:'Empresa no encontrada.'});const child=children.get(c.slug);if(child?.proc&&!child.proc.killed)child.proc.kill('SIGTERM');children.delete(c.slug);await ensureTenant(c);return json(res,200,{ok:true})}
      return json(res,404,{error:'Acción maestra no encontrada.'});
    }
    const tenantPath=p.match(/^\/t\/([^/]+)(\/.*)$/);if(tenantPath){const c=companyFromSlug(cfg,tenantPath[1]);if(!c)return json(res,404,{error:'Empresa no encontrada.'});return proxy(req,res,c,tenantPath[2]+url.search)}
    const cookies=parseCookies(req);const masterCompany=isMaster(req)&&cookies.crm_master_tenant?companyFromSlug(cfg,cookies.crm_master_tenant):null;
    if(masterCompany)return proxy(req,res,masterCompany,null,{master:true});
    const c=cookies.crm_tenant?companyFromSlug(cfg,cookies.crm_tenant):null;
    if(c)return proxy(req,res,c);
    if(['/portal/','/api/public/','/api/v22/public/'].some(prefix=>p.startsWith(prefix))){if(await publicProbe(req,res,cfg.companies.filter(x=>x.active!==false)))return}
    if(p==='/api/health')return json(res,200,{ok:true,gateway:true,companies:cfg.companies.filter(x=>x.active!==false).length});
    if(p==='/favicon.ico')return res.writeHead(204).end();
    res.writeHead(302,{location:'/login'});res.end();
  }catch(e){json(res,500,{error:e.message||'Error interno del Gateway.'})}
});

server.listen(gatewayPort,gatewayHost,()=>console.log(`\nCRM V23 Gateway listo en http://${gatewayHost}:${gatewayPort}\nEmpresas aisladas: proceso bajo demanda\n`));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{for(const x of children.values())x.proc?.kill('SIGTERM');server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref()});
