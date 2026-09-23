function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(\`V26.38 recontacto cerrado: no se encontró \${label}.\`);
  if (first !== last) throw new Error(\`V26.38 recontacto cerrado: \${label} aparece más de una vez.\`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(\`V26.38 recontacto cerrado: no se encontró inicio de \${label}.\`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(\`V26.38 recontacto cerrado: no se encontró fin de \${label}.\`);
  return source.slice(0, start) + replacement + source.slice(end);
}

const UI_MARKER = "/* V26.38 closed recontact */";
const SERVER_MARKER = "/* V26.38 closed recontact server */";

const MESSAGE_ROUTE = String.raw\`/* V26.38 closed recontact server */
app.post("/api/deals/:id/message", async (request, response, next) => {
  try {
    const sourceDeal = findDeal(data, request.params.id);
    const user = currentUser(request);
    const text = cleanText(request.body?.text, 4000);
    if (!sourceDeal || !user) throw new Error("Negociación no encontrada.");
    if (!text) throw new Error("Escribí un mensaje.");

    if (!OPEN_STAGES.has(sourceDeal.stage)) {
      if (![STAGES.WON, STAGES.LOST].includes(sourceDeal.stage)) {
        throw new Error("Esta negociación no admite un nuevo contacto desde su estado actual.");
      }
      if (!userCanAccessDeal(user, sourceDeal)) {
        throw new Error("No tenés acceso a esta negociación.");
      }
      const sourceLine = dealWhatsappLine(sourceDeal);
      if (sourceLine && !canUserUseWhatsappLine(user, sourceLine)) {
        throw new Error(\\\`No estás autorizado a utilizar la línea \\\${sourceLine.name}.\\\`);
      }

      const now = Date.now();
      const newDeal = createDeal(data, {
        jid: sourceDeal.jid,
        name: sourceDeal.name,
        branchId: sourceDeal.branchId,
        lineId: dealLineId(sourceDeal),
        source: "closed_recontact",
        now,
      });
      newDeal.ownerUserId = user.id;
      newDeal.ownerName = user.name;
      newDeal.createdByUserId = user.id;
      newDeal.recontactFromDealId = sourceDeal.id;
      newDeal.recontactFromStage = sourceDeal.stage;
      newDeal.recontactAt = timestamp(now);
      newDeal.updatedAt = timestamp(now + 1);

      try {
        const messageId = await sendProviderText(newDeal, text);
        rememberSeen(messageId);
        const recordedDeal = recordHumanOutgoing(data, {
          jid: newDeal.jid,
          name: newDeal.name,
          text,
          messageId,
          userId: user.id,
          userName: user.name,
          branchId: newDeal.branchId,
          lineId: newDeal.lineId,
          now: now + 1,
        });
        if (recordedDeal.id !== newDeal.id) throw new Error("No se pudo vincular el mensaje a la nueva negociación.");
        recordedDeal.stage = STAGES.CONTACTED;
        recordedDeal.source = "closed_recontact";
        recordedDeal.createdByUserId = user.id;
        recordedDeal.recontactFromDealId = sourceDeal.id;
        recordedDeal.recontactFromStage = sourceDeal.stage;
        recordedDeal.recontactAt = timestamp(now);
        refreshDealCommercialStatus(recordedDeal, true);
        recordAuditEvent(user, "recontacto_desde_negociacion_cerrada", {
          sourceDealId: sourceDeal.id,
          sourceStage: sourceDeal.stage,
          newDealId: recordedDeal.id,
          clientId: recordedDeal.clientId,
          clientName: recordedDeal.name,
          lineId: recordedDeal.lineId || null,
        }, recordedDeal.branchId);
        addActivity(data, \\\`\\\${user.name} volvió a contactar a \\\${recordedDeal.name}; se creó una nueva negociación en Contactado.\\\`, "success");
        queueSuperAutomationEvent({
          type: "outgoing_message",
          deal: recordedDeal,
          client: automationClientForDeal(recordedDeal),
          line: dealWhatsappLine(recordedDeal),
          branch: getBranch(recordedDeal.branchId),
          phone: recordedDeal.phone,
          text,
          message: { text, id: messageId },
        });
        await store.save();
        return response.json({
          state: stateResponse(request),
          recontacted: true,
          sourceDealId: sourceDeal.id,
          createdDealId: recordedDeal.id,
          stage: recordedDeal.stage,
        });
      } catch (error) {
        const index = data.deals.findIndex((entry) => entry.id === newDeal.id && !(entry.messages || []).length);
        if (index >= 0) data.deals.splice(index, 1);
        throw error;
      }
    }

    const deal = sourceDeal;
    const temporaryGrant = v214ActiveCommunicationGrant(deal, user);
    ensureDealOwnership(deal, user, { claim: true, allowTemporaryCommunication: true });
    const messageId = await sendProviderText(deal, text);
    rememberSeen(messageId);
    const hadPendingTransfer = deal.transferPendingForUserId === user.id;
    recordHumanOutgoing(data, { jid: deal.jid, name: deal.name, text, messageId, userId: user.id, userName: user.name, branchId: deal.branchId, lineId: dealLineId(deal) });
    if (hadPendingTransfer) recordAuditEvent(user, "transferencia_recibida_respondida", { dealId: deal.id, clientId: deal.clientId, clientName: deal.name }, deal.branchId);
    refreshDealCommercialStatus(deal,true);
    addActivity(data, temporaryGrant && deal.ownerUserId !== user.id ? \\\`\\\${user.name} respondió a \\\${deal.name} con autorización temporal; \\\${deal.ownerName || "el responsable original"} mantiene la titularidad.\\\` : \\\`\\\${user.name} respondió a \\\${deal.name}; quedó como responsable principal.\\\`, "success");
    queueSuperAutomationEvent({ type:"outgoing_message", deal, client:automationClientForDeal(deal), line:dealWhatsappLine(deal), branch:getBranch(deal.branchId), phone:deal.phone, text, message:{text,id:messageId} });
    await store.save();
    response.json(stateResponse(request));
  } catch (error) {
    next(error);
  }
});

\`;

export function applyV2638CoreUiPatches(source) {
  if (source.includes(UI_MARKER)) return source;
  let patched = source;

  patched = replaceOnce(
    patched,
    '  const canManage = open && (!deal.ownerUserId || deal.ownerUserId === user.id || user.role === "admin" || managerCoverage);\\n  const canCommunicate = canManage || (open && Boolean(temporaryCommunication));\\n  const canWork = canManage;',
    '  const canManage = open && (!deal.ownerUserId || deal.ownerUserId === user.id || user.role === "admin" || managerCoverage);\\n  const canRecontactClosed = ["won", "lost"].includes(deal.stage) && (!deal.ownerUserId || deal.ownerUserId === user.id || ["admin", "manager", "supervisor"].includes(user.role));\\n  const canCommunicate = canManage || (open && Boolean(temporaryCommunication));\\n  const canSendText = canCommunicate || canRecontactClosed;\\n  const canWork = canManage;\\n  ' + UI_MARKER,
    "permisos de recontacto en drawer",
  );

  patched = replaceOnce(
    patched,
    '  $("#manual-message").disabled = !canCommunicate;\\n  $("#message-form button").disabled = !canCommunicate;\\n  $("#attach-button").disabled = !canCommunicate;\\n  $("#record-audio-button").disabled = !canCommunicate;',
    '  $("#manual-message").disabled = !canSendText;\\n  $("#manual-message").placeholder = canRecontactClosed ? "Escribí para volver a contactar; se creará una nueva negociación…" : "Escribí un mensaje…";\\n  $("#message-form button").disabled = !canSendText;\\n  $("#message-form button").title = canRecontactClosed ? "Enviar y crear una nueva negociación en Contactado" : "Enviar mensaje";\\n  $("#attach-button").disabled = !canCommunicate;\\n  $("#record-audio-button").disabled = !canCommunicate;',
    "habilitación de texto en cerrados",
  );

  patched = replaceOnce(
    patched,
    '    const next = await api(\`/api/deals/\${encodeURIComponent(dealId)}/message\`, {\\n      method: "POST",\\n      body: JSON.stringify({ text })\\n    });\\n\\n    setState(next);\\n    $("#manual-message").value = "";\\n    resizeMessageComposer();\\n    showToast("Mensaje enviado");',
    '    const result = await api(\`/api/deals/\${encodeURIComponent(dealId)}/message\`, {\\n      method: "POST",\\n      body: JSON.stringify({ text })\\n    });\\n\\n    setState(result.state || result);\\n    if (result.createdDealId) selectedDealId = result.createdDealId;\\n    $("#manual-message").value = "";\\n    resizeMessageComposer();\\n    if (result.createdDealId) { renderDrawer(); showToast("Mensaje enviado · nueva negociación creada en Contactado"); }\\n    else showToast("Mensaje enviado");',
    "respuesta del envío con nueva negociación",
  );

  return patched;
}

export function applyV2638ServerPatches(source) {
  if (source.includes(SERVER_MARKER)) return source;
  return replaceBetween(
    source,
    'app.post("/api/deals/:id/message"',
    'app.post(\\n  "/api/deals/:id/media"',
    MESSAGE_ROUTE,
    "ruta de mensajes",
  );
}
