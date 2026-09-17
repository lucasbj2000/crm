const CORE_MARKER = "// V26.28 EMOJI_MESSAGE_REPLIES";
const SERVER_MARKER = "// V26.28 MESSAGE_REPLY_PROVIDER";

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`V26.28: no se encontró ${label}`);
  return source.replace(search, replacement);
}

const CORE_APPEND = String.raw`

// V26.28 EMOJI_MESSAGE_REPLIES
let v2628ReplyState = null;

function v2628CurrentDeal() {
  try {
    return (appState?.deals || []).find((deal) => String(deal.id || "") === String(selectedDealId || "")) || null;
  } catch {
    return null;
  }
}

function v2628VisibleMessages() {
  return (v2628CurrentDeal()?.messages || []).slice(-80);
}

function v2628ActiveReplyMessageId() {
  return v2628ReplyState?.messageId || "";
}

function v2628MessageAuthor(message) {
  if (!message) return "Mensaje";
  if (message.direction === "incoming") return "Cliente";
  if (message.origin === "human") return message.agentName || "Asesor";
  if (message.origin === "bot") return "Bot";
  return "Mensaje enviado";
}

function v2628MessagePreview(message) {
  const text = String(message?.text || "").trim();
  if (text) return text.slice(0, 180);
  const attachment = message?.attachment || {};
  return String(attachment.fileName || attachment.name || attachment.kind || "Archivo adjunto").slice(0, 180);
}

function v2628InstallStyle() {
  if (document.querySelector("#v2628-message-tools-style")) return;
  const style = document.createElement("style");
  style.id = "v2628-message-tools-style";
  style.textContent = [
    ".chat-only-section #drawer-messages>.message{position:relative!important;padding-right:38px!important}",
    ".v2628-reply-message{position:absolute;top:7px;right:7px;width:25px;height:25px;border:1px solid rgba(61,88,76,.16);border-radius:8px;background:rgba(255,255,255,.88);color:#4c655a;font-size:14px;line-height:1;display:grid;place-items:center;opacity:0;cursor:pointer;transition:opacity .12s ease}",
    ".message:hover>.v2628-reply-message,.v2628-reply-message:focus{opacity:1}",
    ".message.outgoing>.v2628-reply-message{background:rgba(255,255,255,.7)}",
    ".v2628-history-quote{margin:0 0 7px;padding:7px 9px;border-left:3px solid #6d927f;border-radius:7px;background:rgba(84,119,102,.08);max-width:100%;overflow:hidden}",
    ".v2628-history-quote b{display:block;margin-bottom:2px;font-size:9px;color:#476456}",
    ".v2628-history-quote span{display:block;font-size:10px;line-height:1.3;color:#67756f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".v2628-reply-preview{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid #e3e9e6;background:#f8faf9}",
    ".v2628-reply-preview-copy{min-width:0;flex:1}",
    ".v2628-reply-preview-copy b{display:block;font-size:9px;color:#416151;margin-bottom:2px}",
    ".v2628-reply-preview-copy span{display:block;font-size:10px;color:#6d7b75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".v2628-reply-cancel{width:28px;height:28px;border:0;border-radius:8px;background:#eef2f0;color:#5f6f67;font-size:16px;cursor:pointer}",
    ".v2628-emoji-button{width:34px;height:32px!important;padding:0!important;font-size:17px!important;display:grid!important;place-items:center!important}",
    ".v2628-emoji-panel{position:absolute;left:14px;bottom:104px;z-index:16;width:min(310px,calc(100% - 28px));padding:10px;border:1px solid #dbe3df;border-radius:14px;background:#fff;box-shadow:0 12px 32px rgba(28,50,41,.18)}",
    ".v2628-emoji-panel[hidden]{display:none!important}",
    ".v2628-emoji-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:3px}",
    ".v2628-emoji-grid button{height:32px;border:0;border-radius:7px;background:transparent;font-size:19px;cursor:pointer}",
    ".v2628-emoji-grid button:hover{background:#f0f4f2}",
    "body.xp-dark .v2628-emoji-panel{background:#202522;border-color:#333b37}",
    "body.xp-dark .v2628-reply-preview{background:#1b201d;border-color:#303733}",
    "@media(max-width:900px){.v2628-reply-message{opacity:.72}.v2628-emoji-panel{left:8px;bottom:100px;width:calc(100% - 16px)}}",
  ].join("\n");
  document.head.appendChild(style);
}

function v2628EnsureReplyPreview() {
  const form = document.querySelector("#message-form");
  if (!form?.parentElement) return null;
  let preview = form.parentElement.querySelector(":scope > .v2628-reply-preview");
  if (!v2628ReplyState) {
    preview?.remove();
    return null;
  }
  if (!preview) {
    preview = document.createElement("div");
    preview.className = "v2628-reply-preview";
    preview.innerHTML = '<div class="v2628-reply-preview-copy"><b></b><span></span></div><button type="button" class="v2628-reply-cancel" aria-label="Cancelar respuesta">×</button>';
    form.parentElement.insertBefore(preview, form);
    preview.querySelector(".v2628-reply-cancel")?.addEventListener("click", () => v2628ClearReply());
  }
  preview.querySelector("b").textContent = "Respondiendo a " + (v2628ReplyState.author || "mensaje");
  preview.querySelector("span").textContent = v2628ReplyState.preview || "Mensaje";
  return preview;
}

function v2628SetReply(message) {
  if (!message?.id) return;
  v2628ReplyState = {
    messageId: String(message.id),
    author: v2628MessageAuthor(message),
    preview: v2628MessagePreview(message),
    dealId: String(selectedDealId || ""),
  };
  v2628EnsureReplyPreview();
  const box = document.querySelector("#manual-message");
  box?.focus();
}

function v2628ClearReply() {
  v2628ReplyState = null;
  document.querySelector(".v2628-reply-preview")?.remove();
}

function v2628SyncMessageActions() {
  const list = document.querySelector("#drawer-messages");
  if (!list) return;
  const deal = v2628CurrentDeal();
  if (!deal) return;
  if (v2628ReplyState && v2628ReplyState.dealId !== String(deal.id || "")) v2628ClearReply();
  const messages = (deal.messages || []).slice(-80);
  const nodes = [...list.querySelectorAll(":scope > .message")];
  nodes.forEach((node, index) => {
    const message = messages[index];
    if (!message) return;
    node.dataset.v2628MessageId = String(message.id || "");

    if (message.replyTo && !node.querySelector(".v2628-history-quote")) {
      const quote = document.createElement("div");
      quote.className = "v2628-history-quote";
      const author = document.createElement("b");
      author.textContent = message.replyTo.author || (message.replyTo.direction === "incoming" ? "Cliente" : "Mensaje citado");
      const text = document.createElement("span");
      text.textContent = message.replyTo.text || "Mensaje";
      quote.append(author, text);
      node.insertBefore(quote, node.firstChild);
    }

    if (message.direction === "system" || node.querySelector(".v2628-reply-message")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "v2628-reply-message";
    button.title = "Responder a este mensaje";
    button.setAttribute("aria-label", "Responder a este mensaje");
    button.textContent = "↩";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      v2628SetReply(message);
    });
    node.appendChild(button);
  });
}

function v2628InsertEmoji(emoji) {
  const textarea = document.querySelector("#manual-message");
  if (!textarea || textarea.disabled) return;
  const start = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length;
  const end = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : start;
  textarea.setRangeText(emoji, start, end, "end");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

function v2628EnsureEmojiPicker() {
  const section = document.querySelector(".chat-only-section");
  const tools = section?.querySelector(".message-tools");
  if (!section || !tools) return;
  let button = tools.querySelector(".v2628-emoji-button");
  let panel = section.querySelector(".v2628-emoji-panel");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "v2628-emoji-button";
    button.title = "Emojis";
    button.setAttribute("aria-label", "Abrir emojis");
    button.textContent = "😊";
    tools.insertBefore(button, tools.firstChild);
  }
  if (!panel) {
    const emojis = ["😀","😁","😂","😊","😍","🥰","😎","🤗","🙂","😉","😅","😄","👍","👏","🙌","🙏","👌","✅","💚","❤️","🔥","🎉","✨","💯","📌","📍","📦","🚚","💰","💳","🛒","☎️","📲","🕐","👋","🤝","😃","😌","🤔","😢"];
    panel = document.createElement("div");
    panel.className = "v2628-emoji-panel";
    panel.hidden = true;
    const grid = document.createElement("div");
    grid.className = "v2628-emoji-grid";
    emojis.forEach((emoji) => {
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = emoji;
      item.addEventListener("click", () => {
        v2628InsertEmoji(emoji);
        panel.hidden = true;
      });
      grid.appendChild(item);
    });
    panel.appendChild(grid);
    section.appendChild(panel);
  }
  if (button.dataset.v2628Bound !== "1") {
    button.dataset.v2628Bound = "1";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      panel.hidden = !panel.hidden;
    });
  }
}

function v2628SyncUi() {
  v2628InstallStyle();
  v2628EnsureEmojiPicker();
  v2628EnsureReplyPreview();
  v2628SyncMessageActions();
}

function v2628Install() {
  v2628SyncUi();
  document.addEventListener("click", (event) => {
    const panel = document.querySelector(".v2628-emoji-panel");
    if (panel && !panel.hidden && !event.target.closest(".v2628-emoji-panel,.v2628-emoji-button")) panel.hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const panel = document.querySelector(".v2628-emoji-panel");
      if (panel) panel.hidden = true;
      if (v2628ReplyState) v2628ClearReply();
    }
  });
  const observer = new MutationObserver(() => requestAnimationFrame(v2628SyncUi));
  observer.observe(document.body, { subtree: true, childList: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", v2628Install, { once: true });
else v2628Install();
`;

const SERVER_HELPERS = String.raw`

// V26.28 MESSAGE_REPLY_PROVIDER
function v2628ReplySource(deal, replyToMessageId) {
  const id = cleanText(replyToMessageId, 220);
  if (!id) return null;
  return (deal?.messages || []).find((message) => String(message?.id || "") === id) || null;
}

function v2628ReplySnapshot(message) {
  if (!message) return null;
  const attachment = message.attachment || {};
  const text = cleanText(message.text || attachment.fileName || attachment.name || attachment.kind || "Mensaje", 600);
  return {
    messageId: String(message.id || ""),
    text: text || "Mensaje",
    direction: message.direction || "",
    origin: message.origin || "",
    agentName: cleanText(message.agentName, 120),
    author: message.direction === "incoming" ? "Cliente" : (message.origin === "human" ? cleanText(message.agentName || "Asesor", 120) : message.origin === "bot" ? "Bot" : "Mensaje enviado"),
  };
}

function v2628BuildQrQuotedMessage(deal, message) {
  if (!deal?.jid || !message?.id) return null;
  const snapshot = v2628ReplySnapshot(message);
  const seconds = Math.floor(new Date(message.at || Date.now()).getTime() / 1000);
  return {
    key: {
      remoteJid: deal.jid,
      fromMe: message.direction === "outgoing",
      id: String(message.id),
    },
    message: { conversation: snapshot?.text || "Mensaje" },
    messageTimestamp: Number.isFinite(seconds) ? seconds : undefined,
    pushName: message.direction === "incoming" ? cleanText(deal.name || "Cliente", 120) : cleanText(message.agentName || "Asesor", 120),
  };
}
`;

export function applyV2628CoreUiPatches(source) {
  if (source.includes(CORE_MARKER)) return source;
  if (!source.includes("// V26.27 DRAWER_HISTORY_SCROLL")) throw new Error("V26.28 requiere V26.27 aplicado antes.");

  source = replaceOnce(
    source,
    "      body: JSON.stringify({ text })",
    "      body: JSON.stringify({ text, replyToMessageId: (typeof v2628ActiveReplyMessageId === \\\"function\\\" ? v2628ActiveReplyMessageId() : null) })",
    "payload de envío manual"
  );

  source = replaceOnce(
    source,
    "    $(\"#manual-message\").value = \"\";\n    resizeMessageComposer();\n    showToast(\"Mensaje enviado\");",
    "    $(\"#manual-message\").value = \"\";\n    if (typeof v2628ClearReply === \"function\") v2628ClearReply();\n    resizeMessageComposer();\n    showToast(\"Mensaje enviado\");",
    "limpieza de cita después del envío"
  );

  return source + CORE_APPEND;
}

export function applyV2628ServerPatches(source) {
  if (source.includes(SERVER_MARKER)) return source;

  source = replaceOnce(
    source,
    "async function sendProviderText(deal, text) {",
    `${SERVER_HELPERS}\nasync function sendProviderText(deal, text, options = {}) {`,
    "sendProviderText"
  );

  source = replaceOnce(
    source,
    "  const line=dealWhatsappLine(deal);\n  if(!line) throw new Error(\"La negociación no tiene una línea de WhatsApp disponible.\");",
    "  const line=dealWhatsappLine(deal);\n  if(!line) throw new Error(\"La negociación no tiene una línea de WhatsApp disponible.\");\n  const replySource = v2628ReplySource(deal, options?.replyToMessageId);",
    "resolución del mensaje citado"
  );

  source = replaceOnce(
    source,
    "    const result=await sendLineCloudPayload(line,{to:normalizePhone(deal.phone),type:\"text\",text:{body:text,preview_url:false}});",
    "    const payload={to:normalizePhone(deal.phone),type:\"text\",text:{body:text,preview_url:false}};\n    if(replySource?.id) payload.context={message_id:String(replySource.id)};\n    const result=await sendLineCloudPayload(line,payload);",
    "cita Cloud API"
  );

  source = replaceOnce(
    source,
    "  const sent=await socket.sendMessage(deal.jid,{text});",
    "  const quoted=v2628BuildQrQuotedMessage(deal,replySource);\n  const sent=await socket.sendMessage(deal.jid,{text},quoted?{quoted}:{});",
    "cita QR"
  );

  source = replaceOnce(
    source,
    "    const user = currentUser(request);\n    const text = cleanText(request.body?.text, 4000);",
    "    const user = currentUser(request);\n    const text = cleanText(request.body?.text, 4000);\n    const replyToMessageId = cleanText(request.body?.replyToMessageId, 220);",
    "replyToMessageId del endpoint"
  );

  source = replaceOnce(
    source,
    "    const temporaryGrant = v214ActiveCommunicationGrant(deal, user);\n    ensureDealOwnership(deal, user, { claim: true, allowTemporaryCommunication: true });\n    if (!text) throw new Error(\"Escribí un mensaje.\");\n    const messageId = await sendProviderText(deal, text);",
    "    const temporaryGrant = v214ActiveCommunicationGrant(deal, user);\n    ensureDealOwnership(deal, user, { claim: true, allowTemporaryCommunication: true });\n    if (!text) throw new Error(\"Escribí un mensaje.\");\n    const replySource = v2628ReplySource(deal, replyToMessageId);\n    const messageId = await sendProviderText(deal, text, { replyToMessageId: replySource?.id || \"\" });",
    "envío manual con cita"
  );

  const recordCall = "    recordHumanOutgoing(data, { jid: deal.jid, name: deal.name, text, messageId, userId: user.id, userName: user.name, branchId: deal.branchId, lineId: dealLineId(deal) });";
  source = replaceOnce(
    source,
    recordCall,
    `${recordCall}\n    if (replySource) {\n      const storedReply = [...(deal.messages || [])].reverse().find((message) => String(message?.id || \"\") === String(messageId || \"\"));\n      if (storedReply) storedReply.replyTo = v2628ReplySnapshot(replySource);\n    }`,
    "persistencia de cita"
  );

  return source;
}
