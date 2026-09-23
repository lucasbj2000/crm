import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2638CoreUiPatches, applyV2638ServerPatches } from "../lib/v26-38-closed-recontact-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

const uiSource = await readFile(path.join(appDir, "public", "app.js"), "utf8");
const ui = applyV2638CoreUiPatches(uiSource);
assert.match(ui, /const canRecontactClosed = \["won", "lost"\]\.includes\(deal\.stage\)/, "Ganado y perdido deben admitir recontacto.");
assert.match(ui, /const canSendText = canCommunicate \|\| canRecontactClosed/, "El texto debe habilitarse también en un cierre recontactable.");
assert.match(ui, /#attach-button"\)\.disabled = !canCommunicate/, "Adjuntos deben seguir bloqueados en negociaciones cerradas.");
assert.match(ui, /#record-audio-button"\)\.disabled = !canCommunicate/, "Audio debe seguir bloqueado en negociaciones cerradas.");
assert.match(ui, /if \(result\.createdDealId\) selectedDealId = result\.createdDealId/, "Después del recontacto la UI debe saltar a la nueva negociación.");
assert.match(ui, /nueva negociación creada en Contactado/, "La UI debe confirmar el nuevo estado.");
const uiGenerated = path.join(appDir, ".v26-38-ui-check.mjs");
await writeFile(uiGenerated, ui, "utf8");
const uiSyntax = spawnSync(process.execPath, ["--check", uiGenerated], { encoding: "utf8" });
await rm(uiGenerated, { force: true });
assert.equal(uiSyntax.status, 0, `El frontend V26.38 debe ser sintácticamente válido: ${uiSyntax.stderr || uiSyntax.stdout}`);

const serverSource = await readFile(path.join(appDir, "server-core.mjs"), "utf8");
const server = applyV2638ServerPatches(serverSource);
assert.match(server, /!\[STAGES\.WON, STAGES\.LOST\]\.includes\(sourceDeal\.stage\)/, "Solo cierres ganados/perdidos deben crear una nueva negociación.");
assert.match(server, /source: "closed_recontact"/, "La nueva negociación debe identificar su origen.");
assert.match(server, /newDeal\.recontactFromDealId = sourceDeal\.id/, "Debe conservar referencia al cierre anterior.");
assert.match(server, /recordedDeal\.stage = STAGES\.CONTACTED/, "La nueva negociación debe quedar en Contactado.");
assert.match(server, /recordedDeal\.ownerUserId/, "El flujo debe conservar titularidad del nuevo caso.");
assert.match(server, /recontacto_desde_negociacion_cerrada/, "El recontacto debe quedar auditado.");
assert.match(server, /createdDealId: recordedDeal\.id/, "La API debe devolver el nuevo deal para abrirlo inmediatamente.");
assert.match(server, /findIndex\(\(entry\) => entry\.id === newDeal\.id && !\(entry\.messages \|\| \[\]\)\.length\)/, "Un envío fallido no debe dejar una negociación vacía.");
assert.match(server, /const deal = sourceDeal;/, "El flujo normal de conversaciones abiertas debe conservarse.");
const serverGenerated = path.join(appDir, ".v26-38-server-check.mjs");
await writeFile(serverGenerated, server, "utf8");
const serverSyntax = spawnSync(process.execPath, ["--check", serverGenerated], { encoding: "utf8" });
await rm(serverGenerated, { force: true });
assert.equal(serverSyntax.status, 0, `El servidor V26.38 generado debe ser sintácticamente válido: ${serverSyntax.stderr || serverSyntax.stdout}`);

const launcher = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.match(launcher, /applyV2638CoreUiPatches/, "Producción debe activar el frontend V26.38.");
assert.match(launcher, /applyV2638ServerPatches/, "Producción debe activar el backend V26.38.");

console.log("OK · V26.38 recontacto desde cierre crea negociación nueva en Contactado.");
