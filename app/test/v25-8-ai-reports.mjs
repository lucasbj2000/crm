import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV257FormPatches } from "../lib/v25-7-form-patches.mjs";
import { applyV256SecurityPatches } from "../lib/v25-6-security-patches.mjs";
import { applyV258ReportAiPatches } from "../lib/v25-8-report-ai-patches.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const appDir=path.resolve(here,"..");
const core=await readFile(path.join(appDir,"server-core.mjs"),"utf8");
let patched=applyV257FormPatches(core);
patched=applyV256SecurityPatches(patched);
patched=applyV258ReportAiPatches(patched);
const loader=await readFile(path.join(appDir,"public","v25-7.js"),"utf8");
const ui=await readFile(path.join(appDir,"public","v25-8.js"),"utf8");
const css=await readFile(path.join(appDir,"public","v25-8.css"),"utf8");
const sw=await readFile(path.join(appDir,"public","sw.js"),"utf8");

assert.match(patched,/\/api\/ai\/report-insight/,"Debe existir endpoint IA para reportes.");
assert.match(patched,/scope===\"campaign\"/,"Debe analizar campañas de forma específica.");
assert.match(patched,/scope===\"form\"/,"Debe analizar formularios de forma específica.");
assert.match(patched,/v258CompactGeneralReport/,"El contexto general debe ser agregado y compacto.");
assert.match(patched,/samples:\(q\.samples\|\|\[\]\).*value:cleanText/s,"Los formularios deben enviar muestras sin nombre de cliente.");
assert.match(patched,/Máximo 6 viñetas y 1\.200 caracteres/,"La IA debe producir una respuesta ejecutiva corta.");
assert.match(patched,/userCanAccessBranch/,"Debe respetar aislamiento por sucursal.");
assert.match(patched,/campaignView/,"Debe respetar permisos de campañas.");
assert.match(patched,/canViewSurveys/,"Debe respetar permisos de formularios.");

assert.match(loader,/v25-8\.css\?v=2580/,"V25.7 debe cargar estilos V25.8.");
assert.match(loader,/v25-8\.js\?v=2580/,"V25.7 debe cargar la UI V25.8.");
assert.match(ui,/Preguntar a la IA/,"Debe existir bloque de preguntas IA.");
assert.match(ui,/Descargar PDF/,"Debe existir descarga/impresión PDF corporativa.");
assert.match(ui,/data-v258-campaign-report/,"Cada campaña debe poder abrir su reporte.");
assert.match(ui,/form-report-dialog/,"El reporte de formularios debe enriquecerse.");
assert.match(ui,/brandFromState/,"El PDF debe reutilizar branding de la empresa.");
assert.match(ui,/window\.print\(\)/,"El PDF debe usar una vista corporativa imprimible sin dependencias externas.");
assert.match(css,/\.v258-report-ai-panel/,"Debe existir panel visual de reportes IA.");
assert.match(css,/@media\(max-width:760px\)/,"La experiencia debe adaptarse a mobile.");
assert.match(sw,/whatsbot-mobile-v25-8-production-shell/,"La caché PWA debe renovarse a V25.8.");
assert.match(sw,/\/v25-8\.css/);assert.match(sw,/\/v25-8\.js/);

console.log("OK · V25.8 reportes IA, campañas/formularios y PDF corporativo validados.");
