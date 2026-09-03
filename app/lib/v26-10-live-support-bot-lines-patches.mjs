function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.10: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.10: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function insertAfterOnce(source, marker, block, label) {
  const first = source.indexOf(marker);
  const last = source.lastIndexOf(marker);
  if (first < 0) throw new Error(`V26.10: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.10: ${label} aparece más de una vez.`);
  const at = first + marker.length;
  return source.slice(0, at) + block + source.slice(at);
}

function replaceFirstAfter(source, startMarker, find, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.10: no se encontró inicio de ${label}.`);
  const index = source.indexOf(find, start);
  if (index < 0) throw new Error(`V26.10: no se encontró ${label}.`);
  return source.slice(0, index) + replacement + source.slice(index + find.length);
}

const helpers = String.raw`
const v2610LiveSupportSessions = new Map();
const v2610LiveSupportSubscribers = new Map();

function v2610Clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function v2610NormalizeBotConfig(line) {
  if (!line) return {
    enabled: true,
    useGlobalInstructions: true,
    instructions: "",
    model: cleanText(data.settings.model || "gpt-4.1-mini", 120) || "gpt-4.1-mini",
    tone: "profesional",
    canReserve: data.settings.botCanReserve !== false,
    followupEnabled: data.settings.followup?.enabled !== false,
    followupMessage: cleanText(data.settings.followup?.message || "", 1600),
  };
  if (!line.botConfig || typeof line.botConfig !== "object") line.botConfig = {};
  const allowedTone = new Set(["profesional", "amable", "comercial", "breve", "soporte"]);
  line.botConfig = {
    enabled: line.botEnabled !== false && line.botConfig.enabled !== false,
    useGlobalInstructions: line.botConfig.useGlobalInstructions !== false,
    instructions: cleanText(line.botConfig.instructions, 8000),
    model: cleanText(line.botConfig.model || data.settings.model || "gpt-4.1-mini", 120) || "gpt-4.1-mini",
    tone: allowedTone.has(line.botConfig.tone) ? line.botConfig.tone : "profesional",
    canReserve: typeof line.botConfig.canReserve === "boolean" ? line.botConfig.canReserve : data.settings.botCanReserve !== false,
    followupEnabled: typeof line.botConfig.followupEnabled === "boolean" ? line.botConfig.followupEnabled : data.settings.followup?.enabled !== false,
    followupMessage: cleanText(line.botConfig.followupMessage || data.settings.followup?.message || "", 1600),
  };
  line.botEnabled = line.botConfig.enabled !== false;
  return line.botConfig;
}

function v2610PublicBotConfig(line) {
  const config = v2610NormalizeBotConfig(line);
  return { ...config };
}

function v2610BotConfigForDeal(deal) {
  return v2610NormalizeBotConfig(dealWhatsappLine(deal));
}

function v2610BotBaseInstructions(deal) {
  const config = v2610BotConfigForDeal(deal);
  const parts = [];
  if (config.useGlobalInstructions !== false) parts.push(cleanText(data.settings.instructions, 12000));
  if (config.instructions) parts.push("INSTRUCCIONES ESPECÍFICAS DE ESTA LÍNEA DE WHATSAPP:\n" + config.instructions);
  const tone = {
    profesional: "Tono de esta línea: profesional, claro y cordial.",
    amable: "Tono de esta línea: especialmente amable, cercano y paciente.",
    comercial: "Tono de esta línea: comercial y orientado a avanzar la oportunidad sin presionar ni inventar.",
    breve: "Tono de esta línea: muy breve, directo y claro.",
    soporte: "Tono de esta línea: soporte al cliente, diagnóstico ordenado y pasos concretos.",
  }[config.tone] || "Tono de esta línea: profesional, claro y cordial.";
  parts.push(tone);
  return parts.filter(Boolean).join("\n\n");
}

function v2610BotAutomaticInstructions(deal) {
  const config = v2610BotConfigForDeal(deal);
  if (config.useGlobalInstructions === false) return "No aplicar instrucciones globales adicionales; usar únicamente la configuración específica de esta línea.";
  return activeBotInstructionsText();
}

function v2610BotModelFor(deal) {
  return cleanText(v2610BotConfigForDeal(deal).model || data.settings.model || "gpt-4.1-mini", 120) || "gpt-4.1-mini";
}

function v2610BotCanReserveFor(deal) {
  return v2610BotConfigForDeal(deal).canReserve !== false;
}

function v2610BotFollowupEnabled(deal) {
  return v2610BotConfigForDeal(deal).followupEnabled !== false;
}

function v2610BotFollowupMessage(deal) {
  const value = cleanText(v2610BotConfigForDeal(deal).followupMessage, 1600);
  return value || cleanText(data.settings.followup?.message || "", 1600);
}

for (const v2610Line of data.whatsappLines || []) v2610NormalizeBotConfig(v2610Line);

function v2610SupportCleanup() {
  const now = Date.now();
  for (const [id, session] of v2610LiveSupportSessions.entries()) {
    const requestedAt = Date.parse(session.requestedAt || 0);
    const endedAt = Date.parse(session.endedAt || session.rejectedAt || 0);
    if (session.status === "requested" && requestedAt && now - requestedAt > 5 * 60 * 1000) {
      session.status = "expired";
      session.endedAt = timestamp();
      v2610SupportBroadcast(session, "status", v2610SupportPublic(session));
    }
    if (["ended", "rejected", "expired"].includes(session.status) && endedAt && now - endedAt > 15 * 60 * 1000) {
      v2610LiveSupportSessions.delete(id);
      v2610LiveSupportSubscribers.delete(id);
    }
  }
}

function v2610SupportPublic(session, options = {}) {
  if (!session) return null;
  const includeTelemetry = options.includeTelemetry === true;
  return {
    id: session.id,
    mode: session.mode,
    status: session.status,
    adminUserId: session.adminUserId,
    adminName: session.adminName,
    agentUserId: session.agentUserId,
    agentName: session.agentName,
    requestedAt: session.requestedAt,
    startedAt: session.startedAt || null,
    endedAt: session.endedAt || null,
    rejectedAt: session.rejectedAt || null,
    version: Number(session.version || 0),
    annotationCount: Array.isArray(session.annotations) ? session.annotations.length : 0,
    annotations: (session.annotations || []).slice(-40),
    telemetry: includeTelemetry ? (session.telemetry || null) : undefined,
  };
}

function v2610SupportBroadcast(session, type, payload) {
  const subscribers = v2610LiveSupportSubscribers.get(session?.id);
  if (!subscribers?.size) return;
  const message = "event: " + type + "\ndata: " + JSON.stringify(payload) + "\n\n";
  for (const response of [...subscribers]) {
    try { response.write(message); } catch { subscribers.delete(response); }
  }
}

function v2610SupportSessionForAgent(userId) {
  v2610SupportCleanup();
  return [...v2610LiveSupportSessions.values()]
    .filter((session) => session.agentUserId === userId && ["requested", "active"].includes(session.status))
    .sort((a, b) => Date.parse(b.requestedAt || 0) - Date.parse(a.requestedAt || 0))[0] || null;
}

function v2610SupportCanView(user, session) {
  if (!user || !session) return false;
  if (user.role === "admin" && user.id === session.adminUserId) return true;
  return user.id === session.agentUserId;
}
`;

const routes = String.raw`

app.get("/api/live-support/agents", requireAdmin, (request, response) => {
  v2610SupportCleanup();
  const activeByAgent = new Map();
  for (const session of v2610LiveSupportSessions.values()) {
    if (["requested", "active"].includes(session.status)) activeByAgent.set(session.agentUserId, v2610SupportPublic(session));
  }
  const users = publicUsers()
    .filter((user) => user.active !== false && user.id !== request.currentUser.id)
    .map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      branchId: user.branchId || null,
      branchName: user.branchName || "Administración general",
      online: user.online === true,
      attendance: user.attendance || null,
      session: activeByAgent.get(user.id) || null,
    }));
  response.setHeader("Cache-Control", "no-store");
  response.json({ users });
});

app.post("/api/live-support/request", requireAdmin, async (request, response, next) => {
  try {
    const agent = (data.users || []).find((user) => user.id === cleanText(request.body?.userId, 160) && user.active !== false);
    if (!agent) return response.status(404).json({ error: "Usuario no encontrado o inactivo." });
    if (agent.id === request.currentUser.id) return response.status(400).json({ error: "Seleccioná otro usuario para soporte." });
    const mode = request.body?.mode === "urgent" ? "urgent" : "request";
    const previous = v2610SupportSessionForAgent(agent.id);
    if (previous) {
      previous.status = "ended";
      previous.endedAt = timestamp();
      previous.endedByName = request.currentUser.name;
      v2610SupportBroadcast(previous, "ended", v2610SupportPublic(previous));
    }
    const session = {
      id: makeId("support"),
      mode,
      status: mode === "urgent" ? "active" : "requested",
      adminUserId: request.currentUser.id,
      adminName: request.currentUser.name,
      agentUserId: agent.id,
      agentName: agent.name,
      requestedAt: timestamp(),
      startedAt: mode === "urgent" ? timestamp() : null,
      endedAt: null,
      version: 0,
      telemetry: null,
      annotations: [],
    };
    v2610LiveSupportSessions.set(session.id, session);
    recordAuditEvent(
      request.currentUser,
      mode === "urgent" ? "soporte_vivo_urgente_iniciado" : "soporte_vivo_solicitado",
      { sessionId: session.id, agentUserId: agent.id, agentName: agent.name, mode },
      agent.branchId || primaryBranchId(),
    );
    await store.save();
    v2610SupportBroadcast(session, "status", v2610SupportPublic(session));
    response.json({ session: v2610SupportPublic(session, { includeTelemetry: true }) });
  } catch (error) { next(error); }
});

app.get("/api/live-support/me", (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  const session = v2610SupportSessionForAgent(user.id);
  response.setHeader("Cache-Control", "no-store");
  response.json({ session: v2610SupportPublic(session) });
});

app.get("/api/live-support/:id", (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  const session = v2610LiveSupportSessions.get(request.params.id);
  if (!v2610SupportCanView(user, session)) return response.status(404).json({ error: "Sesión de soporte no encontrada." });
  response.setHeader("Cache-Control", "no-store");
  response.json({ session: v2610SupportPublic(session, { includeTelemetry: user.role === "admin" }) });
});

app.post("/api/live-support/:id/respond", async (request, response, next) => {
  try {
    const user = currentUser(request);
    if (!user) return response.status(401).json({ error: "Sesión requerida." });
    const session = v2610LiveSupportSessions.get(request.params.id);
    if (!session || session.agentUserId !== user.id || session.status !== "requested") return response.status(404).json({ error: "Solicitud de soporte no disponible." });
    const accepted = request.body?.accepted === true;
    session.status = accepted ? "active" : "rejected";
    session.startedAt = accepted ? timestamp() : null;
    session.rejectedAt = accepted ? null : timestamp();
    if (!accepted) session.endedAt = session.rejectedAt;
    recordAuditEvent(
      user,
      accepted ? "soporte_vivo_aceptado" : "soporte_vivo_rechazado",
      { sessionId: session.id, adminUserId: session.adminUserId, adminName: session.adminName },
      user.branchId || primaryBranchId(),
    );
    await store.save();
    v2610SupportBroadcast(session, "status", v2610SupportPublic(session));
    response.json({ session: v2610SupportPublic(session) });
  } catch (error) { next(error); }
});

app.post("/api/live-support/:id/telemetry", (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  const session = v2610LiveSupportSessions.get(request.params.id);
  if (!session || session.agentUserId !== user.id || session.status !== "active") return response.status(404).json({ error: "Sesión de soporte no activa." });
  const input = request.body || {};
  const previous = session.telemetry || {};
  const hasHtml = typeof input.html === "string";
  const telemetry = {
    at: timestamp(),
    path: cleanText(input.path || previous.path, 500),
    view: cleanText(input.view || previous.view, 120),
    title: cleanText(input.title || previous.title, 220),
    viewport: {
      width: Math.min(4096, Math.max(240, Number(input.viewport?.width || previous.viewport?.width || 1280))),
      height: Math.min(4096, Math.max(240, Number(input.viewport?.height || previous.viewport?.height || 720))),
    },
    scroll: {
      x: Math.max(0, Number(input.scroll?.x ?? previous.scroll?.x ?? 0)),
      y: Math.max(0, Number(input.scroll?.y ?? previous.scroll?.y ?? 0)),
    },
    cursor: {
      x: v2610Clamp(input.cursor?.x ?? previous.cursor?.x ?? 0),
      y: v2610Clamp(input.cursor?.y ?? previous.cursor?.y ?? 0),
      visible: input.cursor?.visible !== false,
    },
    html: hasHtml ? cleanText(input.html, 92000) : cleanText(previous.html, 92000),
  };
  session.telemetry = telemetry;
  session.version = Number(session.version || 0) + 1;
  const event = { version: session.version, telemetry };
  v2610SupportBroadcast(session, "telemetry", event);
  response.json({ ok: true, version: session.version });
});

app.post("/api/live-support/:id/annotation", requireAdmin, (request, response) => {
  const session = v2610LiveSupportSessions.get(request.params.id);
  if (!session || session.adminUserId !== request.currentUser.id || session.status !== "active") return response.status(404).json({ error: "Sesión de soporte no activa." });
  const type = ["marker", "comment"].includes(request.body?.type) ? request.body.type : "marker";
  const annotation = {
    id: makeId("annotation"),
    type,
    x: v2610Clamp(request.body?.x),
    y: v2610Clamp(request.body?.y),
    text: cleanText(request.body?.text, 500),
    adminName: request.currentUser.name,
    at: timestamp(),
  };
  session.annotations.push(annotation);
  if (session.annotations.length > 80) session.annotations.splice(0, session.annotations.length - 80);
  v2610SupportBroadcast(session, "annotation", annotation);
  response.json({ annotation });
});

app.post("/api/live-support/:id/end", requireAdmin, async (request, response, next) => {
  try {
    const session = v2610LiveSupportSessions.get(request.params.id);
    if (!session || session.adminUserId !== request.currentUser.id) return response.status(404).json({ error: "Sesión de soporte no encontrada." });
    if (!["ended", "rejected", "expired"].includes(session.status)) {
      session.status = "ended";
      session.endedAt = timestamp();
      recordAuditEvent(
        request.currentUser,
        "soporte_vivo_finalizado",
        { sessionId: session.id, agentUserId: session.agentUserId, agentName: session.agentName, mode: session.mode, annotations: session.annotations.length },
        (data.users || []).find((user) => user.id === session.agentUserId)?.branchId || primaryBranchId(),
      );
      await store.save();
      v2610SupportBroadcast(session, "ended", v2610SupportPublic(session));
    }
    response.json({ session: v2610SupportPublic(session) });
  } catch (error) { next(error); }
});

app.get("/api/live-support/:id/stream", (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).end();
  const session = v2610LiveSupportSessions.get(request.params.id);
  if (!v2610SupportCanView(user, session)) return response.status(404).end();
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();
  if (!v2610LiveSupportSubscribers.has(session.id)) v2610LiveSupportSubscribers.set(session.id, new Set());
  const subscribers = v2610LiveSupportSubscribers.get(session.id);
  subscribers.add(response);
  response.write("event: session\ndata: " + JSON.stringify(v2610SupportPublic(session, { includeTelemetry: user.role === "admin" })) + "\n\n");
  const timer = setInterval(() => {
    try { response.write(": keepalive\n\n"); } catch {}
  }, 15000);
  request.on("close", () => {
    clearInterval(timer);
    subscribers.delete(response);
  });
});

app.post("/api/whatsapp-lines/:id/bot-config", requireAdmin, async (request, response, next) => {
  try {
    const line = whatsappLineById(request.params.id);
    if (!line) return response.status(404).json({ error: "Línea de WhatsApp no encontrada." });
    const input = request.body || {};
    const current = v2610NormalizeBotConfig(line);
    const tone = ["profesional", "amable", "comercial", "breve", "soporte"].includes(input.tone) ? input.tone : current.tone;
    line.botConfig = {
      enabled: input.enabled !== false,
      useGlobalInstructions: input.useGlobalInstructions !== false,
      instructions: cleanText(input.instructions, 8000),
      model: cleanText(input.model || current.model || data.settings.model || "gpt-4.1-mini", 120) || "gpt-4.1-mini",
      tone,
      canReserve: input.canReserve !== false,
      followupEnabled: input.followupEnabled !== false,
      followupMessage: cleanText(input.followupMessage || current.followupMessage || data.settings.followup?.message || "", 1600),
    };
    line.botEnabled = line.botConfig.enabled !== false;
    line.updatedAt = timestamp();
    recordAuditEvent(
      request.currentUser,
      "bot_linea_whatsapp_configurado",
      { lineId: line.id, lineName: line.name, enabled: line.botEnabled, model: line.botConfig.model, tone: line.botConfig.tone, useGlobalInstructions: line.botConfig.useGlobalInstructions },
      line.branchId || primaryBranchId(),
    );
    await store.save();
    response.json({ line: publicWhatsappLine(line, request.currentUser), botConfig: v2610PublicBotConfig(line) });
  } catch (error) { next(error); }
});
`;

export function applyV2610LiveSupportBotLinePatches(source) {
  let patched = source;

  patched = insertAfterOnce(
    patched,
    "const app = express();",
    "\n\n" + helpers.trim() + "\n",
    "inicialización de Express",
  );

  patched = insertAfterOnce(
    patched,
    'app.use(express.static(publicDirectory, { extensions: ["html"] }));',
    routes,
    "middleware estático",
  );

  patched = replaceOnce(
    patched,
    'botEnabled:line.botEnabled!==false,notes:line.notes||""',
    'botEnabled:line.botEnabled!==false,botConfig:v2610PublicBotConfig(line),notes:line.notes||""',
    "configuración pública por línea",
  );

  patched = insertAfterOnce(
    patched,
    "async function maybeReplyWithBot(deal, text) {",
    '\n  const v2610Line = dealWhatsappLine(deal);\n  const v2610Bot = v2610BotConfigForDeal(deal);\n  if (v2610Line?.botEnabled === false || v2610Bot.enabled === false) return;',
    "entrada del bot automático",
  );

  patched = replaceFirstAfter(
    patched,
    "async function createAiReply(deal, userMessage) {",
    "${data.settings.instructions}",
    "${v2610BotBaseInstructions(deal)}",
    "instrucciones base del bot por línea",
  );

  patched = replaceFirstAfter(
    patched,
    "async function createAiReply(deal, userMessage) {",
    "${activeBotInstructionsText()}",
    "${v2610BotAutomaticInstructions(deal)}",
    "instrucciones automáticas del bot por línea",
  );

  patched = replaceFirstAfter(
    patched,
    "async function createAiReply(deal, userMessage) {",
    "model: data.settings.model,",
    "model: v2610BotModelFor(deal),",
    "modelo de IA por línea",
  );

  patched = replaceOnce(
    patched,
    "if (!data.settings.botCanReserve) {",
    "if (!v2610BotCanReserveFor(deal)) {",
    "permiso de reserva por línea",
  );

  patched = replaceOnce(
    patched,
    'if (deal.botHumanHandoff === true || deal.botActive === false) continue;',
    'if (deal.botHumanHandoff === true || deal.botActive === false || !v2610BotFollowupEnabled(deal)) continue;',
    "seguimiento habilitado por línea",
  );

  patched = replaceOnce(
    patched,
    'await sendBotMessage(deal, data.settings.followup.message, "followup");',
    'await sendBotMessage(deal, v2610BotFollowupMessage(deal), "followup");',
    "mensaje de seguimiento por línea",
  );

  return patched;
}
