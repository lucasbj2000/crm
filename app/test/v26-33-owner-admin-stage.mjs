import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInitialData, timestamp } from "../lib/domain.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(here, "..");
const dataDirectory = await mkdtemp(path.join(tmpdir(), "crm-v2633-"));
const port = 6330 + Math.floor(Math.random() * 150);
const base = `http://127.0.0.1:${port}`;
const adminPassword = "AdminTest-2633";
const managerPassword = "ManagerTest-2633";
const hashPassword = (value) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`;
};
const now = timestamp();
const seed = createInitialData();
seed.users = [
  { id: "admin_2633", username: "admin", name: "Admin V26.33", role: "admin", branchId: null, passwordHash: hashPassword(adminPassword), active: true, clientDailyLimit: 100, permissions: {}, createdAt: now, updatedAt: now },
  { id: "manager_2633", username: "jefe", name: "Jefe V26.33", role: "manager", branchId: "branch_principal", passwordHash: hashPassword(managerPassword), active: true, clientDailyLimit: 100, permissions: {}, createdAt: now, updatedAt: now },
];
await writeFile(path.join(dataDirectory, "whatsbot-crm.json"), JSON.stringify(seed));

const child = spawn(process.execPath, [path.join(appDirectory, "server.mjs")], {
  cwd: appDirectory,
  env: { ...process.env, PORT: String(port), WHATSBOT_HOST: "127.0.0.1", WHATSAPP_MOCK: "1", NO_OPEN: "1", WHATSBOT_DATA_DIR: dataDirectory, CRM_TENANT_SLUG: "v2633", CRM_PUBLIC_BASE_URL: base },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => output += chunk);
child.stderr.on("data", (chunk) => output += chunk);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const waitForServer = async () => {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try { const response = await fetch(`${base}/api/health`); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`El servidor no inició.\n${output}`);
};

let cookie = "";
async function login(username, password) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert(response.ok, `No se pudo iniciar sesión con ${username}.`);
  cookie = String(response.headers.get("set-cookie") || "").split(";")[0];
}
async function api(url, { method = "GET", body } = {}) {
  const headers = cookie ? { cookie } : {};
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${url}: ${payload.error || response.status}`);
  return payload;
}
async function raw(url, { method = "GET", body } = {}) {
  const headers = cookie ? { cookie } : {};
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

try {
  await waitForServer();
  await login("admin", adminPassword);

  let state = await api("/api/state");
  const branch = state.branches.find((entry) => entry.id === "branch_principal") || state.branches[0];
  assert(branch, "No existe sucursal principal.");

  state = await api("/api/products", { method: "POST", body: { sku: "SKU2633", name: "Producto V26.33", available: 10, minStock: 0, price: 250000 } });
  const product = state.products.find((entry) => entry.sku === "SKU2633");
  assert(product, "No se creó el producto.");

  state = await api("/api/clients", { method: "POST", body: { name: "Cliente Etapas", phone: "+595981263300", branchId: branch.id } });
  const deal = state.deals.find((entry) => entry.name === "Cliente Etapas");
  assert(deal && deal.ownerUserId === "admin_2633", "No se creó la negociación con responsable visible.");

  state = await api(`/api/deals/${encodeURIComponent(deal.id)}/reserve`, { method: "POST", body: { productId: product.id, quantity: 2 } });
  let current = state.deals.find((entry) => entry.id === deal.id);
  assert(current.items.some((item) => item.status === "reserved" && item.quantity === 2), "No se preparó la reserva.");

  await login("jefe", managerPassword);
  const denied = await raw(`/api/deals/${encodeURIComponent(deal.id)}/admin-stage`, { method: "POST", body: { stage: "waiting" } });
  assert(denied.response.status === 403, "Un jefe no administrador pudo cambiar etapa mediante la ruta admin.");

  await login("admin", adminPassword);
  state = await api(`/api/deals/${encodeURIComponent(deal.id)}/admin-stage`, {
    method: "POST",
    body: { stage: "won", amountConfirmed: true, closingAmount: 500000 },
  });
  current = state.deals.find((entry) => entry.id === deal.id);
  assert(current.stage === "won" && current.closingAmount === 500000, "El Administrador no pudo mover a Ganado con monto.");
  assert(current.items.some((item) => item.status === "sold"), "La reserva no se convirtió en venta.");

  state = await api(`/api/deals/${encodeURIComponent(deal.id)}/admin-stage`, { method: "POST", body: { stage: "waiting" } });
  current = state.deals.find((entry) => entry.id === deal.id);
  const afterReopenProduct = state.products.find((entry) => entry.id === product.id);
  assert(current.stage === "waiting" && !current.outcomeAt && current.waitingSince, "La negociación ganada no se reabrió correctamente en En espera.");
  assert(current.items.some((item) => item.status === "reserved"), "Al reabrir Ganado, el producto no volvió a reserva.");
  assert(Number(afterReopenProduct.reserved) === 2, "El stock reservado no se restauró al reabrir.");

  const reasonId = state.settings.lossReasons?.[0]?.id;
  assert(reasonId, "No hay motivo de pérdida para la prueba.");
  state = await api(`/api/deals/${encodeURIComponent(deal.id)}/admin-stage`, {
    method: "POST",
    body: { stage: "lost", amountConfirmed: true, closingAmount: 500000, reasonId },
  });
  current = state.deals.find((entry) => entry.id === deal.id);
  const afterLostProduct = state.products.find((entry) => entry.id === product.id);
  assert(current.stage === "lost" && current.lossReasonId === reasonId, "No se cambió a Perdido con motivo.");
  assert(current.items.some((item) => item.status === "released"), "La reserva no fue liberada al pasar a Perdido.");
  assert(Number(afterLostProduct.available) === 10 && Number(afterLostProduct.reserved) === 0, "El stock no quedó correcto después de cerrar como Perdido.");

  const audit = state.auditEvents || [];
  assert(audit.filter((entry) => entry.action === "etapa_negociacion_cambiada_admin" && entry.details?.dealId === deal.id).length >= 3, "Faltan eventos de auditoría de cambio de etapa.");

  const appJs = await (await fetch(`${base}/app.js`)).text();
  const index = await (await fetch(`${base}/`)).text();
  assert(appJs.includes("<small>Responsable</small><strong>"), "La tarjeta no muestra Responsable de forma explícita.");
  assert(appJs.includes("/admin-stage"), "El bundle servido no contiene la acción administrativa de etapa.");
  assert(index.includes('id="admin-stage-card"'), "La ficha no contiene el panel administrativo de etapa.");

  console.log("OK · V26.33: responsable visible en tarjeta y cambio administrativo de etapa con stock/auditoría validados.");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => { child.once("exit", resolve); setTimeout(resolve, 3000).unref(); });
  await rm(dataDirectory, { recursive: true, force: true });
}
