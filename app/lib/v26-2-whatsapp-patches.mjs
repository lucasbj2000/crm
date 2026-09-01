function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.2 WhatsApp: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.2 WhatsApp: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceBetween(source, start, end, replacement, label) {
  const first = source.indexOf(start);
  if (first < 0) throw new Error(`V26.2 WhatsApp: no se encontró inicio de ${label}.`);
  const next = source.indexOf(end, first + start.length);
  if (next < 0) throw new Error(`V26.2 WhatsApp: no se encontró final de ${label}.`);
  return source.slice(0, first) + replacement + "\n" + source.slice(next);
}

const historyHelpers = String.raw`
function v262ConversationPhoneKey(value) {
  const text = String(value || "");
  if (/\b(lid|hosted\.lid)\b/i.test(text)) return "";
  return text.replace(/\D/g, "");
}
function v262RelatedWhatsappDeals(deal, user) {
  if (!deal || !user) return [];
  const clientId = deal.clientId || null;
  const phone = v262ConversationPhoneKey(deal.phone || deal.jid);
  return (data.deals || []).filter((entry) => {
    if (!userCanAccessDeal(user, entry)) return false;
    if (clientId && entry.clientId === clientId) return true;
    const otherPhone = v262ConversationPhoneKey(entry.phone || entry.jid);
    return Boolean(phone && otherPhone && phone === otherPhone);
  });
}
function v262WhatsappHistory(deal, user) {
  const seen = new Set();
  const rows = [];
  for (const related of v262RelatedWhatsappDeals(deal, user)) {
    for (const message of related.messages || []) {
      const createdAt = message.at || message.createdAt || related.createdAt || "";
      const key = message.id || [related.id, createdAt, message.direction || "", message.text || ""].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: message.id || key,
        direction: message.direction || "incoming",
        origin: message.origin || "",
        text: message.text || "",
        createdAt,
        agentName: message.agentName || message.userName || "",
        attachment: message.attachment || null,
        historical: related.id !== deal.id || message.historical === true,
        sourceDealId: related.id,
      });
    }
  }
  return rows.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}
function v262WhatsappConversation(deal, user) {
  return {
    id: "wa:" + deal.id,
    kind: "deal",
    entityId: deal.id,
    provider: "whatsapp",
    name: deal.name || deal.phone || "Cliente",
    handle: deal.phone || "",
    branchId: deal.branchId || null,
    ownerUserId: deal.ownerUserId || null,
    ownerName: deal.ownerName || "",
    status: deal.stage || "open",
    lastMessageAt: deal.updatedAt || deal.lastMessageAt || deal.createdAt,
    lastDirection: deal.lastDirection || "",
    lastMessage: deal.lastMessage || "",
    messages: v262WhatsappHistory(deal, user),
  };
}

app.get("/api/deals/:id/full-history", (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  const deal = findDeal(data, request.params.id);
  if (!deal) return response.status(404).json({ error: "Conversación no encontrada." });
  if (!userCanAccessDeal(user, deal)) return response.status(403).json({ error: "No tenés acceso a esta conversación." });
  const messages = v262WhatsappHistory(deal, user);
  response.setHeader("Cache-Control", "no-store");
  response.json({ dealId: deal.id, clientId: deal.clientId || null, messageCount: messages.length, messages });
});
`;

const inboxRoute = String.raw`app.get("/api/omnichannel/inbox",(request,response)=>{
  const user=currentUser(request);
  if(!user)return response.status(401).json({error:"Sesión requerida."});
  const whatsapp=(data.deals||[]).filter((deal)=>userCanAccessDeal(user,deal)).map((deal)=>v262WhatsappConversation(deal,user));
  const social=(data.socialThreads||[]).filter((thread)=>{const connection=(data.socialConnections||[]).find((entry)=>entry.id===thread.connectionId);return v2511CanUseConnection(connection,user);}).map((thread)=>({id:"social:"+thread.id,kind:"social",entityId:thread.id,...v2511ThreadPublic(thread)}));
  const conversations=[...whatsapp,...social].sort((a,b)=>String(b.lastMessageAt||"").localeCompare(String(a.lastMessageAt||"")));
  response.setHeader("Cache-Control","no-store");
  response.json({conversations});
});`;

const lineConnectRoute = String.raw`app.post("/api/whatsapp-lines/:id/connect", requireManagerOrAdmin, async (request,response,next)=>{
  try {
    const user=request.currentUser||currentUser(request),line=whatsappLineById(request.params.id);
    if(!line||line.active===false)throw new Error("Línea no encontrada o inactiva.");
    if(user.role!=="admin"&&!canUserUseWhatsappLine(user,line))throw new Error("No tenés permiso para conectar esta línea.");
    const connection=whatsappLineConnectionState(line.id);
    if(line.provider==="qr"&&connection?.status!=="connected"){
      await disconnectWhatsappLineConnection(line.id).catch(()=>{});
    }
    await startWhatsappLineConnection(line.id);
    response.status(202).json(stateResponse(request));
  } catch(error) { next(error); }
});`;

const branchConnectRoute = String.raw`app.post("/api/branches/:id/connect", requireManagerOrAdmin, async (request,response,next)=>{
  try {
    const user=request.currentUser||currentUser(request);
    const branch=getBranch(request.params.id);
    if(!branch||branch.active===false)throw new Error("Sucursal no encontrada o inactiva.");
    if(user.role!=="admin"&&!userCanAccessBranch(user,branch.id))throw new Error("No tenés acceso a esa sucursal.");
    const connection=branchConnectionState(branch.id);
    if(connection?.provider!=="cloud"&&connection?.status!=="connected"){
      await disconnectBranchConnection(branch.id).catch(()=>{});
    }
    await startBranchConnection(branch.id);
    response.status(202).json(stateResponse(request));
  } catch(error) { next(error); }
});`;

export function applyV262WhatsappPatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    'from "./lib/domain.mjs";',
    'from "./lib/domain-v26.mjs";',
    "adaptador de dominio sin recorte de mensajes",
  );

  patched = replaceOnce(
    patched,
    'thread.messages=Array.isArray(thread.messages)?thread.messages:[]; thread.messages.push(message); if(thread.messages.length>500)thread.messages.splice(0,thread.messages.length-500);',
    'thread.messages=Array.isArray(thread.messages)?thread.messages:[]; thread.messages.push(message);',
    "retención completa de mensajes sociales",
  );

  patched = replaceOnce(
    patched,
    'messages:(thread.messages||[]).slice(-250).map((message)=>',
    'messages:(thread.messages||[]).map((message)=>',
    "historial social completo en API",
  );

  patched = replaceBetween(
    patched,
    'app.post("/api/whatsapp-lines/:id/connect",',
    'app.post("/api/whatsapp-lines/:id/disconnect",',
    lineConnectRoute,
    "ruta de reconexión QR por línea",
  );

  patched = replaceBetween(
    patched,
    'app.post("/api/branches/:id/connect",',
    'app.post("/api/branches/:id/disconnect",',
    branchConnectRoute,
    "ruta de reconexión QR por sucursal",
  );

  const inboxStart = 'app.get("/api/omnichannel/inbox",';
  const inboxEnd = 'app.post("/api/omnichannel/conversations/:id/message",';
  patched = replaceBetween(
    patched,
    inboxStart,
    inboxEnd,
    historyHelpers + "\n" + inboxRoute,
    "bandeja con historial completo",
  );

  return patched;
}
