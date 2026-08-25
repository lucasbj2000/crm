(() => {
  "use strict";

  const $v = (selector, root = document) => root.querySelector(selector);
  const $$v = (selector, root = document) => [...root.querySelectorAll(selector)];

  function crmState() {
    try { return typeof appState !== "undefined" ? appState : null; } catch { return null; }
  }

  function installMobileNavigation() {
    if ($v("#v24-mobile-menu")) return;
    const menu = document.createElement("button");
    menu.id = "v24-mobile-menu";
    menu.className = "v24-mobile-menu";
    menu.type = "button";
    menu.setAttribute("aria-label", "Abrir menú");
    menu.innerHTML = "<span>☰</span><b>Menú</b>";

    const overlay = document.createElement("button");
    overlay.id = "v24-mobile-overlay";
    overlay.className = "v24-mobile-overlay";
    overlay.type = "button";
    overlay.setAttribute("aria-label", "Cerrar menú");

    const close = () => document.body.classList.remove("v24-nav-open");
    menu.addEventListener("click", () => document.body.classList.toggle("v24-nav-open"));
    overlay.addEventListener("click", close);
    document.addEventListener("click", (event) => {
      if (event.target.closest(".sidebar .nav-item")) close();
    });
    document.body.append(menu, overlay);
  }

  function lineAccessibleByUser(line, user) {
    if (!line || !user || line.active === false) return false;
    if (user.role === "admin") return true;
    if (line.accessMode === "all") return true;
    if ((line.allowedUserIds || []).includes(user.id)) return true;
    if (user.role === "manager") return line.managersCanUse !== false;
    if (user.role === "supervisor") return line.supervisorsCanUse !== false;
    return false;
  }

  function escapeHtmlV24(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function upgradeTransferDialog() {
    const dialog = $v("#transfer-dialog");
    if (!dialog?.open) return;
    const state = crmState();
    if (!state) return;
    let selectedId = null;
    try { selectedId = typeof selectedDealId !== "undefined" ? selectedDealId : null; } catch {}
    const deal = (state.deals || []).find((item) => item.id === selectedId);
    const select = $v("#transfer-user");
    if (!deal || !select) return;

    const currentLine = (state.whatsappLines || []).find((line) => line.id === deal.lineId)
      || (state.whatsappLines || []).find((line) => line.branchId === deal.branchId && line.isDefault)
      || null;
    const currentUserId = state.user?.id || state.currentUser?.id;
    const users = (state.users || []).filter((user) => user.active !== false && user.id !== currentUserId);
    const previous = select.value;
    select.innerHTML = users.map((user) => {
      const branch = (state.branches || []).find((item) => item.id === user.branchId);
      const sameLine = currentLine ? lineAccessibleByUser(currentLine, user) : false;
      return `<option value="${escapeHtmlV24(user.id)}">${escapeHtmlV24(user.name || user.username || "Usuario")} · ${escapeHtmlV24(branch?.name || "Sin sucursal")} · ${sameLine ? "mismo número" : "cambiará de número"}</option>`;
    }).join("");
    if (previous && users.some((user) => user.id === previous)) select.value = previous;

    const type = $v("#transfer-type");
    if (type?.options?.length) type.options[0].textContent = "A una persona / agente";

    if (!$v("#transfer-keep-observer")) {
      const explanation = $v("#transfer-explanation");
      const label = document.createElement("label");
      label.className = "check-row v24-observer-option";
      label.innerHTML = `<input id="transfer-keep-observer" type="checkbox"><span><b>Mantenerme como observador</b><small>Solo conservaré acceso mientras este caso siga abierto.</small></span>`;
      explanation?.before(label);
    }

    const refreshHint = () => {
      const target = users.find((user) => user.id === select.value);
      const sameLine = target && currentLine ? lineAccessibleByUser(currentLine, target) : false;
      const explanation = $v("#transfer-explanation");
      if (!explanation || !target) return;
      explanation.innerHTML = sameLine
        ? `<b>Misma línea:</b> ${escapeHtmlV24(target.name || "El agente")} seguirá en esta misma conversación y el cliente no notará un cambio de número.`
        : `<b>Cambio de línea:</b> se conservará todo el historial, pero el nuevo agente continuará desde uno de sus números habilitados. El CRM enviará una presentación al cliente.`;
    };
    if (!select.dataset.v24Bound) {
      select.dataset.v24Bound = "1";
      select.addEventListener("change", refreshHint);
    }
    refreshHint();
  }

  function installTransferEnhancer() {
    const dialog = $v("#transfer-dialog");
    if (dialog && !dialog.dataset.v24Observed) {
      dialog.dataset.v24Observed = "1";
      new MutationObserver(() => { if (dialog.open) queueMicrotask(upgradeTransferDialog); })
        .observe(dialog, { attributes: true, attributeFilter: ["open"] });
    }

    if (typeof window.mutate === "function" && !window.mutate.__v24) {
      const originalMutate = window.mutate;
      const wrapped = async function(path, method, body, ...rest) {
        if (/\/api\/deals\/[^/]+\/transfer$/.test(String(path || "")) && String(method || "").toUpperCase() === "POST" && body?.userId) {
          body = { ...body, keepAsObserver: Boolean($v("#transfer-keep-observer")?.checked) };
        }
        return originalMutate.call(this, path, method, body, ...rest);
      };
      wrapped.__v24 = true;
      window.mutate = wrapped;
    }
  }

  function openFormFallback() {
    const dialog = $v("#form-builder-dialog");
    if (!dialog || dialog.open) return;
    const id = $v("#form-id");
    const title = $v("#form-dialog-title");
    const name = $v("#form-name");
    const description = $v("#form-description");
    if (id) id.value = "";
    if (title) title.textContent = "Nuevo formulario";
    if (name) name.value = "";
    if (description) description.value = "";
    if ($v("#form-public-access")) $v("#form-public-access").checked = true;
    const questions = $v("#form-questions");
    if (questions && !questions.children.length) $v("#form-add-question")?.click();
    try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
    requestAnimationFrame(() => name?.focus());
  }

  function installFormFallback() {
    if (document.body.dataset.v24FormsBound) return;
    document.body.dataset.v24FormsBound = "1";
    document.addEventListener("click", (event) => {
      const button = event.target.closest("#new-form-button");
      if (!button) return;
      setTimeout(openFormFallback, 80);
    }, true);
  }

  function enhanceDialogMobility() {
    $$v("dialog").forEach((dialog) => {
      if (dialog.dataset.v24Mobile) return;
      dialog.dataset.v24Mobile = "1";
    });
  }

  function installMediaHints() {
    const rec = $v("#record-audio-button, [data-record-audio], .record-audio-button");
    if (rec) rec.title = "Grabar audio compatible con WhatsApp";
  }

  function install() {
    document.body.classList.add("v24-ready");
    installMobileNavigation();
    installFormFallback();
    installTransferEnhancer();
    enhanceDialogMobility();
    installMediaHints();

    const observer = new MutationObserver(() => {
      installTransferEnhancer();
      enhanceDialogMobility();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 820) document.body.classList.remove("v24-nav-open");
    }, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
