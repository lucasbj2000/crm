import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyV2640CoreUiPatches } from "../lib/v26-40-definitive-mobile-touch-scroll-patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const v39 = await readFile(path.join(appDir, "lib", "v26-39-mobile-chat-layout-patches.mjs"), "utf8");
const raw = await readFile(path.join(appDir, "public", "app.js"), "utf8");
assert.ok(v39.includes("V26.39 MOBILE_CHAT_LAYOUT_FIX"), "V26.39 debe existir.");

const synthetic = raw + "\n// V26.39 MOBILE_CHAT_LAYOUT_FIX\n" +
  'function __v2640Synthetic(){ const force=false,sameDeal=true,appendedMessage=true,list={dataset:{v2626ManualBrowsing:"1"}}; const shouldScrollBottom = force || !sameDeal || appendedMessage; return shouldScrollBottom; }\n';
const patched = applyV2640CoreUiPatches(synthetic);

for (const marker of [
  "V26.40 DEFINITIVE_MOBILE_TOUCH_SCROLL",
  'addEventListener("touchmove"',
  "{ passive: false }",
  "event.preventDefault()",
  "before - dy",
  "v2640-touching",
  "v2640SuppressClickUntil",
  "v2626CancelPendingDrawerAutoScroll",
  'appendedMessage && list.dataset.v2626ManualBrowsing !== "1"',
]) assert.ok(patched.includes(marker), `Falta V26.40: ${marker}`);

assert.equal(applyV2640CoreUiPatches(patched), patched, "V26.40 debe ser idempotente.");

const temp=path.join(appDir,".v2640-check.js");
await writeFile(temp,patched,"utf8");
try {
  const syntax=spawnSync(process.execPath,["--check",temp],{encoding:"utf8"});
  assert.equal(syntax.status,0,`Bundle V26.40 inválido:\n${syntax.stderr||syntax.stdout}`);
} finally { await rm(temp,{force:true}); }

const launcher=await readFile(path.join(appDir,"server.mjs"),"utf8");
assert.ok(launcher.includes("applyV2640CoreUiPatches"),"server.mjs debe activar V26.40");
assert.ok(launcher.indexOf("applyV2640CoreUiPatches(patchedPublicApp)") > launcher.indexOf("applyV2639CoreUiPatches(patchedPublicApp)"),"V26.40 debe ejecutarse después de V26.39");

console.log("OK · V26.40 touchmove manual + protección de auto-scroll validados.");
