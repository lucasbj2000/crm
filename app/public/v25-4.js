(() => {
  "use strict";

  const $v = (selector, root = document) => root.querySelector(selector);
  const $$v = (selector, root = document) => [...root.querySelectorAll(selector)];
  let contactsActive = false;
  let selectedContactId = null;
  let contactSearch = "";

  function state() {
    try { return typeof appState !== "undefined" ? appState : null; } catch { return null; }
  }

  function admin() {
    return state()?.currentUser?.role === "admin";
  }

  function safe(value) {
    const node = document.createElement("span");
    node.textContent = String(value ?? "");
    return node.innerHTML;
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es")
      .trim();
  }

  function fmt(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime()) || !value) return "Sin fecha";
    return new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function stageLabel(stage) {
    const labels = {
      new: "Nuevo",
      contacted: "Contactado",
      waiting: "Espera respuesta",
      won: "Ganado",
      lost: "Cerrado perdido",
      transferred: "Derivado",
    };
    return labels[stage] || stage || "Sin estado";
  }

  function latestDealActivity(deal) {
    const messages = Array.isArray(deal?.messages) ? deal.messages : [];
    return messages.at(-1)?.at || messages.at(-1)?.createdAt || deal?.updatedAt || deal?.createdAt || "";
  }

  function dealLastMessage(deal) {
    const messages = Array.isArray(deal?.messages) ? deal.messages : [];
    const message = messages.at(-1);
    if (!message) return "Sin mensajes registrados";
    if (message.text) return message.text;
    if (message.mediaType) return `[${message.mediaType}]`;
    return "Mensaje multimedia";
  }

  function branchesMap() {
    return new Map((state()?.branches || []).map((branch) => [branch.id, branch.name || branch.code || "Sucursal"]));
  }

  function usersMap() {
    return new Map((state()?.users || []).map((user) => [user.id, user.name || user.username || "Usuario"]));
  }

  function clientDeals(clientId) {
    return (state()?.deals || [])
      .filter((deal) => deal.clientId === clientId)
      .sort((a, b) => String(latestDealActivity(b)).localeCompare(String(latestDealActivity(a))));
  }

  function clientPhones(client) {
    const values = [];
    const add = (phone, label = "Principal") => {
      const text = String(phone || "").trim();
      if (!text || values.some((entry) => entry.phone === text)) return;
      values.push({ phone: text, label });
    };
    add(client?.phone, "Principal");
    for (const record of client?.phones || []) if (record?.active !== false) add(record.phone, record.label || "Teléfono");
    for (const person of client?.contactPersons || []) {
      for (const record of person?.phones || []) if (record?.active !== false) add(record.phone, `${person.name || "Contacto"}${record.label ? ` · ${record.label}` : ""}`);
    }
    return values;
  }

  function visibleClients() {
    const s = state();
    if (!s) return [];
    const clients = Array.isArray(s.clients) ? s.clients : [];
    if (admin()) return clients;
    const visibleIds = new Set((s.deals || []).map((deal) => deal.clientId).filter(Boolean));
    return clients.filter((client) => visibleIds.has(client.id));
  }

  function searchText(client) {
    const relatedDeals = clientDeals(client.id);
    return normalize([
      client.name,
      client.phone,
      client.document,
      client.ruc,
      client.email,
      client.company,
      client.city,
      client.address,
      client.jobTitle,
      client.notes,
      ...clientPhones(client).map((entry) => entry.phone),
      ...(client.contactPersons || []).flatMap((person) => [person.name, person.role, person.email]),
      ...relatedDeals.flatMap((deal) => [deal.name, deal.phone, deal.ownerName, deal.contactPersonName]),
    ].join(" "));
  }

  function filteredClients() {
    const query = normalize(contactSearch);
    return visibleClients()
      .filter((client) => !query || searchText(client).includes(query))
      .sort((a, b) => {
        const aDate = clientDeals(a.id)[0] ? latestDealActivity(clientDeals(a.id)[0]) : a.updatedAt || a.createdAt || "";
        const bDate = clientDeals(b.id)[0] ? latestDealActivity(clientDeals(b.id)[0]) : b.updatedAt || b.createdAt || "";
        return String(bDate).localeCompare(String(aDate)) || String(a.name || "").localeCompare(String(b.name || ""), "es");
      });
  }

  function initials(name) {
    return String(name || "C").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "C";
  }

  function ensureContactsModule() {
    const navList = $v(".nav-list");
    if (navList && !$v("[data-v254-contacts-nav]")) {
      const button = document.createElement("button");
      button.className = "nav-item v254-contacts-nav";
      button.type = "button";
      button.dataset.v254ContactsNav = "1";
      button.innerHTML = '<span>◎</span><b>Contactos</b><i id="v254-contact-count">0</i>';
      const crm = $v('[data-view="crm"]', navList);
      if (crm?.nextSibling) navList.insertBefore(button, crm.nextSibling);
      else navList.prepend(button);
    }

    const workspace = $v(".workspace");
    if (workspace && !$v("#v254-contacts-view")) {
      const section = document.createElement("section");
      section.className = "view v254-contacts-view";
      section.id = "v254-contacts-view";
      section.innerHTML = `
        <div class="v254-contact-hero">
          <div><p class="kicker">BASE CENTRAL DE CLIENTES</p><h2>Contactos y Fichas 360°</h2><p>Buscá un cliente y revisá en un solo lugar sus datos, personas de contacto y todas las negociaciones vinculadas.</p></div>
          <div class="v254-contact-kpis" id="v254-contact-kpis"></div>
        </div>
        <div class="v254-contact-toolbar">
          <label class="v254-contact-search"><span>⌕</span><input id="v254-contact-search" type="search" placeholder="Buscar nombre, teléfono, CI, RUC, empresa, ciudad…"></label>
          <span class="v254-contact-result-count" id="v254-contact-result-count"></span>
        </div>
        <div class="v254-contact-layout">
          <aside class="v254-contact-list" id="v254-contact-list"></aside>
          <main class="v254-contact-detail" id="v254-contact-detail"></main>
        </div>`;
      workspace.appendChild(section);
    }
  }

  function renderList() {
    const list = $v("#v254-contact-list");
    if (!list) return;
    const clients = filteredClients();
    const count = $v("#v254-contact-count");
    if (count) count.textContent = String(visibleClients().length);
    const resultCount = $v("#v254-contact-result-count");
    if (resultCount) resultCount.textContent = `${clients.length} ${clients.length === 1 ? "ficha" : "fichas"}`;

    if (!clients.length) {
      list.innerHTML = '<div class="v254-empty">No se encontraron clientes con ese criterio.</div>';
      renderDetail(null);
      return;
    }

    if (!selectedContactId || !clients.some((client) => client.id === selectedContactId)) selectedContactId = clients[0].id;
    list.innerHTML = clients.map((client) => {
      const deals = clientDeals(client.id);
      const open = deals.filter((deal) => ["new", "contacted", "waiting"].includes(deal.stage)).length;
      const phone = clientPhones(client)[0]?.phone || "Sin teléfono";
      const active = selectedContactId === client.id ? " active" : "";
      const last = deals[0] ? latestDealActivity(deals[0]) : client.updatedAt || client.createdAt;
      return `<button class="v254-contact-row${active}" type="button" data-v254-client-id="${safe(client.id)}">
        <span class="v254-avatar">${safe(initials(client.name || client.company))}</span>
        <span class="v254-contact-row-main"><strong>${safe(client.name || client.company || "Cliente sin nombre")}</strong><small>${safe(phone)}${client.company && client.company !== client.name ? ` · ${safe(client.company)}` : ""}</small><em>${deals.length} negociaciones · ${open} abiertas</em></span>
        <span class="v254-contact-row-time">${safe(fmt(last))}</span>
      </button>`;
    }).join("");
    renderDetail(selectedContactId);
  }

  function infoItem(label, value) {
    const text = String(value ?? "").trim();
    return `<div class="v254-info-item"><small>${safe(label)}</small><strong>${safe(text || "—")}</strong></div>`;
  }

  function renderDetail(clientId) {
    const detail = $v("#v254-contact-detail");
    if (!detail) return;
    const client = visibleClients().find((entry) => entry.id === clientId);
    if (!client) {
      detail.innerHTML = '<div class="v254-detail-empty"><span>◎</span><strong>Seleccioná una ficha</strong><p>Elegí un cliente de la lista para ver toda su información y negociaciones vinculadas.</p></div>';
      return;
    }

    const deals = clientDeals(client.id);
    const branches = branchesMap();
    const users = usersMap();
    const phones = clientPhones(client);
    const openDeals = deals.filter((deal) => ["new", "contacted", "waiting"].includes(deal.stage)).length;
    const wonDeals = deals.filter((deal) => deal.stage === "won").length;
    const lostDeals = deals.filter((deal) => deal.stage === "lost").length;
    const contactPeople = (client.contactPersons || []).filter((person) => person.active !== false);
    const relationships = (client.branchRelationships || []).filter((relation) => relation.active !== false);

    detail.innerHTML = `
      <section class="v254-profile-head">
        <div class="v254-profile-identity"><span class="v254-avatar large">${safe(initials(client.name || client.company))}</span><div><p class="kicker">FICHA CENTRAL</p><h3>${safe(client.name || client.company || "Cliente")}</h3><p>${safe(client.entityType === "company" ? "Empresa / Organización" : "Persona")}${client.company && client.company !== client.name ? ` · ${safe(client.company)}` : ""}</p></div></div>
        <div class="v254-profile-actions">
          ${deals[0] ? `<button class="button primary" type="button" data-v254-open-deal="${safe(deals[0].id)}">Abrir última negociación</button>` : ""}
          ${admin() ? `<button class="button danger-outline" type="button" data-v254-delete-client="${safe(client.id)}">Eliminar ficha completa</button>` : ""}
        </div>
      </section>
      <div class="v254-profile-metrics">
        <article><small>Negociaciones</small><strong>${deals.length}</strong></article>
        <article><small>Abiertas</small><strong>${openDeals}</strong></article>
        <article><small>Ganadas</small><strong>${wonDeals}</strong></article>
        <article><small>Perdidas</small><strong>${lostDeals}</strong></article>
      </div>
      <section class="v254-detail-section"><header><div><p class="kicker">INFORMACIÓN PRINCIPAL</p><h4>Datos del cliente</h4></div></header>
        <div class="v254-info-grid">
          ${infoItem("Nombre / Razón social", client.name || client.company)}
          ${infoItem("Empresa", client.company)}
          ${infoItem("CI / Documento", client.document)}
          ${infoItem("RUC", client.ruc)}
          ${infoItem("Correo", client.email)}
          ${infoItem("Ciudad", client.city)}
          ${infoItem("Dirección", client.address)}
          ${infoItem("Barrio", client.neighborhood)}
          ${infoItem("País", client.country)}
          ${infoItem("Cargo", client.jobTitle)}
          ${infoItem("Edad", client.age || "")}
          ${infoItem("Fecha de nacimiento", client.birthDate)}
        </div>
        ${client.notes ? `<div class="v254-notes"><small>Notas</small><p>${safe(client.notes)}</p></div>` : ""}
      </section>
      <section class="v254-detail-section"><header><div><p class="kicker">COMUNICACIÓN</p><h4>Teléfonos y personas de contacto</h4></div></header>
        <div class="v254-phone-list">${phones.length ? phones.map((entry) => `<div><span>☎</span><div><strong>${safe(entry.phone)}</strong><small>${safe(entry.label)}</small></div></div>`).join("") : '<div class="v254-empty compact">Sin teléfonos registrados</div>'}</div>
        ${contactPeople.length ? `<div class="v254-contact-people">${contactPeople.map((person) => `<article><strong>${safe(person.name || "Contacto")}</strong><small>${safe(person.role || "Sin cargo")}${person.email ? ` · ${safe(person.email)}` : ""}</small><p>${safe((person.phones || []).map((record) => record.phone).filter(Boolean).join(" · ") || "Sin teléfono")}</p></article>`).join("")}</div>` : ""}
      </section>
      ${relationships.length ? `<section class="v254-detail-section"><header><div><p class="kicker">RELACIÓN COMERCIAL</p><h4>Sucursales vinculadas</h4></div></header><div class="v254-branch-relations">${relationships.map((relation) => `<article><strong>${safe(branches.get(relation.branchId) || "Sucursal")}</strong><small>${relation.preferred ? "Preferida · " : ""}${relation.ownerName ? `Responsable: ${safe(relation.ownerName)}` : "Sin responsable específico"}</small><span>${Number(relation.purchaseCount || 0)} compras · ${relation.lastInteractionAt ? `Última interacción ${safe(fmt(relation.lastInteractionAt))}` : "Sin interacción registrada"}</span></article>`).join("")}</div></section>` : ""}
      <section class="v254-detail-section v254-negotiations-section"><header><div><p class="kicker">HISTORIAL COMPLETO</p><h4>Negociaciones vinculadas</h4></div><span>${deals.length} total</span></header>
        <div class="v254-negotiation-list">${deals.length ? deals.map((deal) => {
          const branch = branches.get(deal.branchId) || "Sucursal";
          const owner = deal.ownerName || users.get(deal.ownerUserId) || "Sin responsable";
          const last = dealLastMessage(deal);
          return `<article class="v254-negotiation-card" data-v254-deal-card="${safe(deal.id)}">
            <div class="v254-negotiation-main"><div class="v254-stage ${safe(deal.stage)}">${safe(stageLabel(deal.stage))}</div><h5>${safe(deal.name || client.name || "Negociación")}</h5><p>${safe(last)}</p><small>${safe(deal.phone || phones[0]?.phone || "Sin teléfono")} · ${safe(branch)} · ${safe(owner)}</small></div>
            <div class="v254-negotiation-meta"><span>Creada ${safe(fmt(deal.createdAt))}</span><span>Actividad ${safe(fmt(latestDealActivity(deal)))}</span>${deal.source ? `<span>Origen: ${safe(deal.source)}</span>` : ""}</div>
            <div class="v254-negotiation-actions"><button class="button ghost" type="button" data-v254-open-deal="${safe(deal.id)}">Abrir negociación</button>${admin() ? `<button class="button danger-outline" type="button" data-v254-delete-deal="${safe(deal.id)}">Eliminar</button>` : ""}</div>
          </article>`;
        }).join("") : '<div class="v254-empty">Esta ficha todavía no tiene negociaciones vinculadas.</div>'}</div>
      </section>`;
  }

  function renderKpis() {
    const box = $v("#v254-contact-kpis");
    if (!box) return;
    const clients = visibleClients();
    const deals = state()?.deals || [];
    const waiting = deals.filter((deal) => deal.stage === "waiting").length;
    const open = deals.filter((deal) => ["new", "contacted", "waiting"].includes(deal.stage)).length;
    box.innerHTML = `<article><small>Contactos</small><strong>${clients.length}</strong></article><article><small>Negociaciones abiertas</small><strong>${open}</strong></article><article><small>Esperando respuesta</small><strong>${waiting}</strong></article>`;
  }

  function renderContacts() {
    ensureContactsModule();
    renderKpis();
    renderList();
    syncAdminControls();
  }

  function showContacts() {
    contactsActive = true;
    $$v("[data-view-panel]").forEach((panel) => panel.classList.remove("active"));
    const panel = $v("#v254-contacts-view");
    if (panel) panel.classList.add("active");
    $$v(".nav-item").forEach((item) => item.classList.toggle("active", item.hasAttribute("data-v254-contacts-nav")));
    if ($v("#header-section")) $v("#header-section").textContent = "CONTACTOS";
    if ($v("#header-title")) $v("#header-title").textContent = "Fichas de clientes";
    renderContacts();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function leaveContacts() {
    if (!contactsActive) return;
    contactsActive = false;
    $v("#v254-contacts-view")?.classList.remove("active");
    $v("[data-v254-contacts-nav]")?.classList.remove("active");
  }

  async function refreshState() {
    if (typeof api === "function" && typeof setState === "function") setState(await api("/api/state"));
    renderContacts();
  }

  async function ask(title, message) {
    try {
      if (typeof confirmAction === "function") return await confirmAction(title, message);
    } catch {}
    return window.confirm(`${title}\n\n${message}`);
  }

  function toast(message, tone = "success") {
    try { if (typeof showToast === "function") return showToast(message, tone); } catch {}
    console.log(message);
  }

  async function deleteDeal(dealId) {
    if (!admin()) return toast("Solo el administrador puede eliminar negociaciones.", "warning");
    const deal = (state()?.deals || []).find((entry) => entry.id === dealId);
    if (!deal) return toast("No se encontró la negociación.", "warning");
    const ok = await ask("Eliminar negociación", `Se eliminará definitivamente la negociación de ${deal.name || deal.phone || "este cliente"}. Las reservas activas volverán al stock.`);
    if (!ok) return;
    try {
      await api(`/api/deals/${encodeURIComponent(dealId)}`, { method: "DELETE" });
      try { if (typeof selectedDealId !== "undefined" && selectedDealId === dealId && typeof closeDrawer === "function") closeDrawer(); } catch {}
      await refreshState();
      toast("Negociación eliminada correctamente.");
    } catch (error) { toast(error?.message || "No se pudo eliminar la negociación.", "warning"); }
  }

  async function deleteClient(clientId) {
    if (!admin()) return toast("Solo el administrador puede eliminar fichas.", "warning");
    const client = (state()?.clients || []).find((entry) => entry.id === clientId);
    if (!client) return toast("No se encontró la ficha del cliente.", "warning");
    const deals = clientDeals(client.id);
    const first = await ask("Eliminar ficha completa", `Vas a eliminar la ficha de ${client.name || client.company || "este cliente"}${deals.length ? ` y sus ${deals.length} negociaciones vinculadas` : ""}. Esta acción no se puede deshacer.`);
    if (!first) return;
    const final = window.confirm(`CONFIRMACIÓN FINAL\n\nEliminar definitivamente a ${client.name || client.company || "este cliente"}${deals.length ? ` junto con ${deals.length} negociaciones` : ""}?`);
    if (!final) return;
    try {
      await api(`/api/clients/${encodeURIComponent(clientId)}?cascade=1`, { method: "DELETE" });
      try { $v("#client-profile-dialog")?.close(); } catch {}
      try { if (typeof closeDrawer === "function") closeDrawer(); } catch {}
      selectedContactId = null;
      await refreshState();
      toast("Ficha y datos vinculados eliminados correctamente.");
    } catch (error) { toast(error?.message || "No se pudo eliminar la ficha.", "warning"); }
  }

  function syncAdminControls() {
    const isAdmin = admin();
    let drawerDelete = $v("#v254-delete-current-deal");
    const outcome = $v(".drawer-outcome-actions");
    if (outcome && !drawerDelete) {
      drawerDelete = document.createElement("button");
      drawerDelete.id = "v254-delete-current-deal";
      drawerDelete.type = "button";
      drawerDelete.className = "button danger-outline v254-admin-delete";
      drawerDelete.textContent = "Eliminar negociación";
      outcome.prepend(drawerDelete);
    }
    if (drawerDelete) drawerDelete.hidden = !isAdmin;

    let profileDelete = $v("#v254-delete-current-client");
    const footer = $v("#client-profile-form footer");
    if (footer && !profileDelete) {
      profileDelete = document.createElement("button");
      profileDelete.id = "v254-delete-current-client";
      profileDelete.type = "button";
      profileDelete.className = "button danger-outline v254-admin-delete";
      profileDelete.textContent = "Eliminar ficha completa";
      footer.prepend(profileDelete);
    }
    if (profileDelete) profileDelete.hidden = !isAdmin;
  }

  function currentDrawerDealId() {
    try { return typeof selectedDealId !== "undefined" ? selectedDealId : null; } catch { return null; }
  }

  function currentProfileClientId() {
    try { return typeof selectedClientProfileId !== "undefined" ? selectedClientProfileId : null; } catch { return null; }
  }

  document.addEventListener("click", (event) => {
    const contactsNav = event.target.closest?.("[data-v254-contacts-nav]");
    if (contactsNav) {
      event.preventDefault();
      event.stopPropagation();
      showContacts();
      return;
    }

    const regularNav = event.target.closest?.(".nav-item[data-view]");
    if (regularNav) leaveContacts();

    const clientRow = event.target.closest?.("[data-v254-client-id]");
    if (clientRow) {
      selectedContactId = clientRow.dataset.v254ClientId;
      renderList();
      if (window.innerWidth <= 820) $v("#v254-contact-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const openDeal = event.target.closest?.("[data-v254-open-deal]");
    if (openDeal) {
      const id = openDeal.dataset.v254OpenDeal;
      if (id && typeof openDrawer === "function") openDrawer(id);
      return;
    }

    const removeDeal = event.target.closest?.("[data-v254-delete-deal]");
    if (removeDeal) {
      event.preventDefault();
      void deleteDeal(removeDeal.dataset.v254DeleteDeal);
      return;
    }

    const removeClient = event.target.closest?.("[data-v254-delete-client]");
    if (removeClient) {
      event.preventDefault();
      void deleteClient(removeClient.dataset.v254DeleteClient);
      return;
    }

    if (event.target.closest?.("#v254-delete-current-deal")) {
      const id = currentDrawerDealId();
      if (id) void deleteDeal(id);
      return;
    }

    if (event.target.closest?.("#v254-delete-current-client")) {
      const id = currentProfileClientId();
      if (id) void deleteClient(id);
    }
  }, true);

  document.addEventListener("input", (event) => {
    if (event.target?.id !== "v254-contact-search") return;
    contactSearch = event.target.value || "";
    renderList();
  });

  function install() {
    ensureContactsModule();
    renderContacts();
    syncAdminControls();
    window.setInterval(() => {
      syncAdminControls();
      if (contactsActive) renderContacts();
      else {
        const count = $v("#v254-contact-count");
        if (count) count.textContent = String(visibleClients().length);
      }
    }, 1800);
    document.body.classList.add("v254-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
