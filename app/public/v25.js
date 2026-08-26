(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  let snapshot = null;
  let activeDealId = "";
  let pollTimer = null;
  let inboxQuery = "";

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

  function state() {
    try {
      return snapshot || (typeof appState !== "undefined" ? appState : null);
    } catch {
      return snapshot;
    }
  }

  function toast(text, tone = "success") {
    if (typeof window.showToast === "function") return window.showToast(text, tone);
    console.log(text);
  }

  async function request(url, options = {}) {
    const opts = { credentials: "same-origin", cache: "no-store", ...options };
    if (opts.body && !(opts.body instanceof FormData)) {
      opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    }
    let response;
    try {
      response = await fetch(url, opts);
    } catch {
      throw new Error("No se pudo conectar con el CRM. Verificá la conexión e intentá nuevamente.");
    }
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
    try {
      if (typeof window.setState === "function") window.setState(next);
    } catch {}
    renderInbox();
    decorateDealCards();
    if (activeDealId) renderConversation();
  }

  async function refresh() {
    try {
      sync(await request("/api/state"));
    } catch (error) {
      if (!String(error.message).includes("sesión")) setError(error.message);
    }
  }

  function fmt(value) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat("es-PY", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));
    } catch {
      return "";
    }
  }

  function deals() {
    return (state()?.deals || []).slice().sort((a, b) =>
      String(b.updatedAt || b.lastMessageAt || "").localeCompare(String(a.updatedAt || a.lastMessageAt || ""))
    );
  }

  function selectedDeal() {
    return deals().find((deal) => deal.id === activeDealId) || null;
  }

  function lineName(deal) {
    const current = state();
    return (current?.whatsappLines || []).find((line) => line.id === deal?.lineId)?.name
      || (current?.whatsappLines || []).find((line) => line.branchId === deal?.branchId && line.isDefault)?.name
      || "WhatsApp";
  }

  function ownerName(deal) {
    return deal?.ownerName
      || (state()?.users || []).find((user) => user.id === deal?.ownerUserId)?.name
      || "Sin responsable";
  }

  function messageAttachment(attachment) {
    if (!attachment) return "";
    const url = attachment.url || attachment.path || attachment.publicUrl || "";
    const name = attachment.fileName || attachment.name || attachment.kind || "Adjunto";
    if (!url) return `<span class="v25-attachment">📎 ${esc(name)}</span>`;
    if ((attachment.kind || "") === "image" || String(attachment.mimeType || "").startsWith("image/")) {
      return `<a class="v25-media" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(name)}"></a>`;
    }
    return `<a class="v25-attachment" href="${esc(url)}" target="_blank" rel="noopener">📎 ${esc(name)}</a>`;
  }

  function installOverlay() {
    if ($("#v25-chat")) return;
    const element = document.createElement("section");
    element.id = "v25-chat";
    element.className = "v25-chat";
    element.hidden = true;
    element.innerHTML = `<button class="v25-chat-backdrop" data-v25-close aria-label="Cerrar"></button>
      <article class="v25-chat-panel">
        <header class="v25-chat-head">
          <div><small id="v25-chat-line">WhatsApp</small><h2 id="v25-chat-name">Conversación</h2><p id="v25-chat-meta"></p></div>
          <div class="v25-chat-actions"><button type="button" id="v25-chat-refresh">↻ Actualizar</button><button type="button" data-v25-close>✕ Cerrar</button></div>
        </header>
        <div class="v25-chat-status" id="v25-chat-status"></div>
        <main class="v25-message-list" id="v25-messages"></main>
        <form class="v25-composer" id="v25-composer">
          <textarea id="v25-message" rows="2" placeholder="Escribí tu respuesta al cliente…" maxlength="4000"></textarea>
          <button type="submit" id="v25-send">Enviar</button>
          <div class="v25-chat-error" id="v25-chat-error"></div>
        </form>
      </article>`;
    document.body.appendChild(element);
    element.addEventListener("click", (event) => {
      if (event.target.closest("[data-v25-close]")) closeConversation();
    });
    $("#v25-chat-refresh").onclick = () => refresh();
    $("#v25-composer").onsubmit = sendMessage;
    $("#v25-message").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        $("#v25-composer").requestSubmit();
      }
    });
  }

  function setError(message = "") {
    const element = $("#v25-chat-error");
    if (element) element.textContent = message;
  }

  function openConversation(id) {
    if (!id) return;
    installOverlay();
    activeDealId = id;
    snapshot = null;
    const chat = $("#v25-chat");
    chat.hidden = false;
    document.body.classList.add("v25-chat-open");
    renderConversation();
    startPolling();
    void refresh();
    requestAnimationFrame(() => $("#v25-message")?.focus());
  }

  function closeConversation() {
    activeDealId = "";
    const chat = $("#v25-chat");
    if (chat) chat.hidden = true;
    document.body.classList.remove("v25-chat-open");
    stopPolling();
  }

  function renderConversation() {
    const deal = selectedDeal();
    if (!deal) {
      if (activeDealId) setError("La negociación ya no está disponible para este usuario.");
      return;
    }
    $("#v25-chat-line").textContent = lineName(deal);
    $("#v25-chat-name").textContent = deal.name || deal.phone || "Cliente";
    $("#v25-chat-meta").textContent = `${deal.phone || "Sin teléfono"} · ${ownerName(deal)}`;
    const stage = deal.stage || "new";
    $("#v25-chat-status").innerHTML = `<span>Estado: <b>${esc(stage)}</b></span><span>Bot: <b>${deal.botActive ? "Activo" : "Copiloto / pausado"}</b></span><span>Responsable: <b>${esc(ownerName(deal))}</b></span>`;
    const list = $("#v25-messages");
    const messages = (deal.messages || []).slice(-150);
    list.innerHTML = messages.length
      ? messages.map((message) => `<article class="v25-message ${message.direction === "outgoing" ? "out" : message.direction === "system" ? "system" : "in"}">${messageAttachment(message.attachment)}${message.text ? `<p>${esc(message.text)}</p>` : ""}<small>${message.direction === "outgoing" ? esc(message.agentName || message.userName || message.origin || "Asesor") : message.direction === "system" ? "Sistema" : "Cliente"} · ${esc(fmt(message.at || message.createdAt))}</small></article>`).join("")
      : `<div class="v25-empty">Todavía no hay mensajes guardados en esta conversación.</div>`;
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
    setError("");
  }

  async function sendMessage(event) {
    event.preventDefault();
    const deal = selectedDeal();
    const box = $("#v25-message");
    const button = $("#v25-send");
    const text = box.value.trim();
    if (!deal) return setError("Volvé a abrir la conversación.");
    if (!text) return setError("Escribí un mensaje.");
    button.disabled = true;
    button.textContent = "Enviando…";
    setError("");
    try {
      const next = await request(`/api/deals/${encodeURIComponent(deal.id)}/message`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      box.value = "";
      sync(next);
      toast("Mensaje enviado");
    } catch (error) {
      setError(error.message);
      toast(error.message, "warning");
    } finally {
      button.disabled = false;
      button.textContent = "Enviar";
    }
  }

  function installInbox() {
    const view = $("[data-view-panel='whatsapp']");
    if (!view || $("#v25-whatsapp-inbox")) return;
    const box = document.createElement("section");
    box.id = "v25-whatsapp-inbox";
    box.className = "v25-inbox-panel";
    box.innerHTML = `<header><div><p>CONVERSACIONES · V25.1</p><h2>Responder clientes desde WhatsApp y bot</h2><small>Misma conversación que Negociaciones. No se crea una copia ni una bandeja paralela.</small></div><button type="button" id="v25-inbox-refresh">↻ Actualizar</button></header><div class="v25-inbox-toolbar"><input id="v25-inbox-search" type="search" placeholder="Buscar cliente, teléfono o mensaje…"><span id="v25-inbox-count">0 conversaciones</span></div><div class="v25-inbox-list" id="v25-inbox-list"></div>`;
    view.prepend(box);
    $("#v25-inbox-refresh").onclick = () => refresh();
    $("#v25-inbox-search").addEventListener("input", (event) => {
      inboxQuery = event.target.value.trim().toLowerCase();
      renderInbox();
    });
    $("#v25-inbox-list").addEventListener("click", (event) => {
      const row = event.target.closest("[data-v25-deal]");
      if (row) openConversation(row.dataset.v25Deal);
    });
    renderInbox();
  }

  function renderInbox() {
    installInbox();
    const list = $("#v25-inbox-list");
    if (!list) return;
    const query = inboxQuery;
    const rows = deals().filter((deal) => !query || [deal.name, deal.phone, deal.lastMessage, ownerName(deal)].some((value) => String(value || "").toLowerCase().includes(query)));
    $("#v25-inbox-count").textContent = `${rows.length} conversaciones`;
    list.innerHTML = rows.length
      ? rows.slice(0, 250).map((deal) => {
          const last = (deal.messages || []).at(-1);
          return `<button type="button" class="v25-inbox-row" data-v25-deal="${esc(deal.id)}"><span class="v25-avatar">${esc(String(deal.name || deal.phone || "C").trim().charAt(0).toUpperCase())}</span><span class="v25-inbox-copy"><b>${esc(deal.name || deal.phone || "Cliente")}</b><small>${esc(deal.phone || "")} · ${esc(ownerName(deal))}</small><em>${esc(last?.text || deal.lastMessage || "Sin mensajes")}</em></span><span class="v25-inbox-side"><small>${esc(fmt(last?.at || deal.updatedAt))}</small><b>${esc(deal.stage || "new")}</b></span></button>`;
        }).join("")
      : `<div class="v25-empty">No hay conversaciones visibles para este usuario.</div>`;
  }

  function decorateDealCards() {
    $$("#crm-board [data-deal-id]").forEach((card) => {
      card.setAttribute("aria-label", `Abrir conversación con ${card.querySelector("strong")?.textContent || "cliente"}`);
      if (card.querySelector(".v25-open-label")) return;
      const label = document.createElement("span");
      label.className = "v25-open-label";
      label.textContent = "Abrir conversación";
      card.appendChild(label);
    });
  }

  function installNegotiationOpen() {
    document.addEventListener("click", (event) => {
      const card = event.target.closest?.("#crm-board [data-deal-id]");
      if (!card) return;
      const nestedInteractive = event.target.closest("a,input,select,textarea,[data-v25-ignore-open]");
      if (nestedInteractive) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openConversation(card.dataset.dealId);
    }, true);

    const board = $("#crm-board");
    if (board) {
      decorateDealCards();
      new MutationObserver(() => decorateDealCards()).observe(board, { childList: true, subtree: true });
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      if (activeDealId) void refresh();
    }, 3500);
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function install() {
    installOverlay();
    installInbox();
    installNegotiationOpen();
    window.addEventListener("crm:state", () => {
      snapshot = null;
      renderInbox();
      decorateDealCards();
      if (activeDealId) renderConversation();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && activeDealId) void refresh();
    });
    document.body.classList.add("v25-ready");
    setTimeout(() => {
      renderInbox();
      decorateDealCards();
    }, 700);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
