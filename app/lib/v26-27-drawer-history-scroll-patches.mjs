const MARKER = "// V26.27 DRAWER_HISTORY_SCROLL";

const APPEND = String.raw`

// V26.27 DRAWER_HISTORY_SCROLL
function v2627InstallDrawerHistoryStyle() {
  if (document.querySelector("#v2627-drawer-history-style")) return;
  const style = document.createElement("style");
  style.id = "v2627-drawer-history-style";
  style.textContent = [
    "#deal-drawer .chat-only-section>.drawer-section-title{display:none!important}",
    "#deal-drawer .v2625-focus-toggle{display:none!important}",
    "#deal-drawer .drawer-content.drawer-workspace{min-height:0!important;overflow:hidden!important}",
    "#deal-drawer .deal-chat-column[data-drawer-pane='conversation']{display:flex!important;min-height:0!important;overflow:hidden!important;flex-direction:column!important}",
    "#deal-drawer .chat-only-section{display:flex!important;flex:1 1 0!important;height:100%!important;min-height:0!important;overflow:hidden!important;flex-direction:column!important}",
    "#deal-drawer .chat-only-section #drawer-messages{display:grid!important;align-content:start!important;grid-auto-rows:max-content!important;flex:1 1 0!important;height:auto!important;min-height:0!important;max-height:none!important;overflow-y:scroll!important;overflow-x:hidden!important;overscroll-behavior-y:contain!important;touch-action:pan-y!important;-webkit-overflow-scrolling:touch!important;scroll-behavior:auto!important;scrollbar-gutter:stable!important;pointer-events:auto!important}",
    "#deal-drawer .chat-only-section #drawer-messages>.message{height:auto!important;min-height:0!important;flex:0 0 auto!important}",
    "@media(max-width:900px){#deal-drawer .drawer-content.drawer-workspace{overflow:hidden!important}#deal-drawer .deal-chat-column[data-drawer-pane='conversation']{display:flex!important;height:calc(100dvh - 108px)!important;min-height:0!important;overflow:hidden!important}#deal-drawer .chat-only-section{height:100%!important;min-height:0!important}#deal-drawer .chat-only-section #drawer-messages{height:auto!important;min-height:0!important;overflow-y:scroll!important;touch-action:pan-y!important}}",
  ].join("\n");
  document.head.appendChild(style);
}

function v2627RemoveConversationHeader() {
  const drawer = document.querySelector("#deal-drawer");
  if (drawer) drawer.classList.remove("v2625-focus-mode");
  try { sessionStorage.removeItem("iciia:v2625:focus-mode"); } catch {}
  const title = document.querySelector(".chat-only-section > .drawer-section-title");
  if (title) title.remove();
}

function v2627WheelDelta(event, list) {
  const raw = Number(event.deltaY || 0);
  if (!raw) return 0;
  if (event.deltaMode === 1) return raw * 18;
  if (event.deltaMode === 2) return raw * Math.max(120, list.clientHeight || 0);
  return raw;
}

function v2627BindHistoryWheel(list) {
  if (!list || list.dataset.v2627HistoryWheelBound === "1") return;
  list.dataset.v2627HistoryWheelBound = "1";

  list.addEventListener("wheel", (event) => {
    if (!list.isConnected) return;
    if (typeof v2626CancelPendingDrawerAutoScroll === "function") {
      v2626CancelPendingDrawerAutoScroll(list);
    }

    const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
    if (maxScroll <= 0) return;

    const delta = v2627WheelDelta(event, list);
    if (!delta) return;

    const current = Number(list.scrollTop || 0);
    const next = Math.max(0, Math.min(maxScroll, current + delta));
    if (Math.abs(next - current) < 0.5) return;

    event.preventDefault();
    list.scrollTop = next;
    list.dataset.v2626ManualBrowsing = next < maxScroll - 4 ? "1" : "0";
  }, { passive: false });

  list.addEventListener("touchstart", () => {
    if (typeof v2626CancelPendingDrawerAutoScroll === "function") {
      v2626CancelPendingDrawerAutoScroll(list);
    }
  }, { passive: true });
}

function v2627SyncDrawerHistory() {
  v2627InstallDrawerHistoryStyle();
  v2627RemoveConversationHeader();
  const list = document.querySelector("#drawer-messages");
  if (list) v2627BindHistoryWheel(list);
}

function v2627InstallDrawerHistoryFix() {
  v2627SyncDrawerHistory();
  const observer = new MutationObserver(() => v2627SyncDrawerHistory());
  observer.observe(document.body, { subtree: true, childList: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", v2627InstallDrawerHistoryFix, { once: true });
} else {
  v2627InstallDrawerHistoryFix();
}
`;

export function applyV2627CoreUiPatches(source) {
  if (source.includes(MARKER)) return source;
  if (!source.includes("// V26.26 MESSAGING_SCROLL_DRAFT_FIX")) {
    throw new Error("V26.27 requiere V26.26 aplicado antes.");
  }
  return source + APPEND;
}
