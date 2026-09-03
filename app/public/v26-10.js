(() => {
  "use strict";

  const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
  const $$ = (selector, root = document) => Array.from(root?.querySelectorAll?.(selector) || []);
  let state = null;
  let currentUser = null;
  let supportPollTimer = null;
  let agentSession = null;
  let agentStream = null;
  let agentSnapshotTimer = null;
  let agentMouseTimer = null;
  let lastMouse = { x: 0.5, y: 0.5, visible: false };
  let lastMouseSentAt = 0;
  let adminSession = null;
  let adminStream = null;
  let adminTelemetry = null;
  let annotationMode = false;
  let identityLoading = false;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: options.body && typeof options.body === "string"
        ? { "Content-Type": "application/json", ...(options.headers || {}) }
        : (options.headers || {}),
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);
    return payload;
  }

  function roleLabel(role) {
    return role === "admin" ? "Administrador"
      : role === "director" ? "Director"
      : role === "manager" ? "Gerente"
      : role === "supervisor" ? "Jefe"
      : "Agente";
  }

  async function loadIdentity() {
    if (identityLoading) return;
    identityLoading = true;
    try {
      const payload = await api("/api/state");
      state = payload;
      currentUser = payload.currentUser || null;
      applyRoleUi();
    } catch {
      state = null;
      currentUser = null;
      removeAdminLauncher();
    } finally {
      identityLoading = false;
    }
  }

  function restoreOperationalWhatsapp() {
    if (!currentUser || currentUser.role === "admin") return;
    const allowed = currentUser.modulePermissions?.whatsapp !== false;
    const nav = $('.nav-item[data-view="whatsapp"]');
    if (nav && allowed) {
      nav.classList.remove("v269-hidden-technical");
      nav.hidden = false;
    }
  }

  function applyRoleUi() {
    restoreOperationalWhatsapp();
    if (currentUser?.role === "admin") ensureAdminLauncher();
    else removeAdminLauncher();
    scheduleSupportPoll(100);
  }

  function ensureAdminLauncher() {
    if ($("#v2610-admin-launcher")) return;
    const button = document.createElement("button");
    button.id = "v2610-admin-launcher";
    button.type = "button";
    button.className = "v2610-admin-launcher";
    button.innerHTML = "<span>🛟</span><span>Soporte en vivo</span>";
    button.addEventListener("click", openAdminPanel);
    document.body.appendChild(button);
  }

  function removeAdminLauncher() {
    $("#v2610-admin-launcher")?.remove();
    $("#v2610-admin-panel")?.remove();
  }

  function adminPanelMarkup() {
    return `
      <div class="v2610-panel-backdrop" data-v2610-close></div>
      <section class="v2610-panel-card" role="dialog" aria-modal="true" aria-label="Soporte en vivo y bots por número">
        <header class="v2610-panel-head">
          <div><small>ADMINISTRACIÓN · V26.10</small><h2>Soporte y bots por número</h2></div>
          <button type="button" class="v2610-icon-button" data-v2610-close>×</button>
        </header>
        <div class="v2610-tabs">
          <button type="button" class="active" data-v2610-tab="support">Soporte en vivo</button>
          <button type="button" data-v2610-tab="bots">Bots por número</button>
        </div>
        <div class="v2610-tab-body" data-v2610-body="support">
          <div class="v2610-note">La vista en vivo refleja únicamente lo que el empleado está viendo dentro del CRM. El modo urgente entra sin esperar aceptación, pero siempre muestra un indicador visible al empleado y queda auditado.</div>
          <div id="v2610-agent-list" class="v2610-agent-list"><div class="v2610-loading">Cargando usuarios…</div></div>
        </div>
        <div class="v2610-tab-body" data-v2610-body="bots" hidden>
          <div class="v2610-note">Cada número puede tener su propio bot: activación, instrucciones, modelo, tono, reservas y seguimiento. La API Key sigue siendo global y nunca se expone aquí.</div>
          <div id="v2610-line-list" class="v2610-line-list"><div class="v2610-loading">Cargando líneas…</div></div>
          <div id="v2610-bot-editor"></div>
        </div>
      </section>`;
  }

  function openAdminPanel() {
    let panel = $("#v2610-admin-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "v2610-admin-panel";
      panel.className = "v2610-panel";
      panel.innerHTML = adminPanelMarkup();
      document.body.appendChild(panel);
      panel.addEventListener("click", handleAdminPanelClick);
    }
    panel.hidden = false;
    loadSupportAgents();
  }

  function closeAdminPanel() {
    const panel = $("#v2610-admin-panel");
    if (panel) panel.hidden = true;
  }

  async function handleAdminPanelClick(event) {
    if (event.target.closest("[data-v2610-close]")) return closeAdminPanel();
    const tab = event.target.closest("[data-v2610-tab]");
    if (tab) {
      $$("#v2610-admin-panel [data-v2610-tab]").forEach((node) => node.classList.toggle("active", node === tab));
      $$("#v2610-admin-panel [data-v2610-body]").forEach((body) => body.hidden = body.dataset.v2610Body !== tab.dataset.v2610Tab);
      if (tab.dataset.v2610Tab === "bots") loadBotLines();
      if (tab.dataset.v2610Tab === "support") loadSupportAgents();
      return;
    }
    const supportButton = event.target.closest("[data-v2610-support-user]");
    if (supportButton) {
      const mode = supportButton.dataset.v2610Mode === "urgent" ? "urgent" : "request";
      await startAdminSupport(supportButton.dataset.v2610SupportUser, mode);
      return;
    }
    const botButton = event.target.closest("[data-v2610-bot-line]");
    if (botButton) {
      const line = (window.__v2610Lines || []).find((entry) => entry.id === botButton.dataset.v2610BotLine);
      if (line) renderBotEditor(line);
      return;
    }
    if (event.target.closest("[data-v2610-bot-save]")) await saveBotEditor();
  }

  async function loadSupportAgents() {
    const list = $("#v2610-agent-list");
    if (!list) return;
    try {
      const payload = await api("/api/live-support/agents");
      const users = payload.users || [];
      list.innerHTML = users.length ? users.map((user) => {
        const status = user.session?.status === "active" ? "Soporte activo" : user.session?.status === "requested" ? "Solicitud pendiente" : "";
        return `<article class="v2610-agent-card">
          <div class="v2610-agent-avatar">${escapeHtml(initials(user.name))}</div>
          <div class="v2610-agent-info"><b>${escapeHtml(user.name)}</b><small>@${escapeHtml(user.username)} · ${escapeHtml(roleLabel(user.role))}</small><small>${escapeHtml(user.branchName || "Administración general")} · ${user.online ? "● En línea" : "○ Sin actividad reciente"}${status ? ` · ${escapeHtml(status)}` : ""}</small></div>
          <div class="v2610-agent-actions">
            <button type="button" data-v2610-support-user="${escapeAttr(user.id)}" data-v2610-mode="request">Solicitar vista</button>
            <button type="button" class="urgent" data-v2610-support-user="${escapeAttr(user.id)}" data-v2610-mode="urgent">Ingresar urgente</button>
          </div>
        </article>`;
      }).join("") : `<div class="v2610-empty">No hay otros usuarios activos.</div>`;
    } catch (error) {
      list.innerHTML = `<div class="v2610-error">${escapeHtml(error.message)}</div>`;
    }
  }

  async function startAdminSupport(userId, mode) {
    try {
      const payload = await api("/api/live-support/request", { method: "POST", body: JSON.stringify({ userId, mode }) });
      closeAdminPanel();
      openLiveViewer(payload.session);
    } catch (error) { window.alert(error.message); }
  }

  function openLiveViewer(session) {
    closeAdminStream();
    adminSession = session;
    adminTelemetry = session.telemetry || null;
    let viewer = $("#v2610-live-viewer");
    if (!viewer) {
      viewer = document.createElement("div");
      viewer.id = "v2610-live-viewer";
      viewer.className = "v2610-live-viewer";
      viewer.innerHTML = `
        <div class="v2610-viewer-card">
          <header class="v2610-viewer-head">
            <div><small id="v2610-viewer-mode">SOPORTE EN VIVO</small><h2 id="v2610-viewer-title">Vista del agente</h2><p id="v2610-viewer-status"></p></div>
            <div class="v2610-viewer-actions"><button type="button" id="v2610-annotate-button">＋ Señalar / comentar</button><button type="button" class="danger" id="v2610-end-support">Finalizar</button></div>
          </header>
          <div class="v2610-viewer-stage" id="v2610-viewer-stage">
            <div class="v2610-waiting" id="v2610-viewer-waiting">Esperando la vista del empleado…</div>
            <div class="v2610-mirror-scaler" id="v2610-mirror-scaler">
              <iframe id="v2610-mirror-frame" title="Vista en vivo del CRM" sandbox="allow-same-origin"></iframe>
              <div id="v2610-remote-cursor" class="v2610-remote-cursor"><span></span></div>
              <div id="v2610-admin-annotations" class="v2610-annotations"></div>
            </div>
          </div>
          <footer class="v2610-viewer-foot"><span>Solo CRM · sin acceso al escritorio del empleado</span><span id="v2610-viewer-time"></span></footer>
        </div>`;
      document.body.appendChild(viewer);
      $("#v2610-end-support").addEventListener("click", endAdminSupport);
      $("#v2610-annotate-button").addEventListener("click", () => {
        annotationMode = !annotationMode;
        $("#v2610-annotate-button").classList.toggle("active", annotationMode);
        $("#v2610-viewer-stage").classList.toggle("annotation-mode", annotationMode);
      });
      $("#v2610-viewer-stage").addEventListener("click", handleViewerAnnotation);
      window.addEventListener("resize", scaleMirror);
    }
    viewer.hidden = false;
    updateViewerSession(session);
    if (adminTelemetry) renderTelemetry(adminTelemetry);
    openAdminStream(session.id);
  }

  function updateViewerSession(session) {
    adminSession = { ...(adminSession || {}), ...(session || {}) };
    if (!adminSession) return;
    $("#v2610-viewer-title").textContent = `Vista de ${adminSession.agentName || "usuario"}`;
    $("#v2610-viewer-mode").textContent = adminSession.mode === "urgent" ? "SOPORTE URGENTE · ENTRADA DIRECTA" : "SOPORTE EN VIVO · CON APROBACIÓN";
    const status = adminSession.status === "requested" ? "Esperando que el empleado acepte la solicitud."
      : adminSession.status === "active" ? "Conectado. La vista se actualiza silenciosamente."
      : adminSession.status === "rejected" ? "El empleado rechazó la solicitud."
      : adminSession.status === "ended" ? "Sesión finalizada."
      : "Sesión no disponible.";
    $("#v2610-viewer-status").textContent = status;
    $("#v2610-viewer-waiting").hidden = adminSession.status === "active" && Boolean(adminTelemetry?.html);
    $("#v2610-annotate-button").disabled = adminSession.status !== "active";
  }

  function openAdminStream(id) {
    closeAdminStream();
    adminStream = new EventSource(`/api/live-support/${encodeURIComponent(id)}/stream`);
    adminStream.addEventListener("session", (event) => {
      const session = parseEvent(event);
      if (session?.telemetry) { adminTelemetry = session.telemetry; renderTelemetry(adminTelemetry); }
      updateViewerSession(session);
      (session?.annotations || []).forEach(renderAdminAnnotation);
    });
    adminStream.addEventListener("status", (event) => updateViewerSession(parseEvent(event)));
    adminStream.addEventListener("telemetry", (event) => {
      const payload = parseEvent(event);
      if (!payload?.telemetry) return;
      adminTelemetry = payload.telemetry;
      renderTelemetry(adminTelemetry);
    });
    adminStream.addEventListener("annotation", (event) => renderAdminAnnotation(parseEvent(event)));
    adminStream.addEventListener("ended", (event) => { updateViewerSession(parseEvent(event)); closeAdminStream(); });
  }

  function closeAdminStream() { adminStream?.close(); adminStream = null; }

  async function endAdminSupport() {
    if (!adminSession?.id) return;
    try {
      const payload = await api(`/api/live-support/${encodeURIComponent(adminSession.id)}/end`, { method: "POST", body: "{}" });
      updateViewerSession(payload.session);
    } catch (error) { window.alert(error.message); }
    finally {
      closeAdminStream();
      setTimeout(() => {
        const viewer = $("#v2610-live-viewer"); if (viewer) viewer.hidden = true;
        adminSession = null; adminTelemetry = null;
      }, 450);
    }
  }

  function mirrorDocument(html) {
    return `<!doctype html><html><head><meta charset="utf-8"><base href="${location.origin}/">
      <link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/v25.css"><link rel="stylesheet" href="/v26-1.css"><link rel="stylesheet" href="/v26-2.css"><link rel="stylesheet" href="/v26-4.css"><link rel="stylesheet" href="/v26-6.css"><link rel="stylesheet" href="/v26-9.css">
      <style>html,body{margin:0!important;min-height:100%;overflow:auto!important}body{pointer-events:none!important}.v2610-admin-launcher,.v2610-panel,.v2610-live-viewer,.v2610-support-request,.v2610-agent-indicator,.toast,.progress-bar{display:none!important}*{animation:none!important;transition:none!important;caret-color:transparent!important}</style>
      </head><body>${html || ""}</body></html>`;
  }

  function renderTelemetry(telemetry) {
    if (!telemetry) return;
    const frame = $("#v2610-mirror-frame"), scaler = $("#v2610-mirror-scaler"), waiting = $("#v2610-viewer-waiting");
    if (!frame || !scaler) return;
    const width = Math.max(240, Number(telemetry.viewport?.width || 1280));
    const height = Math.max(240, Number(telemetry.viewport?.height || 720));
    scaler.style.width = `${width}px`; scaler.style.height = `${height}px`; frame.style.width = `${width}px`; frame.style.height = `${height}px`;
    const snapshotSignature = telemetry.html ? `${telemetry.html.length}:${telemetry.html.slice(-180)}:${telemetry.view || ""}` : "";
    if (telemetry.html && frame.dataset.snapshot !== snapshotSignature) {
      frame.dataset.snapshot = snapshotSignature;
      frame.srcdoc = mirrorDocument(telemetry.html);
      frame.onload = () => {
        try {
          const doc = frame.contentDocument;
          doc?.querySelectorAll("[data-v2610-scroll-top]").forEach((node) => { node.scrollTop = Number(node.getAttribute("data-v2610-scroll-top") || 0); node.scrollLeft = Number(node.getAttribute("data-v2610-scroll-left") || 0); });
          frame.contentWindow?.scrollTo(Number(telemetry.scroll?.x || 0), Number(telemetry.scroll?.y || 0));
        } catch {}
      };
    }
    const cursor = $("#v2610-remote-cursor");
    if (cursor) { cursor.hidden = telemetry.cursor?.visible === false; cursor.style.left = `${Number(telemetry.cursor?.x || 0) * width}px`; cursor.style.top = `${Number(telemetry.cursor?.y || 0) * height}px`; }
    $("#v2610-viewer-time").textContent = telemetry.at ? `Última actualización ${new Date(telemetry.at).toLocaleTimeString("es-PY")}` : "";
    if (waiting) waiting.hidden = Boolean(telemetry.html);
    scaleMirror();
  }

  function scaleMirror() {
    const stage = $("#v2610-viewer-stage"), scaler = $("#v2610-mirror-scaler");
    if (!stage || !scaler || !adminTelemetry) return;
    const width = Math.max(240, Number(adminTelemetry.viewport?.width || 1280));
    const height = Math.max(240, Number(adminTelemetry.viewport?.height || 720));
    const scale = Math.min(stage.clientWidth / width, stage.clientHeight / height, 1);
    scaler.style.transform = `scale(${Math.max(0.15, scale)})`;
  }

  async function handleViewerAnnotation(event) {
    if (!annotationMode || !adminSession?.id || adminSession.status !== "active" || !adminTelemetry) return;
    const scaler = $("#v2610-mirror-scaler"); if (!scaler) return;
    const rect = scaler.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const text = window.prompt("Comentario para el empleado (opcional):", "") ?? null;
    if (text === null) return;
    try {
      const payload = await api(`/api/live-support/${encodeURIComponent(adminSession.id)}/annotation`, { method: "POST", body: JSON.stringify({ type: text.trim() ? "comment" : "marker", x, y, text }) });
      renderAdminAnnotation(payload.annotation);
    } catch (error) { window.alert(error.message); }
  }

  function renderAdminAnnotation(annotation) {
    if (!annotation?.id || !adminTelemetry) return;
    const layer = $("#v2610-admin-annotations");
    if (!layer || layer.querySelector(`[data-annotation-id="${cssEscape(annotation.id)}"]`)) return;
    const width = Math.max(240, Number(adminTelemetry.viewport?.width || 1280));
    const height = Math.max(240, Number(adminTelemetry.viewport?.height || 720));
    const marker = document.createElement("div");
    marker.className = "v2610-annotation-marker"; marker.dataset.annotationId = annotation.id;
    marker.style.left = `${Number(annotation.x || 0) * width}px`; marker.style.top = `${Number(annotation.y || 0) * height}px`;
    marker.innerHTML = `<span>＋</span>${annotation.text ? `<b>${escapeHtml(annotation.text)}</b>` : ""}`;
    layer.appendChild(marker);
  }

  function scheduleSupportPoll(delay = 1200) {
    clearTimeout(supportPollTimer);
    if (!currentUser || currentUser.role === "admin") return;
    supportPollTimer = setTimeout(pollAgentSupport, delay);
  }

  async function pollAgentSupport() {
    try {
      const payload = await api("/api/live-support/me");
      const session = payload.session || null;
      if (!session) { clearSupportRequest(); stopAgentLive(); }
      else if (session.status === "requested") { if (agentSession?.id !== session.id || agentSession.status !== "requested") showSupportRequest(session); agentSession = session; }
      else if (session.status === "active") { clearSupportRequest(); startAgentLive(session); }
    } catch {} finally { scheduleSupportPoll(document.hidden ? 4000 : 1200); }
  }

  function showSupportRequest(session) {
    clearSupportRequest();
    const card = document.createElement("section");
    card.id = "v2610-support-request"; card.className = "v2610-support-request";
    card.innerHTML = `<div><small>SOPORTE EN VIVO</small><b>${escapeHtml(session.adminName || "Administrador")} solicita ingresar a tu vista del CRM</b><p>Podrá ver tu pantalla dentro del CRM, el movimiento del mouse y señalar elementos para ayudarte. No accede a otras aplicaciones ni al escritorio.</p></div>
      <div class="v2610-request-actions"><button type="button" data-v2610-response="reject">Rechazar</button><button type="button" class="accept" data-v2610-response="accept">Aceptar soporte</button></div>`;
    card.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-v2610-response]"); if (!button) return;
      const accepted = button.dataset.v2610Response === "accept";
      try {
        const payload = await api(`/api/live-support/${encodeURIComponent(session.id)}/respond`, { method: "POST", body: JSON.stringify({ accepted }) });
        clearSupportRequest(); if (accepted) startAgentLive(payload.session); else stopAgentLive();
      } catch (error) { window.alert(error.message); }
    });
    document.body.appendChild(card);
  }

  function clearSupportRequest() { $("#v2610-support-request")?.remove(); }

  function startAgentLive(session) {
    if (!session?.id) return;
    if (agentSession?.id === session.id && agentSession.status === "active" && agentSnapshotTimer) return;
    stopAgentLive(false);
    agentSession = { ...session, status: "active" };
    ensureAgentIndicator(agentSession); openAgentStream(agentSession.id);
    window.addEventListener("mousemove", captureMouse, { passive: true }); window.addEventListener("mouseleave", hideMouse, { passive: true });
    sendAgentTelemetry(true);
    agentSnapshotTimer = setInterval(() => sendAgentTelemetry(true), 1400);
    agentMouseTimer = setInterval(() => { if (Date.now() - lastMouseSentAt >= 220) sendAgentTelemetry(false); }, 240);
  }

  function ensureAgentIndicator(session) {
    let indicator = $("#v2610-agent-indicator");
    if (!indicator) { indicator = document.createElement("div"); indicator.id = "v2610-agent-indicator"; indicator.className = "v2610-agent-indicator"; document.body.appendChild(indicator); }
    indicator.classList.toggle("urgent", session.mode === "urgent");
    indicator.innerHTML = `<span class="v2610-live-dot"></span><div><b>${session.mode === "urgent" ? "Soporte urgente activo" : "Soporte en vivo activo"}</b><small>${escapeHtml(session.adminName || "Administrador")} está viendo únicamente tu sesión del CRM.</small></div>`;
  }

  function stopAgentLive(clearSession = true) {
    if (agentSnapshotTimer) clearInterval(agentSnapshotTimer); if (agentMouseTimer) clearInterval(agentMouseTimer);
    agentSnapshotTimer = null; agentMouseTimer = null; agentStream?.close(); agentStream = null;
    window.removeEventListener("mousemove", captureMouse); window.removeEventListener("mouseleave", hideMouse);
    $("#v2610-agent-indicator")?.remove(); $$(".v2610-agent-annotation").forEach((node) => node.remove());
    if (clearSession) agentSession = null;
  }

  function openAgentStream(id) {
    agentStream?.close(); agentStream = new EventSource(`/api/live-support/${encodeURIComponent(id)}/stream`);
    agentStream.addEventListener("annotation", (event) => showAgentAnnotation(parseEvent(event)));
    agentStream.addEventListener("ended", () => stopAgentLive());
    agentStream.addEventListener("status", (event) => { const session = parseEvent(event); if (["ended", "rejected", "expired"].includes(session?.status)) stopAgentLive(); });
  }

  function captureMouse(event) { lastMouse = { x: window.innerWidth ? event.clientX / window.innerWidth : 0, y: window.innerHeight ? event.clientY / window.innerHeight : 0, visible: true }; }
  function hideMouse() { lastMouse.visible = false; }
  function currentViewName() { return $(".nav-item.active")?.dataset.view || $("[data-view-panel]:not([hidden])")?.dataset.viewPanel || ""; }

  function buildSnapshot() {
    const source = $("#app-shell") || document.body; if (!source) return "";
    const clone = source.cloneNode(true); clone.id = source.id ? `${source.id}-v2610-mirror` : "v2610-mirror-root";
    const actualNodes = [source, ...source.querySelectorAll("*")];
    const clonedNodes = [clone, ...clone.querySelectorAll("*")];
    const count = Math.min(actualNodes.length, clonedNodes.length);
    const blockedSelector = "script,iframe,object,embed,video,audio,source,input[type='hidden'],#v2610-admin-launcher,#v2610-admin-panel,#v2610-live-viewer,#v2610-support-request,#v2610-agent-indicator,.v2610-agent-annotation,.toast,.progress-bar";
    for (let i = 0; i < count; i += 1) {
      const actual = actualNodes[i], copy = clonedNodes[i];
      if (!(actual instanceof Element) || !(copy instanceof Element)) continue;
      if (actual.matches?.(blockedSelector) || actual.closest?.("#v2610-admin-panel,#v2610-live-viewer,#v2610-support-request,#v2610-agent-indicator,.v2610-agent-annotation")) { copy.setAttribute("data-v2610-remove", "1"); continue; }
      const style = getComputedStyle(actual), rect = actual.getBoundingClientRect();
      const farOutside = rect.bottom < -800 || rect.top > window.innerHeight + 800 || rect.right < -800 || rect.left > window.innerWidth + 800;
      if (style.display === "none" || style.visibility === "hidden" || farOutside) copy.setAttribute("data-v2610-remove", "1");
      if (actual.scrollTop > 0) copy.setAttribute("data-v2610-scroll-top", String(Math.round(actual.scrollTop)));
      if (actual.scrollLeft > 0) copy.setAttribute("data-v2610-scroll-left", String(Math.round(actual.scrollLeft)));
      for (const attr of [...copy.attributes]) if (/^on/i.test(attr.name) || ["nonce", "integrity", "srcdoc"].includes(attr.name)) copy.removeAttribute(attr.name);
      if (actual instanceof HTMLInputElement) {
        if (actual.type === "password" || actual.type === "file") copy.setAttribute("value", ""); else copy.setAttribute("value", actual.value || "");
        if (actual.checked) copy.setAttribute("checked", "checked"); else copy.removeAttribute("checked");
      } else if (actual instanceof HTMLTextAreaElement) copy.textContent = actual.value || "";
      else if (actual instanceof HTMLSelectElement) {
        const options = copy.querySelectorAll("option"); options.forEach((option, index) => { if (index === actual.selectedIndex) option.setAttribute("selected", "selected"); else option.removeAttribute("selected"); });
      }
    }
    clone.querySelectorAll("[data-v2610-remove='1']").forEach((node) => node.remove());
    let html = clone.outerHTML; if (html.length > 90000) html = buildWireframe();
    return html.slice(0, 92000);
  }

  function buildWireframe() {
    const elements = $$("button,input,textarea,select,a,h1,h2,h3,h4,p,small,strong,.deal-card,.nav-item,.message-bubble,.metric-card")
      .filter((node) => {
        if (node.closest("#v2610-admin-panel,#v2610-live-viewer,#v2610-support-request,#v2610-agent-indicator")) return false;
        const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2 && rect.bottom >= 0 && rect.top <= window.innerHeight && rect.right >= 0 && rect.left <= window.innerWidth;
      }).slice(0, 360);
    const rows = elements.map((node) => {
      const rect = node.getBoundingClientRect();
      const text = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement ? (node.type === "password" ? "" : node.value) : node.textContent;
      return `<div style="position:fixed;left:${Math.round(rect.left)}px;top:${Math.round(rect.top)}px;width:${Math.round(rect.width)}px;height:${Math.round(rect.height)}px;border:1px solid #d8dbe2;border-radius:7px;background:#fff;overflow:hidden;padding:3px;font:11px system-ui;color:#222">${escapeHtml(String(text || "").trim().slice(0,180))}</div>`;
    }).join("");
    return `<div style="position:fixed;inset:0;background:#f3f4f6">${rows}</div>`;
  }

  async function sendAgentTelemetry(withSnapshot) {
    if (!agentSession?.id || agentSession.status !== "active") return;
    const payload = { path: `${location.pathname}${location.search}`, view: currentViewName(), title: document.title, viewport: { width: window.innerWidth, height: window.innerHeight }, scroll: { x: window.scrollX, y: window.scrollY }, cursor: lastMouse };
    if (withSnapshot) payload.html = buildSnapshot();
    try { await api(`/api/live-support/${encodeURIComponent(agentSession.id)}/telemetry`, { method: "POST", body: JSON.stringify(payload) }); lastMouseSentAt = Date.now(); } catch {}
  }

  function showAgentAnnotation(annotation) {
    if (!annotation?.id) return;
    const marker = document.createElement("div"); marker.className = "v2610-agent-annotation";
    marker.style.left = `${Math.max(0, Math.min(1, Number(annotation.x || 0))) * window.innerWidth}px`; marker.style.top = `${Math.max(0, Math.min(1, Number(annotation.y || 0))) * window.innerHeight}px`;
    marker.innerHTML = `<span>＋</span><div><b>${escapeHtml(annotation.adminName || "Administrador")}</b>${annotation.text ? `<small>${escapeHtml(annotation.text)}</small>` : "<small>Revisá este punto.</small>"}</div>`;
    document.body.appendChild(marker); setTimeout(() => marker.remove(), 22000);
  }

  async function loadBotLines() {
    const list = $("#v2610-line-list"); if (!list) return;
    try {
      const payload = await api("/api/whatsapp-lines"), lines = payload.lines || []; window.__v2610Lines = lines;
      list.innerHTML = lines.length ? lines.map((line) => {
        const config = line.botConfig || {};
        return `<button type="button" class="v2610-line-card" data-v2610-bot-line="${escapeAttr(line.id)}"><span><b>${escapeHtml(line.name)}</b><small>${escapeHtml(line.phone || line.connection?.account || "Número pendiente")} · ${escapeHtml(line.branchName || line.routingBranchName || "Sucursal")}</small></span><span class="${config.enabled === false || line.botEnabled === false ? "off" : "on"}">${config.enabled === false || line.botEnabled === false ? "Bot apagado" : "Bot activo"}</span></button>`;
      }).join("") : `<div class="v2610-empty">No hay líneas configuradas.</div>`;
      if (lines[0]) renderBotEditor(lines[0]);
    } catch (error) { list.innerHTML = `<div class="v2610-error">${escapeHtml(error.message)}</div>`; }
  }

  function renderBotEditor(line) {
    const editor = $("#v2610-bot-editor"); if (!editor) return;
    const config = line.botConfig || {}; editor.dataset.lineId = line.id;
    editor.innerHTML = `<form class="v2610-bot-form" onsubmit="return false">
      <div class="v2610-bot-title"><div><small>CONFIGURACIÓN INDEPENDIENTE</small><h3>${escapeHtml(line.name)}</h3><p>${escapeHtml(line.phone || line.connection?.account || "Número pendiente")}</p></div><span>${escapeHtml(line.provider === "cloud" ? "Cloud API" : "QR")}</span></div>
      <div class="v2610-bot-switches">
        <label><span><b>Bot automático</b><small>Activa respuestas automáticas en este número.</small></span><input id="v2610-bot-enabled" type="checkbox" ${config.enabled !== false && line.botEnabled !== false ? "checked" : ""}></label>
        <label><span><b>Usar instrucciones globales</b><small>Combina las reglas generales de la empresa con las de este número.</small></span><input id="v2610-bot-global" type="checkbox" ${config.useGlobalInstructions !== false ? "checked" : ""}></label>
        <label><span><b>Puede reservar stock</b><small>Permite al bot reservar solo con confirmación explícita del cliente.</small></span><input id="v2610-bot-reserve" type="checkbox" ${config.canReserve !== false ? "checked" : ""}></label>
        <label><span><b>Seguimiento automático</b><small>Permite seguimiento desde este número cuando corresponda.</small></span><input id="v2610-bot-followup" type="checkbox" ${config.followupEnabled !== false ? "checked" : ""}></label>
      </div>
      <div class="v2610-bot-grid"><label><span>Modelo</span><input id="v2610-bot-model" value="${escapeAttr(config.model || "gpt-4.1-mini")}" list="v2610-model-list"><datalist id="v2610-model-list"><option value="gpt-4.1-mini"><option value="gpt-4.1"><option value="gpt-5-mini"></datalist></label><label><span>Tono</span><select id="v2610-bot-tone">${["profesional","amable","comercial","breve","soporte"].map((tone) => `<option value="${tone}" ${config.tone === tone ? "selected" : ""}>${tone[0].toUpperCase()+tone.slice(1)}</option>`).join("")}</select></label></div>
      <label class="v2610-bot-text"><span>Instrucciones específicas de este número</span><textarea id="v2610-bot-instructions" rows="7" placeholder="Ej.: Este número atiende exclusivamente servicio técnico. Pedí número de equipo y ciudad antes de derivar…">${escapeHtml(config.instructions || "")}</textarea></label>
      <label class="v2610-bot-text"><span>Mensaje de seguimiento de este número</span><textarea id="v2610-bot-followup-message" rows="3">${escapeHtml(config.followupMessage || "")}</textarea></label>
      <button type="button" class="v2610-save-bot" data-v2610-bot-save>Guardar configuración de este número</button></form>`;
  }

  async function saveBotEditor() {
    const editor = $("#v2610-bot-editor"), lineId = editor?.dataset.lineId; if (!lineId) return;
    const button = $("[data-v2610-bot-save]", editor); if (button) { button.disabled = true; button.textContent = "Guardando…"; }
    try {
      const payload = { enabled: $("#v2610-bot-enabled", editor)?.checked !== false, useGlobalInstructions: $("#v2610-bot-global", editor)?.checked !== false, canReserve: $("#v2610-bot-reserve", editor)?.checked !== false, followupEnabled: $("#v2610-bot-followup", editor)?.checked !== false, model: $("#v2610-bot-model", editor)?.value || "gpt-4.1-mini", tone: $("#v2610-bot-tone", editor)?.value || "profesional", instructions: $("#v2610-bot-instructions", editor)?.value || "", followupMessage: $("#v2610-bot-followup-message", editor)?.value || "" };
      await api(`/api/whatsapp-lines/${encodeURIComponent(lineId)}/bot-config`, { method: "POST", body: JSON.stringify(payload) }); await loadBotLines();
    } catch (error) { window.alert(error.message); }
    finally { if (button) { button.disabled = false; button.textContent = "Guardar configuración de este número"; } }
  }

  function parseEvent(event) { try { return JSON.parse(event.data || "{}"); } catch { return {}; } }
  function initials(value) { return String(value || "U").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase(); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
  function escapeAttr(value) { return escapeHtml(value); }
  function cssEscape(value) { return window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }

  function boot() {
    loadIdentity();
    window.addEventListener("crm:state", () => { setTimeout(() => { restoreOperationalWhatsapp(); if (!currentUser) loadIdentity(); }, 0); });
    document.addEventListener("visibilitychange", () => scheduleSupportPoll(document.hidden ? 4000 : 300));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
