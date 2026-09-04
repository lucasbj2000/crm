function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.14 bot por línea: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.14 bot por línea: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function insertAfterOnce(source, marker, block, label) {
  const first = source.indexOf(marker);
  const last = source.lastIndexOf(marker);
  if (first < 0) throw new Error(`V26.14 bot por línea: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.14 bot por línea: ${label} aparece más de una vez.`);
  const at = first + marker.length;
  return source.slice(0, at) + block + source.slice(at);
}

function replaceFirstAfter(source, startMarker, find, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.14 bot por línea: no se encontró inicio de ${label}.`);
  const index = source.indexOf(find, start);
  if (index < 0) throw new Error(`V26.14 bot por línea: no se encontró ${label}.`);
  return source.slice(0, index) + replacement + source.slice(index + find.length);
}

const helpers = String.raw`
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
  return { ...v2610NormalizeBotConfig(line) };
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
`;

const routes = String.raw`
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
    "\n" + routes,
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
