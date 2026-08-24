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
    const form=$v('#survey-form');form