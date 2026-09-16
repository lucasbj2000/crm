function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.21 UX: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.21 UX: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

const CORE_MARKER = "V26.21 BULK_DEAL_DELETE_UI";
const INBOX_MARKER = "V26.21 CHAT_ALWAYS_LATEST";
const SERVER_MARKER = "V26.21 BULK_DEAL_DELETE_API";

const bulkHelpers = String.raw`
// V26.21 BULK_DEAL_DELETE_UI
let v2621BulkDealMode = false;
const v2621SelectedDealIds = new Set();

function v2621CanBulkDeleteDeals() {
  return appState?.currentUser?.role === "admin";
}

function v2621EnsureBulkDealStyles() {
  if (document.querySelector("#v2621-bulk-deal-styles")) return;
  const style = document.createElement("style");
  style.id = "v2621-bulk-deal-styles";
  style.textContent = [
    ".v2621-bulk-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;margin:0 0 12px;border:1px solid rgba(20,60,47,.14);border-radius:14px;background:var(--xp-surface,#fff);box-shadow:0 8px 24px rgba(20,40,32,.06)}",
    ".v2621-bulk-bar[hidden]{display:none!important}.v2621-bulk-bar strong{margin-right:auto}.v2621-bulk-bar small{opacity:.7}",
    "#crm-board.v2621-selecting .deal-card{position:relative;padding-left:46px;cursor:pointer}",
    ".v2621-deal-check{display:none;position:absolute;left:14px;top:16px;width:22px;height:22px;border-radius:7px;border:2px solid rgba(20,60,47,.28);background:#fff;align-items:center;justify-content:center;font-size:14px;font-weight:900;line-height:1;z-index:2}",
    "#crm-board.v2621-selecting .v2621-deal-check{display:flex}.deal-card.v2621-selected{outline:2px solid var(--green,#143c2f);outline-offset:-2px;background:rgba(20,60,47,.06)}",
    ".deal-card.v2621-selected .v2621-deal-check{background:var(--green,#143c2f);border-color:var(--green,#143c2f);color:#fff}",
    "#v2621-bulk-delete{background:#b42318;color:#fff;border-color:#b42318}#v2621-bulk-delete:disabled{opacity:.45;cursor:not-allowed}",
    "@media(max-width:760px){.v2621-bulk-bar{align-items:stretch}.v2621-bulk-bar strong{width:100%}.v2621-bulk-bar .button{flex:1 1 auto}}"
  ].join("\n");
  document.head.appendChild(style);
}

function v2621EnsureBulkDealControls() {
  v2621EnsureBulkDealStyles();
  const view = document.querySelector("[data-view-panel='crm']");
  const toolbar = view?.querySelector(".toolbar");
  if (!toolbar) return;
  const allowed = v2621CanBulkDeleteDeals();
  let toggle = document.querySelector("#v2621-bulk-toggle");
  let bar = document.querySelector("#v2621-bulk-bar");
  if (!allowed) {
    if (toggle) toggle.remove();
    if (bar) bar.remove();
    v2621BulkDealMode = false;
    v2621SelectedDealIds.clear();
    document.querySelector("#crm-board")?.classList.remove("v2621-selecting");
    return;
  }
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "v2621-bulk-toggle";
    toggle.className = "button ghost";
    toggle.textContent = "☑ Seleccionar";
    toolbar.insertBefore(toggle, toolbar.querySelector(".heat-legend") || null);
    toggle.addEventListener("click", () => v2621SetBulkDealMode(!v2621BulkDealMode));
  }
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "v2621-bulk-bar";
    bar.className = "v2621-bulk-bar";
    bar.hidden = true;
    bar.innerHTML = '<strong><span id="v2621-bulk-count">0</span> negociaciones seleccionadas</strong><small>Podés seleccionar negociaciones de distintas columnas.</small><button type="button" class="button ghost" id="v2621-bulk-all">Seleccionar visibles</button><button type="button" class="button ghost" id="v2621-bulk-clear">Limpiar</button><button type="button" class="button" id="v2621-bulk-delete" disabled>Eliminar seleccionadas</button>';
    toolbar.insertAdjacentElement("afterend", bar);
    bar.querySelector("#v2621-bulk-all")?.addEventListener("click", v2621SelectAllVisibleDeals);
    bar.querySelector("#v2621-bulk-clear")?.addEventListener("click", () => { v2621SelectedDealIds.clear(); v2621SyncBulkDealUi(); });
    bar.querySelector("#v2621-bulk-delete")?.addEventListener("click", () => void v2621DeleteSelectedDeals());
  }
}

function v2621SetBulkDealMode(enabled) {
  if (!v2621CanBulkDeleteDeals()) return;
  v2621BulkDealMode = Boolean(enabled);
  if (!v2621BulkDealMode) v2621SelectedDealIds.clear();
  v2621SyncBulkDealUi();
}

function v2621VisibleDealIds() {
  return Array.from(document.querySelectorAll("#crm-board [data-deal-id]"))
    .map((card) => String(card.dataset.dealId || ""))
    .filter(Boolean);
}

function v2621SelectAllVisibleDeals() {
  const visible = v2621VisibleDealIds();
  const allSelected = visible.length > 0 && visible.every((id) => v2621SelectedDealIds.has(id));
  for (const id of visible) {
    if (allSelected) v2621SelectedDealIds.delete(id);
    else v2621SelectedDealIds.add(id);
  }
  v2621SyncBulkDealUi();
}

function v2621ToggleDealSelection(id) {
  if (!v2621BulkDealMode || !id) return;
  if (v2621SelectedDealIds.has(id)) v2621SelectedDealIds.delete(id);
  else v2621SelectedDealIds.add(id);
  v2621SyncBulkDealUi();
}

function v2621SyncBulkDealUi() {
  v2621EnsureBulkDealControls();
  const board = document.querySelector("#crm-board");
  if (!board) return;
  board.classList.toggle("v2621-selecting", v2621BulkDealMode);
  for (const card of board.querySelectorAll("[data-deal-id]")) {
    const id = String(card.dataset.dealId || "");
    let check = card.querySelector(":scope > .v2621-deal-check");
    if (!check) {
      check = document.createElement("span");
      check.className = "v2621-deal-check";
      check.setAttribute("aria-hidden", "true");
      card.prepend(check);
    }
    const selected = v2621SelectedDealIds.has(id);
    card.classList.toggle("v2621-selected", selected);
    check.textContent = selected ? "✓" : "";
  }
  const bar = document.querySelector("#v2621-bulk-bar");
  const toggle = document.querySelector("#v2621-bulk-toggle");
  if (bar) bar.hidden = !v2621BulkDealMode;
  if (toggle) toggle.textContent = v2621BulkDealMode ? "✕ Cancelar selección" : "☑ Seleccionar";
  const count = v2621SelectedDealIds.size;
  const countNode = document.querySelector("#v2621-bulk-count");
  if (countNode) countNode.textContent = String(count);
  const deleteButton = document.querySelector("#v2621-bulk-delete");
  if (deleteButton) deleteButton.disabled = count === 0;
  const visible = v2621VisibleDealIds();
  const allVisible = visible.length > 0 && visible.every((id) => v2621SelectedDealIds.has(id));
  const allButton = document.querySelector("#v2621-bulk-all");
  if (allButton) allButton.textContent = allVisible ? "Quitar visibles" : "Seleccionar visibles";
}

async function v2621DeleteSelectedDeals() {
  if (!v2621CanBulkDeleteDeals()) return showToast("Solo un administrador puede eliminar negociaciones masivamente.", "warning");
  const ids = Array.from(v2621SelectedDealIds);
  if (!ids.length) return;
  const detail = "Se eliminarán " + ids.length + " negociación" + (ids.length === 1 ? "" : "es") + ". Esta acción no se puede deshacer. Las reservas activas asociadas volverán al stock disponible.";
  const ok = await confirmAction("Eliminar negociaciones", detail);
  if (!ok) return;
  const button = document.querySelector("#v2621-bulk-delete");
  if (button) { button.disabled = true; button.textContent = "Eliminando…"; }
  try {
    const result = await api("/api/deals/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) });
    v2621SelectedDealIds.clear();
    v2621BulkDealMode = false;
    selectedDealId = null;
    if (result?.state) setState(result.state);
    else await poll();
    v2621SyncBulkDealUi();
    let message = String(Number(result?.deletedCount || ids.length)) + " negociaciones eliminadas";
    if (Number(result?.restoredReservations || 0)) message += " · " + String(Number(result.restoredReservations)) + " reservas devueltas al stock";
    showToast(message);
  } catch (error) {
    showToast(error.message || "No se pudieron eliminar las negociaciones.", "warning");
  } finally {
    if (button) { button.textContent = "Eliminar seleccionadas"; button.disabled = v2621SelectedDealIds.size === 0; }
  }
}
`;

const inboxHelpers = String.raw`
// V26.21 CHAT_ALWAYS_LATEST
let v2621ObservedChatId = "";
let v2621ObservedTailKey = "";
let v2621ObservedMessageCount = 0;
let v2621MessageObserver = null;

function v2621TailKey(item) {
  const rows = Array.isArray(item?.messages) ? item.messages : [];
  const message = rows[rows.length - 1];
  if (!message) return "";
  return String(message.id || message.providerMessageId || [message.createdAt, message.direction, message.text].join("|"));
}

function v2621ScrollConversationToLatest() {
  const id = activeId;
  const scroll = () => {
    if (id !== activeId) return;
    const messages = $("#v2511-messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  };
  requestAnimationFrame(() => requestAnimationFrame(scroll));
  setTimeout(scroll, 120);
  setTimeout(scroll, 420);
}

function v2621TrackConversationTail(force = false) {
  const item = currentConversation();
  const rows = Array.isArray(item?.messages) ? item.messages : [];
  const tailKey = v2621TailKey(item);
  const activeChanged = activeId !== v2621ObservedChatId;
  const newMessage = !activeChanged && (rows.length > v2621ObservedMessageCount || (tailKey && tailKey !== v2621ObservedTailKey));
  if (force || activeChanged || newMessage) v2621ScrollConversationToLatest();
  v2621ObservedChatId = activeId;
  v2621ObservedTailKey = tailKey;
  v2621ObservedMessageCount = rows.length;
}

function v2621InstallMessageObserver() {
  const messages = $("#v2511-messages");
  if (!messages || v2621MessageObserver) return;
  v2621MessageObserver = new MutationObserver(() => v2621TrackConversationTail(false));
  v2621MessageObserver.observe(messages, { childList: true });
  document.addEventListener("click", (event) => {
    if (event.target.closest?.('[data-view="whatsapp"]')) setTimeout(() => v2621TrackConversationTail(true), 0);
  });
}
`;

export function applyV2621CoreUiPatches(source) {
  if (source.includes(CORE_MARKER)) return source;
  let patched = source;
  patched = replaceOnce(
    patched,
    "let masterContext = null;",
    `let masterContext = null;\n${bulkHelpers.trim()}`,
    "estado principal para selección masiva",
  );
  patched = replaceOnce(
    patched,
    '  if (currentView === "crm") renderBoard();',
    '  if (currentView === "crm") { renderBoard(); v2621SyncBulkDealUi(); }',
    "sincronización masiva después del tablero",
  );
  patched = replaceOnce(
    patched,
    '$("#deal-search").addEventListener("input", renderBoard);',
    '$("#deal-search").addEventListener("input", () => { renderBoard(); v2621SyncBulkDealUi(); });',
    "búsqueda del tablero",
  );
  patched = replaceOnce(
    patched,
    '$("#deal-filter").addEventListener("change", renderBoard);',
    '$("#deal-filter").addEventListener("change", () => { renderBoard(); v2621SyncBulkDealUi(); });',
    "filtro del tablero",
  );
  patched = replaceOnce(
    patched,
    '$("#crm-board").addEventListener("click", (event) => {\n  const card = event.target.closest("[data-deal-id]");\n  if (card) openDrawer(card.dataset.dealId);\n});',
    '$("#crm-board").addEventListener("click", (event) => {\n  const card = event.target.closest("[data-deal-id]");\n  if (!card) return;\n  if (v2621BulkDealMode) { event.preventDefault(); event.stopPropagation(); v2621ToggleDealSelection(card.dataset.dealId); return; }\n  openDrawer(card.dataset.dealId);\n});',
    "click del tablero",
  );
  return patched;
}

export function applyV2621InboxUiPatches(source) {
  if (source.includes(INBOX_MARKER)) return source;
  let patched = source;
  const indentedHelpers = inboxHelpers.trim().split("\n").map((line) => "  " + line).join("\n");
  patched = replaceOnce(
    patched,
    "  let socialGridObserver = null;",
    "  let socialGridObserver = null;\n" + indentedHelpers,
    "estado de autoscroll de bandeja",
  );
  patched = replaceOnce(
    patched,
    '    $("#v2511-message").addEventListener("keydown",(event)=>{if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){event.preventDefault();$("#v2511-composer").requestSubmit();}});',
    '    $("#v2511-message").addEventListener("keydown",(event)=>{if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){event.preventDefault();$("#v2511-composer").requestSubmit();}});\n    v2621InstallMessageObserver();',
    "instalación del observador de mensajes",
  );
  patched = replaceOnce(
    patched,
    '  function selectConversation(id) { activeId=id;$("#v2511-unified-inbox")?.classList.add("mobile-chat-open");renderInbox();requestAnimationFrame(()=>$("#v2511-message")?.focus()); }',
    '  function selectConversation(id) { activeId=id;$("#v2511-unified-inbox")?.classList.add("mobile-chat-open");renderInbox();v2621TrackConversationTail(true);requestAnimationFrame(()=>$("#v2511-message")?.focus()); }',
    "apertura de conversación al último mensaje",
  );
  return patched;
}

export function applyV2621ServerPatches(source) {
  if (source.includes(SERVER_MARKER)) return source;
  const route = String.raw`
// V26.21 BULK_DEAL_DELETE_API
app.post("/api/deals/bulk-delete", requireAdmin, async (request, response, next) => {
  try {
    const actor = request.currentUser || currentUser(request);
    const ids = [...new Set((Array.isArray(request.body?.ids) ? request.body.ids : [])
      .map((value) => cleanText(value, 180))
      .filter(Boolean))].slice(0, 500);
    if (!ids.length) throw new Error("Seleccioná al menos una negociación.");

    const idSet = new Set(ids);
    const found = (data.deals || []).filter((deal) => idSet.has(String(deal.id)));
    if (!found.length) throw new Error("No se encontraron las negociaciones seleccionadas.");

    let restoredReservations = 0;
    for (const deal of found) {
      restoredReservations += (deal.items || []).filter((item) => item.status === "reserved").reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
      releaseDealReservations(data, deal, "Negociación eliminada masivamente");
    }

    const deletedIds = new Set(found.map((deal) => String(deal.id)));
    data.deals = (data.deals || []).filter((deal) => !deletedIds.has(String(deal.id)));
    if (Array.isArray(data.transfers)) data.transfers = data.transfers.filter((entry) => !deletedIds.has(String(entry.sourceDealId || "")) && !deletedIds.has(String(entry.targetDealId || "")));
    if (Array.isArray(data.automationWaits)) data.automationWaits = data.automationWaits.filter((entry) => !deletedIds.has(String(entry.dealId || "")));
    if (Array.isArray(data.automationDelayedActions)) data.automationDelayedActions = data.automationDelayedActions.filter((entry) => !deletedIds.has(String(entry.dealId || "")));
    if (Array.isArray(data.clientDataSuggestions)) data.clientDataSuggestions = data.clientDataSuggestions.filter((entry) => !deletedIds.has(String(entry.dealId || "")));
    if (Array.isArray(data.aiPromises)) data.aiPromises = data.aiPromises.filter((entry) => !deletedIds.has(String(entry.dealId || "")));
    if (Array.isArray(data.aiQualityReviews)) data.aiQualityReviews = data.aiQualityReviews.filter((entry) => !deletedIds.has(String(entry.dealId || "")));
    if (Array.isArray(data.aiPredictions)) data.aiPredictions = data.aiPredictions.filter((entry) => !deletedIds.has(String(entry.dealId || "")));
    if (Array.isArray(data.messageOutbox)) data.messageOutbox = data.messageOutbox.filter((entry) => !deletedIds.has(String(entry.dealId || "")));

    recordAuditEvent(actor, "negociaciones_eliminadas_masivamente", {
      dealIds: [...deletedIds],
      deletedCount: deletedIds.size,
      restoredReservations,
    }, actor?.branchId || null, "human");
    addActivity(data, (actor?.name || "Administrador") + " eliminó " + deletedIds.size + " negociación" + (deletedIds.size === 1 ? "" : "es") + " de forma masiva.", "warning");
    await store.save();
    response.json({ ok: true, deletedCount: deletedIds.size, restoredReservations, state: stateResponse(request) });
  } catch (error) { next(error); }
});

`;
  return replaceOnce(
    source,
    'app.post("/api/deals/:id/transfer", async (request, response, next) => {',
    route + 'app.post("/api/deals/:id/transfer", async (request, response, next) => {',
    "punto de inserción de API de eliminación masiva",
  );
}
