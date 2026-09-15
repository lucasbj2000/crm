import { applyV2620AutoBranchRoutingPatches } from "./v26-20-auto-branch-routing-patches.mjs";

const CORE_INCOMING = "queueIncomingSuperAutomation({deal,text,line,created,message:{text,id:item.id}}); if(data.settings.botEnabled&&line.botEnabled!==false&&deal.botActive&&text)void maybeReplyWithBot(deal,text);";
const V24_INCOMING = "queueIncomingSuperAutomation({deal,text:v24BotText||text,line,created,message:{text:v24BotText||text,id:item.id}}); if(data.settings.botEnabled&&line.botEnabled!==false&&deal.botActive&&(v24BotText||text))void maybeReplyWithBot(deal,v24BotText||text);";
const V2620_CORE_RESULT = "queueIncomingSuperAutomation({deal,text,line,created,message:{text,id:item.id}}); if(text)void v2620RouteIncomingOrBot(deal,text,{created,lineEnabled:line.botEnabled!==false});";
const V2620_V24_RESULT = "queueIncomingSuperAutomation({deal,text:v24BotText||text,line,created,message:{text:v24BotText||text,id:item.id}}); if(v24BotText||text)void v2620RouteIncomingOrBot(deal,v24BotText||text,{created,lineEnabled:line.botEnabled!==false});";

export function applyV2620AutoBranchRoutingStable(source) {
  let prepared = source;
  let restoreV24 = false;

  // V24 amplía el texto entrante con transcripción/visión antes de que V26.20 se aplique.
  // Normalizamos temporalmente ese bloque para reutilizar el parche V26.20 y luego
  // restauramos v24BotText, evitando perder comprensión de audio/imagen en el routing.
  if (!prepared.includes(CORE_INCOMING) && prepared.includes(V24_INCOMING)) {
    prepared = prepared.replace(V24_INCOMING, CORE_INCOMING);
    restoreV24 = true;
  }

  const patched = applyV2620AutoBranchRoutingPatches(prepared);
  if (!restoreV24) return patched;
  if (!patched.includes(V2620_CORE_RESULT)) {
    throw new Error("V26.20 wrapper: no se encontró el resultado del hook entrante para restaurar V24.");
  }
  return patched.replace(V2620_CORE_RESULT, V2620_V24_RESULT);
}
