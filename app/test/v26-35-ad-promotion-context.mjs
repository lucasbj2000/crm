import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInitialData, timestamp } from "../lib/domain.mjs";
import { applyV2635AdPromotionContextPatches } from "../lib/v26-35-ad-promotion-context-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(here, "..");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const core = await readFile(path.join(appDirectory, "server-core.mjs"), "utf8");
const patched = applyV2635AdPromotionContextPatches(core);
assert(patched.includes("function v2635CloudAdReferral"), "Falta extractor de referral Cloud API.");
assert(patched.includes("function v2635QrAdReferral"), "Falta detección CTWA por QR.");
assert(patched.includes("v2635ApplyAdContext(deal,v2635Referral,text,line,\"cloud\")"), "Cloud webhook no aplica atribución.");
assert(patched.includes("v2635ApplyAdContext(deal,v2635Referral,text,incomingLine,\"qr\")"), "WhatsApp QR no aplica atribución.");
assert(patched.includes("PAUTA / PROMOCIÓN DE ORIGEN"), "El contexto de pauta no llega al prompt de IA.");
assert(patched.includes("Cuando un agente humano tome la conversación"), "Falta instrucción explícita de handoff.");

const dataDirectory = await mkdtemp(path.join(tmpdir(), "crm-v2635-"));
const port = 6480 + Math.floor(Math.random() * 120);
const base = `http://127.0.0.1:${port}`;
const adminPassword = "AdminTest-2635";
const hashPassword = (value) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`;
};
const now = timestamp();
const seed = createInitialData();
const branchId = seed.branches?.[0]?.id || "branch_principal";
seed.users = [{
  id: "admin_2635",
  username: "admin",
  name: "Admin V26.35",
  role: "admin",
  branchId: null,
  passwordHash: hashPassword(adminPassword),
  active: true,
  clientDailyLimit: 100,
  permissions: {},
  createdAt: now,
  updatedAt: now,
}];

await writeFile(path.join(dataDirectory, "whatsbot-crm.json"), JSON.stringify(seed));

const child = spawn(process.execPath, [path.join(appDirectory, "server.mjs")], {
  cwd: appDirectory,
  env: {
    ...process.env,
    PORT: String(port),
    WHATSBOT_HOST: "127.0.0.1",
    WHATSAPP_MOCK: "1",
    NO_OPEN: "1",
    WHATSBOT_DATA_DIR: dataDirectory,
    CRM_TENANT_SLUG: "v2635",
    CRM_PUBLIC_BASE_URL: base,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (d) => output += d);
child.stderr.on("data", (d) => output += d);

let cookie = "";
const waitForServer = async () => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("El servidor no inició.\n" + output);
};
async function login() {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: adminPassword }),
  });
  assert(res.ok, "No se pudo iniciar sesión admin.");
  cookie = String(res.headers.get("set-cookie") || "").split(";")[0];
}
async function api(url, { method = "GET", body, auth = true } = {}) {
  const headers = auth && cookie ? { cookie } : {};
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${base}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url}: ${payload.error || res.status}`);
  return payload;
}

try {
  await waitForServer();
  await login();

  const initialState = await api("/api/state");
  const runtimeBranchId = initialState.branches?.[0]?.id;
  assert(runtimeBranchId, "El CRM no creó una sucursal principal para la prueba.");

  await api("/api/whatsapp-lines", {
    method: "POST",
    body: {
      name: "Ventas Pautas",
      routingBranchId: runtimeBranchId,
      provider: "cloud",
      phone: "595981999999",
      active: true,
      isDefault: true,
      accessMode: "all",
      botEnabled: true,
      cloud: {
        phoneNumberId: "phone_2635",
        businessAccountId: "waba_2635",
        apiVersion: "v26.0",
        verifyToken: "verify_2635"
      }
    }
  });
  const lineState = await api("/api/whatsapp-lines");
  const cloudLine = lineState.lines?.find((line) => line.name === "Ventas Pautas");
  assert(cloudLine?.id, "No se creó la línea Cloud de prueba.");

  const configured = await api("/api/ad-promotions", {
    method: "POST",
    body: {
      name: "Promo Camioneta Septiembre",
      active: true,
      lineIds: [cloudLine.id],
      sourceIds: ["ad_2635"],
      triggerContains: ["quiero información de la promoción"],
      headline: "Camioneta 0 km - Oferta especial",
      body: "Financiación promocional disponible.",
      offerDetails: "Beneficio confirmado: entrega inicial reducida durante septiembre.",
      botInstructions: "Consultá el modelo de interés y la ciudad del cliente antes del handoff.",
    },
  });
  assert(configured.promotion?.id, "No se creó la configuración de pauta.");

  const webhook = {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba_2635",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "595981999999", phone_number_id: "phone_2635" },
          contacts: [{ wa_id: "595981123456", profile: { name: "Cliente Pauta" } }],
          messages: [{
            from: "595981123456",
            id: "wamid.v2635.1",
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            text: { body: "Hola, quiero información de la promoción" },
            referral: {
              source_url: "https://fb.me/promo-2635",
              source_id: "ad_2635",
              source_type: "ad",
              headline: "Texto original del anuncio",
              body: "Descripción original",
              ctwa_clid: "ctwa_click_2635",
              media_type: "image",
            },
          }],
        },
      }],
    }],
  };

  const webhookRes = await fetch(`${base}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(webhook),
  });
  assert(webhookRes.status === 200, "El webhook Cloud no respondió 200.");

  let state = null;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    state = await api("/api/state");
    const found = state.deals?.find((deal) => String(deal.phone || "").replace(/\\D/g, "") === "595981123456");
    if (found?.adAttribution?.sourceId === "ad_2635") break;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  const deal = state.deals?.find((entry) => String(entry.phone || "").replace(/\\D/g, "") === "595981123456");
  assert(deal, "No se creó la negociación proveniente de la pauta. Líneas=" + JSON.stringify((await api("/api/whatsapp-lines")).lines?.map((line)=>({id:line.id,name:line.name,provider:line.provider,cloud:line.cloud}))) + " Deals=" + JSON.stringify((state.deals || []).map((row)=>({id:row.id,phone:row.phone,lineId:row.lineId,lastMessage:row.lastMessage}))) + " Server=" + output.slice(-5000));
  assert(deal.adAttribution?.sourceId === "ad_2635", "No se guardó el ID del anuncio.");
  assert(deal.adAttribution?.ctwaClid === "ctwa_click_2635", "No se guardó ctwa_clid.");
  assert(deal.adAttribution?.promotionName === "Promo Camioneta Septiembre", "No se vinculó la pauta configurada.");
  assert(deal.adAttribution?.headline === "Camioneta 0 km - Oferta especial", "La configuración comercial no priorizó el título administrado.");
  assert(deal.adAttribution?.offerDetails?.includes("entrega inicial reducida"), "No se guardaron los detalles de la promoción.");
  assert((deal.campaignSourceIds || []).includes("ad_2635"), "La negociación no quedó atribuida a la fuente de campaña.");
  assert((state.activities || []).some((entry) => String(entry.text || entry.message || "").includes("Lead de pauta detectado")), "No se registró actividad de detección de pauta.");

  const promotions = await api("/api/ad-promotions");
  assert(promotions.promotions?.some((entry) => entry.name === "Promo Camioneta Septiembre"), "La API de promociones no devolvió la configuración.");

  const generated = await readFile(path.join(appDirectory, ".server-v24.generated.mjs"), "utf8");
  assert(generated.includes("ORIGEN PUBLICITARIO DETECTADO"), "El servidor generado no contiene el contexto publicitario para IA.");
  console.log("OK · V26.35 detección de pautas, atribución CTWA, configuración y contexto IA validados.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  await rm(dataDirectory, { recursive: true, force: true });
}
