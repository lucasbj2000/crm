import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV257FormPatches } from "../lib/v25-7-form-patches.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const appDir=path.resolve(here,"..");
const core=await readFile(path.join(appDir,"server-core.mjs"),"utf8");
const patched=applyV257FormPatches(core);
const ui=await readFile(path.join(appDir,"public","v25-7.js"),"utf8");
const css=await readFile(path.join(appDir,"public","v25-7.css"),"utf8");
const publicJs=await readFile(path.join(appDir,"public","form-public.js"),"utf8");
const publicCss=await readFile(path.join(appDir,"public","form-public.css"),"utf8");
const sw=await readFile(path.join(appDir,"public","sw.js"),"utf8");

assert.match(patched,/designBlocks: sanitizeV257DesignBlocks/,"El servidor debe persistir bloques visuales.");
assert.match(patched,/backgroundColor: sanitizeFormColor/,"El servidor debe persistir color de fondo.");
assert.match(patched,/buttonTextColor: sanitizeFormColor/,"El servidor debe persistir colores de botones.");
assert.match(patched,/\/api\/forms\/assets/,"Debe existir carga aislada de imágenes del formulario.");
assert.match(patched,/\/api\/public\/form-assets\/:fileName/,"Los assets deben tener una ruta pública controlada.");
assert.match(patched,/formAssetsDirectory=path\.join\(dataDirectory,"form-assets"\)/,"Los assets deben vivir dentro del almacenamiento del tenant.");

assert.match(ui,/DISEÑO VISUAL · V25\.7/,"Debe existir el diseñador visual.");
assert.match(ui,/data-v257-add="title"/,"Debe permitir títulos.");
assert.match(ui,/data-v257-add="subtitle"/,"Debe permitir subtítulos.");
assert.match(ui,/data-v257-add="separator"/,"Debe permitir separadores.");
assert.match(ui,/data-v257-add="image"/,"Debe permitir imágenes.");
assert.match(ui,/data-v257-add="button"/,"Debe permitir botones.");
assert.match(ui,/uploadAsset/,"Debe poder subir imágenes desde PC o celular.");
assert.match(ui,/data-v257-view="whatsapp"/,"Mobile debe ofrecer acceso directo a WhatsApp.");
assert.match(ui,/dataset\.v257Stage/,"Mobile debe mostrar una etapa de negociación por vez.");
assert.match(ui,/dataset\.v257Pane/,"El drawer móvil debe mostrar una pestaña por vez.");

assert.match(css,/\.v257-mobile-nav/,"Debe existir navegación inferior móvil.");
assert.match(css,/#crm-board\[data-v257-stage="waiting"\]/,"El tablero móvil debe seleccionar etapas sin comprimir columnas.");
assert.match(css,/#deal-drawer\[data-v257-pane="details"\]/,"La ficha móvil debe tener panel independiente.");
assert.match(css,/grid-template-columns:1fr!important/,"Los grids deben colapsar a una columna en móvil.");

assert.match(publicJs,/renderBlocks/,"El formulario público debe renderizar bloques visuales.");
assert.match(publicJs,/company\.coverUrl/,"El formulario público debe mostrar portada.");
assert.match(publicJs,/company\.logoUrl/,"El formulario público debe mostrar logo.");
assert.match(publicCss,/--form-button-text/,"El formulario público debe respetar colores personalizados.");
assert.match(sw,/whatsbot-mobile-v25-7-production-shell/,"La caché PWA debe renovarse a V25.7.");
assert.match(sw,/\/v25-7\.css/);assert.match(sw,/\/v25-7\.js/);

console.log("OK · V25.7 diseñador visual de formularios + mobile first validados.");
