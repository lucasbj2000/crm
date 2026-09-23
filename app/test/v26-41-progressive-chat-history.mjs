import assert from "node:assert/strict";
import { writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2641CoreUiPatches } from "../lib/v26-41-progressive-chat-history-patches.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const appDir=path.resolve(here,"..");

const source=`
// V26.40 DEFINITIVE_MOBILE_TOUCH_SCROLL
function scrollDrawerMessagesToLatest(list) {
  if (!list) return;
  list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
}

function renderDrawerMessages(deal, { force = false } = {}) {
  const list = ensureDrawerMessageScrollArea();
  if (!list || !deal) return;
  const messages = (deal.messages || []).slice(-80);
  const signature = JSON.stringify(messages);
  const sameDeal = list.dataset.dealId === String(deal.id || "");
  const unchanged = sameDeal && list.dataset.messageSignature === signature;
  if (!force && unchanged) return;
  const appendedMessage = false;
  const shouldScrollBottom = force || !sameDeal || (appendedMessage && list.dataset.v2626ManualBrowsing !== "1");
  list.innerHTML = messages.map((message) => String(message.text || "")).join("");
}

function renderDrawer() {}
`;

const patched=applyV2641CoreUiPatches(source);
for(const marker of [
  "V26.41 PROGRESSIVE_CHAT_HISTORY",
  "slice(-visibleCount)",
  "v2641VisibleCount",
  "Cargar 50 anteriores",
  "current + 50",
  "v2641LoadingOlder",
  "previousScrollTop + delta",
  "overflow-y:auto!important",
  "overflow:visible!important",
  "v2641ConversationScroller",
]) assert.ok(patched.includes(marker),`Falta V26.41: ${marker}`);

assert.equal(applyV2641CoreUiPatches(patched),patched,"V26.41 debe ser idempotente.");

const temp=path.join(appDir,".v2641-check.js");
await writeFile(temp,patched,"utf8");
try {
  const syntax=spawnSync(process.execPath,["--check",temp],{encoding:"utf8"});
  assert.equal(syntax.status,0,`Bundle V26.41 inválido:\n${syntax.stderr||syntax.stdout}`);
} finally { await rm(temp,{force:true}); }

console.log("OK · V26.41 historial de 50 en 50 y conversación mobile sin scroll interno.");
