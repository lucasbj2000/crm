const SERVER_MARKER = "// V26.29 AGENT_OWNERSHIP_VISIBILITY";
const CORE_MARKER = "// V26.29 MANAGER_OWNER_UI";

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`V26.29: no se encontró ${label}.`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`V26.29: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) throw new Error(`V26.29: ${label} esperaba 1 coincidencia y encontró ${matches.length}.`);
  return source.replace(pattern, replacement);
}

export function applyV2629ServerPatches(source) {
  if (source.includes(SERVER_MARKER)) return source;

  source = replaceRegexOnce(
    source,
    /function userCanAccessDeal\(user, deal\) \{[\s\S]*?\n\}\n\n+function roleDisplayName/,
    `function userCanAccessDeal(user, deal) {
  if(!user||!deal)return false;
  if(user.role==="admin")return true;
  const dealBranchId=deal.branchId||primaryBranchId();
  const line=dealWhatsappLine(deal);
  const scopeAllowed=userCanAccessBranch(user,dealBranchId)||canUserUseWhatsappLine(user,line);
  if(!scopeAllowed)return false;
  if(user.role==="agent"){
    if(deal.ownerUserId)return deal.ownerUserId===user.id||Boolean(v214ActiveCommunicationGrant(deal,user));
    const sameBranch=dealBranchId===(user.branchId||primaryBranchId());
    return sameBranch&&deal.stage===STAGES.NEW;
  }
  return true;
}

${SERVER_MARKER}
function roleDisplayName`,
    "control de acceso de negociaciones"
  );

  source = replaceRegexOnce(
    source,
    /    if \(user\.role === "agent"\) \{\n      payload\.deals = payload\.deals\.filter\(\(deal\) => \{[\s\S]*?\n      \}\);\n    \}/,
    `    if (user.role === "agent") {
      payload.deals = payload.deals.filter((deal) => {
        if (deal.ownerUserId) return deal.ownerUserId === user.id || Boolean(v214ActiveCommunicationGrant(deal, user));
        const dealBranchId = deal.branchId || primaryBranchId();
        return deal.stage === STAGES.NEW && dealBranchId === (user.branchId || primaryBranchId());
      });
    }`,
    "filtro del estado para agentes"
  );

  source = replaceRegexOnce(
    source,
    /    const line = dealWhatsappLine\(deal\);\n    const assignedOwner = chooseWhatsappLineOwner\(line\);\n    if \(assignedOwner\) \{[\s\S]*?\n    \}\n    deal\.stage = STAGES\.NEW;\n    deal\.botActive = true;/,
    `    const line = dealWhatsappLine(deal);
    // Los contactos nuevos quedan sin responsable. Todos los agentes de la sucursal
    // los ven en Nuevos hasta que el primero inicia la gestión.
    deal.ownerUserId = null;
    deal.ownerName = "";
    deal.assignmentSource = "first_response";
    deal.assignmentLineId = line?.id || null;
    deal.assignmentAt = null;
    deal.stage = STAGES.NEW;
    deal.botActive = true;`,
    "asignación automática de nuevos contactos"
  );

  source = replaceOnce(
    source,
    `  let branchId = cleanText(request.query.branchId, 120);
  let ownerUserId = cleanText(request.query.userId, 120);`,
    `  let branchId = cleanText(request.query.branchId, 120);
  let ownerUserId = cleanText(request.query.userId, 120);
  // Un agente nunca puede ampliar el alcance de reportes mediante parámetros o permisos heredados.
  // Sus métricas se calculan exclusivamente sobre sus propias negociaciones.
  if (user?.role === "agent") {
    branchId = user.branchId || primaryBranchId();
    ownerUserId = user.id;
  }`,
    "alcance inicial de reportes"
  );

  source = replaceRegexOnce(
    source,
    /    const target = data\.users\.find\(\(entry\) => entry\.id === targetId && entry\.active !== false\);\n    if \(!target\) throw new Error\("Usuario no encontrado\."\);\n    const line=dealWhatsappLine\(deal\);/,
    `    const target = data.users.find((entry) => entry.id === targetId && entry.active !== false);
    if (!target) throw new Error("Usuario no encontrado.");
    if (actor.role === "manager") {
      const managerBranchId = actor.branchId || null;
      if (!managerBranchId || (deal.branchId || primaryBranchId()) !== managerBranchId) throw new Error("Solo podés reasignar negociaciones de tu sucursal.");
      if (target.role !== "agent" || target.branchId !== managerBranchId) throw new Error("Solo podés asignar la negociación a un agente activo de tu sucursal.");
    }
    const line=dealWhatsappLine(deal);`,
    "restricción de reasignación del jefe"
  );

  return source;
}

export function applyV2629CoreUiPatches(source) {
  if (source.includes(CORE_MARKER)) return source;

  source = replaceOnce(
    source,
    `  const activeUsers = (appState.users || []).filter((entry) => entry.active !== false && entry.branchId === deal.branchId && (["admin", "manager", "supervisor"].includes(user.role) || entry.id === user.id));
  $("#drawer-owner-select").innerHTML = activeUsers.map((entry) => \`<option value="\${escapeHtml(entry.id)}"\${entry.id === (deal.ownerUserId || user.id) ? " selected" : ""}>\${escapeHtml(entry.name)}\${entry.online ? " · en línea" : ""}</option>\`).join("");
  const canManageOwner = ["admin", "manager", "supervisor"].includes(user.role);`,
    `  const activeUsers = (appState.users || []).filter((entry) => {
    if (entry.active === false) return false;
    if (user.role === "admin") return entry.branchId === deal.branchId;
    if (user.role === "manager") return entry.role === "agent" && entry.branchId === user.branchId && entry.branchId === deal.branchId;
    return entry.id === user.id;
  });
  $("#drawer-owner-select").innerHTML = activeUsers.map((entry) => \`<option value="\${escapeHtml(entry.id)}"\${entry.id === deal.ownerUserId ? " selected" : ""}>\${escapeHtml(entry.name)}\${entry.online ? " · en línea" : ""}</option>\`).join("");
  const canManageOwner = ["admin", "manager"].includes(user.role);`,
    "selector de responsable"
  );

  return source + `\n${CORE_MARKER}\n`;
}
