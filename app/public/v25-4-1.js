(() => {
  "use strict";

  let serverRole = "";
  let lastRoleCheck = 0;
  const q = (selector, root = document) => root.querySelector(selector);

  function localRole() {
    try { return typeof appState !== "undefined" ? String(appState?.currentUser?.role || "") : ""; }
    catch { return ""; }
  }

  function isAdmin() {
    return serverRole === "admin" || localRole() === "admin";
  }

  async function refreshRole(force = false) {
    const now = Date.now();
    if (!force && now - lastRoleCheck < 2500) return isAdmin();
    lastRoleCheck = now;
    try {
      const response = await fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      serverRole = payload?.authenticated ? String(payload?.user?.role || "") : "";
    } catch {}
    sync();
    return isAdmin();
  }

  function currentState() {
    try { return typeof appState !== "undefined" ? appState : null; }
    catch { return null; }
  }

  async function confirmDelete(title, message) {
    try {
      if (typeof confirmAction === "function") return await confirmAction(title, message);
    } catch {}
    return window.confirm(`${title}\n\n${message}`);
  }

  function toast(message, tone = "success") {
    try { if (typeof showToast === "function") return showToast(message, tone); }
    catch {}
    console.log(message);
  }

  async function reloadState() {
    try {
      if (typeof api === "function" && typeof setState === "function") setState(await api("/api/state"));
    } catch {}
  }

  async function removeDeal(dealId) {
    if (!isAdmin()) return toast("Solo el administrador puede eliminar negociaciones.", "warning");
    const deal = (currentState()?.deals || []).find((item) => item.id === dealId);
    if (!deal) return toast("No se encontró la negociación.", "warning");
    const ok = await confirmDelete("Eliminar negociación", `Se eliminará definitivamente la negociación de ${deal.name || deal.phone || "este cliente"}. Las reservas activas volverán al stock.`);
    if (!ok) return;
    try {
      if (typeof api !== "function") throw new Error("La sesión del CRM no está disponible.");
      await api(`/api/deals/${encodeURIComponent(dealId)}`, { method: "DELETE" });
      try { if (typeof closeDrawer === "function") closeDrawer(); } catch {}
      await reloadState();
      toast("Negociación eliminada correctamente.");
    } catch (error) {
      toast(error?.message || "No se pudo eliminar la negociación.", "warning");
    }
  }

  async function removeClient(clientId) {
    if (!isAdmin()) return toast("Solo el administrador puede eliminar fichas.", "warning");
    const client = (currentState()?.clients || []).find((item) => item.id === clientId);
    if (!client) return toast("No se encontró la ficha del cliente.", "warning");
    const deals = (currentState()?.deals || []).filter((deal) => deal.clientId === clientId);
    const ok = await confirmDelete("Eliminar ficha completa", `Se eliminará definitivamente la ficha de ${client.name || client.company || "este cliente"}${deals.length ? ` y sus ${deals.length} negociaciones vinculadas` : ""}.`);
    if (!ok) return;
    if (!window.confirm(`CONFIRMACIÓN FINAL\n\n¿Eliminar definitivamente a ${client.name || client.company || "este cliente"}${deals.length ? ` junto con ${deals.length} negociaciones` : ""}?`)) return;
    try {
      if (typeof api !== "function") throw new Error("La sesión del CRM no está disponible.");
      await api(`/api/clients/${encodeURIComponent(clientId)}?cascade=1`, { method: "DELETE" });
      try { q("#client-profile-dialog")?.close(); } catch {}
      try { if (typeof closeDrawer === "function") closeDrawer(); } catch {}
      await reloadState();
      toast("Ficha y negociaciones vinculadas eliminadas correctamente.");
    } catch (error) {
      toast(error?.message || "No se pudo eliminar la ficha.", "warning");
    }
  }

  function makeCompactButton(id, text, dataset = {}) {
    const button = document.createElement("button");
    if (id) button.id = id;
    button.type = "button";
    button.className = "button ghost v2541-compact-delete";
    button.textContent = text;
    Object.assign(button.dataset, dataset);
    return button;
  }

  function removeLegacyBars() {
    q("#v2541-deal-admin-bar")?.remove();
    q("#v2541-client-admin-bar")?.remove();
  }

  function ensureDrawerAction() {
    const drawer = q("#deal-drawer");
    if (!drawer) return;
    removeLegacyBars();

    let button = q("#v2541-delete-current-deal");
    const actions = q(".drawer-call-actions", drawer) || q(".drawer-outcome-actions", drawer);
    if (actions && !button) {
      button = makeCompactButton("v2541-delete-current-deal", "Eliminar negociación");
      actions.appendChild(button);
    }
    if (button) button.hidden = !isAdmin();

    const old = q("#v254-delete-current-deal");
    if (old) old.hidden = true;
  }

  function ensureProfileAction() {
    const form = q("#client-profile-form");
    if (!form) return;
    removeLegacyBars();

    let button = q("#v2541-delete-current-client");
    const footer = q("footer", form);
    if (footer && !button) {
      button = makeCompactButton("v2541-delete-current-client", "Eliminar ficha");
      footer.insertBefore(button, footer.firstChild);
    }
    if (button) button.hidden = !isAdmin();

    const old = q("#v254-delete-current-client");
    if (old) old.hidden = true;
  }

  function ensureContactActions() {
    const detail = q("#v254-contact-detail");
    if (!detail) return;
    const activeClientId = q("[data-v254-client-id].active")?.dataset.v254ClientId || "";
    const profileActions = q(".v254-profile-actions", detail);
    if (profileActions && activeClientId && !q("[data-v2541-delete-client]", profileActions)) {
      profileActions.appendChild(makeCompactButton("", "Eliminar ficha", { v2541DeleteClient: activeClientId }));
    }
    for (const card of detail.querySelectorAll("[data-v254-deal-card]")) {
      const dealId = card.dataset.v254DealCard;
      const actions = q(".v254-negotiation-actions", card);
      if (actions && dealId && !q("[data-v2541-delete-deal]", actions)) {
        actions.appendChild(makeCompactButton("", "Eliminar", { v2541DeleteDeal: dealId }));
      }
    }
    for (const button of detail.querySelectorAll("[data-v2541-delete-client],[data-v2541-delete-deal]")) button.hidden = !isAdmin();
  }

  function sync() {
    removeLegacyBars();
    ensureDrawerAction();
    ensureProfileAction();
    ensureContactActions();
    document.body?.classList.toggle("v2541-admin", isAdmin());
  }

  function currentDealId() {
    try { return typeof selectedDealId !== "undefined" ? selectedDealId : null; }
    catch { return null; }
  }

  function currentClientId() {
    try { return typeof selectedClientProfileId !== "undefined" ? selectedClientProfileId : null; }
    catch { return null; }
  }

  document.addEventListener("click", (event) => {
    const currentDeal = event.target.closest?.("#v2541-delete-current-deal");
    if (currentDeal) {
      event.preventDefault();
      event.stopPropagation();
      const id = currentDealId();
      if (id) void removeDeal(id);
      return;
    }

    const currentClient = event.target.closest?.("#v2541-delete-current-client");
    if (currentClient) {
      event.preventDefault();
      event.stopPropagation();
      const id = currentClientId();
      if (id) void removeClient(id);
      return;
    }

    const dealButton = event.target.closest?.("[data-v2541-delete-deal]");
    if (dealButton) {
      event.preventDefault();
      event.stopPropagation();
      void removeDeal(dealButton.dataset.v2541DeleteDeal);
      return;
    }

    const clientButton = event.target.closest?.("[data-v2541-delete-client]");
    if (clientButton) {
      event.preventDefault();
      event.stopPropagation();
      void removeClient(clientButton.dataset.v2541DeleteClient);
    }
  }, true);

  function install() {
    sync();
    void refreshRole(true);
    window.setInterval(() => { sync(); void refreshRole(false); }, 1800);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) void refreshRole(true); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();