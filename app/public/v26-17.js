(() => {
  "use strict";

  const MAX_FILE_BYTES = 64 * 1024 * 1024;
  const MAX_FILES = 8;
  const states = new Map([
    ["drawer", { files: [], sending: false }],
    ["unified", { files: [], sending: false }],
  ]);

  const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);

  function notify(message, tone = "success") {
    try { if (typeof showToast === "function") return showToast(message, tone); } catch {}
    console.log(message);
  }

  function formatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 ** 2).toFixed(1)} MB`;
  }

  function mediaKind(file) {
    const type = String(file?.type || "").toLowerCase();
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";
    return "document";
  }

  function fallbackName(file, index = 0) {
    if (String(file?.name || "").trim()) return file.name;
    const type = String(file?.type || "application/octet-stream");
    const ext = type.startsWith("image/") ? type.split("/")[1].replace("jpeg", "jpg")
      : type.startsWith("video/") ? type.split("/")[1]
      : type.startsWith("audio/") ? type.split("/")[1]
      : "bin";
    return `archivo-pegado-${Date.now()}-${index + 1}.${ext || "bin"}`;
  }

  function normalizeFile(file, index = 0) {
    if (!file) return null;
    if (String(file.name || "").trim()) return file;
    try { return new File([file], fallbackName(file, index), { type: file.type || "application/octet-stream", lastModified: Date.now() }); }
    catch { return file; }
  }

  function fileKey(file) {
    return [file?.name || "", Number(file?.size || 0), Number(file?.lastModified || 0), file?.type || ""].join("|");
  }

  function filesFromTransfer(transfer) {
    const result = [];
    const seen = new Set();
    const push = (file, index = 0) => {
      const normalized = normalizeFile(file, index);
      if (!normalized) return;
      const key = fileKey(normalized);
      if (seen.has(key)) return;
      seen.add(key);
      result.push(normalized);
    };
    for (const [index, item] of Array.from(transfer?.items || []).entries()) {
      if (item?.kind === "file") push(item.getAsFile?.(), index);
    }
    if (!result.length) Array.from(transfer?.files || []).forEach(push);
    return result;
  }

  function contextFromNode(node) {
    if (node?.closest?.("#message-form,#manual-message,#deal-drawer")) return "drawer";
    if (node?.closest?.("#v2511-composer,#v2511-message,#v2511-chat")) return "unified";
    return null;
  }

  function formFor(context) {
    return context === "drawer" ? $("#message-form") : $("#v2511-composer");
  }

  function textBoxFor(context) {
    return context === "drawer" ? $("#manual-message") : $("#v2511-message");
  }

  function sendButtonFor(context) {
    return context === "drawer" ? $("#message-form button[type='submit'],#message-form button:not([type])") : $("#v2511-send");
  }

  function unifiedIsWhatsapp() {
    return $("#v2511-channel")?.dataset?.channel === "whatsapp";
  }

  function ensureStyle() {
    if ($("#v2617-attachment-style")) return;
    const style = document.createElement("style");
    style.id = "v2617-attachment-style";
    style.textContent = `
      .v2617-drop-zone{position:relative}
      .v2617-drop-zone.v2617-dragging::after{content:"Soltá los archivos para adjuntarlos";position:absolute;inset:4px;z-index:20;border:2px dashed var(--lime,#77b255);border-radius:14px;background:color-mix(in srgb,var(--cream,#fff) 92%,transparent);display:grid;place-items:center;font-weight:750;pointer-events:none}
      .v2617-preview{display:flex;flex-direction:column;gap:7px;padding:8px 10px;margin:0 0 7px;border:1px solid rgba(0,0,0,.10);border-radius:12px;background:rgba(255,255,255,.72)}
      .v2617-preview[hidden]{display:none!important}
      .v2617-preview-head{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:var(--xp-text,#222)}
      .v2617-preview-head button{border:0;background:transparent;cursor:pointer;font-weight:700;color:inherit}
      .v2617-file-list{display:flex;gap:7px;overflow-x:auto;padding-bottom:2px}
      .v2617-file{display:grid;grid-template-columns:38px minmax(105px,1fr) 24px;align-items:center;gap:7px;min-width:190px;max-width:280px;padding:6px 7px;border:1px solid rgba(0,0,0,.09);border-radius:10px;background:var(--xp-surface,#fff)}
      .v2617-thumb{width:38px;height:38px;border-radius:8px;display:grid;place-items:center;background:rgba(0,0,0,.055);overflow:hidden;font-size:18px}
      .v2617-thumb img{width:100%;height:100%;object-fit:cover}
      .v2617-file-copy{min-width:0}.v2617-file-copy strong,.v2617-file-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.v2617-file-copy strong{font-size:11px}.v2617-file-copy small{font-size:10px;opacity:.68;margin-top:2px}
      .v2617-remove{border:0;background:transparent;cursor:pointer;font-size:17px;line-height:1;padding:2px}
      .v2617-attach{border:0!important;background:transparent!important;box-shadow:none!important;min-width:34px!important;padding:6px!important;font-size:18px!important;cursor:pointer}
      .v2617-help{font-size:10px;opacity:.62;margin:0 2px 4px}
      @media(max-width:760px){.v2617-file{min-width:165px}.v2617-help{display:none}}
    `;
    document.head.appendChild(style);
  }

  function ensureUi(context) {
    ensureStyle();
    const form = formFor(context);
    if (!form) return null;
    form.classList.add("v2617-drop-zone");
    const inputId = `v2617-${context}-files`;
    let input = $(`#${inputId}`);
    if (!input) {
      input = document.createElement("input");
      input.id = inputId;
      input.type = "file";
      input.multiple = true;
      input.hidden = true;
      input.addEventListener("change", () => {
        addFiles(context, Array.from(input.files || []));
        input.value = "";
      });
      form.appendChild(input);
    }
    let preview = $(`[data-v2617-preview='${context}']`, form);
    if (!preview) {
      preview = document.createElement("div");
      preview.className = "v2617-preview";
      preview.dataset.v2617Preview = context;
      preview.hidden = true;
      preview.innerHTML = `<div class="v2617-preview-head"><span>📎 <b data-v2617-count>0 archivos</b> · arrastrá, elegí o pegá con Ctrl+V</span><button type="button" data-v2617-clear>Quitar todos</button></div><div class="v2617-file-list" data-v2617-list></div>`;
      const write = context === "unified" ? $(".v2511-write", form) : form.firstElementChild;
      if (write) form.insertBefore(preview, write); else form.prepend(preview);
      preview.addEventListener("click", (event) => {
        if (event.target.closest("[data-v2617-clear]")) clearFiles(context);
        const remove = event.target.closest("[data-v2617-remove]");
        if (remove) removeFile(context, remove.dataset.v2617Remove);
      });
    }
    if (context === "unified") {
      const write = $(".v2511-write", form);
      if (write && !$("[data-v2617-pick='unified']", write)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "v2617-attach";
        button.dataset.v2617Pick = "unified";
        button.title = "Adjuntar archivo";
        button.setAttribute("aria-label", "Adjuntar archivo");
        button.textContent = "📎";
        write.prepend(button);
      }
      if (!$("[data-v2617-help='unified']", form)) {
        const help = document.createElement("small");
        help.className = "v2617-help";
        help.dataset.v2617Help = "unified";
        help.textContent = "Podés arrastrar archivos aquí o copiar un archivo/imagen y pegarlo con Ctrl+V.";
        form.appendChild(help);
      }
    }
    render(context);
    return input;
  }

  function clearDragStyles() {
    $("#message-form")?.classList.remove("v2617-dragging");
    $("#v2511-composer")?.classList.remove("v2617-dragging");
  }

  function addFiles(context, incoming) {
    if (!incoming?.length) return;
    if (context === "unified" && !unifiedIsWhatsapp()) {
      notify("El envío de archivos desde la Bandeja unificada está habilitado para conversaciones de WhatsApp.", "warning");
      return;
    }
    const state = states.get(context);
    if (!state || state.sending) return;
    const existing = new Set(state.files.map((entry) => fileKey(entry.file)));
    let added = 0;
    for (const [index, raw] of incoming.entries()) {
      if (state.files.length >= MAX_FILES) break;
      const file = normalizeFile(raw, index);
      if (!file) continue;
      if (file.size > MAX_FILE_BYTES) {
        notify(`${fallbackName(file, index)} supera el límite de 64 MB.`, "warning");
        continue;
      }
      const key = fileKey(file);
      if (existing.has(key)) continue;
      existing.add(key);
      state.files.push({
        id: globalThis.crypto?.randomUUID?.() || `file_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: mediaKind(file) === "image" ? URL.createObjectURL(file) : "",
      });
      added += 1;
    }
    ensureUi(context);
    render(context);
    if (state.files.length >= MAX_FILES && incoming.length > added) notify(`Podés enviar hasta ${MAX_FILES} archivos por tanda.`, "warning");
    if (added) notify(`${added} ${added === 1 ? "archivo listo" : "archivos listos"} para enviar.`);
  }

  function removeFile(context, id) {
    const state = states.get(context);
    if (!state || state.sending) return;
    const index = state.files.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const [entry] = state.files.splice(index, 1);
    if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    render(context);
  }

  function clearFiles(context) {
    const state = states.get(context);
    if (!state || state.sending) return;
    for (const entry of state.files) if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    state.files = [];
    render(context);
  }

  function render(context) {
    const state = states.get(context);
    const form = formFor(context);
    const preview = form?.querySelector?.(`[data-v2617-preview='${context}']`);
    if (!state || !preview) return;
    preview.hidden = state.files.length === 0;
    const count = preview.querySelector("[data-v2617-count]");
    if (count) count.textContent = `${state.files.length} ${state.files.length === 1 ? "archivo" : "archivos"}`;
    const list = preview.querySelector("[data-v2617-list]");
    if (list) list.innerHTML = state.files.map((entry) => {
      const file = entry.file;
      const kind = mediaKind(file);
      const icon = { image:"🖼️", video:"🎬", audio:"🎵", document:"📄" }[kind] || "📄";
      const thumb = entry.previewUrl ? `<img src="${esc(entry.previewUrl)}" alt="">` : icon;
      return `<div class="v2617-file"><span class="v2617-thumb">${thumb}</span><span class="v2617-file-copy"><strong title="${esc(fallbackName(file))}">${esc(fallbackName(file))}</strong><small>${esc(formatBytes(file.size))} · ${esc(kind)}</small></span><button class="v2617-remove" type="button" data-v2617-remove="${esc(entry.id)}" aria-label="Quitar archivo">×</button></div>`;
    }).join("");
    form.classList.toggle("v2617-has-files", state.files.length > 0);
  }

  async function resolveDealId(context) {
    if (context === "drawer") {
      try { if (typeof selectedDealId !== "undefined" && selectedDealId) return selectedDealId; } catch {}
      return "";
    }
    const active = $("#v2511-list [data-v2511-conversation].active") || $("#v2511-list .active[data-v2511-conversation]");
    const conversationId = active?.dataset?.v2511Conversation || "";
    if (!conversationId) throw new Error("Seleccioná una conversación antes de adjuntar archivos.");
    const response = await fetch("/api/omnichannel/inbox", { credentials:"same-origin", cache:"no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "No se pudo identificar la conversación activa.");
    const item = (data.conversations || []).find((row) => String(row.id) === String(conversationId));
    if (!item) throw new Error("La conversación cambió. Volvé a seleccionarla e intentá de nuevo.");
    if (item.provider !== "whatsapp") throw new Error("Los adjuntos de esta bandeja están habilitados para WhatsApp.");
    return item.entityId || "";
  }

  async function uploadFile(dealId, file, caption = "") {
    const response = await fetch(`/api/deals/${encodeURIComponent(dealId)}/media`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(fallbackName(file)),
        "X-Media-Kind": mediaKind(file),
        "X-Caption": encodeURIComponent(caption || ""),
        "X-Duration": "0",
        "X-Voice-Note": "0",
      },
      body: file,
    });
    const raw = await response.text();
    let result = {};
    try { result = raw ? JSON.parse(raw) : {}; } catch {}
    if (response.status === 401) location.assign("/login");
    if (!response.ok) throw new Error(result.error || "No se pudo enviar el archivo por WhatsApp.");
    return result;
  }

  function setSending(context, value) {
    const state = states.get(context);
    if (!state) return;
    state.sending = value;
    const form = formFor(context);
    const send = sendButtonFor(context);
    const pick = form?.querySelector?.(`[data-v2617-pick='${context}']`);
    if (send) {
      send.disabled = value;
      if (!send.dataset.v2617OldText) send.dataset.v2617OldText = send.textContent || "Enviar";
      send.textContent = value ? "Enviando…" : send.dataset.v2617OldText;
    }
    if (pick) pick.disabled = value;
    form?.querySelectorAll?.("[data-v2617-remove],[data-v2617-clear]").forEach((button) => { button.disabled = value; });
  }

  async function sendPending(context) {
    const state = states.get(context);
    if (!state?.files.length || state.sending) return;
    setSending(context, true);
    const box = textBoxFor(context);
    const caption = box?.value?.trim?.() || "";
    let firstCaptionPending = Boolean(caption);
    let sent = 0;
    let lastResult = null;
    try {
      const dealId = await resolveDealId(context);
      if (!dealId) throw new Error("No se pudo determinar la negociación activa.");
      while (state.files.length) {
        const entry = state.files[0];
        lastResult = await uploadFile(dealId, entry.file, firstCaptionPending ? caption : "");
        if (firstCaptionPending && box) {
          box.value = "";
          box.dispatchEvent(new Event("input", { bubbles:true }));
          firstCaptionPending = false;
        }
        state.files.shift();
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
        sent += 1;
        render(context);
      }
      if (lastResult && context === "drawer") {
        try { if (typeof setState === "function") setState(lastResult); } catch {}
      }
      if (context === "unified") $("#v2511-refresh")?.click();
      notify(`${sent} ${sent === 1 ? "archivo enviado" : "archivos enviados"} por WhatsApp.`);
    } catch (error) {
      notify(`${error.message || "No se pudo enviar el archivo."}${sent ? ` · ${sent} ya ${sent === 1 ? "fue enviado" : "fueron enviados"}.` : ""}`, "warning");
    } finally {
      setSending(context, false);
      render(context);
    }
  }

  function pickFiles(context) {
    const input = ensureUi(context);
    if (context === "unified" && !unifiedIsWhatsapp()) return notify("Seleccioná una conversación de WhatsApp para adjuntar archivos.", "warning");
    input?.click();
  }

  document.addEventListener("click", (event) => {
    const custom = event.target.closest("[data-v2617-pick]");
    if (custom) {
      event.preventDefault();
      pickFiles(custom.dataset.v2617Pick);
      return;
    }
    if (event.target.closest("#attach-button")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      pickFiles("drawer");
    }
    if (event.target.closest('[data-view="whatsapp"],#v2511-list [data-v2511-conversation]')) setTimeout(() => ensureUi("unified"), 60);
  }, true);

  document.addEventListener("paste", (event) => {
    const context = contextFromNode(event.target);
    if (!context) return;
    const files = filesFromTransfer(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    addFiles(context, files);
  }, true);

  document.addEventListener("dragover", (event) => {
    const hasFiles = Array.from(event.dataTransfer?.types || []).includes("Files");
    if (!hasFiles) return;
    const context = contextFromNode(event.target);
    if (!context) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    ensureUi(context)?.closest?.("form")?.classList.add("v2617-dragging");
  }, true);

  document.addEventListener("dragleave", (event) => {
    const context = contextFromNode(event.target);
    const form = context ? formFor(context) : null;
    if (form && (!event.relatedTarget || !form.contains(event.relatedTarget))) form.classList.remove("v2617-dragging");
  }, true);

  document.addEventListener("drop", (event) => {
    const context = contextFromNode(event.target);
    if (!context) return;
    const files = filesFromTransfer(event.dataTransfer);
    if (!files.length) return;
    event.preventDefault();
    clearDragStyles();
    addFiles(context, files);
  }, true);

  document.addEventListener("dragend", clearDragStyles, true);

  document.addEventListener("submit", (event) => {
    const context = event.target?.id === "message-form" ? "drawer" : event.target?.id === "v2511-composer" ? "unified" : null;
    if (!context || !states.get(context)?.files.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void sendPending(context);
  }, true);

  function install() {
    document.documentElement.classList.add("v2617-message-attachments");
    ensureStyle();
    ensureUi("drawer");
    ensureUi("unified");
  }

  for (const delay of [0, 250, 800, 1800, 3500]) setTimeout(install, delay);
  window.addEventListener("crm:state", () => setTimeout(install, 0));
})();
