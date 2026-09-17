const MARKER = "// V26.29 AGENT_OWNERSHIP_SCOPE";

function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.29: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.29: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) throw new Error(`V26.29: ${label} esperaba 1 coincidencia y encontró ${matches.length}.`);
  return source.replace(pattern, replacement);
}

export function applyV2629ServerPatches(source) {
  if (source.includes(MARKER)) return source;

  source = replaceOnce(
    source,
    `    if (user.role === "agent") {\n      payload.deals = payload.deals.filter((deal) => {\n        const line=dealWhatsappLine(deal);\n        if(line && !canUserUseWhatsappLine(user,line)) return false;\n        const available = isAgentAvailable(user, line ? null : (user.branchId || primaryBranchId()));\n        return deal.ownerUserId === user.id || (available && !deal.ownerUserId) || Boolean(v214ActiveCommunicationGrant(deal, user));\n      });\n    }`,
    `    if (user.role === "agent") {\n      payload.deals = payload.deals.filter((deal) => {\n        if (deal.ownerUserId === user.id) return true;\n        const branchId = deal.branchId || primaryBranchId();\n        const branchLeadPool = !deal.ownerUserId && deal.stage === STAGES.NEW && branchId === (user.branchId || primaryBranchId());\n        if (branchLeadPool) return true;\n        return Boolean(v214ActiveCommunicationGrant(deal, user));\n      });\n    }`,
    "visibilidad de negociaciones del agente",
  );

  source = replaceOnce(
    source,
    `function userCanAccessDeal(user, deal) {\n  if(!user||!deal)return false;\n  if(user.role==="admin")return true;\n  const scopeAllowed=userCanAccessBranch(user,deal.branchId||primaryBranchId())||canUserUseWhatsappLine(user,dealWhatsappLine(deal));\n  if(!scopeAllowed)return false;\n  if(user.role==="agent"&&deal.ownerUserId&&deal.ownerUserId!==user.id&&!v214ActiveCommunicationGrant(deal,user))return false;\n  return true;\n}`,
    `function userCanAccessDeal(user, deal) {\n  if(!user||!deal)return false;\n  if(user.role==="admin")return true;\n  const branchId=deal.branchId||primaryBranchId();\n  const scopeAllowed=userCanAccessBranch(user,branchId)||canUserUseWhatsappLine(user,dealWhatsappLine(deal));\n  if(!scopeAllowed)return false;\n  if(user.role==="agent"){\n    if(deal.ownerUserId===user.id)return true;\n    if(!deal.ownerUserId&&deal.stage===STAGES.NEW&&branchId===(user.branchId||primaryBranchId()))return true;\n    if(v214ActiveCommunicationGrant(deal,user))return true;\n    return false;\n  }\n  return true;\n}`,
    "control de acceso a una negociación",
  );

  source = replaceOnce(
    source,
    `    const line = dealWhatsappLine(deal);\n    const assignedOwner = chooseWhatsappLineOwner(line);\n    if (assignedOwner) {\n      deal.ownerUserId = assignedOwner.id;\n      deal.ownerName = assignedOwner.name;\n      deal.assignmentSource = "whatsapp_line";\n      deal.assignmentLineId = line?.id || null;\n      deal.assignmentAt = timestamp();\n    }`,
    `    const line = dealWhatsappLine(deal);\n    const assignedOwner = deal.ownerUserId\n      ? data.users.find((entry) => entry.id === deal.ownerUserId && entry.active !== false) || null\n      : null;\n    if (created) {\n      deal.ownerUserId = null;\n      deal.ownerName = "";\n      deal.assignmentSource = "branch_lead_pool";\n      deal.assignmentLineId = line?.id || null;\n      deal.assignmentAt = null;\n    } else if (assignedOwner) {\n      deal.ownerUserId = assignedOwner.id;\n      deal.ownerName = assignedOwner.name;\n    }`,
    "asignación automática de nuevos leads",
  );

  source = replaceOnce(
    source,
    `    const targetId = cleanText(request.body?.userId, 120) || actor.id;\n    if (targetId !== actor.id && actor.role !== "admin" && actor.role !== "manager") throw new Error("No tenés permiso para reasignar clientes.");\n    const target = data.users.find((entry) => entry.id === targetId && entry.active !== false);\n    if (!target) throw new Error("Usuario no encontrado.");\n    const line=dealWhatsappLine(deal);\n    if (!userCanAccessDeal(actor,deal)) throw new Error("No tenés acceso a esta negociación ni a su conexión de WhatsApp.");\n    if (target.role!=="admin"&&!canUserUseWhatsappLine(target,line)) throw new Error(\`Primero asigná la conexión \${line?.name||"WhatsApp"} a \${target.name}.\`);\n    if (deal.ownerUserId && deal.ownerUserId !== actor.id && actor.role !== "admin") throw new Error(\`Esta conversación pertenece a \${deal.ownerName || "otro asesor"}.\`);`,
    `    const targetId = cleanText(request.body?.userId, 120) || actor.id;\n    const canReassignTeam = ["admin", "manager", "supervisor"].includes(actor.role);\n    if (targetId !== actor.id && !canReassignTeam) throw new Error("No tenés permiso para reasignar clientes.");\n    const target = data.users.find((entry) => entry.id === targetId && entry.active !== false);\n    if (!target) throw new Error("Usuario no encontrado.");\n    const line=dealWhatsappLine(deal);\n    if (!userCanAccessDeal(actor,deal)) throw new Error("No tenés acceso a esta negociación ni a su conexión de WhatsApp.");\n    if (["manager", "supervisor"].includes(actor.role)) {\n      const actorBranch = actor.branchId || primaryBranchId();\n      const dealBranch = deal.branchId || primaryBranchId();\n      if (dealBranch !== actorBranch) throw new Error("Solo podés reasignar negociaciones de tu sucursal.");\n      if (target.role !== "agent" || (target.branchId || primaryBranchId()) !== dealBranch) throw new Error("Solo podés asignar la negociación a un agente activo de tu sucursal.");\n    }\n    if (target.role!=="admin"&&!canUserUseWhatsappLine(target,line)) throw new Error(\`Primero asigná la conexión \${line?.name||"WhatsApp"} a \${target.name}.\`);\n    if (deal.ownerUserId && deal.ownerUserId !== actor.id && !canReassignTeam) throw new Error(\`Esta conversación pertenece a \${deal.ownerName || "otro asesor"}.\`);`,
    "reasignación por jefatura",
  );

  source = replaceRegexOnce(
    source,
    /function reportPermissions\(user\) \{\n  return \{/,
    `function reportPermissions(user) {\n  if (user?.role === "agent") return { own: true, branch: false, team: false, global: false, audit: false };\n  return {`,
    "permisos de reportes",
  );

  return `${source}\n\n${MARKER}\n`;
}
