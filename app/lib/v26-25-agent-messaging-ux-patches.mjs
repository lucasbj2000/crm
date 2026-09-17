const MARKER = "// V26.25 AGENT_MESSAGING_EXPERIENCE";

const APPEND = String.raw`

// V26.25 AGENT_MESSAGING_EXPERIENCE
function v2625InstallMessagingStyle() {
  if (document.querySelector("#v2625-agent-messaging-style")) return;
  const style = document.createElement("style");
  style.id = "v2625-agent-messaging-style";
  style.textContent = [
    "#deal-drawer .drawer-panel{width:min(1380px,97vw)!important}",
    ".drawer-workspace{grid-template-columns:minmax(0,1fr) minmax(320px,370px)!important;background:#f3f5f4!important}",
    ".deal-chat-column{padding:14px!important;background:#f3f5f4!important}",
    ".chat-only-section{position:relative!important;border:1px solid #e1e6e3!important;border-radius:16px!important;overflow:hidden!important;box-shadow:0 8px 28px rgba(28,54,44,.055)!important}",
    ".chat-only-section .drawer-section-title{min-height:58px;padding:12px 16px!important;border-bottom:1px solid #e6ebe8!important;background:#fff!important}",
    ".chat-only-section .drawer-section-title h4{margin:0!important;font-size:15px!important}",
    ".chat-only-section .drawer-section-title small{display:block;margin-top:3px;color:#7a8680;font-size:10px}",
    ".chat-only-section .keyboard-hint{color:#88938e!important;font-size:9px!important}",
    ".v2625-focus-toggle{margin-left:auto;border:1px solid #dbe4df;background:#fff;color:#365347;border-radius:10px;padding:7px 10px;font-size:10px;font-weight:800;cursor:pointer;white-space:nowrap}",
    ".v2625-focus-toggle:hover{background:#f4f7f5}",
    "#deal-drawer.v2625-focus-mode .drawer-workspace{grid-template-columns:minmax(0,1fr)!important}",
    "#deal-drawer.v2625-focus-mode .deal-side-column{display:none!important}",
    "#deal-drawer.v2625-focus-mode .deal-chat-column{padding:14px 22px!important}",
    "#deal-drawer.v2625-focus-mode .chat-only-section{max-width:1040px;width:100%;margin:0 auto!important}",
    ".quick-reply-bar{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;padding:9px 12px!important;border-bottom:1px solid #e7ece9!important;background:#fbfcfb!important}",
    ".quick-reply-bar select{min-width:0!important;height:38px!important;border:1px solid #d9e2dd!important;border-radius:10px!important;background:#fff!important;padding:0 11px!important}",
    ".quick-reply-bar #insert-quick-reply{height:38px!important;padding:0 13px!important}",
    ".quick-reply-bar #send-quick-reply{display:none!important}",
    ".chat-only-section #drawer-messages{gap:10px!important;padding:18px 20px 24px!important;background:#f4f6f5!important;scrollbar-color:rgba(74,96,86,.34) transparent!important;scroll-padding-bottom:24px!important}",
    ".chat-only-section #drawer-messages>.message{justify-self:start!important;width:fit-content!important;max-width:min(76%,720px)!important;margin:0!important;padding:10px 13px!important;border:1px solid #e0e6e2!important;border-radius:14px 14px 14px 5px!important;background:#fff!important;box-shadow:0 2px 7px rgba(28,50,41,.045)!important;animation:none!important;transition:none!important;overflow-wrap:anywhere!important}",
    ".chat-only-section #drawer-messages>.message.outgoing{justify-self:end!important;border-color:#cee5d7!important;border-radius:14px 14px 5px 14px!important;background:#e8f5ed!important}",
    ".chat-only-section #drawer-messages>.message.system{justify-self:center!important;max-width:90%!important;border:0!important;border-radius:999px!important;background:#e8ecea!important;color:#607068!important;box-shadow:none!important;text-align:center!important}",
    ".chat-only-section #drawer-messages>.message p{margin:0!important;color:#263630!important;font-size:13px!important;line-height:1.48!important;white-space:pre-wrap!important}",
    ".chat-only-section #drawer-messages>.message small{display:block!important;margin-top:5px!important;color:#84918b!important;font-size:9px!important;line-height:1.25!important;text-align:right!important}",
    ".chat-only-section #drawer-messages>.message.system small{display:none!important}",
    ".chat-only-section #drawer-messages img{max-width:min(360px,100%)!important;height:auto!important;border-radius:10px!important}",
    ".modern-composer{display:flex!important;align-items:flex-end!important;gap:8px!important;padding:10px 12px!important;border-top:1px solid #e1e8e4!important;background:#fff!important}",
    ".modern-composer #manual-message{min-height:44px!important;max-height:132px!important;resize:none!important;overflow-y:auto!important;border:1px solid #cedbd4!important;border-radius:13px!important;background:#fff!important;padding:11px 13px!important;color:#23332d!important;font-size:13px!important;line-height:1.4!important;box-shadow:none!important}",
    ".modern-composer #manual-message:focus{border-color:#5b8a76!important;box-shadow:0 0 0 3px rgba(91,138,118,.12)!important;outline:0!important}",
    ".modern-composer .composer-send{flex:0 0 46px!important;width:46px!important;height:46px!important;border-radius:13px!important;box-shadow:none!important}",
    ".message-tools{display:flex!important;align-items:center!important;gap:7px!important;padding:7px 12px 10px!important;border-top:0!important;background:#fff!important}",
    ".message-tools>button{height:32px!important;border:1px solid #dbe3df!important;border-radius:9px!important;background:#fff!important;color:#42584f!important;font-size:10px!important;font-weight:750!important;padding:0 10px!important}",
    ".message-tools .composer-state{margin-left:auto!important;color:#8b9691!important;font-size:8px!important}",
    ".v2625-latest-button{position:absolute;right:22px;bottom:112px;z-index:8;border:1px solid #d5dfda;border-radius:999px;background:#fff;color:#29473a;padding:8px 12px;font-size:10px;font-weight:850;box-shadow:0 6px 18px rgba(26,49,40,.14);cursor:pointer}",
    ".v2625-latest-button[hidden]{display:none!important}",
    ".deal-side-column{background:#fbfcfb!important}",
    ".deal-side-pane{padding:14px!important}",
    ".deal-side-pane .copilot-card,.deal-side-pane .smart-data-card{box-shadow:none!important}",
    ".agent-ai-toolbar{gap:5px!important}",
    ".agent-ai-toolbar button{font-size:10px!important;padding:7px 9px!important}",
    "#v2511-unified-inbox{border-radius:16px!important;box-shadow:0 8px 30px rgba(28,54,44,.055)!important}",
    ".v2511-inbox-head{padding:16px 18px 11px!important}",
    ".v2511-inbox-head h3{font-size:18px!important}",
    ".v2511-inbox-head small{font-size:10px!important}",
    ".v2511-inbox-body{height:clamp(560px,68vh,760px)!important;min-height:0!important}",
    ".v2511-list-pane{min-height:0!important;overflow:hidden!important}",
    ".v2511-list{max-height:none!important;height:calc(100% - 66px)!important;overflow-y:auto!important}",
    ".v2511-row{border-radius:11px!important;padding:10px!important;margin:2px 0!important;transition:none!important;animation:none!important}",
    ".v2511-chat{min-height:0!important;height:100%!important;grid-template-rows:auto minmax(0,1fr) auto auto!important}",
    ".v2511-chat-head{padding:11px 14px!important}",
    ".v2511-messages{max-height:none!important;height:auto!important;min-height:0!important;padding:16px 18px 22px!important;background:#f4f6f5!important;scroll-behavior:auto!important}",
    ".v2511-message{width:fit-content!important;max-width:min(76%,720px)!important;margin:8px 0!important;padding:10px 13px!important;border:1px solid #e0e6e2!important;border-radius:14px 14px 14px 5px!important;background:#fff!important;box-shadow:0 2px 7px rgba(28,50,41,.045)!important;animation:none!important;transition:none!important}",
    ".v2511-message.out{margin-left:auto!important;border-color:#cee5d7!important;border-radius:14px 14px 5px 14px!important;background:#e8f5ed!important}",
    ".v2511-message p{font-size:13px!important;line-height:1.48!important}",
    ".v2511-message small{font-size:9px!important;color:#84918b!important}",
    ".v2511-ai-row{padding:7px 12px!important;background:#fbfcfb!important}",
    ".v2511-ai-row button{padding:7px 10px!important;font-size:10px!important}",
    ".v2511-composer{padding:9px 12px 11px!important}",
    ".v2511-quick{margin-bottom:7px!important}",
    ".v2511-write{align-items:flex-end!important}",
    ".v2511-write textarea{min-height:44px!important;max-height:132px!important;resize:none!important;overflow-y:auto!important;line-height:1.4!important}",
    ".v2511-write button{height:44px!important;min-width:82px!important}",
    "body.xp-dark .chat-only-section #drawer-messages,body.xp-dark .v2511-messages{background:#141715!important}",
    "body.xp-dark .chat-only-section #drawer-messages>.message,body.xp-dark .v2511-message{background:#202522!important;border-color:#303934!important;color:#f0f4f2!important}",
    "body.xp-dark .chat-only-section #drawer-messages>.message.outgoing,body.xp-dark .v2511-message.out{background:#173b2b!important;border-color:#285640!important}",
    "body.xp-dark .chat-only-section #drawer-messages>.message p{color:#eef3f0!important}",
    "@media(max-width:900px){.v2625-focus-toggle{display:none!important}.drawer-workspace{display:block!important}.deal-chat-column{padding:8px!important}.chat-only-section{border-radius:12px!important}.chat-only-section #drawer-messages{padding:13px 12px 18px!important}.chat-only-section #drawer-messages>.message{max-width:88%!important}.message-tools .composer-state{display:none!important}.v2625-latest-button{right:14px;bottom:106px}.v2511-inbox-body{height:auto!important;min-height:560px!important}.v2511-message{max-width:88%!important}}",
  ].join("\n");
  document.head.appendChild(style);
}

function v2625DealId() {
  try { return String(selectedDealId || document.querySelector("#drawer-messages")?.dataset?.dealId || ""); } catch { return String(document.querySelector("#drawer-messages")?.dataset?.dealId || ""); }
}

function v2625InboxId() {
  return String(document.querySelector("#v2511-list [data-v2511-conversation].active")?.dataset?.v2511Conversation || "");
}

function v2625DraftKey(kind, id) {
  return id ? "iciia:v2625:" + kind + ":" + id : "";
}

function v2625ResizeComposer(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  const next = Math.max(44, Math.min(132, textarea.scrollHeight || 44));
  textarea.style.height = next + "px";
  textarea.style.overflowY = (textarea.scrollHeight || 0) > 132 ? "auto" : "hidden";
}

function v2625RestoreDrafts() {
  const manual = document.querySelector("#manual-message");
  const dealId = v2625DealId();
  const dealKey = v2625DraftKey("deal-draft", dealId);
  if (manual && dealKey && !manual.value) {
    try { manual.value = sessionStorage.getItem(dealKey) || ""; } catch {}
  }
  v2625ResizeComposer(manual);

  const unified = document.querySelector("#v2511-message");
  const inboxId = v2625InboxId();
  const inboxKey = v2625DraftKey("inbox-draft", inboxId);
  if (unified && inboxKey && !unified.value) {
    try { unified.value = sessionStorage.getItem(inboxKey) || ""; } catch {}
  }
  v2625ResizeComposer(unified);
}

function v2625EnsureFocusToggle() {
  const title = document.querySelector(".chat-only-section .drawer-section-title");
  if (!title || title.querySelector(".v2625-focus-toggle")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "v2625-focus-toggle";
  const drawer = document.querySelector("#deal-drawer");
  let active = false;
  try { active = sessionStorage.getItem("iciia:v2625:focus-mode") === "1"; } catch {}
  if (active) drawer?.classList.add("v2625-focus-mode");
  const refresh = () => { button.textContent = drawer?.classList.contains("v2625-focus-mode") ? "Mostrar ficha e IA" : "Solo conversación"; };
  refresh();
  button.addEventListener("click", () => {
    drawer?.classList.toggle("v2625-focus-mode");
    try { sessionStorage.setItem("iciia:v2625:focus-mode", drawer?.classList.contains("v2625-focus-mode") ? "1" : "0"); } catch {}
    refresh();
  });
  title.appendChild(button);
}

function v2625EnsureLatestButton() {
  const section = document.querySelector(".chat-only-section");
  const list = document.querySelector("#drawer-messages");
  if (!section || !list) return;
  let button = section.querySelector(".v2625-latest-button");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "v2625-latest-button";
    button.textContent = "↓ Último mensaje";
    button.hidden = true;
    button.addEventListener("click", () => {
      try { if (typeof scrollDrawerMessagesToLatest === "function") scrollDrawerMessagesToLatest(list); else list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight); }
      catch { list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight); }
    });
    section.appendChild(button);
  }
  if (list.dataset.v2625ScrollBound !== "1") {
    list.dataset.v2625ScrollBound = "1";
    list.addEventListener("scroll", () => {
      const distance = Math.max(0, list.scrollHeight - list.clientHeight - list.scrollTop);
      button.hidden = distance < 90;
    }, { passive: true });
  }
  const distance = Math.max(0, list.scrollHeight - list.clientHeight - list.scrollTop);
  button.hidden = distance < 90;
}

function v2625SyncMessagingUi() {
  v2625InstallMessagingStyle();
  v2625EnsureFocusToggle();
  v2625EnsureLatestButton();
  const manual = document.querySelector("#manual-message");
  if (manual) manual.placeholder = "Escribí al cliente…";
  const unified = document.querySelector("#v2511-message");
  if (unified) unified.placeholder = "Escribí al cliente…";
  v2625RestoreDrafts();
}

let v2625SyncQueued = false;
function v2625QueueSync() {
  if (v2625SyncQueued) return;
  v2625SyncQueued = true;
  requestAnimationFrame(() => {
    v2625SyncQueued = false;
    v2625SyncMessagingUi();
  });
}

function v2625InstallMessagingExperience() {
  v2625SyncMessagingUi();

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (target.id === "manual-message") {
      v2625ResizeComposer(target);
      const key = v2625DraftKey("deal-draft", v2625DealId());
      if (key) { try { target.value ? sessionStorage.setItem(key, target.value) : sessionStorage.removeItem(key); } catch {} }
    }
    if (target.id === "v2511-message") {
      v2625ResizeComposer(target);
      const key = v2625DraftKey("inbox-draft", v2625InboxId());
      if (key) { try { target.value ? sessionStorage.setItem(key, target.value) : sessionStorage.removeItem(key); } catch {} }
    }
  }, true);

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-v2511-conversation],.deal-card,[data-deal-id]")) setTimeout(v2625QueueSync, 0);
  }, true);

  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "message-form" && event.target?.id !== "v2511-composer") return;
    const dealKey = v2625DraftKey("deal-draft", v2625DealId());
    const inboxKey = v2625DraftKey("inbox-draft", v2625InboxId());
    [450, 1200, 2500].forEach((delay) => setTimeout(() => {
      const manual = document.querySelector("#manual-message");
      const unified = document.querySelector("#v2511-message");
      try { if (dealKey && manual && !manual.value.trim()) sessionStorage.removeItem(dealKey); } catch {}
      try { if (inboxKey && unified && !unified.value.trim()) sessionStorage.removeItem(inboxKey); } catch {}
      v2625ResizeComposer(manual);
      v2625ResizeComposer(unified);
    }, delay));
  }, true);

  const observer = new MutationObserver(v2625QueueSync);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "aria-hidden", "hidden", "data-deal-id"] });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", v2625InstallMessagingExperience, { once: true });
else v2625InstallMessagingExperience();
`;

export function applyV2625CoreUiPatches(source) {
  if (source.includes(MARKER)) return source;
  return source + APPEND;
}
