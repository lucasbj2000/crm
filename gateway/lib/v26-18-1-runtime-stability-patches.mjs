function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.18.1 Gateway: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.18.1 Gateway: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.18.1 Gateway: no se encontró inicio ${label}.`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`V26.18.1 Gateway: no se encontró fin ${label}.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

const runtimeHelpers = String.raw`
const v26181IntentionalStops=new Set();

async function v26181WaitForExit(proc,ms=5000){
  if(!proc||proc.exitCode!=null)return true;
  let timer=null;
  try{
    return await Promise.race([
      new Promise(resolve=>proc.once('exit',()=>resolve(true))),
      new Promise(resolve=>{timer=setTimeout(()=>resolve(false),ms);timer.unref?.();}),
    ]);
  }finally{if(timer)clearTimeout(timer);}
}

async function v26181StopTenant(slug){
  v2618ClearRespawn(slug);
  const state=children.get(slug);
  const proc=state?.proc;
  if(!proc){children.delete(slug);return;}
  v26181IntentionalStops.add(slug);
  if(proc.exitCode==null&&!proc.killed){try{proc.kill('SIGTERM');}catch{}}
  let exited=await v26181WaitForExit(proc,5000);
  if(!exited&&proc.exitCode==null){
    try{proc.kill('SIGKILL');}catch{}
    exited=await v26181WaitForExit(proc,1500);
  }
  if(children.get(slug)?.proc===proc)children.delete(slug);
  if(!exited&&proc.exitCode==null)throw new Error('El proceso anterior de '+slug+' no finalizó a tiempo.');
}

async function v26181RestartTenant(company){
  if(!company?.slug)throw new Error('Empresa inválida para reinicio.');
  const cfg=await loadConfig();
  const latest=companyFromSlug(cfg,company.slug);
  if(!latest)throw new Error('La empresa ya no está activa.');
  await v26181StopTenant(latest.slug);
  return ensureTenant(latest);
}
`;

const sequentialBoot = String.raw`async function v2618BootTenants(){
  const cfg=await loadConfig();
  const active=cfg.companies.filter(company=>company.active!==false);
  let ready=0;
  for(const company of active){
    if(v2618GatewayShuttingDown)break;
    try{
      await ensureTenant(company);
      ready+=1;
    }catch(error){
      console.error('[tenant:'+company.slug+'] no arrancó durante el boot:',error?.message||error);
      v2618ScheduleRespawn(company,'boot-failure');
    }
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  console.log('Tenants activos preparados: '+ready+'/'+active.length);
}

`;

export function applyV26181RuntimeStabilityPatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    'let v2618GatewayShuttingDown=false;\n',
    'let v2618GatewayShuttingDown=false;\n' + runtimeHelpers,
    'helpers de parada intencional',
  );

  patched = replaceBetween(
    patched,
    'async function v2618BootTenants(){',
    'function v2618CleanupMasterSessions()',
    sequentialBoot,
    'boot secuencial de tenants',
  );

  patched = replaceOnce(
    patched,
    "      proc.once('exit',(code,signal)=>{\n        if(children.get(slug)?.proc===proc)children.delete(slug);\n        if(v2618GatewayShuttingDown)return;\n        console.warn('[tenant:'+slug+'] proceso finalizado (code='+(code??'null')+', signal='+(signal||'none')+').');\n        v2618ScheduleRespawn(c,'process-exit');\n      });",
    "      proc.once('error',(error)=>{console.error('[tenant:'+slug+'] error de proceso:',error?.message||error);});\n      proc.once('exit',(code,signal)=>{\n        if(children.get(slug)?.proc===proc)children.delete(slug);\n        const intentional=v26181IntentionalStops.delete(slug);\n        if(v2618GatewayShuttingDown||intentional)return;\n        console.warn('[tenant:'+slug+'] proceso finalizado (code='+(code??'null')+', signal='+(signal||'none')+').');\n        v2618ScheduleRespawn(c,'process-exit');\n      });",
    'salida de tenant sin respawn duplicado',
  );

  patched = replaceOnce(
    patched,
    "      const r=p.match(/^\\/api\\/gateway\\/master\\/companies\\/([^/]+)\\/restart$/);if(r&&req.method==='POST'){const c=cfg.companies.find(x=>x.slug===r[1]);if(!c)return json(res,404,{error:'Empresa no encontrada.'});const child=children.get(c.slug);if(child?.proc&&!child.proc.killed)child.proc.kill('SIGTERM');children.delete(c.slug);await ensureTenant(c);return json(res,200,{ok:true})}",
    "      const r=p.match(/^\\/api\\/gateway\\/master\\/companies\\/([^/]+)\\/restart$/);if(r&&req.method==='POST'){const c=cfg.companies.find(x=>x.slug===r[1]);if(!c)return json(res,404,{error:'Empresa no encontrada.'});await v26181RestartTenant(c);return json(res,200,{ok:true})}",
    'reinicio seguro de tenant',
  );

  return patched;
}
