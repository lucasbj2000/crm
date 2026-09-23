function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.38 recontacto cerrado: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.38 recontacto cerrado: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceFirstAfter(source, startMarker, find, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.38 recontacto cerrado: no se encontró inicio de ${label}.`);
  const index = source.indexOf(find, start);
  if (index < 0) throw new Error(`V26.38 recontacto cerrado: no se encontró ${label}.`);
  return source.slice(0, index) + replacement + source.slice(index + find.length);
}

const UI_MARKER = "/* V26.38 closed recontact */";
const SERVER_MARKER = "/* V26.38 closed recontact server */";

const CLOSED_RECONTACT_BRANCH = String.raw`
    if (!deal) throw new Error("Negociación no encontrada.");
    if (!OPEN_STAGES.has(deal.stage)) {
      if (![STAGES.WON, STAGES.LOST].includes(deal.stage)) {
        throw new Error("Esta negociación no admite un nuevo contacto desde su estado actual.");
      }
      if (!text) throw new Error("Escribí un mensaje.");
      if (!userCanAccessDeal(user, deal)) throw new Error("No tenés acceso a esta negociación.");

      const sourceLine = dealWhatsappLine(deal);
      if (sourceLine && !canUserUseWhatsappLine(user, sourceLine)) {
        throw new Error("No estás autorizado a utilizar la línea " + sourceLine.name + ".");
      }

      const now = Date.now();
      const closedReplySource = typeof v2628ReplySource === "function" ? v2628ReplySource(deal, replyToMessageId) : null;
      const newDeal = createDeal(data, {
        jid: deal.jid,
        name: deal.name,
        branchId: deal.branchId,
        lineId: dealLineId(deal),
        source: "closed_recontact",
        now,
      });
      newDeal.ownerUserId = user.id;
      newDeal.ownerName = user.name;
      newDeal.createdByUserId = user.id;
      newDeal.recontactFromDealId = deal.id;
      newDeal.recontactFromStage = deal.stage;
      newDeal.recontactAt = timestamp(now);
      newDeal.updatedAt = timestamp(now + 1);

      try {
        const messageId = await sendProviderText(deal, text, { replyToMessageId: closedReplySource?.id || "" });
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
        recordedDeal.recontactFromDealId = deal.id;
        recordedDeal.recontactFromStage = deal.stage;
        recordedDeal.recontactAt = timestamp(now);

        if (closedReplySource && typeof v2628ReplySnapshot === "function") {
          const storedReply = [...(recordedDeal.messages || [])].reverse().find((message) => String(message?.id || "") === String(messageId || ""));
          if (storedReply) storedReply.replyTo = v2628ReplySnapshot(closedReplySource);
        }

        refreshDealCommercialStatus(recordedDeal, true);
        recordAuditEvent(user, "recontacto_desde_negociacion_cerrada", {
          sourceDealId: deal.id,
          sourceStage: deal.stage,
          newDealId: recordedDeal.id,
          clientId: recordedDeal.clientId,
          clientName: recordedDeal.name,
          lineId: recordedDeal.lineId || null,
        }, recordedDeal.branchId);
        addActivity(data, user.name + " volvió a contactar a " + recordedDeal.name + "; se creó una nueva negociación en Contactado.", "success");
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
          sourceDealId: deal.id,
          createdDealId: recordedDeal.id,
          stage: recordedDeal.stage,
        });
      } catch (error) {
        const index = data.deals.findIndex((entry) => entry.id === newDeal.id && !(entry.messages || []).length);
        if (index >= 0) data.deals.splice(index, 1);
        throw error;
      }
    }
`;

export function applyV2638CoreUiPatches(source) {
  if (source.includes(UI_MARKER)) return source;
  if (!source.includes("// V26.28 EMOJI_MESSAGE_REPLIES")) throw new Error("V26.38 requiere V26.28 aplicado antes en el frontend.");
  let patched = source;

  patched = replaceOnce(
    patched,
    '  const canManage = open && (!deal.ownerUserId || deal.ownerUserId === user.id || user.role === "admin" || managerCoverage);\n  const canCommunicate = canManage || (open && Boolean(temporaryCommunication));\n  const canWork = canManage;',
    '  const canManage = open && (!deal.ownerUserId || deal.ownerUserId === user.id || user.role === "admin" || managerCoverage);\n  const canRecontactClosed = ["won", "lost"].includes(deal.stage) && (!deal.ownerUserId || deal.ownerUserId === user.id || ["admin", "manager", "supervisor"].includes(user.role));\n  const canCommunicate = canManage || (open && Boolean(temporaryCommunication));\n  const canSendText = canCommunicate || canRecontactClosed;\n  const canWork = canManage;\n  ' + UI_MARKER,
    "permisos de recontacto en drawer",
  );

  patched = replaceOnce(
    patched,
    '  $("#manual-message").disabled = !canCommunicate;\n  $("#message-form button").disabled = !canCommunicate;\n  $("#attach-button").disabled = !canCommunicate;\n  $("#record-audio-button").disabled = !canCommunicate;',
    '  $("#manual-message").disabled = !canSendText;\n  $("#manual-message").placeholder = canRecontactClosed ? "Escribí para volver a contactar; se creará una nueva negociación…" : "Escribí un mensaje…";\n  $("#message-form button").disabled = !canSendText;\n  $("#message-form button").title = canRecontactClosed ? "Enviar y crear una nueva negociación en Contactado" : "Enviar mensaje";\n  $("#attach-button").disabled = !canCommunicate;\n  $("#record-audio-button").disabled = !canCommunicate;',
    "habilitación de texto en cerrados",
  );

  const submitMarker = '$("#message-form").addEventListener("submit"';
  patched = replaceFirstAfter(
    patched,
    submitMarker,
    "    const next = await api(",
    "    const result = await api(",
    "respuesta API del formulario de mensajes",
  );
  patched = replaceFirstAfter(
    patched,
    submitMarker,
    "    setState(next);",
    "    setState(result.state || result);\n    if (result.createdDealId) selectedDealId = result.createdDealId;",
    "actualización de estado después del envío",
  );
  patched = replaceFirstAfter(
    patched,
    submitMarker,
    '    showToast("Mensaje enviado");',
    '    if (result.createdDealId) { renderDrawer(); showToast("Mensaje enviado · nueva negociación creada en Contactado"); }\n    else showToast("Mensaje enviado");',
    "confirmación de recontacto",
  );

  return patched;
}

export function applyV2638ServerPatches(source) {
  if (source.includes(SERVER_MARKER)) return source;
  if (!source.includes("// V26.28 MESSAGE_REPLY_PROVIDER")) throw new Error("V26.38 requiere V26.28 aplicado antes en el servidor.");
  const routeMarker = 'app.post("/api/deals/:id/message"';
  return replaceFirstAfter(
    source,
    routeMarker,
    '    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");',
    CLOSED_RECONTACT_BRANCH.trimEnd() + "\n    " + SERVER_MARKER,
    "validación inicial de la ruta de mensajes",
  );
}
