function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.18 Gateway always-on: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.18 Gateway always-on: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.18 Gateway always-on: no se encontró inicio ${label}.`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`V26.18 Gateway always-on: no se encontró fin ${label}.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

const lifecycleHelpers = String.raw`
const v2618TenantStarting=new Map();
const v2618RespawnBackoff=new Map();
const v2618RespawnTimers=new Map();
let v2618GatewayShuttingDown=false;

function v2618ClearRespawn(slug){
  const timer=v2618RespawnTimers.get(slug);
  if(timer)clearTimeout(timer);
  v2618RespawnTimers.delete(slug);
}

function v2618ScheduleRespawn(company,reason='exit'){
  if(v2618GatewayShuttingDown||!company?.slug)return;
  const slug=company.slug;
  v2618ClearRespawn(slug);
  const previous=Math.max(0,Number(v2618RespawnBackoff.get(slug)||0));
  const wait=previous?Math.min(previous*2,30000):1000;
  v2618RespawnBackoff.set(slug,wait);
  console.warn('[tenant:'+slug+'] reinicio programado en '+wait+' ms ('+reason+').');
  const timer=setTimeout(async()=>{
    v2618RespawnTimers.delete(slug);
    if(v2618GatewayShuttingDown)return;
    try{
      const cfg=await loadConfig();
      const latest=companyFromSlug(cfg,slug);
      if(!latest||latest.active===false){v2618RespawnBackoff.delete(slug);return;}
      await ensureTenant(latest);
    }catch(error){
      console.error('[tenant:'+slug+'] no pudo recuperarse:',error?.message||error);
      v2618ScheduleRespawn(company,'retry');
    }
  },wait);
  timer.unref?.();
  v2618RespawnTimers.set(slug,timer);
}

async function v2618BootTenants(){
  const cfg=await loadConfig();
  const active=cfg.companies.filter(company=>company.active!==false);
  const results=await Promise.allSettled(active.map(company=>ensureTenant(company)));
  results.forEach((result,index)=>{
    if(result.status==='rejected'){
      const company=active[index];
      console.error('[tenant:'+company.slug+'] no arrancó durante el boot:',result.reason?.message||result.reason);
      v2618ScheduleRespawn(company,'boot-failure');
    }
  });
  console.log('Tenants activos preparados: '+active.length);
}

function v2618CleanupMasterSessions(){
  const now=Date.now();
  for(const [token,expiresAt] of masterSessions.entries())if(Number(expiresAt)<=now)masterSessions.delete(token);
}
const v2618MasterCleanupTimer=setInterval(v2618CleanupMasterSessions,30*60*1000);
v2618MasterCleanupTimer.unref?.();
`;

const ensureTenant = String.raw`async function ensureTenant(c){
  const slug=c.slug;
  const inFlight=v2618TenantStarting.get(slug);
  if(inFlight)return inFlight;
  const existing=children.get(slug);
  if(existing?.proc&&!existing.proc.killed&&existing.proc.exitCode==null)return existing;

  const starting=(async()=>{
    let proc=null;
    try{
      await mkdir(absDataDir(c),{recursive:true});
      const v2512GatewayConfig=await loadConfig();const v2512Social=v2512SocialConfig(v2512GatewayConfig);
      proc=spawn(process.execPath,[appPath],{cwd:path.join(root,'app'),env:{...process.env,PORT:String(c.port),WHATSAPP_MOCK:process.env.WHATSAPP_MOCK||'0',NO_OPEN:'1',WHATSBOT_HOST:'127.0.0.1',WHATSBOT_DATA_DIR:absDataDir(c),CRM_TENANT_SLUG:c.slug,CRM_PUBLIC_BASE_URL:process.env.CRM_PUBLIC_BASE_URL||'',CRM_GATEWAY_SECRET:internalGatewaySecret,CRM_SOCIAL_MANAGED_BY_GATEWAY:'1',CRM_SOCIAL_META_APP_ID:String(v2512Social.meta?.appId||''),CRM_SOCIAL_META_APP_SECRET:String(v2512Social.meta?.appSecret||''),CRM_SOCIAL_META_VERIFY_TOKEN:String(v2512Social.meta?.verifyToken||''),CRM_SOCIAL_TIKTOK_CLIENT_KEY:String(v2512Social.tiktok?.clientKey||''),CRM_SOCIAL_TIKTOK_CLIENT_SECRET:String(v2512Social.tiktok?.clientSecret||'')},stdio:['ignore','inherit','inherit']});
      const state={proc,port:c.port,startedAt:Date.now()};
      children.set(slug,state);
      proc.once('exit',(code,signal)=>{
        if(children.get(slug)?.proc===proc)children.delete(slug);
        if(v2618GatewayShuttingDown)return;
        console.warn('[tenant:'+slug+'] proceso finalizado (code='+(code??'null')+', signal='+(signal||'none')+').');
        v2618ScheduleRespawn(c,'process-exit');
      });
      await waitHealth(c.port);
      if(proc.exitCode!=null)throw new Error('El proceso terminó durante el arranque.');
      v2618ClearRespawn(slug);
      v2618RespawnBackoff.delete(slug);
      return state;
    }catch(error){
      if(proc&&!proc.killed&&proc.exitCode==null)proc.kill('SIGTERM');
      if(children.get(slug)?.proc===proc)children.delete(slug);
      if(!v2618GatewayShuttingDown)v2618ScheduleRespawn(c,'start-failure');
      throw error;
    }
  })().finally(()=>v2618TenantStarting.delete(slug));
  v2618TenantStarting.set(slug,starting);
  return starting;
}
`;

export function applyV2618GatewayAlwaysOnPatches(source) {
  let patched=source;

  patched=replaceOnce(
    patched,
    "async function waitHealth(port,ms=20000){const until=Date.now()+ms;let err;while(Date.now()<until){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1200)});if(r.ok)return true}catch(e){err=e}await new Promise(r=>setTimeout(r,250))}throw err||new Error('La instancia no respondió a tiempo.')}",
    "async function waitHealth(port,ms=20000){const until=Date.now()+ms;let err;while(Date.now()<until){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1200)});if(r.ok)return true}catch(e){err=e}await new Promise(r=>setTimeout(r,250))}throw err||new Error('La instancia no respondió a tiempo.')}\n"+lifecycleHelpers,
    'helpers de ciclo de vida',
  );

  patched=replaceBetween(patched,'async function ensureTenant(c){','function forwardCookieHeader',ensureTenant,'ensureTenant');

  patched=replaceOnce(
    patched,
    "      delete out['content-security-policy'];",
    "      // V26.18: conservar la CSP emitida por el tenant. No debilitar la protección anti-XSS.",
    'preservación CSP',
  );

  patched=replaceOnce(
    patched,
    "  }catch(e){json(res,500,{error:e.message||'Error interno del Gateway.'})}",
    "  }catch(e){console.error('[gateway] error interno:',e);json(res,500,{error:'Error interno del Gateway.'})}",
    'error interno genérico',
  );

  patched=replaceOnce(
    patched,
    "server.listen(gatewayPort,gatewayHost,()=>console.log(`\\nCRM V23 Gateway listo en http://${gatewayHost}:${gatewayPort}\\nEmpresas aisladas: proceso bajo demanda\\n`));\nfor(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{for(const x of children.values())x.proc?.kill('SIGTERM');server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref()});",
    "server.listen(gatewayPort,gatewayHost,()=>{console.log(`\\nCRM V26.18 Gateway listo en http://${gatewayHost}:${gatewayPort}\\nEmpresas activas: modo always-on\\n`);void v2618BootTenants().catch(error=>console.error('[gateway] boot de tenants:',error));});\nfor(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{v2618GatewayShuttingDown=true;for(const timer of v2618RespawnTimers.values())clearTimeout(timer);v2618RespawnTimers.clear();clearInterval(v2618MasterCleanupTimer);for(const x of children.values())x.proc?.kill('SIGTERM');server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref()});",
    'boot always-on y apagado limpio',
  );

  return patched;
}
