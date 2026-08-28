function replaceOne(source, pattern, replacement, label) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) throw new Error(`V25.10 social patch "${label}" esperaba 1 coincidencia y encontró ${matches.length}.`);
  return source.replace(pattern, replacement);
}

const socialBlock = String.raw`
if (!Array.isArray(data.socialConnections)) data.socialConnections = [];

const V2510_SOCIAL_PROVIDERS = {
  facebook: { label: "Facebook", inbox: true, publishing: false, profile: true, api: "Meta Graph API" },
  instagram: { label: "Instagram", inbox: true, publishing: false, profile: true, api: "Instagram Messaging / Graph API" },
  tiktok: { label: "TikTok", inbox: false, publishing: false, profile: true, api: "TikTok for Developers" },
};

function v2510SocialCanManage(user) {
  return Boolean(user && (user.isMaster === true || user.role === "admin" || user.permissions?.socialChannelsManage === true));
}
function v2510SocialCleanIds(values, source) {
  const allowed = new Set((source || []).map((entry) => entry.id));
  return [...new Set((Array.isArray(values) ? values : []).map((value) => cleanText(value, 180)).filter((value) => allowed.has(value)))];
}
function v2510SocialTokenPreview(value) {
  const token = String(value || "");
  if (!token) return "";
  return token.length <= 8 ? "••••••••" : "••••••••" + token.slice(-4);
}
function v2510SocialPublic(connection) {
  const provider = V2510_SOCIAL_PROVIDERS[connection.provider] || V2510_SOCIAL_PROVIDERS.facebook;
  return {
    id: connection.id,
    provider: connection.provider,
    providerLabel: provider.label,
    label: connection.label || provider.label,
    status: connection.status || "needs_credentials",
    statusMessage: connection.statusMessage || "",
    branchId: connection.branchId || null,
    allowedUserIds: [...(connection.allowedUserIds || [])],
    accountId: connection.accountId || "",
    accountName: connection.accountName || "",
    handle: connection.handle || "",
    pageId: connection.pageId || "",
    businessId: connection.businessId || "",
    appId: connection.appId || "",
    clientKey: connection.clientKey || "",
    graphVersion: connection.graphVersion || "v26.0",
    hasAccessToken: Boolean(connection.accessToken),
    tokenPreview: v2510SocialTokenPreview(connection.accessToken),
    capabilities: { ...provider },
    lastTestAt: connection.lastTestAt || null,
    lastSyncAt: connection.lastSyncAt || null,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}
function v2510SocialFind(id) {
  return (data.socialConnections || []).find((entry) => entry.id === cleanText(id, 180)) || null;
}
function v2510SocialPayload(body, current = {}) {
  const provider = ["facebook", "instagram", "tiktok"].includes(body?.provider) ? body.provider : current.provider;
  if (!provider || !V2510_SOCIAL_PROVIDERS[provider]) throw new Error("Proveedor social no válido.");
  const next = {
    ...current,
    provider,
    label: cleanText(body?.label ?? current.label, 180) || V2510_SOCIAL_PROVIDERS[provider].label,
    branchId: cleanText(body?.branchId ?? current.branchId, 180) || null,
    allowedUserIds: v2510SocialCleanIds(body?.allowedUserIds ?? current.allowedUserIds, data.users),
    accountId: cleanText(body?.accountId ?? current.accountId, 220),
    accountName: cleanText(body?.accountName ?? current.accountName, 240),
    handle: cleanText(body?.handle ?? current.handle, 220),
    pageId: cleanText(body?.pageId ?? current.pageId, 220),
    businessId: cleanText(body?.businessId ?? current.businessId, 220),
    appId: cleanText(body?.appId ?? current.appId, 220),
    clientKey: cleanText(body?.clientKey ?? current.clientKey, 220),
    graphVersion: cleanText(body?.graphVersion ?? current.graphVersion, 40) || "v26.0",
  };
  if (Object.prototype.hasOwnProperty.call(body || {}, "accessToken")) {
    const token = String(body.accessToken || "").trim();
    if (token) next.accessToken = token.slice(0, 12000);
    else if (body.clearAccessToken === true) next.accessToken = "";
  }
  if (next.branchId && !(data.branches || []).some((branch) => branch.id === next.branchId)) next.branchId = null;
  return next;
}
async function v2510SocialFetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000), headers: { Accept: "application/json", ...(options.headers || {}) } });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: cleanText(text, 1200) }; }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || payload?.error_description || "El proveedor rechazó la conexión.";
    const error = new Error(cleanText(message, 700));
    error.status = response.status;
    throw error;
  }
  return payload || {};
}
async function v2510SocialTest(connection) {
  if (!connection.accessToken) throw new Error("Falta el token de acceso.");
  if (connection.provider === "facebook") {
    if (!connection.pageId) throw new Error("Falta el Page ID de Facebook.");
    const version = /^v\d+\.\d+$/.test(connection.graphVersion || "") ? connection.graphVersion : "v26.0";
    const url = new URL("https://graph.facebook.com/" + version + "/" + encodeURIComponent(connection.pageId));
    url.searchParams.set("fields", "id,name");
    url.searchParams.set("access_token", connection.accessToken);
    const payload = await v2510SocialFetchJson(url);
    return { accountId: cleanText(payload.id, 220), accountName: cleanText(payload.name, 240), handle: "", rawType: "page" };
  }
  if (connection.provider === "instagram") {
    const version = /^v\d+\.\d+$/.test(connection.graphVersion || "") ? connection.graphVersion : "v26.0";
    if (connection.accountId) {
      const url = new URL("https://graph.facebook.com/" + version + "/" + encodeURIComponent(connection.accountId));
      url.searchParams.set("fields", "id,username,name");
      url.searchParams.set("access_token", connection.accessToken);
      const payload = await v2510SocialFetchJson(url);
      return { accountId: cleanText(payload.id, 220), accountName: cleanText(payload.name || payload.username, 240), handle: cleanText(payload.username, 220), rawType: "instagram_business_account" };
    }
    if (!connection.pageId) throw new Error("Ingresá el Instagram Account ID o la Page ID vinculada.");
    const url = new URL("https://graph.facebook.com/" + version + "/" + encodeURIComponent(connection.pageId));
    url.searchParams.set("fields", "id,name,instagram_business_account");
    url.searchParams.set("access_token", connection.accessToken);
    const page = await v2510SocialFetchJson(url);
    const igId = cleanText(page?.instagram_business_account?.id, 220);
    if (!igId) throw new Error("La página no devolvió una cuenta profesional de Instagram vinculada.");
    const igUrl = new URL("https://graph.facebook.com/" + version + "/" + encodeURIComponent(igId));
    igUrl.searchParams.set("fields", "id,username,name");
    igUrl.searchParams.set("access_token", connection.accessToken);
    const payload = await v2510SocialFetchJson(igUrl);
    return { accountId: cleanText(payload.id, 220), accountName: cleanText(payload.name || payload.username, 240), handle: cleanText(payload.username, 220), pageId: cleanText(page.id, 220), rawType: "instagram_business_account" };
  }
  if (connection.provider === "tiktok") {
    const url = new URL("https://open.tiktokapis.com/v2/user/info/");
    url.searchParams.set("fields", "open_id,union_id,avatar_url,display_name");
    const payload = await v2510SocialFetchJson(url, { headers: { Authorization: "Bearer " + connection.accessToken } });
    const user = payload?.data?.user || {};
    if (!user.open_id && !user.display_name) throw new Error("TikTok no devolvió información del usuario.");
    return { accountId: cleanText(user.open_id, 220), accountName: cleanText(user.display_name, 240), handle: cleanText(user.display_name, 220), rawType: "tiktok_user" };
  }
  throw new Error("Proveedor no soportado.");
}

app.get("/api/social/connections", (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  const connections = (data.socialConnections || []).filter((connection) => {
    if (v2510SocialCanManage(user)) return true;
    if (connection.branchId && user.branchId && connection.branchId !== user.branchId) return false;
    return !(connection.allowedUserIds || []).length || (connection.allowedUserIds || []).includes(user.id);
  }).map(v2510SocialPublic);
  response.setHeader("Cache-Control", "no-store");
  response.json({ connections, canManage: v2510SocialCanManage(user), providers: V2510_SOCIAL_PROVIDERS });
});

app.post("/api/social/connections", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    if (!v2510SocialCanManage(user)) return response.status(403).json({ error: "Solo administración puede conectar redes sociales." });
    const now = timestamp();
    const connection = v2510SocialPayload(request.body || {}, {
      id: makeId("social"), status: "needs_credentials", statusMessage: "Configuración guardada; falta validar la conexión.", createdAt: now, updatedAt: now, lastTestAt: null, lastSyncAt: null,
    });
    data.socialConnections.push(connection);
    await store.save();
    response.status(201).json({ connection: v2510SocialPublic(connection) });
  } catch (error) { next(error); }
});

app.put("/api/social/connections/:id", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    if (!v2510SocialCanManage(user)) return response.status(403).json({ error: "Solo administración puede modificar redes sociales." });
    const connection = v2510SocialFind(request.params.id);
    if (!connection) return response.status(404).json({ error: "Conexión social no encontrada." });
    const nextValue = v2510SocialPayload(request.body || {}, connection);
    Object.assign(connection, nextValue, { status: "needs_credentials", statusMessage: "Cambios guardados; volvé a probar la conexión.", updatedAt: timestamp() });
    await store.save();
    response.json({ connection: v2510SocialPublic(connection) });
  } catch (error) { next(error); }
});

app.post("/api/social/connections/:id/test", async (request, response, next) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  if (!v2510SocialCanManage(user)) return response.status(403).json({ error: "Solo administración puede validar redes sociales." });
  const connection = v2510SocialFind(request.params.id);
  if (!connection) return response.status(404).json({ error: "Conexión social no encontrada." });
  connection.lastTestAt = timestamp();
  try {
    const result = await v2510SocialTest(connection);
    connection.accountId = result.accountId || connection.accountId || "";
    connection.accountName = result.accountName || connection.accountName || "";
    connection.handle = result.handle || connection.handle || "";
    if (result.pageId) connection.pageId = result.pageId;
    connection.status = "connected";
    connection.statusMessage = "Conexión validada correctamente con " + (V2510_SOCIAL_PROVIDERS[connection.provider]?.label || connection.provider) + ".";
    connection.lastSyncAt = timestamp();
    connection.updatedAt = timestamp();
    await store.save();
    return response.json({ ok: true, connection: v2510SocialPublic(connection) });
  } catch (error) {
    connection.status = "error";
    connection.statusMessage = cleanText(error.message, 700) || "No se pudo validar la conexión.";
    connection.updatedAt = timestamp();
    await store.save();
    return response.status(400).json({ error: connection.statusMessage, connection: v2510SocialPublic(connection) });
  }
});

app.delete("/api/social/connections/:id", async (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  if (!v2510SocialCanManage(user)) return response.status(403).json({ error: "Solo administración puede eliminar redes sociales." });
  const index = (data.socialConnections || []).findIndex((entry) => entry.id === cleanText(request.params.id, 180));
  if (index < 0) return response.status(404).json({ error: "Conexión social no encontrada." });
  data.socialConnections.splice(index, 1);
  await store.save();
  response.json({ ok: true });
});

`;

export function applyV2510SocialPatches(source) {
  return replaceOne(
    source,
    /app\.get\("\/api\/health", \(_request, response\) => \{/,
    socialBlock + 'app.get("/api/health", (_request, response) => {',
    "rutas sociales antes de health",
  );
}
