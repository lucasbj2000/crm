import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialData, timestamp } from "../lib/domain.mjs";
import { applyV254ServerPatches } from "../lib/v25-4-server-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "..");
const core = await readFile(path.join(app, "server-core.mjs"), "utf8");
const patched = applyV254ServerPatches(core);
const ui = await readFile(path.join(app, "public", "v25-4.js"), "utf8");
const hotfix = await readFile(path.join(app, "public", "v25-4-1.js"), "utf8");
const css = await readFile(path.join(app, "public", "v25-4.css"), "utf8");
const loader = await readFile(path.join(app, "public", "v22.js"), "utf8");
const sw = await readFile(path.join(app, "public", "sw.js"), "utf8");

for (const marker of [
  'app.delete("/api/deals/:id", requireAdmin',
  'app.delete("/api/clients/:id", requireAdmin',
  'releaseDealReservations(data, deal',
  'requiresCascade: true',
  'v254AuditDeletion',
]) assert.ok(patched.includes(marker), `Falta backend V25.4: ${marker}`);

for (const marker of [
  "Contactos y Fichas 360°",
  "data-v254-contacts-nav",
  "Negociaciones vinculadas",
  "data-v254-delete-deal",
  "data-v254-delete-client",
  "/api/deals/${encodeURIComponent(dealId)}",
  "/api/clients/${encodeURIComponent(clientId)}?cascade=1",
]) assert.ok(ui.includes(marker), `Falta UI V25.4: ${marker}`);

for (const marker of [
  '/api/auth/status',
  'serverRole === "admin"',
  'v2541-deal-admin-bar',
  'v2541-client-admin-bar',
  'Eliminar negociación',
  'Eliminar ficha completa',
  'data-v2541-delete-deal',
  'data-v2541-delete-client',
  '/api/deals/${encodeURIComponent(dealId)}',
  '/api/clients/${encodeURIComponent(clientId)}?cascade=1',
]) assert.ok(hotfix.includes(marker), `Falta hotfix V25.4.1: ${marker}`);

assert.ok(css.includes(".v254-contact-layout") && css.includes(".v2541-admin-bar") && css.includes("@media(max-width:600px)"), "Contactos/acciones admin V25.4.1 no tienen layout responsive.");
assert.ok(loader.includes('/v25-4.css?v=25.4.1') && loader.includes('/v25-4.js?v=25.4') && loader.includes('/v25-4-1.js?v=25.4.1'), "El loader no carga V25.4.1.");
assert.ok(sw.includes('whatsbot-mobile-v25-4-1-production-shell') && sw.includes('/v25-4-1.js'), "El service worker no renueva V25.4.1.");

const dir = await mkdtemp(path.join(tmpdir(), "crm-v254-delete-"));
const port = 5900 + Math.floor(Math.random() * 200);
const base = `http://127.0.0.1:${port}`;
const password = "V25.4-Delete-Test";
const salt = randomBytes(16).toString("hex");
const hash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const data = createInitialData();
data.users = [
  { id: "admin_v254", username: "admin", name: "Admin V25.4", role: "admin", branchId: null, passwordHash: hash, active: true, clientDailyLimit: 100, permissions: {}, createdAt: timestamp(), updatedAt: timestamp() },
  { id: "agent_v254", username: "agent", name: "Agente V25.4", role: "agent", branchId: null, passwordHash: hash, active: true, clientDailyLimit: 100, permissions: {}, createdAt: timestamp(), updatedAt: timestamp() },
];
await writeFile(path.join(dir, "whatsbot-crm.json"), JSON.stringify(data));

const child = spawn(process.execPath, [path.join(app, "server.mjs")], {
  cwd: app,
  env: { ...process.env, PORT: String(port), WHATSBOT_HOST: "127.0.0.1", WHATSBOT_DATA_DIR: dir, WHATSAPP_MOCK: "1", NO_OPEN: "1", CRM_TENANT_SLUG: "v254-delete-test", CRM_PUBLIC_BASE_URL: base },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (x) => output += x);
child.stderr.on("data", (x) => output += x);

async function wait() {
  const until = Date.now() + 25000;
  while (Date.now() < until) {
    try { const response = await fetch(`${base}/api/health`); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Servidor no inició.\n${output}`);
}

async function login(username) {
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
  assert.equal(response.ok, true, `No inició sesión ${username}.`);
  return String(response.headers.get("set-cookie") || "").split(";")[0];
}

async function api(cookie, url, { method = "GET", body } = {}) {
  const response = await fetch(`${base}${url}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

try {
  await wait();
  const adminCookie = await login("admin");
  const agentCookie = await login("agent");

  const adminStatus = await api(adminCookie, "/api/auth/status");
  assert.equal(adminStatus.payload?.user?.role, "admin", "auth/status no identifica correctamente al administrador para V25.4.1.");
  const agentStatus = await api(agentCookie, "/api/auth/status");
  assert.equal(agentStatus.payload?.user?.role, "agent", "auth/status no identifica correctamente al agente para V25.4.1.");

  const initialState = (await api(adminCookie, "/api/state")).payload;
  const lineId = initialState.whatsappLines?.[0]?.id;

  const firstIncoming = await api(adminCookie, "/api/mock/incoming", { method: "POST", body: { phone: "595981254001", name: "Cliente Borrado Deal", text: "Consulta uno", lineId } });
  assert.equal(firstIncoming.response.ok, true, "No se creó negociación de prueba V25.4.");
  const firstDeal = firstIncoming.payload.deals.find((deal) => String(deal.phone || deal.jid).includes("595981254001"));
  assert.ok(firstDeal, "No se encontró negociación creada V25.4.");

  const forbidden = await api(agentCookie, `/api/deals/${encodeURIComponent(firstDeal.id)}`, { method: "DELETE" });
  assert.equal(forbidden.response.status, 403, "Un agente pudo eliminar una negociación.");

  const deletedDeal = await api(adminCookie, `/api/deals/${encodeURIComponent(firstDeal.id)}`, { method: "DELETE" });
  assert.equal(deletedDeal.response.ok, true, "El administrador no pudo eliminar una negociación.");
  let state = (await api(adminCookie, "/api/state")).payload;
  assert.equal(state.deals.some((deal) => deal.id === firstDeal.id), false, "La negociación sigue presente luego de eliminarla.");

  const secondIncoming = await api(adminCookie, "/api/mock/incoming", { method: "POST", body: { phone: "595981254002", name: "Cliente Borrado Ficha", text: "Consulta dos", lineId } });
  assert.equal(secondIncoming.response.ok, true, "No se creó segunda negociación V25.4.");
  const secondDeal = secondIncoming.payload.deals.find((deal) => String(deal.phone || deal.jid).includes("595981254002"));
  assert.ok(secondDeal?.clientId, "La segunda negociación no quedó vinculada a cliente.");

  const noCascade = await api(adminCookie, `/api/clients/${encodeURIComponent(secondDeal.clientId)}`, { method: "DELETE" });
  assert.equal(noCascade.response.status, 409, "La ficha con negociaciones se eliminó sin confirmación cascade.");
  assert.equal(noCascade.payload.requiresCascade, true, "El servidor no pidió confirmación de eliminación total.");

  const deletedClient = await api(adminCookie, `/api/clients/${encodeURIComponent(secondDeal.clientId)}?cascade=1`, { method: "DELETE" });
  assert.equal(deletedClient.response.ok, true, "El administrador no pudo eliminar la ficha completa.");
  assert.equal(deletedClient.payload.deletedNegotiations, 1, "No se informó la negociación vinculada eliminada.");
  state = (await api(adminCookie, "/api/state")).payload;
  assert.equal(state.clients.some((client) => client.id === secondDeal.clientId), false, "La ficha sigue presente luego del borrado total.");
  assert.equal(state.deals.some((deal) => deal.clientId === secondDeal.clientId), false, "Quedaron negociaciones huérfanas tras eliminar la ficha.");

  console.log("OK · V25.4.1 Contactos + visibilidad admin + eliminación segura validada.");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => { child.once("exit", resolve); setTimeout(resolve, 3000).unref(); });
  await rm(dir, { recursive: true, force: true });
}
