import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const appDir=path.resolve(here,"..");
const patch=await readFile(path.join(appDir,"lib","v26-37-guardian-24x7-patches.mjs"),"utf8");
const launcher=await readFile(path.join(appDir,"server.mjs"),"utf8");

assert.match(patch,/setInterval\(\(\) => \{ void v2637EnsureQrRuntime\(\); \}, 30_000\)/,"El supervisor QR debe ejecutarse cada 30 segundos.");
assert.match(patch,/v2637PrimaryCredentialsExist/,"Debe detectar credenciales QR principales persistidas.");
assert.match(patch,/v2637BranchCredentialsExist/,"Debe detectar credenciales QR por sucursal.");
assert.match(patch,/v2637LineCredentialsExist/,"Debe detectar credenciales QR por línea.");
assert.match(patch,/!\["connected", "starting", "qr"\]\.includes\(connectionStatus\)/,"Debe reactivar la conexión principal cuando queda en error o desconectada.");
assert.match(patch,/await startExtraBranchConnection\(branch\.id\)/,"Debe reactivar sucursales sin intervención humana.");
assert.match(patch,/await startWhatsappLineConnection\(line\.id\)/,"Debe reactivar líneas QR sin intervención humana.");
assert.match(patch,/manualLogout/,"Una desvinculación manual no debe ser revertida por el supervisor.");
assert.match(patch,/uptimeSeconds/,"El health debe exponer uptime para diagnóstico.");
assert.match(patch,/guardian:/,"El health debe exponer el estado del guardian.");
assert.match(launcher,/applyV2637GuardianAppPatches/,"Producción debe activar V26.37 en el tenant.");
assert.ok(launcher.indexOf("applyV2637GuardianAppPatches")>launcher.indexOf("applyV2636ZeroLossIncomingPatches"),"V26.37 debe aplicarse después de V26.36.");

console.log("OK · V26.37 supervisor QR autónomo 24/7 validado.");
