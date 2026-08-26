function insertBeforeOne(source, anchor, block, label) {
  const first = source.indexOf(anchor);
  const second = source.indexOf(anchor, first + anchor.length);
  if (first < 0 || second >= 0) {
    const count = first < 0 ? 0 : 2;
    throw new Error(`V25.4 patch "${label}" esperaba 1 coincidencia y encontró ${count}.`);
  }
  return source.slice(0, first) + block + "\n\n" + source.slice(first);
}

export function applyV254ServerPatches(source) {
  const anchor = 'app.get("/api/clients/:id/profile", async (request, response, next) => {';
  const block = `
function v254PurgeEntityReferences({ dealId = null, clientId = null } = {}) {
  const preservedCollections = new Set(["deals", "clients", "auditEvents", "stockMovements"]);
  for (const [collectionName, collection] of Object.entries(data)) {
    if (preservedCollections.has(collectionName) || !Array.isArray(collection)) continue;
    data[collectionName] = collection.filter((entry) => {
      if (!entry || typeof entry !== "object") return true;
      if (dealId && [entry.dealId, entry.conversationId, entry.sourceDealId, entry.targetDealId].includes(dealId)) return false;
      if (clientId && [entry.clientId, entry.customerId, entry.sourceClientId, entry.targetClientId].includes(clientId)) return false;
      return true;
    });
  }
}

function v254AuditDeletion(request, action, targetId, snapshot = {}) {
  if (!Array.isArray(data.auditEvents)) data.auditEvents = [];
  data.auditEvents.unshift({
    id: makeId("audit"),
    action,
    category: "admin_delete",
    userId: request.currentUser?.id || null,
    userName: request.currentUser?.name || request.currentUser?.username || "Administrador",
    targetId,
    snapshot,
    createdAt: timestamp(),
  });
  data.auditEvents = data.auditEvents.slice(0, 5000);
}

function v254DeleteDealRecord(deal, request, reason = "Negociación eliminada por administrador") {
  releaseDealReservations(data, deal, reason);
  const snapshot = {
    id: deal.id,
    clientId: deal.clientId || null,
    name: deal.name || "",
    phone: deal.phone || "",
    stage: deal.stage || "",
    branchId: deal.branchId || null,
    ownerUserId: deal.ownerUserId || null,
    createdAt: deal.createdAt || null,
  };
  data.deals = data.deals.filter((entry) => entry.id !== deal.id);
  v254PurgeEntityReferences({ dealId: deal.id });
  v254AuditDeletion(request, "delete_deal", deal.id, snapshot);
  return snapshot;
}

app.delete("/api/deals/:id", requireAdmin, async (request, response, next) => {
  try {
    const deal = findDeal(data, request.params.id);
    if (!deal) return response.status(404).json({ error: "Negociación no encontrada." });
    const deleted = v254DeleteDealRecord(deal, request);
    await store.save();
    response.json({ ok: true, deletedDealId: deleted.id, clientId: deleted.clientId });
  } catch (error) { next(error); }
});

app.delete("/api/clients/:id", requireAdmin, async (request, response, next) => {
  try {
    const client = findClient(data, request.params.id);
    if (!client) return response.status(404).json({ error: "Ficha de cliente no encontrada." });
    const linkedDeals = data.deals.filter((deal) => deal.clientId === client.id);
    const cascade = String(request.query?.cascade || "") === "1";
    if (linkedDeals.length && !cascade) {
      return response.status(409).json({
        error: "La ficha tiene negociaciones vinculadas. Confirmá la eliminación total para continuar.",
        negotiationCount: linkedDeals.length,
        requiresCascade: true,
      });
    }

    const clientSnapshot = {
      id: client.id,
      name: client.name || "",
      phone: client.phone || "",
      document: client.document || "",
      ruc: client.ruc || "",
      company: client.company || "",
      negotiationCount: linkedDeals.length,
    };

    for (const deal of linkedDeals) v254DeleteDealRecord(deal, request, "Ficha de cliente eliminada por administrador");
    data.clients = data.clients.filter((entry) => entry.id !== client.id);
    v254PurgeEntityReferences({ clientId: client.id });
    v254AuditDeletion(request, "delete_client", client.id, clientSnapshot);
    await store.save();
    response.json({ ok: true, deletedClientId: client.id, deletedNegotiations: linkedDeals.length });
  } catch (error) { next(error); }
});`;

  return insertBeforeOne(source, anchor, block, "rutas administrativas de eliminación");
}
