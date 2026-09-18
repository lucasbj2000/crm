import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInitialData, timestamp } from "../lib/domain.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(here, "..");
const dataDirectory = await mkdtemp(path.join(tmpdir(), "crm-v2632-"));
const port = 6320 + Math.floor(Math.random() * 180);
const base = `http://127.0.0.1:${port}`;
const adminPassword = "AdminTest-2632";
const hashPassword = (value) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`;
};

const now = timestamp();
const seed = createInitialData();
seed.users = [{
  id: "admin_2632", username: "admin", name: "Admin V26.32", role: "admin", branchId: null,
  passwordHash: hashPassword(adminPassword), active: true, clientDailyLimit: 100, permissions: {},
  createdAt: now, updatedAt: now,
}];

seed.clients = [
  { id: "client_local", jid: "0981123456@s.whatsapp.net", phone: "0981123456", name: "Cliente Único", createdAt: "2026-09-01T10:00:00.000Z", updatedAt: now },
  { id: "client_country", jid: "595981123456@s.whatsapp.net", phone: "+595981123456", name: "Cliente Único Duplicado", document: "1234567", createdAt: "2026-09-02T10:00:00.000Z", updatedAt: now },
];

seed.deals = [
  {
    id: "deal_duplicate_a", clientId: "client_local", branchId: "branch_principal", lineId: null,
    jid: "0981123456@s.whatsapp.net", phone: "0981123456", name: "Cliente Único",
    ownerUserId: "admin_2632", ownerName: "Admin V26.32", source: "manual", stage: "new",
    botActive: false, createdAt: now, updatedAt: now, messages: [], items: [
      { id: "reserved_item", productId: "prod_1", sku: "SKU1", name: "Producto 1", quantity: 3, unitPrice: 100, status: "reserved", createdAt: now, updatedAt: now },
    ],
  },
  {
    id: "deal_duplicate_b", clientId: "client_country", branchId: "branch_principal", lineId: null,
    jid: "595981123456@s.whatsapp.net", phone: "+595981123456", name: "Cliente Único Duplicado",
    ownerUserId: "admin_2632", ownerName: "Admin V26.32", source: "manual", stage: "won",
    botActive: false, createdAt: now, updatedAt: now, outcomeAt: now, messages: [], items: [
      { id: "sold_item", productId: "prod_2", sku: "SKU2", name: "Producto 2", quantity: 1, unitPrice: 500, status: "sold", createdAt: now, updatedAt: now },
    ],
  },
];

seed.products = [
  { id: "prod_1", sku: "SKU1", name: "Producto 1", description: "", available: 20, reserved: 3, minStock: 0, price: 100, active: true, createdAt: now, updatedAt: now },
  { id: "prod_2", sku: "SKU2", name: "Producto 2", description: "", available: 5, reserved: 0, minStock: 0, price: 500, active: true, createdAt: now, updatedAt: now },
];
seed.stockMovements = [
  { id: "mov_1", productId: "prod_1", productName: "Producto 1", type: "initial", quantity: 20, before: 0, after: 20, note: "", at: now },
  { id: "mov_2", productId: "prod_2", productName: "Producto 2", type: "initial", quantity: 5, before: 0, after: 5, note: "", at: now },
];

await writeFile(path.join(dataDirectory, "whatsbot-crm.json"), JSON.stringify(seed));

const child = spawn(process.execPath, [path.join(appDirectory, "server.mjs")], {
  cwd: appDirectory,
  env: { ...process.env, PORT: String(port), WHATSBOT_HOST: "127.0.0.1", WHATSAPP_MOCK: "1", NO_OPEN: "1", WHATSBOT_DATA_DIR: dataDirectory, CRM_TENANT_SLUG: "v2632", CRM_PUBLIC_BASE_URL: base },
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
async function login() {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: adminPassword }),
  });
  assert(response.ok, "No se pudo iniciar sesión.");
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
  await login();

  let state = await api("/api/state");
  const exact = state.clients.filter((client) => {
    const digits = String(client.phone || "").replace(/\D/g, "");
    return digits.endsWith("981123456");
  });
  assert(exact.length === 1, `Se esperaban 1 Cliente Maestro tras la reparación y hay ${exact.length}.`);
  const master = exact[0];
  assert(master.document === "1234567", "La fusión no conservó los datos útiles del duplicado.");
  assert(state.deals.filter((deal) => ["deal_duplicate_a", "deal_duplicate_b"].includes(deal.id)).every((deal) => deal.clientId === master.id), "Las negociaciones duplicadas no fueron redirigidas al Cliente Maestro.");

  const duplicateLoad = await raw("/api/clients", { method: "POST", body: { name: "Otro nombre", phone: "+595981123456", branchId: "branch_principal" } });
  assert([200, 409].includes(duplicateLoad.response.status), "La carga del mismo teléfono devolvió un estado inesperado.");
  state = await api("/api/state");
  assert(state.clients.filter((client) => String(client.phone || "").replace(/\D/g, "").endsWith("981123456")).length === 1, "La carga manual volvió a crear un cliente duplicado.");

  const reports = await api("/api/reports?days=30");
  assert(reports.summary?.newClients === 1, `El reporte debe contar 1 cliente único y reportó ${reports.summary?.newClients}.`);

  const reset = await api("/api/products/reset-all", { method: "DELETE" });
  assert(reset.resetResult?.productCount === 2, "El borrado completo no informó los 2 productos.");
  assert(reset.products?.length === 0, "El catálogo no quedó vacío.");
  assert(reset.stockMovements?.length === 0, "Los movimientos de stock no quedaron vacíos.");
  const reservedDeal = reset.deals.find((deal) => deal.id === "deal_duplicate_a");
  const soldDeal = reset.deals.find((deal) => deal.id === "deal_duplicate_b");
  assert(reservedDeal?.items?.find((item) => item.id === "reserved_item")?.status === "released", "La reserva abierta no fue liberada al borrar stock.");
  assert(soldDeal?.items?.find((item) => item.id === "sold_item")?.status === "sold", "La venta histórica fue alterada al borrar stock.");

  const appJs = await (await fetch(`${base}/app.js`)).text();
  const index = await (await fetch(`${base}/`)).text();
  assert(appJs.includes("/api/products/reset-all"), "El bundle servido no contiene el borrado total de stock.");
  assert(appJs.includes("Mostrando 500 de"), "El bundle servido no limita la tabla de stock grande.");
  assert(index.includes('id="reset-stock-button"'), "La UI servida no contiene el botón Eliminar stock completo.");

  console.log("OK · V26.32: stock completo eliminable, reservas seguras, teléfono canónico, dedupe y reportes únicos validados.");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => { child.once("exit", resolve); setTimeout(resolve, 3000).unref(); });
  await rm(dataDirectory, { recursive: true, force: true });
}
