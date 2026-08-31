import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "..");
const js = await readFile(path.join(app, "public", "v25.js"), "utf8");
const css = await readFile(path.join(app, "public", "v25.css"), "utf8");
const guard = await readFile(path.join(app, "public", "v25-2-1.js"), "utf8");
const loader = await readFile(path.join(app, "public", "v22.js"), "utf8");
const sw = await readFile(path.join(app, "public", "sw.js"), "utf8");
const legacy = await readFile(path.join(app, "public", "app.js"), "utf8");

for (const marker of [
  "v252-whatsapp-shell",
  "v252-pending-badge",
  "PENDIENTE",
  "Ficha cliente",
  "Herramientas completas",
  "RESPUESTA RECOMENDADA",
  "AUTOCOMPLETADO DE CAMPOS",
  "/copilot-suggestion",
  "/data-suggestions",
  "/api/deals/${encodeURIComponent(deal.id)}/message",
  "openClientProfileFromInbox",
  "openLegacyTools",
  "Abrir ficha y conversación",
]) assert.ok(js.includes(marker), `Falta contrato V25.2 UI: ${marker}`);

assert.ok(!js.includes("stopImmediatePropagation"), "V25.2 no debe bloquear el listener original de Negociaciones.");
assert.ok(!js.includes("installNegotiationOpen"), "V25.2 no debe reemplazar el drawer completo con un capturador propio.");

for (const legacyMarker of [
  "function openDrawer(id)",
  "async function openClientProfile()",
  "function renderDrawerQuickReplies",
  "async function fetchCopilotSuggestion",
  "function renderSmartDataSuggestions",
  "/api/clients/${encodeURIComponent(deal.clientId)}/profile",
]) assert.ok(legacy.includes(legacyMarker), `Se perdió una herramienta legacy requerida: ${legacyMarker}`);

assert.ok(css.includes(".v252-shell") && css.includes(".v252-row.pending") && css.includes(".v252-message.pending") && css.includes("@media(max-width:680px)"), "La bandeja V25.2 no tiene diseño WhatsApp, pendientes rojos o adaptación móvil.");
assert.ok(guard.includes('target?.id === "crm-board"') && guard.includes("isRecursiveBoardWatch") && guard.includes("if (isRecursiveBoardWatch) return"), "V25.2.1 no protege contra el loop del MutationObserver del tablero.");
assert.ok(loader.indexOf('/v25-2-1.js?v=25.2.1') < loader.indexOf('/v25.js?v=25.2.1'), "El guard V25.2.1 debe cargarse antes que V25.");
assert.ok(loader.includes('/v25.css?v=25.2.1'), "El loader perdió la base visual V25.2.1.");
assert.ok(sw.includes('/v25-2-1.js'), "El service worker perdió el guard V25.2.1.");
assert.match(sw,/const CACHE = "whatsbot-mobile-v(?:25|26)-[^"\n]+";/,"El service worker no usa una caché de producción versionada.");

console.log("OK · V25.2.1 conserva herramientas y bloquea el loop del tablero.");
