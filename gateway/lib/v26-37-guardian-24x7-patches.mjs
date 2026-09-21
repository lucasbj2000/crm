function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.37 guardian gateway: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.37 guardian gateway: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

const guardianHelpers = String.raw`
const v2637TenantGuardianState = new Map();
const v2637TenantGuardianBusy = new Set();
let v2637TenantGuardianRunning = false;

function v2637GuardianRow(slug) {
  let row = v2637TenantGuardianState.get(slug);
  if (!row) {
    row = { failures:0, checks:0, restarts:0, lastCheckAt:null, lastOkAt:null, lastRestartAt:null, lastError:null };
    v2637TenantGuardianState.set(slug,row);
  }
  return row;
}

async function v2637CheckTenant(company) {
  if (!company?.slug || v2637GatewayShuttingDownSafe() || v2637TenantGuardianBusy.has(company.slug)) return;
  v2637TenantGuardianBusy.add(company.slug);
  const row = v2637GuardianRow(company.slug);
  row.checks += 1;
  row.lastCheckAt = new Date().toISOString();
  try {
    await ensureTenant(company);
    const response = await fetch('http://127.0.0.1:' + company.port + '/api/health', { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error('health HTTP ' + response.status);
    const payload = await response.json().catch(()=>({}));
    if (payload?.ok !== true) throw new Error('health inválido');
    row.failures = 0;
    row.lastOkAt = new Date().toISOString();
    row.lastError = null;
  } catch (error) {
    row.failures += 1;
    row.lastError = String(error?.message || error || 'tenant sin respuesta').slice(0,500);
    console.warn('[guardian 24/7 tenant:'+company.slug+'] fallo '+row.failures+'/3:',row.lastError);
    if (row.failures >= 3 && !v2618GatewayShuttingDown) {
      row.failures = 0;
      row.restarts += 1;
      row.lastRestartAt = new Date().toISOString();
      console.error('[guardian 24/7 tenant:'+company.slug+'] reiniciando proceso por falta de health.');
      await v26181RestartTenant(company);
    }
  } finally {
    v2637TenantGuardianBusy.delete(company.slug);
  }
}

function v2637GatewayShuttingDownSafe() {
  return Boolean(v2618GatewayShuttingDown);
}

async function v2637GuardianSweep() {
  if (v2637TenantGuardianRunning || v2618GatewayShuttingDown) return;
  v2637TenantGuardianRunning = true;
  try {
    const cfg = await loadConfig();
    for (const company of cfg.companies.filter(entry=>entry.active!==false)) {
      if (v2618GatewayShuttingDown) break;
      await v2637CheckTenant(company);
    }
  } catch (error) {
    console.error('[guardian 24/7 gateway]',error?.message||error);
  } finally {
    v2637TenantGuardianRunning = false;
  }
}

function v2637GuardianPublic() {
  const tenants = {};
  for (const [slug,row] of v2637TenantGuardianState.entries()) tenants[slug] = { ...row };
  return { intervalSeconds:30, failureThreshold:3, tenants };
}

const v2637TenantGuardianTimer = setInterval(()=>{ void v2637GuardianSweep(); },30_000);
v2637TenantGuardianTimer.unref?.();
const v2637TenantGuardianInitial = setTimeout(()=>{ void v2637GuardianSweep(); },15_000);
v2637TenantGuardianInitial.unref?.();
`;

export function applyV2637GatewayGuardianPatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    "const v2618MasterCleanupTimer=setInterval(v2618CleanupMasterSessions,30*60*1000);\nv2618MasterCleanupTimer.unref?.();",
    "const v2618MasterCleanupTimer=setInterval(v2618CleanupMasterSessions,30*60*1000);\nv2618MasterCleanupTimer.unref?.();\n" + guardianHelpers.trim(),
    "guardian permanente de tenants",
  );

  patched = replaceOnce(
    patched,
    "if(p==='/api/health')return json(res,200,{ok:true,gateway:true,companies:cfg.companies.filter(x=>x.active!==false).length});",
    "if(p==='/api/health')return json(res,200,{ok:true,gateway:true,companies:cfg.companies.filter(x=>x.active!==false).length,guardian:v2637GuardianPublic()});",
    "health del gateway con guardian",
  );

  patched = replaceOnce(
    patched,
    "for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{v2618GatewayShuttingDown=true;for(const timer of v2618RespawnTimers.values())clearTimeout(timer);v2618RespawnTimers.clear();clearInterval(v2618MasterCleanupTimer);for(const x of children.values())x.proc?.kill('SIGTERM');server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref()});",
    "for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{v2618GatewayShuttingDown=true;clearInterval(v2637TenantGuardianTimer);clearTimeout(v2637TenantGuardianInitial);for(const timer of v2618RespawnTimers.values())clearTimeout(timer);v2618RespawnTimers.clear();clearInterval(v2618MasterCleanupTimer);for(const x of children.values())x.proc?.kill('SIGTERM');server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref()});",
    "apagado limpio del guardian",
  );

  return patched;
}
