function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.35 pautas IA: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.35 pautas IA: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function insertAfterOnce(source, marker, block, label) {
  const first = source.indexOf(marker);
  const last = source.lastIndexOf(marker);
  if (first < 0) throw new Error(`V26.35 pautas IA: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.35 pautas IA: ${label} aparece más de una vez.`);
  const at = first + marker.length;
  return source.slice(0, at) + block + source.slice(at);
}

function replaceFirstAfter(source, startMarker, find, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.35 pautas IA: no se encontró inicio de ${label}.`);
  const index = source.indexOf(find, start);
  if (index < 0) throw new Error(`V26.35 pautas IA: no se encontró ${label}.`);
  return source.slice(0, index) + replacement + source.slice(index + find.length);
}

const helpers = String.raw`
if (!Array.isArray(data.adPromotions)) data.adPromotions = [];
for (const v2635Deal of data.deals || []) {
  if (!Object.prototype.hasOwnProperty.call(v2635Deal, "adAttribution")) v2635Deal.adAttribution = null;
}

function v2635Norm(value, max = 1200) {
  return cleanText(value, max).toLocaleLowerCase("es").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
}

function v2635StringList(value, maxItems = 30, maxLen = 300) {
  const source = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(source.map((item) => cleanText(item, maxLen)).filter(Boolean))].slice(0, maxItems);
}

function v2635PromotionPayload(input = {}, current = {}) {
  const next = {
    ...current,
    name: cleanText(input.name ?? current.name, 180) || "Promoción",
    active: input.active !== false,
    lineIds: v2635StringList(input.lineIds ?? current.lineIds, 50, 180),
    sourceIds: v2635StringList(input.sourceIds ?? current.sourceIds, 80, 260),
    triggerContains: v2635StringList(input.triggerContains ?? current.triggerContains, 40, 500),
    headline: cleanText(input.headline ?? current.headline, 500),
    body: cleanText(input.body ?? current.body, 1800),
    offerDetails: cleanText(input.offerDetails ?? current.offerDetails, 4000),
    botInstructions: cleanText(input.botInstructions ?? current.botInstructions, 4000),
    validFrom: cleanText(input.validFrom ?? current.validFrom, 40) || null,
    validTo: cleanText(input.validTo ?? current.validTo, 40) || null,
    updatedAt: timestamp(),
  };
  if (!next.id) next.id = makeId("adpromo");
  if (!next.createdAt) next.createdAt = timestamp();
  return next;
}

function v2635PromotionIsCurrent(promotion, now = Date.now()) {
  if (!promotion || promotion.active === false) return false;
  const from = promotion.validFrom ? Date.parse(promotion.validFrom) : NaN;
  const to = promotion.validTo ? Date.parse(promotion.validTo) : NaN;
  if (Number.isFinite(from) && now < from) return false;
  if (Number.isFinite(to) && now > to) return false;
  return true;
}

function v2635FindPromotion({ sourceId = "", text = "", lineId = "" } = {}) {
  const normalizedText = v2635Norm(text, 6000);
  const source = cleanText(sourceId, 260);
  const candidates = (data.adPromotions || []).filter((promotion) => {
    if (!v2635PromotionIsCurrent(promotion)) return false;
    if ((promotion.lineIds || []).length && !(promotion.lineIds || []).includes(lineId)) return false;
    return true;
  });
  if (source) {
    const exact = candidates.find((promotion) => (promotion.sourceIds || []).includes(source));
    if (exact) return exact;
  }
  if (normalizedText) {
    return candidates.find((promotion) =>
      (promotion.triggerContains || []).some((needle) => {
        const normalizedNeedle = v2635Norm(needle, 500);
        return normalizedNeedle && normalizedText.includes(normalizedNeedle);
      }),
    ) || null;
  }
  return null;
}

function v2635MessageContextInfo(message) {
  if (!message || typeof message !== "object") return {};
  const candidates = [
    message.extendedTextMessage?.contextInfo,
    message.imageMessage?.contextInfo,
    message.videoMessage?.contextInfo,
    message.documentMessage?.contextInfo,
    message.audioMessage?.contextInfo,
    message.buttonsResponseMessage?.contextInfo,
    message.listResponseMessage?.contextInfo,
    message.templateButtonReplyMessage?.contextInfo,
    message.interactiveResponseMessage?.contextInfo,
  ];
  return candidates.find((entry) => entry && typeof entry === "object") || {};
}

function v2635QrAdReferral(item, text = "") {
  const context = v2635MessageContextInfo(item?.message);
  const external = context.externalAdReply && typeof context.externalAdReply === "object" ? context.externalAdReply : {};
  const sourceMarker = [
    context.entryPointConversionSource,
    context.conversionSource,
    context.entryPointConversionExternalSource,
    external.sourceType,
    external.adType,
  ].map((value) => cleanText(value, 120).toLocaleLowerCase("es")).join(" ");
  const looksLikeCtwa = Boolean(
    external.sourceId ||
    external.ctwaClid ||
    context.ctwaPayload ||
    context.conversionData ||
    /ctwa|fb_ads|facebook|instagram|ad/.test(sourceMarker)
  );
  if (!looksLikeCtwa) return null;
  return {
    sourceType: cleanText(external.sourceType, 80) || "ad",
    sourceId: cleanText(external.sourceId, 260),
    sourceUrl: cleanText(external.sourceUrl, 1200),
    sourceApp: cleanText(external.sourceApp || context.entryPointConversionApp, 80),
    headline: cleanText(external.title || external.headline, 500),
    body: cleanText(external.body, 1800),
    ctwaClid: cleanText(external.ctwaClid || context.ctwaClid, 800),
    conversionSource: cleanText(context.entryPointConversionSource || context.conversionSource, 180),
    opaquePayload: context.ctwaPayload || context.conversionData ? "present" : "",
    initialMessage: cleanText(text, 6000),
    detectedBy: external.sourceId || external.title || external.body ? "qr_metadata" : "qr_ctwa_signal",
  };
}

function v2635CloudAdReferral(item, text = "") {
  const referral = item?.referral && typeof item.referral === "object" ? item.referral : null;
  if (!referral) return null;
  return {
    sourceType: cleanText(referral.source_type || referral.sourceType, 80) || "ad",
    sourceId: cleanText(referral.source_id || referral.sourceId, 260),
    sourceUrl: cleanText(referral.source_url || referral.sourceUrl, 1200),
    sourceApp: cleanText(referral.source_app || referral.sourceApp, 80),
    headline: cleanText(referral.headline || referral.title, 500),
    body: cleanText(referral.body, 1800),
    ctwaClid: cleanText(referral.ctwa_clid || referral.ctwaClid, 800),
    mediaType: cleanText(referral.media_type || referral.mediaType, 80),
    initialMessage: cleanText(text, 6000),
    detectedBy: "cloud_referral",
  };
}

function v2635ApplyAdContext(deal, referral, text = "", line = null, provider = "") {
  if (!deal) return null;
  const sourceId = cleanText(referral?.sourceId, 260);
  const promotion = v2635FindPromotion({ sourceId, text, lineId: line?.id || deal.lineId || "" });
  if (!referral && !promotion) return null;

  const previous = deal.adAttribution && typeof deal.adAttribution === "object" ? deal.adAttribution : null;
  const attribution = {
    sourceType: cleanText(referral?.sourceType, 80) || previous?.sourceType || "ad",
    sourceId: sourceId || previous?.sourceId || "",
    sourceUrl: cleanText(referral?.sourceUrl, 1200) || previous?.sourceUrl || "",
    sourceApp: cleanText(referral?.sourceApp, 80) || previous?.sourceApp || "",
    headline: cleanText(promotion?.headline || referral?.headline, 500) || previous?.headline || "",
    body: cleanText(promotion?.body || referral?.body, 1800) || previous?.body || "",
    offerDetails: cleanText(promotion?.offerDetails, 4000) || previous?.offerDetails || "",
    botInstructions: cleanText(promotion?.botInstructions, 4000) || previous?.botInstructions || "",
    promotionId: promotion?.id || previous?.promotionId || null,
    promotionName: promotion?.name || previous?.promotionName || "",
    ctwaClid: cleanText(referral?.ctwaClid, 800) || previous?.ctwaClid || "",
    conversionSource: cleanText(referral?.conversionSource, 180) || previous?.conversionSource || "",
    mediaType: cleanText(referral?.mediaType, 80) || previous?.mediaType || "",
    provider: cleanText(provider, 40) || previous?.provider || line?.provider || "",
    lineId: line?.id || deal.lineId || previous?.lineId || null,
    lineName: line?.name || previous?.lineName || "",
    initialMessage: cleanText(referral?.initialMessage || text, 6000) || previous?.initialMessage || "",
    detectedBy: cleanText(referral?.detectedBy, 80) || (promotion ? "message_pattern" : previous?.detectedBy || "unknown"),
    detectedAt: previous?.detectedAt || timestamp(),
    updatedAt: timestamp(),
  };

  deal.adAttribution = attribution;
  if (!Array.isArray(deal.campaignSourceIds)) deal.campaignSourceIds = [];
  const campaignKey = attribution.sourceId || attribution.promotionId;
  if (campaignKey && !deal.campaignSourceIds.includes(campaignKey)) deal.campaignSourceIds.push(campaignKey);
  deal.updatedAt = timestamp();

  const previousKey = previous ? [previous.sourceId, previous.promotionId, previous.detectedAt].join("|") : "";
  const nextKey = [attribution.sourceId, attribution.promotionId, attribution.detectedAt].join("|");
  if (!previous || previousKey !== nextKey) {
    const label = attribution.promotionName || attribution.headline || attribution.sourceId || "Pauta Meta";
    addActivity(data, "Lead de pauta detectado: " + label + ".", "success");
    recordAuditEvent(null, "pauta_detectada", {
      dealId: deal.id,
      clientPhone: deal.phone,
      sourceId: attribution.sourceId,
      promotionId: attribution.promotionId,
      promotionName: attribution.promotionName,
      headline: attribution.headline,
      provider: attribution.provider,
      detectedBy: attribution.detectedBy,
    }, deal.branchId, "system");
  }
  return attribution;
}

function v2635PromotionContextForPrompt(deal) {
  const attribution = deal?.adAttribution;
  if (!attribution || typeof attribution !== "object") return "";
  const parts = [
    "ORIGEN PUBLICITARIO DETECTADO: el cliente ingresó desde una pauta/promoción.",
    attribution.promotionName ? "Promoción configurada: " + attribution.promotionName + "." : "",
    attribution.headline ? "Título de la pauta: " + attribution.headline + "." : "",
    attribution.body ? "Texto de la pauta: " + attribution.body : "",
    attribution.offerDetails ? "Detalles comerciales confirmados de la promoción: " + attribution.offerDetails : "",
    attribution.initialMessage ? "Mensaje inicial del cliente desde la pauta: " + attribution.initialMessage : "",
    attribution.botInstructions ? "Instrucción específica de esta promoción: " + attribution.botInstructions : "",
    "Mientras el bot automático esté activo, hablá directamente sobre esta promoción y ayudá al cliente a avanzar: aclarar la oferta, responder dudas, identificar qué necesita y hacer preguntas útiles para que el agente reciba una conversación contextualizada.",
    "No inventes precios, vigencia, stock, descuentos, condiciones ni beneficios que no estén explícitos en el contexto o disponibles mediante herramientas del CRM.",
    "Si el mensaje de pauta es genérico y no hay detalles suficientes, reconocé su interés y preguntá qué aspecto de la promoción desea conocer, sin suponer condiciones.",
    "Cuando un agente humano tome la conversación, el sistema detendrá automáticamente esta respuesta automática y quedará solo el Copiloto.",
  ].filter(Boolean);
  return parts.join("\\n");
}

function v2635PublicPromotion(promotion) {
  return {
    id: promotion.id,
    name: promotion.name,
    active: promotion.active !== false,
    lineIds: [...(promotion.lineIds || [])],
    sourceIds: [...(promotion.sourceIds || [])],
    triggerContains: [...(promotion.triggerContains || [])],
    headline: promotion.headline || "",
    body: promotion.body || "",
    offerDetails: promotion.offerDetails || "",
    botInstructions: promotion.botInstructions || "",
    validFrom: promotion.validFrom || null,
    validTo: promotion.validTo || null,
    createdAt: promotion.createdAt,
    updatedAt: promotion.updatedAt,
  };
}
`;

const routes = String.raw`
app.get("/api/ad-promotions", (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  response.setHeader("Cache-Control", "no-store");
  response.json({ promotions: (data.adPromotions || []).map(v2635PublicPromotion) });
});

app.post("/api/ad-promotions", requireAdmin, async (request, response, next) => {
  try {
    const promotion = v2635PromotionPayload(request.body || {});
    data.adPromotions.unshift(promotion);
    await store.save();
    response.status(201).json({ promotion: v2635PublicPromotion(promotion) });
  } catch (error) { next(error); }
});

app.put("/api/ad-promotions/:id", requireAdmin, async (request, response, next) => {
  try {
    const promotion = (data.adPromotions || []).find((entry) => entry.id === cleanText(request.params.id, 180));
    if (!promotion) return response.status(404).json({ error: "Promoción no encontrada." });
    Object.assign(promotion, v2635PromotionPayload(request.body || {}, promotion), { id: promotion.id, createdAt: promotion.createdAt });
    await store.save();
    response.json({ promotion: v2635PublicPromotion(promotion) });
  } catch (error) { next(error); }
});

app.delete("/api/ad-promotions/:id", requireAdmin, async (request, response, next) => {
  try {
    const id = cleanText(request.params.id, 180);
    const index = (data.adPromotions || []).findIndex((entry) => entry.id === id);
    if (index < 0) return response.status(404).json({ error: "Promoción no encontrada." });
    data.adPromotions.splice(index, 1);
    await store.save();
    response.json({ ok: true });
  } catch (error) { next(error); }
});
`;

export function applyV2635AdPromotionContextPatches(source) {
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

  patched = replaceFirstAfter(
    patched,
    "async function processCloudWebhook(body) {",
    "    const {deal,created}=recordIncoming(data,{jid,name:resolvedName,branchId:line.branchId,lineId:line.id,text:text||messageLabel(attachment)||\"Archivo recibido\",messageId:item.id,attachment,now:Number(item.timestamp||0)*1000||Date.now()}); refreshDealCommercialStatus(deal,true);",
    "    const {deal,created}=recordIncoming(data,{jid,name:resolvedName,branchId:line.branchId,lineId:line.id,text:text||messageLabel(attachment)||\"Archivo recibido\",messageId:item.id,attachment,now:Number(item.timestamp||0)*1000||Date.now()}); const v2635Referral=v2635CloudAdReferral(item,text); v2635ApplyAdContext(deal,v2635Referral,text,line,\"cloud\"); refreshDealCommercialStatus(deal,true);",
    "captura de pauta Cloud API",
  );

  patched = replaceFirstAfter(
    patched,
    "async function handleIncomingMessages(event, { history = false, branchId = null, lineId = null } = {}) {",
    "    refreshDealCommercialStatus(deal,true);",
    "    if (!historical) { const v2635Referral=v2635QrAdReferral(item,text); v2635ApplyAdContext(deal,v2635Referral,text,incomingLine,\"qr\"); }\n    refreshDealCommercialStatus(deal,true);",
    "captura de pauta QR",
  );

  patched = replaceFirstAfter(
    patched,
    "async function createAiReply(deal, userMessage) {",
    '        `CAMPOS PERSONALIZADOS Y CONTEXTO:\\n${customContext || "Sin campos personalizados."}\\n\\n` +',
    '        `PAUTA / PROMOCIÓN DE ORIGEN:\\n${v2635PromotionContextForPrompt(deal) || "No se detectó una pauta activa para esta conversación."}\\n\\n` +\n        `CAMPOS PERSONALIZADOS Y CONTEXTO:\\n${customContext || "Sin campos personalizados."}\\n\\n` +',
    "contexto publicitario para IA",
  );

  return patched;
}
