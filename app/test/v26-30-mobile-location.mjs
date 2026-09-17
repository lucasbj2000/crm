import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2630CoreUiPatches, applyV2630ServerPatches } from "../lib/v26-30-mobile-location-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "..");
const uiSource = await readFile(path.join(app, "public", "app.js"), "utf8");
const serverSource = await readFile(path.join(app, "server-core.mjs"), "utf8");

const patchedUi = applyV2630CoreUiPatches(uiSource);
for (const marker of [
  "V26.30 MOBILE_LOCATION_UX",
  "v2630-mobile-dock",
  "board-column.mobile-active",
  "Abrir ubicación exacta en Maps",
  "v2630-location-card",
  "body.v2630-mobile .workspace",
]) assert.ok(patchedUi.includes(marker), `Falta UI V26.30: ${marker}`);

const patchedServer = applyV2630ServerPatches(serverSource);
for (const marker of [
  "V26.30 LOCATION_MESSAGES",
  "function v2630LocationText(location)",
  "content.locationMessage || content.liveLocationMessage",
  "const rawLocation=item.location||null",
  "https://www.google.com/maps/search/?api=1&query=",
]) assert.ok(patchedServer.includes(marker), `Falta ubicación V26.30: ${marker}`);

const tempUi = path.join(app, ".v2630-ui-check.js");
const tempServer = path.join(app, ".v2630-server-check.mjs");
await writeFile(tempUi, patchedUi);
await writeFile(tempServer, patchedServer);
try {
  const uiCheck = spawnSync(process.execPath, ["--check", tempUi], { encoding: "utf8" });
  assert.equal(uiCheck.status, 0, `app.js V26.30 inválido:\n${uiCheck.stderr}`);
  const serverCheck = spawnSync(process.execPath, ["--check", tempServer], { encoding: "utf8" });
  assert.equal(serverCheck.status, 0, `server V26.30 inválido:\n${serverCheck.stderr}`);
} finally {
  await rm(tempUi, { force: true });
  await rm(tempServer, { force: true });
}

console.log("OK · V26.30 mobile usable y ubicación exacta QR/Cloud validados.");
