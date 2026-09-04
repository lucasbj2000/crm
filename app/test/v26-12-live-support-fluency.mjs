import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyV2612LiveSupportFluencyPatches,
  improveV2610LiveSupportCss,
  improveV2610LiveSupportJs,
} from "../lib/v26-12-live-support-fluency-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const baseJs = await readFile(path.join(appDir, "public", "v26-10.js"), "utf8");
const baseCss = await readFile(path.join(appDir, "public", "v26-10.css"), "utf8");
const improvedJs = improveV2610LiveSupportJs(baseJs);
const improvedCss = improveV2610LiveSupportCss(baseCss);

assert.match(improvedJs, /clone\.id = source\.id \|\| "v2612-mirror-root"/, "La copia debe conservar #app-shell para no romper el diseño.");
assert.match(improvedJs, /mirrorStylesheetMarkup\(\)/, "El espejo debe cargar todas las hojas de estilo activas del CRM.");
assert.match(improvedJs, /v2612MirrorHash/, "Los cambios visuales deben detectarse por contenido y no solo por longitud.");
assert.match(improvedJs, /frame\.contentDocument\.body\.innerHTML = telemetry\.html/, "Las actualizaciones deben reemplazar el contenido sin recargar el iframe completo.");
assert.match(improvedJs, /setInterval\(\(\) => sendAgentTelemetry\(true\), 650\)/, "La vista del agente debe refrescarse con mayor fluidez.");
assert.match(improvedJs, /lastMouseSentAt >= 90/, "El cursor remoto debe actualizarse con mayor frecuencia.");
assert.match(improvedJs, /rect\.bottom < -48/, "El snapshot debe limitarse a lo visible para evitar el wireframe desordenado.");
assert.doesNotMatch(improvedJs, /source\.id \? `\$\{source\.id\}-v2610-mirror`/, "No se debe cambiar el ID estructural del app-shell.");
assert.match(improvedCss, /bottom:14px!important/, "El indicador de soporte no debe tapar la cabecera del agente.");
assert.match(improvedCss, /v2610-viewer-stage/, "La pantalla del administrador debe tener un escenario limpio.");

const generated = path.join(appDir, ".v26-12-live-support-check.js");
await writeFile(generated, improvedJs, "utf8");
const syntax = spawnSync(process.execPath, ["--check", generated], { encoding: "utf8" });
await rm(generated, { force: true });
assert.equal(syntax.status, 0, `El JavaScript de soporte mejorado debe ser válido: ${syntax.stderr || syntax.stdout}`);

const fakeServer = 'const app = express();\napp.use(express.static(publicDirectory, { extensions: ["html"] }));\n';
const patchedServer = applyV2612LiveSupportFluencyPatches(fakeServer);
assert.match(patchedServer, /app\.get\("\/v26-10\.js"/, "V26.12 debe servir el JavaScript mejorado antes del estático.");
assert.match(patchedServer, /app\.get\("\/v26-10\.css"/, "V26.12 debe servir el CSS mejorado antes del estático.");
assert.ok(patchedServer.indexOf('app.get("/v26-10.js"') < patchedServer.indexOf("app.use(express.static"), "Los assets mejorados deben interceptarse antes de express.static.");

const server = await readFile(path.join(appDir, "server.mjs"), "utf8");
assert.match(server, /applyV2612LiveSupportFluencyPatches/, "El servidor debe activar V26.12.");

console.log("OK · V26.12 soporte en vivo: vista ordenada, estilos completos, actualización suave y cursor fluido.");
