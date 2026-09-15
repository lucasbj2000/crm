(() => {
  "use strict";

  const INBOX_PATH = "/api/omnichannel/inbox";
  const CACHE_TTL_MS = 2 * 60 * 1000;
  let lastInboxPayload = null;
  let lastInboxAt = 0;
  let lastActiveId = "";
  let installed = false;

  function pathOf(input) {
    try {
      const value = typeof input === "string" ? input : input?.url || "";
      return new URL(String(value), window.location.href).pathname;
    } catch {
      return String(input || "").split("?")[0];
    }
  }

  function activeConversationId() {
    const active = document.querySelector("#v2511-list [data-v2511-conversation].active");
    const id = active?.dataset?.v2511Conversation || "";
    if (id) lastActiveId = id;
    return id || lastActiveId;
  }

  function clonePayload(payload) {
    try { return structuredClone(payload); }
    catch { return JSON.parse(JSON.stringify(payload)); }
  }

  function messageKey(message, index = 0) {
    return String(message?.id || message?.providerMessageId || `${message?.createdAt || ""}|${message?.direction || ""}|${index}`);
  }

  function mergeMessages(previous, incoming) {
    const oldRows = Array.isArray(previous) ? previous : [];
    const newRows = Array.isArray(incoming) ? incoming : [];
    if (!oldRows.length) return newRows;
    if (!newRows.length) return oldRows;

    const merged = new Map();
    oldRows.forEach((message, index) => merged.set(messageKey(message, index), message));
    newRows.forEach((message, index) => merged.set(messageKey(message, index), message));
    return Array.from(merged.values())
      .sort((a, b) => String(a?.createdAt || "").localeCompare(String(b?.createdAt || "")))
      .slice(-250);
  }

  function stabilizeInbox(payload) {
    if (!payload || !Array.isArray(payload.conversations)) return payload;

    const activeId = activeConversationId();
    const previousConversations = Array.isArray(lastInboxPayload?.conversations) ? lastInboxPayload.conversations : [];
    const previousById = new Map(previousConversations.map((item) => [String(item.id), item]));
    const next = payload.conversations.map((item) => ({ ...item }));

    if (activeId && Date.now() - lastInboxAt < CACHE_TTL_MS) {
      const previous = previousById.get(String(activeId));
      const index = next.findIndex((item) => String(item.id) === String(activeId));

      if (index < 0 && previous) {
        next.unshift(previous);
      } else if (index >= 0 && previous) {
        const current = next[index];
        const incomingMessages = Array.isArray(current.messages) ? current.messages : [];
        const previousMessages = Array.isArray(previous.messages) ? previous.messages : [];
        const sameOrNewerConversation = !current.lastMessageAt || !previous.lastMessageAt || String(current.lastMessageAt) >= String(previous.lastMessageAt);

        if (sameOrNewerConversation && previousMessages.length && incomingMessages.length < previousMessages.length) {
          current.messages = mergeMessages(previousMessages, incomingMessages);
        }
      }
    }

    const result = { ...payload, conversations: next };
    lastInboxPayload = clonePayload(result);
    lastInboxAt = Date.now();
    return result;
  }

  function installFetchGuard() {
    const current = window.fetch;
    if (typeof current !== "function" || current.__v26182ChatStable) return;

    const wrapped = async function(input, init = {}) {
      const response = await current.call(this, input, init);
      const method = String(init?.method || (typeof input !== "string" ? input?.method : "") || "GET").toUpperCase();
      if (method !== "GET" || pathOf(input) !== INBOX_PATH || !response?.ok) return response;

      try {
        const payload = await response.clone().json();
        const stabilized = stabilizeInbox(payload);
        const headers = new Headers(response.headers);
        headers.set("content-type", "application/json; charset=utf-8");
        headers.delete("content-length");
        return new Response(JSON.stringify(stabilized), {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch {
        return response;
      }
    };

    wrapped.__v26182ChatStable = true;
    wrapped.__v26182Original = current;
    window.fetch = wrapped;
  }

  function normalizeMessageNode(node) {
    const clone = node.cloneNode(true);
    clone.removeAttribute("data-v2618-signature");
    const footer = clone.querySelector("small");
    if (footer) {
      const text = String(footer.textContent || "");
      const separator = text.lastIndexOf(" · ");
      footer.textContent = separator >= 0 ? text.slice(0, separator) : text;
    }
    return clone.outerHTML;
  }

  function normalizeConversationRow(node) {
    const clone = node.cloneNode(true);
    clone.removeAttribute("data-v2618-signature");
    const time = clone.querySelector("time");
    if (time) time.textContent = "";
    return clone.outerHTML;
  }

  function installReplaceGuard() {
    const current = Element.prototype.replaceWith;
    if (typeof current !== "function" || current.__v26182ChatStable) return;

    const wrapped = function(...nodes) {
      const next = nodes.length === 1 && nodes[0] instanceof Element ? nodes[0] : null;

      if (next && this.matches?.(".v2511-message[data-v2618-message-key]") && next.matches?.(".v2511-message[data-v2618-message-key]")) {
        const sameKey = this.dataset.v2618MessageKey === next.dataset.v2618MessageKey;
        if (sameKey && normalizeMessageNode(this) === normalizeMessageNode(next)) {
          const oldFooter = this.querySelector("small");
          const newFooter = next.querySelector("small");
          if (oldFooter && newFooter && oldFooter.textContent !== newFooter.textContent) oldFooter.textContent = newFooter.textContent;
          if (this.className !== next.className) this.className = next.className;
          this.dataset.v2618Signature = next.dataset.v2618Signature || this.dataset.v2618Signature || "";
          return;
        }
      }

      if (next && this.matches?.(".v2511-row[data-v2511-conversation]") && next.matches?.(".v2511-row[data-v2511-conversation]")) {
        const sameConversation = this.dataset.v2511Conversation === next.dataset.v2511Conversation;
        if (sameConversation && normalizeConversationRow(this) === normalizeConversationRow(next)) {
          const oldTime = this.querySelector("time");
          const newTime = next.querySelector("time");
          if (oldTime && newTime && oldTime.textContent !== newTime.textContent) oldTime.textContent = newTime.textContent;
          this.className = next.className;
          this.dataset.v2618Signature = next.dataset.v2618Signature || this.dataset.v2618Signature || "";
          return;
        }
      }

      return current.apply(this, nodes);
    };

    wrapped.__v26182ChatStable = true;
    wrapped.__v26182Original = current;
    Element.prototype.replaceWith = wrapped;
  }

  function installSelectionTracker() {
    if (document.documentElement.dataset.v26182SelectionTracker === "1") return;
    document.documentElement.dataset.v26182SelectionTracker = "1";
    document.addEventListener("click", (event) => {
      const row = event.target?.closest?.("[data-v2511-conversation]");
      if (row?.dataset?.v2511Conversation) lastActiveId = row.dataset.v2511Conversation;
    }, true);
  }

  function install() {
    installFetchGuard();
    installReplaceGuard();
    installSelectionTracker();
    activeConversationId();
    document.documentElement.classList.add("v26182-chat-stable");
    if (installed) return;
    installed = true;
    window.addEventListener("crm:state", () => requestAnimationFrame(install));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) requestAnimationFrame(install); });
  }

  function boot() {
    install();
    setTimeout(install, 250);
    setTimeout(install, 900);
    setTimeout(install, 2200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
