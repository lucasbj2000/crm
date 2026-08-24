/* V20.2 · Super IA de Automatizaciones Administrativas */
(() => {
  let superData = null;
  let injected = false;

  const adminOnly = () => appState?.currentUser?.role === 'admin';
  const stageName = (stage) => appState?.settings?.stageLabels?.[stage] || ({new:'Nuevos',contacted:'Contactados',waiting:'En espera',won:'Ganados',lost:'Perdidos',transferred:'Transferidos'}[stage] || stage || '—');

  function inject() {
    if (injected || document.querySelector('#v202-super-automation')) return;
    const advanced = document.querySelector('[data-view-panel="advanced"]');
    if (!advanced) return;
    injected = true;
    try { if (typeof moduleLabels !== 'undefined') moduleLabels.automationLab=['Super IA Administradora','Reglas y acciones en lenguaje natural']; if (typeof aiFeatureLabels !== 'undefined') aiFeatureLabels.automationGenerator=['Super IA de automatizaciones','Reglas activas en lenguaje natural']; } catch {}
    const anchor = document.querySelector('#v201-ai-diagnostics') || advanced.querySelector('.advanced-v20-hero');
    const wrapper = document.createElement('section');
    wrapper.id = 'v202-super-automation';
    wrapper.className = 'v202-super';
    wrapper.hidden = true;
    wrapper.innerHTML = `
      <article class="panel v202-super-hero">
        <div class="v202-orb">✦</div>
        <div class="v202-super-copy"><p class="kicker">SUPER IA · ADMINISTRADOR INTELIGENTE · V20.3</p><h2>CRM autoconfigurable con control por riesgo</h2><p>Escribí la regla como se la explicarías a una persona. La Super IA la convierte en una automatización activa: dispara por eventos, envía WhatsApp, espera retornos, bifurca acciones, cambia etapas, responsables, campos y configuración del CRM.</p></div>
        <div class="v202-super-state"><span id="v202-engine-dot"></span><strong id="v202-engine-state">Activa</strong><small id="v202-engine-detail">Ejecución directa</small></div>
      </article>
      <article class="panel v202-command">
        <div class="panel-title"><div><p class="kicker">INSTRUCCIÓN ADMINISTRATIVA</p><h3>Decile qué querés que haga el CRM</h3><p>No se crea una simulación. Si la instrucción genera una regla, queda <b>activa inmediatamente</b>. Si modifica una regla/configuración existente, el cambio se aplica en el momento.</p></div><span class="ops-shield">ADMIN</span></div>
        <textarea id="v202-instruction" rows="6" maxlength="6000" placeholder="Ej.: Cuando un cliente escriba 'quiero hablar con cobranzas', enviá desde la línea Casa Central el mensaje 'Recibimos tu solicitud'. Esperá su retorno 2 horas. Si responde 'sí', asignalo al jefe; si responde 'no', pasalo a En espera. Hacelo sin notificaciones."></textarea>
        <div class="v202-command-footer"><div class="v202-direct-note"><span>⚡</span><div><b>Ejecución directa</b><small>Las acciones externas pueden ser silenciosas, pero siempre quedan en auditoría para saber qué hizo la Super IA.</small></div></div><button id="v202-apply" class="button primary v202-apply" type="button">✦ Analizar / aplicar</button></div>
        <div id="v202-result" class="v202-result"></div>
      </article>
      <div class="v202-example-row" id="v202-examples">
        <button type="button" data-v202-example="Cuando cualquier cliente escriba &quot;precio mayorista&quot;, enviá por su misma línea el mensaje &quot;Hola {{cliente}}, recibimos tu consulta mayorista.&quot; sin notificaciones. Esperá su respuesta 60 minutos. Si responde &quot;sí&quot;, agregá la etiqueta Mayorista interesado y creá una tarea urgente para su responsable. Si responde &quot;no&quot;, pasá la negociación a En espera.">Respuesta + retorno</button>
        <button type="button" data-v202-example="Cuando un cliente con etiqueta VIP escriba &quot;reclamo&quot;, pausá el bot, asigná la negociación al jefe de su sucursal y creá una tarea urgente que diga &quot;Atender reclamo VIP de {{cliente}}&quot;.">Cliente VIP</button>
        <button type="button" data-v202-example="Cambiá el nombre visible de la etapa waiting a Seguimiento pendiente.">Modificar etapa</button>
        <button type="button" data-v202-example="Agregá un campo personalizado de negociación llamado Fecha prometida, clave fecha_prometida, tipo fecha, para registrar cuándo prometimos responder al cliente.">Crear campo</button>
      </div>
      <div class="v202-dashboard">
        <article class="panel v202-rules-panel"><div class="panel-title"><div><p class="kicker">REGLAS ACTIVAS</p><h3>Motor de automatización</h3></div><button class="button ghost" id="v202-refresh" type="button">↻ Actualizar</button></div><div id="v202-rules" class="v202-rule-list"></div></article>
        <article class="panel"><div class="panel-title"><div><p class="kicker">ESPERANDO RETORNO</p><h3>Conversaciones automáticas en pausa</h3></div><span class="v202-counter" id="v202-wait-count">0</span></div><div id="v202-waits" class="v202-wait-list"></div></article>
      </div>
      <div class="v202-dashboard">
        <article class="panel"><div class="panel-title"><div><p class="kicker">HISTORIAL</p><h3>Qué hizo la Super IA</h3></div><span class="v202-counter" id="v202-run-count">0</span></div><div id="v202-runs" class="v202-run-list"></div></article>
        <article class="panel v202-settings"><div class="panel-title"><div><p class="kicker">CONTROL DEL MOTOR</p><h3>Configuración administrativa</h3></div></div><div class="form-grid"><label><span>Super IA</span><select id="v202-enabled"><option value="true">Activa</option><option value="false">Desactivada</option></select></label><label><span>Retorno por defecto</span><input id="v202-timeout" type="number" min="1" max="10080"><small>Minutos</small></label></div><label class="check-row"><input id="v202-silent" type="checkbox" checked><span><b>Silenciosa por defecto</b><small>No crea avisos visuales salvo que la regla lo pida. La auditoría nunca se omite.</small></span></label><div class="inline-actions"><button class="button primary" id="v202-save-settings" type="button">Guardar configuración</button></div><div id="v202-admin-guide" class="v202-guide"></div></article>
      </div>`;
    anchor?.insertAdjacentElement('afterend', wrapper);

    document.querySelector('[data-module-block="automationLab"]')?.setAttribute('hidden','');
    document.querySelector('#v201-natural-action')?.closest('article')?.setAttribute('hidden','');

    $('#v202-apply')?.addEventListener('click', () => void applyInstruction());
    $('#v202-refresh')?.addEventListener('click', () => void loadSuper(true));
    $('#v202-save-settings')?.addEventListener('click', () => void saveSettings());
    $('#v202-examples')?.addEventListener('click', (event) => { const btn=event.target.closest('[data-v202-example]'); if(btn) { $('#v202-instruction').value=btn.dataset.v202Example||''; $('#v202-instruction').focus(); } });
    $('#v202-rules')?.addEventListener('click', handleRuleAction);
  }

  async function loadSuper(show=false) {
    if (!adminOnly()) return;
    try { superData = await api('/api/admin/super-automation'); renderSuper(); if(show) showToast('Super IA actualizada'); }
    catch(e){ if(show) showToast(e.message,'warning'); }
  }

  function triggerCopy(rule) {
    const t=rule.trigger||{};
    const label={incoming_message:'Mensaje entrante',deal_created:'Nueva negociación',outgoing_message:'Mensaje del agente',stage_changed:'Cambio de etapa',assignment_changed:'Cambio de responsable',stock_changed:'Cambio de stock',attendance_changed:'Marcación',scheduled:'Programada',manual:'Manual'}[t.type]||t.type;
    const parts=[label];
    if(t.text?.contains?.length)parts.push(`contiene “${t.text.contains.join(' + ')}”`);
    if(t.text?.anyContains?.length)parts.push(`dice ${t.text.anyContains.map(x=>`“${x}”`).join(' / ')}`);
    if(t.phone)parts.push(t.phone);
    if(t.clientTag)parts.push(`#${t.clientTag}`);
    if(t.lineName)parts.push(`línea ${t.lineName}`);
    if(t.stage)parts.push(stageName(t.stage));
    if(t.schedule)parts.push(t.schedule);
    if(t.everyMinutes)parts.push(`cada ${t.everyMinutes} min`);
    return parts.filter(Boolean).join(' · ');
  }

  function actionCopy(action) {
    const labels={send_whatsapp:'Enviar WhatsApp',wait_for_reply:'Esperar retorno',delay:'Esperar tiempo',branch_condition:'Evaluar condición',set_stage:'Cambiar etapa',assign_user:'Asignar',set_contact_field:'Actualizar contacto',set_deal_field:'Actualizar negociación',set_custom_field:'Campo personalizado',add_tag:'Agregar etiqueta',remove_tag:'Quitar etiqueta',create_task:'Crear tarea',toggle_bot:'Bot',reserve_stock:'Reservar stock',adjust_stock:'Ajustar stock',release_reservations:'Liberar reserva',close_won:'Ganar',close_lost:'Perder',create_approval:'Crear aprobación',create_order:'Crear pedido',set_order_status:'Actualizar pedido',create_visit:'Crear visita',set_attendance:'Cambiar marcación',create_objective:'Crear objetivo',create_deal:'Crear negociación',configure_whatsapp_line:'Configurar línea WhatsApp',create_news:'Publicar noticia',set_module:'Configurar módulo',set_ai_feature:'Configurar IA',rename_stage:'Renombrar etapa',add_bot_instruction:'Instrucción BOT',create_custom_field:'Crear campo',add_quick_reply:'Respuesta rápida'};
    if(action.type==='send_whatsapp')return `${labels[action.type]}${action.phone?` → ${action.phone}`:''}`;
    if(action.type==='wait_for_reply')return `Esperar retorno ${action.timeoutMinutes||60} min`;
    if(action.type==='set_stage')return `Etapa → ${stageName(action.stage)}`;
    return labels[action.type]||action.type;
  }

  function renderSuper() {
    if (!superData || !adminOnly()) return;
    const settings=superData.settings||{};
    $('#v202-enabled').value=String(settings.enabled!==false); $('#v202-timeout').value=Number(settings.defaultReplyTimeoutMinutes||60); $('#v202-silent').checked=settings.silentByDefault!==false;
    const enabled=settings.enabled!==false; $('#v202-engine-state').textContent=enabled?'Activa':'Desactivada'; $('#v202-engine-detail').textContent=enabled?'Reglas ejecutándose en tiempo real':'No se ejecutarán reglas'; $('#v202-engine-dot').classList.toggle('off',!enabled);
    const rules=superData.rules||[];
    $('#v202-rules').innerHTML=rules.length?rules.map(rule=>`<article class="v202-rule ${rule.enabled===false?'disabled':''}" data-rule-id="${escapeHtml(rule.id)}"><div class="v202-rule-top"><span class="v202-rule-status"></span><div><b>${escapeHtml(rule.name)}</b><small>${escapeHtml(triggerCopy(rule))}</small></div><label class="small-switch"><input type="checkbox" data-rule-action="toggle" ${rule.enabled!==false?'checked':''}><i></i></label></div><div class="v202-action-chain">${(rule.actions||[]).map((a,i)=>`<span>${i?'→':''} ${escapeHtml(actionCopy(a))}</span>`).join('')}</div><div class="v202-rule-meta"><span>${Number(rule.executionCount||0)} ejecuciones</span><span>${rule.lastExecutedAt?`Última: ${escapeHtml(formatDate(rule.lastExecutedAt))}`:'Todavía no ejecutada'}</span>${rule.lastError?`<em>⚠ ${escapeHtml(rule.lastError)}</em>`:''}<button class="button danger-outline tiny" data-rule-action="delete" type="button">Eliminar</button></div></article>`).join(''):'<div class="ai-empty">Todavía no hay reglas. Escribí la primera instrucción arriba.</div>';
    const waits=superData.waits||[]; $('#v202-wait-count').textContent=waits.length;
    $('#v202-waits').innerHTML=waits.length?waits.map(w=>`<div class="v202-wait"><span>↩</span><div><b>${escapeHtml(w.ruleName||'Automatización')}</b><small>${escapeHtml(w.phone||'')} · vence ${escapeHtml(formatDate(w.expiresAt))}</small></div></div>`).join(''):'<div class="ai-empty">No hay automatizaciones esperando respuestas.</div>';
    const runs=superData.executions||[]; $('#v202-run-count').textContent=runs.length;
    $('#v202-runs').innerHTML=runs.length?runs.slice(0,80).map(run=>`<div class="v202-run ${escapeHtml(run.status||'')}"><span>${run.status==='completed'?'✓':run.status==='failed'?'!':'…'}</span><div><b>${escapeHtml(run.ruleName||'Automatización')}</b><small>${escapeHtml(run.triggerType||'')} · ${escapeHtml(formatDate(run.startedAt))}${run.phone?` · ${escapeHtml(run.phone)}`:''}</small>${run.error?`<em>${escapeHtml(run.error)}</em>`:''}</div><strong>${Number((run.actionResults||[]).filter(x=>x.ok).length)}</strong></div>`).join(''):'<div class="ai-empty">Sin ejecuciones todavía.</div>';
    const guideEnabled=appState?.adminGuide?.enabled!==false;
    $('#v202-admin-guide').innerHTML=guideEnabled?`<details open><summary>？ Cómo funciona esta Super IA</summary><p><b>1.</b> Escribís una regla en lenguaje natural. <b>2.</b> La IA la convierte a un flujo estructurado. <b>3.</b> Se activa inmediatamente. <b>4.</b> Los eventos reales del CRM disparan la regla. <b>5.</b> Puede enviar WhatsApp por una línea concreta, esperar un retorno y continuar por caminos diferentes. <b>6.</b> Todas las acciones quedan en Auditoría aunque la regla sea silenciosa.</p><p><b>Puede actuar sobre:</b> etapas, responsables, campos, etiquetas, BOT, stock, tareas, aprobaciones, pedidos, visitas, objetivos, marcación, nuevas negociaciones, líneas WhatsApp, noticias, módulos, funciones IA, instrucciones BOT, campos personalizados y respuestas rápidas.</p><p><b>Condiciones:</b> mensaje, cliente, RUC/CI, empresa, ciudad, etiquetas, etapa, responsable, valor de negociación, stock, marcación, sucursal, línea y campos personalizados. Podés usar SI/ENTONCES/SINO y esperar respuestas con vencimiento.</p><p>Ejemplos: “si Juan escribe ‘pedido’, avisá silenciosamente al +595… y si responde ‘OK’ pasá la negociación a Contactado”; “si el stock de SKU X baja de 5, creá una tarea urgente”; “configurá la línea Mayoristas para que solo la usen María y Carlos”.</p><p><b>Límites de seguridad:</b> no ejecuta código arbitrario, no modifica contraseñas/API keys y los envíos masivos siguen perteneciendo al módulo Campañas.</p></details>`:'';
  }

  async function confirmInstruction(pendingId,special=false) {
    const btn=$('#v202-confirm-pending'); if(btn){btn.disabled=true;btn.textContent='Aplicando…';}
    try{
      const result=await api('/api/admin/super-automation/instruction/confirm',{method:'POST',body:JSON.stringify({pendingId,special})});
      if(result.state)setState(result.state);
      const labels={create_rule:'Regla creada y activada',update_rule:'Regla modificada',toggle_rule:'Estado de regla actualizado',delete_rule:'Regla eliminada',execute_admin_actions:'Cambios aplicados al CRM'};
      const conflicts=(result.conflicts||[]).length?`<small>⚠ Se detectaron ${result.conflicts.length} conflicto(s) potencial(es). Revisalos en el Centro V20.3.</small>`:'';
      $('#v202-result').innerHTML=`<div class="v202-success"><span>✓</span><div><b>${escapeHtml(labels[result.operation]||'Instrucción aplicada')}</b><p>${escapeHtml(result.summary||result.rule?.name||'Los cambios ya están activos.')}</p>${conflicts}</div></div>`;
      $('#v202-instruction').value=''; await loadSuper(); showToast(labels[result.operation]||'Super IA aplicada');
    }catch(e){$('#v202-result').innerHTML=`<div class="v202-error"><span>!</span><div><b>No se pudo aplicar</b><p>${escapeHtml(e.message)}</p></div></div>`;showToast(e.message,'warning');}
  }

  async function applyInstruction() {
    if (!adminOnly()) return;
    const instruction=$('#v202-instruction').value.trim(); if(!instruction)return;
    const btn=$('#v202-apply'); btn.disabled=true; btn.textContent='Analizando estructura y riesgo…'; $('#v202-result').innerHTML='<div class="v202-processing"><i></i><span>La Super IA está revisando dependencias, conflictos y nivel de riesgo antes de aplicar.</span></div>';
    try {
      const result=await api('/api/admin/super-automation/instruction',{method:'POST',body:JSON.stringify({instruction})});
      if(result.needsConfirmation){
        const level=result.risk?.level||'medium'; const riskLabel={low:'Bajo',medium:'Medio',high:'Alto',destructive:'Destructivo'}[level]||level;
        const conflicts=(result.conflicts||[]); const special=result.policy==='special_confirm';
        $('#v202-result').innerHTML=`<div class="v202-risk-preview ${escapeHtml(level)}"><div class="v202-risk-head"><span>⚠</span><div><b>Vista previa · Riesgo ${escapeHtml(riskLabel)}</