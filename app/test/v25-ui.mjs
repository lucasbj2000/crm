import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));const app=path.resolve(here,"..");const js=await readFile(path.join(app,"public","v25.js"),"utf8");const css=await readFile(path.join(app,"public","v25.css"),"utf8");const loader=await readFile(path.join(app,"public","v22.js"),"utf8");
for(const marker of ["v25-whatsapp-inbox","v25-chat","#crm-board [data-deal-id]","/api/deals/${encodeURIComponent(deal.id)}/message","Responder clientes desde WhatsApp y bot","La sesión venció"]){assert.ok(js.includes(marker),`Falta contrato V25 UI: ${marker}`)}
assert.ok(css.includes(".v25-chat-panel")&&css.includes("@media(max-width:820px)"),"El centro V25 no tiene adaptación móvil.");assert.ok(loader.includes('/v25.js?v=25.0')&&loader.includes('/v25.css?v=25.0'),"El loader no carga V25.");console.log("OK · contratos del Centro de Conversaciones V25 validados.");
