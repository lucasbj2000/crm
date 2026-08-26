function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V25.5 Gateway: no se encontró el anclaje ${label}.`);
  if (first !== last) throw new Error(`V25.5 Gateway: el anclaje ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

const helpers = String.raw`
function v255Permissions(role){
  if(role==='admin')return {ownReports:true,branchReports:true,teamReports:true,globalReports:true,auditReports:true};
  if(role==='manager')return {ownReports:true,branchReports:true,teamReports:true,globalReports:false,auditReports:false};
  return {ownReports:true,branchReports:false,teamReports:false,globalReports:false,auditReports:false};
}
async function v255WriteTenantData(company,data){
  data.updatedAt=new Date().toISOString();
  await writeFile(path.join(absDataDir(company),'whatsbot-crm.json'),JSON.stringify(data),{mode:0o600});
}
function v255StopTenant(company){
  const running=children.get(company.slug);
  if(running?.proc&&!running.proc.killed){running.proc.kill('SIGTERM');children.delete(company.slug);}
}
async function v255DeleteTenantCompany(cfg,company,input){
  const expected=String(company.code||company.slug||'').trim().toLowerCase();
  const confirmation=clean(input?.confirmCode,120).toLowerCase();
  if(!confirmation||confirmation!==expected){
    const error=new Error('Escribí el código de la empresa para confirmar la eliminación.');
    error.code='COMPANY_CONFIRM_REQUIRED';
    throw error;
  }
  v255StopTenant(company);
  const dataDir=absDataDir(company);
  const archiveRoot=path.join(storage,'deleted-tenants');
  await mkdir(archiveRoot,{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-')+'-'+Date.now();
  const archiveName=company.slug+'-'+stamp;
  const archivePath=path.join(archiveRoot,archiveName);
  const {rename}=await import('node:fs/promises');
  let moved=false;
  try{
    try{await rename(dataDir,archivePath);moved=true;}catch(error){if(error?.code!=='ENOENT')throw error;}
    const previous=cfg.companies;
    cfg.companies=previous.filter(x=>x.slug!==company.slug);
    try{await saveConfig(cfg);}catch(error){
      cfg.companies=previous;
      if(moved)await rename(archivePath,dataDir).catch(()=>{});
      throw error;
    }
  }catch(error){throw error;}
  return {ok:true,deletedCompany:{id:company.id,slug:company.slug,code:company.code,name:company.name},archived:moved,archiveName:moved?archiveName:null};
}
function v255OperationalScalarKey(key){
  return /(?:owner|assignee|assigned|responsible|responsable|observer|participant|watcher)(?:User)?Id$/i.test(key)
    || ['assignedTo','responsibleId','responsableId','ownerId','assigneeId'].includes(key);
}
function v255OperationalListKey(key){
  return /(?:observer|participant|watcher|assigned|assignee|responsible|responsable).*UserIds$/i.test(key);
}
function v255OperationalMapKey(key){return ['branchOwners','ownersByBranch','ownerByBranch','responsiblesByBranch'].includes(key);}
function v255ReassignUserReferences(data,fromId,toId){
  const summary={};
  const skipKeys=new Set(['users','messages','messageHistory','history','activities','audit','auditLog','logs','deletionAudit']);
  const bump=(top,n=1)=>summary[top]=(summary[top]||0)+n;
  function walk(node,top,parentKey=''){
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){for(const item of node)walk(item,top,parentKey);return;}
    if(v255OperationalMapKey(parentKey)){
      for(const [key,value] of Object.entries(node))if(value===fromId){node[key]=toId;bump(top);}
    }
    for(const [key,value] of Object.entries(node)){
      if(skipKeys.has(key))continue;
      if(v255OperationalScalarKey(key)&&value===fromId){node[key]=toId;bump(top);continue;}
      if(v255OperationalListKey(key)&&Array.isArray(value)){
        let changed=0;
        const next=[];
        for(const id of value){const mapped=id===fromId?(changed++,toId):id;if(mapped&&!next.includes(mapped))next.push(mapped);}
        if(changed){node[key]=next;bump(top,changed);}continue;
      }
      if(value&&typeof value==='object')walk(value,top,key);
    }
  }
  for(const [top,value] of Object.entries(data||{})){
    if(skipKeys.has(top))continue;
    walk(value,top,top);
  }
  return summary;
}
function v255CountUserReferences(data,userId){
  const clone=structuredClone(data);
  const marker='__v255_target__';
  return v255ReassignUserReferences(clone,userId,marker);
}
async function v255CreateTenantUser(company,input){
  const data=await v25ReadTenantData(company);
  data.users=Array.isArray(data.users)?data.users:[];
  const username=clean(input.username,80).toLowerCase();
  const name=clean(input.name,120);
  const role=['admin','manager','agent'].includes(String(input.role||''))?String(input.role):'agent';
  const password=String(input.password||'');
  if(!username||!name)throw new Error('Completá nombre y usuario.');
  if(password.length<8)throw new Error('La contraseña debe tener al menos 8 caracteres.');
  if(data.users.some(x=>String(x.username||'').toLowerCase()===username))throw new Error('Ese usuario ya existe en esta empresa.');
  const branchId=role==='admin'?null:(clean(input.branchId,120)||null);
  if(branchId&&!(data.branches||[]).some(x=>x.id===branchId))throw new Error('La sucursal seleccionada no existe.');
  const user={id:makeId('user'),username,name,role,branchId,passwordHash:hashPassword(password),active:true,clientDailyLimit:Math.max(1,Math.min(1000,Number(input.clientDailyLimit)||100)),permissions:v255Permissions(role),createdAt:timestamp(),updatedAt:timestamp()};
  data.users.push(user);
  await v255WriteTenantData(company,data);v255StopTenant(company);
  return {ok:true,user:v25PublicUser(user),users:data.users.map(v25PublicUser)};
}
async function v255DeleteTenantUser(company,userId,input){
  const data=await v25ReadTenantData(company);
  data.users=Array.isArray(data.users)?data.users:[];
  const user=data.users.find(x=>x.id===userId);
  if(!user)throw new Error('Personal no encontrado.');
  if(data.users.length<=1)throw new Error('No podés eliminar el único usuario de la empresa.');
  const activeAdmins=data.users.filter(x=>x.active!==false&&x.role==='admin'&&x.id!==userId);
  if(user.role==='admin'&&!activeAdmins.length)throw new Error('No podés eliminar el último administrador de la empresa.');
  const references=v255CountUserReferences(data,userId);
  const referenceTotal=Object.values(references).reduce((a,b)=>a+Number(b||0),0);
  const transferToUserId=clean(input?.transferToUserId,160);
  let target=null;
  if(referenceTotal>0){
    target=data.users.find(x=>x.id===transferToUserId&&x.id!==userId&&x.active!==false);
    if(!target){const error=new Error('Seleccioná a quién transferir las responsabilidades antes de eliminar.');error.code='REASSIGN_REQUIRED';error.references=references;throw error;}
  }
  const reassigned=target?v255ReassignUserReferences(data,userId,target.id):{};
  data.users=data.users.filter(x=>x.id!==userId);
  await v255WriteTenantData(company,data);v255StopTenant(company);
  return {ok:true,deletedUser:{id:user.id,name:user.name,username:user.username},transferredTo:target?v25PublicUser(target):null,reassigned,users:data.users.map(v25PublicUser)};
}
`;

const routes = String.raw`
      const v255CreateUser=p.match(new RegExp('^/api/gateway/master/companies/([^/]+)/users$'));if(v255CreateUser&&req.method==='POST'){const c=companyFromSlug(cfg,v255CreateUser[1]);if(!c)return json(res,404,{error:'Empresa no encontrada.'});const b=await bodyJson(req);try{return json(res,201,await v255CreateTenantUser(c,b))}catch(e){return json(res,400,{error:e.message})}}
      const v255DeleteUser=p.match(new RegExp('^/api/gateway/master/companies/([^/]+)/users/([^/]+)$'));if(v255DeleteUser&&req.method==='DELETE'){const c=companyFromSlug(cfg,v255DeleteUser[1]);if(!c)return json(res,404,{error:'Empresa no encontrada.'});const b=await bodyJson(req);try{return json(res,200,await v255DeleteTenantUser(c,decodeURIComponent(v255DeleteUser[2]),b))}catch(e){return json(res,e.code==='REASSIGN_REQUIRED'?409:400,{error:e.message,reassignRequired:e.code==='REASSIGN_REQUIRED',references:e.references||{}})}}
      const v255DeleteCompany=p.match(new RegExp('^/api/gateway/master/companies/([^/]+)$'));if(v255DeleteCompany&&req.method==='DELETE'){const c=cfg.companies.find(x=>x.slug===v255DeleteCompany[1]);if(!c)return json(res,404,{error:'Empresa no encontrada.'});const b=await bodyJson(req);try{return json(res,200,await v255DeleteTenantCompany(cfg,c,b))}catch(e){return json(res,400,{error:e.message,confirmationRequired:e.code==='COMPANY_CONFIRM_REQUIRED',expectedCode:e.code==='COMPANY_CONFIRM_REQUIRED'?(c.code||c.slug):undefined})}}
`;

export function applyV255GatewayPatches(source){
  let patched=source;
  patched=replaceOnce(patched,'async function v25TenantSessionValid(company,req){',helpers+'\nasync function v25TenantSessionValid(company,req){','helpers personal');
  const routeAnchor="      const v25Overview=p.match(new RegExp('^/api/gateway/master/companies/([^/]+)/overview$'));if(v25Overview&&req.method==='GET'){const c=companyFromSlug(cfg,v25Overview[1]);if(!c)return json(res,404,{error:'Empresa no encontrada.'});const d=await v25ReadTenantData(c);return json(res,200,v25TenantSummary(c,d));}";
  patched=replaceOnce(patched,routeAnchor,routes+routeAnchor,'rutas personal');
  const masterRoute="    if(p==='/master'||p==='/master/'){return html(res,200,await readFile(path.join(publicDir,'master-v25.html'),'utf8'))}";
  const enhancedMaster="    if(p==='/master-v25-5.css'&&req.method==='GET'){const b=await readFile(path.join(publicDir,'master-v25-5.css'));res.writeHead(200,{'content-type':'text/css; charset=utf-8','content-length':b.length,'cache-control':'no-store'});return res.end(b)}\n    if(p==='/master-v25-5.js'&&req.method==='GET'){const b=await readFile(path.join(publicDir,'master-v25-5.js'));res.writeHead(200,{'content-type':'application/javascript; charset=utf-8','content-length':b.length,'cache-control':'no-store'});return res.end(b)}\n    if(p==='/master'||p==='/master/'){let page=await readFile(path.join(publicDir,'master-v25.html'),'utf8');page=page.replace('</head>','<link rel=\"stylesheet\" href=\"/master-v25-5.css?v=25.5.1\"></head>').replace('</body>','<script src=\"/master-v25-5.js?v=25.5.1\"></script></body>');return html(res,200,page)}";
  patched=replaceOnce(patched,masterRoute,enhancedMaster,'assets master V25.5');
  return patched;
}
