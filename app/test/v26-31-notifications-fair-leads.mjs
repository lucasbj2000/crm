import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "..");
const patch = await readFile(path.join(app, "lib", "v26-31-notifications-fair-leads-patches.mjs"), "utf8");
const server = await readFile(path.join(app, "server.mjs"), "utf8");
const sw = await readFile(path.join(app, "public", "sw.js"), "utf8");

for (const marker of [
  "V26.31 PUSH_FAIR_LEADS",
  "function v2631ChooseFairActiveOwner",
  "attendanceStatus(user) === \"active\"",
  "lastSequenceByUser",
  "fair_active_round_robin",
  "v2631DistributePendingLeads",
  "/api/push/public-key",
  "/api/push/subscribe",
  "/api/push/notifications/next",
  "v2631VapidAuthorization",
]) assert.ok(patch.includes(marker), "Falta contrato V26.31: " + marker);

for (const marker of ["applyV2631CoreUiPatches", "applyV2631ServerPatches"]) {
  assert.ok(server.includes(marker), "server.mjs no integra V26.31: " + marker);
}

for (const marker of [
  "whatsbot-mobile-v26-31-push-shell",
  "self.addEventListener(\"push\"",
  "self.addEventListener(\"notificationclick\"",
  "ICIIA_OPEN_DEAL",
  "/api/push/notifications/next",
]) assert.ok(sw.includes(marker), "Service Worker sin V26.31: " + marker);

const activeAgents = [
  { id: "a", name: "Agente A" },
  { id: "b", name: "Agente B" },
  { id: "c", name: "Agente C" },
];
const state = { sequence: 0, lastSequenceByUser: {} };
const assigned = [];
for (let i = 0; i < 6; i += 1) {
  const candidates = activeAgents.slice().sort((x, y) =>
    Number(state.lastSequenceByUser[x.id] || 0) - Number(state.lastSequenceByUser[y.id] || 0)
    || x.name.localeCompare(y.name, "es")
  );
  const owner = candidates[0];
  state.sequence += 1;
  state.lastSequenceByUser[owner.id] = state.sequence;
  assigned.push(owner.id);
}
assert.deepEqual(assigned, ["a", "b", "c", "a", "b", "c"]);
const counts = Object.fromEntries(activeAgents.map((agent) => [agent.id, assigned.filter((id) => id === agent.id).length]));
assert.deepEqual(counts, { a: 2, b: 2, c: 2 });

console.log("OK · V26.31 Web Push y distribución igualitaria validados.");
