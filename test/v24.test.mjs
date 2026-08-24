import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const port = 34127;
const baseUrl = `http://127.0.0.1:${port}`;
const adminPassword = "V24-test-password!";
let dataDirectory;
let serverProcess;
let adminCookie;
let state;

async function request(pathname, { cookie = adminCookie, ...options } = {}) {
  const headers = new Headers(options.headers || {});
  if (cookie) headers.set("Cookie", cookie);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || "GET"} ${pathname}: ${response.status} ${body.error || response.statusText}`);
  return { response, body };
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("El servidor de prueba no inició a tiempo.");
}

async function waitForLine(lineId, predicate) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { body } = await request("/api/whatsapp-lines");
    const line = body.lines.find((entry) => entry.id === lineId);
    if (line && predicate(line)) return line;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("La línea no alcanzó el estado esperado.");
}

before(async () => {
  dataDirectory = await mkdtemp(path.join(tmpdir(), "whatsbot-v24-test-"));
  serverProcess = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      WHATSBOT_HOST: "127.0.0.1",
      WHATSBOT_DATA_DIR: dataDirectory,
      INITIAL_ADMIN_PASSWORD: adminPassword,
      WHATSAPP_MOCK: "1",
      NO_OPEN: "1",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer();
  const login = await request("/api/auth/login", {
    cookie: "",
    method: "POST",
    body: JSON.stringify({ username: "admin", password: adminPassword }),
  });
  adminCookie = String(login.response.headers.get("set-cookie") || "").split(";")[0];
  assert.match(adminCookie, /^whatsbot_session=/);
  state = (await request("/api/state")).body;
});

after(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }
  if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true });
});

test("genera y regenera un QR independiente por línea", async () => {
  const line = state.whatsappLines.find((entry) => entry.provider === "qr");
  assert.ok(line, "Debe existir la línea QR predeterminada");

  await request(`/api/whatsapp-lines/${encodeURIComponent(line.id)}/connect`, {
    method: "POST",
    body: JSON.stringify({ force: true }),
  });
  const first = await waitForLine(line.id, (entry) => entry.connection.status === "qr" && entry.connection.qrGeneration >= 1);
  assert.match(first.connection.qr, /^data:image\/png;base64,/);
  assert.ok(Date.parse(first.connection.qrExpiresAt) > Date.parse(first.connection.qrUpdatedAt));

  await request(`/api/whatsapp-lines/${encodeURIComponent(line.id)}/connect`, {
    method: "POST",
    body: JSON.stringify({ force: true }),
  });
  const second = await waitForLine(line.id, (entry) => entry.connection.qrGeneration > first.connection.qrGeneration);
  assert.ok(second.connection.qrGeneration > first.connection.qrGeneration);
});

test("asigna una línea a un usuario de otra sucursal", async () => {
  const primaryLine = state.whatsappLines[0];
  const branchState = (await request("/api/branches", {
    method: "POST",
    body: JSON.stringify({ name: "Sucursal Norte", code: "NORTE" }),
  })).body;
  const secondaryBranch = branchState.branches.find((entry) => entry.code === "NORTE");
  assert.ok(secondaryBranch);

  const userState = (await request("/api/users", {
    method: "POST",
    body: JSON.stringify({
      name: "Agente Compartido",
      username: "agente.compartido",
      password: "Agente-test-24!",
      role: "agent",
      branchId: secondaryBranch.id,
      whatsappLineIds: [primaryLine.id],
    }),
  })).body;
  const created = userState.users.find((entry) => entry.username === "agente.compartido");
  assert.deepEqual(created.whatsappLineIds, [primaryLine.id]);

  const login = await request("/api/auth/login", {
    cookie: "",
    method: "POST",
    body: JSON.stringify({ username: "agente.compartido", password: "Agente-test-24!" }),
  });
  const agentCookie = String(login.response.headers.get("set-cookie") || "").split(";")[0];
  const visibleLines = (await request("/api/whatsapp-lines", { cookie: agentCookie })).body.lines;
  assert.ok(visibleLines.some((entry) => entry.id === primaryLine.id));
});

test("publica un formulario y mide su respuesta web dentro del CRM", async () => {
  const branchId = state.branches[0].id;
  const result = await request("/api/forms", {
    method: "POST",
    body: JSON.stringify({
      name: "Satisfacción V24",
      description: "Prueba del enlace público",
      branchId,
      publicEnabled: true,
      identityFields: { name: true, phone: true, email: true, phoneRequired: true },
      questions: [
        { id: "q_rating", text: "¿Cómo fue tu experiencia?", type: "rating", required: true },
        { id: "q_comment", text: "Comentario", type: "longtext", required: false },
      ],
    }),
  });
  const form = result.body.form;
  assert.match(form.publicPath, /^\/f\//);
  const token = form.publicPath.split("/").pop();

  const publicDefinition = await request(`/api/public/forms/${encodeURIComponent(token)}`, { cookie: "" });
  assert.equal(publicDefinition.body.form.name, "Satisfacción V24");

  const submission = await request(`/api/public/forms/${encodeURIComponent(token)}`, {
    cookie: "",
    method: "POST",
    body: JSON.stringify({
      identity: { name: "Cliente de prueba", phone: "595981123456", email: "cliente@example.com" },
      answers: [
        { questionId: "q_rating", value: "9" },
        { questionId: "q_comment", value: "Muy buena atención" },
      ],
      website: "",
    }),
  });
  assert.ok(submission.body.responseId);

  const report = (await request(`/api/forms/${encodeURIComponent(form.id)}/report`)).body;
  assert.equal(report.summary.completed, 1);
  assert.equal(report.summary.web, 1);
  assert.equal(report.summary.whatsapp, 0);
  assert.equal(report.questions.find((entry) => entry.id === "q_rating").average, 9);
});
