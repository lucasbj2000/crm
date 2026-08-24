/* WhatsBot CRM V21.5 · Encuestas + lógica centralizada de comunicaciones */
(() => {
  const $v = (selector, root=document) => root.querySelector(selector);
  const $$v = (selector, root=document) => [...root.querySelectorAll(selector)];
  let surveyCatalog = { surveys: [], sessions: [], orchestrator: {} };
  let surveyPolling = null;

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  const canSurvey = () => ["admin","manager","supervisor"].includes(appState?.currentUser?.role);
  const isAdmin = () => appState?.currentUser?.role === "admin";
  const branches = () => (appState?.branches || []).filter((b)=>b.active!==false && (isAdmin() || !appState?.currentUser?.branchId || b.id===appState.currentUser.branchId));
  const lines = (branchId) => (appState?.whatsappLines || []).filter((l)=>l.active!==false && (!branchId || l.branchId===branchId));
  const stageOptions = () => [
    ["all","Cualquier etapa"],["new",appState?.settings?.stageLabels?.new||"Nuevos"],["contacted",appState?.settings?.stageLabels?.contacted||"Contactados"],["waiting",appState?.settings?.stageLabels?.waiting||"En espera"],["won",appState?.settings?.stageLabels?.won||"Ganados"],["lost",appState?.settings?.stageLabels?.lost||"Perdidos"]
  ];
  const toast = (text, type="success") => typeof showToast === "function" ? showToast(text,type) : console.log(text);

  if (typeof viewCopy === "object") viewCopy.surveys = ["ENCUESTAS", "Experiencia y satisfacción del cliente"];
  if (typeof moduleLabels === "object") moduleLabels.surveys = ["Encuestas", "Satisfacción, segmentación, disparadores y saltos lógicos"];

  function installNav() {
    if ($v('[data-view="surveys"]')) return;
    const campaignsButton = $v('[data-view="campaigns"]');
    if (!campaignsButton) return;
    const button = document.createElement("button");
    button.className = "nav-item";
    button.dataset.module = "surveys";
    button.dataset.view = "surveys";
    button.type = "button";
    button.innerHTML = '<span>◉</span><b>Encuestas</b><i id="nav-survey-count">0</i>';
    campaignsButton.after(button);
    button.addEventListener("click", async () => {
      if (!canSurvey()) return toast("Encuestas está disponible para jefatura, gerencia y administración.", "warning");
      switchView("surveys");
      await loadSurveys();
    });
  }

  function installPanel() {
    if ($v('[data-view-panel="surveys"]')) return;
    const dataPanel = $v('[data-view-panel="data"]');
    if (!dataPanel) return;
    const section = document.createElement("section");
    section.className = "view v215-survey-view";
    section.dataset.viewPanel = "surveys";
    section.innerHTML = `
      <div class="v215-survey-hero">
        <div><p class="kicker">ENCUESTAS · V21.5</p><h2>Escuchá al cliente sin alterar la operación.</h2><p>Creá encuestas por compra, segmento o envío manual. Cada respuesta vive en su propia sesión y no mueve etapas, responsables, stock, bots ni automatizaciones del CRM.</p></div>
        <div class="inline-actions"><button class="button ghost" id="survey-refresh" type="button">↻ Actualizar</button><button class="button primary" id="new-survey-button" type="button">＋ Nueva encuesta</button></div>
      </div>
      <div class="v215-survey-metrics">
        <article><small>ENCUESTAS</small><strong id="survey-total">0</strong><span>Configuradas</span></article>
        <article><small>EN CURSO</small><strong id="survey-active">0</strong><span>Sesiones aisladas</span></article>
        <article><small>COMPLETADAS</small><strong id="survey-completed">0</strong><span>Respuestas finales</span></article>
        <article><small>FINALIZACIÓN</small><strong id="survey-rate">0%</strong><span>Promedio general</span></article>
      </div>
      <article class="panel v215-orchestrator-panel">
        <div class="panel-title"><div><p class="kicker">LÓGICA CENTRALIZADA</p><h3>Orquestador de comunicaciones</h3><p>Clasifica cada mensaje por propósito antes de tocar el CRM. Encuestas y campañas se procesan fuera del pipeline por defecto.</p></div><span class="v215-shield">AISLADO</span></div>
        <div class="v215-logic-map">
          <div><span>01</span><b>WhatsApp</b><small>Entrada / salida</small></div><i>→</i><div class="accent"><span>02</span><b>Orquestador</b><small>Identifica propósito</small></div><i>→</i><div><span>03</span><b>Sector correcto</b><small>CRM · campaña · encuesta · bot</small></div>
        </div>
        <div class="v215-isolation-grid" id="survey-orchestrator-controls">
          <label class="check-row"><input id="survey-isolation" type="checkbox" checked><span><b>Aislar respuestas de Encuestas</b><small>No crea ni mueve negociaciones.</small></span></label>
          <label class="check-row"><input id="campaign-isolation" type="checkbox" checked><span><b>Aislar respuestas de Campañas</b><small>No altera pipeline, dueño ni bot.</small></span></label>
          <label class="check-row"><input id="survey-crm-trigger" type="checkbox"><span><b>Permitir impacto CRM de Encuestas</b><small>Desactivado recomendado; solo activar si creás una integración consciente.</small></span></label>
          <label class="check-row"><input id="campaign-crm-trigger" type="checkbox"><span><b>Permitir impacto CRM de Campañas</b><small>Desactivado recomendado.</small></span></label>
        </div>
        <footer class="v215-orchestrator-footer"><small>La salida de campañas también está desacoplada: enviar una campaña no crea una negociación.</small><button class="button ghost" id="save-orchestrator" type="button">Guardar lógica</button></footer>
      </article>
      <div class="v215-survey-layout">
        <article class="panel"><div class="panel-title"><div><p class="kicker">CONFIGURADAS</p><h3>Encuestas</h3><p>Podés editar, pausar, probar destinatarios y enviar sin afectar otras áreas.</p></div></div><div id="survey-list" class="v215-survey-list"><div class="column-empty">Cargando encuestas…</div></div></article>
        <article class="panel"><div class="panel-title"><div><p class="kicker">ACTIVIDAD</p><h3>Sesiones recientes</h3><p>Seguimiento exclusivo de la encuesta, separado del historial de negociación.</p></div></div><div id="survey-session-list" class="v215-session-list"><div class="column-empty">Sin sesiones todavía.</div></div></article>
      </div>`;
    dataPanel.before(section);
  }

  function installDialog() {
    if ($v('#survey-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'survey-dialog';
    dialog.innerHTML = `
      <form class="dialog-card v215-survey-dialog" id="survey-form">
        <header><div><p class="kicker">ENCUESTAS</p><h3 id="survey-dialog-title">Nueva encuesta</h3><small>Configurá disparador, público y recorrido de preguntas.</small></div><button class="icon-button close" data-v215-close type="button">×</button></header>
        <input id="survey-id" type="hidden">
        <div class="form-grid"><label><span>Nombre *</span><input id="survey-name" maxlength="160" required placeholder="Ej.: Satisfacción post compra"></label><label><span>Sucursal</span><select id="survey-branch"></select></label></div>
        <label><span>Descripción</span><textarea id="survey-description" maxlength="1000" rows="2" placeholder="Objetivo interno de esta encuesta"></textarea></label>
        <div class="form-grid"><label><span>Línea de WhatsApp</span><select id="survey-line"></select></label><label><span>Cuándo se dispara</span><select id="survey-trigger"><option value="manual">Manual / cuando yo decida</option><option value="after_won">Después de una compra ganada</option><option value="segment">A un segmento seleccionado</option></select></label></div>
        <div id="survey-delay-row" class="v215-trigger-delay"><label><span>Esperar después de la compra</span><div class="v215-inline-input"><input id="survey-delay-hours" type="number" min="0" max="8760" step="0.5" value="24"><b>horas</b></div><small>Ejemplo: 24 horas después de cerrar la compra como Ganada.</small></label></div>
        <div class="v215-message-grid"><label><span>Mensaje inicial</span><textarea id="survey-intro" rows="3">Queremos conocer tu experiencia. La encuesta es breve y tus respuestas nos ayudan a mejorar.</textarea></label><label><span>Mensaje final</span><textarea id="survey-closing" rows="3">¡Muchas gracias por responder! Tu opinión quedó registrada.</textarea></label></div>
        <section class="v215-config-section"><div><p class="kicker">SEGMENTACIÓN</p><h4>¿Quién recibe esta encuesta?</h4><small>Los filtros se combinan entre sí. Si quedan vacíos, toma los clientes válidos de la sucursal.</small></div>
          <div class="form-grid three"><label><span>Ciudad contiene</span><input id="survey-filter-city" maxlength="120"></label><label><span>Empresa contiene</span><input id="survey-filter-company" maxlength="120"></label><label><span>Etiqueta contiene</span><input id="survey-filter-tag" maxlength="120"></label></div>
          <div class="form-grid three"><label><span>Etapa relacionada</span><select id="survey-filter-stage"></select></label><label><span>Mín. compras ganadas</span><input id="survey-filter-purchases" type="number" min="0" value="0"></label><label><span>Mín. comprado (Gs.)</span><input id="survey-filter-value" type="number" min="0" value="0"></label></div>
          <label class="check-row"><input id="survey-filter-optin" type="checkbox"><span><b>Exigir consentimiento de marketing</b><small>Opcional. Una encuesta de servicio/postventa puede operar sin marcarla como campaña comercial.</small></span></label>
          <div class="inline-actions"><button class="button ghost" id="survey-preview-button" type="button">Ver alcance</button><span class="v215-preview-pill" id="survey-preview-result">Sin calcular</span></div>
        </section>
        <section class="v215-config-section"><div class="v215-section-head"><div><p class="kicker">FLUJO DE PREGUNTAS</p><h4>Preguntas y saltos lógicos</h4><small>En opciones podés escribir: <b>Malo → 4</b>, <b>Excelente → FIN</b>. El bot seguirá ese recorrido.</small></div><button class="button ghost" id="survey-add-question" type="button">＋ Pregunta</button></div><div id="survey-questions" class="v215-question-list"></div></section>
        <div class="v215-isolation-notice"><span>✓</span><div><b>Protección de flujo activa</b><small>Guardar o enviar esta encuesta no cambia la etapa, responsable, stock ni automatizaciones de una negociación.</small></div></div>
        <footer><button class="button ghost" data-v215-close type="button">Cancelar</button><button class="button primary" type="submit">Guardar encuesta</button></footer>
      </form>`;
    document.body.append(dialog);
  }

  function questionCard(question={}, index=0) {
    const type = question.type || 'text';
    const optionsText = (question.options || []).map((option) => {
      const target = option.nextQuestionId === 'end' ? 'FIN' : option.nextQuestionId?.replace(/^q/, '') || '';
      return target ? `${option.label} -> ${target}` : option.label;
    }).join('\n');
    const defaultTarget = question.defaultNextQuestionId === 'end' ? 'FIN' : question.defaultNextQuestionId?.replace(/^q/, '') || '';
    return `<article class="v215-question" data-question-index="${index}">
      <header><div><span class="v215-q-number">P${index+1}</span><b>Pregunta ${index+1}</b></div><button type="button" class="icon-button" data-survey-question-remove>×</button></header>
      <label><span>Pregunta *</span><textarea data-q-text rows="2" maxlength="1200" required>${esc(question.text||'')}</textarea></label>
      <div class="form-grid three"><label><span>Tipo</span><select data-q-type><option value="text" ${type==='text'?'selected':''}>Texto libre</option><option value="options" ${type==='options'?'selected':''}>Opciones</option><option value="yesno" ${type==='yesno'?'selected':''}>Sí / No</option><option value="rating" ${type==='rating'?'selected':''}>Puntaje 1–10</option></select></label><label><span>Si no hay regla, ir a</span><input data-q-default placeholder="Siguiente / 4 / FIN" value="${esc(defaultTarget)}"></label><label class="check-row compact"><input data-q-required type="checkbox" ${question.required!==false?'checked':''}><span><b>Obligatoria</b><small>Requiere respuesta válida.</small></span></label></div>
      <label class="v215-options-field" ${type==='options'||type==='yesno'?'':'hidden'}><span>Opciones y saltos</span><textarea data-q-options rows="4" placeholder="Excelente -> FIN\nBueno -> 4\nMalo -> 2">${esc(optionsText)}</textarea><small>Una opción por línea. El destino puede ser número de pregunta o FIN.</small></label>
    </article>`;
  }

  function renumberQuestions() { $$v('.v215-question', $v('#survey-questions')).forEach((card,index)=>{card.dataset.questionIndex=index;const n=$v('.v215-q-number',card);if(n)n.textContent=`P${index+1}`;const b=$v('header b',card);if(b)b.textContent=`Pregunta ${index+1}`;}); }
  function addQuestion(question={}) { const wrap=$v('#survey-questions');wrap.insertAdjacentHTML('beforeend',questionCard(question,wrap.children.length));renumberQuestions(); }
  function normalizeTarget(raw) { const value=String(raw||'').trim(); if(!value)return ''; if(/^fin$/i.test(value))return 'end'; if(/^q\d+$/i.test(value))return value.toLowerCase(); if(/^\d+$/.test(value))return `q${value}`; return ''; }
  function parseOptionLines(raw, type) {
    const lines=String(raw||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if(type==='yesno' && !lines.length) return [{label:'Sí',value:'si',nextQuestionId:''},{label:'No',value:'no',nextQuestionId:''}];
    return lines.map((line,index)=>{const parts=line.split(/\s*(?:->|→|=>)\s*/);const label=parts[0]?.trim();return {id:`o${index+1}`,label,value:type==='yesno'?(index===0?'si':index===1?'no':label):label,nextQuestionId:normalizeTarget(parts[1])};}).filter(o=>o.label);
  }
  function collectQuestions() { return $$v('.v215-question',$v('#survey-questions')).map((card,index)=>{const type=$v('[data-q-type]',card).value;return {id:`q${index+1}`,text:$v('[data-q-text]',card).value.trim(),type,required:$v('[data-q-required]',card).checked,defaultNextQuestionId:normalizeTarget($v('[data-q-default]',card).value),options:parseOptionLines($v('[data-q-options]',card).value,type)};}).filter(q=>q.text); }
  function collectFilters() { return { city:$v('#survey-filter-city').value.trim(), company:$v('#survey-filter-company').value.trim(), tag:$v('#survey-filter-tag').value.trim(), stage:$v('#survey-filter-stage').value, minPurchases:Number($v('#survey-filter-purchases').value||0), minPurchaseValue:Number($v('#survey-filter-value').value||0), marketingOptIn:$v('#survey-filter-optin').checked }; }
  function collectSurvey() { return { name:$v('#survey-name').value.trim(),description:$v('#survey-description').value.trim(),branchId:$v('#survey-branch').value,lineId:$v('#survey-line').value,introMessage:$v('#survey-intro').value.trim(),closingMessage:$v('#survey-closing').value.trim(),trigger:{type:$v('#survey-trigger').value,delayMinutes:Math.round(Number($v('#survey-delay-hours').value||0)*60)},filters:collectFilters(),questions:collectQuestions(),active:true }; }

  function fillBranchAndLines(branchId, lineId) {
    const select=$v('#survey-branch');select.innerHTML=branches().map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
    if(branchId && branches().some(b=>b.id===branchId)) select.value=branchId; else if(appState?.currentUser?.branchId)select.value=appState.currentUser.branchId;
    const lineSelect=$v('#survey-line');const rows=lines(select.value);lineSelect.innerHTML=rows.map(l=>`<option value="${esc(l.id)}">${esc(l.name||'WhatsApp')}</option>`).join('');if(lineId&&rows.some(l=>l.id===lineId))lineSelect.value=lineId;
  }
  function fillStageOptions(value='all') { const select=$v('#survey-filter-stage');select.innerHTML=stageOptions().map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('');select.value=value||'all'; }
  function updateTriggerUi(){ $v('#survey-delay-row').hidden=$v('#survey-trigger').value!=='after_won'; }

  function openSurveyDialog(survey=null) {
    const form=$v('#survey-form');form.reset();$v('#survey-id').value=survey?.id||'';$v('#survey-dialog-title').textContent=survey?'Editar encuesta':'Nueva encuesta';
    fillBranchAndLines(survey?.branchId,survey?.lineId);fillStageOptions(survey?.filters?.stage||'all');
    $v('#survey-name').value=survey?.name||'';$v('#survey-description').value=survey?.description||'';$v('#survey-trigger').value=survey?.trigger?.type||'manual';$v('#survey-delay-hours').value=Number(survey?.trigger?.delayMinutes||1440)/60;
    $v('#survey-intro').value=survey?.introMessage||'Queremos conocer tu experiencia. La encuesta es breve y tus respuestas nos ayudan a mejorar.';$v('#survey-closing').value=survey?.closingMessage||'¡Muchas gracias por responder! Tu opinión quedó registrada.';
    $v('#survey-filter-city').value=survey?.filters?.city||'';$v('#survey-filter-company').value=survey?.filters?.company||'';$v('#survey-filter-tag').value=survey?.filters?.tag||'';$v('#survey-filter-purchases').value=Number(survey?.filters?.minPurchases||0);$v('#survey-filter-value').value=Number(survey?.filters?.minPurchaseValue||0);$v('#survey-filter-optin').checked=survey?.filters?.marketingOptIn===true;
    $v('#survey-preview-result').textContent='Sin calcular';$v('#survey-questions').innerHTML='';
    const qs=survey?.questions?.length?survey.questions:[{text:'¿Qué tan satisfecho/a estás con tu compra?',type:'rating',required:true},{text:'¿Qué podríamos mejorar?',type:'text',required:false}];qs.forEach(addQuestion);updateTriggerUi();$v('#survey-dialog').showModal();
  }

  function triggerLabel(survey){ if(survey.trigger?.type==='after_won')return `Post compra · ${Number(survey.trigger.delayMinutes||0)/60} h`;if(survey.trigger?.type==='segment')return 'Segmento';return 'Manual'; }
  function statusLabel(session){return session.status==='completed'?'Completada':session.status==='awaiting'?'Esperando respuesta':session.status==='queued'?'En cola':session.status==='cancelled'?'Cancelada':session.status;}
  function formatWhen(value){if(!value)return '—';try{return new Intl.DateTimeFormat('es-PY',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));}catch{return value;}}

  function renderSurveys() {
    const surveys=surveyCatalog.surveys||[],sessions=surveyCatalog.sessions||[];const completed=sessions.filter(s=>s.status==='completed').length,active=sessions.filter(s=>['queued','awaiting'].includes(s.status)).length;
    $v('#survey-total').textContent=surveys.length;$v('#survey-active').textContent=active;$v('#survey-completed').textContent=completed;$v('#survey-rate').textContent=`${sessions.length?Math.round(completed/sessions.length*100):0}%`;if($v('#nav-survey-count'))$v('#nav-survey-count').textContent=String(active);
    const list=$v('#survey-list');if(list)list.innerHTML=surveys.length?surveys.map(s=>{const m=s.metrics||{};return `<article class="v215-survey-card" data-survey-id="${esc(s.id)}"><div class="v215-survey-card-head"><div><span class="v215-status ${s.active!==false?'active':'paused'}">${s.active!==false?'ACTIVA':'PAUSADA'}</span><h4>${esc(s.name)}</h4><small>${esc(triggerLabel(s))} · ${esc(s.lineName||'Línea predeterminada')}</small></div><div class="inline-actions"><button class="button ghost" data-survey-action="edit" type="button">Editar</button><button class="button primary" data-survey-action="send" type="button">Enviar</button></div></div><p>${esc(s.description||'Sin descripción.')}</p><div class="v215-card-kpis"><span><b>${s.questions?.length||0}</b><small>Preguntas</small></span><span><b>${m.total||0}</b><small>Sesiones</small></span><span><b>${m.completed||0}</b><small>Completadas</small></span><span><b>${m.completionRate||0}%</b><small>Finalización</small></span></div><footer><button class="button ghost" data-survey-action="preview" type="button">Ver alcance</button><button class="button ghost" data-survey-action="toggle" type="button">${s.active!==false?'Pausar':'Activar'}</button><button class="button danger-outline" data-survey-action="delete" type="button">Eliminar</button></footer></article>`}).join(''):'<div class="column-empty">Todavía no hay encuestas. Creá la primera con el botón superior.</div>';
    const recent=$v('#survey-session-list');if(recent)recent.innerHTML=sessions.length?sessions.slice(0,40).map(s=>`<article class="v215-session"><span class="v215-session-dot ${esc(s.status)}"></span><div><b>${esc(s.clientName||s.phone)}</b><small>${esc(s.surveyName||'Encuesta')} · ${esc(statusLabel(s))}</small><em>${(s.answers||[]).length} respuestas · ${esc(formatWhen(s.completedAt||s.startedAt||s.createdAt))}</em></div></article>`).join(''):'<div class="column-empty">Sin sesiones todavía.</div>';
    const o=surveyCatalog.orchestrator||{};if($v('#survey-isolation'))$v('#survey-isolation').checked=o.surveyIsolation!==false;if($v('#campaign-isolation'))$v('#campaign-isolation').checked=o.campaignIsolation!==false;if($v('#survey-crm-trigger'))$v('#survey-crm-trigger').checked=o.surveyRepliesTriggerCrm===true;if($v('#campaign-crm-trigger'))$v('#campaign-crm-trigger').checked=o.campaignRepliesTriggerCrm===true;
    if($v('#survey-orchestrator-controls'))$v('#survey-orchestrator-controls').classList.toggle('readonly',!isAdmin());if($v('#save-orchestrator'))$v('#save-orchestrator').hidden=!isAdmin();
  }

  async function loadSurveys() {
    if(!canSurvey() || appState?.modules?.surveys===false || appState?.settings?.modules?.surveys===false)return;
    try{surveyCatalog=await api('/api/surveys');renderSurveys();}catch(error){if(currentView==='surveys')toast(error.message||'No se pudieron cargar las encuestas.','warning');}
  }
  async function preview(filters, branchId){const result=await api('/api/surveys/preview',{method:'POST',body:JSON.stringify({filters,branchId})});return result;}

  function bind() {
    $v('#new-survey-button')?.addEventListener('click',()=>openSurveyDialog());
    $v('#survey-refresh')?.addEventListener('click',loadSurveys);
    $v('#survey-branch')?.addEventListener('change',()=>fillBranchAndLines($v('#survey-branch').value,''));
    $v('#survey-trigger')?.addEventListener('change',updateTriggerUi);
    $v('#survey-add-question')?.addEventListener('click',()=>addQuestion({type:'text'}));
    $v('#survey-questions')?.addEventListener('click',(event)=>{const button=event.target.closest('[data-survey-question-remove]');if(!button)return;button.closest('.v215-question')?.remove();if(!$v('#survey-questions').children.length)addQuestion({type:'text'});renumberQuestions();});
    $v('#survey-questions')?.addEventListener('change',(event)=>{if(!event.target.matches('[data-q-type]'))return;const card=event.target.closest('.v215-question');const type=event.target.value;$v('.v215-options-field',card).hidden=!['options','yesno'].includes(type);if(type==='yesno'&&!$v('[data-q-options]',card).value.trim())$v('[data-q-options]',card).value='Sí\nNo';});
    $$v('[data-v215-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog')?.close()));
    $v('#survey-preview-button')?.addEventListener('click',async()=>{try{const result=await preview(collectFilters(),$v('#survey-branch').value);$v('#survey-preview-result').textContent=`${result.count} clientes encontrados`;toast(`La segmentación encontró ${result.count} clientes.`);}catch(error){toast(error.message,'warning');}});
    $v('#survey-form')?.addEventListener('submit',async(event)=>{event.preventDefault();try{const payload=collectSurvey();if(!payload.questions.length)throw new Error('Agregá al menos una pregunta.');const id=$v('#survey-id').value;await api(id?`/api/surveys/${encodeURIComponent(id)}`:'/api/surveys',{method:id?'PUT':'POST',body:JSON.stringify(payload)});$v('#survey-dialog').close();toast(id?'Encuesta actualizada.':'Encuesta creada.');await loadSurveys();}catch(error){toast(error.message,'warning');}});
    $v('#survey-list')?.addEventListener('click',async(event)=>{const button=event.target.closest('[data-survey-action]');if(!button)return;const card=button.closest('[data-survey-id]');const survey=surveyCatalog.surveys.find(s=>s.id===card?.dataset.surveyId);if(!survey)return;try{const action=button.dataset.surveyAction;if(action==='edit')return openSurveyDialog(survey);if(action==='preview'){const result=await preview(survey.filters||{},survey.branchId);return toast(`${result.count} clientes coinciden con el segmento de “${survey.name}”.`);}if(action==='send'){const result=await api(`/api/surveys/${encodeURIComponent(survey.id)}/dispatch`,{method:'POST',body:'{}'});toast(`${result.queued} encuestas agregadas a la cola.`);}if(action==='toggle'){await api(`/api/surveys/${encodeURIComponent(survey.id)}/toggle`,{method:'POST',body:JSON.stringify({active:survey.active===false})});toast(survey.active===false?'Encuesta activada.':'Encuesta pausada.');}if(action==='delete'){if(!confirm(`¿Eliminar la encuesta “${survey.name}”? Las sesiones activas se cancelarán.`))return;await api(`/api/surveys/${encodeURIComponent(survey.id)}`,{method:'DELETE'});toast('Encuesta eliminada.');}await loadSurveys();}catch(error){toast(error.message,'warning');}});
    $v('#save-orchestrator')?.addEventListener('click',async()=>{try{const result=await api('/api/communication-orchestrator',{method:'POST',body:JSON.stringify({surveyIsolation:$v('#survey-isolation').checked,campaignIsolation:$v('#campaign-isolation').checked,surveyRepliesTriggerCrm:$v('#survey-crm-trigger').checked,campaignRepliesTriggerCrm:$v('#campaign-crm-trigger').checked})});surveyCatalog.orchestrator=result.orchestrator||{};renderSurveys();toast('Lógica centralizada guardada.');}catch(error){toast(error.message,'warning');}});
  }

  function roleAndModuleVisibility(){const nav=$v('[data-view="surveys"]');if(!nav)return;const moduleOn=(appState?.modules?.surveys??appState?.settings?.modules?.surveys)!==false;nav.hidden=!canSurvey()||!moduleOn;if((!canSurvey()||!moduleOn)&&currentView==='surveys')switchView('crm');}

  function init(){installNav();installPanel();installDialog();bind();roleAndModuleVisibility();surveyPolling=setInterval(()=>{roleAndModuleVisibility();if(currentView==='surveys')void loadSurveys();},15000);window.addEventListener('beforeunload',()=>clearInterval(surveyPolling));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
