(() => {
  "use strict";

  const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
  const $$ = (selector, root = document) => Array.from(root?.querySelectorAll?.(selector) || []);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  const providers = {
    whatsapp: { label:"WhatsApp", icon:"◉", note:"QR o WhatsApp Cloud API. La configuración existente se mantiene sin cambios.", inbox:true },
    facebook: { label:"Facebook", icon:"f", note:"Conectá una Página mediante Meta Graph API y dejala lista para Messenger.", inbox:true },
    instagram: { label:"Instagram", icon:"◎", note:"Conectá una cuenta profesional vinculada a Meta para atención por Instagram.", inbox:true },
    tiktok: { label:"TikTok", icon:"♪", note:"Conectá la cuenta y validá acceso a TikTok for Developers. La bandeja DM depende de las APIs y permisos aprobados.", inbox:false },
  };
  const statusLabels = { connected:"Conectado", error:"Error", needs_credentials:"Por validar", disconnected:"Desconectado" };
  let payload = { connections:[], canManage:false, providers:{} };
  let activeConnectionId = "";
  let activeProvider = "facebook";
  let refreshTimer = null;

  function notify(message, tone="success") { try { if (typeof showToast === "function") return showToast(message, tone); } catch {} console.log(message); }
  async function request(url, options = {}) {
    const next = { ...options };
    if (next.body && typeof next.body === "object" && !(next.body instanceof FormData) && !(next.body instanceof Blob)) next.body = JSON.stringify(next.body);
    try { if (typeof api === "function") return await api(url, next); } catch (error) { throw error; }
    const response = await fetch(url, { credentials:"same-origin", cache:"no-store", ...next, headers: next.body && typeof next.body === "string" ? { "Content-Type":"application/json", ...(next.headers || {}) } : next.headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
    return data;
  }
  function appVisible() { const shell = $("#app-shell"); return Boolean(shell && !shell.hidden); }
  function currentUser() { try { return typeof appState !== "undefined" ? appState?.currentUser || null : null; } catch { return null; } }
  function currentBranches() { try { return typeof appState !== "undefined" ? appState?.branches || [] : []; } catch { return []; } }
  function currentUsers() { try { return typeof appState !== "undefined" ? appState?.users || [] : []; } catch { return []; } }
  function fmtDate(value) { const d = new Date(value || ""); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-PY", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }); }

  function ensureNavigationCopy() {
    const nav = $('[data-view="whatsapp"] .nav-item, .nav-item[data-view="whatsapp"]');
    const button = $('.nav-item[data-view="whatsapp"]');
    const label = button?.querySelector("b");
    if (label && label.textContent !== "Canales y bot") label.textContent = "Canales y bot";
    const master = $('[data-master-view="whatsapp"]'); if (master) master.textContent = "Canales";
    if ($('[data-view-panel="whatsapp"]')?.classList.contains("active")) {
      if ($("#header-section")) $("#header-section").textContent = "CANALES";
      if ($("#header-title")) $("#header-title").textContent = "Canales y automatización";
    }
  }

  function createUi() {
    if ($("#v2510-social-hub")) return;
    const panel = $('[data-view-panel="whatsapp"]');
    if (!panel) return;
    const hub = document.createElement("section");
    hub.id = "v2510-social-hub";
    hub.className = "v2510-social-hub";
    hub.innerHTML = '<div class="v2510-social-head"><div><p>CENTRO DE CANALES</p><h3>Redes sociales y mensajería</h3><small>Conectá los canales de esta empresa, verificá el acceso y definí qué usuarios pueden utilizarlos.</small></div><div class="v2510-social-summary" id="v2510-social-summary"><span>0 conectados</span></div></div><div class="v2510-channel-grid" id="v2510-channel-grid"><div class="v2510-social-loading">Cargando canales…</div></div>';
    panel.insertBefore(hub, panel.firstChild);

    const dialog = document.createElement("dialog");
    dialog.id = "v2510-social-dialog";
    dialog.className = "v2510-social-dialog";
    dialog.innerHTML = `<form class="v2510-social-dialog-card" id="v2510-social-form"><div class="v2510-dialog-head"><div><h3 id="v2510-dialog-title">Conectar red social</h3><p>Las credenciales se guardan únicamente dentro de la empresa activa.</p></div><button class="v2510-dialog-close" type="button" data-v2510-close>×</button></div><div class="v2510-provider-banner"><span id="v2510-provider-icon">f</span><div><strong id="v2510-provider-name">Facebook</strong><small id="v2510-provider-copy"></small></div></div><div class="v2510-form-grid"><label>Nombre interno<input id="v2510-label" maxlength="180" placeholder="Ej.: Facebook Casa Central"></label><label>Sucursal<select id="v2510-branch"><option value="">Todas / corporativo</option></select></label><div class="v2510-provider-fields" data-v2510-meta><label>App ID de Meta<input id="v2510-app-id" maxlength="220" autocomplete="off" placeholder="ID de la app"></label><label>Graph API<select id="v2510-graph-version"><option value="v26.0">v26.0</option><option value="v25.0">v25.0</option><option value="v24.0">v24.0</option></select></label><label>Page ID<input id="v2510-page-id" maxlength="220" autocomplete="off" placeholder="ID de la Página"></label><label data-v2510-instagram-account>Instagram Account ID<input id="v2510-account-id" maxlength="220" autocomplete="off" placeholder="Opcional si la Page ID lo resuelve"></label><label>Business ID<input id="v2510-business-id" maxlength="220" autocomplete="off" placeholder="Opcional"></label></div><div class="v2510-provider-fields" data-v2510-tiktok hidden><label>Client Key<input id="v2510-client-key" maxlength="220" autocomplete="off" placeholder="TikTok Client Key"></label><label>Open ID / Account ID<input id="v2510-tiktok-account-id" maxlength="220" autocomplete="off" placeholder="Se completa al validar si está vacío"></label></div><label class="v2510-field-wide">Token de acceso<input id="v2510-access-token" type="password" autocomplete="new-password" placeholder="Pegá un token nuevo"><span class="v2510-secret-help" id="v2510-token-help">El token nunca se vuelve a mostrar completo. Al editar, dejalo vacío para conservar el actual.</span></label><label class="v2510-field-wide">Usuarios autorizados<select id="v2510-users" multiple></select><span class="v2510-secret-help">Si no seleccionás usuarios, el canal queda disponible para quienes tengan acceso a esta empresa/sucursal.</span></label><div class="v2510-api-note" id="v2510-api-note"></div></div><div class="v2510-dialog-actions"><button type="button" data-v2510-close>Cancelar</button><button class="primary" id="v2510-save" type="submit">Guardar conexión</button></div></form>`;
    document.body.appendChild(dialog);
    $$('[data-v2510-close]', dialog).forEach((button) => button.addEventListener("click", () => dialog.close()));
    $("#v2510-social-form").addEventListener("submit", saveConnection);
    hub.addEventListener("click", handleHubClick);
  }

  function whatsappStatus() {
    const pill = $("#connection-pill span")?.textContent?.trim() || "Configurar";
    const connected = /conectad|vinculad/i.test(pill) && !/sin|des/i.test(pill);
    return { status: connected ? "connected" : "needs_credentials", label: pill };
  }

  function providerConnections(provider) { return (payload.connections || []).filter((connection) => connection.provider === provider); }
  function connectionRow(connection) {
    const detail = connection.accountName || connection.handle || connection.accountId || connection.pageId || "Cuenta configurada";
    const status = connection.status || "needs_credentials";
    return `<div class="v2510-connection-row"><header><strong>${esc(connection.label || providers[connection.provider]?.label)}</strong><span class="v2510-channel-status" data-status="${esc(status)}">${esc(statusLabels[status] || status)}</span></header><small>${esc(detail)}${connection.lastTestAt ? ` · probado ${esc(fmtDate(connection.lastTestAt))}` : ""}</small>${payload.canManage ? `<div class="v2510-connection-actions"><button type="button" data-v2510-action="test" data-id="${esc(connection.id)}">Probar</button><button type="button" data-v2510-action="edit" data-id="${esc(connection.id)}">Configurar</button><button class="danger" type="button" data-v2510-action="delete" data-id="${esc(connection.id)}">Quitar</button></div>` : ""}</div>`;
  }
  function providerCard(key) {
    const meta = providers[key];
    if (key === "whatsapp") {
      const state = whatsappStatus();
      return `<article class="v2510-channel-card"><div class="v2510-channel-top"><span class="v2510-channel-icon">${meta.icon}</span><div class="v2510-channel-title"><strong>${meta.label}</strong><small>WhatsApp Business</small></div><span class="v2510-channel-status" data-status="${state.status}">${esc(state.label)}</span></div><div class="v2510-channel-note">${esc(meta.note)}</div><div class="v2510-capability"><b>Mensajería:</b> disponible</div><button class="v2510-channel-add" type="button" data-v2510-whatsapp>Gestionar WhatsApp</button></article>`;
    }
    const rows = providerConnections(key);
    const connected = rows.filter((row) => row.status === "connected").length;
    const cardStatus = connected ? "connected" : rows.some((row) => row.status === "error") ? "error" : "needs_credentials";
    return `<article class="v2510-channel-card"><div class="v2510-channel-top"><span class="v2510-channel-icon">${meta.icon}</span><div class="v2510-channel-title"><strong>${meta.label}</strong><small>${rows.length ? `${rows.length} cuenta${rows.length===1?"":"s"}` : "Sin cuentas"}</small></div><span class="v2510-channel-status" data-status="${cardStatus}">${connected ? `${connected} conectado${connected===1?"":"s"}` : rows.length ? "Por validar" : "Disponible"}</span></div><div class="v2510-channel-note">${esc(meta.note)}</div><div class="v2510-channel-connections">${rows.map(connectionRow).join("")}</div><div class="v2510-capability"><b>Mensajería CRM:</b> ${meta.inbox ? "preparada para integración" : "sujeta a API/permisos del proveedor"}</div>${payload.canManage ? `<button class="v2510-channel-add" type="button" data-v2510-add="${key}">＋ Conectar cuenta</button>` : ""}</article>`;
  }
  function render() {
    ensureNavigationCopy();
    const grid = $("#v2510-channel-grid"); if (!grid) return;
    grid.innerHTML = ["whatsapp","facebook","instagram","tiktok"].map(providerCard).join("");
    const connectedSocial = (payload.connections || []).filter((connection) => connection.status === "connected").length;
    const wa = whatsappStatus().status === "connected" ? 1 : 0;
    const total = connectedSocial + wa;
    $("#v2510-social-summary").innerHTML = `<span>● ${total} conectado${total===1?"":"s"}</span><span>${payload.canManage ? "Administración de canales" : "Vista de canales asignados"}</span>`;
  }

  function fillDialog(provider, connection = null) {
    activeProvider = provider;
    activeConnectionId = connection?.id || "";
    const meta = providers[provider];
    $("#v2510-dialog-title").textContent = connection ? `Configurar ${meta.label}` : `Conectar ${meta.label}`;
    $("#v2510-provider-icon").textContent = meta.icon;
    $("#v2510-provider-name").textContent = meta.label;
    $("#v2510-provider-copy").textContent = meta.note;
    $("#v2510-label").value = connection?.label || `${meta.label} principal`;
    $("#v2510-app-id").value = connection?.appId || "";
    $("#v2510-graph-version").value = connection?.graphVersion || "v26.0";
    $("#v2510-page-id").value = connection?.pageId || "";
    $("#v2510-account-id").value = connection?.accountId || "";
    $("#v2510-business-id").value = connection?.businessId || "";
    $("#v2510-client-key").value = connection?.clientKey || "";
    $("#v2510-tiktok-account-id").value = connection?.accountId || "";
    $("#v2510-access-token").value = "";
    $("#v2510-token-help").textContent = connection?.hasAccessToken ? `Token guardado ${connection.tokenPreview || ""}. Dejalo vacío para conservarlo.` : "Pegá el token emitido por el proveedor. No se volverá a mostrar completo.";
    const branches = currentBranches();
    $("#v2510-branch").innerHTML = '<option value="">Todas / corporativo</option>' + branches.map((branch) => `<option value="${esc(branch.id)}">${esc(branch.name || branch.label || branch.id)}</option>`).join("");
    $("#v2510-branch").value = connection?.branchId || "";
    const users = currentUsers().filter((user) => user.active !== false);
    $("#v2510-users").innerHTML = users.map((user) => `<option value="${esc(user.id)}" ${(connection?.allowedUserIds || []).includes(user.id) ? "selected" : ""}>${esc(user.name || user.username)} · ${esc(user.role || "usuario")}</option>`).join("");
    $('[data-v2510-meta]').hidden = provider === "tiktok";
    $('[data-v2510-tiktok]').hidden = provider !== "tiktok";
    $('[data-v2510-instagram-account]').hidden = provider !== "instagram";
    $("#v2510-api-note").innerHTML = provider === "facebook" ? '<strong>Facebook:</strong> usá un Page Access Token con los permisos aprobados para la Página. “Probar” consulta Meta y confirma que el Page ID responde.' : provider === "instagram" ? '<strong>Instagram:</strong> requiere una cuenta profesional vinculada al ecosistema Meta. Podés indicar el Instagram Account ID directamente o dejar que el CRM lo resuelva desde la Page ID.' : '<strong>TikTok:</strong> la validación usa TikTok for Developers y el scope básico de usuario. La conexión no implica que exista una API pública de bandeja DM equivalente a Messenger.';
    $("#v2510-social-dialog").showModal();
  }

  async function saveConnection(event) {
    event.preventDefault();
    const button = $("#v2510-save"); button.disabled = true; button.textContent = "Guardando…";
    const allowedUserIds = Array.from($("#v2510-users").selectedOptions || []).map((option) => option.value);
    const body = {
      provider: activeProvider,
      label: $("#v2510-label").value,
      branchId: $("#v2510-branch").value,
      allowedUserIds,
      appId: activeProvider === "tiktok" ? "" : $("#v2510-app-id").value,
      graphVersion: activeProvider === "tiktok" ? "" : $("#v2510-graph-version").value,
      pageId: activeProvider === "tiktok" ? "" : $("#v2510-page-id").value,
      accountId: activeProvider === "tiktok" ? $("#v2510-tiktok-account-id").value : $("#v2510-account-id").value,
      businessId: activeProvider === "tiktok" ? "" : $("#v2510-business-id").value,
      clientKey: activeProvider === "tiktok" ? $("#v2510-client-key").value : "",
    };
    const token = $("#v2510-access-token").value.trim(); if (token) body.accessToken = token;
    try {
      if (activeConnectionId) await request(`/api/social/connections/${encodeURIComponent(activeConnectionId)}`, { method:"PUT", body });
      else await request("/api/social/connections", { method:"POST", body });
      $("#v2510-social-dialog").close();
      await load();
      notify("Conexión guardada. Usá “Probar” para validarla con el proveedor.");
    } catch (error) { notify(error.message || "No se pudo guardar la conexión.", "warning"); }
    finally { button.disabled = false; button.textContent = "Guardar conexión"; }
  }

  async function handleHubClick(event) {
    const add = event.target.closest?.("[data-v2510-add]");
    if (add) return fillDialog(add.dataset.v2510Add);
    if (event.target.closest?.("[data-v2510-whatsapp]")) {
      const target = $("#whatsapp-mode") || $(".qr-panel"); target?.scrollIntoView?.({ behavior:"smooth", block:"start" }); return;
    }
    const action = event.target.closest?.("[data-v2510-action]"); if (!action) return;
    const connection = (payload.connections || []).find((entry) => entry.id === action.dataset.id); if (!connection) return;
    if (action.dataset.v2510Action === "edit") return fillDialog(connection.provider, connection);
    if (action.dataset.v2510Action === "test") {
      const original = action.textContent; action.disabled = true; action.textContent = "Probando…";
      try { await request(`/api/social/connections/${encodeURIComponent(connection.id)}/test`, { method:"POST", body:{} }); await load(); notify(`${providers[connection.provider].label} conectado correctamente.`); }
      catch (error) { await load(); notify(error.message || "No se pudo validar la conexión.", "warning"); }
      finally { action.disabled = false; action.textContent = original; }
      return;
    }
    if (action.dataset.v2510Action === "delete") {
      if (!window.confirm(`¿Quitar la conexión “${connection.label || providers[connection.provider].label}”?`)) return;
      try { await request(`/api/social/connections/${encodeURIComponent(connection.id)}`, { method:"DELETE" }); await load(); notify("Conexión eliminada."); }
      catch (error) { notify(error.message, "warning"); }
    }
  }

  async function load({ quiet=false } = {}) {
    if (!appVisible()) return;
    createUi(); ensureNavigationCopy();
    try { payload = await request("/api/social/connections"); render(); }
    catch (error) { if (!quiet) notify(error.message || "No se pudieron cargar los canales.", "warning"); }
  }

  function boot() {
    createUi(); ensureNavigationCopy();
    void load({ quiet:true });
    clearInterval(refreshTimer); refreshTimer = setInterval(() => { if (appVisible()) { ensureNavigationCopy(); void load({ quiet:true }); } }, 30000);
    document.addEventListener("click", () => setTimeout(ensureNavigationCopy, 0), true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once:true }); else boot();
})();
