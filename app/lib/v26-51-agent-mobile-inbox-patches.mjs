const MARKER = "// V26.51 AGENT_MOBILE_INBOX";

const APPEND = String.raw`

// V26.51 AGENT_MOBILE_INBOX
(() => {
  let v2651Filter = "pending";
  let v2651Search = "";
  let v2651Touch = null;
  let v2651Queued = false;

  function v2651IsMobile() {
    return window.matchMedia?.("(max-width: 900px)")?.matches === true;
  }

  function v2651ViewportHeight() {
    const viewport = window.visualViewport;
    const height = Math.max(320, Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 720));
    document.documentElement.style.setProperty("--v2651-vh", height + "px");
  }

  function v2651OpenDeal(deal) {
    return Boolean(deal && ["new", "contacted", "waiting"].includes(deal.stage));
  }

  function v2651LastMeaningfulMessage(deal) {
    const messages = Array.isArray(deal?.messages) ? deal.messages : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.direction === "system") continue;
      return message;
    }
    return null;
  }

  function v2651NeedsReply(deal) {
    if (!v2651OpenDeal(deal)) return false;
    if (deal.stage === "new" || deal.stage === "waiting") return true;
    const last = v2651LastMeaningfulMessage(deal);
    if (!last) return true;
    return last.direction !== "outgoing";
  }

  function v2651StatusLabel(deal) {
    return v2651NeedsReply(deal) ? "Pendiente" : "Respondido";
  }

  function v2651EnsureInbox() {
    const panel = document.querySelector('[data-view-panel="crm"]');
    if (!panel) return null;
    let root = panel.querySelector("#v2651-mobile-inbox");
    if (root) return root;

    root = document.createElement("section");
    root.id = "v2651-mobile-inbox";
    root.className = "v2651-mobile-inbox";
    root.innerHTML = [
      '<div class="v2651-mobile-head">',
      '  <div class="v2651-mobile-title"><small>ATENCIÓN MÓVIL</small><strong>Mis negociaciones</strong><span id="v2651-mobile-summary">0 conversaciones abiertas</span></div>',
      '  <div class="v2651-availability" aria-label="Disponibilidad">',
      '    <button type="button" data-v2651-attendance="active"><i></i><span>Disponible</span></button>',
      '    <button type="button" data-v2651-attendance="paused"><i></i><span>No disponible</span></button>',
      '  </div>',
      '</div>',
      '<div class="v2651-search"><span>⌕</span><input id="v2651-mobile-search" type="search" autocomplete="off" placeholder="Buscar cliente o mensaje…" /></div>',
      '<nav class="v2651-tabs" aria-label="Estado de conversaciones">',
      '  <button class="active" type="button" data-v2651-filter="pending"><span>Pendientes</span><b data-v2651-count="pending">0</b></button>',
      '  <button type="button" data-v2651-filter="answered"><span>Respondidos</span><b data-v2651-count="answered">0</b></button>',
      '  <button type="button" data-v2651-filter="all"><span>Todas</span><b data-v2651-count="all">0</b></button>',
      '</nav>',
      '<div class="v2651-deal-list" id="v2651-deal-list"></div>',
    ].join("");

    const before = panel.querySelector("#mobile-stage-tabs") || panel.querySelector("#crm-board");
    if (before) panel.insertBefore(root, before);
    else panel.appendChild(root);
    return root;
  }

  function v2651RenderInbox() {
    const root = v2651EnsureInbox();
    if (!root || typeof appState === "undefined" || !appState) return;

    const open = (appState.deals || []).filter(v2651OpenDeal);
    const pending = open.filter(v2651NeedsReply);
    const answered = open.filter((deal) => !v2651NeedsReply(deal));

    root.querySelector('[data-v2651-count="pending"]').textContent = String(pending.length);
    root.querySelector('[data-v2651-count="answered"]').textContent = String(answered.length);
    root.querySelector('[data-v2651-count="all"]').textContent = String(open.length);
    root.querySelector("#v2651-mobile-summary").textContent = open.length
      ? open.length + " conversación" + (open.length === 1 ? "" : "es") + " abierta" + (open.length === 1 ? "" : "s")
      : "Sin conversaciones abiertas";

    root.querySelectorAll("[data-v2651-filter]").forEach((button) => {
      button.classList.toggle("active", button.dataset.v2651Filter === v2651Filter);
    });

    const attendance = appState.currentUser?.attendance?.status || (appState.currentUser?.role === "agent" ? "offline" : "active");
    root.querySelectorAll("[data-v2651-attendance]").forEach((button) => {
      const selected = button.dataset.v2651Attendance === "active"
        ? attendance === "active"
        : attendance !== "active";
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });

    const source = v2651Filter === "pending" ? pending : v2651Filter === "answered" ? answered : open;
    const term = v2651Search.trim().toLowerCase();
    const filtered = term
      ? source.filter((deal) => [deal.name, deal.phone, deal.contactPersonName, deal.lastMessage, deal.ownerName]
          .some((value) => String(value || "").toLowerCase().includes(term)))
      : source;

    const list = root.querySelector("#v2651-deal-list");
    if (!filtered.length) {
      list.innerHTML = '<div class="v2651-empty"><span>✓</span><strong>Todo al día</strong><small>No hay negociaciones para mostrar en esta sección.</small></div>';
      return;
    }

    list.innerHTML = filtered
      .slice()
      .sort((a, b) => {
        const priority = Number(v2651NeedsReply(b)) - Number(v2651NeedsReply(a));
        if (priority) return priority;
        return Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0);
      })
      .map((deal) => {
        const last = v2651LastMeaningfulMessage(deal);
        const pendingDeal = v2651NeedsReply(deal);
        const status = pendingDeal ? "pending" : "answered";
        const statusText = pendingDeal ? "Pendiente" : "Respondido";
        const message = last?.text || deal.lastMessage || "Sin mensajes todavía";
        const owner = deal.ownerName || "Sin responsable";
        const when = typeof relativeTime === "function" ? relativeTime(deal.updatedAt) : "";
        const stage = typeof stageLabels !== "undefined" ? (stageLabels[deal.stage] || deal.stage) : deal.stage;
        return [
          '<button class="v2651-deal-card ' + status + '" type="button" data-v2651-deal="' + escapeHtml(deal.id) + '">',
          '  <span class="v2651-card-head">',
          '    <span class="v2651-card-avatar">' + escapeHtml(typeof initials === "function" ? initials(deal.name) : String(deal.name || "?").slice(0, 2)) + '</span>',
          '    <span class="v2651-card-person"><strong>' + escapeHtml(deal.name || "Cliente") + '</strong><small>' + escapeHtml(deal.phone || "") + '</small></span>',
          '    <span class="v2651-card-state ' + status + '">' + statusText + '</span>',
          '  </span>',
          '  <span class="v2651-card-message">' + escapeHtml(message) + '</span>',
          '  <span class="v2651-card-meta"><span>' + escapeHtml(stage) + '</span><span>•</span><span>' + escapeHtml(owner) + '</span><time>' + escapeHtml(when) + '</time></span>',
          '</button>',
        ].join("");
      }).join("");
  }

  async function v2651SetAttendance(status, button) {
    if (typeof mutate !== "function") return;
    const buttons = document.querySelectorAll("[data-v2651-attendance], [data-v2651-chat-attendance]");
    buttons.forEach((node) => { node.disabled = true; });
    try {
      await mutate("/api/attendance/me", "POST", {
        status,
        reason: appState?.currentUser?.attendance?.reason || "",
      });
      if (typeof showToast === "function") {
        showToast(status === "active" ? "Ahora estás disponible" : "Marcado como no disponible");
      }
    } catch (error) {
      if (typeof showToast === "function") showToast(error.message, "warning");
    } finally {
      buttons.forEach((node) => { node.disabled = false; });
      v2651RenderInbox();
      v2651SyncChatActions();
    }
  }

  function v2651EnsureChatActions() {
    const drawer = document.querySelector("#deal-drawer");
    const header = drawer?.querySelector(".drawer-header");
    const tabs = drawer?.querySelector(".drawer-mobile-tabs");
    if (!drawer || !header || !tabs) return null;

    let bar = drawer.querySelector(".v2651-chat-actions");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "v2651-chat-actions";
      bar.innerHTML = [
        '<button type="button" class="v2651-chat-back" data-close-drawer="">‹ <span>Negociaciones</span></button>',
        '<button type="button" class="v2651-chat-status" data-v2651-chat-attendance="paused"><i></i><span>No disponible</span></button>',
        '<button type="button" data-v2651-details>Ficha</button>',
        '<button type="button" class="v2651-close-button" data-v2651-close-menu>Cerrar</button>',
        '<div class="v2651-close-menu" hidden>',
        '  <button type="button" data-v2651-close="won">✓ Ganado</button>',
        '  <button type="button" data-v2651-close="lost">× Perdido</button>',
        '</div>',
      ].join("");
      tabs.insertAdjacentElement("beforebegin", bar);
    }
    return bar;
  }

  function v2651SyncChatActions() {
    const bar = v2651EnsureChatActions();
    if (!bar || typeof appState === "undefined") return;
    const deal = (appState?.deals || []).find((entry) => entry.id === (typeof selectedDealId === "undefined" ? null : selectedDealId));
    const open = v2651OpenDeal(deal);
    const closeButton = bar.querySelector("[data-v2651-close-menu]");
    if (closeButton) closeButton.hidden = !open;

    const attendance = appState?.currentUser?.attendance?.status || "offline";
    const attendanceButton = bar.querySelector("[data-v2651-chat-attendance]");
    if (attendanceButton) {
      const available = attendance === "active";
      attendanceButton.dataset.v2651ChatAttendance = available ? "paused" : "active";
      attendanceButton.classList.toggle("active", available);
      attendanceButton.querySelector("span").textContent = available ? "Disponible" : "No disponible";
    }
  }

  function v2651BindTouchScroller(list) {
    if (!list || list.dataset.v2651TouchBound === "1") return;
    list.dataset.v2651TouchBound = "1";

    list.addEventListener("touchstart", (event) => {
      if (!v2651IsMobile() || event.touches.length !== 1) return;
      if (event.target.closest("button,input,textarea,select")) return;
      const touch = event.touches[0];
      v2651Touch = {
        list,
        startY: touch.clientY,
        startTop: Number(list.scrollTop || 0),
        moved: false,
      };
      list.dataset.v2643UserBrowsing = "1";
      list.dataset.v2626ManualBrowsing = "1";
      list.dataset.v2643AutoScrollToken = String(Number(list.dataset.v2643AutoScrollToken || 0) + 1);
    }, { passive: true });

    list.addEventListener("touchmove", (event) => {
      if (!v2651Touch || v2651Touch.list !== list || event.touches.length !== 1) return;
      const max = Math.max(0, list.scrollHeight - list.clientHeight);
      if (max <= 0) return;
      const delta = v2651Touch.startY - event.touches[0].clientY;
      if (Math.abs(delta) < 2) return;
      const next = Math.max(0, Math.min(max, v2651Touch.startTop + delta));
      list.scrollTop = next;
      v2651Touch.moved = true;
      event.preventDefault();
    }, { passive: false });

    const finish = () => {
      if (v2651Touch?.list === list) v2651Touch = null;
    };
    list.addEventListener("touchend", finish, { passive: true });
    list.addEventListener("touchcancel", finish, { passive: true });
  }

  function v2651SyncScroller() {
    const list = document.querySelector("#drawer-messages.v2645-messages, #drawer-messages");
    if (!list) return;
    list.style.setProperty("overflow-y", "auto", "important");
    list.style.setProperty("-webkit-overflow-scrolling", "touch", "important");
    list.style.setProperty("touch-action", "pan-y", "important");
    list.style.setProperty("overscroll-behavior-y", "contain", "important");
    list.style.setProperty("min-height", "0", "important");
    v2651BindTouchScroller(list);
  }

  function v2651InstallStyle() {
    if (document.getElementById("v2651-agent-mobile-style")) return;
    const style = document.createElement("style");
    style.id = "v2651-agent-mobile-style";
    style.textContent = `
      #v2651-mobile-inbox{display:none}
      .v2651-chat-actions{display:none}
      @media(max-width:900px){
        [data-view-panel="crm"].active{padding:8px 8px calc(18px + env(safe-area-inset-bottom))!important}
        [data-view-panel="crm"].active>.metric-grid,
        [data-view-panel="crm"].active>.toolbar,
        [data-view-panel="crm"].active>#mobile-stage-tabs,
        [data-view-panel="crm"].active>#crm-board{display:none!important}

        #v2651-mobile-inbox{display:block!important;width:100%;min-width:0}
        .v2651-mobile-head{display:grid;gap:12px;padding:14px;border:1px solid #e3e9e5;border-radius:18px;background:#fff;box-shadow:0 8px 24px rgba(22,45,36,.06)}
        .v2651-mobile-title{display:grid;gap:2px}
        .v2651-mobile-title small{font-size:10px;font-weight:900;letter-spacing:.09em;color:#7b8a83}
        .v2651-mobile-title strong{font-size:22px;line-height:1.15;color:#183a2f}
        .v2651-mobile-title span{font-size:12px;color:#7f8c86}
        .v2651-availability{display:grid;grid-template-columns:1fr 1fr;gap:7px}
        .v2651-availability button{display:flex;align-items:center;justify-content:center;gap:7px;min-height:44px;border:1px solid #dce4e0;border-radius:12px;background:#f7f9f8;color:#54645d;font:inherit;font-size:13px;font-weight:850}
        .v2651-availability button i{width:9px;height:9px;border-radius:50%;background:#9ca8a2}
        .v2651-availability button[data-v2651-attendance="active"].active{border-color:#b8ddc6;background:#eaf7ee;color:#245f3b}
        .v2651-availability button[data-v2651-attendance="active"].active i{background:#41a864}
        .v2651-availability button[data-v2651-attendance="paused"].active{border-color:#ead9b9;background:#fff8e9;color:#7b5d23}
        .v2651-availability button[data-v2651-attendance="paused"].active i{background:#d69a37}

        .v2651-search{display:flex;align-items:center;gap:8px;margin-top:10px;padding:0 12px;border:1px solid #e0e6e3;border-radius:14px;background:#fff}
        .v2651-search span{font-size:18px;color:#75857e}
        .v2651-search input{width:100%;height:46px;border:0!important;outline:0!important;background:transparent!important;font-size:16px!important}

        .v2651-tabs{position:sticky;top:0;z-index:15;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:10px 0;padding:5px;border:1px solid #e2e8e5;border-radius:14px;background:rgba(255,255,255,.96);backdrop-filter:blur(10px)}
        .v2651-tabs button{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;min-height:42px;padding:7px 5px;border:0;border-radius:10px;background:transparent;color:#6b7973;font:inherit;font-size:12px;font-weight:850}
        .v2651-tabs button b{display:grid;min-width:20px;height:20px;padding:0 5px;place-items:center;border-radius:999px;background:#edf1ef;font-size:10px}
        .v2651-tabs button.active{background:#183f33;color:#fff}
        .v2651-tabs button.active b{background:rgba(255,255,255,.18);color:#fff}

        .v2651-deal-list{display:grid;gap:8px}
        .v2651-deal-card{display:grid;gap:9px;width:100%;min-width:0;padding:13px;border:1px solid #e0e6e3;border-radius:16px;background:#fff;color:inherit;text-align:left;box-shadow:0 5px 16px rgba(20,43,34,.045)}
        .v2651-deal-card.pending{border-left:4px solid #e0a142}
        .v2651-deal-card.answered{border-left:4px solid #65a77a}
        .v2651-card-head{display:flex;align-items:center;gap:9px;min-width:0}
        .v2651-card-avatar{display:grid;width:38px;height:38px;flex:0 0 auto;place-items:center;border-radius:50%;background:#e8f0eb;color:#315f4b;font-size:12px;font-weight:900}
        .v2651-card-person{display:block;min-width:0;flex:1 1 auto}
        .v2651-card-person strong,.v2651-card-person small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .v2651-card-person strong{font-size:14px;color:#213a30}
        .v2651-card-person small{margin-top:2px;font-size:11px;color:#8a9691}
        .v2651-card-state{flex:0 0 auto;padding:5px 7px;border-radius:999px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
        .v2651-card-state.pending{background:#fff3dc;color:#8b601d}
        .v2651-card-state.answered{background:#eaf6ee;color:#2f6b45}
        .v2651-card-message{display:-webkit-box;overflow:hidden;color:#4e5e57;font-size:13px;line-height:1.4;-webkit-box-orient:vertical;-webkit-line-clamp:2}
        .v2651-card-meta{display:flex;align-items:center;gap:5px;min-width:0;color:#8a9691;font-size:10px}
        .v2651-card-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .v2651-card-meta time{margin-left:auto;flex:0 0 auto;color:#68766f}
        .v2651-empty{display:grid;place-items:center;gap:5px;padding:34px 18px;border:1px dashed #d8e1dc;border-radius:16px;background:#fafcfb;text-align:center}
        .v2651-empty span{display:grid;width:42px;height:42px;place-items:center;border-radius:50%;background:#e9f5ed;color:#36714b;font-size:20px}
        .v2651-empty strong{color:#294438}
        .v2651-empty small{color:#87938d}

        #deal-drawer.open{inset:0!important}
        #deal-drawer.open .drawer-backdrop{display:none!important}
        #deal-drawer.open .drawer-panel{
          position:fixed!important;inset:0!important;
          display:grid!important;grid-template-rows:auto auto auto minmax(0,1fr)!important;
          width:100vw!important;max-width:none!important;
          height:var(--v2651-vh,100dvh)!important;max-height:var(--v2651-vh,100dvh)!important;
          min-height:0!important;border:0!important;border-radius:0!important;
          transform:none!important;overflow:hidden!important;background:#fff!important
        }
        #deal-drawer .drawer-header{grid-row:1!important;min-height:58px!important;padding:8px 10px!important}
        #deal-drawer .drawer-header h3{font-size:16px!important}
        #deal-drawer .drawer-header .kicker{font-size:8px!important}
        #deal-drawer .drawer-header>button.close{width:38px!important;height:38px!important}

        #deal-drawer .v2651-chat-actions{
          grid-row:2!important;position:relative!important;display:flex!important;align-items:center!important;gap:6px!important;
          min-width:0!important;padding:6px 8px!important;border-bottom:1px solid #e4e9e6!important;background:#fff!important;z-index:30!important
        }
        #deal-drawer .v2651-chat-actions>button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:36px;padding:6px 9px;border:1px solid #dde4e0;border-radius:10px;background:#f8faf9;color:#40534a;font:inherit;font-size:11px;font-weight:850}
        #deal-drawer .v2651-chat-back{margin-right:auto!important}
        #deal-drawer .v2651-chat-back span{display:none}
        #deal-drawer .v2651-chat-status.active{border-color:#b8ddc6!important;background:#eaf7ee!important;color:#245f3b!important}
        #deal-drawer .v2651-chat-status i{width:8px;height:8px;border-radius:50%;background:#d3993f}
        #deal-drawer .v2651-chat-status.active i{background:#41a864}
        #deal-drawer .v2651-close-button{border-color:#ead1cd!important;background:#fff5f3!important;color:#8a3e34!important}
        #deal-drawer .v2651-close-menu{position:absolute;right:8px;top:48px;z-index:80;display:grid;gap:6px;min-width:150px;padding:8px;border:1px solid #dfe5e2;border-radius:12px;background:#fff;box-shadow:0 14px 36px rgba(20,35,29,.2)}
        #deal-drawer .v2651-close-menu[hidden]{display:none!important}
        #deal-drawer .v2651-close-menu button{min-height:40px;border:0;border-radius:9px;background:#f5f8f6;font:inherit;font-size:12px;font-weight:850;text-align:left}
        #deal-drawer .v2651-close-menu button[data-v2651-close="won"]{color:#2f6b45}
        #deal-drawer .v2651-close-menu button[data-v2651-close="lost"]{color:#91483d}

        #deal-drawer .drawer-mobile-tabs{grid-row:3!important;display:grid!important;padding:4px 7px!important}
        #deal-drawer .drawer-mobile-tabs button{min-height:36px!important;padding:5px 6px!important;font-size:11px!important}

        #deal-drawer .drawer-content.drawer-workspace{
          grid-row:4!important;display:block!important;width:100%!important;height:auto!important;min-height:0!important;
          max-height:none!important;overflow:hidden!important;padding:0!important
        }
        #deal-drawer .deal-chat-column.active{
          display:flex!important;flex:1 1 0!important;flex-direction:column!important;
          width:100%!important;height:100%!important;min-height:0!important;max-height:100%!important;
          overflow:hidden!important;touch-action:pan-y!important
        }
        #deal-drawer .chat-only-section.v2645-deal-chat{
          display:grid!important;grid-template-rows:minmax(0,1fr) auto auto!important;
          flex:1 1 0!important;width:100%!important;height:100%!important;min-height:0!important;max-height:100%!important;
          overflow:hidden!important;touch-action:pan-y!important
        }
        #deal-drawer #drawer-messages.v2645-messages,
        #deal-drawer #drawer-messages{
          grid-row:1!important;position:relative!important;display:block!important;
          width:100%!important;height:100%!important;min-height:0!important;max-height:none!important;
          padding:12px 10px 16px!important;overflow-x:hidden!important;overflow-y:auto!important;
          -webkit-overflow-scrolling:touch!important;touch-action:pan-y!important;overscroll-behavior-y:contain!important;
          pointer-events:auto!important;background:#f2f5f3!important
        }
        #deal-drawer #drawer-messages>.message{max-width:88%!important;margin:7px 0!important;font-size:14px!important;touch-action:pan-y!important}
        #deal-drawer .v2645-ai-row{grid-row:2!important;padding:5px 8px!important;min-height:38px!important}
        #deal-drawer .v2645-ai-row span{display:none!important}
        #deal-drawer .v2645-composer{
          grid-row:3!important;display:block!important;flex:0 0 auto!important;
          max-height:39vh!important;padding:7px 8px calc(8px + env(safe-area-inset-bottom))!important;
          overflow-y:auto!important;overscroll-behavior:contain!important
        }
        #deal-drawer .v2645-composer .quick-reply-bar{display:none!important}
        #deal-drawer .v2645-composer #message-form{gap:6px!important}
        #deal-drawer .v2645-composer #manual-message{min-height:44px!important;max-height:108px!important}
        #deal-drawer .v2645-composer .composer-send{min-width:68px!important;padding:0 10px!important}
        #deal-drawer .v2645-composer .message-tools{margin-top:6px!important}
        #deal-drawer .v2645-composer .message-tools .composer-state{display:none!important}

        #deal-drawer .deal-side-pane.active{
          display:block!important;width:100%!important;height:100%!important;min-height:0!important;
          overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important;
          padding:12px 10px calc(18px + env(safe-area-inset-bottom))!important
        }
      }
    `;
    document.head.appendChild(style);
  }

  function v2651Sync() {
    v2651ViewportHeight();
    v2651InstallStyle();
    v2651RenderInbox();
    v2651SyncChatActions();
    v2651SyncScroller();
  }

  function v2651Queue() {
    if (v2651Queued) return;
    v2651Queued = true;
    requestAnimationFrame(() => {
      v2651Queued = false;
      v2651Sync();
    });
  }

  function v2651Install() {
    v2651Sync();

    document.addEventListener("click", (event) => {
      const filter = event.target.closest("[data-v2651-filter]");
      if (filter) {
        v2651Filter = filter.dataset.v2651Filter || "pending";
        v2651RenderInbox();
        return;
      }

      const attendance = event.target.closest("[data-v2651-attendance]");
      if (attendance) {
        void v2651SetAttendance(attendance.dataset.v2651Attendance, attendance);
        return;
      }

      const chatAttendance = event.target.closest("[data-v2651-chat-attendance]");
      if (chatAttendance) {
        void v2651SetAttendance(chatAttendance.dataset.v2651ChatAttendance || "active", chatAttendance);
        return;
      }

      const card = event.target.closest("[data-v2651-deal]");
      if (card) {
        const id = card.dataset.v2651Deal;
        if (typeof openDrawer === "function") openDrawer(id);
        document.body.classList.add("v2651-mobile-chat-open");
        setTimeout(v2651Sync, 0);
        return;
      }

      const details = event.target.closest("[data-v2651-details]");
      if (details) {
        if (typeof setDrawerPane === "function") setDrawerPane("details");
        else document.querySelector('[data-drawer-tab="details"]')?.click();
        return;
      }

      const closeMenuButton = event.target.closest("[data-v2651-close-menu]");
      if (closeMenuButton) {
        const menu = document.querySelector("#deal-drawer .v2651-close-menu");
        if (menu) menu.hidden = !menu.hidden;
        return;
      }

      const closeChoice = event.target.closest("[data-v2651-close]");
      if (closeChoice) {
        const menu = document.querySelector("#deal-drawer .v2651-close-menu");
        if (menu) menu.hidden = true;
        if (closeChoice.dataset.v2651Close === "won") document.querySelector("#mark-won-button")?.click();
        if (closeChoice.dataset.v2651Close === "lost") document.querySelector("#mark-lost-button")?.click();
        return;
      }

      if (event.target.closest("[data-close-drawer]")) {
        document.body.classList.remove("v2651-mobile-chat-open");
        const menu = document.querySelector("#deal-drawer .v2651-close-menu");
        if (menu) menu.hidden = true;
      }

      if (event.target.closest('[data-view="crm"]')) setTimeout(v2651RenderInbox, 0);
    }, true);

    document.addEventListener("input", (event) => {
      if (event.target?.id !== "v2651-mobile-search") return;
      v2651Search = event.target.value || "";
      v2651RenderInbox();
    });

    window.addEventListener("crm:state", v2651Queue);
    window.addEventListener("resize", v2651Queue, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(v2651Queue, 80), { passive: true });
    window.visualViewport?.addEventListener("resize", v2651Queue, { passive: true });
    window.visualViewport?.addEventListener("scroll", v2651ViewportHeight, { passive: true });

    new MutationObserver((mutations) => {
      if (!v2651IsMobile()) return;
      for (const mutation of mutations) {
        if (mutation.type === "childList" || mutation.attributeName === "class" || mutation.attributeName === "aria-hidden") {
          v2651Queue();
          break;
        }
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "aria-hidden"] });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", v2651Install, { once: true });
  } else {
    v2651Install();
  }
})();
`;

export function applyV2651AgentMobileInboxPatches(source) {
  if (source.includes(MARKER)) return source;
  if (!source.includes("// V26.46 COMPLETE_MOBILE_RUNTIME")) {
    throw new Error("V26.51 requiere V26.46 aplicado antes.");
  }
  return source + APPEND;
}
