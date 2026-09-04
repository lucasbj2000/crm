(() => {
  "use strict";

  const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
  let lines = [];
  let loading = false;

  function user() {
    try { return typeof appState !== "undefined" ? appState?.currentUser || null : null; }
    catch { return null; }
  }

  async function apiLocal(path, options = {}) {
    if (typeof api === "function") return api(path, options);
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
    try { payload = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);
    return payload;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  }

  function escapeAttr(value) { return escapeHtml(value); }

  function ensureLauncher() {
    const admin = user()?.role === "admin";
    const existing = $("#v2610-admin-launcher");
    if (!admin) {
      existing?.remove();
      $("#v2610-admin-panel")?.remove();
      return;
    }
    if (existing) return;
    const button = document.createElement("button");
    button.id = "v2610-admin-launcher";
    button.type = "button";
    button.className = "v2610-admin-launcher";
    button.innerHTML = "<span>🤖</span><span>Bots por número</span>";
    button.addEventListener("click", openPanel);
    document.body.appendChild(button);
  }

  function panelMarkup() {
    return `
      <div class="v2610-panel-backdrop" data-v2610-close></div>
      <section class="v2610-panel-card" role="dialog" aria-modal="true" aria-label="Bots por número de WhatsApp">
        <header class="v2610-panel-head">
          <div><small>ADMINISTRACIÓN</small><h2>Bots por número</h2><p>Cada línea puede tener instrucciones y comportamiento propios.</p></div>
          <button type="button" class="v2610-icon-button" data-v2610-close aria-label="Cerrar">×</button>
        </header>
        <div class="v2610-panel-body">
          <div class="v2610-note">La configuración es independiente por número. La API Key continúa siendo general y no se expone en este panel.</div>
          <div class="v2610-layout">
            <div id="v2610-line-list" class="v2610-line-list"><div class="v2610-loading">Cargando líneas…</div></div>
            <div id="v2610-bot-editor" class="v2610-bot-editor"><div class="v2610-empty">Seleccioná una línea.</div></div>
          </div>
        </div>
      </section>`;
  }

  function openPanel() {
    if (user()?.role !== "admin") return;
    let panel = $("#v2610-admin-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "v2610-admin-panel";
      panel.className = "v2610-panel";
      panel.innerHTML = panelMarkup();
      panel.addEventListener("click", handlePanelClick);
      document.body.appendChild(panel);
    }
    panel.hidden = false;
    void loadBotLines();
  }

  function closePanel() {
    const panel = $("#v2610-admin-panel");
    if (panel) panel.hidden = true;
  }

  async function handlePanelClick(event) {
    if (event.target.closest("[data-v2610-close]")) return closePanel();
    const lineButton = event.target.closest("[data-v2610-bot-line]");
    if (lineButton) {
      const line = lines.find((entry) => entry.id === lineButton.dataset.v2610BotLine);
      if (line) renderBotEditor(line);
      return;
    }
    if (event.target.closest("[data-v2610-bot-save]")) await saveBotEditor();
  }

  async function loadBotLines() {
    const list = $("#v2610-line-list");
    if (!list || loading) return;
    loading = true;
    try {
      const payload = await apiLocal("/api/whatsapp-lines");
      lines = Array.isArray(payload.lines) ? payload.lines : [];
      list.innerHTML = lines.length ? lines.map((line) => {
        const config = line.botConfig || {};
        const enabled = config.enabled !== false && line.botEnabled !== false;
        return `<button type="button" class="v2610-line-card" data-v2610-bot-line="${escapeAttr(line.id)}">
          <span><b>${escapeHtml(line.name || "Línea")}</b><small>${escapeHtml(line.phone || line.connection?.account || "Número pendiente")} · ${escapeHtml(line.branchName || line.routingBranchName || "Sucursal")}</small></span>
          <span class="${enabled ? "on" : "off"}">${enabled ? "Bot activo" : "Bot apagado"}</span>
        </button>`;
      }).join("") : `<div class="v2610-empty">No hay líneas configuradas.</div>`;
      const selectedId = $("#v2610-bot-editor")?.dataset.lineId;
      const selected = lines.find((line) => line.id === selectedId) || lines[0];
      if (selected) renderBotEditor(selected);
    } catch (error) {
      list.innerHTML = `<div class="v2610-error">${escapeHtml(error.message || "No se pudieron cargar las líneas.")}</div>`;
    } finally {
      loading = false;
    }
  }

  function renderBotEditor(line) {
    const editor = $("#v2610-bot-editor");
    if (!editor) return;
    editor.dataset.lineId = line.id;
    document.querySelectorAll("[data-v2610-bot-line]").forEach((button) => button.classList.toggle("active", button.dataset.v2610BotLine === line.id));
    const config = line.botConfig || {};
    editor.innerHTML = `<form class="v2610-bot-form" onsubmit="return false">
      <div class="v2610-bot-title"><div><small>CONFIGURACIÓN INDEPENDIENTE</small><h3>${escapeHtml(line.name || "Línea")}</h3><p>${escapeHtml(line.phone || line.connection?.account || "Número pendiente")}</p></div><span>${escapeHtml(line.provider === "cloud" ? "Cloud API" : "QR")}</span></div>
      <div class="v2610-bot-switches">
        <label><span><b>Bot automático</b><small>Responde automáticamente desde este número.</small></span><input id="v2610-bot-enabled" type="checkbox" ${config.enabled !== false && line.botEnabled !== false ? "checked" : ""}></label>
        <label><span><b>Usar instrucciones globales</b><small>Combina reglas generales y específicas.</small></span><input id="v2610-bot-global" type="checkbox" ${config.useGlobalInstructions !== false ? "checked" : ""}></label>
        <label><span><b>Puede reservar stock</b><small>Permite reservar cuando el cliente confirma.</small></span><input id="v2610-bot-reserve" type="checkbox" ${config.canReserve !== false ? "checked" : ""}></label>
        <label><span><b>Seguimiento automático</b><small>Activa seguimientos para esta línea.</small></span><input id="v2610-bot-followup" type="checkbox" ${config.followupEnabled !== false ? "checked" : ""}></label>
      </div>
      <div class="v2610-bot-grid">
        <label><span>Modelo</span><input id="v2610-bot-model" value="${escapeAttr(config.model || "gpt-4.1-mini")}" list="v2610-model-list"><datalist id="v2610-model-list"><option value="gpt-4.1-mini"><option value="gpt-4.1"><option value="gpt-5-mini"></datalist></label>
        <label><span>Tono</span><select id="v2610-bot-tone">${["profesional","amable","comercial","breve","soporte"].map((tone) => `<option value="${tone}" ${config.tone === tone ? "selected" : ""}>${tone[0].toUpperCase()+tone.slice(1)}</option>`).join("")}</select></label>
      </div>
      <label class="v2610-bot-text"><span>Instrucciones específicas</span><textarea id="v2610-bot-instructions" rows="7" placeholder="Ej.: Este número atiende exclusivamente servicio técnico…">${escapeHtml(config.instructions || "")}</textarea></label>
      <label class="v2610-bot-text"><span>Mensaje de seguimiento</span><textarea id="v2610-bot-followup-message" rows="3">${escapeHtml(config.followupMessage || "")}</textarea></label>
      <button type="button" class="v2610-save-bot" data-v2610-bot-save>Guardar configuración</button>
    </form>`;
  }

  async function saveBotEditor() {
    const editor = $("#v2610-bot-editor");
    const lineId = editor?.dataset.lineId;
    if (!lineId) return;
    const button = $("[data-v2610-bot-save]", editor);
    if (button) { button.disabled = true; button.textContent = "Guardando…"; }
    try {
      const payload = {
        enabled: $("#v2610-bot-enabled", editor)?.checked !== false,
        useGlobalInstructions: $("#v2610-bot-global", editor)?.checked !== false,
        canReserve: $("#v2610-bot-reserve", editor)?.checked !== false,
        followupEnabled: $("#v2610-bot-followup", editor)?.checked !== false,
        model: $("#v2610-bot-model", editor)?.value || "gpt-4.1-mini",
        tone: $("#v2610-bot-tone", editor)?.value || "profesional",
        instructions: $("#v2610-bot-instructions", editor)?.value || "",
        followupMessage: $("#v2610-bot-followup-message", editor)?.value || "",
      };
      await apiLocal(`/api/whatsapp-lines/${encodeURIComponent(lineId)}/bot-config`, { method: "POST", body: JSON.stringify(payload) });
      await loadBotLines();
      try { typeof showToast === "function" && showToast("Configuración del bot guardada"); } catch {}
    } catch (error) {
      try { typeof showToast === "function" ? showToast(error.message, "warning") : window.alert(error.message); } catch { window.alert(error.message); }
    } finally {
      if (button) { button.disabled = false; button.textContent = "Guardar configuración"; }
    }
  }

  function syncRole() { ensureLauncher(); }

  function boot() {
    syncRole();
    setTimeout(syncRole, 500);
    setTimeout(syncRole, 1500);
    window.addEventListener("crm:state", () => requestAnimationFrame(syncRole));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
