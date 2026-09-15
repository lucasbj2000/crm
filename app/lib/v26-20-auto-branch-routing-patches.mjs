function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.20 derivación automática: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.20 derivación automática: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceFirstAfter(source, startMarker, find, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.20 derivación automática: no se encontró inicio de ${label}.`);
  const index = source.indexOf(find, start);
  if (index < 0) throw new Error(`V26.20 derivación automática: no se encontró ${label}.`);
  return source.slice(0, index) + replacement + source.slice(index + find.length);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) throw new Error(`V26.20 derivación automática: ${label} esperaba 1 coincidencia y encontró ${matches.length}.`);
  return source.replace(pattern, replacement);
}

const AUTO_ROUTING_HELPERS = String.raw`
const v2620GeoCache = new Map();
const v2620RoutingDeals = new Set();

function v2620Normalize(value) {
  return cleanText(value, 240)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function v2620ActiveBranches() {
  return (data.branches || []).filter((branch) => branch.active !== false);
}

function v2620ExplicitTransferRequest(text = "") {
  const value = v2620Normalize(text);
  if (!value) return false;
  return /(otra sucursal|otra sede|otro local|cambiar de sucursal|cambiar sucursal|derivame|derivar|derivacion|transferir|transferime|pasame con|comunicarme con|atenderme en|quiero otra sucursal|prefiero otra sucursal)/i.test(value);
}

function v2620BranchMention(text = "") {
  const value = v2620Normalize(text);
  if (!value) return null;
  const branches = v2620ActiveBranches();
  return branches.find((branch) => {
    const candidates = [branch.name, branch.code, branch.city]
      .map(v2620Normalize)
      .filter((item) => item.length >= 3);
    return candidates.some((item) => value === item || value.includes(item));
  }) || null;
}

function v2620HasHumanReply(deal) {
  if (!deal) return false;
  if (deal.botHumanHandoff === true) return true;
  const lastIncomingAt = Date.parse(deal.lastClientAt || 0) || 0;
  return (deal.messages || []).some((message) => {
    if (message?.direction !== "outgoing") return false;
    const at = Date.parse(message?.at || 0) || 0;
    if (lastIncomingAt && at < lastIncomingAt) return false;
    const origin = String(message?.origin || "").toLowerCase();
    if (["bot", "followup", "branch-selector", "super-automation", "transfer-intro"].includes(origin)) return false;
    return origin === "human" || Boolean(message?.agentUserId || message?.senderUserId);
  });
}

function v2620LooksLikeCityAnswer(text = "") {
  const raw = cleanText(text, 120).trim();
  if (!raw || raw.length > 70 || /[?!]/.test(raw)) return false;
  const normalized = v2620Normalize(raw);
  if (!normalized || /^(hola|buenas|buen dia|buenas tardes|buenas noches|gracias|si|no|ok|dale)$/.test(normalized)) return false;
  return normalized.split(" ").length <= 6;
}

async function v2620Geocode(value) {
  const query = cleanText(value, 240).trim();
  if (!query) return null;
  const key = v2620Normalize(query);
  const cached = v2620GeoCache.get(key);
  if (cached && Date.now() - cached.at < 24 * 60 * 60 * 1000) return cached.point;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  timer.unref?.();
  try {
    const params = new URLSearchParams({
      q: `${query}, Paraguay`,
      format: "jsonv2",
      limit: "1",
      countrycodes: "py",
      "accept-language": "es",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { "User-Agent": "ICIIA-CRM/26.20 automatic-branch-routing" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Geocodificación HTTP ${response.status}`);
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    const lat = Number(row?.lat);
    const lon = Number(row?.lon);
    const point = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    v2620GeoCache.set(key, { at: Date.now(), point });
    return point;
  } catch {
    v2620GeoCache.set(key, { at: Date.now(), point: null });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function v2620BranchPoint(branch) {
  const lat = Number(branch?.weatherLatitude);
  const lon = Number(branch?.weatherLongitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  const place = [branch?.address, branch?.city].filter(Boolean).join(", ") || branch?.name || "";
  return v2620Geocode(place);
}

function v2620DistanceKm(a, b) {
  const rad = (value) => value * Math.PI / 180;
  const earth = 6371;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function v2620NearestBranchForCity(city) {
  const branches = v2620ActiveBranches();
  if (!branches.length) return null;
  const normalizedCity = v2620Normalize(city);
  const exact = branches.find((branch) => v2620Normalize(branch.city) === normalizedCity);
  if (exact) return exact;
  const clientPoint = await v2620Geocode(city);
  if (!clientPoint) return null;
  const candidates = [];
  for (const branch of branches) {
    const point = await v2620BranchPoint(branch);
    if (!point) continue;
    candidates.push({ branch, distance: v2620DistanceKm(clientPoint, point) });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.branch || null;
}

function v2620ClientCity(deal, text = "") {
  const client = findClient(data, deal?.clientId);
  const stored = normalizeCityName(client?.city || "");
  if (stored) return stored;
  const labelled = cleanText(text, 160).match(/(?:ciudad|soy de|estoy en|vivo en|me encuentro en)\s*[:\-]?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ .'-]{3,80})/i)?.[1] || "";
  if (labelled) return normalizeCityName(labelled);
  if (deal?.v2620CityAskedAt && v2620LooksLikeCityAnswer(text)) return normalizeCityName(text);
  return "";
}

function v2620MarkSameBranchSelected(deal, branch) {
  if (!deal || !branch) return;
  deal.branchSelection = {
    ...(deal.branchSelection || {}),
    required: false,
    status: "selected",
    originalBranchId: deal.branchSelection?.originalBranchId || deal.branchId || branch.id,
    eligibleBranchIds: deal.branchSelection?.eligibleBranchIds || v2620ActiveBranches().map((item) => item.id),
    selectedBranchId: branch.id,
    selectedAt: timestamp(),
    askedAt: deal.branchSelection?.askedAt || deal.v2620CityAskedAt || timestamp(),
  };
  deal.selectedBranchId = branch.id;
  deal.coverageReason = "";
  deal.v2620AutoRouting = { city: normalizeCityName(findClient(data, deal.clientId)?.city || ""), branchId: branch.id, sameBranch: true, at: timestamp() };
  deal.updatedAt = timestamp();
}

async function v2620AskCity(deal, text = "") {
  if (!deal) return true;
  const asked = Date.parse(deal.v2620CityAskedAt || 0) || 0;
  if (Date.now() - asked < 2 * 60 * 1000) return true;
  deal.v2620CityAskedAt = timestamp();
  deal.updatedAt = timestamp();
  const alreadyExplainedNeed = cleanText(text, 500).length > 18 && !/^(hola|buenas|buen dia|buenas tardes|buenas noches)/i.test(v2620Normalize(text));
  const message = alreadyExplainedNeed
    ? "Para derivarte automáticamente a la sucursal más cercana, ¿en qué ciudad te encontrás? No hace falta que elijas un número de sucursal."
    : "Para ubicarte con la sucursal más cercana, ¿en qué ciudad te encontrás? También contame qué necesitás y voy adelantando tu consulta. No hace falta que elijas un número de sucursal.";
  try { await sendBotMessage(deal, message, "branch-selector"); }
  catch (error) {
    if (error?.code !== "BOT_HUMAN_HANDOFF") throw error;
  }
  await store.save();
  return true;
}

async function v2620MaybeAutoRouteBranch(deal, text = "", { created = false, forceSelection = false } = {}) {
  if (!deal || v2620RoutingDeals.has(deal.id)) return false;
  const branches = v2620ActiveBranches();
  if (branches.length < 2) return false;

  const explicit = v2620ExplicitTransferRequest(text) || Boolean(v2620BranchMention(text));
  const pendingSelection = deal.branchSelection?.status === "pending";
  const unattended = !v2620HasHumanReply(deal) && (created || deal.stage === STAGES.NEW || !deal.ownerUserId || pendingSelection);
  if (!forceSelection && !explicit && !unattended) return false;

  const client = findClient(data, deal.clientId);
  let city = v2620ClientCity(deal, text);
  let targetBranch = v2620BranchMention(text);

  if (city && client && !client.city) {
    client.city = normalizeCityName(city);
    client.updatedAt = timestamp();
  }

  if (!targetBranch && !city) return v2620AskCity(deal, text);
  if (!targetBranch) targetBranch = await v2620NearestBranchForCity(city);
  if (!targetBranch) return v2620AskCity(deal, text);

  const sourceBranch = getBranch(deal.branchId || primaryBranchId());
  if (!sourceBranch) return false;
  if (targetBranch.id === sourceBranch.id) {
    v2620MarkSameBranchSelected(deal, targetBranch);
    await store.save();
    return false;
  }

  v2620RoutingDeals.add(deal.id);
  try {
    if (client && city) {
      client.city = normalizeCityName(city);
      client.preferredBranchId = targetBranch.id;
      client.updatedAt = timestamp();
    }
    deal.branchSelection = {
      ...(deal.branchSelection || {}),
      required: true,
      status: "pending",
      originalBranchId: deal.branchSelection?.originalBranchId || sourceBranch.id,
      eligibleBranchIds: branches.map((branch) => branch.id),
      askedAt: deal.branchSelection?.askedAt || deal.v2620CityAskedAt || timestamp(),
      selectedBranchId: null,
      selectedAt: null,
    };
    deal.v2620RoutingCity = city || targetBranch.city || "";
    deal.v2620RoutingReason = explicit ? "Solicitud expresa del cliente" : "Sucursal más cercana según ciudad";

    // Si el cliente pidió expresamente otra sucursal después de una intervención humana,
    // el cambio de sucursal vuelve a habilitar el bot únicamente para la transición.
    if (explicit && deal.botHumanHandoff === true) {
      deal.botHumanHandoff = false;
      deal.botActive = true;
      deal.botMode = "auto";
      deal.botPauseReason = "";
    }

    const targetDeal = await v212RouteSelectedBranch(deal, targetBranch);
    if (!targetDeal || targetDeal.id === deal.id) return false;

    // La sucursal destino debe recibirlo como NUEVO INGRESO. No heredamos un responsable:
    // el primer agente que responda/tome la conversación se convierte en responsable.
    targetDeal.ownerUserId = null;
    targetDeal.ownerName = "";
    targetDeal.assignedUserId = null;
    targetDeal.assignedUserName = "";
    targetDeal.handlerKey = "";
    targetDeal.assignmentSource = "automatic_nearest_branch";
    targetDeal.assignmentAt = null;
    targetDeal.stage = STAGES.NEW;
    targetDeal.botActive = true;
    targetDeal.botHumanHandoff = false;
    targetDeal.botMode = "auto";
    targetDeal.botPauseReason = "";
    targetDeal.coverageRequired = false;
    targetDeal.coverageReason = "";
    targetDeal.v2620AutoRouting = {
      city: normalizeCityName(city || client?.city || ""),
      sourceBranchId: sourceBranch.id,
      targetBranchId: targetBranch.id,
      reason: deal.v2620RoutingReason,
      at: timestamp(),
    };
    targetDeal.updatedAt = timestamp();
    addActivity(data, `${deal.name || client?.name || "Cliente"}: derivación automática a ${targetBranch.name}${city ? ` por ubicación en ${normalizeCityName(city)}` : ""}. Quedó como nuevo ingreso sin responsable.`, "success");
    recordAuditEvent(null, "derivacion_automatica_sucursal_cercana", {
      sourceDealId: deal.id,
      targetDealId: targetDeal.id,
      sourceBranchId: sourceBranch.id,
      targetBranchId: targetBranch.id,
      city: normalizeCityName(city || client?.city || ""),
      explicitRequest: explicit,
    }, targetBranch.id, "system");
    await store.save();
    return true;
  } finally {
    v2620RoutingDeals.delete(deal.id);
  }
}

async function v2620RouteIncomingOrBot(deal, text = "", { created = false, lineEnabled = true } = {}) {
  try {
    const handled = await v2620MaybeAutoRouteBranch(deal, text, { created });
    if (handled) return true;
    if (data.settings.botEnabled && lineEnabled !== false && deal.botActive && deal.botHumanHandoff !== true && text) {
      await maybeReplyWithBot(deal, text);
    }
    return false;
  } catch (error) {
    addLog(`Derivación automática: ${cleanText(error?.message || error, 300)}`, "warning");
    if (data.settings.botEnabled && lineEnabled !== false && deal.botActive && deal.botHumanHandoff !== true && text) {
      await maybeReplyWithBot(deal, text).catch(() => {});
    }
    return false;
  }
}
`;

export function applyV2620AutoBranchRoutingPatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    "async function maybeHandleBranchSelection(deal, text) {",
    `${AUTO_ROUTING_HELPERS.trim()}\n\nasync function maybeHandleBranchSelection(deal, text) {`,
    "helpers antes de selección de sucursal",
  );

  patched = replaceRegexOnce(
    patched,
    /async function maybeHandleBranchSelection\(deal, text\) \{[\s\S]*?\n\}/,
    `async function maybeHandleBranchSelection(deal, text) {\n  if (deal?.branchSelection?.status !== "pending") return false;\n  return v2620MaybeAutoRouteBranch(deal, text, { forceSelection: true });\n}`,
    "selector numérico legacy",
  );

  patched = replaceOnce(
    patched,
    "Respondé con el número o el nombre de la sucursal.",
    "Decime en qué ciudad te encontrás y te derivo automáticamente a la sucursal más cercana.",
    "texto de consulta numérica",
  );

  patched = replaceFirstAfter(
    patched,
    "async function v212RouteSelectedBranch(sourceDeal, targetBranch) {",
    "  targetDeal.botActive = false;",
    "  targetDeal.botActive = true;\n  targetDeal.botHumanHandoff = false;\n  targetDeal.botMode = \"auto\";\n  targetDeal.botPauseReason = \"\";",
    "bot activo en destino",
  );

  patched = replaceFirstAfter(
    patched,
    "async function v212RouteSelectedBranch(sourceDeal, targetBranch) {",
    "  const targetOwner = targetPriorOwner || chooseIncomingTransferOwner(client, targetBranch.id);\n  if (targetOwner) applyOwnerToClientAndDeal(client, targetDeal, targetOwner, targetBranch.id);",
    "  const targetOwner = null; // V26.20: nuevo ingreso sin responsable; el primer agente que lo tome será responsable.",
    "asignación automática del responsable destino",
  );

  patched = replaceFirstAfter(
    patched,
    "async function v212RouteSelectedBranch(sourceDeal, targetBranch) {",
    "      const intro = `Hola${sourceDeal.contactPersonName ? ` ${sourceDeal.contactPersonName}` : \"\"}. Soy del equipo de ${targetBranch.name}. Recibimos tu consulta y continuamos desde acá.`;",
    "      const intro = `Hola${sourceDeal.contactPersonName ? ` ${sourceDeal.contactPersonName}` : \"\"}. Te derivamos al equipo de ${targetBranch.name}${sourceDeal.v2620RoutingCity ? ` por tu ubicación en ${normalizeCityName(sourceDeal.v2620RoutingCity)}` : \"\"}. Ya tenemos el contexto de tu consulta. Mientras un agente toma la conversación, puedo seguir ayudándote por acá.`;",
    "mensaje de bienvenida desde la nueva sucursal",
  );

  patched = replaceRegexOnce(
    patched,
    /const messageId = await sendProviderText\(targetDeal, intro\);\n\s*recordHumanOutgoing\(data, \{ jid: targetDeal\.jid, name: targetDeal\.name, text: intro, messageId, userId: targetOwner\?\.id \|\| null, userName: targetOwner\?\.name \|\| targetBranch\.name, branchId: targetBranch\.id, lineId: targetLine\.id \}\);\n\s*targetDeal\.stage = STAGES\.CONTACTED;\n\s*targetDeal\.updatedAt = timestamp\(\);/,
    `const messageId = await sendProviderText(targetDeal, intro);\n      rememberSeen(messageId);\n      recordBotOutgoing(data, { deal: targetDeal, text: intro, messageId, origin: "branch-selector" });\n      targetDeal.stage = STAGES.NEW;\n      targetDeal.botActive = true;\n      targetDeal.botHumanHandoff = false;\n      targetDeal.botMode = "auto";\n      targetDeal.updatedAt = timestamp();`,
    "bienvenida automática registrada como bot",
  );

  patched = replaceOnce(
    patched,
    "queueIncomingSuperAutomation({deal,text,line,created,message:{text,id:item.id}}); if(data.settings.botEnabled&&line.botEnabled!==false&&deal.botActive&&text)void maybeReplyWithBot(deal,text);",
    "queueIncomingSuperAutomation({deal,text,line,created,message:{text,id:item.id}}); if(text)void v2620RouteIncomingOrBot(deal,text,{created,lineEnabled:line.botEnabled!==false});",
    "routing automático en ingreso por línea",
  );

  patched = replaceFirstAfter(
    patched,
    "for (const { deal, text, occurredAt } of botQueue.values()) {",
    "      void maybeReplyWithBot(deal, text);",
    "      void v2620RouteIncomingOrBot(deal, text, { created: false, lineEnabled: dealWhatsappLine(deal)?.botEnabled !== false });",
    "routing automático en cola de entrada",
  );

  return patched;
}
