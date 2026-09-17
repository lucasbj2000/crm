const MARKER = "// V26.26 MESSAGING_SCROLL_DRAFT_FIX";

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`V26.26: no se encontró ${label}`);
  return source.replace(search, replacement);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`V26.26: no se encontró ${label}`);
  return source.replace(pattern, replacement);
}

const NATIVE_SCROLL_FUNCTIONS = String.raw`
function v2626CancelPendingDrawerAutoScroll(list) {
  if (!list) return;
  const next = Number(list.dataset.v2626AutoScrollGeneration || 0) + 1;
  list.dataset.v2626AutoScrollGeneration = String(next);
  list.dataset.v2626ManualBrowsing = "1";
}

function v2626BindDrawerNativeScroll(list) {
  if (!list || list.dataset.v2626NativeScrollBound === "1") return;
  list.dataset.v2626NativeScrollBound = "1";
  const cancelPending = () => v2626CancelPendingDrawerAutoScroll(list);
  list.addEventListener("wheel", cancelPending, { passive: true });
  list.addEventListener("touchstart", cancelPending, { passive: true });
  list.addEventListener("pointerdown", cancelPending, { passive: true });
  list.addEventListener("scroll", () => {
    const distance = Math.max(0, drawerMessagesMaxScroll(list) - list.scrollTop);
    if (distance <= 4) list.dataset.v2626ManualBrowsing = "0";
  }, { passive: true });
}

function scrollDrawerMessagesToLatest(list) {
  if (!list) return;
  v2626BindDrawerNativeScroll(list);
  const generation = Number(list.dataset.v2626AutoScrollGeneration || 0) + 1;
  list.dataset.v2626AutoScrollGeneration = String(generation);
  list.dataset.v2626ManualBrowsing = "0";
  const scroll = () => {
    if (!list.isConnected) return;
    if (Number(list.dataset.v2626AutoScrollGeneration || 0) !== generation) return;
    list.scrollTop = drawerMessagesMaxScroll(list);
  };
  requestAnimationFrame(() => requestAnimationFrame(scroll));
  setTimeout(scroll, 80);
  setTimeout(scroll, 240);
  setTimeout(scroll, 520);
  list.querySelectorAll("img").forEach((image) => {
    if (!image.complete) image.addEventListener("load", scroll, { once: true });
  });
}
`;

const APPEND = String.raw`

// V26.26 MESSAGING_SCROLL_DRAFT_FIX
function v2626InstallNativeScrollStyle() {
  if (document.querySelector("#v2626-native-chat-scroll-style")) return;
  const style = document.createElement("style");
  style.id = "v2626-native-chat-scroll-style";
  style.textContent = [
    ".drawer-workspace{min-height:0!important;overflow:hidden!important}",
    ".deal-chat-column[data-drawer-pane='conversation']{min-height:0!important;overflow:hidden!important}",
    ".chat-only-section{min-height:0!important;overflow:hidden!important}",
    ".chat-only-section #drawer-messages{flex:1 1 0!important;height:0!important;min-height:0!important;max-height:none!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior-y:contain!important;touch-action:pan-y!important;pointer-events:auto!important;scroll-behavior:auto!important;-webkit-overflow-scrolling:touch!important}",
    ".chat-only-section #drawer-messages>.message{pointer-events:auto!important}",
    "@media(max-width:900px){.drawer-workspace{overflow-y:auto!important}.deal-chat-column[data-drawer-pane='conversation']{overflow:hidden!important}.chat-only-section #drawer-messages{overflow-y:auto!important;touch-action:pan-y!important}}",
  ].join("\n");
  document.head.appendChild(style);
}

function v2626StorageRemove(key) {
  if (!key) return;
  try { sessionStorage.removeItem(key); } catch {}
}

function v2626StorageSave(key, value) {
  if (!key) return;
  try {
    if (String(value || "").trim()) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {}
}

function v2626TrackSendCompletion(button, textarea, key) {
  if (!button || !textarea || !key) return;
  let sawBusy = button.disabled === true;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    observer.disconnect();
    if (textarea.value.trim()) v2626StorageSave(key, textarea.value);
    else v2626StorageRemove(key);
    try { if (typeof v2625ResizeComposer === "function") v2625ResizeComposer(textarea); } catch {}
  };
  const observer = new MutationObserver(() => {
    if (button.disabled) sawBusy = true;
    if (sawBusy && !button.disabled) finish();
  });
  observer.observe(button, { attributes: true, attributeFilter: ["disabled"] });
  setTimeout(() => {
    if (button.disabled) sawBusy = true;
    if (sawBusy && !button.disabled) finish();
  }, 0);
  setTimeout(finish, 60000);
}

function v2626PrepareDraftForSend(formId) {
  if (formId === "message-form") {
    const textarea = document.querySelector("#manual-message");
    const dealId = typeof v2625DealId === "function" ? v2625DealId() : String(document.querySelector("#drawer-messages")?.dataset?.dealId || "");
    const key = typeof v2625DraftKey === "function" ? v2625DraftKey("deal-draft", dealId) : (dealId ? "iciia:v2625:deal-draft:" + dealId : "");
    if (!textarea || !textarea.value.trim() || !key) return;
    v2626StorageRemove(key);
    v2626TrackSendCompletion(document.querySelector("#message-form button[type='submit']"), textarea, key);
    return;
  }
  if (formId === "v2511-composer") {
    const textarea = document.querySelector("#v2511-message");
    const inboxId = typeof v2625InboxId === "function" ? v2625InboxId() : String(document.querySelector("#v2511-list [data-v2511-conversation].active")?.dataset?.v2511Conversation || "");
    const key = typeof v2625DraftKey === "function" ? v2625DraftKey("inbox-draft", inboxId) : (inboxId ? "iciia:v2625:inbox-draft:" + inboxId : "");
    if (!textarea || !textarea.value.trim() || !key) return;
    v2626StorageRemove(key);
    v2626TrackSendCompletion(document.querySelector("#v2511-send"), textarea, key);
  }
}

function v2626InstallMessagingFix() {
  v2626InstallNativeScrollStyle();
  const list = document.querySelector("#drawer-messages");
  if (list && typeof v2626BindDrawerNativeScroll === "function") v2626BindDrawerNativeScroll(list);
  document.addEventListener("submit", (event) => {
    const id = event.target?.id || "";
    if (id === "message-form" || id === "v2511-composer") v2626PrepareDraftForSend(id);
  }, true);
  const observer = new MutationObserver(() => {
    const current = document.querySelector("#drawer-messages");
    if (current && typeof v2626BindDrawerNativeScroll === "function") v2626BindDrawerNativeScroll(current);
  });
  observer.observe(document.body, { subtree: true, childList: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", v2626InstallMessagingFix, { once: true });
else v2626InstallMessagingFix();
`;

export function applyV2626CoreUiPatches(source) {
  if (source.includes(MARKER)) return source;
  if (!source.includes("// V26.25 AGENT_MESSAGING_EXPERIENCE")) throw new Error("V26.26 requiere V26.25 aplicado antes.");

  source = replaceRegexOnce(
    source,
    /function scrollDrawerMessagesToLatest\(list\) \{[\s\S]*?\n\}\n\nfunction renderDrawerMessages/,
    `${NATIVE_SCROLL_FUNCTIONS}\nfunction renderDrawerMessages`,
    "scrollDrawerMessagesToLatest de V26.17"
  );

  source = replaceOnce(
    source,
    "  return $(\"#drawer-messages\");\n}",
    "  const list = $(\"#drawer-messages\");\n  v2626BindDrawerNativeScroll(list);\n  return list;\n}",
    "retorno de ensureDrawerMessageScrollArea"
  );

  source = replaceOnce(
    source,
    "    setState(next);\n    $(\"#manual-message\").value = \"\";\n    resizeMessageComposer();",
    "    try { if (typeof v2625DraftKey === \"function\") sessionStorage.removeItem(v2625DraftKey(\"deal-draft\", String(dealId || \"\"))); } catch {}\n    setState(next);\n    $(\"#manual-message\").value = \"\";\n    resizeMessageComposer();",
    "limpieza del borrador al enviar mensaje"
  );

  return source + APPEND;
}
