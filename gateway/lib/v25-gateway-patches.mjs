function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V25 Gateway: no se encontró el anclaje ${label}.`);
  if (first !== last) throw new Error(`V25 Gateway: el anclaje ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

const helpers = String.raw`
async function v25ReadTenantData(company){
  const db=path.join(absDataDir(company),'whatsbot-crm.json');
  const raw=await readFile(db,'utf8');
  return JSON.parse(raw);
}
function v25Color(value,fallback){const v=clean(value,24);return /^#[0-9a-f]{6}$/i.test(v)?v:fallback;}
function v25PublicUser(user){return {id:user.id,username:user.username,name:user.name,role:user.role,branchId:user.branchId||null,active:user.active!==false};}
function v25TenantSummary(company,data){
  const deals=Array.isArray(data.deals)?data.deals:[];
  const users=Array.isArray(data.users)?data.users:[];
  const clients=Array.isArray(data.clients)?data.clients:[];
  const products=Array.isArray(data.products)?data.products:[];
  const forms=Array.isArray(data.surveys)?data.surveys:[];
  const campaigns=Array.isArray(data.campaigns)?data.campaigns:[];
  const lines=Array.isArray(data.whatsappLines)?data.whatsappLines:[];
  const branches=Array.isArray(data.branches)?data.branches:[];
  const openStages=new Set(['new','contacted','waiting']);
  return {
    company:{slug:company.slug,code:company.code,name:company.name,active:company.active!==false,port:company.port,running:children.has(company.slug),branding:{...(data.settings?.branding||{}),...(company.branding||{})}},
    counts:{users:users.length,activeUsers:users.filter(x=>x.active!==false).length,clients:clients.length,deals:deals.length,openDeals:deals.filter(x=>openStages.has(x.stage)).length,products:products.length,forms:forms.length,campaigns:campaigns.length,whatsappLines:lines.length,branches:branches.length},
    databaseBytes:Buffer.byteLength(JSON.stringify(data)),
    modules:{...(data.settings?.modules||{})},
    users:users.map(v25PublicUser),
    branches:branches.map(x=>({id:x.id,name:x.name,code:x.code||'',city:x.city||'',active:x.active!==false})),
    whatsappLines:lines.map(x=>({id:x.id,name:x.name,provider:x.provider||'qr',phone:x.phone||'',active:x.active!==false,branchId:x.branchId||null,isDefault:x.isDefault===true})),
    updatedAt:data.updatedAt||data.sync?.lastActiveAt||null,
  };
}
async function v25TenantSessionValid(company,req){
  try{
    await ensureTenant(company);
    const r=await fetch('http://127.0.0.1:'+company.port+'/api/state',{headers:{cookie:req.headers.cookie||''},redirect:'manual',signal:AbortSignal.timeout(2500)});
    return r.ok;
  }catch{return false;}
}
async function v25UpdateTenantControl(cfg,company,input){
  const data=await v25ReadTenantData(company);
  if(input.name!==undefined){const name=clean(input.name,180);if(!name)throw new Error('Ingresá el nombre de la empresa.');company.name=name;}
  if(input.code!==undefined){const code=slugify(input.code);if(!code)throw new Error('Ingresá un código válido.');if(cfg.companies.some(x=>x.slug!==company.slug&&x.code===code))throw new Error('Ese código ya pertenece a otra empresa.');company.code=code;}
  if(input.active!==undefined)company.active=input.active!==false;
  const brand=data.settings?.branding&&typeof data.settings.branding==='object'?data.settings.branding:(data.settings.branding={});
  const incoming=input.branding&&typeof input.branding==='object'?input.branding:{};
  const textFields=[['systemName',80],['shortName',40],['subtitle',80],['loginKicker',80],['loginMessage',260],['fontStyle',30],['loginStyle',30],['logoFit',20],['defaultTheme',20]];
  for(const [key,max] of textFields)if(incoming[key]!==undefined)brand[key]=clean(incoming[key],max);
  for(const key of ['primaryColor','accentColor','backgroundColor','sidebarColor','surfaceColor','textColor'])if(incoming[key]!==undefined)brand[key]=v25Color(incoming[key],brand[key]||'#171717');
  if(incoming.showSubtitle!==undefined)brand.showSubtitle=incoming.showSubtitle!==false;
  if(!brand.systemName)brand.systemName=company.name;
  company.branding={...(company.branding||{}),systemName:brand.systemName,shortName:brand.shortName||company.name,primaryColor:brand.primaryColor||'#171717',accentColor:brand.accentColor||'#FF7A00',backgroundColor:brand.backgroundColor||'#F3F3F3',sidebarColor:brand.sidebarColor||brand.primaryColor||'#101010',surfaceColor:brand.surfaceColor||'#ffffff',textColor:brand.textColor||'#1B1B1B',loginKicker:brand.loginKicker||'',loginMessage:brand.loginMessage||'',logoFileName:brand.logoFileName||''};
  if(input.modules&&typeof input.modules==='object'){
    data.settings.modules=data.settings.modules&&typeof data.settings.modules==='object'?data.settings.modules:{};
    for(const [key,value] of Object.entries(input.modules))if(typeof value==='boolean')data.settings.modules[key]=value;
    data.settings.modules.settings=true;
  }
  await writeFile(path.join(absDataDir(company),'whatsbot-crm.json'),JSON.stringify(data),{mode:0o600});
  await saveConfig(cfg);
  const running=children.get(company.slug);if(running?.proc&&!running.proc.killed){running.proc.kill('SIGTERM');children.delete(company.slug);}
  return v25TenantSummary(company,data);
}
async function v25UpdateTenantLogo(cfg,company,input){
  const match=String(input?.logoDataUrl||'').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if(!match)throw new Error('Seleccioná un logo PNG, JPG o WEBP.');
  const buffer=Buffer.from(match[2],'base64');if(!buffer.length||buffer.length>2*1024*1024)throw new Error('El logo debe pesar como máximo 2 MB.');
  const ext=match[1]==='image/png'?'.png':match[1]==='image/webp'?'.webp':'.jpg';
  const fileName='master-logo'+ext;const dir=path.join(absDataDir(company),'branding');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,fileName),buffer);
  const data=await v25ReadTenantData(company);data.settings.branding=data.settings.branding&&typeof data.settings.branding==='object'?data.settings.branding:{};data.settings.branding.logoFileName=fileName;
  company.branding={...(company.branding||{}),logoFileName:fileName};await writeFile(path.join(absDataDir(company),'whatsbot-crm.json'),JSON.stringify(data),{mode:0o600});await saveConfig(cfg);
  const running=children.get(company.slug);if(running?.proc&&!running.proc.killed){running.proc.kill('SIGTERM');children.delete(company.slug);}
  return {ok:true,logoUrl:'/t/'+company.slug+'/api/branding/logo'};
}
`;

const masterRoutes = String.raw`
      const v25Overview=p.match(new RegExp('^/api/gateway/master/companies/([^/]+)/overview$'));if(v25Overview&&req.method==='GET'){const c=companyFromSlug(cfg,v25Overview[1]);if(!c)return json(res,404,{error:'Empresa no encontrada.'});const d=await v25ReadTenantData(c);return json(res,200,v25TenantSummary(c,d));}
      const v25Control=p.match(new RegExp('^/api/gateway/master/companies/([^/]+)/control$'));if(v25Control&&req.method==='PUT'){const c=companyFromSlug(cfg,v25Control[1]);if(!c)return json(res,404,{error:'Empresa no encontrada.'});const b=await bodyJson(req);return json(res,200,await v25UpdateTenantControl(cfg,c,b));}
      const v25Logo=p.match(new RegExp('^/api/gateway/master/companies/([^/]+)/logo$'));if(v25Logo&&req.method==='POST'){const c=companyFromSlug(cfg,v25Logo[1]);if(!c)return json(res,404,{error:'Empresa no encontrada.'});const raw=await readBody(req,3*1024*1024);const b=raw.length?JSON.parse(raw.toString('utf8')):{};return json(res,200,await v25UpdateTenantLogo(cfg,c,b));}
      const v25Backup=p.match(new RegExp('^/api/gateway/master/companies/([^/]+)/backup$'));if(v25Backup&&req.method==='GET'){const c=companyFromSlug(cfg,v25Backup[1]);if(!c)return json(res,404,{error:'Empresa no encontrada.'});const d=await v25ReadTenantData(c);const out=Buffer.from(JSON.stringify(d,null,2));res.writeHead(200,{'content-type':'application/json; charset=utf-8','content-length':out.length,'content-disposition':'attachment; filename="'+c.slug+'-backup.json"','cache-control':'no-store'});res.end(out);return;}
`;

export function applyV25GatewayPatches(source){
  let patched=source;
  patched=replaceOnce(patched,"path.join(publicDir,'master.html')","path.join(publicDir,'master-v25.html')","master V25");
  patched=replaceOnce(patched,"async function publicProbe(req,res,candidates){",helpers+"\nasync function publicProbe(req,res,candidates){","helpers V25");
  const companiesAnchor="      if(p==='/api/gateway/master/companies'&&req.method==='GET')return json(res,200,{companies:cfg.companies.map(c=>({...c,running:children.has(c.slug)}))});";
  patched=replaceOnce(patched,companiesAnchor,masterRoutes+companiesAnchor,"rutas maestras V25");
  const routing=`    const c=cookies.crm_tenant?companyFromSlug(cfg,cookies.crm_tenant):null;\n    if(c)return proxy(req,res,c);\n    if(['/portal/','/api/public/','/api/v22/public/'].some(prefix=>p.startsWith(prefix))){if(await publicProbe(req,res,cfg.companies.filter(x=>x.active!==false)))return}`;
  const hardened=`    const c=cookies.crm_tenant?companyFromSlug(cfg,cookies.crm_tenant):null;\n    if(c){\n      if(p==='/api/auth/login'&&req.method==='POST'){const b=await bodyJson(req);return loginTenant(req,res,c,b.username,b.password)}\n      if((p==='/'||p==='/index.html')&&req.method==='GET'){const valid=await v25TenantSessionValid(c,req);if(!valid){res.setHeader('Set-Cookie',[cookie('crm_tenant','',0),cookie('whatsbot_session','',0)]);res.writeHead(302,{location:'/login'});return res.end();}}\n      return proxy(req,res,c);\n    }\n    if(['/portal/','/api/public/','/api/v22/public/'].some(prefix=>p.startsWith(prefix)))return json(res,404,{error:'Ruta pública sin empresa. Usá una URL /t/<empresa>/... para mantener aislamiento estricto.'})`;
  patched=replaceOnce(patched,routing,hardened,"enrutamiento aislado V25");
  return patched;
}
