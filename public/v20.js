/* V20 · Plataforma Total IA */
(() => {
  const featureMap = [
    ["🧠","Centro de Comando IA","Consultas globales con lenguaje natural","commandCenter"],
    ["🤖","Agentes IA especializados","Comercial, SAC, calidad, stock, campañas y gerencia","specializedAgents"],
    ["👤","Shadow Agent","Prioridades privadas del agente","shadowAgent"],
    ["⚡","Acciones naturales","Preparar acciones desde instrucciones","naturalActions"],
    ["🧩","Automatizaciones IA","Generar y simular reglas","automationGenerator"],
    ["🔎","Búsqueda semántica","Encontrar datos por significado","semanticSearch"],
    ["🧠","Memoria de cliente","Hechos, inferencias y pendientes","customerMemory"],
    ["📚","Conocimiento empresarial","Documentos, políticas y catálogos","knowledgeAssistant"],
    ["⚠","Contradicciones","Prevenir promesas o datos inconsistentes","contradictionCheck"],
    ["🎙","Audios IA","Transcripción y resumen","audioTranscription"],
    ["😊","Sentimiento avanzado","Frustración, apuro, interés y riesgo","advancedSentiment"],
    ["🚨","Radar de riesgo","Clientes y negociaciones en riesgo","riskRadar"],
    ["💰","Oportunidades IA","Reposición y reactivación","opportunityMining"],
    ["🛒","Next Best Offer","Oferta contextual sugerida","nextBestOffer"],
    ["🔄","Reactivación","Clientes dormidos y frecuencia","reactivation"],
    ["🏆","Coach IA","Mejora continua para agentes","salesCoach"],
    ["📊","Calidad IA","Score explicable de conversación","qualityScoring"],
    ["🎓","Academia IA","Microcapacitaciones adaptativas","academyCoach"],
    ["🔔","Alertas predictivas","Anticipar incumplimientos de SLA","predictiveAlerts"],
    ["⚖","Asignación inteligente","Carga, disponibilidad y sucursal","smartAssignment"],
    ["🧬","Cliente 360° IA","Resumen integral de cliente","customerSummary"],
    ["🕸","Relaciones B2B","Empresa, contactos y decisores","relationshipMap"],
    ["🔗","Duplicados inteligentes","Detectar fichas posiblemente repetidas","semanticDuplicates"],
    ["📑","Document Intelligence","Extraer información de archivos","documentIntelligence"],
    ["📷","Captura visual IA","Leer imágenes con confirmación","visionCapture"],
    ["📦","Pedidos","Operación post-venta","orders"],
    ["🚚","Entregas","Despacho e incidencias","deliveryAssistant"],
    ["🌐","Portal del cliente","Marco de acceso seguro","portal"],
    ["🗺","Visitas comerciales","Agenda y resultado","visitAssistant"],
    ["🌎","Traducción","Atención multidioma","translation"],
    ["🔐","Anomalías","Actividad fuera de patrón","anomalyDetection"],
    ["🕵","Auditor IA","Reconstrucción de trazabilidad","auditAssistant"],
    ["💵","Costos IA","Tokens y presupuesto","costControl"],
    ["🧠","Model routing","Modelo adecuado por tarea","modelRouting"],
    ["✨","Interfaz por rol","Priorizar herramientas según función","personalizedUi"],
    ["⌨","Ctrl+K","Comandos rápidos y navegación","globalSearch"],
    ["📺","Wallboard","Vista en vivo para TV","wallboard"],
    ["🧪","Laboratorio IA","Simular antes de activar","automationSimulator"],
    ["🛡","Autonomía 0–5","Control de ejecución IA","autonomyLevels"]
  ];
  let guideCatalog = [];
  let commandAnswer = "";

  function injectV20() {
    if (document.querySelector('[data-view="advanced"]')) return;
    const navTarget = document.querySelector('[data-view="data"]');
    const nav = document.createElement('button');
    nav.className = 'nav-item'; nav.type = 'button'; nav.dataset.view = 'advanced'; nav.dataset.module = 'advancedSuite';
    nav.innerHTML = '<span>◇</span><b>Suite avanzada</b><i id="nav-v20-count">IA</i>';
    navTarget?.parentNode?.insertBefore(nav, navTarget);
    nav.addEventListener('click',()=>switchView('advanced'));

    const refresh = document.querySelector('#refresh-button');
    if (refresh) {
      const guide = document.createElement('button'); guide.id='v20-guide-button'; guide.className='button ghost v20-guide-button'; guide.type='button'; guide.hidden=true; guide.textContent='？ Guía';
      const cmd = document.createElement('button'); cmd.id='v20-command-button'; cmd.className='button ghost'; cmd.type='button'; cmd.title='Comandos rápidos (Ctrl+K)'; cmd.textContent='⌘';
      refresh.parentNode.insertBefore(guide, refresh); refresh.parentNode.insertBefore(cmd, refresh);
    }

    const reports = document.querySelector('[data-view-panel="reports"]');
    const section = document.createElement('section'); section.className='view'; section.dataset.viewPanel='advanced'; section.innerHTML = `
      <div class="advanced-v20-hero"><div><p class="kicker">PLATAFORMA TOTAL V20</p><h2>Suite avanzada + Agentes IA</h2><p>Centro de comando, Shadow Agent, radar comercial, pedidos, visitas, academia, seguridad, automatizaciones, búsqueda semántica, wallboard y gobernanza IA.</p></div><div class="v20-hero-badge"><span>✦</span><strong id="v20-open">0</strong><small>gestiones abiertas</small></div></div>
      <div class="v20-kpis" id="v20-kpis"></div>
      <div class="v20-grid"><article class="panel" data-module-block="commandCenter"><div class="panel-title"><div><p class="kicker">CENTRO DE COMANDO IA</p><h3>Preguntale a la operación</h3><p>Usa únicamente información visible para tu rol.</p></div></div><div id="v20-command-log" class="v20-command-log"><div class="ai-empty">Ej.: ¿Qué debería priorizar hoy? · ¿Dónde tengo más riesgo? · ¿Qué sucursal necesita apoyo?</div></div><div class="ai-question-row"><input id="v20-command-question" maxlength="3000" placeholder="Preguntale al Centro de Comando…"><button id="v20-command-send" class="button dark" type="button">✦ Analizar</button></div></article><article class="panel"><div class="panel-title"><div><p class="kicker">SHADOW AGENT</p><h3>Asistente de jornada</h3></div><button id="v20-shadow-refresh" class="button ghost" type="button">↻</button></div><div class="v20-shadow" id="v20-shadow"><span>✦</span><p>Cargando prioridades…</p></div></article></div>
      <div class="v20-grid three"><article class="panel" data-module-block="opportunities"><div class="panel-title"><div><p class="kicker">RADAR IA</p><h3>Oportunidades</h3></div><button id="v20-opps-generate" class="button primary" type="button">✦ Detectar</button></div><div id="v20-opps" class="v20-list"></div></article><article class="panel" data-module-block="orders"><div class="panel-title"><div><p class="kicker">PEDIDOS</p><h3>Post-venta</h3></div><button id="v20-order-new" class="button ghost" type="button">＋ Crear</button></div><div id="v20-orders" class="v20-list"></div></article><article class="panel" data-module-block="visits"><div class="panel-title"><div><p class="kicker">VISITAS</p><h3>Gestión de campo</h3></div><button id="v20-visit-new" class="button ghost" type="button">＋ Visita</button></div><div id="v20-visits" class="v20-list"></div></article></div>
      <div class="v20-grid"><article class="panel"><div class="panel-title"><div><p class="kicker">BÚSQUEDA SEMÁNTICA</p><h3>Buscá por significado</h3></div></div><div class="ai-question-row"><input id="v20-semantic-input" placeholder="Ej.: cliente que reclamó por entrega y luego volvió a comprar"><button id="v20-semantic-send" class="button ghost" type="button">Buscar</button></div><div id="v20-semantic-results" class="v20-search-results"></div></article><article class="panel" data-module-block="automationLab"><div class="panel-title"><div><p class="kicker">LABORATORIO IA</p><h3>Automatizaciones en lenguaje natural</h3></div></div><textarea id="v20-auto-text" rows="4" maxlength="4000" placeholder="Si un cliente VIP espera más de 10 minutos, avisar al jefe y crear una tarea urgente."></textarea><div class="inline-actions"><button id="v20-auto-sim" class="button dark" type="button">✦ Simular</button></div><div id="v20-auto-result"></div></article></div>
      <div class="v20-grid three"><article class="panel" data-module-block="academy"><div class="panel-title"><div><p class="kicker">ACADEMIA IA</p><h3>Capacitación</h3></div><button id="v20-training-new" class="button ghost" type="button">＋ Contenido</button></div><div id="v20-training" class="v20-list"></div></article><article class="panel" data-module-block="security"><div class="panel-title"><div><p class="kicker">SEGURIDAD</p><h3>Anomalías y auditoría</h3></div><button id="v20-security-scan" class="button ghost" type="button">⌕ Escanear</button></div><div id="v20-security" class="v20-list"></div></article><article class="panel" data-module-block="aiGovernance"><div class="panel-title"><div><p class="kicker">GOBERNANZA</p><h3>Autonomía IA</h3></div></div><div id="v20-governance" class="v20-autonomy"></div></article></div>
      <article class="panel"><div class="panel-title"><div><p class="kicker">MAPA V20</p><h3>Capacidades de la plataforma</h3><p>El administrador puede apagar módulos completos o funciones IA individuales.</p></div></div><div id="v20-feature-grid" class="v20-feature-grid"></div></article>
      <article class="panel" data-module-block="wallboard" style="margin-top:15px"><div class="panel-title"><div><p class="kicker">WALLBOARD</p><h3>Operación en vivo</h3></div><button id="v20-wallboard-full" class="button ghost" type="button">⛶ Pantalla completa</button></div><div id="v20-wallboard" class="v20-wallboard"></div></article>`;
    reports?.parentNode?.insertBefore(section,reports);

    const settingsPanel = document.querySelector('#operations-admin-panel');
    if (settingsPanel) {
      const wrap = document.createElement('div'); wrap.innerHTML = `<article class="panel v20-admin-card" id="v20-guide-config"><div class="panel-title"><div><p class="kicker">SOLO ADMINISTRADOR</p><h3>Modo Guía Administrador</h3><p>Explicaciones contextuales, pasos y ejemplos. Ningún otro rol ve esta función.</p></div><span class="ops-shield">ADMIN</span></div><div class="form-grid"><label><span>Modo Guía</span><select id="v20-guide-enabled"><option value="true">Activado</option><option value="false">Desactivado</option></select></label><label><span>Consejos contextuales</span><select id="v20-guide-context"><option value="true">Mostrar</option><option value="false">Ocultar</option></select></label></div><div class="inline-actions"><button id="v20-guide-save" class="button primary" type="button">Guardar</button><button id="v20-guide-open-config" class="button ghost" type="button">？ Abrir guía</button></div></article><article class="panel v20-admin-card" id="v20-gov-config"><div class="panel-title"><div><p class="kicker">GOBERNANZA IA</p><h3>Niveles de autonomía 0–5</h3><p>Recomendado inicialmente: nivel 3, la IA prepara pero el humano confirma acciones externas.</p></div><span class="ops-shield">ADMIN</span></div><div class="form-grid"><label><span>Nivel general</span><select id="v20-gov-level"><option value="0">0 · Apagada</option><option value="1">1 · Observa</option><option value="2">2 · Recomienda</option><option value="3">3 · Prepara + confirma</option><option value="4">4 · Automatiza autorizado</option><option value="5">5 · Autónomo controlado</option></select></label><label><span>Máximo externo</span><select id="v20-gov-external"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label></div><div class="form-grid"><label><span>Aprobación desde monto Gs.</span><input id="v20-gov-amount" type="number" min="0"></label><label><span>Presupuesto IA mensual USD (0 = sin límite)</span><input id="v20-gov-budget" type="number" min="0" step="0.01"></label></div><label class="check-row"><input id="v20-gov-routing" type="checkbox" checked><span><b>Enrutamiento inteligente de modelos</b><small>Usa el modelo adecuado según complejidad si está configurado.</small></span></label><div class="inline-actions"><button id="v20-gov-save" class="button primary" type="button">Guardar gobernanza</button></div></article>`;
      [...wrap.children].reverse().forEach(el=>settingsPanel.parentNode.insertBefore(el,settingsPanel));
    }

    document.body.insertAdjacentHTML('beforeend',`<dialog id="v20-guide-dialog"><div class="dialog-card v20-guide-dialog"><header><div><p class="kicker">SOLO ADMINISTRADOR</p><h3>Guía completa del CRM V20</h3><small>Buscá cualquier módulo o capacidad.</small></div><button class="icon-button close" type="button" data-dialog-close>×</button></header><input id="v20-guide-search" class="v20-command-input" type="search" placeholder="Buscar campaña, IA, pedidos, seguridad…"><div id="v20-guide-list" class="v20-guide-list"></div></div></dialog><dialog id="v20-command-dialog"><div class="dialog-card v20-command-dialog"><header><div><p class="kicker">CTRL + K</p><h3>Comandos rápidos</h3></div><button class="icon-button close" type="button" data-dialog-close>×</button></header><input id="v20-command-input" class="v20-command-input" type="search" placeholder="Cliente, módulo, tarea, IA…"><div id="v20-command-results" class="v20-command-results"></div></div></dialog>`);
    document.querySelectorAll('#v20-guide-dialog [data-dialog-close],#v20-command-dialog [data-dialog-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  }

  function extendConfig() {
    Object.assign(viewCopy,{advanced:["SUITE AVANZADA","Plataforma Total IA"]});
    Object.assign(moduleLabels,{advancedSuite:["Suite avanzada V20","Inteligencia operativa total"],commandCenter:["Centro de Comando IA","Consultas globales"],opportunities:["Radar de oportunidades","Reposición y reactivación"],orders:["Pedidos","Operación post-venta"],visits:["Visitas comerciales","Gestión de campo"],academy:["Academia IA","Capacitación adaptativa"],security:["Seguridad y anomalías","Auditoría inteligente"],automationLab:["Laboratorio IA","Diseño y simulación de reglas"],wallboard:["Wallboard","Operación para TV"],portal:["Portal del cliente","Acceso seguro a estados"],relationships:["Relaciones B2B","Empresas y decisores"],documentIntelligence:["Document Intelligence","Extracción de documentos"],aiGovernance:["Gobernanza IA","Autonomía y costos"],adminGuide:["Modo Guía Admin","Ayuda exclusiva del administrador"]});
    Object.assign(aiFeatureLabels,{specializedAgents:["Agentes IA especializados","Comercial, SAC, calidad, stock y gerencia"],shadowAgent:["Shadow Agent","Asistente privado de jornada"],naturalActions:["Acciones por lenguaje natural","Preparar cambios con confirmación"],automationGenerator:["Generador de automatizaciones","Instrucciones → reglas"],automationSimulator:["Simulador de automatizaciones","Impacto sin ejecutar"],semanticSearch:["Búsqueda semántica","Buscar por significado"],customerMemory:["Memoria del cliente","Hechos e inferencias"],contradictionCheck:["Contradicciones","Validar promesas y datos"],audioTranscription:["Audios IA","Transcribir y resumir"],advancedSentiment:["Sentimiento avanzado","Emoción e intención"],riskRadar:["Radar de riesgo","Clientes en riesgo"],opportunityMining:["Minería de oportunidades","Detectar oportunidades ocultas"],nextBestOffer:["Next Best Offer","Oferta contextual"],reactivation:["Reactivación","Clientes dormidos"],academyCoach:["Academia adaptativa","Capacitación por desempeño"],predictiveAlerts:["Alertas predictivas","Anticipar SLA"],relationshipMap:["Mapa B2B","Relaciones empresariales"],documentIntelligence:["Document Intelligence","Extraer datos de archivos"],visionCapture:["Captura visual","Leer imágenes/documentos"],anomalyDetection:["Anomalías","Seguridad inteligente"],auditAssistant:["Auditor IA","Trazabilidad explicada"],costControl:["Costos IA","Tokens y presupuesto"],modelRouting:["Model routing","Modelo según tarea"],usageOptimizer:["Optimización de uso","Detectar módulos poco usados"],personalizedUi:["Interfaz por rol","Experiencia adaptativa"],autonomyLevels:["Autonomía 0–5","Control de ejecución"],morningBrief:["Brief inicial","Prioridades al comenzar"],endOfDayBrief:["Cierre de jornada","Resumen y pendientes"],semanticDuplicates:["Duplicados inteligentes","Detección semántica"],quoteAssistant:["Cotizaciones IA","Preparar propuestas"],deliveryAssistant:["Entregas IA","Seguimiento de entrega"],visitAssistant:["Visit