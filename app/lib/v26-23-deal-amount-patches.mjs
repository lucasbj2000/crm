const UI_MARKER = "// V26.23 DEAL_AMOUNT_CONFIRM_CLOSE";
const SERVER_MARKER = "// V26.23 DEAL_AMOUNT_SERVER";

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`V26.23: no se encontró ${label}`);
  return source.replace(search, replacement);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`V26.23: no se encontró ${label}`);
  return source.replace(pattern, replacement);
}

function replaceListenerBlock(source, startMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.23: no se encontró ${label}`);
  const end = source.indexOf("\n});", start + startMarker.length);
  if (end < 0) throw new Error(`V26.23: cierre incompleto en ${label}`);
  return source.slice(0, start) + replacement + source.slice(end + 4);
}

const UI_HELPERS = [
  UI_MARKER,
  "let v2623PendingClose = null;",
  "",
  "function v2623ProductAmount(deal) {",
  "  return (deal?.items || []).filter((item) => [\"reserved\", \"sold\"].includes(item.status)).reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);",
  "}",
  "",
  "function v2623HasAmount(value) {",
  "  return value !== null && value !== undefined && value !== \"\" && Number.isFinite(Number(value));",
  "}",
  "",
  "function v2623EffectiveAmount(deal) {",
  "  if (!deal) return 0;",
  "  if ([\"won\", \"lost\"].includes(deal.stage) && v2623HasAmount(deal.closingAmount)) return Math.max(0, Number(deal.closingAmount));",
  "  const productAmount = v2623ProductAmount(deal);",
  "  if (deal.negotiationAmountSource === \"products\" && productAmount > 0) return productAmount;",
  "  if (v2623HasAmount(deal.negotiationAmount)) return Math.max(0, Number(deal.negotiationAmount));",
  "  return productAmount;",
  "}",
  "",
  "function v2623EnsureAmountUi() {",
  "  let section = $(\"#deal-amount-section\");",
  "  if (!section) {",
  "    const actions = document.querySelector(\".drawer-outcome-actions\");",
  "    if (!actions) return null;",
  "    section = document.createElement(\"section\");",
  "    section.className = \"drawer-section deal-amount-section\";",
  "    section.id = \"deal-amount-section\";",
  "    section.innerHTML = '<div class=\"drawer-section-title\"><div><h4>Monto de la negociación</h4><small id=\"deal-amount-source\">Completá el valor comercial</small></div><strong id=\"deal-amount-display\">Gs. 0</strong></div><div class=\"deal-amount-editor\"><label><span>Monto (Gs.)</span><input id=\"deal-amount-input\" type=\"number\" min=\"0\" step=\"1\" inputmode=\"numeric\" placeholder=\"Ej.: 1500000\"></label><button class=\"button dark\" id=\"save-deal-amount\" type=\"button\">Guardar monto</button></div><div class=\"deal-product-amount\" id=\"deal-product-amount\" hidden><span id=\"deal-product-amount-copy\"></span><button class=\"text-button\" id=\"use-product-amount\" type=\"button\">Usar total de productos</button></div><small class=\"deal-amount-help\">Mientras el stock no esté integrado, el agente puede completar este monto manualmente. Al cerrar, el CRM volverá a pedir confirmación.</small>';",
  "    actions.parentElement.insertBefore(section, actions);",
  "  }",
  "  if (!document.querySelector(\"#v2623-deal-amount-style\")) {",
  "    const style = document.createElement(\"style\");",
  "    style.id = \"v2623-deal-amount-style\";",
  "    style.textContent = '.deal-amount-section .drawer-section-title strong{font-size:17px;color:#203b2d}.deal-amount-editor{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px}.deal-amount-editor label{margin:0}.deal-amount-editor input{font-size:15px;font-weight:750}.deal-product-amount{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;padding:8px 10px;border-radius:9px;background:#f3f6f2;font-size:9px}.deal-amount-help{display:block;margin-top:8px;color:#7f8b85;line-height:1.45}.deal-close-amount-summary{padding:12px;border:1px solid #e1e6e2;border-radius:11px;background:#f7f9f7}.deal-close-amount-summary strong{display:block;margin-top:3px;font-size:20px}.deal-close-warning{margin-top:8px;color:#8a6a2d;font-size:10px}@media(max-width:640px){.deal-amount-editor{grid-template-columns:1fr}.deal-amount-editor .button{width:100%}}';",
  "    document.head.appendChild(style);",
  "  }",
  "  let dialog = $(\"#deal-close-amount-dialog\");",
  "  if (!dialog) {",
  "    dialog = document.createElement(\"dialog\");",
  "    dialog.id = \"deal-close-amount-dialog\";",
  "    dialog.innerHTML = '<form class=\"dialog-card small-dialog\" id=\"deal-close-amount-form\"><header><div><p class=\"kicker\">CIERRE COMERCIAL</p><h3 id=\"deal-close-amount-title\">Confirmar monto de cierre</h3></div><button class=\"icon-button close\" id=\"cancel-deal-close-amount\" type=\"button\">×</button></header><p id=\"deal-close-amount-copy\">Verificá el monto antes de cerrar la negociación.</p><div class=\"deal-close-amount-summary\"><span>Monto de cierre</span><strong id=\"deal-close-amount-preview\">Gs. 0</strong></div><label><span>Monto correcto (Gs.) *</span><input id=\"deal-close-amount-input\" min=\"0\" step=\"1\" inputmode=\"numeric\" required type=\"number\"></label><small class=\"deal-close-warning\" id=\"deal-close-amount-warning\"></small><footer><button class=\"button ghost\" id=\"back-deal-close-amount\" type=\"button\">Cancelar</button><button class=\"button success\" id=\"confirm-deal-close-amount\" type=\"submit\">Confirmar monto y cerrar</button></footer></form>';",
  "    document.body.appendChild(dialog);",
  "    const closeDialog = () => { v2623PendingClose = null; if (dialog.open) dialog.close(); };",
  "    $(\"#cancel-deal-close-amount\").addEventListener(\"click\", closeDialog);",
  "    $(\"#back-deal-close-amount\").addEventListener(\"click\", closeDialog);",
  "    $(\"#deal-close-amount-input\").addEventListener(\"input\", (event) => {",
  "      const amount = Math.max(0, Number(event.target.value || 0));",
  "      $(\"#deal-close-amount-preview\").textContent = money.format(amount);",
  "    });",
  "    $(\"#deal-close-amount-form\").addEventListener(\"submit\", async (event) => {",
  "      event.preventDefault();",
  "      if (!v2623PendingClose || !selectedDealId) return;",
  "      const input = $(\"#deal-close-amount-input\");",
  "      const raw = String(input.value || \"\").trim();",
  "      const amount = Number(raw);",
  "      if (!raw || !Number.isFinite(amount) || amount < 0) { showToast(\"Ingresá un monto de cierre válido.\", \"warning\"); input.focus(); return; }",
  "      if (v2623PendingClose.mode === \"won\" && amount <= 0) { showToast(\"Una negociación ganada debe tener un monto mayor a cero.\", \"warning\"); input.focus(); return; }",
  "      const dealId = selectedDealId;",
  "      const mode = v2623PendingClose.mode;",
  "      const body = { amountConfirmed: true, closingAmount: Math.round(amount) };",
  "      if (mode === \"lost\") body.reasonId = v2623PendingClose.reasonId;",
  "      try {",
  "        await mutate(\"/api/deals/\" + encodeURIComponent(dealId) + \"/\" + mode, \"POST\", body);",
  "        if (dialog.open) dialog.close();",
  "        v2623PendingClose = null;",
  "        showToast(mode === \"won\" ? \"Negociación ganada con monto confirmado\" : \"Negociación cerrada con monto confirmado\");",
  "      } catch (error) { showToast(error.message, \"warning\"); }",
  "    });",
  "  }",
  "  if (!section.dataset.amountEventsBound) {",
  "    section.dataset.amountEventsBound = \"1\";",
  "    $(\"#save-deal-amount\").addEventListener(\"click\", async () => {",
  "      if (!selectedDealId) return;",
  "      const input = $(\"#deal-amount-input\");",
  "      const raw = String(input.value || \"\").trim();",
  "      const amount = Number(raw);",
  "      if (!raw || !Number.isFinite(amount) || amount < 0) { showToast(\"Ingresá un monto válido.\", \"warning\"); input.focus(); return; }",
  "      try { await mutate(\"/api/deals/\" + encodeURIComponent(selectedDealId) + \"/amount\", \"POST\", { amount: Math.round(amount), source: \"manual\" }); showToast(\"Monto de la negociación actualizado\"); }",
  "      catch (error) { showToast(error.message, \"warning\"); }",
  "    });",
  "    $(\"#use-product-amount\").addEventListener(\"click\", async () => {",
  "      const deal = (appState?.deals || []).find((entry) => entry.id === selectedDealId);",
  "      const amount = v2623ProductAmount(deal);",
  "      if (!selectedDealId || amount <= 0) return;",
  "      try { await mutate(\"/api/deals/\" + encodeURIComponent(selectedDealId) + \"/amount\", \"POST\", { amount: Math.round(amount), source: \"products\" }); showToast(\"Monto actualizado desde los productos\"); }",
  "      catch (error) { showToast(error.message, \"warning\"); }",
  "    });",
  "  }",
  "  return section;",
  "}",
  "",
  "function v2623RenderAmount(deal, canWork) {",
  "  const section = v2623EnsureAmountUi();",
  "  if (!section || !deal) return;",
  "  const input = $(\"#deal-amount-input\");",
  "  const productAmount = v2623ProductAmount(deal);",
  "  const amount = v2623EffectiveAmount(deal);",
  "  const closed = [\"won\", \"lost\"].includes(deal.stage);",
  "  const hasStored = v2623HasAmount(closed ? deal.closingAmount : deal.negotiationAmount);",
  "  if (document.activeElement !== input || input.dataset.dealId !== String(deal.id)) input.value = (hasStored || productAmount > 0) ? String(Math.round(amount)) : \"\";",
  "  input.dataset.dealId = String(deal.id);",
  "  input.disabled = !canWork || closed;",
  "  $(\"#save-deal-amount\").disabled = !canWork || closed;",
  "  $(\"#deal-amount-display\").textContent = money.format(amount);",
  "  const source = $(\"#deal-amount-source\");",
  "  if (closed && v2623HasAmount(deal.closingAmount)) source.textContent = \"Monto confirmado al cierre\";",
  "  else if (deal.negotiationAmountSource === \"manual\" && v2623HasAmount(deal.negotiationAmount)) source.textContent = \"Monto cargado manualmente\";",
  "  else if (productAmount > 0) source.textContent = \"Calculado desde productos de la negociación\";",
  "  else source.textContent = \"Sin stock integrado · completá el monto manualmente\";",
  "  const productBox = $(\"#deal-product-amount\");",
  "  productBox.hidden = productAmount <= 0 || closed;",
  "  if (productAmount > 0) $(\"#deal-product-amount-copy\").textContent = \"Total de productos: \" + money.format(productAmount);",
  "}",
  "",
  "function v2623OpenCloseAmountDialog(mode, reasonId = null) {",
  "  if (!selectedDealId) return;",
  "  v2623EnsureAmountUi();",
  "  const deal = (appState?.deals || []).find((entry) => entry.id === selectedDealId);",
  "  if (!deal) return;",
  "  const amount = v2623EffectiveAmount(deal);",
  "  const hasAmount = v2623HasAmount(deal.negotiationAmount) || v2623ProductAmount(deal) > 0;",
  "  v2623PendingClose = { mode, reasonId };",
  "  $(\"#deal-close-amount-title\").textContent = mode === \"won\" ? \"Confirmar venta y monto\" : \"Confirmar cierre y monto\";",
  "  $(\"#deal-close-amount-copy\").textContent = mode === \"won\" ? \"Antes de marcar como ganada, verificá que el monto final de la venta sea correcto.\" : \"Antes de cerrar como perdida, verificá el monto comercial asociado a esta negociación.\";",
  "  $(\"#deal-close-amount-warning\").textContent = mode === \"won\" ? \"Este monto será utilizado en reportes de ventas, agente y sucursal.\" : \"Este monto quedará registrado como valor de la oportunidad cerrada.\";",
  "  const input = $(\"#deal-close-amount-input\");",
  "  input.value = hasAmount ? String(Math.round(amount)) : \"\";",
  "  input.min = mode === \"won\" ? \"1\" : \"0\";",
  "  $(\"#deal-close-amount-preview\").textContent = money.format(amount);",
  "  $(\"#confirm-deal-close-amount\").className = mode === \"won\" ? \"button success\" : \"button danger\";",
  "  const dialog = $(\"#deal-close-amount-dialog\");",
  "  if (!dialog.open) dialog.showModal();",
  "  requestAnimationFrame(() => { input.focus(); input.select(); });",
  "}",
  "",
].join("\n");

const AMOUNT_ROUTE = [
  SERVER_MARKER,
  "app.post(\"/api/deals/:id/amount\", async (request, response, next) => {",
  "  try {",
  "    const user = currentUser(request);",
  "    const deal = findDeal(data, request.params.id);",
  "    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error(\"Negociación no encontrada o ya cerrada.\");",
  "    ensureDealOwnership(deal, user, { claim: true });",
  "    const amount = Number(request.body?.amount);",
  "    if (!Number.isFinite(amount) || amount < 0) throw new Error(\"Indicá un monto válido para la negociación.\");",
  "    deal.negotiationAmount = Math.round(amount);",
  "    deal.negotiationAmountSource = request.body?.source === \"products\" ? \"products\" : \"manual\";",
  "    deal.negotiationAmountUpdatedAt = timestamp();",
  "    deal.negotiationAmountUpdatedByUserId = user.id;",
  "    deal.negotiationAmountUpdatedByName = user.name;",
  "    deal.updatedAt = timestamp();",
  "    recordAuditEvent(user, \"monto_negociacion_actualizado\", { dealId: deal.id, amount: deal.negotiationAmount, source: deal.negotiationAmountSource }, deal.branchId, \"human\");",
  "    await store.save();",
  "    response.json(stateResponse(request));",
  "  } catch (error) { next(error); }",
  "});",
  "",
].join("\n");

const REPORT_HELPER = [
  "function v2623ItemValue(item) { return Number(item?.quantity || 0) * Number(item?.unitPrice || 0); }",
  "function v2623HasNumericAmount(value) { return value !== null && value !== undefined && value !== \"\" && Number.isFinite(Number(value)); }",
  "function v2623SalesValue(deal) {",
  "  if (v2623HasNumericAmount(deal?.closingAmount)) return Math.max(0, Number(deal.closingAmount));",
  "  if (v2623HasNumericAmount(deal?.negotiationAmount)) return Math.max(0, Number(deal.negotiationAmount));",
  "  return (deal?.items || []).filter((item) => item.status === \"sold\").reduce((sum, item) => sum + v2623ItemValue(item), 0);",
  "}",
  "function v2623PipelineValue(deal) {",
  "  const products = (deal?.items || []).filter((item) => item.status === \"reserved\").reduce((sum, item) => sum + v2623ItemValue(item), 0);",
  "  if (deal?.negotiationAmountSource === \"products\" && products > 0) return products;",
  "  if (v2623HasNumericAmount(deal?.negotiationAmount)) return Math.max(0, Number(deal.negotiationAmount));",
  "  return products;",
  "}",
  "function v2623ApplyAmountMetrics(report, { days = 30, ownerUserId = null, branchId = null } = {}) {",
  "  if (!report || typeof report !== \"object\") return report;",
  "  const normalizedDays = [0, 7, 30, 90, 365].includes(Number(days)) ? Number(days) : 30;",
  "  const now = Date.now();",
  "  const start = normalizedDays ? now - normalizedDays * 86400000 : 0;",
  "  const inPeriod = (value) => { const time = Date.parse(value); return Number.isFinite(time) && time > 0 && time >= start && time <= now + 86400000; };",
  "  const scoped = (data.deals || []).filter((deal) => (!branchId || deal.branchId === branchId) && (!ownerUserId || deal.ownerUserId === ownerUserId));",
  "  const won = scoped.filter((deal) => deal.stage === \"won\" && inPeriod(deal.outcomeAt));",
  "  const open = scoped.filter((deal) => OPEN_STAGES.has(deal.stage));",
  "  if (report.summary) {",
  "    report.summary.salesValue = Math.round(won.reduce((sum, deal) => sum + v2623SalesValue(deal), 0));",
  "    report.summary.pipelineValue = Math.round(open.reduce((sum, deal) => sum + v2623PipelineValue(deal), 0));",
  "  }",
  "  if (Array.isArray(report.agentPerformance)) for (const entry of report.agentPerformance) {",
  "    const deals = (data.deals || []).filter((deal) => deal.ownerUserId === entry.id && (!branchId || deal.branchId === branchId) && deal.stage === \"won\" && inPeriod(deal.outcomeAt));",
  "    entry.salesValue = Math.round(deals.reduce((sum, deal) => sum + v2623SalesValue(deal), 0));",
  "  }",
  "  if (Array.isArray(report.branchSummaries)) for (const entry of report.branchSummaries) {",
  "    const deals = (data.deals || []).filter((deal) => deal.branchId === entry.id && (!ownerUserId || deal.ownerUserId === ownerUserId) && deal.stage === \"won\" && inPeriod(deal.outcomeAt));",
  "    entry.salesValue = Math.round(deals.reduce((sum, deal) => sum + v2623SalesValue(deal), 0));",
  "  }",
  "  const clients = new Map();",
  "  for (const deal of won) {",
  "    const key = deal.clientId || deal.jid || deal.phone || deal.id;",
  "    const current = clients.get(key) || { id: key, name: deal.name || deal.phone || \"Cliente\", phone: deal.phone || \"\", purchases: 0, value: 0 };",
  "    current.purchases += 1; current.value += v2623SalesValue(deal); clients.set(key, current);",
  "  }",
  "  report.topClients = [...clients.values()].sort((a, b) => b.value - a.value).slice(0, 8).map((entry) => ({ ...entry, value: Math.round(entry.value) }));",
  "  return report;",
  "}",
  "",
].join("\n");

export function applyV2623CoreUiPatches(source) {
  if (source.includes(UI_MARKER)) return source;
  source = replaceOnce(source, "function renderDrawer() {", `${UI_HELPERS}function renderDrawer() {`, "renderDrawer para insertar monto");
  source = replaceOnce(source, "  const canWork = canManage;", "  const canWork = canManage;\n  v2623RenderAmount(deal, canWork);", "permisos del drawer");
  source = replaceListenerBlock(
    source,
    '$("#mark-won-button").addEventListener("click", async () => {',
    '$("#mark-won-button").addEventListener("click", () => {\n  if (!selectedDealId) return;\n  v2623OpenCloseAmountDialog("won");\n});',
    "cierre ganado"
  );
  source = replaceListenerBlock(
    source,
    '$("#lost-form").addEventListener("submit", async (event) => {',
    '$("#lost-form").addEventListener("submit", (event) => {\n  event.preventDefault();\n  if (!selectedDealId) return;\n  const reasonId = $("#lost-reason").value;\n  if (!reasonId) { showToast("Seleccioná el motivo de pérdida.", "warning"); return; }\n  $("#lost-dialog").close();\n  v2623OpenCloseAmountDialog("lost", reasonId);\n});',
    "cierre perdido"
  );
  source = source.replace('    negociacion_ganada: "Negociación ganada",', '    negociacion_ganada: "Negociación ganada",\n    monto_negociacion_actualizado: "Monto de negociación actualizado",\n    monto_cierre_confirmado: "Monto de cierre confirmado",');
  return source;
}

export function applyV2623ServerPatches(source) {
  if (source.includes(SERVER_MARKER)) return source;
  source = replaceOnce(source, 'app.post("/api/deals/:id/assign",', `${AMOUNT_ROUTE}app.post("/api/deals/:id/assign",`, "ruta assign para insertar monto");
  source = replaceOnce(
    source,
    "    const fromStage = existing.stage;\n    const deal = closeWon(data, request.params.id);",
    "    const fromStage = existing.stage;\n    const closingAmount = Number(request.body?.closingAmount);\n    if (request.body?.amountConfirmed !== true || !Number.isFinite(closingAmount) || closingAmount <= 0) throw new Error(\"Confirmá un monto de cierre mayor a cero antes de marcar como ganado.\");\n    const productAmount = (existing.items || []).filter((item) => [\"reserved\", \"sold\"].includes(item.status)).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);\n    existing.negotiationAmount = Math.round(closingAmount);\n    existing.closingAmount = Math.round(closingAmount);\n    existing.closingAmountSource = productAmount > 0 && Math.round(productAmount) === Math.round(closingAmount) ? \"products\" : \"manual\";\n    existing.closingAmountConfirmedAt = timestamp();\n    existing.closingAmountConfirmedByUserId = user.id;\n    existing.closingAmountConfirmedByName = user.name;\n    recordAuditEvent(user, \"monto_cierre_confirmado\", { dealId: existing.id, amount: existing.closingAmount, outcome: \"won\", source: existing.closingAmountSource }, existing.branchId, \"human\");\n    const deal = closeWon(data, request.params.id);",
    "confirmación de monto ganado"
  );
  source = replaceOnce(
    source,
    "    const fromStage = existing.stage;\n    const deal = closeLost(data, request.params.id, request.body?.reasonId);",
    "    const fromStage = existing.stage;\n    const closingAmount = Number(request.body?.closingAmount);\n    if (request.body?.amountConfirmed !== true || !Number.isFinite(closingAmount) || closingAmount < 0) throw new Error(\"Confirmá el monto de cierre antes de cerrar como perdido.\");\n    const productAmount = (existing.items || []).filter((item) => [\"reserved\", \"sold\"].includes(item.status)).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);\n    existing.negotiationAmount = Math.round(closingAmount);\n    existing.closingAmount = Math.round(closingAmount);\n    existing.closingAmountSource = productAmount > 0 && Math.round(productAmount) === Math.round(closingAmount) ? \"products\" : \"manual\";\n    existing.closingAmountConfirmedAt = timestamp();\n    existing.closingAmountConfirmedByUserId = user.id;\n    existing.closingAmountConfirmedByName = user.name;\n    recordAuditEvent(user, \"monto_cierre_confirmado\", { dealId: existing.id, amount: existing.closingAmount, outcome: \"lost\", source: existing.closingAmountSource }, existing.branchId, \"human\");\n    const deal = closeLost(data, request.params.id, request.body?.reasonId);",
    "confirmación de monto perdido"
  );
  source = replaceOnce(source, "app.post(\"/api/deals/:id/amount\"", `${REPORT_HELPER}app.post(\"/api/deals/:id/amount\"`, "helper de métricas");
  source = replaceOnce(
    source,
    "  const report = buildReports(data, { days, ownerUserId: ownerUserId || null, branchId: branchId || null });",
    "  const report = buildReports(data, { days, ownerUserId: ownerUserId || null, branchId: branchId || null });\n  v2623ApplyAmountMetrics(report, { days, ownerUserId: ownerUserId || null, branchId: branchId || null });",
    "métricas de reportes"
  );
  return source;
}
