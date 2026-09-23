const MARKER = "// V26.45 DEAL_CHAT_UNIFIED_INBOX_UI";

const APPEND = String.raw`

// V26.45 DEAL_CHAT_UNIFIED_INBOX_UI
(() => {
  function v2645InstallStyle() {
    if (document.getElementById("v2645-deal-chat-unified-style")) return;
    const style = document.createElement("style");
    style.id = "v2645-deal-chat-unified-style";
    style.textContent = [
      "#deal-drawer .chat-only-section.v2645-deal-chat{position:relative!important;display:grid!important;grid-template-columns:minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr) auto auto!important;width:100%!important;height:100%!important;min-height:0!important;max-height:100%!important;margin:0!important;padding:0!important;overflow:hidden!important;border:0!important;border-radius:0!important;background:#fff!important}",
      "#deal-drawer .chat-only-section.v2645-deal-chat>.drawer-section-title{display:none!important}",
      "#deal-drawer #drawer-messages.v2645-messages{grid-row:1!important;grid-column:1!important;position:relative!important;display:block!important;width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:18px!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior-y:contain!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important;scroll-behavior:auto!important;overflow-anchor:none!important;background:#f5f7f5!important;pointer-events:auto!important}",
      "#deal-drawer #drawer-messages.v2645-messages>.message.v2511-message{display:block!important;width:fit-content!important;max-width:min(76%,620px)!important;height:auto!important;min-height:0!important;margin:8px 0!important;padding:10px 12px!important;border:0!important;border-radius:14px 14px 14px 4px!important;background:#fff!important;box-shadow:0 2px 8px rgba(0,0,0,.04)!important;color:inherit!important;overflow:visible!important;overflow-wrap:anywhere!important;word-break:break-word!important;touch-action:pan-y!important}",
      "#deal-drawer #drawer-messages.v2645-messages>.message.v2511-message.out{margin-left:auto!important;margin-right:0!important;background:#dff2e5!important;border-radius:14px 14px 4px 14px!important}",
      "#deal-drawer #drawer-messages.v2645-messages>.message.v2511-message.in{margin-left:0!important;margin-right:auto!important}",
      "#deal-drawer #drawer-messages.v2645-messages>.message.v2511-message.system{max-width:90%!important;margin:8px auto!important;border-radius:999px!important;background:#e8ecea!important;box-shadow:none!important}",
      "#deal-drawer #drawer-messages.v2645-messages>.message.v2511-message p{margin:0!important;color:inherit!important;font-size:13px!important;line-height:1.45!important;white-space:pre-wrap!important;word-break:break-word!important}",
      "#deal-drawer #drawer-messages.v2645-messages>.message.v2511-message small{display:block!important;margin-top:5px!important;color:#7d8882!important;font-size:10px!important;line-height:1.25!important;text-align:right!important}",
      "#deal-drawer #drawer-messages.v2645-messages .attachment img,#deal-drawer #drawer-messages.v2645-messages img{max-width:min(260px,100%)!important;max-height:220px!important;border-radius:10px!important}",
      "#deal-drawer .v2645-ai-row{grid-row:2!important;grid-column:1!important;display:flex!important;align-items:center!important;gap:10px!important;width:100%!important;min-width:0!important;padding:9px 14px!important;border-top:1px solid #e6ece8!important;background:#fbfcfb!important}",
      "#deal-drawer .v2645-ai-row button{border:0!important;border-radius:10px!important;background:#e9f1ff!important;color:#174f91!important;padding:8px 11px!important;font-weight:800!important;cursor:pointer!important}",
      "#deal-drawer .v2645-ai-row span{min-width:0!important;overflow:hidden!important;color:#87918c!important;font-size:11px!important;text-overflow:ellipsis!important;white-space:nowrap!important}",
      "#deal-drawer .v2645-composer{grid-row:3!important;grid-column:1!important;display:block!important;width:100%!important;min-width:0!important;margin:0!important;padding:11px 14px 13px!important;border-top:1px solid #e5ebe7!important;background:#fff!important;z-index:7!important}",
      "#deal-drawer .v2645-composer .quick-reply-bar{position:relative!important;display:flex!important;grid-template-columns:none!important;align-items:center!important;gap:8px!important;width:100%!important;min-width:0!important;margin:0 0 8px!important;padding:0!important;overflow:visible!important;border:0!important;background:transparent!important}",
      "#deal-drawer .v2645-composer .quick-reply-bar select{flex:1 1 auto!important;grid-column:auto!important;width:auto!important;min-width:0!important;height:auto!important;min-height:38px!important;margin:0!important;padding:8px 10px!important;border:1px solid #d7e0dc!important;border-radius:10px!important;background:#fff!important;font-size:16px!important}",
      "#deal-drawer .v2645-composer .quick-reply-bar #insert-quick-reply{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;width:auto!important;min-width:76px!important;min-height:38px!important;margin:0!important;padding:8px 12px!important;border:1px solid #d7e0dc!important;border-radius:10px!important;background:#fff!important;color:inherit!important}",
      "#deal-drawer .v2645-composer .quick-reply-bar #send-quick-reply{display:none!important}",
      "#deal-drawer .v2645-composer #message-form{position:relative!important;inset:auto!important;display:flex!important;grid-template-columns:none!important;align-items:stretch!important;gap:8px!important;width:100%!important;min-width:0!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;z-index:auto!important}",
      "#deal-drawer .v2645-composer #manual-message{display:block!important;flex:1 1 auto!important;width:auto!important;min-width:0!important;min-height:44px!important;max-height:132px!important;margin:0!important;padding:10px 12px!important;overflow-y:auto!important;resize:none!important;border:1px solid #ccd8d2!important;border-radius:13px!important;background:#fff!important;color:inherit!important;font:inherit!important;font-size:16px!important;line-height:1.4!important;outline:0!important}",
      "#deal-drawer .v2645-composer #manual-message:focus{border-color:#4d806c!important;box-shadow:0 0 0 3px rgba(77,128,108,.12)!important}",
      "#deal-drawer .v2645-composer .composer-send{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;width:auto!important;min-width:92px!important;height:auto!important;min-height:46px!important;margin:0!important;padding:0 16px!important;border:0!important;border-radius:13px!important;background:#173f32!important;color:#fff!important;font-size:13px!important;font-weight:800!important;cursor:pointer!important}",
      "#deal-drawer .v2645-composer .message-tools{position:relative!important;display:flex!important;align-items:center!important;gap:7px!important;width:100%!important;min-width:0!important;margin:8px 0 0!important;padding:0!important;overflow-x:auto!important;overflow-y:hidden!important;border:0!important;background:transparent!important;z-index:auto!important;-webkit-overflow-scrolling:touch!important}",
      "#deal-drawer .v2645-composer .message-tools>button{flex:0 0 auto!important}",
      "#deal-drawer .v2645-composer .message-tools .composer-state{margin-left:auto!important;min-width:0!important;overflow:hidden!important;color:#87918c!important;font-size:10px!important;text-overflow:ellipsis!important;white-space:nowrap!important}",
      "#deal-drawer .v2645-composer .media-composer{position:relative!important;display:grid;max-height:32vh!important;margin:8px 0 0!important;padding:8px!important;overflow-y:auto!important;border:1px solid #e1e8e4!important;border-radius:12px!important;background:#f8faf9!important;z-index:auto!important}",
      "#deal-drawer .v2645-composer .media-composer[hidden]{display:none!important}",
      "#deal-drawer .v2645-composer .v2628-reply-preview{position:relative!important;margin:0 0 8px!important;border:1px solid #e3e9e6!important;border-radius:10px!important}",
      "#deal-drawer .v2625-latest-button{position:absolute!important;right:18px!important;bottom:164px!important;z-index:12!important}",
      "body.xp-dark #deal-drawer #drawer-messages.v2645-messages{background:#151817!important}",
      "body.xp-dark #deal-drawer #drawer-messages.v2645-messages>.message.v2511-message{background:#222724!important;color:#eef3f0!important}",
      "body.xp-dark #deal-drawer #drawer-messages.v2645-messages>.message.v2511-message.out{background:#234536!important}",
      "body.xp-dark #deal-drawer .v2645-ai-row,body.xp-dark #deal-drawer .v2645-composer{background:#191d1b!important;border-color:#303733!important}",
      "@media(max-width:760px){",
      "#deal-drawer .chat-only-section.v2645-deal-chat{grid-template-rows:minmax(0,1fr) auto auto!important}",
      "#deal-drawer #drawer-messages.v2645-messages{height:auto!important;min-height:0!important;max-height:none!important;padding:12px!important}",
      "#deal-drawer #drawer-messages.v2645-messages>.message.v2511-message{max-width:88%!important;margin:7px 0!important}",
      "#deal-drawer .v2645-ai-row{padding:8px 10px!important}",
      "#deal-drawer .v2645-ai-row span{display:none!important}",
      "#deal-drawer .v2645-composer{padding:9px 10px calc(9px + env(safe-area-inset-bottom))!important}",
      "#deal-drawer .v2645-composer .quick-reply-bar{gap:7px!important;margin-bottom:8px!important}",
      "#deal-drawer .v2645-composer .quick-reply-bar #insert-quick-reply{min-width:72px!important;padding:8px 10px!important}",
      "#deal-drawer .v2645-composer .composer-send{min-width:76px!important;padding:0 12px!important}",
      "#deal-drawer .v2645-composer .message-tools .composer-state{display:none!important}",
      "#deal-drawer .v2625-latest-button{right:12px!important;bottom:154px!important}",
      "}"
    ].join("");
    document.head.appendChild(style);
  }

  function v2645EnsureAiRow(section, composer) {
    let row = section.querySelector(":scope > .v2645-ai-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "v2645-ai-row";
      row.innerHTML = '<button type="button">✦ Sugerir con IA</button><span>La sugerencia nunca se envía sola.</span>';
      row.querySelector("button")?.addEventListener("click", () => {
        try {
          if (typeof setDrawerPane === "function") setDrawerPane("ai");
          else document.querySelector('[data-drawer-tab="ai"]')?.click();
          setTimeout(() => document.querySelector("#refresh-copilot")?.click(), 0);
        } catch {}
      });
    }
    if (row.parentElement !== section || row.nextElementSibling !== composer) {
      section.insertBefore(row, composer);
    }
    return row;
  }

  function v2645SyncMessageClasses(list) {
    if (!list) return;
    list.classList.add("v2511-messages", "v2645-messages");
    list.querySelectorAll(":scope > .message").forEach((node) => {
      node.classList.add("v2511-message");
      node.classList.toggle("out", node.classList.contains("outgoing"));
      node.classList.toggle("in", !node.classList.contains("outgoing") && !node.classList.contains("system"));
    });
  }

  function v2645EnsureComposer(section, list) {
    if (!section || !list) return null;
    let composer = section.querySelector(":scope > .v2645-composer");
    if (!composer) {
      composer = document.createElement("div");
      composer.className = "v2511-composer v2645-composer";
      list.insertAdjacentElement("afterend", composer);
    }

    const quick = section.querySelector(":scope > .quick-reply-bar") || composer.querySelector(".quick-reply-bar");
    const replyPreview = section.querySelector(":scope > .v2628-reply-preview") || composer.querySelector(".v2628-reply-preview");
    const form = section.querySelector(":scope > #message-form") || composer.querySelector("#message-form");
    const tools = section.querySelector(":scope > .message-tools") || composer.querySelector(".message-tools");
    const media = section.querySelector(":scope > #media-form") || composer.querySelector("#media-form");

    if (quick && quick.parentElement !== composer) composer.appendChild(quick);
    if (replyPreview && replyPreview.parentElement !== composer) composer.appendChild(replyPreview);
    if (form && form.parentElement !== composer) composer.appendChild(form);
    if (tools && tools.parentElement !== composer) composer.appendChild(tools);
    if (media && media.parentElement !== composer) composer.appendChild(media);

    const send = form?.querySelector(".composer-send");
    if (send && send.dataset.v2645Label !== "1") {
      send.dataset.v2645Label = "1";
      send.textContent = "Enviar";
      send.setAttribute("aria-label", "Enviar mensaje");
    }

    return composer;
  }

  function v2645Sync() {
    v2645InstallStyle();
    const section = document.querySelector("#deal-drawer .chat-only-section");
    const list = document.querySelector("#drawer-messages");
    if (!section || !list) return;

    section.classList.add("v2645-deal-chat");
    v2645SyncMessageClasses(list);
    const composer = v2645EnsureComposer(section, list);
    if (composer) v2645EnsureAiRow(section, composer);

    list.style.webkitOverflowScrolling = "touch";
    list.style.touchAction = "pan-y";
    list.style.overflowY = "auto";
  }

  function v2645Install() {
    v2645Sync();
    let queued = false;
    const queue = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        v2645Sync();
      });
    };
    new MutationObserver(queue).observe(document.body, { subtree:true, childList:true, attributes:true, attributeFilter:["class","hidden","aria-hidden"] });
    window.addEventListener("resize", queue, { passive:true });
    window.addEventListener("orientationchange", () => setTimeout(queue, 80), { passive:true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", v2645Install, { once:true });
  } else {
    v2645Install();
  }
})();
`;

export function applyV2645CoreUiPatches(source) {
  if (source.includes(MARKER)) return source;
  if (!source.includes("// V26.43 SIMPLE_RESPONSIVE_CONVERSATION")) {
    throw new Error("V26.45 requiere V26.43 aplicado antes.");
  }
  return source + APPEND;
}
