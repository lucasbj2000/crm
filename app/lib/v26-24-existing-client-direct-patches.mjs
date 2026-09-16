const UI_MARKER = "// V26.24 EXISTING_CLIENT_DIRECT_UI";
const SERVER_MARKER = "// V26.24 EXISTING_CLIENT_DIRECT_SERVER";

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`V26.24: no se encontró ${label}`);
  return source.replace(search, replacement);
}

const UI_HELPERS = [
  UI_MARKER,
  "let v2624ClientLookupTimer = null;",
  "let v2624ExistingClient = null;",
  "",
  "function v2624CurrentClientBranchId() {",
  "  return $(\"#client-branch\")?.value || appState?.currentUser?.branchId || \"\";",
  "}",
  "",
  "function v2624EnsureExistingClientUi() {",
  "  let box = $(\"#client-existing-result\");",
  "  if (!box) {",
  "    box = document.createElement(\"div\");",
  "    box.id = \"client-existing-result\";",
  "    box.className = \"client-existing-result\";",
  "    box.hidden = true;",
  "    box.innerHTML = '<div class=\"client-existing-head\"><div><small>CLIENTE ENCONTRADO</small><strong id=\"client-existing-name\">Cliente</strong></div><span id=\"client-existing-status\"></span></div><div id=\"client-existing-copy\" class=\"client-existing-copy\"></div><div id=\"client-existing-assignments\" class=\"client-existing-assignments\"></div><button class=\"button primary wide\" id=\"client-existing-direct\" type=\"button\">Iniciar conversación desde mi sucursal</button>';",
  "    const limit = $(\"#client-limit-copy\");",
  "    if (limit?.parentElement) limit.parentElement.insertBefore(box, limit);",
  "  }",
  "  if (!document.querySelector(\"#v2624-existing-client-style\")) {",
  "    const style = document.createElement(\"style\");",
  "    style.id = \"v2624-existing-client-style\";",
  "    style.textContent = '.client-existing-result{margin:10px 0;padding:12px;border:1px solid #dbe4dc;border-radius:12px;background:#f7faf7}.client-existing-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.client-existing-head small{display:block;font-size:9px;font-weight:800;letter-spacing:.08em;color:#7d956f}.client-existing-head strong{display:block;margin-top:3px;font-size:16px;color:#17382b}.client-existing-head span{padding:5px 8px;border-radius:999px;background:#e8f2e8;font-size:9px;font-weight:800;color:#365f3e}.client-existing-head span.blocked{background:#f7e9e5;color:#8d4536}.client-existing-copy{margin-top:9px;font-size:11px;line-height:1.45;color:#53645c}.client-existing-assignments{display:grid;gap:6px;margin:9px 0}.client-existing-assignment{display:flex;justify-content:space-between;gap:10px;padding:7px 8px;border-radius:8px;background:#fff;border:1px solid #e5ebe6;font-size:10px}.client-existing-assignment b{color:#213c30}.client-existing-assignment span{color:#748078;text-align:right}.client-existing-result .button[hidden]{display:none}.client-existing-result.is-blocked{border-color:#ecd5cf;background:#fff9f7}';",
  "    document.head.appendChild(style);",
  "  }",
  "  if (!box.dataset.bound) {",
  "    box.dataset.bound = \"1\";",
  "    $(\"#client-existing-direct\").addEventListener(\"click\", async () => {",
  "      const match = v2624ExistingClient;",
  "      if (!match?.found || !match.client?.id || match.action === \"blocked_same_branch\") return;",
  "      const button = $(\"#client-existing-direct\");",
  "      button.disabled = true;",
  "      try {",
  "        const payload = await api(\"/api/clients/\" + encodeURIComponent(match.client.id) + \"/direct-conversation\", { method: \"POST\", body: JSON.stringify({ phone: $(\"#client-phone\").value, branchId: v2624CurrentClientBranchId() }) });",
  "        setState(payload.state || payload);",
  "        $(\"#client-dialog\").close();",
  "        const dealId = payload.dealId || payload.directConversation?.dealId;",
  "        if (dealId) openDrawer(dealId);",
  "        showToast(payload.reused ? \"Conversación existente abierta\" : \"Conversación iniciada desde tu sucursal\");",
  "      } catch (error) { showToast(error.message, \"warning\"); }",
  "      finally { button.disabled = false; }",
  "    });",
  "    $(\"#client-phone\").addEventListener(\"input\", () => {",
  "      clearTimeout(v2624ClientLookupTimer);",
  "      v2624ClientLookupTimer = setTimeout(() => { void v2624LookupExistingClient({ silent: true }); }, 450);",
  "    });",
  "    $(\"#client-phone\").addEventListener(\"blur\", () => { void v2624LookupExistingClient({ silent: true }); });",
  "    $(\"#client-branch\").addEventListener(\"change\", () => { void v2624LookupExistingClient({ silent: true }); });",
  "  }",
  "  return box;",
  "}",
  "",
  "function v2624ResetExistingClientUi() {",
  "  v2624ExistingClient = null;",
  "  const box = v2624EnsureExistingClientUi();",
  "  if (box) { box.hidden = true; box.classList.remove(\"is-blocked\"); }",
  "  const name = $(\"#client-name\"); if (name) name.disabled = false;",
  "  const submit = $(\"#client-form button[type=submit]\"); if (submit) { submit.disabled = false; submit.textContent = \"Cargar cliente\"; }",
  "}",
  "",
  "function v2624RenderExistingClient(match) {",
  "  const box = v2624EnsureExistingClientUi();",
  "  if (!box) return;",
  "  v2624ExistingClient = match?.found ? match : null;",
  "  if (!match?.found) { v2624ResetExistingClientUi(); return; }",
  "  box.hidden = false;",
  "  const clientName = match.client?.name || match.client?.phone || \"Cliente existente\";",
  "  $(\"#client-existing-name\").textContent = clientName;",
  "  const nameInput = $(\"#client-name\"); if (nameInput) { nameInput.value = match.client?.name || nameInput.value; nameInput.disabled = true; }",
  "  const assignments = Array.isArray(match.assignments) ? match.assignments : [];",
  "  $(\"#client-existing-assignments\").innerHTML = assignments.length ? assignments.map((entry) => '<div class=\"client-existing-assignment\"><b>' + escapeHtml(entry.branchName || \"Sucursal\") + '</b><span>' + escapeHtml(entry.ownerName || \"Sin responsable\") + '</span></div>').join(\"\") : '<div class=\"client-existing-assignment\"><b>Cliente existente</b><span>Sin responsable previo</span></div>';",
  "  const status = $(\"#client-existing-status\");",
  "  const direct = $(\"#client-existing-direct\");",
  "  const submit = $(\"#client-form button[type=submit]\");",
  "  box.classList.toggle(\"is-blocked\", match.action === \"blocked_same_branch\");",
  "  status.classList.toggle(\"blocked\", match.action === \"blocked_same_branch\");",
  "  if (match.action === \"blocked_same_branch\") {",
  "    status.textContent = \"Asignado en tu sucursal\";",
  "    $(\"#client-existing-copy\").textContent = \"Responsable: \" + (match.currentBranchOwner?.ownerName || \"otro agente\") + \" · \" + (match.currentBranch?.name || \"tu sucursal\") + \". No podés tomar esta negociación mientras esté asignada a otro agente de tu misma sucursal.\";",
  "    direct.hidden = true;",
  "    submit.disabled = true;",
  "    submit.textContent = \"Cliente ya asignado\";",
  "  } else if (match.action === \"open_mine\") {",
  "    status.textContent = \"Ya es tu cliente\";",
  "    $(\"#client-existing-copy\").textContent = \"Este cliente ya está asignado a tu usuario en \" + (match.currentBranch?.name || \"tu sucursal\") + \". Podés entrar directamente a la conversación sin volver a cargar sus datos.\";",
  "    direct.hidden = false;",
  "    direct.textContent = \"Abrir conversación\";",
  "    submit.disabled = true;",
  "    submit.textContent = \"Cliente existente\";",
  "  } else {",
  "    status.textContent = \"Disponible en tu sucursal\";",
  "    const other = assignments.filter((entry) => entry.branchId !== match.currentBranch?.id && entry.ownerName);",
  "    const ownerCopy = other.length ? \" Actualmente lo gestiona \" + other.map((entry) => (entry.ownerName || \"un agente\") + \" en \" + (entry.branchName || \"otra sucursal\")).join(\", \") + \".\" : \"\";",
  "    $(\"#client-existing-copy\").textContent = \"La ficha del cliente ya existe en el CRM.\" + ownerCopy + \" Podés iniciar una conversación nueva desde \" + (match.currentBranch?.name || \"tu sucursal\") + \" sin duplicar la ficha ni completar sus datos nuevamente.\";",
  "    direct.hidden = false;",
  "    direct.textContent = \"Iniciar conversación desde mi sucursal\";",
  "    submit.disabled = true;",
  "    submit.textContent = \"Cliente existente\";",
  "  }",
  "}",
  "",
  "async function v2624LookupExistingClient({ silent = false } = {}) {",
  "  const raw = String($(\"#client-phone\")?.value || \"\").trim();",
  "  const digits = normalizeDialPhone(raw);",
  "  if (digits.length < 10) { v2624ResetExistingClientUi(); return null; }",
  "  try {",
  "    const match = await api(\"/api/clients/lookup\", { method: \"POST\", body: JSON.stringify({ phone: raw, branchId: v2624CurrentClientBranchId() }) });",
  "    v2624RenderExistingClient(match);",
  "    return match;",
  "  } catch (error) { if (!silent) showToast(error.message, \"warning\"); return null; }",
  "}",
  "",
].join("\n");

const NEW_CLIENT_BLOCK = `$("#new-client-button").addEventListener("click", () => {
  $("#client-form").reset();
  const user = appState.currentUser || {};
  const branches = (appState.branches || []).filter((branch) => branch.active !== false);
  $("#client-branch").innerHTML = branches.map((branch) => \`<option value="\${escapeHtml(branch.id)}">\${escapeHtml(branch.name)}</option>\`).join("");
  $("#client-branch").value = user.branchId || branches[0]?.id || "";
  $("#client-branch-row").hidden = user.role !== "admin";
  $("#client-limit-copy").textContent = \`Tu límite es de \${Number(appState.currentUser?.clientDailyLimit || 0)} clientes por día.\`;
  $("#client-dialog").showModal();
});

$("#client-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await mutate("/api/clients", "POST", { name: $("#client-name").value, phone: $("#client-phone").value, branchId: $("#client-branch").value || appState.currentUser?.branchId });
    $("#client-dialog").close();
    showToast("Cliente cargado y asignado a tu usuario");
  } catch (error) { showToast(error.message, "warning"); }
});`;

const NEW_CLIENT_REPLACEMENT = `$("#new-client-button").addEventListener("click", () => {
  $("#client-form").reset();
  const user = appState.currentUser || {};
  const branches = (appState.branches || []).filter((branch) => branch.active !== false);
  $("#client-branch").innerHTML = branches.map((branch) => \`<option value="\${escapeHtml(branch.id)}">\${escapeHtml(branch.name)}</option>\`).join("");
  $("#client-branch").value = user.branchId || branches[0]?.id || "";
  $("#client-branch-row").hidden = user.role !== "admin";
  $("#client-limit-copy").textContent = \`Tu límite es de \${Number(appState.currentUser?.clientDailyLimit || 0)} clientes nuevos por día. Los clientes ya existentes no vuelven a descontar cupo.\`;
  v2624EnsureExistingClientUi();
  v2624ResetExistingClientUi();
  $("#client-dialog").showModal();
  requestAnimationFrame(() => $("#client-phone")?.focus());
});

$("#client-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const match = await v2624LookupExistingClient();
    if (match?.found) return;
    await mutate("/api/clients", "POST", { name: $("#client-name").value, phone: $("#client-phone").value, branchId: $("#client-branch").value || appState.currentUser?.branchId });
    $("#client-dialog").close();
    showToast("Cliente cargado y asignado a tu usuario");
  } catch (error) { showToast(error.message, "warning"); }
});`;

const SERVER_ROUTES = [
  SERVER_MARKER,
  "function v2624ClientAssignments(client, phoneDigits) {",
  "  refreshClientBranchRelationships(client);",
  "  return (data.branches || []).filter((branch) => branch.active !== false).map((branch) => {",
  "    const owner = v214OwnerForClient(client, branch.id, phoneDigits);",
  "    const relation = (client.branchRelationships || []).find((entry) => entry.branchId === branch.id && entry.active !== false);",
  "    const branchOwner = client.branchOwners?.[branch.id];",
  "    const ownerUserId = owner.userId || branchOwner?.userId || relation?.ownerUserId || null;",
  "    const ownerName = owner.userName || branchOwner?.userName || relation?.ownerName || \"\";",
  "    if (!ownerUserId && !owner.deal && !relation) return null;",
  "    return { branchId: branch.id, branchName: branch.name, ownerUserId, ownerName, dealId: owner.deal?.id || null, open: Boolean(owner.deal && OPEN_STAGES.has(owner.deal.stage)) };",
  "  }).filter(Boolean);",
  "}",
  "",
  "app.post(\"/api/clients/lookup\", async (request, response, next) => {",
  "  try {",
  "    const user = currentUser(request);",
  "    if (!user) return response.status(401).json({ error: \"Sesión requerida.\" });",
  "    const digits = normalizePhone(request.body?.phone);",
  "    if (!digits || digits.length < 10 || digits.length > 15) return response.json({ found: false });",
  "    let branchId = cleanText(request.body?.branchId, 120) || user.branchId || primaryBranchId();",
  "    if (user.role !== \"admin\" && user.branchId) branchId = user.branchId;",
  "    const branch = getBranch(branchId);",
  "    if (!branch || branch.active === false || !userCanAccessBranch(user, branchId)) throw new Error(\"No tenés acceso a la sucursal seleccionada.\");",
  "    const identity = findClientIdentity(data, { phone: digits });",
  "    if (!identity?.client) return response.json({ found: false, currentBranch: { id: branch.id, name: branch.name } });",
  "    const client = identity.client;",
  "    const currentOwner = v214OwnerForClient(client, branchId, digits);",
  "    const assignments = v2624ClientAssignments(client, digits);",
  "    let action = \"direct_available\";",
  "    if (currentOwner.userId && currentOwner.userId !== user.id) action = \"blocked_same_branch\";",
  "    else if (currentOwner.userId === user.id) action = \"open_mine\";",
  "    response.setHeader(\"Cache-Control\", \"no-store\");",
  "    response.json({",
  "      found: true, action,",
  "      client: { id: client.id, name: client.name || client.company || identity.contactPerson?.name || identity.phoneRecord?.phone || `+${digits}`, phone: identity.phoneRecord?.phone || client.phone || `+${digits}` },",
  "      currentBranch: { id: branch.id, name: branch.name },",
  "      currentBranchOwner: { ownerUserId: currentOwner.userId || null, ownerName: currentOwner.userName || \"\", dealId: currentOwner.deal?.id || null },",
  "      assignments,",
  "    });",
  "  } catch (error) { next(error); }",
  "});",
  "",
  "app.post(\"/api/clients/:id/direct-conversation\", async (request, response, next) => {",
  "  try {",
  "    const user = currentUser(request);",
  "    if (!user) return response.status(401).json({ error: \"Sesión requerida.\" });",
  "    const client = findClient(data, request.params.id);",
  "    if (!client) throw new Error(\"Cliente no encontrado.\");",
  "    const requestedDigits = normalizePhone(request.body?.phone);",
  "    const identity = requestedDigits ? findClientIdentity(data, { phone: requestedDigits }) : null;",
  "    if (identity?.client && identity.client.id !== client.id) throw new Error(\"El número pertenece a otra ficha de cliente.\");",
  "    const digits = requestedDigits || normalizePhone(client.phone || (client.phones || []).find((entry) => entry.active !== false)?.phone);",
  "    if (!digits || digits.length < 10 || digits.length > 15) throw new Error(\"El cliente no tiene un número de WhatsApp válido.\");",
  "    let branchId = cleanText(request.body?.branchId, 120) || user.branchId || primaryBranchId();",
  "    if (user.role !== \"admin\" && user.branchId) branchId = user.branchId;",
  "    const branch = getBranch(branchId);",
  "    if (!branch || branch.active === false || !userCanAccessBranch(user, branchId)) throw new Error(\"No tenés acceso a la sucursal seleccionada.\");",
  "    const owner = v214OwnerForClient(client, branchId, digits);",
  "    if (owner.userId && owner.userId !== user.id) {",
  "      const conflict = new Error(`Este cliente ya está asignado a ${owner.userName || \"otro agente\"} en ${branch.name}.`); conflict.status = 409; throw conflict;",
  "    }",
  "    const reused = Boolean(owner.deal && OPEN_STAGES.has(owner.deal.stage));",
  "    let deal = reused ? owner.deal : v214CreateOrFindCommunicationDeal(client, digits, branchId, { userId: user.id, userName: user.name });",
  "    deal.ownerUserId = user.id;",
  "    deal.ownerName = user.name;",
  "    deal.branchId = branchId;",
  "    deal.source = deal.source || \"manual_existing_client\";",
  "    deal.createdByUserId = deal.createdByUserId || user.id;",
  "    deal.updatedAt = timestamp();",
  "    client.branchOwners = client.branchOwners && typeof client.branchOwners === \"object\" ? client.branchOwners : {};",
  "    client.branchOwners[branchId] = { userId: user.id, userName: user.name, updatedAt: timestamp() };",
  "    refreshClientBranchRelationships(client);",
  "    let relation = (client.branchRelationships || []).find((entry) => entry.branchId === branchId);",
  "    if (!relation) { relation = { branchId, active: true, manual: true, preferred: false, customerSince: timestamp(), lastInteractionAt: timestamp(), lastPurchaseAt: null, purchaseCount: 0, totalPurchased: 0, ownerUserId: user.id, ownerName: user.name, notes: \"\", createdAt: timestamp(), updatedAt: timestamp() }; client.branchRelationships.push(relation); }",
  "    relation.active = true; relation.manual = true; relation.ownerUserId = user.id; relation.ownerName = user.name; relation.lastInteractionAt = timestamp(); relation.updatedAt = timestamp();",
  "    client.updatedAt = timestamp();",
  "    recordAuditEvent(user, \"cliente_existente_conversacion_directa\", { clientId: client.id, dealId: deal.id, branchId, phone: `+${digits}`, reused, previousAssignments: v2624ClientAssignments(client, digits).filter((entry) => entry.branchId !== branchId) }, branchId);",
  "    addActivity(data, `${user.name} inició una conversación con ${client.name || client.company || `+${digits}`} desde ${branch.name} reutilizando la ficha existente.`, \"success\");",
  "    await store.save();",
  "    response.json({ state: stateResponse(request), dealId: deal.id, reused, directConversation: { dealId: deal.id, clientId: client.id, branchId, branchName: branch.name } });",
  "  } catch (error) { next(error); }",
  "});",
  "",
].join("\n");

export function applyV2624CoreUiPatches(source) {
  if (source.includes(UI_MARKER)) return source;
  let patched = replaceOnce(source, '$("#new-client-button").addEventListener("click", () => {', UI_HELPERS + '\n$("#new-client-button").addEventListener("click", () => {', "inicio de Cargar cliente");
  patched = replaceOnce(patched, NEW_CLIENT_BLOCK, NEW_CLIENT_REPLACEMENT, "flujo completo de Cargar cliente");
  return patched;
}

export function applyV2624ServerPatches(source) {
  if (source.includes(SERVER_MARKER)) return source;
  const anchor = 'app.post("/api/deals/:id/assign", async (request, response, next) => {';
  return replaceOnce(source, anchor, SERVER_ROUTES + '\n' + anchor, "ruta de asignación de negociación");
}
