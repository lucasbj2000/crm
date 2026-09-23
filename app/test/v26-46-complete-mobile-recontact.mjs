import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

const app = await readFile(path.join(appDir, "public", "app.js"), "utf8");
const css = await readFile(path.join(appDir, "public", "styles.css"), "utf8");
const index = await readFile(path.join(appDir, "public", "index.html"), "utf8");
const sw = await readFile(path.join(appDir, "public", "sw.js"), "utf8");
const closed = await readFile(path.join(appDir, "lib", "v26-38-closed-recontact-patches.mjs"), "utf8");
const launcher = await readFile(path.join(appDir, "server.mjs"), "utf8");

assert.ok(app.includes("// V26.46 COMPLETE_MOBILE_RUNTIME"), "Debe existir runtime V26.46.");
assert.ok(app.includes("panel.hidden = !active"), "El cambio de vista debe ocultar paneles inactivos.");
assert.ok(app.includes('behavior: mobile ? "auto" : "smooth"'), "Mobile no debe animar el cambio de sector.");
assert.ok(app.includes("syncClosedRecontactBanner"), "Debe mostrarse el recontacto cerrado.");
assert.ok(app.includes("se creará una nueva negociación en Contactado"), "El agente debe saber qué pasará al recontactar.");
assert.ok(app.includes('switchView(requestedView&&viewCopy[requestedView] ? requestedView : currentView);'), "Boot debe fijar una única vista.");

assert.ok(css.includes("/* V26.46 MOBILE PRODUCTION OVERRIDES */"), "Deben existir overrides mobile productivos.");
assert.ok(css.includes(".board-column.mobile-active{display:block!important}"), "Mobile debe mostrar una sola etapa.");
assert.ok(css.includes("overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important"), "El chat debe usar scroll táctil nativo.");
assert.ok(css.includes(".nav-list{\n    display:flex!important"), "La navegación mobile debe ser horizontal.");
assert.ok(css.includes("[data-view-panel]:not(.active){display:none!important;visibility:hidden!important}"), "No deben aparecer sectores inactivos.");
assert.ok(css.includes(".v2646-recontact-banner"), "Debe existir estilo del aviso de recontacto.");

assert.ok(index.includes('id="v2646-critical"'), "Debe existir CSS crítico anti-flash.");
assert.ok(index.includes('/styles.css?v=26.46'), "Debe forzarse la hoja de estilos nueva.");
assert.ok(index.includes('/app.js?v=26.46-complete-mobile-recontact'), "Debe forzarse el bundle nuevo.");
assert.ok(sw.includes("whatsbot-mobile-v26-46-complete-mobile-recontact"), "La PWA debe renovar caché.");

assert.ok(closed.includes('const canRecontactClosed = ["won", "lost"].includes(deal.stage);'), "Ganado/Perdido debe permitir recontacto en UI.");
assert.ok(closed.includes("recordedDeal.stage = STAGES.CONTACTED"), "El nuevo deal debe quedar Contactado.");
assert.ok(closed.includes("newDeal.ownerUserId = user.id"), "El agente que recontacta debe quedar asignado.");
assert.ok(closed.includes("createdDealId: recordedDeal.id"), "La API debe devolver el nuevo deal.");
assert.ok(launcher.includes("applyV2638CoreUiPatches"), "Producción debe mantener V26.38 UI.");
assert.ok(launcher.includes("applyV2638ServerPatches"), "Producción debe mantener V26.38 backend.");
assert.ok(launcher.includes("applyV2645CoreUiPatches"), "Producción debe mantener el chat tipo Bandeja unificada.");

console.log("OK · V26.46 mobile completo, anti-flash y recontacto cerrado validados.");
