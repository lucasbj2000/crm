import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialData } from "../lib/domain.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const dir = await mkdtemp(path.join(tmpdir(), "crm-v2692-brand-"));
const port = 6300 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;

const data = createInitialData();
data.settings.branding = {
  ...data.settings.branding,
  systemName: "Empresa Marca QA",
  shortName: "MarcaQA",
  primaryColor: "#123456",
  accentColor: "#E67817",
  backgroundColor: "#F1F2F3",
  sidebarColor: "#234567",
  surfaceColor: "#FFFFFF",
  textColor: "#202124",
  loginKicker: "ACCESO EMPRESA QA",
  loginMessage: "Identidad visual visible antes y después del login.",
  logoFileName: "logo.png",
};
await mkdir(path.join(dir, "branding"), { recursive: true });
await writeFile(path.join(dir, "branding", "logo.png"), Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"));
await writeFile(path.join(dir, "whatsbot-crm.json"), JSON.stringify(data), "utf8");

const child = spawn(process.execPath, [path.join(appDir, "server.mjs")], {
  cwd: appDir,
  env: {
    ...process.env,
    PORT: String(port),
    WHATSBOT_HOST: "127.0.0.1",
    WHATSBOT_DATA_DIR: dir,
    WHATSAPP_MOCK: "1",
    NO_OPEN: "1",
    CRM_TENANT_SLUG: "v2692-branding",
    CRM_PUBLIC_BASE_URL: base,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => output += chunk);
child.stderr.on("data", (chunk) => output += chunk);

async function waitForServer() {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Servidor V26.9.2 no inició.\n${output}`);
}

try {
  await waitForServer();

  const brandResponse = await fetch(`${base}/api/branding/public`, { cache: "no-store" });
  assert.equal(brandResponse.status, 200, "El branding público quedó bloqueado antes del login.");
  const brand = await brandResponse.json();
  assert.equal(brand.systemName, "Empresa Marca QA", "No se conservó el nombre configurado por el Administrador.");
  assert.equal(brand.primaryColor, "#123456", "No se conservó el color primario configurado.");
  assert.equal(brand.accentColor, "#E67817", "No se conservó el color de acento configurado.");
  assert.equal(brand.backgroundColor, "#F1F2F3", "No se conservó el color de fondo configurado.");
  assert.equal(brand.surfaceColor, "#FFFFFF", "No se conservó el color de superficies configurado.");
  assert.equal(brand.logoUrl, "/api/branding/logo", "El branding público no expone la ruta segura del logo.");

  const logoResponse = await fetch(`${base}/api/branding/logo`, { cache: "no-store" });
  assert.equal(logoResponse.status, 200, "El logo de empresa no puede leerse desde login/usuarios normales.");
  assert.match(String(logoResponse.headers.get("content-type") || ""), /^image\/png/i, "El logo perdió su tipo MIME.");
  assert.ok((await logoResponse.arrayBuffer()).byteLength > 0, "El logo público llegó vacío.");

  const unauthorizedWrite = await fetch(`${base}/api/branding`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ primaryColor: "#000000" }),
  });
  assert.equal(unauthorizedWrite.status, 401, "Un usuario anónimo pudo modificar la identidad visual.");

  const unauthorizedDelete = await fetch(`${base}/api/branding/logo`, { method: "DELETE" });
  assert.equal(unauthorizedDelete.status, 401, "Un usuario anónimo pudo eliminar el logo.");

  const technicalSettings = await fetch(`${base}/api/settings`, { cache: "no-store" });
  assert.equal(technicalSettings.status, 401, "La corrección de branding abrió configuración técnica anónima.");

  console.log("OK · V26.9.2 branding público consistente y escritura técnica protegida.");
} finally {
  if (child.exitCode === null) child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    setTimeout(resolve, 3000).unref();
  });
  await rm(dir, { recursive: true, force: true });
}
