(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function state() {
    try { return typeof appState !== "undefined" ? appState : null; } catch { return null; }
  }

  function notify(message, tone = "success") {
    if (typeof window.showToast === "function") return window.showToast(message, tone);
    if (typeof window.toast === "function") return window.toast(message, tone);
    console.log(message);
  }

  async function request(url, options = {}) {
    const opts = { credentials: "same-origin", cache: "no-store", ...options };
    if (opts.body && !(opts.body instanceof FormData)) {
      opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    }
    const response = await fetch(url, opts);
    const raw = await response.text();
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch {}
    if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);
    return payload;
  }

  function currentUser() {
    const s = state();
    return s?.currentUser || s?.user || null;
  }

  function availableBranches() {
    const s = state();
    const user = currentUser();
    const all = (s?.branches || []).filter((b) => b.active !== false);
    if (!user || user.role === "admin" || !user.branchId) return all;
    return all.filter((b) => b.id === user.branchId);
  }

  function lineUsable(line) {
    return line && line.active !== false && line.canUse !== false;
  }

  function populateLineSelect(branchId, preferred = "") {
    const select = $("#form-line");
    const s = state();
    if (!select || !s) return;
    const lines = (s.whatsappLines || []).filter(lineUsable).sort((a, b) => {
      const ap = a.branchId === branchId ? 0 : 1;
      const bp = b.branchId === branchId ? 0 : 1;
      return ap - bp || String(a.name || "").localeCompare(String(b.name || ""), "es");
    });
    select.innerHTML = lines.length
      ? lines.map((line) => `<option value="${String(line.id)}">${String(line.name || "WhatsApp")} · ${line.provider === "cloud" ? "API" : "QR"}</option>`).join("")
      : '<option value="">Sin conexión asignada</option>';
    if (preferred && lines.some((line) => line.id === preferred)) select.value = preferred;
    else {
      const best = lines.find((line) => line.branchId === branchId && line.isDefault) || lines.find((line) => line.branchId === branchId) || lines[0];
      if (best) select.value = best.id;
    }
  }

  function ensureFormContext() {
    const dialog = $("#form-builder-dialog");
    if (!dialog?.open) return;
    const branch = $("#form-branch");
    const user = currentUser();
    const branches = availableBranches();
    if (branch && (!branch.options.length || !branch.value)) {
      branch.innerHTML = branches.length
        ? branches.map((b) => `<option value="${String(b.id)}">${String(b.name || "Sucursal")}</option>`).join("")
        : '<option value="">Sucursal principal</option>';
      branch.value = user?.branchId && branches.some((b) => b.id === user.branchId) ? user.branchId : (branches[0]?.id || "");
    }

    if ($("#form-line") && !$("#form-line").options.length) populateLineSelect(branch?.value || "");

    const stage = $("#form-filter-stage");
    if (stage && !stage.options.length) {
      stage.innerHTML = '<option value="all">Cualquier etapa</option><option value="new">Nuevos</option><option value="contacted">Contactados</option><option value="waiting">En espera</option><option value="won">Ganados</option><option value="lost">Perdidos</option>';
      stage.value = "all";
    }

    const triggerStatus = $("#form-trigger-status");
    if (triggerStatus && !triggerStatus.options.length) {
      triggerStatus.innerHTML = '<option value="new_inquiry">Consulta nueva</option><option value="awaiting_client_response">Esperando respuesta del cliente</option><option value="won">Cierre ganado</option><option value="lost">Cierre perdido</option>';
    }

    const questions = $("#form-questions");
    if (questions && !questions.children.length) $("#form-add-question")?.click();
  }

  function parseOptions(card, cards) {
    const textarea = $("[data-q-options]", card);
    if (!textarea) return [];
    return textarea.value.split(/\r?\n/).map((line, i) => {
      const [left, ...rest] = line.split(/\s*(?:->|→)\s*/);
      const label = String(left || "").trim();
      if (!label) return null;
      let dest = String(rest.join("->") || "").trim();
      if (/^fin$/i.test(dest)) dest = "end";
      else if (/^q?\s*\d+$/i.test(dest)) {
        const n = Number(dest.replace(/\D/g, ""));
        dest = cards[n - 1]?.dataset.qid || "";
      }
      return { id: `o${i + 1}`, label, value: label, nextQuestionId: dest };
    }).filter(Boolean);
  }

  function collectFormPayload() {
    ensureFormContext();
    const cards = $$(".v216-question", $("#form-questions"));
    const scheduled = $("#form-scheduled-at")?.value || "";
    return {
      name: $("#form-name")?.value.trim() || "",
      description: $("#form-description")?.value.trim() || "",
      formType: $("#form-type")?.value || "custom",
      branchId: $("#form-branch")?.value || currentUser()?.branchId || availableBranches()[0]?.id || "",
      lineId: $("#form-line")?.value || null,
      publicAccess: $("#form-public-access")?.checked !== false,
      collectIdentity: $("#form-identity")?.value || "optional",
      theme: {
        primaryColor: $("#form-primary-color")?.value || "#171717",
        accentColor: $("#form-accent-color")?.value || "#ff7a00",
      },
      deliveryMode: $("#form-delivery")?.value || "web_link",
      introMessage: $("#form-intro")?.value.trim() || "",
      closingMessage: $("#form-closing")?.value.trim() || "",
      trigger: {
        type: $("#form-trigger")?.value || "manual",
        delayMinutes: Math.round(Number($("#form-delay-hours")?.value || 0) * 60),
        commercialStatusId: $("#form-trigger-status")?.value || null,
        scheduledAt: scheduled ? new Date(scheduled).toISOString() : null,
      },
      filters: {
        city: $("#form-filter-city")?.value.trim() || "",
        company: $("#form-filter-company")?.value.trim() || "",
        tag: $("#form-filter-tag")?.value.trim() || "",
        stage: $("#form-filter-stage")?.value || "all",
        minPurchases: Number($("#form-filter-purchases")?.value || 0),
        minPurchaseValue: Number($("#form-filter-value")?.value || 0),
      },
      questions: cards.map((card) => ({
        id: card.dataset.qid || `q_${Math.random().toString(36).slice(2)}`,
        text: $("[data-q-text]", card)?.value.trim() || "",
        type: $("[data-q-type]", card)?.value || "text",
        required: $("[data-q-required]", card)?.checked !== false,
        options: parseOptions(card, cards),
        defaultNextQuestionId: $("[data-q-next]", card)?.value || "",
      })).filter((q) => q.text),
    };
  }

  function showFormError(message, element = null) {
    const box = $("#form-builder-error");
    if (box) { box.textContent = message; box.hidden = false; }
    if (element) {
      element.focus?.({ preventScroll: true });
      element.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }
    notify(message, "warning");
  }

  function validatePayload(payload) {
    if (!payload.name) return [false, "Escribí un nombre para el formulario.", $("#form-name")];
    if (!payload.branchId) return [false, "Seleccioná una empresa/sucursal para el formulario.", $("#form-branch")];
    if (!payload.questions.length) return [false, "Agregá al menos una pregunta.", $("#form-add-question")];
    const empty = $$(".v216-question", $("#form-questions")).find((card) => !$("[data-q-text]", card)?.value.trim());
    if (empty) return [false, "Completá el texto de todas las preguntas.", $("[data-q-text]", empty)];
    if (payload.trigger.type === "scheduled" && !payload.trigger.scheduledAt) return [false, "Elegí la fecha y hora del envío programado.", $("#form-scheduled-at")];
    return [true];
  }

  async function saveForm(event) {
    if (event.target?.id !== "form-builder") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const payload = collectFormPayload();
    const [ok, message, element] = validatePayload(payload);
    if (!ok) return showFormError(message, element);
    const button = $("#form-save-button");
    const original = button?.innerHTML || "";
    try {
      if (button) { button.disabled = true; button.textContent = "Guardando…"; }
      const id = $("#form-id")?.value || "";
      const result = await request(id ? `/api/forms/${encodeURIComponent(id)}` : "/api/forms", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (!result?.form?.id) throw new Error("El servidor no confirmó el guardado del formulario.");
      $("#form-builder-dialog")?.close();
      notify(id ? "Formulario actualizado correctamente." : "Formulario creado correctamente.");
      sessionStorage.setItem("v241-open-forms", "1");
      setTimeout(() => location.reload(), 250);
    } catch (error) {
      showFormError(error?.message || "No se pudo guardar el formulario.");
    } finally {
      if (button) { button.disabled = false; button.innerHTML = original; }
    }
  }

  async function sendFormFromList(event) {
    const button = event.target.closest?.('[data-form-action="send"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const card = button.closest("[data-form-id]");
    const id = card?.dataset.formId;
    if (!id) return notify("No se pudo identificar el formulario.", "warning");
    const original = button.innerHTML;
    try {
      button.disabled = true;
      button.textContent = "Enviando…";
      const result = await request(`/api/forms/${encodeURIComponent(id)}/dispatch`, {
        method: "POST",
        body: JSON.stringify({ baseUrl: location.origin }),
      });
      notify(`${result.started ?? 0} enviados · ${result.queued ?? 0} preparados${result.errors?.length ? ` · ${result.errors.length} con error` : ""}.`);
      sessionStorage.setItem("v241-open-forms", "1");
      setTimeout(() => location.reload(), 350);
    } catch (error) {
      notify(error?.message || "No se pudo enviar el formulario.", "warning");
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  function disableOutgoingAudio() {
    const record = $("#record-audio-button");
    if (record) record.remove();
    const file = $("#media-file");
    if (file && !file.dataset.v241AudioGuard) {
      file.dataset.v241AudioGuard = "1";
      file.addEventListener("change", (event) => {
        const selected = event.target.files?.[0];
        if (!selected?.type?.toLowerCase().startsWith("audio/")) return;
        event.stopImmediatePropagation();
        event.target.value = "";
        notify("El envío de audio desde el CRM fue deshabilitado. Podés enviar texto, imágenes, videos y documentos.", "warning");
      }, true);
    }
  }

  function installFormRepair() {
    document.addEventListener("submit", saveForm, true);
    document.addEventListener("click", sendFormFromList, true);
    document.addEventListener("click", (event) => {
      if (!event.target.closest?.("#new-form-button")) return;
      setTimeout(ensureFormContext, 120);
    }, true);
    document.addEventListener("change", (event) => {
      if (event.target?.id === "form-branch") populateLineSelect(event.target.value, $("#form-line")?.value || "");
    }, true);

    const observer = new MutationObserver(() => {
      ensureFormContext();
      disableOutgoingAudio();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
  }

  function restoreFormsView() {
    if (sessionStorage.getItem("v241-open-forms") !== "1") return;
    sessionStorage.removeItem("v241-open-forms");
    setTimeout(() => $("[data-view=\"forms\"]")?.click(), 650);
  }

  function install() {
    disableOutgoingAudio();
    installFormRepair();
    restoreFormsView();
    document.body.classList.add("v241-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
