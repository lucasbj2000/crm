import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyV2617ChatRefreshPatches } from "../lib/v26-17-chat-refresh-patches.mjs";
import { applyV2621CoreUiPatches, applyV2621InboxUiPatches, applyV2621ServerPatches } from "../lib/v26-21-chat-scroll-bulk-deals-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

const rawApp = await readFile(path.join(appDir, "public", "app.js"), "utf8");
const rawInbox = await readFile(path.join(appDir, "public", "v25-11.js"), "utf8");
const rawServer = await readFile(path.join(appDir, "server-core.mjs"), "utf8");
const serverEntry = await readFile(path.join(appDir, "server.mjs"), "utf8");

const coreUi = applyV2621CoreUiPatches(applyV2617ChatRefreshPatches(rawApp));
const inboxUi = applyV2621InboxUiPatches(rawInbox);
const server = applyV2621ServerPatches(rawServer);

assert.match(coreUi, /V26\.21 BULK_DEAL_DELETE_UI/, "Debe instalar la interfaz de eliminación masiva.");
assert.match(coreUi, /v2621SelectedDealIds/, "Debe mantener selección múltiple de negociaciones.");
assert.match(coreUi, /Seleccionar visibles/, "Debe permitir seleccionar todas las negociaciones visibles.");
assert.match(coreUi, /\/api\/deals\/bulk-delete/, "La interfaz debe usar el endpoint masivo.");
assert.match(coreUi, /Solo un administrador puede eliminar negociaciones masivamente/, "La interfaz debe restringir la acción destructiva al administrador.");
assert.match(coreUi, /v2621BulkDealMode/, "El clic sobre una tarjeta debe poder operar en modo selección.");

assert.match(inboxUi, /V26\.21 CHAT_ALWAYS_LATEST/, "Debe instalar el autoscroll de conversación.");
assert.match(inboxUi, /MutationObserver/, "Debe detectar inserciones reales de mensajes sin depender del polling.");
assert.match(inboxUi, /v2621TrackConversationTail\(true\)/, "Al abrir una conversación debe ir al último mensaje.");
assert.match(inboxUi, /rows\.length > v2621ObservedMessageCount/, "Un nuevo mensaje debe disparar el salto al final.");
assert.match(inboxUi, /messages\.scrollTop = messages\.scrollHeight/, "Debe llevar el panel al último mensaje.");

assert.match(server, /V26\.21 BULK_DEAL_DELETE_API/, "Debe instalar el endpoint masivo.");
assert.match(server, /app\.post\("\/api\/deals\/bulk-delete", requireAdmin/, "Solo administración debe poder borrar masivamente.");
assert.match(server, /releaseDealReservations\(data, deal/, "Debe liberar reservas activas antes de eliminar.");
assert.match(server, /data\.deals = \(data\.deals \|\| \[\]\)\.filter/, "Debe retirar del CRM las negociaciones elegidas.");
assert.match(server, /negociaciones_eliminadas_masivamente/, "Debe dejar auditoría de la eliminación.");
assert.match(serverEntry, /applyV2621CoreUiPatches/, "server.mjs debe aplicar V26.21 al app principal.");
assert.match(serverEntry, /applyV2621InboxUiPatches/, "server.mjs debe aplicar V26.21 a la bandeja antes de V26.14.");
assert.ok(serverEntry.indexOf("applyV2621InboxUiPatches") < serverEntry.indexOf('await import("./lib/v26-14-performance-patches.mjs")'), "El autoscroll debe entrar antes de que V26.14 capture el bundle.");
assert.match(serverEntry, /patched = applyV2621ServerPatches\(patched\)/, "server.mjs debe aplicar el endpoint V26.21.");

assert.equal(applyV2621CoreUiPatches(coreUi), coreUi, "El parche principal debe ser idempotente.");
assert.equal(applyV2621InboxUiPatches(inboxUi), inboxUi, "El parche de bandeja debe ser idempotente.");
assert.equal(applyV2621ServerPatches(server), server, "El parche de servidor debe ser idempotente.");

for (const [name, source] of [["core-ui", coreUi], ["inbox-ui", inboxUi], ["server-core", server]]) {
  const target = path.join(appDir, `.v26-21-${name}-check.mjs`);
  await writeFile(target, source, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", target], { encoding: "utf8" });
  await rm(target, { force: true });
  assert.equal(syntax.status, 0, `${name} debe quedar con sintaxis JavaScript válida: ${syntax.stderr || syntax.stdout}`);
}

console.log("OK · V26.21 autoscroll al último mensaje y eliminación masiva de negociaciones validados.");
