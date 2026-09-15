import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyV25GatewayPatches } from "../lib/v25-gateway-patches.mjs";
import { applyV255GatewayPatches } from "../lib/v25-5-gateway-patches.mjs";
import { applyV256GatewaySecurityPatches } from "../lib/v25-6-gateway-security-patches.mjs";
import { applyV2512GatewaySocialPlatformPatches } from "../lib/v25-12-social-platform-patches.mjs";
import { applyV264TenantReliabilityPatches } from "../lib/v26-4-tenant-reliability-patches.mjs";
import { applyV2618GatewayAlwaysOnPatches } from "../lib/v26-18-always-on-patches.mjs";
import { applyV26181RuntimeStabilityPatches } from "../lib/v26-18-1-runtime-stability-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const gatewayDir = path.resolve(here, "..");
const core = await readFile(path.join(gatewayDir, "gateway.mjs"), "utf8");
let patched = applyV25GatewayPatches(core);
patched = applyV255GatewayPatches(patched);
patched = applyV256GatewaySecurityPatches(patched);
patched = applyV2512GatewaySocialPlatformPatches(patched);
patched = applyV264TenantReliabilityPatches(patched);
patched = applyV2618GatewayAlwaysOnPatches(patched);
patched = applyV26181RuntimeStabilityPatches(patched);

assert.match(patched, /const v26181IntentionalStops=new Set\(\)/, "Debe distinguir paradas intencionales de caídas reales.");
assert.match(patched, /async function v26181StopTenant\(slug\)/, "Debe existir una parada segura por tenant.");
assert.match(patched, /SIGKILL/, "Una instancia trabada debe poder terminarse antes de reusar el puerto.");
assert.match(patched, /const intentional=v26181IntentionalStops\.delete\(slug\)/, "La salida intencional no debe programar un respawn duplicado.");
assert.match(patched, /await v26181RestartTenant\(c\)/, "El reinicio manual debe esperar la salida anterior antes de iniciar otra instancia.");
assert.match(patched, /for\(const company of active\)/, "El boot debe preparar tenants secuencialmente para evitar picos de recursos.");
assert.match(patched, /await new Promise\(resolve=>setTimeout\(resolve,150\)\)/, "El boot debe espaciar arranques de tenants.");
assert.match(patched, /proc\.once\('error'/, "Los errores de spawn deben manejarse sin tumbar el Gateway.");

const generated = path.join(gatewayDir, ".v26-18-1-gateway-check.mjs");
await writeFile(generated, patched, "utf8");
const syntax = spawnSync(process.execPath, ["--check", generated], { encoding: "utf8" });
await rm(generated, { force: true });
assert.equal(syntax.status, 0, `El Gateway V26.18.1 generado debe ser sintácticamente válido: ${syntax.stderr || syntax.stdout}`);

const launcher = await readFile(path.join(gatewayDir, "v25-gateway.mjs"), "utf8");
assert.match(launcher, /applyV26181RuntimeStabilityPatches/, "Producción debe aplicar V26.18.1 después de V26.18.");

console.log("OK · V26.18.1 reinicio seguro, boot secuencial y protección anti-doble-spawn validados.");
