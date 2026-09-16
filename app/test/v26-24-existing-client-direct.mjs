import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInitialData, timestamp } from "../lib/domain.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(here, "..");
const dataDirectory = await mkdtemp(path.join(tmpdir(), "crm-v2624-client-"));
const port = 6240 + Math.floor(Math.random() * 200);
const base = `http://127.0.0.1:${port}`;
const adminPassword = "AdminTest-2624";
const agentPassword = "AgentTest-2624";
const hashPassword = (value) => { const salt = randomBytes(16).toString("hex"); return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`; };
const seed = createInitialData();
seed.users = [{ id: "admin_2624", username: "admin", name: "Admin V26.24", role: "admin", branchId: null, passwordHash: hashPassword(adminPassword), active: true, clientDailyLimit: 100, permissions: {}, createdAt: timestamp(), updatedAt: timestamp() }];
await writeFile(path.join(dataDirectory, "whatsbot-crm.json"), JSON.stringify(seed));

const child = spawn(process.execPath, [path.join(appDirectory, "server.mjs")], {
  cwd: appDirectory,
  env: { ...process.env, PORT: String(port), WHATSBOT_HOST: "127.0.0.1", WHATSAPP_MOCK: "1", NO_OPEN: "1", WHATSBOT_DATA_DIR: dataDirectory, CRM_TENANT_SLUG: "v2624", CRM_PUBLIC_BASE_URL: base },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
child.stdout.on("data", (chunk) => serverOutput += chunk);
child.stderr.on("data", (chunk) => serverOutput += chunk);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const waitForServer = async () => { const deadline = Date.now() + 25_000; while (Date.now() < deadline) { try { const response = await fetch(`${base}/api/health`); if (response.ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 150)); } throw new Error(`El servidor no inició.\n${serverOutput}`); };
let cookie = "";
async function login(username, password) {
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
  assert(response.ok, `No se pudo iniciar sesión con ${username}.`);
  cookie = String(response.headers.get("set-cookie") || "").split(";")[0];
}
async function api(url, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${url}: ${payload.error || response.status}`);
  return payload;
}
async function rawApi(url, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

try {
  await waitForServer();
  await login("admin", adminPassword);
  let state = await api("/api/state");
  const branchA = state.branches.find((branch) => branch.isLocal) || state.branches[0];
  assert(branchA, "Falta la sucursal principal.");

  state = await api("/api/branches", { method: "POST", body: { name: "Sucursal B", code: "BRB", city: "San Lorenzo" } });
  const branchB = state.branches.find((branch) => branch.code === "BRB");
  assert(branchB, "No se creó la segunda sucursal.");

  const createUser = async (username, name, branchId) => {
    state = await api("/api/users", { method: "POST", body: { username, name, password: agentPassword, role: "agent", branchId, clientDailyLimit: 50 } });
    const user = state.users.find((entry) => entry.username === username);
    assert(user, `No se creó ${username}.`);
    return user;
  };

  const agentA = await createUser("agente.a.2624", "Agente A", branchA.id);
  const agentB = await createUser("agente.b.2624", "Agente B", branchB.id);
  const agentC = await createUser("agente.c.2624", "Agente C", branchB.id);
  const phone = "+595981262424";

  await login(agentA.username, agentPassword);
  state = await api("/api/clients", { method: "POST", body: { name: "Cliente Compartido", phone } });
  const dealA = state.deals.find((deal) => deal.name === "Cliente Compartido" && deal.branchId === branchA.id);
  assert(dealA?.ownerUserId === agentA.id, "La negociación inicial no quedó asignada al agente A.");
  const clientId = dealA.clientId;

  await login(agentB.username, agentPassword);
  const lookupB = await api("/api/clients/lookup", { method: "POST", body: { phone } });
  assert(lookupB.found === true, "No se detectó el cliente existente desde la otra sucursal.");
  assert(lookupB.action === "direct_available", "Otra sucursal debería poder iniciar una conversación directa.");
  assert(lookupB.assignments.some((entry) => entry.branchId === branchA.id && entry.ownerUserId === agentA.id), "No se informó el responsable de la sucursal original.");

  const directB = await api(`/api/clients/${encodeURIComponent(clientId)}/direct-conversation`, { method: "POST", body: { phone } });
  assert(directB.dealId, "No se creó/abrió la conversación directa de la sucursal B.");
  assert(directB.state.deals.some((deal) => deal.id === directB.dealId && deal.branchId === branchB.id && deal.ownerUserId === agentB.id), "La conversación directa no quedó asignada al agente B en su sucursal.");

  await login(agentC.username, agentPassword);
  const lookupC = await api("/api/clients/lookup", { method: "POST", body: { phone } });
  assert(lookupC.action === "blocked_same_branch", "Un segundo agente de la misma sucursal debería quedar bloqueado.");
  assert(lookupC.currentBranchOwner?.ownerUserId === agentB.id, "No se informó al agente B como responsable actual.");
  const denied = await rawApi(`/api/clients/${encodeURIComponent(clientId)}/direct-conversation`, { method: "POST", body: { phone } });
  assert(denied.response.status === 409, "La toma directa por otro agente de la misma sucursal no fue bloqueada.");

  await login(agentB.username, agentPassword);
  const lookupMine = await api("/api/clients/lookup", { method: "POST", body: { phone } });
  assert(lookupMine.action === "open_mine", "El responsable actual debería poder abrir su conversación directamente.");
  const reopened = await api(`/api/clients/${encodeURIComponent(clientId)}/direct-conversation`, { method: "POST", body: { phone } });
  assert(reopened.reused === true && reopened.dealId === directB.dealId, "Abrir mi cliente debería reutilizar la negociación abierta.");

  await login("admin", adminPassword);
  const adminState = await api("/api/state");
  const related = adminState.deals.filter((deal) => deal.clientId === clientId && [branchA.id, branchB.id].includes(deal.branchId));
  assert(related.some((deal) => deal.branchId === branchA.id && deal.ownerUserId === agentA.id), "La conversación de la sucursal original fue alterada.");
  assert(related.some((deal) => deal.branchId === branchB.id && deal.ownerUserId === agentB.id), "Falta la conversación independiente de la segunda sucursal.");

  console.log("OK · cliente existente: responsable visible, bloqueo misma sucursal y conversación directa entre sucursales validados.");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => { child.once("exit", resolve); setTimeout(resolve, 3000).unref(); });
  await rm(dataDirectory, { recursive: true, force: true });
}
