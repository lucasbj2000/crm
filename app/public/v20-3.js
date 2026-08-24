/* V20.3 · Administrador Inteligente del CRM */
(() => {
  let adminData=null, automationData=null, injected=false;
  const adminOnly=()=>appState?.currentUser?.role==='admin';
  const riskLabel=(risk)=>({low:'Bajo',medium:'Medio',high:'Alto',destructive:'Destructivo'}[risk]||risk||'—');
  const modeLabel=(mode)=>({automatic:'Automático',confirm:'Confirmación',special_confirm:'Confirmación especial',blocked:'Bloqueado'}[mode]||mode||'—');

  function inject(){
    if(injected||document.querySelector('#v203-admin-center'))return;
    const advanced=document.querySelector('[data-view-panel="advanced"]'); if(!advanced)return;
    injected=true;
    const section=document.createElement('section'); section.id='v203-admin-center';section.className='v203-center';section.hidden=true;
    section.innerHTML=`
      <article class="panel v203-hero">
        <div><p class="kicker">V20.3 · ADMINISTRADOR INTELIGENTE DEL CRM</p><h2>Control total, explicable y restaurable</h2><p>La Super IA ahora administra estructuras del CRM con poderes por riesgo, debugger, supervisor permanente, detección de conflictos y versiones restaurables.</p></div>
        <div class="v203-badges"><span>↶ Rollback</span><span>⌁ Debugger</span><span>◉ Supervisor</span><span>⚑ Riesgo</span></div>
      </article>
      <div class="v203-metrics">
        <article><small>Hallazgos activos</small><strong id="v203-findings-count">0</strong><span id="v203-findings-detail">Supervisor sin ejecutar</span></article>
        <article><small>Versiones restaurables</small><strong id="v203-version-count">0</strong><span>Configuración protegida</span></article>
        <article><small>Estructuras IA</small><strong id="v203-object-count">0</strong><span>Flujos · módulos · subflujos</span></article>
        <article><small>Último análisis</small><strong id="v203-last-scan">—</strong><span>Supervisor automático</span></article>
      </div>
      <div class="v203-grid two">
        <article class="panel v203-power"><div class="panel-title"><div><p class="kicker">PODERES POR RIESGO</p><h3>Qué puede aplicar sin preguntarte</h3><p>Configurá la autonomía de la Super IA según el impacto del cambio.</p></div></div><div id="v203-power-grid" class="v203-power-grid"></div><div class="inline-actions"><button id="v203-save-power" class="button primary" type="button">Guardar poderes</button></div></article>
        <article class="panel"><div class="panel-title"><div><p class="kicker">DEBUGGER IA</p><h3>¿Por qué pasó esto?</h3><p>Reconstruye disparador, condiciones, acciones, error y cambios realizados.</p></div></div><div class="form-grid"><label><span>Regla</span><select id="v203-debug-rule"><option value="">Seleccionar regla</option></select></label><label><span>Ejecución</span><select id="v203-debug-run"><option value="">Última de la regla</option></select></label></div><div class="inline-actions"><button id="v203-debug" class="button primary" type="button">⌁ Analizar ejecución</button></div><div id="v203-debug-result" class="v203-debug-result"></div></article>
      </div>
      <div class="v203-grid two">
        <article class="panel"><div class="panel-title"><div><p class="kicker">SUPERVISOR PERMANENTE</p><h3>Problemas antes de que escalen</h3><p>Busca reglas rotas, conflictos, duplicados, clientes abandonados, stock crítico, sobrecarga y permisos amplios.</p></div><button id="v203-scan" class="button primary" type="button">◉ Analizar ahora</button></div><div id="v203-findings" class="v203-findings"></div></article>
        <article class="panel"><div class="panel-title"><div><p class="kicker">VERSIONADO Y ROLLBACK</p><h3>Volver a una configuración anterior</h3><p>Antes de cambios administrativos se guarda una versión restaurable.</p></div><button id="v203-refresh" class="button ghost" type="button">↻</button></div><div id="v203-versions" class="v203-versions"></div></article>
      </div>
      <article class="panel"><div class="panel-title"><div><p class="kicker">EDITOR TOTAL DEL CRM</p><h3>Estructuras creadas por lenguaje natural</h3><p>Flujos, etapas, módulos personalizados, subflujos reutilizables, dashboards, perfiles de rol y políticas IA.</p></div></div><div class="v203-tabs" id="v203-tabs"><button data-tab="flows" class="active">Flujos</button><button data-tab="subflows">Subflujos</button><button data-tab="customModules">Módulos</button><button data-tab="dashboards">Dashboards</button><button data-tab="roleProfiles">Roles</button><button data-tab="aiPolicies">Políticas IA</button></div><div id="v203-objects" class="v203-objects"></div></article>
      <article class="panel v203-capabilities"><p class="kicker">CAPACIDADES V20.3</p><div><span>Memoria de automatización</span><span>Variables calculadas</span><span>Acciones de varios días</span><span>Cancelación inteligente</span><span>Subflujos reutilizables</span><span>SLA y tareas vencidas</span><span>WhatsApp desconectado</span><span>Conflictos preventivos</span><span>Reparación asistida</span><span>Explicabilidad total</span></div></article>`;
    (document.querySelector('#v202-super-automation')||advanced.querySelector('.advanced-v20-hero'))?.insertAdjacentElement('afterend',section);
    $('#v203-save-power')?.addEventListener('click',()=>void savePower());
    $('#v203-debug')?.addEventListener('click',()=>void runDebug());
    $('#v203-debug-rule')?.addEventListener('change',renderRunOptions);
    $('#v203-scan')?.addEventListener('click',()=>void scan());
    $('#v203-refresh')?.addEventListener('click',()=>void load(true));
    $('#v203-findings')?.addEventListener('click',(e)=>void findingAction(e));
    $('#v203-versions')?.addEventListener('click',(e)=>void versionAction(e));
    $('#v203-tabs')?.addEventListener('click',(e)=>{const b=e.target.closest('[data-tab]');if(!b)return;document.querySelectorAll('#v203-tabs button').forEach(x=>x.classList.toggle('active',x===b));renderObjects(b.dataset.tab);});
  }

  async function load(show=false){
    if(!adminOnly())return;
    try{[adminData,automationData]=await Promise.all([api('/api/admin/super-admin'),api('/api/admin/super-automation')]);render();if(show)showToast('Centro V20.3 actualizado');}
    catch(e){if(show)showToast(e.message,'warning');}
  }

  function render(){
    if(!adminData)return;
    const findings=adminData.findings||[], versions=adminData.versions||[];
    const objects=['flows','subflows','customModules','dashboards','roleProfiles','aiPolicies'].reduce((n,k)=>n+(adminData[k]||[]).length,0);
    $('#v203-findings-count').textContent=findings.length;$('#v203-version-count').textContent=versions.length;$('#v203-object-count').textContent=objects;
    $('#v203-last-scan').textContent=adminData.runtime?.lastScanAt?formatDate(adminData.runtime.lastScanAt):'—';
    const high=findings.filter(f=>f.severity==='high').length;$('#v203-findings-detail').textContent=high?`${high} de prioridad alta`:'Sin alertas altas';
    renderPower();renderRules();renderFindings();renderVersions();renderObjects(document.querySelector('#v203-tabs .active')?.dataset.tab||'flows');
  }

  function renderPower(){
    const policy=adminData.settings?.powerPolicy||{};
    $('#v203-power-grid').innerHTML=['low','medium','high','destructive'].map(r=>`<label class="v203-power-row ${r}"><div><b>${riskLabel(r)}</b><small>${r==='low'?'Tareas, etiquetas, campos, dashboards':r==='medium'?'Etapas, responsables, flujos, módulos':r==='high'?'Stock, líneas, roles, WhatsApp':'Eliminaciones y cierres críticos'}</small></div><select data-risk="${r}"><option value="automatic" ${policy[r]==='automatic'?'selected':''}>Automático</option><option value="confirm" ${policy[r]==='confirm'?'selected':''}>Confirmar</option><option value="special_confirm" ${policy[r]==='special_confirm'?'selected':''}>Confirmación especial</option><option value="blocked" ${policy[r]==='blocked'?'selected':''}>Bloquear</option></select></label>`).join('');
  }

  async function savePower(){
    try{const powerPolicy={};document.querySelectorAll('#v203-power-grid [data-risk]').forEach(x=>powerPolicy[x.dataset.risk]=x.value);const r=await api('/api/admin/super-admin/settings',{method:'POST',body:JSON.stringify({powerPolicy})});if(r.state)setState(r.state);await load();showToast('Poderes de la Super IA guardados');}catch(e){showToast(e.message,'warning');}
  }

  function renderRules(){
    const rules=automationData?.rules||[];$('#v203-debug-rule').innerHTML='<option value="">Seleccionar regla</option>'+rules.map(r=>`<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join('');renderRunOptions();
  }
  function renderRunOptions(){
    const ruleId=$('#v203-debug-rule')?.value||'';const runs=(automationData?.executions||[]).filter(x=>!ruleId||x.ruleId===ruleId);$('#v203-debug-run').innerHTML='<option value="">Última / estructura</option>'+runs.slice(0,100).map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(formatDate(x.startedAt))} · ${escapeHtml(x.status||'')}</option>`).join('');
  }

  async function runDebug(){
    const ruleId=$('#v203-debug-rule').value||null,executionId=$('#v203-debug-run').value||null;if(!ruleId&&!executionId){showToast('Seleccioná una regla o ejecución','warning');return;}
    $('#v203-debug-result').innerHTML='<div class="v203-loading">Analizando trazabilidad…</div>';
    try{const d=await api('/api/admin/super-admin/debug',{method:'POST',body:JSON.stringify({ruleId,executionId})});const e=d.explanation||{};$('#v203-debug-result').innerHTML=`<div class="v203-explain"><b>${escapeHtml(d.rule?.name||'Ejecución')}</b><p>${escapeHtml(d.cause||'Sin errores detectados.')}</p><dl><dt>Qué hizo</dt><dd>${escapeHtml(e.what||'—')}</dd><dt>Disparador</dt><dd>${escapeHtml(typeof e.trigger==='string'?e.trigger:JSON.stringify(e.trigger||{}))}</dd><dt>Condiciones</dt><dd>${escapeHtml((e.conditions||[]).length?JSON.stringify(e.conditions):'Sin condiciones adicionales')}</dd><dt>Cambios</dt><dd>${escapeHtml((e.changed||[]).map(x=>x.type).join(' → ')||'Sin cambios registrados')}</dd></dl>${(d.conflicts||[]).length?`<div class="v203-warning">⚠ ${d.conflicts.length} conflicto(s) potencial(es) con otras reglas.</div>`:''}</div>`;}catch(e){$('#v203-debug-result').innerHTML=`<div class="v203-warning">${escapeHtml(e.message)}</div>`;}
  }

  function renderFindings(){
    const list=adminData.findings||[];$('#v203-findings').innerHTML=list.length?list.slice(0,80).map(f=>`<article class="v203-finding ${escapeHtml(f.severity||'medium')}" data-rule-id="${escapeHtml(f.ruleId||'')}"><span>${f.severity==='high'?'!':'i'}</span><div><b>${escapeHtml(f.title)}</b><p>${escapeHtml(f.detail||'')}</p><small>${escapeHtml(f.suggestion||'')}</small></div>${f.ruleId?'<button class="button ghost tiny" data-action="debug">Debugger</button>':''}${f.ruleId&&f.type==='rule_error'?'<button class="button primary tiny" data-action="repair">Reparar</button>':''}</article>`).join(''):'<div class="ai-empty">No hay hallazgos activos. Ejecutá el supervisor para verificar el CRM.</div>';
  }
  async function scan(){const b=$('#v203-scan');b.disabled=true;b.textContent='Analizando…';try{const r=await api('/api/admin/super-admin/supervisor/scan',{method:'POST',body:'{}'});adminData.findings=r.findings||[];adminData.runtime={...(adminData.runtime||{}),...(r.runtime||{})};render();showToast(`Supervisor: ${r.findings?.length||0} hallazgos`);}catch(e){showToast(e.message,'warning');}finally{b.disabled=false;b.textContent='◉ Analizar ahora';}}
  async function findingAction(e){const row=e.target.closest('[data-rule-id]'),action=e.target.closest('[data-action]')?.dataset.action;if(!row||!action)return;const id=row.dataset.ruleId;if(action==='debug'){$('#v203-debug-rule').value=id;renderRunOptions();await runDebug();document.querySelector('#v203-debug-result')?.scrollIntoView({behavior:'smooth',block:'center'});}if(action==='repair'){if(!await confirmAction('Reparación asistida','La Super IA corregirá referencias rotas de bajo riesgo. Se guardará una versión anterior.'))return;try{const r=await api(`/api/admin/super-admin/repair/${encodeURIComponent(id)}`,{method:'POST',body:'{}'});if(r.state)setState(r.state);showToast((r.changes||[]).join(' '));await load();}catch(err){showToast(err.message,'warning');}}}

  function renderVersions(){const list=adminData.versions||[];$('#v203-versions').innerHTML=list.length?list.slice(0,30).map(v=>`<div class="v203-version" data-version-id="${escapeHtml(v.id)}"><div><b>${escapeHtml(v.reason||'Versión')}</b><small>${escapeHtml(formatDate(v.createdAt))} · ${escapeHtml(v.createdByName||'Administrador')}</small></div><button class="button ghost tiny" data-action="restore">↶ Restaurar</button></div>`).join(''):'<div class="ai-empty">Las versiones aparecerán antes del próximo cambio administrativo.</div>';}
  async function versionAction(e){const row=e.target.closest('[data-version-id]'),action=e.target.closest('[data-action]')?.dataset.action;if(!row||action!=='restore')return;if(!await confirmAction('Restaurar configuración','Se restaurarán reglas, estructuras, campos, líneas y políticas de esa versión. Antes se guardará una copia del estado actual.'))return;try{const r=await api(`/api/admin/super-admin/rollback/${encodeURIComponent(row.dataset.versionId)}`,{method:'POST',body:'{}'});if(r.state)setState(r.state);await load();showToast('Configuración restaurada');}catch(err){showToast(err.message,'warning');}}

  function renderObjects(tab){const list=adminData?.[tab]||[];const copy={flows:'Flujo',subflows:'Subflujo',customModules:'Módulo',dashboards:'Dashboard',roleProfiles:'Perfil',aiPolicies:'Política IA'}[tab]||'Objeto';$('#v203-objects').innerHTML=list.length?list.map(x=>`<article><span>${copy}</span><b>${escapeHtml(x.name||x.scope||'Sin nombre')}</b><small>${escapeHtml(x.description||x.instructions||x.baseRole||'Configurado por Super IA')}</small>${tab==='flows'?`<div class="v203-stage-chain">${(x.stages||[]).map(s=>`<i>${escapeHtml(s.name||s)}</i>`).join('<em>→</em>')}</div>`:''}${tab==='subflows'?`<div class="v203-stage-chain">${(x.actions||[]).map(a=>`<i>${escapeHtml(a.type)}</i>`).join('<em>→</em>')}</div>`:''}${tab==='customModules'?`<small>${(x.fields||[]).length} campos · ${(x.statuses||[]).length} estados</small>`:''}${tab==='dashboards'?`<small>${(x.kpis||[]).join(' · ')}</small>`:''}</article>`).join(''):`<div class="ai-empty">Todavía no hay ${copy.toLowerCase()}s creados. Pedíselo a la Super IA arriba en lenguaje natural.</div>`;}

  function renderV203(){inject();const el=$('#v203-admin-center');if(!el)return;el.hidden=!adminOnly();if(adminOnly()&&currentView==='advanced')void load();}
  document.addEventListener('DOMContentLoaded',()=>{inject();renderV203();});
  const prevRender=renderAll;renderAll=function(){prevRender();renderV203();};
  const prevSwitch=switchView;switchView=function(view){prevSwitch(view);if(view==='advanced'&&adminOnly())void load();};
})();
