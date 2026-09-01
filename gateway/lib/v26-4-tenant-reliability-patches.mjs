function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.4 Gateway: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.4 Gateway: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

export function applyV264TenantReliabilityPatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    "import { mkdir, readFile, writeFile } from 'node:fs/promises';",
    "import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';",
    "import rm para rollback de empresa",
  );

  patched = replaceOnce(
    patched,
    "const d=createInitialData();d.version=23;d.settings.branding=",
    "const d=createInitialData();d.version=23;d.settings.whatsappMode='qr';d.settings.qrReliability={enabled:true,preflightOnCreate:true,recoverStuckSessions:true};d.settings.externalCatalogs=[];d.settings.branding=",
    "defaults QR y catálogos de empresa nueva",
  );

  patched = replaceOnce(
    patched,
    "cfg.companies.push(c);await initTenantData(c,b);await saveConfig(cfg);return json(res,201,{company:c});",
    "cfg.companies.push(c);await initTenantData(c,b);await saveConfig(cfg);try{await ensureTenant(c);}catch(error){const running=children.get(c.slug);if(running?.proc&&!running.proc.killed)running.proc.kill('SIGTERM');children.delete(c.slug);cfg.companies=cfg.companies.filter(entry=>entry.slug!==c.slug);await saveConfig(cfg);await rm(absDataDir(c),{recursive:true,force:true}).catch(()=>{});return json(res,503,{error:'La empresa no superó la validación inicial del motor QR. No fue creada para evitar una instancia incompleta.',detail:clean(error?.message||error,500)});}return json(res,201,{company:c,runtimeReady:true,qrReady:true});",
    "preflight obligatorio al crear empresa",
  );

  return patched;
}
