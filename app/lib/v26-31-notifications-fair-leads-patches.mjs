const SERVER_MARKER = "// V26.31 PUSH_FAIR_LEADS";
const CORE_MARKER = "// V26.31 NOTIFICATION_UI";

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`V26.31: no se encontró ${label}.`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`V26.31: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

export function applyV2631ServerPatches(source) {
  if (source.includes(SERVER_MARKER)) return source;

  source = replaceOnce(
    source,
    `import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";`,
    `import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  scryptSync,
  sign as cryptoSign,
  timingSafeEqual,
} from "node:crypto";`,
    "imports crypto para Web Push",
  );

  source = replaceOnce(
    source,
    `if (!Array.isArray(data.attendanceEvents)) data.attendanceEvents = [];`,
    `if (!Array.isArray(data.attendanceEvents)) data.attendanceEvents = [];
if (!Array.isArray(data.pushSubscriptions)) data.pushSubscriptions = [];
if (!Array.isArray(data.pushNotifications)) data.pushNotifications = [];`,
    "persistencia de notificaciones",
  );

  source = replaceOnce(
    source,
    `function applyIncomingRouting(deal, created = false) {`,
    `function v2631DistributionState(branchId) {
  if (!data.settings.leadDistribution || typeof data.settings.leadDistribution !== "object") data.settings.leadDistribution = {};
  const key = branchId || primaryBranchId() || "default";
  let state = data.settings.leadDistribution[key];
  if (!state || typeof state !== "object") state = data.settings.leadDistribution[key] = { sequence: 0, lastSequenceByUser: {} };
  state.sequence = Math.max(0, Number(state.sequence) || 0);
  if (!state.lastSequenceByUser || typeof state.lastSequenceByUser !== "object") state.lastSequenceByUser = {};
  return state;
}

function v2631ChooseFairActiveOwner(branchId, line = null) {
  const candidates = availableAgents(branchId, line)
    .filter((user) => user.branchId === branchId && attendanceStatus(user) === "active");
  if (!candidates.length) return null;
  const state = v2631DistributionState(branchId);
  candidates.sort((a, b) => {
    const aTurn = Number(state.lastSequenceByUser[a.id] || 0);
    const bTurn = Number(state.lastSequenceByUser[b.id] || 0);
    return aTurn - bTurn || String(a.name || "").localeCompare(String(b.name || ""), "es");
  });
  const owner = candidates[0];
  state.sequence += 1;
  state.lastSequenceByUser[owner.id] = state.sequence;
  state.updatedAt = timestamp();
  return owner;
}

function v2631RecentClientActivity(deal, maxAgeMs = 180000) {
  const at = Date.parse(deal?.lastClientAt || deal?.createdAt || 0);
  return Boolean(at && Date.now() - at >= 0 && Date.now() - at <= maxAgeMs);
}

function v2631EnsurePushConfig() {
  if (!data.settings.webPush || typeof data.settings.webPush !== "object") data.settings.webPush = {};
  const current = data.settings.webPush;
  if (current.privateJwk && current.publicKey) return current;
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const privateJwk = pair.privateKey.export({ format: "jwk" });
  const x = Buffer.from(privateJwk.x, "base64url");
  const y = Buffer.from(privateJwk.y, "base64url");
  current.privateJwk = privateJwk;
  current.publicKey = Buffer.concat([Buffer.from([4]), x, y]).toString("base64url");
  current.subject = cleanText(current.subject || publicBaseUrl || "https://iciia.online", 300);
  current.createdAt = timestamp();
  return current;
}

function v2631B64Json(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function v2631VapidAuthorization(endpoint) {
  const config = v2631EnsurePushConfig();
  const audience = new URL(endpoint).origin;
  const header = v2631B64Json({ typ: "JWT", alg: "ES256" });
  const payload = v2631B64Json({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: config.subject || "https://iciia.online",
  });
  const unsigned = header + "." + payload;
  const key = createPrivateKey({ key: config.privateJwk, format: "jwk" });
  const signature = cryptoSign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return "vapid t=" + unsigned + "." + signature + ", k=" + config.publicKey;
}

async function v2631SendPushToUser(userId) {
  const subscriptions = (data.pushSubscriptions || []).filter((entry) => entry.userId === userId && entry.active !== false);
  if (!subscriptions.length) return;
  const stale = new Set();
  for (const subscription of subscriptions) {
    try {
      const response = await fetch(subscription.endpoint, {
        method: "POST",
        headers: {
          TTL: "120",
          Urgency: "high",
          Authorization: v2631VapidAuthorization(subscription.endpoint),
        },
      });
      subscription.lastAttemptAt = timestamp();
      subscription.lastStatus = response.status;
      if (response.ok) subscription.lastDeliveredAt = timestamp();
      else if ([404, 410].includes(response.status)) stale.add(subscription.endpoint);
    } catch (error) {
      subscription.lastAttemptAt = timestamp();
      subscription.lastError = cleanText(error?.message || error, 500);
    }
  }
  if (stale.size) data.pushSubscriptions = (data.pushSubscriptions || []).filter((entry) => !stale.has(entry.endpoint));
  if (stale.size) void store.save().catch(() => {});
}

function v2631QueuePushNotification(userId, { title, body, dealId = null, kind = "activity" } = {}) {
  if (!userId) return null;
  const row = {
    id: makeId("pushnote"),
    userId,
    title: cleanText(title || "ICIIA CRM", 180),
    body: cleanText(body || "Tenés una nueva actividad.", 500),
    dealId: cleanText(dealId, 180) || null,
    kind: cleanText(kind, 80) || "activity",
    createdAt: timestamp(),
    deliveredAt: null,
  };
  data.pushNotifications.unshift(row);
  data.pushNotifications.splice(5000);
  void v2631SendPushToUser(userId);
  return row;
}

function v2631AssignFairLead(deal, owner, line = null, { notify = true } = {}) {
  if (!deal || !owner) return false;
  const branchId = deal.branchId || primaryBranchId();
  const client = deal.clientId ? findClient(data, deal.clientId) : null;
  applyOwnerToClientAndDeal(client, deal, owner, branchId);
  deal.assignmentSource = "fair_active_round_robin";
  deal.assignmentLineId = line?.id || null;
  deal.assignmentAt = timestamp();
  deal.coverageRequired = false;
  deal.coverageReason = "";
  recordAuditEvent(null, "lead_distribuido_automaticamente", {
    dealId: deal.id,
    clientPhone: deal.phone,
    ownerUserId: owner.id,
    ownerName: owner.name,
    lineId: line?.id || null,
  }, branchId, "system");
  if (notify) {
    v2631QueuePushNotification(owner.id, {
      title: "Nuevo contacto asignado",
      body: (deal.name || "Un cliente") + " fue asignado a tu bandeja.",
      dealId: deal.id,
      kind: "new_lead",
    });
  }
  return true;
}

function v2631DistributePendingLeads(branchId) {
  if (!branchId) return 0;
  let assigned = 0;
  const pending = (data.deals || [])
    .filter((deal) => !deal.ownerUserId && deal.stage === STAGES.NEW && (deal.branchId || primaryBranchId()) === branchId && deal.branchSelection?.status !== "pending")
    .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
  for (const deal of pending) {
    const line = dealWhatsappLine(deal);
    const owner = v2631ChooseFairActiveOwner(branchId, line);
    if (!owner) continue;
    if (v2631AssignFairLead(deal, owner, line, { notify: true })) assigned += 1;
  }
  return assigned;
}

function v2631NotifyIncomingActivity(deal, created = false) {
  if (!deal || created || !deal.ownerUserId || deal.lastDirection !== "incoming") return;
  if (!v2631RecentClientActivity(deal)) return;
  if (deal.v2631LastPushClientAt === deal.lastClientAt) return;
  deal.v2631LastPushClientAt = deal.lastClientAt || timestamp();
  v2631QueuePushNotification(deal.ownerUserId, {
    title: "Nuevo mensaje de cliente",
    body: (deal.name || "Tu cliente") + " te envió un nuevo mensaje.",
    dealId: deal.id,
    kind: "client_message",
  });
}

function applyIncomingRouting(deal, created = false) {`,
    "helpers de distribución y push",
  );

  source = replaceOnce(
    source,
    `    const line = dealWhatsappLine(deal);
    // Un contacto nuevo entra al pool de la sucursal sin responsable.
    // Todos los agentes de esa sucursal lo ven hasta que el primero inicia la gestión.
    const assignedOwner = null;
    deal.ownerUserId = null;
    deal.ownerName = "";
    deal.assignmentSource = "first_response";
    deal.assignmentLineId = line?.id || null;
    deal.assignmentAt = null;`,
    `    const line = dealWhatsappLine(deal);
    // V26.31: reparto igualitario únicamente entre agentes Disponibles de la sucursal.
    const assignedOwner = v2631ChooseFairActiveOwner(branchId, line);
    if (assignedOwner) {
      v2631AssignFairLead(deal, assignedOwner, line, { notify: v2631RecentClientActivity(deal) });
    } else {
      deal.ownerUserId = null;
      deal.ownerName = "";
      deal.assignmentSource = "fair_active_waiting";
      deal.assignmentLineId = line?.id || null;
      deal.assignmentAt = null;
    }`,
    "reparto de nuevos contactos",
  );

  source = replaceOnce(
    source,
    `applyIncomingRouting(deal,created); applyMarketingOptOut(deal,text);`,
    `applyIncomingRouting(deal,created); v2631NotifyIncomingActivity(deal,created); applyMarketingOptOut(deal,text);`,
    "notificación Cloud API",
  );

  source = replaceOnce(
    source,
    `    applyIncomingRouting(deal, created);
    applyMarketingOptOut(deal, text);`,
    `    applyIncomingRouting(deal, created);
    if (!historical) v2631NotifyIncomingActivity(deal, created);
    applyMarketingOptOut(deal, text);`,
    "notificación QR",
  );

  source = replaceOnce(
    source,
    `    if (status === "active") {
      for (const deal of data.deals || []) if (deal.ownerUserId === user.id && OPEN_STAGES.has(deal.stage)) { deal.coverageRequired = false; deal.coverageReason = ""; }
    }`,
    `    if (status === "active") {
      for (const deal of data.deals || []) if (deal.ownerUserId === user.id && OPEN_STAGES.has(deal.stage)) { deal.coverageRequired = false; deal.coverageReason = ""; }
      v2631DistributePendingLeads(user.branchId || primaryBranchId());
    }`,
    "redistribución al marcar Disponible",
  );

  source = replaceOnce(
    source,
    `    if (status === "active") for (const deal of data.deals || []) if (deal.ownerUserId === target.id && OPEN_STAGES.has(deal.stage)) { deal.coverageRequired = false; deal.coverageReason = ""; }`,
    `    if (status === "active") {
      for (const deal of data.deals || []) if (deal.ownerUserId === target.id && OPEN_STAGES.has(deal.stage)) { deal.coverageRequired = false; deal.coverageReason = ""; }
      v2631DistributePendingLeads(target.branchId || primaryBranchId());
    }`,
    "redistribución por jefatura",
  );

  source = replaceOnce(
    source,
    `  sessions.delete(cookieValue(request, "whatsbot_session"));`,
    `  if (user?.id) data.pushSubscriptions = (data.pushSubscriptions || []).filter((entry) => entry.userId !== user.id);
  sessions.delete(cookieValue(request, "whatsbot_session"));`,
    "limpieza de push al cerrar sesión",
  );

  source = replaceOnce(
    source,
    `// V16 · Marcación, instrucciones del bot, campos personalizados y campañas.`,
    `// V26.31 · Web Push para PC/Android PWA.
app.get("/api/push/public-key", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    const config = v2631EnsurePushConfig();
    await store.save();
    response.setHeader("Cache-Control", "no-store");
    response.json({ publicKey: config.publicKey });
  } catch (error) { next(error); }
});

app.post("/api/push/subscribe", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    const input = request.body?.subscription || request.body || {};
    const endpoint = cleanText(input.endpoint, 2200);
    if (!endpoint || !endpoint.startsWith("https://")) throw new Error("Suscripción de notificaciones inválida.");
    const record = {
      endpoint,
      expirationTime: Number(input.expirationTime) || null,
      keys: {
        p256dh: cleanText(input.keys?.p256dh, 1000),
        auth: cleanText(input.keys?.auth, 1000),
      },
      userId: user.id,
      branchId: user.branchId || null,
      userAgent: cleanText(request.headers["user-agent"], 500),
      active: true,
      updatedAt: timestamp(),
    };
    const previous = (data.pushSubscriptions || []).find((entry) => entry.endpoint === endpoint);
    if (previous) Object.assign(previous, record, { createdAt: previous.createdAt || timestamp() });
    else data.pushSubscriptions.unshift({ ...record, createdAt: timestamp() });
    v2631EnsurePushConfig();
    await store.save();
    void v2631SendPushToUser(user.id);
    response.json({ ok: true, subscribed: true });
  } catch (error) { next(error); }
});

app.delete("/api/push/subscribe", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    const endpoint = cleanText(request.body?.endpoint, 2200);
    data.pushSubscriptions = (data.pushSubscriptions || []).filter((entry) => !(entry.userId === user.id && (!endpoint || entry.endpoint === endpoint)));
    await store.save();
    response.json({ ok: true });
  } catch (error) { next(error); }
});

app.post("/api/push/notifications/next", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    const notification = (data.pushNotifications || []).find((entry) => entry.userId === user.id && !entry.deliveredAt && Date.parse(entry.createdAt || 0) >= cutoff);
    if (!notification) return response.json({ notification: null });
    notification.deliveredAt = timestamp();
    await store.save();
    response.setHeader("Cache-Control", "no-store");
    response.json({
      notification: {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        dealId: notification.dealId,
        kind: notification.kind,
        createdAt: notification.createdAt,
      },
    });
  } catch (error) { next(error); }
});

// V16 · Marcación, instrucciones del bot, campos personalizados y campañas.`,
    "endpoints Web Push",
  );

  return source + "\n" + SERVER_MARKER + "\n";
}

export function applyV2631CoreUiPatches(source) {
  if (source.includes(CORE_MARKER)) return source;

  const patch = String.raw`
;(() => {
  "use strict";
  const V2631 = "V26.31 NOTIFICATIONS_FAIR_LEADS";
  let subscriptionUserId = "";
  let baselineReady = false;
  const dealSnapshot = new Map();
  let pendingDealId = new URLSearchParams(window.location.search).get("deal") || "";

  function pushSupported() {
    return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  }

  function decodeApplicationKey(value) {
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  }

  function buttonHost() {
    return document.querySelector(".operational-header") || document.querySelector(".header-actions") || document.querySelector(".workspace-header");
  }

  function notificationButton() {
    let button = document.getElementById("v2631-notification-button");
    const host = buttonHost();
    if (!host || !appState?.currentUser) return null;
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.id = "v2631-notification-button";
      button.className = "v2631-notification-button";
      button.addEventListener("click", () => void enableNotifications(true));
      host.appendChild(button);
    }
    if (!pushSupported()) {
      button.textContent = "🔕 Alertas no compatibles";
      button.disabled = true;
    } else if (Notification.permission === "granted") {
      button.textContent = "🔔 Alertas activas";
      button.disabled = false;
      button.dataset.state = "active";
    } else if (Notification.permission === "denied") {
      button.textContent = "🔕 Alertas bloqueadas";
      button.disabled = false;
      button.dataset.state = "blocked";
    } else {
      button.textContent = "🔔 Activar alertas";
      button.disabled = false;
      button.dataset.state = "pending";
    }
    return button;
  }

  async function registerSubscription() {
    const user = appState?.currentUser;
    if (!user || !pushSupported() || Notification.permission !== "granted") return false;
    if (subscriptionUserId === user.id) return true;
    const key = await api("/api/push/public-key");
    if (!key?.publicKey) throw new Error("No se pudo preparar la clave de notificaciones.");
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationKey(key.publicKey),
      });
    }
    await api("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    subscriptionUserId = user.id;
    localStorage.setItem("iciia-push-enabled", "1");
    notificationButton();
    return true;
  }

  async function enableNotifications(fromUser = false) {
    try {
      if (!pushSupported()) {
        if (fromUser) showToast("Este navegador no permite notificaciones Push.", "warning");
        return;
      }
      if (Notification.permission === "denied") {
        if (fromUser) showToast("Las notificaciones están bloqueadas. Habilitalas desde los permisos del sitio.", "warning");
        return;
      }
      if (Notification.permission !== "granted") {
        if (!fromUser) return;
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          notificationButton();
          showToast("Las alertas no fueron habilitadas.", "warning");
          return;
        }
      }
      await registerSubscription();
      if (fromUser) showToast("Alertas activadas en este dispositivo.");
    } catch (error) {
      if (fromUser) showToast(error.message || "No se pudieron activar las alertas.", "warning");
    } finally {
      notificationButton();
    }
  }

  function recent(value, maxMs = 180000) {
    const at = Date.parse(value || 0);
    return Boolean(at && Date.now() - at >= 0 && Date.now() - at <= maxMs);
  }

  function inspectAssignedActivity() {
    const user = appState?.currentUser;
    if (!user) {
      baselineReady = false;
      dealSnapshot.clear();
      return;
    }
    const deals = appState?.deals || [];
    if (!baselineReady) {
      for (const deal of deals) dealSnapshot.set(deal.id, { ownerUserId: deal.ownerUserId || "", lastClientAt: deal.lastClientAt || "" });
      baselineReady = true;
      return;
    }
    const nextIds = new Set();
    for (const deal of deals) {
      nextIds.add(deal.id);
      const previous = dealSnapshot.get(deal.id);
      const mine = deal.ownerUserId === user.id;
      if (mine && !previous && deal.assignmentSource === "fair_active_round_robin" && recent(deal.assignmentAt, 5 * 60 * 1000)) {
        showToast("Nuevo contacto asignado: " + (deal.name || deal.phone || "Cliente"));
      } else if (mine && previous && previous.lastClientAt !== (deal.lastClientAt || "") && deal.lastDirection === "incoming" && recent(deal.lastClientAt)) {
        if (selectedDealId !== deal.id || document.hidden) showToast("Nuevo mensaje de " + (deal.name || "cliente"));
      }
      dealSnapshot.set(deal.id, { ownerUserId: deal.ownerUserId || "", lastClientAt: deal.lastClientAt || "" });
    }
    for (const id of [...dealSnapshot.keys()]) if (!nextIds.has(id)) dealSnapshot.delete(id);
  }

  function tryOpenPendingDeal() {
    if (!pendingDealId || !appState?.deals?.some((deal) => deal.id === pendingDealId)) return;
    const id = pendingDealId;
    pendingDealId = "";
    try {
      openDrawer(id);
      const clean = new URL(window.location.href);
      clean.searchParams.delete("deal");
      history.replaceState(null, "", clean.pathname + clean.search + clean.hash);
    } catch {}
  }

  function installStyle() {
    if (document.getElementById("v2631-notification-style")) return;
    const style = document.createElement("style");
    style.id = "v2631-notification-style";
    style.textContent = ".v2631-notification-button{min-height:38px;padding:0 12px;border:1px solid #d9e1dd;border-radius:999px;background:#fff;color:#264437;font-size:10px;font-weight:850;white-space:nowrap;cursor:pointer}.v2631-notification-button[data-state='active']{background:#eaf6ef;border-color:#c8e2d3;color:#1e5a3c}.v2631-notification-button[data-state='blocked']{background:#fff3f2;border-color:#efceca;color:#9b342b}@media(max-width:900px){body.v2630-mobile .v2631-notification-button{width:100%!important;min-height:40px!important;margin-top:5px!important;border-radius:11px!important}}";
    document.head.appendChild(style);
  }

  function syncUi() {
    installStyle();
    notificationButton();
    inspectAssignedActivity();
    tryOpenPendingDeal();
    if (Notification?.permission === "granted" && appState?.currentUser && subscriptionUserId !== appState.currentUser.id) void enableNotifications(false);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type !== "ICIIA_OPEN_DEAL" || !event.data?.dealId) return;
      pendingDealId = String(event.data.dealId);
      tryOpenPendingDeal();
    });
  }

  window.addEventListener("crm:state", syncUi);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncUi, { once: true });
  else syncUi();
})();
`;

  return source + patch + "\n" + CORE_MARKER + "\n";
}
