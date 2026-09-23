import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2617ChatRefreshPatches } from "../lib/v26-17-chat-refresh-patches.mjs";
import { applyV2621CoreUiPatches } from "../lib/v26-21-chat-scroll-bulk-deals-patches.mjs";
import { applyV2623CoreUiPatches } from "../lib/v26-23-deal-amount-patches.mjs";
import { applyV2624CoreUiPatches } from "../lib/v26-24-existing-client-direct-patches.mjs";
import { applyV2625CoreUiPatches } from "../lib/v26-25-agent-messaging-ux-patches.mjs";
import { applyV2626CoreUiPatches } from "../lib/v26-26-messaging-scroll-draft-fix-patches.mjs";
import { applyV2627CoreUiPatches } from "../lib/v26-27-drawer-history-scroll-patches.mjs";
import { applyV2628CoreUiPatches } from "../lib/v26-28-emoji-message-replies-patches.mjs";
import { applyV2628CoreFixPatches } from "../lib/v26-28-core-escape-fix-patches.mjs";
import { applyV2629CoreUiPatches } from "../lib/v26-29-agent-ownership-visibility-patches.mjs";
import { applyV2630CoreUiPatches } from "../lib/v26-30-mobile-location-patches.mjs";
import { applyV2631CoreUiPatches } from "../lib/v26-31-notifications-fair-leads-patches.mjs";
import { applyV2638CoreUiPatches, applyV2638ServerPatches } from "../lib/v26-38-closed-recontact-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

const uiSource = await readFile(path.join(appDir, "public", "app.js"), "utf8");
let ui = applyV2617ChatRefreshPatches(uiSource);
ui = applyV2621CoreUiPatches(ui);
ui = applyV2623CoreUiPatches(ui);
ui = applyV2624CoreUiPatches(ui);
ui = applyV2625CoreUiPatches(ui);
ui = applyV2626CoreUiPatches(ui);
ui = applyV2627CoreUiPatches(ui);
ui = applyV2628CoreUiPatches(ui);
ui = applyV2628CoreFixPatches(ui);
ui = applyV2629CoreUiPatches(ui);
ui = applyV2630CoreUiPatches(ui);
ui = applyV2631CoreUiPatches(ui);
ui = applyV2638CoreUiPatches(ui);

assert.match(ui, /const canRecontactClosed = \["won", "lost"\]\.includes\(deal\.stage\)/, "Ganado y perdido deben admitir recontacto.");
assert.doesNotMatch(ui, /canRecontactClosed[^\n]+ownerUserId/, "El frontend no debe ocultar el recontacto por propietario; el backend valida el acceso real.");
assert.match(ui, /const canSendText = canCommunicate \|\| canRecontactClosed/, "El texto debe habilitarse también en un cierre recontactable.");
assert.match(ui, /#attach-button"\)\.disabled = !canCommunicate/, "Adjuntos deben seguir bloqueados en negociaciones cerradas.");
assert.match(ui, /#record-audio-button"\)\.disabled = !canCommunicate/, "Audio debe seguir bloqueado en negociaciones cerradas.");
assert.match(ui, /const result = await api\(/, "El formulario debe aceptar la respuesta enriquecida de recontacto.");
assert.match(ui, /setState\(result\.state \|\| result\)/, "El estado normal y el recontacto deben compartir el mismo refresco.");
assert.match(ui, /if \(result\.createdDealId\) selectedDealId = result\.createdDealId/, "Después del recontacto la UI debe saltar a la nueva negociación.");
assert.match(ui, /v2628ClearReply/, "V26.38 debe conservar la limpieza de respuestas citadas de V26.28.");
assert.match(ui, /nueva negociación creada en Contactado/, "La UI debe confirmar el nuevo estado.");
const uiGenerated = path.join(appDir, ".v26-38-ui-check.mjs");
await writeFile(uiGenerated, ui, "utf8");
const uiSyntax = spawnSync(process.execPath, ["--check", uiGenerated], { encoding: "utf8" });
await rm(uiGenerated, { force: true });
assert.equal(uiSyntax.status, 0, `El frontend V26.38 debe ser sintácticamente válido: ${uiSyntax.stderr || uiSyntax.stdout}`);

const transformedServerRoute = `
// V26.28 MESSAGE_REPLY_PROVIDER
app.post("/api/deals/:id/message", async (request, response, next) => {
  try {
    const deal = findDeal(data, request.params.id);
    const user = currentUser(request);
    const text = cleanText(request.body?.text, 4000);
    const replyToMessageId = cleanText(request.body?.replyToMessageId, 220);
    if (!deal || !OPEN_STAGES.has(deal.stage)) throw new Error("Negociación no encontrada.");
    const temporaryGrant = v214ActiveCommunicationGrant(deal, user);
    ensureDealOwnership(deal, user, { claim: true, allowTemporaryCommunication: true });
    if (!text) throw new Error("Escribí un mensaje.");
    const replySource = v2628ReplySource(deal, replyToMessageId);
    const messageId = await sendProviderText(deal, text, { replyToMessageId: replySource?.id || "" });
    rememberSeen(messageId);
    recordHumanOutgoing(data, { jid: deal.jid, name: deal.name, text, messageId, userId: user.id, userName: user.name, branchId: deal.branchId, lineId: dealLineId(deal) });
    if (replySource) {
      const storedReply = [...(deal.messages || [])].reverse().find((message) => String(message?.id || "") === String(messageId || ""));
      if (storedReply) storedReply.replyTo = v2628ReplySnapshot(replySource);
    }
    refreshDealCommercialStatus(deal,true);
    await store.save();
    response.json(stateResponse(request));
  } catch (error) { next(error); }
});
`;
const server = applyV2638ServerPatches(transformedServerRoute);
assert.match(server, /!\[STAGES\.WON, STAGES\.LOST\]\.includes\(deal\.stage\)/, "Solo cierres ganados/perdidos deben crear una nueva negociación.");
assert.match(server, /source: "closed_recontact"/, "La nueva negociación debe identificar su origen.");
assert.match(server, /newDeal\.recontactFromDealId = deal\.id/, "Debe conservar referencia al cierre anterior.");
assert.match(server, /newDeal\.ownerUserId = user\.id/, "El agente que recontacta debe quedar como responsable del nuevo caso.");
assert.match(server, /recordedDeal\.stage = STAGES\.CONTACTED/, "La nueva negociación debe quedar en Contactado.");
assert.match(server, /sendProviderText\(deal, text, \{ replyToMessageId: closedReplySource\?\.id \|\| "" \}\)/, "El recontacto debe conservar soporte de cita sobre el historial cerrado.");
assert.match(server, /storedReply\.replyTo = v2628ReplySnapshot\(closedReplySource\)/, "La cita debe persistirse en la nueva negociación.");
assert.match(server, /recontacto_desde_negociacion_cerrada/, "El recontacto debe quedar auditado.");
assert.match(server, /createdDealId: recordedDeal\.id/, "La API debe devolver el nuevo deal para abrirlo inmediatamente.");
assert.match(server, /findIndex\(\(entry\) => entry\.id === newDeal\.id && !\(entry\.messages \|\| \[\]\)\.length\)/, "Un envío fallido no debe dejar una negociación vacía.");
assert.match(server, /const temporaryGrant = v214ActiveCommunicationGrant\(deal, user\)/, "El flujo normal abierto de V26.28 debe permanecer intacto.");

const launcher = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.match(launcher, /applyV2638CoreUiPatches/, "Producción debe activar el frontend V26.38.");
assert.match(launcher, /applyV2638ServerPatches/, "Producción debe activar el backend V26.38.");
assert.ok(launcher.indexOf("applyV2638CoreUiPatches") > launcher.indexOf("applyV2628CoreUiPatches"), "V26.38 UI debe aplicarse después de V26.28.");
assert.ok(launcher.lastIndexOf("applyV2638ServerPatches") > launcher.lastIndexOf("applyV2628ServerPatches"), "V26.38 servidor debe aplicarse después de V26.28.");

console.log("OK · V26.38 recontacto desde cierre compatible con pipeline real y negociación nueva en Contactado.");
