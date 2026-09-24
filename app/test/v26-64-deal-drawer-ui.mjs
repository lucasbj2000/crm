import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const appDir=path.resolve(here,"..");
const css=await readFile(path.join(appDir,"public","v26-64-deal-drawer.css"),"utf8");

for(const marker of [
  "V26.64 · DEAL DRAWER FORMAL UI",
  "@media (min-width:901px)",
  "width:min(1180px,82vw)!important",
  "grid-template-columns:minmax(0,1fr) minmax(330px,370px)!important",
  "#deal-drawer .v2651-chat-actions>button",
  "#deal-drawer .v2645-ai-row>button",
  "#deal-drawer .v2625-latest-button",
  "#deal-drawer .drawer-mobile-tabs>button.active",
  "Mantener el pedido anterior: no mostrar estas herramientas en mobile",
  ".v2645-composer > .quick-reply-bar",
  ".v2645-composer > .message-tools"
]) assert.ok(css.includes(marker), "Falta V26.64: "+marker);

const index=await readFile(path.join(appDir,"public","index.html"),"utf8");
assert.ok(index.includes('/v26-64-deal-drawer.css?v=26.64'),"index debe cargar V26.64.");
assert.ok(index.indexOf('/v26-64-deal-drawer.css?v=26.64')>index.indexOf('/v23-1.css'),"V26.64 debe cargar después del CSS legacy.");

const sw=await readFile(path.join(appDir,"public","sw.js"),"utf8");
assert.ok(sw.includes('const CACHE = "whatsbot-mobile-v26-64-formal-deal-drawer"'),"SW debe invalidar cache V26.64.");
assert.ok(sw.includes('"/v26-64-deal-drawer.css"'),"SW debe incluir CSS V26.64.");

console.log("OK · V26.64 drawer formal desktop/mobile, layout de dos columnas y composer mobile limpio validados.");
