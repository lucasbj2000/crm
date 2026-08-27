import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
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
const generatedCheck=path.join(appDir,".v25-8-syntax-check.mjs");
await writeFile(generatedCheck,patched,"utf8");
const syntax=spawnSync(process.execPath,["--check",generatedCheck],{encoding:"utf8"});
await unlink(generatedCheck).catch(()=>{});
assert.equal(syntax.status,0,`El servidor generado V25.8 debe ser JavaScript válido. ${syntax.stderr||syntax.stdout||""}`);

const loader=await readFile(path.join(appDir,"public","v25-7.js"),"utf8");
const ui=await readFile(path.join(appDir,"public","v25-8.js"),"utf8");
const pdfBridge=await readFile(path.join(appDir,"public","v25-8-1.js"),"utf8");
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
assert.match(loader,/v25-8-1\.js\?v=2581/,"V25.7 debe cargar el puente PDF V25.8.1.");
assert.match(loader,/v25-8\.js\?v=2581/,"V25.7 debe forzar una versión fresca de la UI V25.8.");
assert.match(loader,/installV258ApiCompatibility/,"Debe normalizar cuerpos JSON antes de usar la API histórica.");
assert.match(loader,/JSON\.stringify\(next\.body\)/,"Los objetos de V25.8 deben enviarse como JSON real.");
assert.match(ui,/Preguntar a la IA/,"Debe existir bloque de preguntas IA.");
assert.match(ui,/Descargar PDF/,"Debe existir descarga/impresión PDF corporativa.");
assert.match(ui,/data-v258-campaign-report/,"Cada campaña debe poder abrir su reporte.");
assert.match(ui,/form-report-dialog/,"El reporte de formularios debe enriquecerse.");
assert.match(ui,/brandFromState/,"El PDF debe reutilizar branding de la empresa.");
assert.match(ui,/window\.print\(\)/,"El PDF debe usar una vista corporativa imprimible sin dependencias externas.");

assert.match(pdfBridge,/createElement\("iframe"\)/,"V25.8.1 debe imprimir mediante un iframe temporal.");
assert.match(pdfBridge,/frame\.contentWindow/,"El reporte debe escribirse en el iframe sin abrir una pestaña.");
assert.match(pdfBridge,/normalizedUrl === \"\"/,"El puente solo debe interceptar la ventana vacía usada por PDF.");
assert.match(pdfBridge,/normalizedTarget === \"_blank\"/,"El puente debe limitarse al patrón exacto del generador PDF.");
assert.match(pdfBridge,/noopener/,"El puente debe reconocer la apertura segura de V25.8.");
assert.match(pdfBridge,/noreferrer/,"El puente debe reconocer la apertura segura de V25.8.");
assert.match(pdfBridge,/afterprint/,"El iframe temporal debe limpiarse después de imprimir.");
assert.match(pdfBridge,/return nativeOpen\(url, target, features\)/,"Las demás ventanas del CRM deben conservar el comportamiento nativo.");

assert.match(css,/\.v258-report-ai-panel/,"Debe existir panel visual de reportes IA.");
assert.match(css,/@media\(max-width:760px\)/,"La experiencia debe adaptarse a mobile.");
assert.match(sw,/whatsbot-mobile-v25-8-1-production-shell/,"La caché PWA debe renovarse a V25.8.1.");
assert.match(sw,/\/v25-8\.css/);assert.match(sw,/\/v25-8\.js/);assert.match(sw,/\/v25-8-1\.js/);

console.log("OK · V25.8.1 reportes IA, campañas/formularios, servidor generado y PDF sin about:blank validados.");
