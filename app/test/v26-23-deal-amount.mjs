import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { applyV2623CoreUiPatches, applyV2623ServerPatches } from "../lib/v26-23-deal-amount-patches.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(testDir, "..");
const publicSource = await readFile(path.join(appDir, "public", "app.js"), "utf8");
const serverSource = await readFile(path.join(appDir, "server-core.mjs"), "utf8");

const publicPatched = applyV2623CoreUiPatches(publicSource);
assert.match(publicPatched, /V26\.23 DEAL_AMOUNT_CONFIRM_CLOSE/, "Debe aplicar la UI V26.23.");
assert.match(publicPatched, /Monto de la negociación/, "Debe mostrar un sector de monto dentro de la negociación.");
assert.match(publicPatched, /save-deal-amount/, "Debe permitir guardar el monto manualmente.");
assert.match(publicPatched, /use-product-amount/, "Debe poder usar el total proveniente de productos.");
assert.match(publicPatched, /Confirmar monto de cierre/, "Debe confirmar el monto antes del cierre.");
assert.match(publicPatched, /v2623OpenCloseAmountDialog\("won"\)/, "Ganado debe pasar primero por confirmación de monto.");
assert.match(publicPatched, /v2623OpenCloseAmountDialog\("lost", reasonId\)/, "Perdido debe pasar primero por confirmación de monto.");
assert.match(publicPatched, /amountConfirmed: true/, "El cierre debe informar al backend que el monto fue confirmado.");

const serverPatched = applyV2623ServerPatches(serverSource);
assert.match(serverPatched, /V26\.23 DEAL_AMOUNT_SERVER/, "Debe instalar la ruta de monto V26.23.");
assert.match(serverPatched, /\/api\/deals\/:id\/amount/, "Debe existir un endpoint para guardar el monto de la negociación.");
assert.match(serverPatched, /monto_negociacion_actualizado/, "Debe auditar cambios de monto.");
assert.match(serverPatched, /monto_cierre_confirmado/, "Debe auditar el monto final confirmado.");
assert.match(serverPatched, /amountConfirmed !== true/, "El backend debe rechazar cierres manuales sin confirmación.");
assert.match(serverPatched, /closingAmount <= 0/, "Una negociación ganada no puede cerrarse con monto cero.");
assert.match(serverPatched, /v2623ApplyAmountMetrics/, "Los reportes deben usar los montos confirmados.");
assert.match(serverPatched, /report\.summary\.salesValue/, "Debe recalcular la venta total con monto confirmado.");
assert.match(serverPatched, /entry\.salesValue/, "Debe recalcular ventas por agente y sucursal.");

for (const [name, content] of [["public", publicPatched], ["server", serverPatched]]) {
  const generated = path.join(appDir, `.v26-23-${name}-check.mjs`);
  await writeFile(generated, content, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", generated], { encoding: "utf8" });
  await rm(generated, { force: true });
  assert.equal(syntax.status, 0, `${name} generado debe ser JavaScript válido: ${syntax.stderr || syntax.stdout}`);
}

console.log("OK · V26.23 monto de negociación y confirmación de cierre validados.");
