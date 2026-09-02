function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.9 acceso: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.9 acceso: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceAllRequired(source, find, replacement, label, minimum = 1) {
  const count = source.split(find).length - 1;
  if (count < minimum) throw new Error(`V26.9 acceso: ${label} aparece ${count} vez/veces; se esperaban al menos ${minimum}.`);
  return source.split(find).join(replacement);
}

const accessHelpers = String.raw`
const V269_SAFE_MODULES = Object.freeze([
  "crm", "branches", "organization", "attendance", "stock", "replies", "documents",
  "campaigns", "forms", "surveys", "news", "reports", "aiCenter", "productivity",
  "tasks", "approvals", "objectives", "customer360", "globalSearch", "quality",
  "knowledge", "forecasting", "goals",
]);
const V269_TECHNICAL_MODULES = new Set([
  "whatsapp", "data", "settings", "design", "botAutomation", "customFields", "security",
  "automationLab", "superAdmin", "aiGovernance",
]);
const V269_FUNCTION_KEYS = Object.freeze([
  "manageDeals", "sendMessages", "assignDeals", "transferDeals", "manageStock",
  "manageReplies", "manageDocuments", "manageCampaigns", "manageForms", "manageNews",
  "manageAttendance", "manageOrganization", "manageObjectives", "manageApprovals",
  "viewGlobalReports", "viewAudit", "useAi",
]);

function v269RoleDefaults(role = "agent") {
  const allSafe = Object.fromEntries(V269_SAFE_MODULES.map((key) => [key, true]));
  const modules = Object.fromEntries(V269_SAFE_MODULES.map((key) => [key, false]));
  const functions = Object.fromEntries(V269_FUNCTION_KEYS.map((key) => [key, false]));
  if (role === "admin") {
    for (const key of V269_SAFE_MODULES) modules[key] = true;
    for (const key of V269_FUNCTION_KEYS) functions[key] = true;
    return { modules, functions };
  }
  if (role === "director") {
    Object.assign(modules, allSafe);
    Object.assign(functions, { viewGlobalReports: true, viewAudit: true, useAi: true });
    return { modules, functions };
  }
  if (role === "manager") {
    Object.assign(modules, allSafe);
    Object.assign(functions, {
      manageDeals: true, sendMessages: true, assignDeals: true, transferDeals: true,
      manageStock: true, manageReplies: true, manageDocuments: true, manageCampaigns: true,
      manageForms: true, manageNews: true, manageAttendance: true, manageOrganization: false,
      manageObjectives: true, manageApprovals: true, viewGlobalReports: true, viewAudit: true,
      useAi: true,
    });
    return { modules, functions };
  }
  if (role === "supervisor") {
    Object.assign(modules, allSafe);
    Object.assign(functions, {
      manageDeals: true, sendMessages: true, assignDeals: true, transferDeals: true,
      manageStock: true, manageReplies: true, manageDocuments: true, manageCampaigns: true,
      manageForms: true, manageNews: true, manageAttendance: true, manageOrganization: false,
      manageObjectives: true, manageApprovals: true, viewGlobalReports: false, viewAudit: true,
      useAi: true,
    });
    return { modules, functions };
  }
  Object.assign(modules, {
    crm: true, attendance: true, stock: true, replies: true, documents: true, news: true,
    reports: true, aiCenter: true, productivity: true, tasks: true, approvals: true,
    customer360: true, globalSearch: true, knowledge: true,
  });
  Object.assign(functions, { manageDeals: true, sendMessages: true, transferDeals: true, useAi: true });
  return { modules, functions };
}

function v269NormalizeBooleanMap(input, defaults, allowedKeys) {
  const source = input && typeof input === "object" ? input : {};
  const result = { ...defaults };
  for (const key of allowedKeys) if (source[key] !== undefined) result[key] = source[key] === true;
  return result;
}

function v269NormalizeUserAccess(user, input = null) {
  if (!user) return user;
  const allowedRole = ["admin", "director", "manager", "supervisor", "agent"].includes(user.role) ? user.role : "agent";
  user.role = allowedRole;
  const defaults = v269RoleDefaults(allowedRole);
  const incoming = input && typeof input === "object" ? input : {};
  const moduleSource = incoming.modulePermissions && typeof incoming.modulePermissions === "object" ? incoming.modulePermissions : user.modulePermissions;
  const functionSource = incoming.functionPermissions && typeof incoming.functionPermissions === "object" ? incoming.functionPermissions : user.functionPermissions;
  user.modulePermissions = v269NormalizeBooleanMap(moduleSource, defaults.modules, V269_SAFE_MODULES);
  user.functionPermissions = v269NormalizeBooleanMap(functionSource, defaults.functions, V269_FUNCTION_KEYS);

  if (incoming.botEnabled !== undefined) user.botEnabled = incoming.botEnabled !== false;
  else if (user.botEnabled === undefined) user.botEnabled = true;
  if (incoming.aiHelpEnabled !== undefined) user.aiHelpEnabled = incoming.aiHelpEnabled !== false;
  else if (user.aiHelpEnabled === undefined) user.aiHelpEnabled = true;

  if (allowedRole === "admin") {
    user.botEnabled = true;
    user.aiHelpEnabled = true;
    for (const key of V269_SAFE_MODULES) user.modulePermissions[key] = true;
    for (const key of V269_FUNCTION_KEYS) user.functionPermissions[key] = true;
  }
  if (["manager", "director"].includes(allowedRole)) user.functionPermissions.viewGlobalReports = true;
  if (user.aiHelpEnabled === false) {
    user.modulePermissions.aiCenter = false;
    user.functionPermissions.useAi = false;
  }

  if (!user.permissions || typeof user.permissions !== "object") user.permissions = {};
  user.permissions.ownReports = true;
  user.permissions.branchReports = allowedRole === "admin" || ["director", "manager", "supervisor"].includes(allowedRole) || user.permissions.branchReports === true;
  user.permissions.teamReports = allowedRole === "admin" || ["director", "manager", "supervisor"].includes(allowedRole) || user.permissions.teamReports === true;
  user.permissions.globalReports = allowedRole === "admin" || ["director", "manager"].includes(allowedRole) || user.functionPermissions.viewGlobalReports === true;
  user.permissions.auditReports = allowedRole === "admin" || user.functionPermissions.viewAudit === true;
  user.permissions.campaignView = allowedRole === "admin" || user.modulePermissions.campaigns === true;
  user.permissions.campaignManage = allowedRole === "admin" || user.functionPermissions.manageCampaigns === true;
  user.permissions.customFieldsManage = allowedRole === "admin";
  user.permissions.attendanceManage = allowedRole === "admin" || user.functionPermissions.manageAttendance === true;
  user.permissions.newsPublish = allowedRole === "admin" || user.functionPermissions.manageNews === true;
  return user;
}

function v269EffectiveModules(user, companyModules = {}) {
  const result = { ...companyModules };
  if (!user) return result;
  v269NormalizeUserAccess(user);
  if (user.role === "admin") return result;
  for (const key of Object.keys(result)) {
    if (V269_TECHNICAL_MODULES.has(key)) result[key] = false;
    else if (V269_SAFE_MODULES.includes(key)) result[key] = result[key] !== false && user.modulePermissions?.[key] === true;
  }
  for (const key of V269_SAFE_MODULES) if (result[key] === undefined) result[key] = user.modulePermissions?.[key] === true;
  result.whatsapp = false;
  result.data = false;
  result.settings = false;
  result.botAutomation = false;
  result.customFields = false;
  result.security = false;
  result.automationLab = false;
  result.superAdmin = false;
  result.aiGovernance = false;
  if (user.aiHelpEnabled === false) result.aiCenter = false;
  return result;
}

function v269HasFunction(user, key) {
  if (!user) return false;
  if (user.role === "admin") return true;
  v269NormalizeUserAccess(user);
  return user.functionPermissions?.[key] === true;
}

function v269ModuleEnabledForUser(user, key) {
  if (!user) return false;
  if (user.role === "admin") return true;
  v269NormalizeUserAccess(user);
  if (V269_TECHNICAL_MODULES.has(key)) return false;
  return data.settings.modules?.[key] !== false && user.modulePermissions?.[key] === true;
}

function v269TechnicalRequest(request) {
  const method = String(request.method || "GET").toUpperCase();
  const pathname = String(request.path || "");
  if (/^\/api\/(connect|disconnect)$/.test(pathname)) return true;
  if (/^\/api\/whatsapp-lines(?:\/|$)/.test(pathname) && method !== "GET") return true;
  if (/^\/api\/branches(?:\/|$)/.test(pathname) && method !== "GET") return true;
  if (/^\/api\/(settings|platform|branding|backup|data|admin-assistant)(?:\/|$)/.test(pathname)) return true;
  if (/^\/api\/shared-drive\/(settings|sync)/.test(pathname)) return true;
  if (/^\/api\/operations\/settings/.test(pathname)) return true;
  if (/^\/api\/bot\/(instructions|profiles)/.test(pathname)) return true;
  if (/^\/api\/custom-fields(?:\/|$)/.test(pathname) && method !== "GET") return true;
  if (/^\/api\/(admin-guide|ai-governance|super-admin|super-automation|communication-orchestrator|campaign-safety)(?:\/|$)/.test(pathname)) return true;
  return false;
}

function v269RequestModule(request) {
  const pathname = String(request.path || "");
  if (/^\/api\/(deals|clients)(?:\/|$)/.test(pathname)) return "crm";
  if (/^\/api\/products(?:\/|$)/.test(pathname)) return "stock";
  if (/^\/api\/quick-replies(?:\/|$)/.test(pathname)) return "replies";
  if (/^\/api\/assistant\/documents(?:\/|$)/.test(pathname)) return "documents";
  if (/^\/api\/campaigns(?:\/|$)/.test(pathname)) return "campaigns";
  if (/^\/api\/forms(?:\/|$)/.test(pathname)) return "forms";
  if (/^\/api\/surveys(?:\/|$)/.test(pathname)) return "surveys";
  if (/^\/api\/news(?:\/|$)/.test(pathname)) return "news";
  if (/^\/api\/reports(?:\/|$)/.test(pathname)) return "reports";
  if (/^\/api\/(attendance|presence)(?:\/|$)/.test(pathname)) return "attendance";
  if (/^\/api\/(tasks|objectives|approvals)(?:\/|$)/.test(pathname)) return "productivity";
  if (/^\/api\/organization(?:\/|$)/.test(pathname)) return "organization";
  if (/^\/api\/ai(?:\/|$)/.test(pathname) || /\/copilot-suggestion$/.test(pathname)) return "aiCenter";
  return "";
}

function v269MutationFunction(request) {
  const method = String(request.method || "GET").toUpperCase();
  const pathname = String(request.path || "");
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return "";
  if (/^\/api\/deals\/[^/]+\/(message|media)/.test(pathname)) return "sendMessages";
  if (/^\/api\/deals\/[^/]+\/assign/.test(pathname)) return "assignDeals";
  if (/^\/api\/deals\/[^/]+\/transfer/.test(pathname)) return "transferDeals";
  if (/^\/api\/deals(?:\/|$)/.test(pathname) || /^\/api\/clients(?:\/|$)/.test(pathname)) return "manageDeals";
  if (/^\/api\/products(?:\/|$)/.test(pathname)) return "manageStock";
  if (/^\/api\/quick-replies(?:\/|$)/.test(pathname)) return "manageReplies";
  if (/^\/api\/assistant\/documents(?:\/|$)/.test(pathname)) return "manageDocuments";
  if (/^\/api\/campaigns(?:\/|$)/.test(pathname)) return "manageCampaigns";
  if (/^\/api\/(forms|surveys)(?:\/|$)/.test(pathname)) return "manageForms";
  if (/^\/api\/news(?:\/|$)/.test(pathname)) return "manageNews";
  if (/^\/api\/attendance\/me$/.test(pathname)) return "";
  if (/^\/api\/attendance(?:\/|$)/.test(pathname)) return "manageAttendance";
  if (/^\/api\/organization(?:\/|$)/.test(pathname)) return "manageOrganization";
  if (/^\/api\/objectives(?:\/|$)/.test(pathname)) return "manageObjectives";
  if (/^\/api\/approvals\/[^/]+\/decision/.test(pathname)) return "manageApprovals";
  return "";
}

function v269EmployeeAiRequest(request) {
  const pathname = String(request.path || "");
  return /^\/api\/ai(?:\/|$)/.test(pathname)
    || /\/copilot-suggestion$/.test(pathname)
    || /\/data-suggestions\/analyze$/.test(pathname);
}

for (const v269User of data.users || []) v269NormalizeUserAccess(v269User);

app.use((request, response, next) => {
  const pathname = String(request.path || "");
  if (!pathname.startsWith("/api/")) return next();
  const user = currentUser(request);
  if (v269TechnicalRequest(request)) {
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    if (user.role !== "admin") return response.status(403).json({ error: "Esta configuración técnica es exclusiva del Administrador." });
    return next();
  }
  if (!user) return next();
  v269NormalizeUserAccess(user);
  const moduleKey = v269RequestModule(request);
  if (moduleKey && !v269ModuleEnabledForUser(user, moduleKey)) return response.status(403).json({ error: "Tu usuario no tiene habilitado este sector del CRM." });
  if (v269EmployeeAiRequest(request) && (user.aiHelpEnabled === false || !v269HasFunction(user, "useAi"))) return response.status(403).json({ error: "La ayuda IA está desactivada para tu usuario." });
  const functionKey = v269MutationFunction(request);
  if (functionKey && !v269HasFunction(user, functionKey)) return response.status(403).json({ error: "Tu usuario no tiene habilitada esta función." });
  return next();
});
`;

export function applyV269AccessControlPatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    '["admin", "manager", "supervisor"].includes(request.body?.role)',
    '["admin", "director", "manager", "supervisor"].includes(request.body?.role)',
    "rol Director en alta de usuario",
  );
  patched = replaceOnce(
    patched,
    'user.role = ["admin", "manager", "supervisor"].includes(request.body.role) ? request.body.role : "agent";',
    'user.role = ["admin", "director", "manager", "supervisor"].includes(request.body.role) ? request.body.role : "agent";',
    "rol Director en edición de usuario",
  );

  patched = replaceOnce(
    patched,
    'if (!user || !["admin", "manager", "supervisor"].includes(user.role)) return response.status(403).json({ error: "Esta acción requiere permisos de jefatura, gerencia o administración." });',
    'if (!user || !["admin", "director", "manager", "supervisor"].includes(user.role)) return response.status(403).json({ error: "Esta acción requiere permisos operativos de jefatura, gerencia, dirección o administración." });',
    "requireManagerOrAdmin",
  );

  patched = replaceOnce(
    patched,
    '  request.currentUser = user;\n  return next();\n}\n\nfunction userCanAccessBranch',
    '  request.currentUser = user;\n  return next();\n}\n\n' + accessHelpers + '\nfunction userCanAccessBranch',
    "instalación del motor de permisos",
  );

  patched = replaceOnce(
    patched,
    'function userCanAccessBranch(user, branchId) {\n  if (!user) return false;\n  if (user.role === "admin") return true;\n  if (!user.branchId) return user.role === "manager";\n  if (user.role === "supervisor") return user.branchId === branchId;\n  return user.branchId === branchId;\n}',
    'function userCanAccessBranch(user, branchId) {\n  if (!user) return false;\n  if (["admin", "manager", "director"].includes(user.role)) return true;\n  if (!user.branchId) return false;\n  return user.branchId === branchId;\n}',
    "alcance por sucursal",
  );

  patched = replaceOnce(
    patched,
    'function canSeeAll(user) {\n  return Boolean(user && ["admin", "manager"].includes(user.role));\n}',
    'function canSeeAll(user) {\n  return Boolean(user && ["admin", "manager", "director"].includes(user.role));\n}',
    "visibilidad global",
  );

  patched = replaceOnce(
    patched,
    'function canViewGlobalReports(user) {\n  return Boolean(user && (user.role === "admin" || user.permissions?.globalReports === true));\n}',
    'function canViewGlobalReports(user) {\n  return Boolean(user && (["admin", "manager", "director"].includes(user.role) || user.permissions?.globalReports === true || v269HasFunction(user, "viewGlobalReports")));\n}',
    "reportes globales",
  );

  patched = replaceAllRequired(
    patched,
    'if (user.role !== "admin" && user.branchId)',
    'if (!["admin", "manager", "director"].includes(user.role) && user.branchId)',
    "filtros por sucursal del estado",
    2,
  );

  patched = replaceOnce(
    patched,
    '    modules: { ...(data.settings.modules || {}) },\n    aiFeatures: safeAiFeaturesFor(user),',
    '    modules: user ? v269EffectiveModules(user, data.settings.modules || {}) : { ...(data.settings.modules || {}) },\n    aiFeatures: safeAiFeaturesFor(user),',
    "módulos efectivos por usuario",
  );

  patched = replaceOnce(
    patched,
    'function safeAiFeaturesFor(user){\n  const features={...data.settings.aiFeatures};\n  if(!user) return {};\n  return features;\n}',
    'function safeAiFeaturesFor(user){\n  const features={...data.settings.aiFeatures};\n  if(!user) return {};\n  v269NormalizeUserAccess(user);\n  if(user.aiHelpEnabled===false || !v269HasFunction(user,"useAi")) return Object.fromEntries(Object.keys(features).map((key)=>[key,false]));\n  return features;\n}',
    "funciones IA por usuario",
  );

  patched = replaceOnce(
    patched,
    '    clientDailyLimit: Number(user.clientDailyLimit || 0),\n    permissions: {',
    '    clientDailyLimit: Number(user.clientDailyLimit || 0),\n    botEnabled: user.botEnabled !== false,\n    aiHelpEnabled: user.aiHelpEnabled !== false,\n    modulePermissions: { ...(user.modulePermissions || {}) },\n    functionPermissions: { ...(user.functionPermissions || {}) },\n    permissions: {',
    "campos públicos de usuarios",
  );

  patched = replaceOnce(
    patched,
    'clientDailyLimit: Number(user.clientDailyLimit || 0), attendance: { ...(user.attendance || { status: "offline" }) }, permissions:',
    'clientDailyLimit: Number(user.clientDailyLimit || 0), botEnabled: user.botEnabled !== false, aiHelpEnabled: user.aiHelpEnabled !== false, modulePermissions: { ...(user.modulePermissions || {}) }, functionPermissions: { ...(user.functionPermissions || {}) }, attendance: { ...(user.attendance || { status: "offline" }) }, permissions:',
    "permisos del usuario actual",
  );

  patched = replaceOnce(
    patched,
    '    data.users.push(user);\n    syncUserWhatsappLineAssignments(user.id, request.body?.whatsappLineIds || []);',
    '    data.users.push(user);\n    v269NormalizeUserAccess(user, request.body || {});\n    syncUserWhatsappLineAssignments(user.id, request.body?.whatsappLineIds || []);',
    "permisos al crear usuario",
  );

  patched = replaceOnce(
    patched,
    '    if (Array.isArray(request.body?.whatsappLineIds)) syncUserWhatsappLineAssignments(user.id, request.body.whatsappLineIds);\n    user.updatedAt = timestamp();',
    '    if (Array.isArray(request.body?.whatsappLineIds)) syncUserWhatsappLineAssignments(user.id, request.body.whatsappLineIds);\n    v269NormalizeUserAccess(user, request.body || {});\n    user.updatedAt = timestamp();',
    "permisos al editar usuario",
  );

  patched = replaceOnce(
    patched,
    'async function maybeReplyWithBot(deal, text) {\n  if (!data.settings.botEnabled || !deal.botActive || deal.botHumanHandoff === true) return;',
    'async function maybeReplyWithBot(deal, text) {\n  const v269Owner = deal?.ownerUserId ? data.users.find((entry) => entry.id === deal.ownerUserId) : null;\n  if (v269Owner?.botEnabled === false) return;\n  if (!data.settings.botEnabled || !deal.botActive || deal.botHumanHandoff === true) return;',
    "bot automático por empleado",
  );

  patched = replaceOnce(
    patched,
    'const roleMap = { administrador: "admin", admin: "admin", gerente: "manager", manager: "manager", agente: "agent", agent: "agent" };',
    'const roleMap = { administrador: "admin", admin: "admin", director: "director", direccion: "director", gerente: "manager", manager: "manager", jefe: "supervisor", supervisor: "supervisor", agente: "agent", agent: "agent" };',
    "mapa de roles del asistente administrador",
  );

  return patched;
}
