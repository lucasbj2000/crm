import { applyV2620AutoBranchRoutingPatches } from "./v26-20-auto-branch-routing-patches.mjs";

const CORE_INCOMING = "queueIncomingSuperAutomation({deal,text,line,created,message:{text,id:item.id}}); if(data.settings.botEnabled&&line.botEnabled!==false&&deal.botActive&&text)void maybeReplyWithBot(deal,text);";
const V2620_CORE_RESULT = "queueIncomingSuperAutomation({deal,text,line,created,message:{text,id:item.id}}); if(text)void v2620RouteIncomingOrBot(deal,text,{created,lineEnabled:line.botEnabled!==false});";
const V2620_V24_RESULT = "queueIncomingSuperAutomation({deal,text:v24BotText||text,line,created,message:{text:v24BotText||text,id:item.id}}); if(v24BotText||text)void v2620RouteIncomingOrBot(deal,v24BotText||text,{created,lineEnabled:line.botEnabled!==false});";

const GENERATED_INCOMING_PATTERN = /queueIncomingSuperAutomation\(\{deal,text:[\s\S]{0,160}?line,created,message:\{text:[\s\S]{0,160}?id:item\.id\}\}\);\s*if\([\s\S]{0,280}?deal\.botActive[\s\S]{0,160}?\)\s*void\s+maybeReplyWithBot\(deal,[\s\S]{0,100}?\);/;

export function applyV2620AutoBranchRoutingStable(source) {
  let prepared = source;
  let restoreV24 = false;

  if (!prepared.includes(CORE_INCOMING)) {
    const matches = [...prepared.matchAll(new RegExp(GENERATED_INCOMING_PATTERN.source, "g"))];
    if (matches.length !== 1) {
      throw new Error(`V26.20 wrapper: esperaba 1 hook de mensaje entrante generado y encontró ${matches.length}.`);
    }
    restoreV24 = matches[0][0].includes("v24BotText");
    prepared = prepared.replace(GENERATED_INCOMING_PATTERN, CORE_INCOMING);
  }

  const patched = applyV2620AutoBranchRoutingPatches(prepared);
  if (!restoreV24) return patched;
  if (!patched.includes(V2620_CORE_RESULT)) {
    throw new Error("V26.20 wrapper: no se encontró el resultado del hook entrante para restaurar V24.");
  }
  return patched.replace(V2620_CORE_RESULT, V2620_V24_RESULT);
}
