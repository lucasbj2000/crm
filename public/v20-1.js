/* V24 · Multi-línea WhatsApp central + diagnóstico Suite IA */
(() => {
  let lineCatalog = [];
  let linePollTimer = null;
  let aiStatus = null;

  const lineStatusLabel = (status) => ({connected:'Conectada',qr:'Esperando QR',starting:'Iniciando',connecting:'Conectando',reconnecting:'Reconectando',disconnected:'Desconectada',error:'Error'})[status] || status || 'Desconectada';
  const lineStatusTone = (status) => status === 'connected' ? 'ok' : ['qr','starting','connecting','reconnecting'].includes(status) ? 'wait' : status === 'error' ? 'bad' : 'off';
  const roleLabel = (role) => ({admin:'Administrador',manager:'Gerente',supervisor:'Jefe',agent:'Agente'})[role] || role;

  function injectMultiLineView() {
    if (document.querySelector('[data-view="whatsappLines"]')) return;
    const branchNav = document.querySelector('[data-view="branches"]');
    const nav = document.createElement('button');
    nav.className = 'nav-item'; nav.type = 'button'; nav.dataset.view = 'whatsappLines'; nav.dataset.module = 'whatsapp';
    nav.innerHTML = '<span>◉</span><b>Líneas WhatsApp</b><i id="nav-line-count">0</i>';
    branchNav?.parentNode?.insertBefore(nav, branchNav);
    nav.addEventListener('click', () => switchView('whatsappLines'));

    const branchView = document.querySelector('[data-view-panel="branches"]');
    const section = document.createElement('section'); section.className = 'view'; section.dataset.viewPanel = 'whatsappLines';
    section.innerHTML = `
      <div class="section-heading multiline-heading">
        <div><p class="kicker">MULTI-LÍNEA WHATSAPP · V24</p><h2>Números, permisos y enrutamiento</h2><p>Administrá varias líneas desde el servidor central. Cada número conserva su propia sesión, QR o Cloud API, usuarios autorizados, BOT y conversaciones.</p></div>
        <div class="heading-actions"><button class="button ghost" id="line-refresh" type="button">↻ Actualizar</button><button class="button primary" id="line-new" type="button">＋ Nueva línea</button></div>
      </div>
      <div class="multiline-summary" id="multiline-summary"></div>
      <article class="panel multiline-help"><span>i</span><div><b>Cómo funciona</b><p>Cuando un cliente escribe a un número, la negociación queda asociada a esa línea. Solo los usuarios habilitados para esa línea pueden verla y responderla. Si una línea se marca como predeterminada, también se usa para nuevas operaciones internas de esa sucursal.</p></div></article>
      <div class="whatsapp-line-grid" id="whatsapp-line-grid"></div>`;
    branchView?.parentNode?.insertBefore(section, branchView);

    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="whatsapp-line-dialog"><form id="whatsapp-line-form" class="dialog-card whatsapp-line-dialog">
        <header><div><p class="kicker">LÍNEA DE WHATSAPP</p><h3 id="line-dialog-title">Nueva línea</h3><small>Definí el número, la sucursal y quién puede utilizarlo.</small></div><button class="icon-button close" type="button" data-dialog-close>×</button></header>
        <input id="line-id" type="hidden">
        <div class="form-grid"><label><span>Nombre de la línea *</span><input id="line-name" maxlength="120" required placeholder="Ej.: Ventas Casa Central"></label><label><span>Sucursal *</span><select id="line-branch" required></select></label></div>
        <div class="form-grid"><label><span>Conexión</span><select id="line-provider"><option value="qr">WhatsApp por QR</option><option value="cloud">WhatsApp Cloud API</option></select></label><label><span>Número / referencia</span><input id="line-phone" maxlength="40" placeholder="Ej.: +595981123456"></label></div>
        <div class="form-grid"><label><span>Acceso de usuarios</span><select id="line-access"><option value="selected">Solo usuarios seleccionados</option><option value="all">Todos los usuarios activos</option></select></label><label><span>Notas internas</span><input id="line-notes" maxlength="500" placeholder="Ej.: Línea exclusiva para Ventas"></label></div>
        <section class="line-user-selector" id="line-user-selector"><div class="panel-title"><div><p class="kicker">USUARIOS AUTORIZADOS</p><h4>Quién puede atender este número</h4></div><span id="line-user-count">0 seleccionados</span></div><div id="line-user-list" class="line-user-list"></div></section>
        <div class="line-toggle-grid">
          <label class="switch-row"><input id="line-supervisors" type="checkbox" checked><span><b>Jefes</b><small>Permitir a jefes de la sucursal usar la línea.</small></span></label>
          <label class="switch-row"><input id="line-managers" type="checkbox" checked><span><b>Gerencia</b><small>Permitir a gerencia usar la línea según su ámbito.</small></span></label>
          <label class="switch-row"><input id="line-bot" type="checkbox" checked><span><b>BOT activo</b><small>El BOT puede responder clientes de esta línea.</small></span></label>
          <label class="switch-row"><input id="line-default" type="checkbox"><span><b>Línea predeterminada</b><small>Usarla por defecto dentro de la sucursal.</small></span></label>
          <label class="switch-row"><input id="line-active" type="checkbox" checked><span><b>Línea activa</b><small>Habilitar recepción, envío y asignación.</small></span></label>
        </div>
        <section class="line-cloud-fields" id="line-cloud-fields" hidden>
          <p class="kicker">CLOUD API</p><div class="form-grid"><label><span>Phone Number ID</span><input id="line-cloud-phone-id" maxlength="80"></label><label><span>Business Account ID</span><input id="line-cloud-business-id" maxlength="80"></label></div>
          <div class="form-grid"><label><span>Versión API</span><input id="line-cloud-version" maxlength="20" value="v23.0"></label><label><span>Access Token</span><input id="line-cloud-token" type="password" autocomplete="new-password" placeholder="Dejar vacío para conservar"></label></div>
          <label><span>Verify Token del webhook</span><input id="line-cloud-verify" type="password" autocomplete="new-password" placeholder="Dejar vacío para conservar"></label>
          <div class="notice"><span>!</span><p>Los tokens no se muestran nuevamente. Si editás una línea y dejás estos campos vacíos, se conservan los valores guardados.</p></div>
        </section>
        <footer><button class="button ghost" type="button" data-dialog-close>Cancelar</button><button class="button primary" type="submit">Guardar línea</button></footer>
      </form></dialog>`);

    $('#line-new')?.addEventListener('click', () => openLineDialog());
    $('#line-refresh')?.addEventListener('click', () => void fetchLines(true));
    $('#line-provider')?.addEventListener('change', updateLineFormVisibility);
    $('#line-access')?.addEventListener('change', updateLineFormVisibility);
    $('#line-branch')?.addEventListener('change', () => renderLineUsers());
    $('#line-user-list')?.addEventListener('change', updateLineUserCount);
    $('#whatsapp-line-form')?.addEventListener('submit', saveLine);
    $('#whatsapp-line-grid')?.addEventListener('click', handleLineAction);
  }

  function injectAiRepairPanel() {
    const advanced = document.querySelector('[data-view-panel="advanced"]');
    if (!advanced || $('#v201-ai-diagnostics')) return;
    const hero = advanced.querySelector('.advanced-v20-hero');
    hero?.insertAdjacentHTML('afterend', `
      <article class="panel v201-ai-diagnostics" id="v201-ai-diagnostics">
        <div class="panel-title"><div><p class="kicker">DIAGNÓSTICO IA · V20.1</p><h3>Estado real de la Suite Avanzada</h3><p>La Suite ahora informa si trabaja con IA generativa o con el motor local y muestra el error real cuando una conexión falla.</p></div><div class="inline-actions"><button class="button ghost" id="v201-ai-refresh" type="button">↻ Estado</button><button class="button dark" id="v201-ai-test" type="button">✦ Probar conexión</button></div></div>
        <div class="ai-health-grid" id="v201-ai-health"><div class="ai-empty">Consultando estado…</div></div>
      </article>
      <div class="v20-grid v201-ai-tools">
        <article class="panel"><div class="panel-title"><div><p class="kicker">AGENTES IA ESPECIALIZADOS</p><h3>Consultá a un especialista</h3><p>Seleccioná el perfil más adecuado para el análisis.</p></div></div><div class="form-grid"><label><span>Especialista</span><select id="v201-specialist"><option value="commercial">Comercial</option><option value="sac">Atención / SAC</option><option value="supervisor">Supervisor</option><option value="stock">Stock</option><option value="quality">Calidad</option><option value="campaigns">Campañas</option><option value="management">Gerencia</option></select></label><label><span>Consulta</span><input id="v201-specialist-question" maxlength="3000" placeholder="Ej.: ¿qué oportunidades requieren seguimiento hoy?"></label></div><div class="inline-actions"><button class="button primary" id="v201-specialist-send" type="button">✦ Consultar especialista</button></div><div id="v201-specialist-result" class="v201-ai-result"></div></article>
        <article class="panel"><div class="panel-title"><div><p class="kicker">ACCIONES EN LENGUAJE NATURAL</p><h3>Preparar sin ejecutar</h3><p>La IA interpreta la instrucción y devuelve una propuesta segura para revisión humana.</p></div></div><textarea id="v201-natural-action" rows="4" maxlength="3000" placeholder="Creame una tarea para mañana para llamar a este cliente y confirmar la cotización."></textarea><div class="inline-actions"><button class="button dark" id="v201-natural-preview" type="button">✦ Preparar acción</button></div><div id="v201-natural-result" class="v201-ai-result"></div></article>
      </div>`);
    $('#v201-ai-refresh')?.addEventListener('click', () => void loadAiStatus());
    $('#v201-ai-test')?.addEventListener('click', () => void testAiConnection());
    $('#v201-specialist-send')?.addEventListener('click', () => void askSpecialist());
    $('#v201-natural-preview')?.addEventListener('click', () => void previewNaturalAction());
  }

  async function fetchLines(toast=false) {
    if (!authenticated || !appState?.currentUser) return;
    try {
      const result = await api('/api/whatsapp-lines');
      lineCatalog = result.lines || [];
      appState.whatsappLines = lineCatalog;
      renderLines();
      if (toast) showToast('Líneas actualizadas');
    } catch (e) { if (toast) showToast(e.message, 'warning'); }
  }

  function visibleLineUsers() {
    return (appState?.users || []).filter(u => u.active !== false && u.role !== 'admin');
  }
  function authorizedNames(line) {
    const ids = new Set(line.allowedUserIds || []);
    return (appState?.users || []).filter(u => ids.has(u.id)).map(u => u.name || u.username);
  }
  function renderLines() {
    if (!$('#whatsapp-line-grid')) return;
    const lines = lineCatalog.length ? lineCatalog : (appState?.whatsappLines || []);
    const connected = lines.filter(l => l.connection?.status === 'connected').length;
    const qr = lines.filter(l => l.provider === 'qr').length;
    const cloud = lines.filter(l => l.provider === 'cloud').length;
    $('#nav-line-count').textContent = String(lines.length);
    $('#multiline-summary').innerHTML = `<article><span>◉</span><div><small>Líneas visibles</small><strong>${lines.length}</strong></div></article><article><span>●</span><div><small>Conectadas</small><strong>${connected}</strong></div></article><article><span>⌁</span><div><small>QR</small><strong>${qr}</strong></div></article><article><span>☁</span><div><small>Cloud API</small><strong>${cloud}</strong></div></article>`;
    const admin = appState?.currentUser?.role === 'admin';
    $('#line-new').hidden = !admin;
    $('#whatsapp-line-grid').innerHTML = lines.length ? lines.map(line => {
      const status = line.connection?.status || 'disconnected'; const names = authorizedNames(line); const selected = line.accessMode === 'selected';
      const canConnect = ['admin','manager','supervisor'].includes(appState.currentUser?.role) && line.canUse !== false;
      return `<article class="panel whatsapp-line-card ${lineStatusTone(status)}" data-line-id="${escapeHtml(line.id)}">
        <div class="line-card-top"><div class="line-icon">◉</div><div><div class="line-title-row"><h3>${escapeHtml(line.name)}</h3>${line.isDefault?'<span class="line-default-badge">Predeterminada</span>':''}${line.legacyBranchSession?'<span class="line-legacy-badge">Migrada</span>':''}</div><small>${escapeHtml(line.branchName || 'Sucursal')} · ${line.provider === 'cloud' ? 'Cloud API' : 'QR independiente'}</small></div><span class="line-state ${lineStatusTone(status)}"><i></i>${escapeHtml(lineStatusLabel(status))}</span></div>
        <div class="line-number"><small>Número</small><strong>${escapeHtml(line.phone || line.connection?.account || 'Todavía sin identificar')}</strong></div>
        <div class="line-meta"><span>BOT ${line.botEnabled!==false?'✓':'—'}</span><span>${selected ? `${names.length} usuario${names.length===1?'':'s'} seleccionado${names.length===1?'':'s'}` : 'Todos los usuarios activos'}</span><span>${line.active!==false?'Activa':'Inactiva'}</span></div>
        ${selected ? `<div class="line-allowed"><b>Autorizados:</b> ${escapeHtml(names.join(', ') || 'Ningún agente seleccionado')}</div>` : ''}
        ${line.connection?.error ? `<div class="campaign-warning">${escapeHtml(line.connection.error)}</div>` : ''}
        ${status === 'qr' && line.connection?.qr ? `<div class="line-qr"><img src="${line.connection.qr}" alt="QR de ${escapeHtml(line.name)}"><div><b>Escaneá este QR</b><small>WhatsApp → Dispositivos vinculados → Vincular dispositivo.</small></div></div>` : ''}
        <div class="line-card-actions">${canConnect && status !== 'connected' ? `<button class="button primary" data-line-action="connect" type="button">${status === 'qr' ? 'Regenerar QR' : 'Conectar'}</button>` : ''}${canConnect && status === 'connected' && line.provider === 'qr' ? '<button class="button ghost" data-line-action="disconnect" type="button">Desconectar</button>' : ''}${admin ? '<button class="button ghost" data-line-action="edit" type="button">Configurar</button>' : ''}${admin && !line.legacyBranchSession ? '<button class="button danger-outline" data-line-action="delete" type="button">Eliminar</button>' : ''}</div>
      </article>`;
    }).join('') : '<div class="empty-state compact"><span>◉</span><h4>No hay líneas visibles</h4><p>Administración puede crear la primera línea adicional.</p></div>';
  }

  function renderLineUsers(selectedIds=null) {
    const users = visibleLineUsers(); const ids = selectedIds || new Set($$('#line-user-list input:checked').map(x => x.value));
    $('#line-user-list').innerHTML = users.length ? users.map(u => `<label class="line-user-row"><input type="checkbox" value="${escapeHtml(u.id)}" ${ids.has(u.id)?'checked':''}><span><b>${escapeHtml(u.name || u.username)}</b><small>${escapeHtml(roleLabel(u.role))} · ${escapeHtml(u.branchName || 'Administración general')}</small></span></label>`).join('') : '<div class="ai-empty">Todavía no hay usuarios activos para asignar.</div>';
    updateLineUserCount(); updateLineFormVisibility();
  }
  function updateLineUserCount() { const count = $$('#line-user-list input:checked').length; if ($('#line-user-count')) $('#line-user-count').textContent = `${count} seleccionado${count===1?'':'s'}`; }
  function updateLineFormVisibility() { if ($('#line-cloud-fields')) $('#line-cloud-fields').hidden = $('#line-provider')?.value !== 'cloud'; if ($('#line-user-selector')) $('#line-user-selector').hidden = $('#line-access')?.value !== 'selected'; }

  function openLineDialog(line=null) {
    if (appState?.currentUser?.role !== 'admin') return;
    const branches = (appState.branches || []).filter(b => b.active !== false);
    $('#whatsapp-line-form').reset(); $('#line-id').value = line?.id || ''; $('#line-dialog-title').textContent = line ? `Configurar ${line.name}` : 'Nueva línea';
    $('#line-branch').innerHTML = branches.map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join('');
    $('#line-branch').value = line?.branchId || appState.currentUser?.branchId || branches[0]?.id || ''; $('#line-branch').disabled = Boolean(line);
    $('#line-name').value = line?.name || ''; $('#line-provider').value = line?.provider || 'qr'; $('#line-provider').disabled = line?.legacyBranchSession === true;
    $('#line-phone').value = line?.phone || ''; $('#line-access').value = line?.accessMode === 'all' ? 'all' : 'selected'; $('#line-notes').value = line?.notes || '';
    $('#line-supervisors').checked = line?.supervisorsCanUse !== false; $('#line-managers').checked = line?.managersCanUse !== false; $('#line-bot').checked = line?.botEnabled !== false; $('#line-default').checked = line?.isDefault === true; $('#line-active').checked = line?.active !== false;
    $('#line-cloud-phone-id').value = line?.cloud?.phoneNumberId || ''; $('#line-cloud-business-id').value = line?.cloud?.businessAccountId || ''; $('#line-cloud-version').value = line?.cloud?.apiVersion || 'v23.0'; $('#line-cloud-token').value = ''; $('#line-cloud-verify').value = '';
    renderLineUsers(new Set(line?.allowedUserIds || [])); updateLineFormVisibility(); $('#whatsapp-line-dialog').showModal();
  }

  async function saveLine(event) {
    event.preventDefault(); const id = $('#line-id').value; const allowedUserIds = $$('#line-user-list input:checked').map(x => x.value);
    const payload = {name:$('#line-name').value.trim(),branchId:$('#line-branch').value,provider:$('#line-provider').value,phone:$('#line-phone').value.trim(),accessMode:$('#line-access').value,allowedUserIds,supervisorsCanUse:$('#line-supervisors').checked,managersCanUse:$('#line-managers').checked,botEnabled:$('#line-bot').checked,isDefault:$('#line-default').checked,active:$('#line-active').checked,notes:$('#line-notes').value.trim(),cloud:{phoneNumberId:$('#line-cloud-phone-id').value.trim(),businessAccountId:$('#line-cloud-business-id').value.trim(),apiVersion:$('#line-cloud-version').value.trim()||'v23.0',accessToken:$('#line-cloud-token').value.trim(),verifyToken:$('#line-cloud-verify').value.trim()}};
    try { const next = await api(id ? `/api/whatsapp-lines/${encodeURIComponent(id)}` : '/api/whatsapp-lines',{method:id?'PUT':'POST',body:JSON.stringify(payload)}); setState(next); $('#whatsapp-line-dialog').close(); await fetchLines(); showToast(id?'Línea actualizada':'Línea creada'); }
    catch(e){ showToast(e.message,'warning'); }
  }

  async function handleLineAction(event) {
    const card = event.target.closest('[data-line-id]'); const action = event.target.closest('[data-line-action]')?.dataset.lineAction; if (!card || !action) return; const line = (lineCatalog.length?lineCatalog:appState.whatsappLines||[]).find(x => x.id === card.dataset.lineId); if (!line) return;
    if (action === 'edit') return openLineDialog(line);
    try {
      if (action === 'connect') { await api(`/api/whatsapp-lines/${encodeURIComponent(line.id)}/connect`,{method:'POST',body:JSON.stringify({force:line.connection?.status === 'qr'})}); showToast(line.connection?.status === 'qr' ? `Regenerando QR de ${line.name}…` : `Conectando ${line.name}…`); startLinePolling(); }
      if (action === 'disconnect') { await api(`/api/whatsapp-lines/${encodeURIComponent(line.id)}/disconnect`,{method:'POST',body:'{}'}); showToast(`${line.name} desconectada`); }
      if (action === 'delete') { if (!await confirmAction('Eliminar línea',`Se eliminará ${line.name}. Si tiene historial, quedará desactivada para conservar las negociaciones.`)) return; await api(`/api/whatsapp-lines/${encodeURIComponent(line.id)}`,{method:'DELETE'}); showToast('Línea eliminada/desactivada'); }
      await fetchLines();
    } catch(e){showToast(e.message,'warning');}
  }
  function startLinePolling() { clearInterval(linePollTimer); linePollTimer = setInterval(() => { if (currentView !== 'whatsappLines') { clearInterval(linePollTimer); return; } void fetchLines(); }, 2200); }

  async function loadAiStatus() {
    if (!authenticated) return;
    try { aiStatus = await api('/api/ai/status'); renderAiStatus(); } catch(e) { if ($('#v201-ai-health')) $('#v201-ai-health').innerHTML = `<div class="campaign-warning">${escapeHtml(e.message)}</div>`; }
  }
  function renderAiStatus() {
    if (!$('#v201-ai-health') || !aiStatus) return; const rt = aiStatus.runtime || {}; const ok = aiStatus.apiKeyConfigured && !rt.lastError;
    $('#v201-ai-test').hidden = appState?.currentUser?.role !== 'admin';
    $('#v201-ai-health').innerHTML = `<article><small>Modo actual</small><strong>${aiStatus.mode==='api'?'IA generativa':'Motor local'}</strong><em class="${ok?'ok':''}">${aiStatus.apiKeyConfigured?'API Key configurada':'Sin API Key'}</em></article><article><small>Modelo</small><strong>${escapeHtml(aiStatus.model||'—')}</strong><em>${escapeHtml(rt.lastEndpoint||'Sin prueba aún')}</em></article><article><small>Última latencia</small><strong>${rt.lastLatencyMs!=null?`${Number(rt.lastLatencyMs)} ms`:'—'}</strong><em>${rt.lastOkAt?escapeHtml(formatDate(rt.lastOkAt)):'Sin conexión confirmada'}</em></article><article class="ai-health-message"><small>Diagnóstico</small><strong>${escapeHtml(rt.lastError?'Última llamada con error':'Estado')}</strong><em>${escapeHtml(rt.lastError||aiStatus.message||'')}</em></article>`;
  }
  async function testAiConnection() { if (appState?.currentUser?.role !== 'admin') return; const btn=$('#v201-ai-test'); btn.disabled=true; btn.textContent='Probando…'; try { const r=await api('/api/ai/test',{method:'POST',body:'{}'}); aiStatus=r; renderAiStatus(); showToast(`IA operativa · ${r.endpoint||'API'}`); } catch(e) { showToast(e.message,'warning'); await loadAiStatus(); } finally {btn.disabled=false;btn.textContent='✦ Probar conexión';} }
  async function askSpecialist() { const q=$('#v201-specialist-question').value.trim(); if(!q)return; $('#v201-specialist-result').innerHTML='<div class="ai-empty">Analizando…</div>'; try{const r=await api('/api/ai/specialist',{method:'POST',body:JSON.stringify({specialist:$('#v201-specialist').value,question:q})});$('#v201-specialist-result').innerHTML=`<div class="v20-command-answer">${escapeHtml(r.answer||'').replace(/\n/g,'<br>')}</div>${r.warning?`<small class="v201-warning">${escapeHtml(r.warning)}</small>`:''}`;}catch(e){showToast(e.message,'warning');} }
  async function previewNaturalAction() { const instruction=$('#v201-natural-action').value.trim();if(!instruction)return;try{const r=await api('/api/ai/natural-action-preview',{method:'POST',body:JSON.stringify({instruction})});const p=r.preview||{};$('#v201-natural-result').innerHTML=`<div class="v201-action-preview"><span>${escapeHtml(String(p.risk||'low').toUpperCase())}</span><div><b>${escapeHtml(p.title||'Acción')}</b><small>${escapeHtml(p.instruction||'')}</small><em>Requiere confirmación humana · No ejecutada</em></div></div>`;}catch(e){showToast(e.message,'warning');} }

  function renderV201() {
    if (!appState) return;
    const lines = appState.whatsappLines || []; if (!lineCatalog.length) lineCatalog = lines;
    renderLines();
    if ($('#v201-ai-diagnostics') && currentView === 'advanced') void loadAiStatus();
  }

  injectMultiLineView(); injectAiRepairPanel();
  try { if (typeof viewCopy !== 'undefined') viewCopy.whatsappLines = ['Líneas WhatsApp','Números y permisos']; } catch {}
  const priorRenderAll = renderAll; renderAll = function(){ priorRenderAll(); renderV201(); };
  const priorSwitchView = switchView; switchView = function(view){ priorSwitchView(view); if(view==='whatsappLines'){void fetchLines();startLinePolling();} if(view==='advanced')void loadAiStatus(); };
})();
