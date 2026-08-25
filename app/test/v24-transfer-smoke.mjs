import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInitialData, timestamp } from "../lib/domain.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(here, "..");
const dataDirectory = await mkdtemp(path.join(tmpdir(), "crm-v24-transfer-"));
const port = 4800 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;
const adminPassword = "AdminTest-2026";
const userPassword = "AgentTest-2026";
const hashPassword = (value) => { const salt = randomBytes(16).toString("hex"); return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`; };
const seed = createInitialData();
seed.users = [{ id: "admin_v24", username: "admin", name: "Admin V24", role: "admin", branchId: null, passwordHash: hashPassword(adminPassword), active: true, clientDailyLimit: 100, permissions: {}, createdAt: timestamp(), updatedAt: timestamp() }];
await writeFile(path.join(dataDirectory, "whatsbot-crm.json"), JSON.stringify(seed));

const child = spawn(process.execPath, [path.join(appDirectory, "server.mjs")], {
  cwd: appDirectory,
  env: { ...process.env, PORT: String(port), WHATSBOT_HOST: "127.0.0.1", WHATSAPP_MOCK: "1", NO_OPEN: "1", WHATSBOT_DATA_DIR: dataDirectory, CRM_TENANT_SLUG: "main", CRM_PUBLIC_BASE_URL: base },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
child.stdout.on("data", (chunk) => serverOutput += chunk);
child.stderr.on("data", (chunk) => serverOutput += chunk);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const waitForServer = async () => { const deadline = Date.now() + 25_000; while (Date.now() < deadline) { try { const r = await fetch(`${base}/api/health`); if (r.ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 150)); } throw new Error(`El servidor no inició.\n${serverOutput}`); };
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

try {
  await waitForServer();
  await login("admin", adminPassword);
  let state = await api("/api/state");
  const primaryBranch = state.branches.find((b) => b.isLocal) || state.branches[0];
  const primaryLine = state.whatsappLines.find((l) => l.branchId === primaryBranch.id && l.isDefault) || state.whatsappLines.find((l) => l.branchId === primaryBranch.id);
  assert(primaryBranch && primaryLine, "Falta la sucursal o línea principal.");

  state = await api("/api/branches", { method: "POST", body: { name: "Sucursal Destino", code: "DEST", city: "Asunción" } });
  const targetBranch = state.branches.find((b) => b.code === "DEST");
  const targetLine = state.whatsappLines.find((l) => l.branchId === targetBranch.id);
  assert(targetBranch && targetLine, "No se creó la sucursal/línea destino.");

  const createUser = async (username, name, branchId, whatsappLineIds) => {
    state = await api("/api/users", { method: "POST", body: { username, name, password: userPassword, role: "agent", branchId, clientDailyLimit: 50, whatsappLineIds } });
    const user = state.users.find((u) => u.username === username);
    assert(user, `No se creó ${username}.`);
    return user;
  };
  const source = await createUser("origen.v24", "Agente Origen", primaryBranch.id, [primaryLine.id]);
  const sameLineTarget = await createUser("destino.misma", "Destino Misma Línea", targetBranch.id, [primaryLine.id]);
  const otherLineTarget = await createUser("destino.otra", "Destino Otra Línea", targetBranch.id, [targetLine.id]);

  const createOwnedDeal = async (phone, name) => {
    await login("admin", adminPassword);
    const created = await api("/api/clients", { method: "POST", body: { name, phone, branchId: primaryBranch.id } });
    const deal = created.deals.find((d) => String(d.phone || d.jid).includes(phone.replace(/\D/g, "")));
    assert(deal, `No se creó negociación para ${phone}.`);
    await api(`/api/deals/${encodeURIComponent(deal.id)}/assign`, { method: "POST", body: { userId: source.id } });
    return deal.id;
  };

  const sameDealId = await createOwnedDeal("+595981111111", "Cliente Misma Línea");
  await login(source.username, userPassword);
  const sameTransfer = await api(`/api/deals/${encodeURIComponent(sameDealId)}/transfer`, { method: "POST", body: { userId: sameLineTarget.id, keepAsObserver: true } });
  assert(sameTransfer.lineChanged === false, "Una derivación a usuario con la misma línea cambió de número.");
  assert(sameTransfer.observer === true, "No se activó el observador solicitado.");
  let sourceState = await api("/api/state");
  const sameVisible = sourceState.deals.find((d) => d.id === sameDealId);
  assert(sameVisible, "El agente origen perdió la vista pese a quedar como observador.");
  assert(sameVisible.ownerUserId === sameLineTarget.id, "No cambió el responsable en la derivación de misma línea.");
  assert(sameVisible.lineId === primaryLine.id, "La derivación de misma línea no conservó el número actual.");

  const changedDealId = await createOwnedDeal("+595982222222", "Cliente Cambio Línea");
  await login(source.username, userPassword);
  const changedTransfer = await api(`/api/deals/${encodeURIComponent(changedDealId)}/transfer`, { method: "POST", body: { userId: otherLineTarget.id, keepAsObserver: false } });
  assert(changedTransfer.lineChanged === true, "La derivación a un usuario sin la línea actual no cambió de número.");
  assert(changedTransfer.introSent === true, "No se registró la presentación automática al cambiar de número en modo mock.");
  sourceState = await api("/api/state");
  assert(!sourceState.deals.some((d) => d.id === changedDealId), "El agente origen siguió viendo el caso sin ser observador.");

  await login("admin", adminPassword);
  const adminState = await api("/api/state");
  const changedDeal = adminState.deals.find((d) => d.id === changedDealId);
  assert(changedDeal?.ownerUserId === otherLineTarget.id, "El nuevo responsable no quedó asignado.");
  assert(changedDeal?.lineId === targetLine.id, "La negociación no quedó vinculada a la nueva línea.");
  assert((changedDeal?.messages || []).some((m) => m.origin === "transfer-intro"), "No quedó trazabilidad de la presentación de cambio de número.");

  await login(sameLineTarget.username, userPassword);
  await api(`/api/deals/${encodeURIComponent(sameDealId)}/won`, { method: "POST", body: {} });
  await login(source.username, userPassword);
  sourceState = await api("/api/state");
  assert(!sourceState.deals.some((d) => d.id === sameDealId), "El observador conservó acceso después de cerrar el caso.");

  console.log("OK · derivación misma línea, cambio de línea, presentación y observador temporal verificados.");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => { child.once("exit", resolve); setTimeout(resolve, 3000).unref(); });
  await rm(dataDirectory, { recursive: true, force: true });
}
