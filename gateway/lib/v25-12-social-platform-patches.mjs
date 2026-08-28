function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V25.12 Gateway social: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V25.12 Gateway social: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

const helpers = String.raw`
function v2512PublicBase(req){
  const configured=String(process.env.CRM_PUBLIC_BASE_URL||'').replace(/\/$/,'');
  if(configured)return configured;
  const proto=clean(String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()||'https',20);
  const hostName=clean(req.headers['x-forwarded-host']||req.headers.host,300);
  return hostName?proto+'://'+hostName:'';
}
function v2512SocialConfig(cfg){
  cfg.socialOAuth=cfg.socialOAuth&&typeof cfg.socialOAuth==='object'?cfg.socialOAuth:{};
  cfg.socialOAuth.meta=cfg.socialOAuth.meta&&typeof cfg.socialOAuth.meta==='object'?cfg.socialOAuth.meta:{};
  cfg.socialOAuth.tiktok=cfg.socialOAuth.tiktok&&typeof cfg.socialOAuth.tiktok==='object'?cfg.socialOAuth.tiktok:{};
  return cfg.socialOAuth;
}
function v2512SocialPublic(cfg,req){
  const social=v2512SocialConfig(cfg),meta=social.meta||{},tiktok=social.tiktok||{},base=v2512PublicBase(req);
  return {
    managedByPlatform:true,
    meta:{configured:Boolean(meta.appId&&meta.appSecret),appId:clean(meta.appId,220),hasAppSecret:Boolean(meta.appSecret),verifyToken:clean(meta.verifyToken,300),callbackUrl:base+'/api/social/oauth/meta/callback',webhookUrl:base+'/api/social/meta/webhook'},
    tiktok:{configured:Boolean(tiktok.clientKey&&tiktok.clientSecret),clientKey:clean(tiktok.clientKey,220),hasClientSecret:Boolean(tiktok.clientSecret),callbackUrl:base+'/api/social/oauth/tiktok/callback'},
  };
}
function v2512StopAllTenants(){
  for(const [slug,running] of [...children.entries()]){
    if(running?.proc&&!running.proc.killed)running.proc.kill('SIGTERM');
    children.delete(slug);
  }
}
async function v2512UpdateSocialConfig(cfg,input,req){
  const social=v2512SocialConfig(cfg),metaInput=input?.meta&&typeof input.meta==='object'?input.meta:{},ttInput=input?.tiktok&&typeof input.tiktok==='object'?input.tiktok:{};
  social.meta={...social.meta,appId:clean(metaInput.appId??social.meta.appId,220),verifyToken:clean(social.meta.verifyToken,300)||randomBytes(24).toString('hex')};
  if(String(metaInput.appSecret||'').trim())social.meta.appSecret=String(metaInput.appSecret).trim().slice(0,1000);
  if(metaInput.clearAppSecret===true)social.meta.appSecret='';
  social.tiktok={...social.tiktok,clientKey:clean(ttInput.clientKey??social.tiktok.clientKey,220)};
  if(String(ttInput.clientSecret||'').trim())social.tiktok.clientSecret=String(ttInput.clientSecret).trim().slice(0,1000);
  if(ttInput.clearClientSecret===true)social.tiktok.clientSecret='';
  cfg.socialOAuth=social;
  await saveConfig(cfg);
  v2512StopAllTenants();
  return v2512SocialPublic(cfg,req);
}
function v2512TenantFromOauthState(cfg,value){
  const state=clean(value,500),dot=state.indexOf('.');if(dot<1)return null;
  return companyFromSlug(cfg,state.slice(0,dot));
}
function v2512MetaSignatureValid(secret,signature,raw){
  if(!secret||!signature||!Buffer.isBuffer(raw))return false;
  const expected='sha256='+createHmac('sha256',String(secret)).update(raw).digest('hex');
  const a=Buffer.from(String(signature)),b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
}
async function v2512DispatchMetaWebhook(cfg,req,raw){
  const signature=String(req.headers['x-hub-signature-256']||'');
  const contentType=String(req.headers['content-type']||'application/json');
  const forwardedProto=String(req.headers['x-forwarded-proto']||'https');
  const forwardedHost=String(req.headers['x-forwarded-host']||req.headers.host||'');
  const active=cfg.companies.filter(company=>company.active!==false);
  const jobs=active.map(async company=>{
    await ensureTenant(company);
    return fetch('http://127.0.0.1:'+company.port+'/api/social/meta/webhook',{method:'POST',headers:{'content-type':contentType,'x-hub-signature-256':signature,'x-forwarded-proto':forwardedProto,'x-forwarded-host':forwardedHost},body:raw,signal:AbortSignal.timeout(8000)});
  });
  return Promise.allSettled(jobs);
}
`;

const publicRoutes = String.raw`
    if(p==='/master-v25-12.js'&&req.method==='GET'){const b=await readFile(path.join(publicDir,'master-v25-12.js'));res.writeHead(200,{...v256GatewayHeaders(),'content-type':'application/javascript; charset=utf-8','content-length':b.length,'cache-control':'no-store'});return res.end(b)}
    if(p==='/api/social/oauth/meta/callback'&&req.method==='GET'){const c=v2512TenantFromOauthState(cfg,url.searchParams.get('state'));if(!c)return json(res,400,{error:'Estado OAuth inválido o empresa no encontrada.'});return proxy(req,res,c,'/api/social/oauth/meta/callback'+url.search)}
    if(p==='/api/social/oauth/tiktok/callback'&&req.method==='GET'){const c=v2512TenantFromOauthState(cfg,url.searchParams.get('state'));if(!c)return json(res,400,{error:'Estado OAuth inválido o empresa no encontrada.'});return proxy(req,res,c,'/api/social/oauth/tiktok/callback'+url.search)}
    if(p==='/api/social/meta/webhook'&&req.method==='GET'){const social=v2512SocialConfig(cfg),mode=url.searchParams.get('hub.mode'),token=url.searchParams.get('hub.verify_token'),challenge=url.searchParams.get('hub.challenge');if(mode==='subscribe'&&social.meta.verifyToken&&token===social.meta.verifyToken){const out=Buffer.from(String(challenge||''));res.writeHead(200,{...v256GatewayHeaders(),'content-type':'text/plain; charset=utf-8','content-length':out.length,'cache-control':'no-store'});res.end(out);return}return json(res,403,{error:'Verify Token inválido.'})}
    if(p==='/api/social/meta/webhook'&&req.method==='POST'){const social=v2512SocialConfig(cfg),raw=await readBody(req,1024*1024),signature=String(req.headers['x-hub-signature-256']||'');if(!v2512MetaSignatureValid(social.meta.appSecret,signature,raw))return json(res,403,{error:'Firma de Meta inválida.'});await v2512DispatchMetaWebhook(cfg,req,raw);return json(res,200,{ok:true})}
`;

const masterRoutes = String.raw`
      if(p==='/api/gateway/master/social-oauth'&&req.method==='GET')return json(res,200,v2512SocialPublic(cfg,req));
      if(p==='/api/gateway/master/social-oauth'&&req.method==='PUT'){const b=await bodyJson(req);try{return json(res,200,await v2512UpdateSocialConfig(cfg,b,req))}catch(e){return json(res,400,{error:e.message})}}
`;

export function applyV2512GatewaySocialPlatformPatches(source) {
  let patched=source;
  patched=replaceOnce(patched,
    "import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';",
    "import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';",
    'import createHmac');
  patched=replaceOnce(patched,
    "async function waitHealth(port,ms=20000){",
    helpers+"\nasync function waitHealth(port,ms=20000){",
    'helpers globales');
  patched=replaceOnce(patched,
    "  await mkdir(absDataDir(c),{recursive:true});\n  const proc=spawn(process.execPath,[appPath],{cwd:path.join(root,'app'),env:{...process.env,",
    "  await mkdir(absDataDir(c),{recursive:true});\n  const v2512GatewayConfig=await loadConfig();const v2512Social=v2512SocialConfig(v2512GatewayConfig);\n  const proc=spawn(process.execPath,[appPath],{cwd:path.join(root,'app'),env:{...process.env,",
    'carga config social al iniciar tenant');
  patched=replaceOnce(patched,
    "CRM_GATEWAY_SECRET:internalGatewaySecret},stdio:['ignore','inherit','inherit']",
    "CRM_GATEWAY_SECRET:internalGatewaySecret,CRM_SOCIAL_MANAGED_BY_GATEWAY:'1',CRM_SOCIAL_META_APP_ID:String(v2512Social.meta?.appId||''),CRM_SOCIAL_META_APP_SECRET:String(v2512Social.meta?.appSecret||''),CRM_SOCIAL_META_VERIFY_TOKEN:String(v2512Social.meta?.verifyToken||''),CRM_SOCIAL_TIKTOK_CLIENT_KEY:String(v2512Social.tiktok?.clientKey||''),CRM_SOCIAL_TIKTOK_CLIENT_SECRET:String(v2512Social.tiktok?.clientSecret||'')},stdio:['ignore','inherit','inherit']",
    'credenciales globales en tenant');
  patched=replaceOnce(patched,
    "    if(p==='/api/gateway/master/status')",
    publicRoutes+"    if(p==='/api/gateway/master/status')",
    'callbacks y webhook globales');
  patched=replaceOnce(patched,
    "      if(p==='/api/gateway/master/context'&&req.method==='GET')",
    masterRoutes+"      if(p==='/api/gateway/master/context'&&req.method==='GET')",
    'config social en administrador maestro');
  patched=replaceOnce(patched,
    "page=page.replace('</head>','<link rel=\"stylesheet\" href=\"/master-v25-5.css?v=25.5.1\"></head>').replace('</body>','<script src=\"/master-v25-5.js?v=25.5\"></script><script src=\"/master-v25-5-1.js?v=25.5.1\"></script></body>');",
    "page=page.replace('</head>','<link rel=\"stylesheet\" href=\"/master-v25-5.css?v=25.5.1\"></head>').replace('</body>','<script src=\"/master-v25-5.js?v=25.5\"></script><script src=\"/master-v25-5-1.js?v=25.5.1\"></script><script src=\"/master-v25-12.js?v=25.12\"></script></body>');",
    'carga UI social maestra');
  return patched;
}
