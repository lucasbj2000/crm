import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  STAGES,
  createDeal,
  createInitialData,
  recordBotOutgoing,
  recordHumanOutgoing,
  timestamp,
} from "../lib/domain.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(here, "..");
const dataDirectory = await mkdtemp(path.join(tmpdir(), "crm-v2634-"));
const port = 6340 + Math.floor(Math.random() * 120);
const base = `http://127.0.0.1:${port}`;

const hashPassword = (value) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`;
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// Contract: BOT must not move a NEW negotiation to CONTACTED; a human reply must.
{
  const domainData = createInitialData();
  const branchId = domainData.branches[0].id;
  const deal = createDeal(domainData, {
    jid: "595981340001@s.whatsapp.net",
    name: "Cliente Bot",
    branchId,
    source: "test",
  });
  recordBotOutgoing(domainData, { deal, text: "Respuesta automática", messageId: "bot_1", origin: "bot" });
  assert(deal.stage === STAGES.NEW, "Una respuesta del bot movió la negociación fuera de NUEVOS.");
  recordHumanOutgoing(domainData, {
    jid: deal.jid,
    name: deal.name,
    text: "Retorno humano",
    messageId: "human_1",
    userId: "agent_test",
    userName: "Agente Test",
    branchId,
  });
  assert(deal.stage === STAGES.CONTACTED, "La respuesta humana no movió la negociación a CONTACTADO.");
}

const seed = createInitialData();
const branchId = seed.branches[0].id;
const adminPassword = "Admin-2634!";
const agentAPassword = "AgentA-2634!";
const agentBPassword = "AgentB-2634!";
const now = timestamp();
seed.users = [
  {
    id: "admin_2634", username: "admin", name: "Admin V26.34", role: "admin", branchId: null,
    passwordHash: hashPassword(adminPassword), active: true, clientDailyLimit: 100, permissions: {},
    createdAt: now, updatedAt: now,
  },
  {
    id: "agent_a_2634", username: "agentea", name: "Agente Origen", role: "agent", branchId,
    passwordHash: hashPassword(agentAPassword), active: true, clientDailyLimit: 100, permissions: {},
    attendance: { status: "active", updatedAt: now }, createdAt: now, updatedAt: now,
  },
  {
    id: "agent_b_2634", username: "agenteb", name: "Agente Destino", role: "agent", branchId,
    passwordHash: hashPassword(agentBPassword), active: true, clientDailyLimit: 100, permissions: {},
    attendance: { status: "active", updatedAt: now }, createdAt: now, updatedAt: now,
  },
];

const deal = createDeal(seed, {
  jid: "595981340099@s.whatsapp.net",
  name: "Cliente Transferido",
  branchId,
  source: "manual",
});
deal.ownerUserId = "agent_a_2634";
deal.ownerName = "Agente Origen";
const client = seed.clients.find((entry) => entry.id === deal.clientId);
if (client) {
  client.ownerUserId = deal.ownerUserId;
  client.ownerName = deal.ownerName;
  client.branchOwners = { ...(client.branchOwners || {}), [branchId]: { userId: deal.ownerUserId, userName: deal.ownerName, updatedAt: now } };
}
await writeFile(path.join(dataDirectory, "whatsbot-crm.json"), JSON.stringify(seed));

let child = null;
let serverOutput = "";
const startServer = async () => {
  serverOutput = "";
  child = spawn(process.execPath, [path.join(appDirectory, "server.mjs")], {
    cwd: appDirectory,
    env: {
      ...process.env,
      PORT: String(port),
      WHATSBOT_HOST: "127.0.0.1",
      WHATSAPP_MOCK: "1",
      NO_OPEN: "1",
      WHATSBOT_DATA_DIR: dataDirectory,
      CRM_TENANT_SLUG: "v2634",
      CRM_PUBLIC_BASE_URL: base,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => serverOutput += chunk);
  child.stderr.on("data", (chunk) => serverOutput += chunk);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`El servidor no inició.\n${serverOutput}`);
};
const stopServer = async () => {
  if (!child) return;
  const current = child;
  child = null;
  current.kill("SIGTERM");
  await new Promise((resolve) => {
    current.once("exit", resolve);
    setTimeout(resolve, 4000).unref();
  });
};

let cookie = "";
async function login(username, password) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const payload = await response.json().catch(() => ({}));
  assert(response.ok, `Login falló para ${username}: ${payload.error || response.status}`);
  cookie = String(response.headers.get("set-cookie") || "").split(";")[0];
  return payload;
}
async function api(url, { method = "GET", body } = {}) {
  const headers = cookie ? { cookie } : {};
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${base}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${url}: ${payload.error || response.status}`);
  return payload;
}

try {
  await startServer();

  // Persistent session: login once, restart the process, keep the same cookie.
  await login("admin", adminPassword);
  const adminCookie = cookie;
  await new Promise((resolve) => setTimeout(resolve, 700));
  await stopServer();
  await startServer();
  cookie = adminCookie;
  const statusAfterRestart = await api("/api/auth/status");
  assert(statusAfterRestart.authenticated === true, "La sesión se perdió después de reiniciar el proceso del CRM.");
  assert(statusAfterRestart.user?.id === "admin_2634", "La sesión restaurada pertenece a otro usuario.");

  // Same-branch transfer remains visibly pending until target agent replies.
  await login("agentea", agentAPassword);
  await api(`/api/deals/${encodeURIComponent(deal.id)}/transfer`, {
    method: "POST",
    body: { userId: "agent_b_2634" },
  });

  await login("agenteb", agentBPassword);
  let state = await api("/api/state");
  let transferred = state.deals.find((entry) => entry.id === deal.id);
  assert(transferred?.ownerUserId === "agent_b_2634", "La transferencia no dejó al agente destino como responsable.");
  assert(transferred?.transferPending?.active === true, "La ficha no conserva la marca de transferencia pendiente.");
  assert(transferred?.stage === STAGES.NEW, "Transferir sin respuesta humana cambió indebidamente la etapa.");

  await api(`/api/deals/${encodeURIComponent(deal.id)}/message`, {
    method: "POST",
    body: { text: "Buen día, retomo tu consulta." },
  });
  state = await api("/api/state");
  transferred = state.deals.find((entry) => entry.id === deal.id);
  assert(transferred?.stage === STAGES.CONTACTED, "El retorno del agente destino no pasó a CONTACTADO.");
  assert(transferred?.transferPending?.active === false, "La marca de transferencia no desapareció después del retorno humano.");

  // Admin-only visual movement history.
  await login("admin", adminPassword);
  const historyResult = await api(`/api/deals/${encodeURIComponent(deal.id)}/history`);
  assert(Array.isArray(historyResult.history) && historyResult.history.length >= 2, "El historial administrativo no contiene movimientos.");
  assert(historyResult.history.some((event) => event.action === "conversacion_transferida"), "El historial no registra la transferencia.");
  assert(historyResult.history.some((event) => event.action === "mensaje_enviado"), "El historial no registra el retorno del agente.");

  const appJs = await readFile(path.join(appDirectory, "public", "app.js"), "utf8");
  const indexHtml = await readFile(path.join(appDirectory, "public", "index.html"), "utf8");
  const styles = await readFile(path.join(appDirectory, "public", "styles.css"), "utf8");
  const serverCore = await readFile(path.join(appDirectory, "server-core.mjs"), "utf8");

  assert(appJs.includes("dealSearchQuery") && appJs.includes("searchInput.value !== dealSearchQuery"), "El buscador no usa estado controlado.");
  assert(indexHtml.includes('autocomplete="off"') && indexHtml.includes('name="crm-deal-search"'), "El buscador no bloquea restauración/autocompletado del navegador.");
  assert(styles.includes("V26.34 · selección de texto") && styles.includes("user-select: text !important"), "Los mensajes no quedaron seleccionables/copiables.");
  assert(indexHtml.includes('id="transfer-pending-section"'), "Falta el aviso visual de negociación transferida.");
  assert(indexHtml.includes('id="deal-history-section"'), "Falta el historial visual del Administrador.");
  assert(serverCore.includes('recordBotOutgoing(data, { deal: targetDeal, text: intro, messageId, origin: "transfer" })'), "El saludo automático de transferencia todavía se registra como humano.");
  assert(!serverCore.includes("targetDeal.stage = STAGES.CONTACTED;"), "Un flujo automático todavía mueve targetDeal a CONTACTADO.");
  assert(serverCore.includes("SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000"), "La sesión persistente de 30 días no está activa.");

  console.log("OK · V26.34: bot no contacta, copy/select, historial, transferencia, sesión persistente y filtro estable validados.");
} finally {
  await stopServer();
  await rm(dataDirectory, { recursive: true, force: true });
}
