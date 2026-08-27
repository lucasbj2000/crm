function replaceOne(source, pattern, replacement, label) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) throw new Error(`V25.9 support patch "${label}" esperaba 1 coincidencia y encontró ${matches.length}.`);
  return source.replace(pattern, replacement);
}

const supportBlock = String.raw`
if (!Array.isArray(data.supportTickets)) data.supportTickets = [];

function v259SupportIsStaff(user) {
  return Boolean(user && (user.isMaster === true || ["admin", "manager", "supervisor"].includes(user.role) || user.permissions?.supportManage === true));
}
function v259SupportCanRead(ticket, user) {
  if (!ticket || !user) return false;
  if (v259SupportIsStaff(user)) return true;
  if (ticket.createdByUserId === user.id) return true;
  return (ticket.participantUserIds || []).includes(user.id);
}
function v259SupportTicket(ticketId) {
  return (data.supportTickets || []).find((entry) => entry.id === cleanText(ticketId, 180)) || null;
}
function v259SupportAttachmentPublic(attachment) {
  if (!attachment) return null;
  return {
    id: attachment.id,
    fileName: attachment.fileName || "archivo",
    mimeType: attachment.mimeType || "application/octet-stream",
    size: Number(attachment.size || 0),
    kind: attachment.kind || "document",
    available: attachment.available !== false,
    url: "/api/support/attachments/" + encodeURIComponent(attachment.id),
  };
}
function v259SupportMessagePublic(message) {
  return {
    id: message.id,
    type: message.type || "message",
    authorUserId: message.authorUserId || null,
    authorName: message.authorName || "Sistema",
    authorRole: message.authorRole || "",
    text: message.text || "",
    createdAt: message.createdAt,
    attachments: (message.attachments || []).map(v259SupportAttachmentPublic).filter(Boolean),
  };
}
function v259SupportTicketPublic(ticket, user, detailed = false) {
  const lastSeen = String(ticket.seenBy?.[user.id] || "");
  const lastMessageAt = String(ticket.lastMessageAt || ticket.updatedAt || ticket.createdAt || "");
  const base = {
    id: ticket.id,
    reference: ticket.reference,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    createdByUserId: ticket.createdByUserId,
    createdByName: ticket.createdByName,
    branchId: ticket.branchId || null,
    participantUserIds: [...(ticket.participantUserIds || [])],
    context: ticket.context || {},
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastMessageAt,
    unread: !lastSeen || (lastMessageAt && lastMessageAt > lastSeen),
    messageCount: (ticket.messages || []).length,
    attachmentCount: (ticket.messages || []).reduce((sum, message) => sum + (message.attachments || []).length, 0),
  };
  if (detailed) base.messages = (ticket.messages || []).map(v259SupportMessagePublic);
  return base;
}
function v259SupportSeen(ticket, user) {
  if (!ticket.seenBy || typeof ticket.seenBy !== "object") ticket.seenBy = {};
  ticket.seenBy[user.id] = timestamp();
}
function v259SupportPushMessage(ticket, user, text, attachments = [], type = "message") {
  const now = timestamp();
  const entry = {
    id: makeId("supportmsg"),
    type,
    authorUserId: user?.id || null,
    authorName: user?.name || "Sistema",
    authorRole: user?.role || "system",
    text: cleanText(text, 6000),
    attachments,
    createdAt: now,
  };
  ticket.messages = Array.isArray(ticket.messages) ? ticket.messages : [];
  ticket.messages.push(entry);
  ticket.updatedAt = now;
  ticket.lastMessageAt = now;
  if (user?.id) v259SupportSeen(ticket, user);
  return entry;
}
function v259SupportSystemMessage(ticket, text, actor) {
  const systemUser = { id: actor?.id || null, name: actor?.name || "Sistema", role: "system" };
  return v259SupportPushMessage(ticket, systemUser, text, [], "system");
}
function v259SupportContext(input, request) {
  const value = input && typeof input === "object" ? input : {};
  const pathValue = cleanText(value.path, 900);
  return {
    view: cleanText(value.view, 80) || "crm",
    label: cleanText(value.label, 240),
    entityType: ["deal", "client", "form", "campaign", "task", "report", "settings", "other"].includes(value.entityType) ? value.entityType : "other",
    entityId: cleanText(value.entityId, 180),
    entityLabel: cleanText(value.entityLabel, 300),
    path: pathValue.startsWith("/") ? pathValue : "/",
    tenant: tenantSlug,
    viewport: cleanText(value.viewport, 80),
    appVersion: cleanText(value.appVersion, 80),
    userAgent: cleanText(request.headers["user-agent"], 500),
  };
}
function v259SupportFileInfo(request) {
  let fileName = "archivo";
  try { fileName = decodeURIComponent(String(request.headers["x-file-name"] || "archivo")); } catch {}
  const mimeType = cleanText(request.headers["content-type"], 160) || "application/octet-stream";
  const kind = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : mimeType.startsWith("audio/") ? "audio" : "document";
  return { fileName: safeFileName(fileName, "archivo"), mimeType, kind, caption: "", duration: 0, ptt: false };
}
function v259SupportStaffUsers() {
  return (data.users || []).filter((user) => user.active !== false).map((user) => ({
    id: user.id,
    name: user.name || user.username,
    username: user.username,
    role: user.role,
    branchId: user.branchId || null,
    supportStaff: v259SupportIsStaff(user),
  }));
}

app.get("/api/support/tickets", (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  const tickets = (data.supportTickets || [])
    .filter((ticket) => v259SupportCanRead(ticket, user))
    .sort((a, b) => String(b.lastMessageAt || b.updatedAt || b.createdAt).localeCompare(String(a.lastMessageAt || a.updatedAt || a.createdAt)))
    .map((ticket) => v259SupportTicketPublic(ticket, user, false));
  response.setHeader("Cache-Control", "no-store");
  response.json({ tickets, staff: v259SupportIsStaff(user), users: v259SupportIsStaff(user) ? v259SupportStaffUsers() : [] });
});

app.post("/api/support/tickets", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    const description = cleanText(request.body?.description, 6000);
    if (description.length < 5) return response.status(400).json({ error: "Describí brevemente el inconveniente." });
    const context = v259SupportContext(request.body?.context, request);
    const now = timestamp();
    const ticket = {
      id: makeId("support"),
      reference: "SUP-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(),
      title: cleanText(request.body?.title, 220) || context.entityLabel || context.label || "Solicitud de soporte",
      status: "open",
      priority: ["low", "normal", "high", "urgent"].includes(request.body?.priority) ? request.body.priority : "normal",
      createdByUserId: user.id,
      createdByName: user.name || user.username,
      branchId: user.branchId || null,
      participantUserIds: [],
      context,
      messages: [],
      seenBy: {},
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    };
    v259SupportPushMessage(ticket, user, description);
    data.supportTickets.unshift(ticket);
    if (data.supportTickets.length > 5000) data.supportTickets.length = 5000;
    await store.save();
    response.status(201).json({ ticket: v259SupportTicketPublic(ticket, user, true) });
  } catch (error) { next(error); }
});

app.get("/api/support/tickets/:id", async (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  const ticket = v259SupportTicket(request.params.id);
  if (!ticket) return response.status(404).json({ error: "Caso de soporte no encontrado." });
  if (!v259SupportCanRead(ticket, user)) return response.status(403).json({ error: "No tenés acceso a este caso." });
  v259SupportSeen(ticket, user);
  await store.save();
  response.setHeader("Cache-Control", "no-store");
  response.json({ ticket: v259SupportTicketPublic(ticket, user, true), staff: v259SupportIsStaff(user), users: v259SupportIsStaff(user) ? v259SupportStaffUsers() : [] });
});

app.post("/api/support/tickets/:id/messages", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    const ticket = v259SupportTicket(request.params.id);
    if (!ticket) return response.status(404).json({ error: "Caso de soporte no encontrado." });
    if (!v259SupportCanRead(ticket, user)) return response.status(403).json({ error: "No tenés acceso a este caso." });
    const text = cleanText(request.body?.text, 6000);
    if (!text) return response.status(400).json({ error: "Escribí un mensaje." });
    v259SupportPushMessage(ticket, user, text);
    if (v259SupportIsStaff(user) && !["resolved", "closed"].includes(ticket.status)) ticket.status = "waiting_user";
    if (!v259SupportIsStaff(user) && ["resolved", "closed", "waiting_user"].includes(ticket.status)) ticket.status = "open";
    await store.save();
    response.json({ ticket: v259SupportTicketPublic(ticket, user, true) });
  } catch (error) { next(error); }
});

app.post("/api/support/tickets/:id/attachments", express.raw({ type: "*/*", limit: "25mb" }), async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    const ticket = v259SupportTicket(request.params.id);
    if (!ticket) return response.status(404).json({ error: "Caso de soporte no encontrado." });
    if (!v259SupportCanRead(ticket, user)) return response.status(403).json({ error: "No tenés acceso a este caso." });
    if (!Buffer.isBuffer(request.body) || !request.body.length) return response.status(400).json({ error: "Seleccioná un archivo." });
    const info = v259SupportFileInfo(request);
    const attachment = await saveAttachmentBuffer(request.body, info, makeId("supportfile"));
    let note = "";
    try { note = decodeURIComponent(String(request.headers["x-support-note"] || "")); } catch {}
    v259SupportPushMessage(ticket, user, cleanText(note, 3000), [attachment]);
    if (v259SupportIsStaff(user) && !["resolved", "closed"].includes(ticket.status)) ticket.status = "waiting_user";
    if (!v259SupportIsStaff(user) && ["resolved", "closed", "waiting_user"].includes(ticket.status)) ticket.status = "open";
    await store.save();
    response.json({ ticket: v259SupportTicketPublic(ticket, user, true), attachment: v259SupportAttachmentPublic(attachment) });
  } catch (error) { next(error); }
});

app.get("/api/support/attachments/:id", (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    let match = null;
    for (const ticket of data.supportTickets || []) {
      if (!v259SupportCanRead(ticket, user)) continue;
      for (const message of ticket.messages || []) {
        const attachment = (message.attachments || []).find((entry) => entry.id === request.params.id);
        if (attachment) { match = attachment; break; }
      }
      if (match) break;
    }
    if (!match?.available || !match.storedName) return response.status(404).json({ error: "Archivo no disponible." });
    const filePath = path.join(mediaDirectory, path.basename(match.storedName));
    response.setHeader("Content-Type", match.mimeType || "application/octet-stream");
    response.setHeader("Content-Disposition", "inline; filename*=UTF-8''" + encodeURIComponent(match.fileName || "archivo"));
    response.setHeader("Cache-Control", "private, max-age=300");
    response.sendFile(filePath, (error) => { if (error && !response.headersSent) next(error); });
  } catch (error) { next(error); }
});

app.post("/api/support/tickets/:id/participants", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    if (!v259SupportIsStaff(user)) return response.status(403).json({ error: "Solo soporte puede agregar participantes." });
    const ticket = v259SupportTicket(request.params.id);
    if (!ticket) return response.status(404).json({ error: "Caso de soporte no encontrado." });
    const participant = (data.users || []).find((entry) => entry.id === cleanText(request.body?.userId, 180) && entry.active !== false);
    if (!participant) return response.status(404).json({ error: "Usuario no encontrado." });
    ticket.participantUserIds = Array.isArray(ticket.participantUserIds) ? ticket.participantUserIds : [];
    if (!ticket.participantUserIds.includes(participant.id) && participant.id !== ticket.createdByUserId) {
      ticket.participantUserIds.push(participant.id);
      v259SupportSystemMessage(ticket, (user.name || "Soporte") + " agregó a " + (participant.name || participant.username) + " a la conversación.", user);
      await store.save();
    }
    response.json({ ticket: v259SupportTicketPublic(ticket, user, true), users: v259SupportStaffUsers() });
  } catch (error) { next(error); }
});

app.delete("/api/support/tickets/:id/participants/:userId", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    if (!v259SupportIsStaff(user)) return response.status(403).json({ error: "Solo soporte puede quitar participantes." });
    const ticket = v259SupportTicket(request.params.id);
    if (!ticket) return response.status(404).json({ error: "Caso de soporte no encontrado." });
    const participant = (data.users || []).find((entry) => entry.id === request.params.userId);
    ticket.participantUserIds = (ticket.participantUserIds || []).filter((id) => id !== request.params.userId);
    v259SupportSystemMessage(ticket, (user.name || "Soporte") + " quitó a " + (participant?.name || "un participante") + " de la conversación.", user);
    await store.save();
    response.json({ ticket: v259SupportTicketPublic(ticket, user, true) });
  } catch (error) { next(error); }
});

app.patch("/api/support/tickets/:id", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    if (!v259SupportIsStaff(user)) return response.status(403).json({ error: "Solo soporte puede actualizar el caso." });
    const ticket = v259SupportTicket(request.params.id);
    if (!ticket) return response.status(404).json({ error: "Caso de soporte no encontrado." });
    const previousStatus = ticket.status;
    const nextStatus = cleanText(request.body?.status, 40);
    const nextPriority = cleanText(request.body?.priority, 40);
    if (["open", "in_progress", "waiting_user", "resolved", "closed"].includes(nextStatus)) ticket.status = nextStatus;
    if (["low", "normal", "high", "urgent"].includes(nextPriority)) ticket.priority = nextPriority;
    if (ticket.status !== previousStatus) v259SupportSystemMessage(ticket, (user.name || "Soporte") + " cambió el estado a " + ticket.status + ".", user);
    ticket.updatedAt = timestamp();
    await store.save();
    response.json({ ticket: v259SupportTicketPublic(ticket, user, true) });
  } catch (error) { next(error); }
});

app.post("/api/support/tickets/:id/seen", async (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  const ticket = v259SupportTicket(request.params.id);
  if (!ticket || !v259SupportCanRead(ticket, user)) return response.status(404).json({ error: "Caso no encontrado." });
  v259SupportSeen(ticket, user);
  await store.save();
  response.json({ ok: true });
});

`;

export function applyV259SupportPatches(source) {
  return replaceOne(
    source,
    /app\.get\("\/api\/health", \(_request, response\) => \{/,
    supportBlock + 'app.get("/api/health", (_request, response) => {',
    "rutas de soporte antes de health",
  );
}
