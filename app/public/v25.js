(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  let snapshot = null;
  let activeDealId = "";
  let inboxQuery = "";
  let pollTimer = null;
  const copilotCache = new Map();
  const dataCache = new Map();

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

  function state() {
    try { return snapshot || (typeof appState !== "undefined" ? appState : null); }
    catch { return snapshot; }
  }

  function toast(text, tone = "success") {
    try { if (typeof showToast === "function") return showToast(text, tone); } catch {}
    console.log(text);
  }

  async function request(url, options = {}) {
    const opts = { credentials: "same-origin", cache: "no-store", ...options };
    if (opts.body && !(opts.body instanceof FormData)) opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    let response;
    try { response = await fetch(url, opts); }
    catch { throw new Error("No se pudo conectar con el CRM. Verificá la conexión e intentá nuevamente."); }
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}
    if (response.status === 401) {
      location.assign("/login");
      throw new Error("La sesión venció. Volvé a ingresar.");
    }
    if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
    return data;
  }

  function sync(next) {
    if (!next) return;
    snapshot = next;
    try { if (typeof setState === "function") setState(next); } catch {}
    renderInbox();
    renderConversation();
    decorateDealCards();
  }

  async function refresh() {
    try { sync(await request("/api/state")); }
    catch (error) { setError(error.message); }
  }

  function fmt(value) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
    } catch { return ""; }
  }

  function deals() {
    return (state()?.deals || []).slice().sort((a, b) => String(b.updatedAt || b.lastMessageAt || "").localeCompare(String(a.updatedAt || a.lastMessageAt || "")));
  }

  function selectedDeal() { return deals().find((deal) => deal.id === activeDealId) || null; }

  function ownerName(deal) {
    return deal?.ownerName || (state()?.users || []).find((user) => user.id === deal?.ownerUserId)?.name || "Sin responsable";
  }

  function lineName(deal) {
    const current = state();
    return (current?.whatsappLines || []).find((line) => line.id === deal?.lineId)?.name
      || (current?.whatsappLines || []).find((line) => line.branchId === deal?.branchId && line.isDefault)?.name
      || "WhatsApp";
  }

  function lastMessage(deal) { return (deal?.messages || []).at(-1) || null; }

  function pendingDeal(deal) {
    if (!deal) return false;
    if (deal.stage === "waiting") return true;
    const messages = deal.messages || [];
    let incoming = -1;
    let outgoing = -1;
    messages.forEach((message, index) => {
      if (message.direction === "incoming") incoming = index;
      if (message.direction === "outgoing") outgoing = index;
    });
    return incoming > outgoing;
  }

  function messageAttachment(attachment) {
    if (!attachment) return "";
    const url = attachment.url || attachment.path || attachment.publicUrl || "";
    const name = attachment.fileName || attachment.name || attachment.kind || "Adjunto";
    if (!url) return `<span class="v252-attachment">📎 ${esc(name)}</span>`;
    if ((attachment.kind || "") === "image" || String(attachment.mimeType || "").startsWith("image/")) {
      return `<a class="v252-media" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(name)}"></a>`;
    }
    return `<a class="v252-attachment" href="${esc(url)}" target="_blank" rel="noopener">📎 ${esc(name)}</a>`;
  }

  function setError(message = "") {
    const node = $("#v252-error");
    if (node) node.textContent = message;
  }

  function openLegacyTools(id) {
    if (!id) return false;
    try {
      if (typeof openDrawer === "function") {
        openDrawer(id);
        return true;
      }
    } catch {}
    toast("No se pudo abrir la vista completa de la negociación.", "warning");
    return false;
  }

  function openClientProfileFromInbox(id) {
    if (!openLegacyTools(id)) return;
    setTimeout(() => {
      try {
        if (typeof openClientProfile === "function") void openClientProfile();
      } catch { toast("No se pudo abrir la ficha del cliente.", "warning"); }
    }, 80);
  }

  function installWhatsAppWorkspace() {
    const view = $("[data-view-panel='whatsapp']");
    if (!view || $("#v252-whatsapp-shell")) return;
    const shell = document.createElement("section");
    shell.id = "v252-whatsapp-shell";
    shell.className = "v252-shell";
    shell.innerHTML = `
      <aside class="v252-sidebar">
        <header class="v252-sidebar-head">
          <div><small>WHATSAPP Y BOT · V25.2</small><h2>Conversaciones</h2></div>
          <button type="button" id="v252-refresh" title="Actualizar">↻</button>
        </header>
        <div class="v252-search"><input id="v252-search" type="search" placeholder="Buscar o iniciar un chat"><span id="v252-count">0</span></div>
        <div class="v252-list" id="v252-list"></div>
      </aside>
      <section class="v252-chat-empty" id="v252-empty">
        <div><b>Seleccioná una conversación</b><span>Los pendientes aparecen destacados en rojo.</span></div>
      </section>
      <section class="v252-chat" id="v252-chat" hidden>
        <header class="v252-chat-head">
          <button type="button" class="v252-mobile-back" id="v252-back">←</button>
          <span class="v252-chat-avatar" id="v252-avatar">C</span>
          <div class="v252-chat-title"><b id="v252-name">Cliente</b><small id="v252-meta"></small></div>
          <div class="v252-chat-actions">
            <button type="button" id="v252-profile">Ficha cliente</button>
            <button type="button" id="v252-tools">Herramientas completas</button>
          </div>
        </header>
        <div class="v252-status" id="v252-status"></div>
        <main class="v252-messages" id="v252-messages"></main>
        <section class="v252-assist">
          <div class="v252-copilot" id="v252-copilot"><div><small>RESPUESTA RECOMENDADA</small><p id="v252-copilot-text">Seleccioná una conversación pendiente para generar una recomendación.</p></div><div><button type="button" id="v252-copilot-use">Usar</button><button type="button" id="v252-copilot-refresh">↻</button></div></div>
          <div class="v252-data" id="v252-data"><small>AUTOCOMPLETADO DE CAMPOS</small><div id="v252-data-list"><span>Sin datos detectados.</span></div></div>
        </section>
        <form class="v252-composer" id="v252-composer">
          <div class="v252-quick"><select id="v252-quick-reply"><option value="">Respuesta rápida…</option></select><button type="button" id="v252-quick-use">Insertar</button></div>
          <div class="v252-write"><textarea id="v252-message" rows="2" maxlength="4000" placeholder="Escribí un mensaje"></textarea><button type="submit" id="v252-send">Enviar</button></div>
          <div class="v252-error" id="v252-error"></div>
        </form>
      </section>`;
    view.prepend(shell);

    $("#v252-refresh").onclick = () => void refresh();
    $("#v252-search").addEventListener("input", (event) => { inboxQuery = event.target.value.trim().toLowerCase(); renderInbox(); });
    $("#v252-list").addEventListener("click", (event) => {
      const row = event.target.closest("[data-v252-deal]");
      if (row) selectConversation(row.dataset.v252Deal);
    });
    $("#v252-back").onclick = () => { $("#v252-whatsapp-shell").classList.remove("mobile-chat-open"); };
    $("#v252-profile").onclick = () => openClientProfileFromInbox(activeDealId);
    $("#v252-tools").onclick = () => openLegacyTools(activeDealId);
    $("#v252-copilot-use").onclick = () => {
      const text = $("#v252-copilot-text")?.dataset.reply || "";
      if (text) { $("#v252-message").value = text; $("#v252-message").focus(); }
    };
    $("#v252-copilot-refresh").onclick = () => { const deal = selectedDeal(); if (deal) void loadCopilot(deal, true); };
    $("#v252-quick-use").onclick = useQuickReply;
    $("#v252-composer").onsubmit = sendMessage;
    $("#v252-message").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); $("#v252-composer").requestSubmit(); }
    });
    $("#v252-data-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-v252-data-apply]");
      if (button) void applyDataSuggestion(button.dataset.v252DataApply, button);
    });
    renderInbox();
  }

  function renderInbox() {
    installWhatsAppWorkspace();
    const list = $("#v252-list");
    if (!list) return;
    const query = inboxQuery;
    const rows = deals().filter((deal) => !query || [deal.name, deal.phone, deal.lastMessage, ownerName(deal)].some((value) => String(value || "").toLowerCase().includes(query)));
    const pending = rows.filter(pendingDeal).length;
    $("#v252-count").textContent = pending ? `${pending} pendientes` : `${rows.length} chats`;
    list.innerHTML = rows.length ? rows.slice(0, 300).map((deal) => {
      const last = lastMessage(deal);
      const isPending = pendingDeal(deal);
      const active = deal.id === activeDealId;
      const preview = last?.text || deal.lastMessage || (last?.attachment ? `[${last.attachment.kind || "Adjunto"}]` : "Sin mensajes");
      return `<button type="button" class="v252-row${isPending ? " pending" : ""}${active ? " active" : ""}" data-v252-deal="${esc(deal.id)}">
        <span class="v252-avatar">${esc(String(deal.name || deal.phone || "C").trim().charAt(0).toUpperCase())}</span>
        <span class="v252-row-copy"><span><b>${esc(deal.name || deal.phone || "Cliente")}</b><time>${esc(fmt(last?.at || last?.createdAt || deal.updatedAt))}</time></span><small>${esc(preview)}</small><em>${esc(ownerName(deal))} · ${esc(lineName(deal))}</em></span>
        ${isPending ? `<span class="v252-pending-badge">PENDIENTE</span>` : ""}
      </button>`;
    }).join("") : `<div class="v252-empty-list">No hay conversaciones visibles.</div>`;
  }

  function selectConversation(id) {
    activeDealId = id;
    $("#v252-whatsapp-shell")?.classList.add("mobile-chat-open");
    $("#v252-empty").hidden = true;
    $("#v252-chat").hidden = false;
    renderInbox();
    renderConversation();
    startPolling();
    void refresh();
    const deal = selectedDeal();
    if (deal) { void loadCopilot(deal); void loadDataSuggestions(deal); }
    requestAnimationFrame(() => $("#v252-message")?.focus());
  }

  function renderConversation() {
    const chat = $("#v252-chat");
    const empty = $("#v252-empty");
    if (!chat || !activeDealId) return;
    const deal = selectedDeal();
    if (!deal) {
      chat.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }
    chat.hidden = false;
    if (empty) empty.hidden = true;
    const name = deal.name || deal.phone || "Cliente";
    $("#v252-avatar").textContent = String(name).trim().charAt(0).toUpperCase() || "C";
    $("#v252-name").textContent = name;
    $("#v252-meta").textContent = `${deal.phone || "Sin teléfono"} · ${ownerName(deal)} · ${lineName(deal)}`;
    const pending = pendingDeal(deal);
    $("#v252-status").innerHTML = `<span class="${pending ? "pending" : ""}">${pending ? "● Pendiente de respuesta" : "✓ Al día"}</span><span>Estado: <b>${esc(deal.stage || "new")}</b></span><span>Bot: <b>${deal.botActive ? "Activo" : "Copiloto / pausado"}</b></span>`;

    const messages = (deal.messages || []).slice(-200);
    const list = $("#v252-messages");
    list.innerHTML = messages.length ? messages.map((message, index) => {
      const isLastPending = pending && message.direction === "incoming" && index === messages.length - 1;
      return `<article class="v252-message ${message.direction === "outgoing" ? "out" : message.direction === "system" ? "system" : "in"}${isLastPending ? " pending" : ""}">
        ${messageAttachment(message.attachment)}${message.text ? `<p>${esc(message.text)}</p>` : ""}
        <small>${message.direction === "outgoing" ? esc(message.agentName || message.userName || message.origin || "Asesor") : message.direction === "system" ? "Sistema" : "Cliente"} · ${esc(fmt(message.at || message.createdAt))}</small>
      </article>`;
    }).join("") : `<div class="v252-empty-list">Todavía no hay mensajes guardados.</div>`;
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
    renderQuickReplies(deal);
    renderCopilot(deal);
    renderDataSuggestions(deal);
    setError("");
  }

  function renderQuickReplies(deal) {
    const select = $("#v252-quick-reply");
    if (!select) return;
    const replies = (state()?.quickReplies || []).filter((reply) => reply.active !== false);
    select.innerHTML = `<option value="">Respuesta rápida…</option>` + replies.map((reply) => `<option value="${esc(reply.id)}">${esc(reply.title)}${reply.shortcut ? ` · ${esc(reply.shortcut)}` : ""}</option>`).join("");
    select.disabled = !replies.length;
    $("#v252-quick-use").disabled = !replies.length;
  }

  function useQuickReply() {
    const deal = selectedDeal();
    const id = $("#v252-quick-reply")?.value;
    const reply = (state()?.quickReplies || []).find((entry) => entry.id === id);
    if (!reply || !deal) return;
    const text = String(reply.text || reply.body || "")
      .replaceAll("{cliente}", deal.name || "cliente")
      .replaceAll("{telefono}", deal.phone || "")
      .replaceAll("{agente}", state()?.currentUser?.name || "asesor");
    $("#v252-message").value = text;
    $("#v252-message").focus();
  }

  function copilotKey(deal) {
    const incoming = [...(deal.messages || [])].reverse().find((message) => message.direction === "incoming");
    return `${deal.id}:${incoming?.id || incoming?.at || incoming?.createdAt || deal.updatedAt || ""}`;
  }

  async function loadCopilot(deal, force = false) {
    if (!deal?.id) return;
    const key = copilotKey(deal);
    if (!force && copilotCache.has(key)) return renderCopilot(deal);
    const text = $("#v252-copilot-text");
    if (text) text.textContent = "Generando recomendación…";
    try {
      const result = await request(`/api/deals/${encodeURIComponent(deal.id)}/copilot-suggestion`, { method: "POST", body: JSON.stringify({ refresh: force }) });
      copilotCache.set(key, result);
    } catch (error) {
      copilotCache.set(key, { reply: "", reason: error.message });
    }
    if (activeDealId === deal.id) renderCopilot(deal);
  }

  function renderCopilot(deal) {
    const node = $("#v252-copilot-text");
    const button = $("#v252-copilot-use");
    if (!node || !button) return;
    const result = copilotCache.get(copilotKey(deal));
    if (!result) {
      node.textContent = pendingDeal(deal) ? "Analizando el último mensaje…" : "La conversación está al día. Podés actualizar la recomendación cuando quieras.";
      node.dataset.reply = "";
      button.disabled = true;
      if (pendingDeal(deal)) void loadCopilot(deal);
      return;
    }
    const reply = result.reply || "";
    node.textContent = reply || result.reason || "No hay una recomendación disponible.";
    node.dataset.reply = reply;
    button.disabled = !reply;
  }

  function dataKey(deal) {
    const incoming = [...(deal.messages || [])].reverse().find((message) => message.direction === "incoming");
    return `${deal.id}:${incoming?.id || incoming?.at || incoming?.createdAt || deal.updatedAt || ""}`;
  }

  async function loadDataSuggestions(deal, force = false) {
    if (!deal?.id) return;
    const key = dataKey(deal);
    if (!force && dataCache.has(key)) return renderDataSuggestions(deal);
    try {
      const result = force
        ? await request(`/api/deals/${encodeURIComponent(deal.id)}/data-suggestions/analyze`, { method: "POST", body: JSON.stringify({ withAi: true }) })
        : await request(`/api/deals/${encodeURIComponent(deal.id)}/data-suggestions`);
      dataCache.set(key, result);
    } catch (error) { dataCache.set(key, { suggestions: [], error: error.message }); }
    if (activeDealId === deal.id) renderDataSuggestions(deal);
  }

  function renderDataSuggestions(deal) {
    const list = $("#v252-data-list");
    if (!list) return;
    const result = dataCache.get(dataKey(deal));
    if (!result) {
      list.innerHTML = `<span>Analizando datos explícitos del cliente…</span>`;
      void loadDataSuggestions(deal);
      return;
    }
    const rows = (result.suggestions || result || []).filter((item) => item.status !== "dismissed");
    list.innerHTML = rows.length ? rows.slice(0, 6).map((item) => {
      const applied = item.status === "applied";
      return `<span class="v252-data-chip${applied ? " applied" : ""}"><b>${esc(item.fieldLabel || item.field)}</b>: ${esc(item.value ?? "—")} ${applied ? `<em>✓</em>` : `<button type="button" data-v252-data-apply="${esc(item.id)}">Completar</button>`}</span>`;
    }).join("") : `<span>No se detectaron datos nuevos para completar.</span>`;
  }

  async function applyDataSuggestion(id, button) {
    const deal = selectedDeal();
    if (!deal || !id) return;
    button.disabled = true;
    try {
      const result = await request(`/api/deals/${encodeURIComponent(deal.id)}/data-suggestions/${encodeURIComponent(id)}/apply`, { method: "POST", body: "{}" });
      if (result.state) sync(result.state);
      dataCache.set(dataKey(deal), { suggestions: result.suggestions || [] });
      renderDataSuggestions(deal);
      toast("Dato agregado a la ficha del cliente");
    } catch (error) { toast(error.message, "warning"); }
    finally { button.disabled = false; }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const deal = selectedDeal();
    const box = $("#v252-message");
    const button = $("#v252-send");
    const text = box?.value.trim() || "";
    if (!deal) return setError("Seleccioná una conversación.");
    if (!text) return setError("Escribí un mensaje.");
    button.disabled = true;
    button.textContent = "Enviando…";
    try {
      const next = await request(`/api/deals/${encodeURIComponent(deal.id)}/message`, { method: "POST", body: JSON.stringify({ text }) });
      box.value = "";
      sync(next);
      toast("Mensaje enviado");
    } catch (error) { setError(error.message); toast(error.message, "warning"); }
    finally { button.disabled = false; button.textContent = "Enviar"; }
  }

  function decorateDealCards() {
    $$("#crm-board [data-deal-id]").forEach((card) => {
      card.setAttribute("aria-label", `Abrir ficha y conversación con ${card.querySelector("strong")?.textContent || "cliente"}`);
      let label = card.querySelector(".v252-open-label");
      if (!label) {
        label = document.createElement("span");
        label.className = "v252-open-label";
        card.appendChild(label);
      }
      label.textContent = "Abrir ficha y conversación";
    });
  }

  function installNegotiationRecovery() {
    const board = $("#crm-board");
    if (!board) return;
    decorateDealCards();
    new MutationObserver(() => decorateDealCards()).observe(board, { childList: true, subtree: true });
    // No interceptar el click: el listener original de app.js abre el drawer completo,
    // que conserva ficha 360°, autocompletado, respuestas rápidas y copiloto.
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => { if (activeDealId) void refresh(); }, 4000);
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function install() {
    installWhatsAppWorkspace();
    installNegotiationRecovery();
    window.addEventListener("crm:state", () => {
      snapshot = null;
      renderInbox();
      renderConversation();
      decorateDealCards();
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && activeDealId) void refresh(); });
    document.body.classList.add("v252-ready");
    setTimeout(() => { renderInbox(); decorateDealCards(); }, 600);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
