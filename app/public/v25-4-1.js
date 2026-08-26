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

  function makeButton(id, text) {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = "button danger-outline v254-admin-delete v2541-admin-delete";
    button.textContent = text;
    return button;
  }

  function ensureDrawerAction() {
    const drawer = q("#deal-drawer");
    if (!drawer) return;
    let bar = q("#v2541-deal-admin-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "v2541-deal-admin-bar";
      bar.className = "v2541-admin-bar";
      bar.innerHTML = '<div><strong>Administración</strong><small>Acciones permanentes sobre esta negociación</small></div>';
      bar.appendChild(makeButton("v2541-delete-current-deal", "Eliminar negociación"));
      const workspace = q(".drawer-workspace", drawer) || q(".drawer-panel", drawer) || drawer;
      workspace.prepend(bar);
    }
    bar.hidden = !isAdmin();

    const old = q("#v254-delete-current-deal");
    if (old) old.hidden = true;
  }

  function ensureProfileAction() {
    const form = q("#client-profile-form");
    if (!form) return;
    let bar = q("#v2541-client-admin-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "v2541-client-admin-bar";
      bar.className = "v2541-admin-bar v2541-profile-admin";
      bar.innerHTML = '<div><strong>Administración de ficha</strong><small>La eliminación total también borra sus negociaciones vinculadas después de confirmar.</small></div>';
      bar.appendChild(makeButton("v2541-delete-current-client", "Eliminar ficha completa"));
      const header = q("header", form);
      if (header?.nextSibling) form.insertBefore(bar, header.nextSibling);
      else form.prepend(bar);
    }
    bar.hidden = !isAdmin();

    const old = q("#v254-delete-current-client");
    if (old) old.hidden = true;
  }

  function syncContactButtons() {
    for (const button of document.querySelectorAll("[data-v254-delete-deal],[data-v254-delete-client]")) {
      button.hidden = !isAdmin();
    }
  }

  function sync() {
    ensureDrawerAction();
    ensureProfileAction();
    syncContactButtons();
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
    if (event.target.closest?.("#v2541-delete-current-deal")) {
      event.preventDefault();
      event.stopPropagation();
      const id = currentDealId();
      if (id && typeof deleteDeal === "function") void deleteDeal(id);
      else {
        const legacy = q("#v254-delete-current-deal");
        if (legacy) legacy.click();
      }
      return;
    }
    if (event.target.closest?.("#v2541-delete-current-client")) {
      event.preventDefault();
      event.stopPropagation();
      const id = currentClientId();
      if (id && typeof deleteClient === "function") void deleteClient(id);
      else {
        const legacy = q("#v254-delete-current-client");
        if (legacy) legacy.click();
      }
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