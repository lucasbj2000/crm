(() => {
  "use strict";

  const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
  const $$ = (selector, root = document) => Array.from(root?.querySelectorAll?.(selector) || []);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  const statusLabels = { open:"Abierto", in_progress:"En seguimiento", waiting_user:"Espera usuario", resolved:"Resuelto", closed:"Cerrado" };
  const priorityLabels = { low:"Baja", normal:"Normal", high:"Alta", urgent:"Urgente" };
  const viewLabels = { crm:"Negociaciones", whatsapp:"WhatsApp y bot", contacts:"Contactos", forms:"Formularios", surveys:"Formularios", campaigns:"Campañas", reports:"Reportes", productivity:"Productividad", stock:"Stock", branches:"Sucursales", organization:"Estructura", attendance:"Marcación", replies:"Respuestas rápidas", data:"Datos y respaldos", settings:"Configuración", design:"Diseño y marca", ai:"Centro IA" };
  let listPayload = { tickets:[], staff:false, users:[] };
  let activeTicket = null;
  let lastEntity = null;
  let panelOpen = false;
  let refreshTimer = null;
  let newContext = null;

  function currentUser() { try { return typeof appState !== "undefined" ? appState?.currentUser || null : null; } catch { return null; } }
  function appVisible() { const shell = $("#app-shell"); return Boolean(shell && !shell.hidden); }
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
  function relative(value) {
    const time = Date.parse(value || ""); if (!Number.isFinite(time)) return "";
    const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (minutes < 1) return "Ahora"; if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60); if (hours < 24) return `Hace ${hours} h`;
    return `Hace ${Math.floor(hours / 24)} d`;
  }
  function formatBytes(value) { const n = Number(value)||0; if(n<1024)return `${n} B`; if(n<1048576)return `${(n/1024).toFixed(1)} KB`; return `${(n/1048576).toFixed(1)} MB`; }
  function cssEscape(value) { try { return CSS.escape(String(value)); } catch { return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); } }

  function rememberEntityFromClick(event) {
    const node = event.target.closest?.("[data-campaign-id],[data-form-id],[data-client-id],[data-deal-id],[data-history-deal]");
    if (!node) return;
    if (node.dataset.campaignId) lastEntity = { type:"campaign", id:node.dataset.campaignId, label:$("h3,strong",node)?.textContent?.trim() || "Campaña" };
    else if (node.dataset.formId) lastEntity = { type:"form", id:node.dataset.formId, label:$("h3,strong",node)?.textContent?.trim() || "Formulario" };
    else if (node.dataset.clientId) lastEntity = { type:"client", id:node.dataset.clientId, label:$("h3,strong",node)?.textContent?.trim() || "Cliente" };
    else if (node.dataset.dealId || node.dataset.historyDeal) lastEntity = { type:"deal", id:node.dataset.dealId || node.dataset.historyDeal, label:$("h3,strong",node)?.textContent?.trim() || "Negociación" };
  }

  function captureContext() {
    let view = "crm";
    try { if (typeof currentView !== "undefined" && currentView) view = currentView; } catch {}
    if (!view) view = $("[data-view-panel].active")?.dataset.viewPanel || "crm";
    let entityType = "other", entityId = "", entityLabel = "";
    try {
      if (typeof selectedDealId !== "undefined" && selectedDealId) {
        entityType = "deal"; entityId = selectedDealId;
        const deal = (appState?.deals || []).find((entry) => entry.id === selectedDealId);
        entityLabel = deal?.name || deal?.phone || "Negociación";
      } else if (typeof selectedClientProfileId !== "undefined" && selectedClientProfileId && $("#client-profile-dialog")?.open) {
        entityType = "client"; entityId = selectedClientProfileId;
        entityLabel = $("#client-profile-title")?.textContent?.trim() || "Ficha del cliente";
      }
    } catch {}
    if (!entityId && lastEntity) { entityType = lastEntity.type; entityId = lastEntity.id; entityLabel = lastEntity.label; }
    if (!entityId && view === "campaigns") entityType = "campaign";
    if (!entityId && ["forms","surveys"].includes(view)) entityType = "form";
    if (!entityId && view === "reports") entityType = "report";
    if (!entityId && ["settings","design"].includes(view)) entityType = "settings";
    const label = $("#header-title")?.textContent?.trim() || viewLabels[view] || view;
    return {
      view,
      label: viewLabels[view] || label,
      entityType,
      entityId,
      entityLabel,
      path: location.pathname + location.search + location.hash,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      appVersion: "V25.9",
    };
  }
  function contextText(context) {
    const parts = [viewLabels[context?.view] || context?.label || "CRM"];
    if (context?.entityLabel) parts.push(context.entityLabel);
    else if (context?.entityId) parts.push(context.entityId);
    return parts.join(" → ");
  }

  function createShell() {
    if ($("#v259-support-button")) return;
    const button = document.createElement("button");
    button.id = "v259-support-button";
    button.className = "v259-support-button";
    button.type = "button";
    button.hidden = true;
    button.innerHTML = '<span class="v259-support-icon">🛟</span><span class="v259-support-label">Soporte</span><span class="v259-support-badge"></span>';
    document.body.appendChild(button);

    const panel = document.createElement("aside");
    panel.id = "v259-support-panel";
    panel.className = "v259-support-panel";
    panel.setAttribute("aria-label", "Centro de soporte");
    panel.innerHTML = '<header class="v259-support-panel-header"><div><h3>Soporte</h3><p id="v259-support-subtitle">Casos y seguimiento</p></div><div class="v259-support-head-actions"><button class="v259-support-new" id="v259-new-ticket" type="button">＋ Nuevo</button><button class="v259-icon-btn" id="v259-support-close" type="button" aria-label="Cerrar">×</button></div></header><div class="v259-support-body" id="v259-support-body"></div>';
    document.body.appendChild(panel);

    const dialog = document.createElement("dialog");
    dialog.id = "v259-support-new-dialog";
    dialog.className = "v259-support-dialog";
    dialog.innerHTML = '<form class="v259-support-dialog-card" id="v259-support-new-form"><header><div><h3>Nuevo caso de soporte</h3><small>El contexto técnico se adjunta automáticamente.</small></div><button class="v259-icon-btn" type="button" data-v259-new-close>×</button></header><div class="v259-context-preview" id="v259-new-context"></div><label>Título<input id="v259-new-title" maxlength="220" placeholder="Ej.: No puedo responder esta negociación"></label><label>Prioridad<select id="v259-new-priority"><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option><option value="low">Baja</option></select></label><label>¿Qué está pasando?<textarea id="v259-new-description" maxlength="6000" required placeholder="Contá qué intentaste hacer y qué ocurrió..."></textarea></label><label>Archivos o capturas<input id="v259-new-files" type="file" multiple></label><div class="v259-support-dialog-actions"><button type="button" data-v259-new-close>Cancelar</button><button class="primary" id="v259-create-ticket" type="submit">Crear caso</button></div></form>';
    document.body.appendChild(dialog);

    button.addEventListener("click", () => openPanel());
    $("#v259-support-close").addEventListener("click", closePanel);
    $("#v259-new-ticket").addEventListener("click", openNewDialog);
    $$('[data-v259-new-close]', dialog).forEach((node) => node.addEventListener("click", () => dialog.close()));
    $("#v259-support-new-form").addEventListener("submit", submitNewTicket);
    panel.addEventListener("click", handlePanelClick);
    panel.addEventListener("change", handlePanelChange);
    panel.addEventListener("submit", handlePanelSubmit);
  }

  function syncButton() {
    const button = $("#v259-support-button"); if (!button) return;
    button.hidden = !appVisible();
  }
  function updateBadge() {
    const badge = $("#v259-support-button .v259-support-badge"); if (!badge) return;
    const unread = (listPayload.tickets || []).filter((ticket) => ticket.unread).length;
    badge.textContent = unread ? String(Math.min(unread, 99)) : "";
  }

  async function loadTickets({ quiet=false } = {}) {
    if (!appVisible()) return;
    try {
      listPayload = await request("/api/support/tickets");
      updateBadge();
      if (panelOpen && !activeTicket) renderList();
      if (activeTicket && panelOpen) {
        const exists = listPayload.tickets?.some((ticket) => ticket.id === activeTicket.id);
        if (!exists) { activeTicket = null; renderList(); }
      }
    } catch (error) { if (!quiet) notify(error.message || "No se pudo cargar soporte.", "warning"); }
  }

  async function openPanel() {
    panelOpen = true;
    $("#v259-support-panel")?.classList.add("open");
    await loadTickets();
    if (activeTicket) await openTicket(activeTicket.id); else renderList();
  }
  function closePanel() { panelOpen = false; $("#v259-support-panel")?.classList.remove("open"); }

  function renderList() {
    const body = $("#v259-support-body"); if (!body) return;
    const tickets = listPayload.tickets || [];
    $("#v259-support-subtitle").textContent = listPayload.staff ? "Cola de soporte de esta empresa" : "Tus solicitudes y conversaciones";
    body.innerHTML = '<div class="v259-support-toolbar"><input id="v259-ticket-search" type="search" placeholder="Buscar caso..."><select id="v259-ticket-filter"><option value="active">Activos</option><option value="all">Todos</option><option value="resolved">Resueltos/cerrados</option></select></div><div class="v259-ticket-list" id="v259-ticket-list"></div>';
    renderTicketCards(tickets, "active", "");
    $("#v259-ticket-search", body)?.addEventListener("input", () => renderTicketCards(tickets, $("#v259-ticket-filter", body)?.value || "active", $("#v259-ticket-search", body)?.value || ""));
    $("#v259-ticket-filter", body)?.addEventListener("change", () => renderTicketCards(tickets, $("#v259-ticket-filter", body)?.value || "active", $("#v259-ticket-search", body)?.value || ""));
  }
  function renderTicketCards(tickets, filter, search) {
    const list = $("#v259-ticket-list"); if (!list) return;
    const q = String(search || "").trim().toLowerCase();
    const rows = tickets.filter((ticket) => {
      if (filter === "active" && ["resolved","closed"].includes(ticket.status)) return false;
      if (filter === "resolved" && !["resolved","closed"].includes(ticket.status)) return false;
      if (q && ![ticket.reference,ticket.title,ticket.createdByName,ticket.context?.entityLabel,ticket.context?.label].some((v) => String(v||"").toLowerCase().includes(q))) return false;
      return true;
    });
    list.innerHTML = rows.length ? rows.map((ticket) => `<button class="v259-ticket-card ${ticket.unread ? "unread" : ""}" type="button" data-v259-ticket-id="${esc(ticket.id)}"><span class="v259-ticket-top"><span class="v259-ticket-ref">${esc(ticket.reference)}</span><span class="v259-ticket-status" data-status="${esc(ticket.status)}">${esc(statusLabels[ticket.status] || ticket.status)}</span></span><h4>${esc(ticket.title)}</h4><span class="v259-ticket-context">${esc(contextText(ticket.context))}</span><span class="v259-ticket-meta"><span>${esc(ticket.createdByName || "Usuario")} · ${ticket.messageCount || 0} mensajes</span><span>${esc(relative(ticket.lastMessageAt))}</span></span></button>`).join("") : '<div class="v259-empty"><strong>No hay casos en esta vista</strong><span>Cuando se cree o actualice uno aparecerá acá.</span></div>';
  }

  async function openTicket(id) {
    try {
      const payload = await request(`/api/support/tickets/${encodeURIComponent(id)}`);
      activeTicket = payload.ticket;
      listPayload.staff = payload.staff;
      if (payload.users?.length) listPayload.users = payload.users;
      await loadTickets({ quiet:true });
      renderTicket();
    } catch (error) { notify(error.message, "warning"); }
  }
  function participantName(id) { return (listPayload.users || []).find((user) => user.id === id)?.name || id; }
  function renderTicket() {
    const ticket = activeTicket, body = $("#v259-support-body"); if (!ticket || !body) return;
    const staff = Boolean(listPayload.staff);
    const me = currentUser();
    const participants = ticket.participantUserIds || [];
    const usersForAdd = (listPayload.users || []).filter((user) => user.id !== ticket.createdByUserId && !participants.includes(user.id));
    body.innerHTML = `<section class="v259-detail"><div class="v259-detail-head"><button class="v259-icon-btn" type="button" data-v259-back>←</button><div class="v259-detail-head-main"><small>${esc(ticket.reference)}</small><h3>${esc(ticket.title)}</h3><small>Creado por ${esc(ticket.createdByName)} · ${esc(relative(ticket.createdAt))}</small></div></div><article class="v259-context-card"><strong>📍 Punto donde se reportó</strong><p>${esc(contextText(ticket.context))}<br>${esc(ticket.context?.path || "")}${ticket.context?.viewport ? ` · Pantalla ${esc(ticket.context.viewport)}` : ""}</p><button class="v259-go-context" type="button" data-v259-go-context>↗ Ir al punto reportado</button></article>${staff ? `<div class="v259-support-controls"><label>Estado<select data-v259-status>${Object.entries(statusLabels).map(([value,label])=>`<option value="${value}" ${ticket.status===value?"selected":""}>${esc(label)}</option>`).join("")}</select></label><label>Prioridad<select data-v259-priority>${Object.entries(priorityLabels).map(([value,label])=>`<option value="${value}" ${ticket.priority===value?"selected":""}>${esc(label)}</option>`).join("")}</select></label></div>` : ""}<article class="v259-participants"><div class="v259-participants-head"><strong>Participantes · ${participants.length + 1}</strong>${staff ? '<button type="button" data-v259-toggle-participants>＋ Agregar</button>' : ""}</div><div class="v259-participant-chips"><span class="v259-participant-chip">👤 ${esc(ticket.createdByName)}</span>${participants.map((id)=>`<span class="v259-participant-chip">${esc(participantName(id))}${staff?`<button type="button" data-v259-remove-participant="${esc(id)}" aria-label="Quitar">×</button>`:""}</span>`).join("")}</div>${staff ? `<div class="v259-add-participant" hidden data-v259-participant-form><select data-v259-participant-select><option value="">Seleccionar persona...</option>${usersForAdd.map((user)=>`<option value="${esc(user.id)}">${esc(user.name)} · ${esc(user.role)}</option>`).join("")}</select><button type="button" data-v259-add-participant>Agregar</button></div>` : ""}</article><div class="v259-messages" id="v259-support-messages">${(ticket.messages||[]).map((message)=>renderMessage(message,me)).join("")}</div><form class="v259-composer" data-v259-composer><textarea data-v259-message maxlength="6000" placeholder="Escribí una respuesta para este caso..."></textarea><div class="v259-composer-row"><label class="v259-file-button">📎 Adjuntar<input type="file" multiple data-v259-files></label><span class="v259-selected-files" data-v259-file-label>Podés adjuntar capturas, PDF, documentos, audio o video.</span><button class="v259-send" type="submit">Enviar</button></div></form></section>`;
    request(`/api/support/tickets/${encodeURIComponent(ticket.id)}/seen`, { method:"POST", body:{} }).catch(()=>{});
    setTimeout(() => { const messages=$("#v259-support-messages"); messages?.lastElementChild?.scrollIntoView({block:"end"}); }, 0);
  }
  function renderMessage(message, me) {
    if (message.type === "system") return `<article class="v259-message system">${esc(message.text)} · ${esc(relative(message.createdAt))}</article>`;
    const mine = me?.id && message.authorUserId === me.id;
    return `<article class="v259-message ${mine ? "mine" : ""}"><div class="v259-message-head"><strong>${esc(message.authorName || "Usuario")}</strong><span>${esc(relative(message.createdAt))}</span></div>${message.text ? `<p>${esc(message.text)}</p>` : ""}${message.attachments?.length ? `<div class="v259-attachments">${message.attachments.map((file)=>`<a class="v259-attachment" href="${esc(file.url)}" target="_blank" rel="noopener"><span>${file.kind==="image"?"🖼":file.kind==="video"?"🎬":file.kind==="audio"?"🎧":"📄"}</span><b>${esc(file.fileName)}</b><small>${esc(formatBytes(file.size))}</small></a>`).join("")}</div>` : ""}</article>`;
  }

  function openNewDialog() {
    const dialog = $("#v259-support-new-dialog"); if (!dialog) return;
    newContext = captureContext();
    $("#v259-new-context").innerHTML = `<strong>📍 Se adjuntará:</strong> ${esc(contextText(newContext))}<br><small>${esc(newContext.path)} · ${esc(newContext.viewport)}</small>`;
    $("#v259-new-title").value = newContext.entityLabel ? `Ayuda con ${newContext.entityLabel}` : `Ayuda en ${viewLabels[newContext.view] || newContext.label}`;
    $("#v259-new-description").value = "";
    $("#v259-new-priority").value = "normal";
    $("#v259-new-files").value = "";
    dialog.showModal();
    setTimeout(()=>$("#v259-new-description")?.focus(),40);
  }
  async function submitNewTicket(event) {
    event.preventDefault();
    const button = $("#v259-create-ticket");
    const files = Array.from($("#v259-new-files")?.files || []);
    if (files.some((file)=>file.size > 25*1024*1024)) return notify("Cada archivo debe pesar como máximo 25 MB.","warning");
    const description = $("#v259-new-description")?.value?.trim() || "";
    if (description.length < 5) return notify("Describí brevemente el inconveniente.","warning");
    try {
      button.disabled = true; button.textContent = "Creando…";
      const result = await request("/api/support/tickets", { method:"POST", body:{ title:$("#v259-new-title")?.value || "", priority:$("#v259-new-priority")?.value || "normal", description, context:newContext || captureContext() } });
      activeTicket = result.ticket;
      for (const file of files) await uploadFile(activeTicket.id, file, "");
      $("#v259-support-new-dialog")?.close();
      await loadTickets({quiet:true});
      await openTicket(activeTicket.id);
      notify(`Caso ${activeTicket.reference} creado.`);
    } catch (error) { notify(error.message || "No se pudo crear el caso.", "warning"); }
    finally { button.disabled=false; button.textContent="Crear caso"; }
  }

  async function uploadFile(ticketId, file, note="") {
    if (file.size > 25*1024*1024) throw new Error(`${file.name} supera 25 MB.`);
    const response = await fetch(`/api/support/tickets/${encodeURIComponent(ticketId)}/attachments`, { method:"POST", credentials:"same-origin", cache:"no-store", headers:{ "Content-Type":file.type || "application/octet-stream", "X-File-Name":encodeURIComponent(file.name), "X-Support-Note":encodeURIComponent(note || "") }, body:file });
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.error || `No se pudo subir ${file.name}.`);
    activeTicket = data.ticket;
    return data;
  }

  async function handlePanelSubmit(event) {
    const form = event.target.closest("[data-v259-composer]"); if (!form) return;
    event.preventDefault(); if (!activeTicket) return;
    const textarea = $("[data-v259-message]", form), input = $("[data-v259-files]", form), send = $(".v259-send", form);
    const text = textarea?.value?.trim() || "", files = Array.from(input?.files || []);
    if (!text && !files.length) return;
    if (files.some((file)=>file.size > 25*1024*1024)) return notify("Cada archivo debe pesar como máximo 25 MB.","warning");
    try {
      send.disabled=true; send.textContent="Enviando…";
      if (text) { const result=await request(`/api/support/tickets/${encodeURIComponent(activeTicket.id)}/messages`,{method:"POST",body:{text}}); activeTicket=result.ticket; }
      for (const file of files) await uploadFile(activeTicket.id,file,"");
      await loadTickets({quiet:true});
      await openTicket(activeTicket.id);
    } catch(error) { notify(error.message,"warning"); }
    finally { send.disabled=false; send.textContent="Enviar"; }
  }

  async function handlePanelClick(event) {
    const ticketCard = event.target.closest("[data-v259-ticket-id]"); if (ticketCard) return void openTicket(ticketCard.dataset.v259TicketId);
    if (event.target.closest("[data-v259-back]")) { activeTicket=null; return renderList(); }
    if (event.target.closest("[data-v259-go-context]")) return goToContext(activeTicket?.context || {});
    if (event.target.closest("[data-v259-toggle-participants]")) { const form=$("[data-v259-participant-form]"); if(form)form.hidden=!form.hidden; return; }
    if (event.target.closest("[data-v259-add-participant]")) {
      const userId=$("[data-v259-participant-select]")?.value; if(!userId||!activeTicket)return;
      try { const result=await request(`/api/support/tickets/${encodeURIComponent(activeTicket.id)}/participants`,{method:"POST",body:{userId}}); activeTicket=result.ticket; if(result.users)listPayload.users=result.users; renderTicket(); } catch(error){notify(error.message,"warning");}
      return;
    }
    const remove = event.target.closest("[data-v259-remove-participant]");
    if (remove && activeTicket) { try { const result=await request(`/api/support/tickets/${encodeURIComponent(activeTicket.id)}/participants/${encodeURIComponent(remove.dataset.v259RemoveParticipant)}`,{method:"DELETE"}); activeTicket=result.ticket; renderTicket(); } catch(error){notify(error.message,"warning");} }
  }
  async function handlePanelChange(event) {
    if (event.target.matches("[data-v259-files]")) { const files=Array.from(event.target.files||[]); const label=$("[data-v259-file-label]"); if(label)label.textContent=files.length?files.map(f=>f.name).join(", "):"Podés adjuntar capturas, PDF, documentos, audio o video."; return; }
    if (!activeTicket || !listPayload.staff) return;
    if (event.target.matches("[data-v259-status]")) { try { const result=await request(`/api/support/tickets/${encodeURIComponent(activeTicket.id)}`,{method:"PATCH",body:{status:event.target.value}}); activeTicket=result.ticket; renderTicket(); await loadTickets({quiet:true}); } catch(error){notify(error.message,"warning");} }
    if (event.target.matches("[data-v259-priority]")) { try { const result=await request(`/api/support/tickets/${encodeURIComponent(activeTicket.id)}`,{method:"PATCH",body:{priority:event.target.value}}); activeTicket=result.ticket; renderTicket(); } catch(error){notify(error.message,"warning");} }
  }

  function goToContext(context) {
    if (!context) return;
    closePanel();
    try {
      if (context.view && typeof switchView === "function") switchView(context.view);
      else $(context.view ? `[data-view="${cssEscape(context.view)}"]` : "")?.click();
    } catch { $(context.view ? `[data-view="${cssEscape(context.view)}"]` : "")?.click(); }
    setTimeout(() => {
      try {
        if (context.entityType === "deal" && context.entityId && typeof openDrawer === "function") { openDrawer(context.entityId); return; }
        if (context.entityType === "client" && context.entityId) {
          const deal=(appState?.deals||[]).find((entry)=>entry.clientId===context.entityId);
          if(deal && typeof openDrawer==="function"){openDrawer(deal.id);setTimeout(()=>{try{if(typeof openClientProfile==="function")void openClientProfile();}catch{}},180);return;}
        }
        const selector = context.entityType === "form" ? `[data-form-id="${cssEscape(context.entityId)}"]` : context.entityType === "campaign" ? `[data-campaign-id="${cssEscape(context.entityId)}"]` : "";
        const node = selector ? $(selector) : null;
        if (node) { node.scrollIntoView({behavior:"smooth",block:"center"}); node.classList.add("v259-context-highlight"); setTimeout(()=>node.classList.remove("v259-context-highlight"),2600); }
      } catch {}
    }, 320);
  }

  function install() {
    createShell();
    syncButton();
    document.addEventListener("click", rememberEntityFromClick, true);
    const shell=$("#app-shell"); if(shell && typeof MutationObserver==="function")new MutationObserver(()=>{syncButton();if(appVisible())void loadTickets({quiet:true});}).observe(shell,{attributes:true,attributeFilter:["hidden"]});
    window.addEventListener("crm:state",()=>{syncButton(); if(appVisible())void loadTickets({quiet:true});});
    setTimeout(()=>{syncButton();if(appVisible())void loadTickets({quiet:true});},1000);
    refreshTimer=setInterval(()=>{if(appVisible())void loadTickets({quiet:true});},30000);
    window.addEventListener("beforeunload",()=>{if(refreshTimer)clearInterval(refreshTimer);},{once:true});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true }); else install();
})();
