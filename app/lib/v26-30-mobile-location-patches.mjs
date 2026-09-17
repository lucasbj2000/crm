const CORE_MARKER = "// V26.30 MOBILE_LOCATION_UX";
const SERVER_MARKER = "// V26.30 LOCATION_MESSAGES";

function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.30: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.30: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

export function applyV2630ServerPatches(source) {
  if (source.includes(SERVER_MARKER)) return source;

  const qrFind = 'function extractText(message) {\n  const content = unwrapMessage(message);\n  return cleanText(';
  const qrReplacement = [
    'function v2630LocationText(location) {',
    '  const latitude = Number(location?.degreesLatitude ?? location?.latitude);',
    '  const longitude = Number(location?.degreesLongitude ?? location?.longitude);',
    '  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";',
    '  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return "";',
    '  const lat = latitude.toFixed(7).replace(/0+$/, "").replace(/\\.$/, "");',
    '  const lng = longitude.toFixed(7).replace(/0+$/, "").replace(/\\.$/, "");',
    '  const coordinates = lat + "," + lng;',
    '  const mapsUrl = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(coordinates);',
    '  const label = cleanText(location?.name || location?.address || "", 240);',
    '  return cleanText("📍 Ubicación compartida" + (label ? " · " + label : "") + "\\n" + coordinates + "\\n" + mapsUrl, 6000);',
    '}',
    '',
    'function extractText(message) {',
    '  const content = unwrapMessage(message);',
    '  const location = content.locationMessage || content.liveLocationMessage || null;',
    '  const locationText = v2630LocationText(location);',
    '  if (locationText) return locationText;',
    '  return cleanText(',
  ].join('\n');
  source = replaceOnce(source, qrFind, qrReplacement, "lector de ubicación QR");

  const cloudFind = '    const phone=normalizePhone(item.from),jid=`${phone}@s.whatsapp.net`; const rawMedia=item.image||item.video||item.audio||item.document||null;\n    const text=cleanText(item.text?.body||item.button?.text||item.interactive?.button_reply?.title||rawMedia?.caption||"",6000);';
  const cloudReplacement = '    const phone=normalizePhone(item.from),jid=`${phone}@s.whatsapp.net`; const rawMedia=item.image||item.video||item.audio||item.document||null; const rawLocation=item.location||null;\n    const text=cleanText(item.text?.body||item.button?.text||item.interactive?.button_reply?.title||rawMedia?.caption||v2630LocationText(rawLocation)||"",6000);';
  source = replaceOnce(source, cloudFind, cloudReplacement, "lector de ubicación Cloud API");

  return `${source}\n\n${SERVER_MARKER}\n`;
}

export function applyV2630CoreUiPatches(source) {
  if (source.includes(CORE_MARKER)) return source;

  const patch = String.raw`
;(() => {
  "use strict";
  var MOBILE_QUERY = "(max-width: 900px)";
  var locationSyncQueued = false;

  function isMobileV2630() {
    return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  }

  function installV2630Style() {
    if (document.getElementById("v2630-mobile-location-style")) return;
    var style = document.createElement("style");
    style.id = "v2630-mobile-location-style";
    style.textContent = [
      ".v2630-location-card{display:grid;grid-template-columns:38px minmax(0,1fr);gap:10px;align-items:center;margin:2px 0 4px;padding:11px 12px;border:1px solid #d8e6dd;border-radius:13px;background:#f8fbf9;max-width:100%}",
      ".v2630-location-pin{display:grid;width:38px;height:38px;place-items:center;border-radius:12px;background:#e6f3eb;font-size:19px}",
      ".v2630-location-copy{min-width:0}.v2630-location-copy strong,.v2630-location-copy small{display:block}.v2630-location-copy strong{font-size:12px;color:#173527}.v2630-location-copy small{margin-top:3px;color:#708078;font-size:9px;overflow-wrap:anywhere}",
      ".v2630-location-open{grid-column:1/-1;display:flex;min-height:40px;align-items:center;justify-content:center;border:1px solid #c9dbd0;border-radius:10px;background:#fff;color:#173527;font-size:11px;font-weight:850;text-decoration:none}",
      ".v2630-location-open:hover{background:#edf7f1}",
      ".v2630-mobile-dock{display:none}",
      "@media(max-width:900px){",
      "body.v2630-mobile .workspace{padding:0 8px calc(78px + env(safe-area-inset-bottom))!important;overflow-x:hidden!important}",
      "body.v2630-mobile .workspace-header{position:sticky!important;top:0!important;z-index:90!important;width:calc(100% + 16px)!important;margin:0 -8px 8px!important;padding:max(8px,env(safe-area-inset-top)) 10px 8px!important;background:rgba(255,255,255,.97)!important;backdrop-filter:blur(12px)!important;border-bottom:1px solid #e7ebe8!important}",
      "body.v2630-mobile .workspace-header>div:first-child{margin:0 0 6px!important}body.v2630-mobile .workspace-header h2{font-size:20px!important;line-height:1.15!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}body.v2630-mobile .breadcrumb{font-size:8px!important;margin-bottom:3px!important}",
      "body.v2630-mobile .live-clock,body.v2630-mobile .weather-pill,body.v2630-mobile .presence-pill,body.v2630-mobile .connection-pill,body.v2630-mobile .compact-refresh,body.v2630-mobile .install-app-button{display:none!important}",
      "body.v2630-mobile .operational-header,body.v2630-mobile .header-actions{display:block!important;overflow:visible!important;padding:0!important}body.v2630-mobile .header-attendance{display:grid!important;grid-template-columns:auto minmax(0,1fr)!important;width:100%!important;max-width:100%!important;padding:7px 9px!important;border:1px solid #e1e7e3!important;border-radius:11px!important;background:#f8faf9!important}body.v2630-mobile .header-attendance select{width:100%!important;min-width:0!important;height:38px!important}",
      "body.v2630-mobile .metric-grid{display:flex!important;grid-template-columns:none!important;gap:8px!important;overflow-x:auto!important;padding:2px 0 7px!important;scroll-snap-type:x proximity!important;-webkit-overflow-scrolling:touch!important;scrollbar-width:none!important}body.v2630-mobile .metric-grid::-webkit-scrollbar{display:none}body.v2630-mobile .metric{flex:0 0 150px!important;min-height:82px!important;scroll-snap-align:start!important;padding:10px!important}",
      "body.v2630-mobile .toolbar{display:grid!important;grid-template-columns:minmax(0,1fr) 128px!important;gap:7px!important}body.v2630-mobile .toolbar .search-box{grid-column:1/-1!important}body.v2630-mobile .toolbar .select-box{grid-column:1!important}body.v2630-mobile #new-client-button{grid-column:2!important;min-height:44px!important;padding-inline:8px!important}body.v2630-mobile .heat-legend{display:none!important}",
      "body.v2630-mobile .mobile-stage-tabs{position:sticky!important;top:99px!important;z-index:70!important;width:calc(100% + 16px)!important;margin:0 -8px 8px!important;padding:7px 8px!important;gap:6px!important;background:rgba(255,255,255,.98)!important;border-bottom:1px solid #e8ece9!important;overflow-x:auto!important;scrollbar-width:none!important}body.v2630-mobile .mobile-stage-tabs::-webkit-scrollbar{display:none}body.v2630-mobile .mobile-stage-tabs button{min-height:40px!important;padding:0 11px!important;border-radius:11px!important;white-space:nowrap!important}",
      "body.v2630-mobile #crm-board.board{display:block!important;width:100%!important;overflow:visible!important;padding:0!important}body.v2630-mobile #crm-board .board-column{display:none!important;width:100%!important;min-width:0!important;max-width:100%!important;max-height:none!important;overflow:visible!important}body.v2630-mobile #crm-board .board-column.mobile-active{display:block!important}body.v2630-mobile #crm-board .board-column>header{position:sticky!important;top:148px!important;z-index:15!important;background:#fff!important;border-radius:12px 12px 0 0!important}",
      "body.v2630-mobile .deal-list{display:grid!important;gap:8px!important;width:100%!important}body.v2630-mobile .deal-card{width:100%!important;max-width:100%!important;margin:0!important;padding:12px!important;border-radius:13px!important;box-shadow:0 4px 14px rgba(22,45,35,.06)!important}",
      "body.v2630-mobile .drawer-mobile-tabs{position:sticky!important;top:0!important;z-index:30!important;display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:5px!important;padding:max(7px,env(safe-area-inset-top)) 8px 7px!important;background:#fff!important}body.v2630-mobile .drawer-mobile-tabs button{min-height:42px!important;font-size:11px!important}",
      "body.v2630-mobile .deal-drawer .drawer-panel{width:100vw!important;height:var(--v256-app-height,100dvh)!important;max-height:var(--v256-app-height,100dvh)!important}body.v2630-mobile .drawer-content{height:calc(100% - 58px)!important;padding:0!important;overflow:hidden!important}body.v2630-mobile .drawer-workspace{height:100%!important;overflow:hidden!important;padding:0!important}",
      "body.v2630-mobile .deal-chat-column,body.v2630-mobile .deal-side-pane{height:100%!important;max-height:100%!important;padding:8px!important;overflow-y:auto!important;overscroll-behavior:contain!important;-webkit-overflow-scrolling:touch!important}body.v2630-mobile .deal-chat-column.active,body.v2630-mobile .deal-side-pane.active{display:flex!important;flex-direction:column!important}",
      "body.v2630-mobile .chat-only-section{flex:1 1 0!important;height:auto!important;min-height:0!important;overflow:hidden!important;border-radius:12px!important}body.v2630-mobile .chat-only-section #drawer-messages{flex:1 1 0!important;height:0!important;min-height:0!important;padding:12px!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important}body.v2630-mobile .chat-only-section #drawer-messages>.message{max-width:88%!important}",
      "body.v2630-mobile .modern-composer,body.v2630-mobile #message-form{flex:0 0 auto!important;position:relative!important;bottom:auto!important;padding:8px!important}body.v2630-mobile .quick-reply-bar{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:6px!important}body.v2630-mobile .context-side-pane .drawer-call-actions,body.v2630-mobile .drawer-outcome-actions{grid-template-columns:1fr!important}",
      "body.v2630-mobile .section-grid,body.v2630-mobile .section-grid.two-cols,body.v2630-mobile .section-grid.three-cols,body.v2630-mobile .form-grid,body.v2630-mobile .report-grid,body.v2630-mobile .productivity-grid,body.v2630-mobile .ai-workbench,body.v2630-mobile .attendance-layout,body.v2630-mobile .branding-layout,body.v2630-mobile .data-grid,body.v2630-mobile .operations-grid,body.v2630-mobile .branch-grid{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:9px!important}body.v2630-mobile .panel{padding:11px!important;border-radius:13px!important}",
      "body.v2630-mobile .table-wrap,body.v2630-mobile .table-shell,body.v2630-mobile .responsive-table,body.v2630-mobile .data-table-wrap{overflow-x:auto!important;-webkit-overflow-scrolling:touch!important}",
      "body.v2630-mobile .v2630-mobile-dock{position:fixed!important;left:max(7px,env(safe-area-inset-left))!important;right:max(7px,env(safe-area-inset-right))!important;bottom:max(7px,env(safe-area-inset-bottom))!important;z-index:10025!important;display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:4px!important;padding:5px!important;border:1px solid rgba(211,222,216,.9)!important;border-radius:17px!important;background:rgba(255,255,255,.96)!important;box-shadow:0 12px 35px rgba(15,38,28,.18)!important;backdrop-filter:blur(14px)!important}",
      "body.v2630-mobile .v2630-mobile-dock button{display:grid!important;min-width:0!important;min-height:51px!important;place-items:center!important;align-content:center!important;gap:1px!important;padding:4px 2px!important;border:0!important;border-radius:12px!important;background:transparent!important;color:#64736b!important;font-size:8px!important;font-weight:850!important}body.v2630-mobile .v2630-mobile-dock button span{font-size:19px!important;line-height:1!important}body.v2630-mobile .v2630-mobile-dock button.active{background:#173527!important;color:#fff!important}",
      "body.v2630-mobile .v24-mobile-menu{display:none!important}body.v2630-mobile .sidebar{padding-bottom:calc(84px + env(safe-area-inset-bottom))!important}body.v2630-mobile .sidebar .nav-item{min-height:48px!important;font-size:13px!important}",
      "body.v2630-mobile dialog>.dialog-card,body.v2630-mobile dialog .dialog-card{padding:10px!important;padding-top:max(10px,env(safe-area-inset-top))!important;padding-bottom:calc(78px + env(safe-area-inset-bottom))!important}",
      "}"
    ].join("");
    document.head.appendChild(style);
  }

  function ensureV2630Dock() {
    var dock = document.getElementById("v2630-mobile-dock");
    if (dock) return dock;
    dock = document.createElement("nav");
    dock.id = "v2630-mobile-dock";
    dock.className = "v2630-mobile-dock";
    dock.setAttribute("aria-label", "Accesos móviles");
    dock.innerHTML = '<button type="button" data-v2630-action="crm"><span>◫</span>Negociaciones</button><button type="button" data-v2630-action="new"><span>＋</span>Nuevo</button><button type="button" data-v2630-action="reports"><span>▥</span>Reportes</button><button type="button" data-v2630-action="menu"><span>☰</span>Más</button>';
    document.body.appendChild(dock);
    dock.addEventListener("click", function(event) {
      var button = event.target.closest("[data-v2630-action]");
      if (!button) return;
      var action = button.dataset.v2630Action;
      if (action === "new") { document.querySelector("#new-client-button")?.click(); return; }
      if (action === "menu") { document.body.classList.add("v24-nav-open"); return; }
      document.querySelector('.nav-item[data-view="' + action + '"]')?.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(updateV2630Dock, 0);
    });
    return dock;
  }

  function updateV2630Dock() {
    var dock = ensureV2630Dock();
    var view = "crm";
    try { view = String(currentView || "crm"); } catch {}
    dock.querySelectorAll("[data-v2630-action]").forEach(function(button) {
      button.classList.toggle("active", button.dataset.v2630Action === view);
    });
  }

  function markV2630Viewport() {
    var mobile = isMobileV2630();
    document.body.classList.toggle("v2630-mobile", mobile);
    ensureV2630Dock().hidden = !mobile;
    if (!mobile) document.body.classList.remove("v24-nav-open");
    updateV2630Dock();
  }

  function enhanceV2630Location(node) {
    if (!(node instanceof Element) || node.dataset.v2630Location === "1") return;
    var text = String(node.textContent || "").trim();
    var match = text.match(/https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=([^\s]+)/i);
    if (!match) return;
    var coordinates = match[1];
    try { coordinates = decodeURIComponent(coordinates); } catch {}
    if (!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(coordinates)) return;
    var parts = coordinates.split(",");
    var latitude = parts[0];
    var longitude = parts[1];
    var firstLine = text.split("\n").find(function(line) { return line.trim().startsWith("📍"); }) || "📍 Ubicación compartida";
    var title = firstLine.replace(/^📍\s*/, "").trim() || "Ubicación compartida";
    var href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(latitude + "," + longitude);
    var card = document.createElement("div");
    card.className = "v2630-location-card";
    var pin = document.createElement("span"); pin.className = "v2630-location-pin"; pin.textContent = "📍";
    var copy = document.createElement("div"); copy.className = "v2630-location-copy";
    var strong = document.createElement("strong"); strong.textContent = title;
    var small = document.createElement("small"); small.textContent = "Coordenadas exactas: " + latitude + ", " + longitude;
    copy.append(strong, small);
    var link = document.createElement("a"); link.className = "v2630-location-open"; link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Abrir ubicación exacta en Maps ↗";
    card.append(pin, copy, link);
    node.textContent = "";
    node.appendChild(card);
    node.dataset.v2630Location = "1";
  }

  function syncV2630Locations() {
    locationSyncQueued = false;
    document.querySelectorAll("#drawer-messages .message p,#v2511-messages .v2511-message p,.v252-messages .v252-message p").forEach(enhanceV2630Location);
  }

  function queueV2630Locations() {
    if (locationSyncQueued) return;
    locationSyncQueued = true;
    requestAnimationFrame(syncV2630Locations);
  }

  function installV2630() {
    installV2630Style();
    ensureV2630Dock();
    markV2630Viewport();
    queueV2630Locations();
    new MutationObserver(queueV2630Locations).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", markV2630Viewport, { passive: true });
    window.addEventListener("orientationchange", function() { setTimeout(markV2630Viewport, 120); }, { passive: true });
    document.querySelector(".nav-list")?.addEventListener("click", function() { setTimeout(updateV2630Dock, 0); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installV2630, { once: true });
  else installV2630();
  console.info("V26.30 MOBILE_LOCATION_UX");
})();
`;

  return `${source}\n\n${patch}\n${CORE_MARKER}\n`;
}
