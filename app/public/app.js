const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const stageLabels = {
  new: "Nuevos contactos",
  contacted: "Contactado",
  waiting: "Cliente espera respuesta",
  won: "Ganado",
  lost: "Cerrado perdido",
  transferred: "Derivado",
};

const viewCopy = {
  crm: ["NEGOCIACIONES", "Panel comercial"],
  whatsapp: ["WHATSAPP Y BOT", "Conexión y asistente"],
  branches: ["SUCURSALES", "Red central y líneas de WhatsApp"],
  organization: ["ESTRUCTURA", "Organigrama de la empresa"],
  attendance: ["MARCACIÓN", "Disponibilidad y cobertura"],
  campaigns: ["CAMPAÑAS", "Segmentación y efectividad"],
  news: ["NOTICIAS", "Comunicación interna"],
  ai: ["CENTRO IA", "Copiloto 360° del agente"],
  productivity: ["PRODUCTIVIDAD", "Tareas, alertas y objetivos"],
  drive: ["RED LEGACY", "Compatibilidad anterior"],
  stock: ["STOCK", "Inventario"],
  replies: ["RESPUESTAS RÁPIDAS", "Biblioteca de respuestas"],
  data: ["DATOS Y RESPALDOS", "Importar, exportar y migrar"],
  reports: ["REPORTES", "Inteligencia operativa"],
  settings: ["CONFIGURACIÓN", "Equipo y seguridad"],
  design: ["DISEÑO Y MARCA", "Identidad visual y white-label"],
};

const connectionCopy = {
  disconnected: ["Listo para vincular", "Generá un código y escanealo desde Dispositivos vinculados."],
  starting: ["Preparando conexión", "Estamos solicitando un código seguro a WhatsApp."],
  qr: ["Escaneá el código", "El código se renueva automáticamente si vence."],
  connected: ["WhatsApp conectado", "El dispositivo quedó vinculado y el bot está listo."],
  error: ["No se pudo conectar", "Reintentá para generar un código nuevo."],
};

const dateTime = new Intl.DateTimeFormat("es-PY", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const money = new Intl.NumberFormat("es-PY", {
  style: "currency",
  currency: "PYG",
  maximumFractionDigits: 0,
});

let appState = null;
let authenticated = false;
let selectedDealId = null;
let currentView = "crm";
let settingsHydrated = false;
let polling = false;
let pollTimer = null;
let lastStateRevision = 0;
let lastPollErrorAt = 0;
let toastTimer = null;
let reportPeriod = 30;
let reportLoading = false;
let pendingMedia = null;
let recorderStream = null;
let mediaRecorder = null;
let mediaRecorderChunks = [];
let recordingStartedAt = 0;
let discardRecording = false;
let isRecordingAudio = false;
let dismissedCallId = null;
let selectedClientProfileId = null;
let reportUserId = "all";
let reportBranchId = "all";
let driveOverview = null;
let driveLoading = false;
let dataImportType = "";
let mobileStage = "new";
let deferredInstallPrompt = null;
const copilotSuggestionCache = new Map();
let activeCopilotSuggestion = null;
let copilotLoadingKey = "";
const smartDataSuggestionCache = new Map();
let smartDataLoadingKey = "";
let activeDocumentForSend = null;
let campaignCatalog = { campaigns: [], safety: {}, documents: [] };
let headerOperations = null;
let headerClockTimer = null;
let activeAiInsight = null;
let platformConfigHydrated = false;
let motionObserver = null;
let progressTimer = null;
let liveActivityIndex = 0;
let liveActivityTimer = null;
let previousVisualSnapshot = { deals: 0, waiting: 0, won: 0, lowStock: 0, news: 0 };
let organizationData = null;
let masterContext = null;


function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}

function brandFromState() {
  const brand = appState?.settings?.branding || {};
  return {
    systemName: brand.systemName || "WhatsBot CRM",
    shortName: brand.shortName || "WhatsBot",
    subtitle: brand.subtitle || "CRM LOCAL",
    primaryColor: brand.primaryColor || "#171717",
    accentColor: brand.accentColor || "#FF7A00",
    backgroundColor: brand.backgroundColor || "#F3F3F3",
    sidebarColor: brand.sidebarColor || brand.primaryColor || "#101010",
    surfaceColor: brand.surfaceColor || "#ffffff",
    textColor: brand.textColor || "#1B1B1B",
    fontStyle: brand.fontStyle || "modern",
    radius: String(brand.radius || "14"),
    logoFit: brand.logoFit || "contain",
    defaultTheme: brand.defaultTheme || "light",
    loginKicker: brand.loginKicker || "CONTROL LOCAL · 24/7",
    loginMessage: brand.loginMessage || "Ingresá con tu usuario para administrar las conversaciones, el bot y el stock.",
    loginStyle: brand.loginStyle || "minimal",
    showSubtitle: brand.showSubtitle !== false,
    logoUrl: brand.logoUrl || (brand.logoFileName ? "/api/branding/logo" : ""),
  };
}

function applyBranding(input = {}) {
  const brand = { ...brandFromState(), ...input };
  document.documentElement.style.setProperty("--green", brand.primaryColor);
  document.documentElement.style.setProperty("--green-2", brand.primaryColor);
  document.documentElement.style.setProperty("--lime", brand.accentColor);
  document.documentElement.style.setProperty("--cream", brand.backgroundColor);
  document.documentElement.style.setProperty("--brand-sidebar", brand.sidebarColor);
  document.documentElement.style.setProperty("--xp-surface", brand.surfaceColor);
  document.documentElement.style.setProperty("--xp-text", brand.textColor);
  document.documentElement.style.setProperty("--xp-radius", `${Number(brand.radius) || 18}px`);
  document.documentElement.style.setProperty("--brand-logo-fit", brand.logoFit);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", brand.primaryColor);
  document.title = brand.systemName || "WhatsBot CRM";
  if ($("#login-brand-name")) $("#login-brand-name").textContent = brand.systemName;
  if ($("#sidebar-brand-name")) $("#sidebar-brand-name").textContent = brand.shortName;
  if ($("#sidebar-brand-subtitle")) $("#sidebar-brand-subtitle").textContent = brand.subtitle;
  if ($("#sidebar-brand-subtitle")) $("#sidebar-brand-subtitle").hidden = brand.showSubtitle === false;
  if ($("#login-brand-kicker")) $("#login-brand-kicker").textContent = brand.loginKicker;
  if ($("#login-brand-message")) $("#login-brand-message").textContent = brand.loginMessage;
  document.body.dataset.brandFont = brand.fontStyle;
  document.body.dataset.brandLogin = brand.loginStyle;
  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]'); if (appleTitle) appleTitle.setAttribute("content", brand.shortName || brand.systemName);
  const letter = String(brand.shortName || brand.systemName || "W").trim().charAt(0).toUpperCase() || "W";
  const builtInMark = `<svg class="brand-built-in-svg" viewBox="0 0 48 48" aria-hidden="true"><path d="M11 12.5h26a5.5 5.5 0 0 1 5.5 5.5v13a5.5 5.5 0 0 1-5.5 5.5H24l-8.8 6v-6H11A5.5 5.5 0 0 1 5.5 31V18A5.5 5.5 0 0 1 11 12.5Z"/><path class="brand-built-in-accent" d="M15 21h18M15 27h12"/><circle class="brand-built-in-dot" cx="36.5" cy="11" r="4"/></svg>`;
  for (const id of ["#login-brand-letter", "#sidebar-brand-letter", "#branding-preview-letter"]) { const el=$(id); if(el){ el.dataset.brandLetter=letter; el.innerHTML=builtInMark; } }
  const logoUrl = brand.logoUrl ? `${brand.logoUrl}${brand.logoUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(appState?.settings?.branding?.logoFileName || "logo")}` : "";
  const favicon = $("#brand-favicon"); if (favicon) favicon.href = logoUrl || "/icons/icon-192.png";
  for (const id of ["#login-brand-logo", "#sidebar-brand-logo", "#branding-preview-image"]) {
    const image = $(id); if (!image) continue; image.hidden = !logoUrl; if (logoUrl) image.src = logoUrl; image.style.objectFit = brand.logoFit || "contain";
  }
  for (const id of ["#login-brand-letter", "#sidebar-brand-letter", "#branding-preview-letter"]) if ($(id)) $(id).hidden = Boolean(logoUrl);
}

function initials(name) {
  return String(name || "C")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateTime.format(date);
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin actividad";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return `Hace ${Math.floor(hours / 24)} d`;
}

function elapsedLabel(minutes, prefix = "Espera") {
  const total = Math.max(0, Math.floor(Number(minutes) || 0));
  if (total < 1) return `${prefix} menos de 1 min`;
  if (total < 60) return `${prefix} ${total} min`;
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  if (hours < 24) return `${prefix} ${hours} h${remainder ? ` ${remainder} min` : ""}`;
  const days = Math.floor(hours / 24);
  return `${prefix} ${days} d ${hours % 24} h`;
}

function compactDuration(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  if (value < 1) return "< 1 min";
  if (value < 60) return `${Math.round(value)} min`;
  if (value < 1440) return `${Math.floor(value / 60)} h ${Math.round(value % 60)} min`;
  return `${Math.floor(value / 1440)} d ${Math.floor((value % 1440) / 60)} h`;
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function whatsappUrl(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "https://web.whatsapp.com/";
}


function normalizeDialPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) digits = `595${digits.slice(1)}`;
  if (!digits.startsWith("595") && digits.length <= 10) digits = `595${digits}`;
  return digits;
}


const experienceOptions = {
  pageTransitions: ["Cambio entre módulos", "Transiciones fluidas al navegar"],
  messageMotion: ["Mensajes", "Entrada suave de mensajes nuevos"],
  cardMotion: ["Tarjetas y listas", "Aparición escalonada de negociaciones y paneles"],
  counterMotion: ["Contadores", "KPIs y métricas cuentan hasta el valor nuevo"],
  chartMotion: ["Gráficos", "Barras y reportes se revelan progresivamente"],
  aiMotion: ["Centro IA", "Pulso y destellos mientras la IA analiza"],
  weatherMotion: ["Clima", "Microanimación del estado meteorológico"],
  attentionMotion: ["Alertas", "Pulso discreto en información que requiere atención"],
  buttonMotion: ["Botones", "Respuesta táctil, ripple y microinteracciones"],
  toastMotion: ["Confirmaciones", "Toasts animados al completar acciones"],
  progressBar: ["Barra de carga", "Indicador superior durante operaciones de red"],
  liveActivity: ["Actividad en vivo", "Ticker discreto con movimientos recientes del equipo"],
  successBurst: ["Éxitos", "Celebración sutil al ganar, guardar o completar"],
  skeletons: ["Carga visual", "Skeletons y estados de espera más claros"],
  ambientBackground: ["Fondo dinámico", "Profundidad ambiental muy sutil"],
  hoverLift: ["Profundidad", "Eleva tarjetas al pasar el mouse"],
  autoPerformance: ["Rendimiento automático", "Reduce efectos en equipos limitados"],
  pauseWhenHidden: ["Ahorro en segundo plano", "Pausa movimiento si la pestaña no está visible"],
  dialogMotion: ["Ventanas", "Apertura y cierre suave de diálogos"],
  sidebarMotion: ["Menú lateral", "Indicadores y navegación con movimiento"],
  stockMotion: ["Stock", "Destaca cambios de cantidad y alertas de mínimo"],
  newsMotion: ["Noticias", "Entrada y prioridad visual animada"],
  presenceMotion: ["Presencia", "Estados disponible/pausa/ausente con feedback vivo"],
};

function experienceSettings() {
  return appState?.settings?.experience || { motionLevel: "full", density: "comfortable" };
}

function motionEnabled(key) {
  const e = experienceSettings();
  if (e.motionLevel === "off") return false;
  if (key && e[key] === false) return false;
  if (e.pauseWhenHidden !== false && document.hidden) return false;
  if (e.autoPerformance !== false) {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const cores = Number(navigator.hardwareConcurrency || 8);
    const memory = Number(navigator.deviceMemory || 8);
    if (reduced || cores <= 2 || memory <= 2) return e.motionLevel === "full" && ["toastMotion", "progressBar"].includes(key);
  }
  return true;
}

function applyExperienceSettings() {
  const e = experienceSettings();
  const root = document.documentElement;
  root.dataset.motion = e.motionLevel || "full";
  root.dataset.density = e.density || "comfortable";
  root.classList.toggle("ambient-motion", motionEnabled("ambientBackground"));
  root.classList.toggle("hover-motion", motionEnabled("hoverLift"));
  root.classList.toggle("button-motion", motionEnabled("buttonMotion"));
  root.classList.toggle("dialog-motion", motionEnabled("dialogMotion"));
  root.classList.toggle("sidebar-motion", motionEnabled("sidebarMotion"));
  root.classList.toggle("weather-motion", motionEnabled("weatherMotion"));
  root.classList.toggle("presence-motion", motionEnabled("presenceMotion"));
  root.classList.toggle("news-motion", motionEnabled("newsMotion"));
  root.classList.toggle("stock-motion", motionEnabled("stockMotion"));
  setupMotionObserver();
  setupLiveActivity();
}

function setupMotionObserver() {
  if (motionObserver) return;
  motionObserver = new MutationObserver((mutations) => {
    if (experienceSettings().motionLevel === "off") return;
    const targets = [];
    for (const mutation of mutations) for (const node of mutation.addedNodes) if (node.nodeType === 1) {
      if (node.matches?.(".deal-card,.message,.metric,.news-card,.task-card,.objective-card,.approval-card,.ranking-row,.risk-row,.presence-person,.quick-reply-card,.ai-insight-card,.smart-alert,.activity-row")) targets.push(node);
      node.querySelectorAll?.(".deal-card,.message,.metric,.news-card,.task-card,.objective-card,.approval-card,.ranking-row,.risk-row,.presence-person,.quick-reply-card,.ai-insight-card,.smart-alert,.activity-row").forEach(x => targets.push(x));
    }
    targets.slice(0, 80).forEach((node, index) => {
      const isMessage = node.classList.contains("message");
      if ((isMessage && !motionEnabled("messageMotion")) || (!isMessage && !motionEnabled("cardMotion"))) return;
      node.style.setProperty("--motion-delay", `${Math.min(index * 24, 240)}ms`);
      node.classList.add("motion-enter");
      window.setTimeout(() => node.classList.remove("motion-enter"), 900 + Math.min(index * 24, 240));
    });
  });
  motionObserver.observe(document.body, { childList: true, subtree: true });
}

function setProgress(active) {
  const bar = $("#global-progress");
  if (!bar || !motionEnabled("progressBar")) return;
  window.clearTimeout(progressTimer);
  bar.classList.toggle("active", active);
  if (!active) progressTimer = window.setTimeout(() => bar.classList.remove("finishing"), 350);
  if (!active) bar.classList.add("finishing"); else bar.classList.remove("finishing");
}

function successBurst(source = null) {
  if (!motionEnabled("successBurst")) return;
  const layer = $("#motion-burst-layer"); if (!layer) return;
  const rect = source?.getBoundingClientRect?.();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect ? rect.top + rect.height / 2 : Math.min(window.innerHeight * .35, 300);
  for (let i = 0; i < 10; i += 1) {
    const dot = document.createElement("i");
    dot.style.left = `${x}px`; dot.style.top = `${y}px`; dot.style.setProperty("--burst-x", `${(Math.random() - .5) * 140}px`); dot.style.setProperty("--burst-y", `${-30 - Math.random() * 110}px`); dot.style.setProperty("--burst-r", `${Math.random() * 180 - 90}deg`); dot.style.animationDelay = `${i * 18}ms`; layer.appendChild(dot); window.setTimeout(() => dot.remove(), 1000);
  }
}

function setupLiveActivity() {
  window.clearInterval(liveActivityTimer);
  const strip = $("#live-activity-strip");
  if (!strip) return;
  if (!motionEnabled("liveActivity")) { strip.hidden = true; return; }
  const update = () => {
    const entries = (appState?.activities || []).slice(0, 10);
    if (!entries.length) { strip.hidden = true; return; }
    liveActivityIndex %= entries.length;
    const entry = entries[liveActivityIndex++];
    $("#live-activity-text").textContent = entry.text || "Actividad del equipo";
    $("#live-activity-time").textContent = relativeTime(entry.at);
    strip.hidden = false;
    strip.classList.remove("activity-swap"); void strip.offsetWidth; strip.classList.add("activity-swap");
  };
  update(); liveActivityTimer = window.setInterval(update, experienceSettings().motionLevel === "soft" ? 7000 : 5200);
}

function animateNumberElement(element, value) {
  if (!element) return;
  const target = Number(value);
  if (!Number.isFinite(target) || !motionEnabled("counterMotion")) { element.textContent = value; return; }
  const from = Number(String(element.textContent || "0").replace(/[^0-9.-]/g, "")) || 0;
  const start = performance.now(), duration = experienceSettings().motionLevel === "soft" ? 360 : 620;
  const tick = (now) => { const p = Math.min(1, (now-start)/duration); const eased = 1-Math.pow(1-p,3); element.textContent = Math.round(from+(target-from)*eased).toLocaleString("es-PY"); if (p<1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

function previewExperience() {
  applyExperienceSettings();
  const metrics = $$(".metric").slice(0,4); metrics.forEach((m,i)=>{m.classList.remove("preview-pop");m.style.setProperty("--motion-delay",`${i*80}ms`);void m.offsetWidth;m.classList.add("preview-pop");});
  successBurst($("#experience-preview-button"));
  showToast("Vista previa de animaciones V20", "success");
}

function showToast(message, tone = "success") {
  const toast = $("#toast");
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast visible ${tone}`;
  // Popover coloca el aviso en la top-layer del navegador, por encima de cualquier <dialog>.
  // Esto evita que los errores queden borrosos detrás de una ventana modal.
  if (typeof toast.showPopover === "function") {
    try { if (!toast.matches(":popover-open")) toast.showPopover(); } catch {}
  }
  if (tone === "success" && /ganad|guardad|cread|enviad|complet|actualiz|preparad/i.test(String(message))) successBurst();
  toastTimer = window.setTimeout(() => {
    toast.className = "toast";
    if (typeof toast.hidePopover === "function") { try { if (toast.matches(":popover-open")) toast.hidePopover(); } catch {} }
  }, 4200);
}

function setUserFormError(message = "") {
  const box = $("#user-form-error");
  if (!box) return;
  box.textContent = String(message || "").trim();
  box.hidden = !box.textContent;
  if (!box.hidden) box.scrollIntoView({ block: "nearest", behavior: motionEnabled("dialogMotion") ? "smooth" : "auto" });
}

function showLogin(message = "") {
  authenticated = false;
  appState = null;
  settingsHydrated = false;
  $("#app-shell").hidden = true;
  $("#login-screen").hidden = false;
  $("#deal-drawer").classList.remove("open");
  if($("#master-company-bar"))$("#master-company-bar").hidden=true;
  document.body.classList.remove("master-mode");
  $("#login-error").textContent = message;
  window.setTimeout(() => $("#login-username").focus(), 30);
}

function showApp() {
  authenticated = true;
  $("#login-screen").hidden = true;
  $("#app-shell").hidden = false;
}

async function hydrateMasterContext(){
  const bar=$("#master-company-bar");if(!bar)return;
  if(appState?.currentUser?.isMaster!==true){bar.hidden=true;document.body.classList.remove("master-mode");masterContext=null;return;}
  try{masterContext=await api("/api/gateway/master/context");bar.hidden=false;document.body.classList.add("master-mode");const selected=masterContext.selectedCompany;$("#master-current-company").textContent=selected?.name||"Seleccioná una empresa";$("#master-company-select").innerHTML=(masterContext.companies||[]).map(company=>`<option value="${escapeHtml(company.slug)}">${escapeHtml(company.name)} · ${escapeHtml(company.code)}</option>`).join("");if(selected)$("#master-company-select").value=selected.slug;const security=$("#password-form")?.closest(".security-panel");if(security)security.hidden=true;}catch(error){bar.hidden=true;document.body.classList.remove("master-mode");showToast(error.message,"warning");}
}
async function selectMasterCompany(slug,view="crm"){
  if(!slug)return;await api("/api/gateway/master/select-company",{method:"POST",body:JSON.stringify({slug})});window.location.assign(`/?view=${encodeURIComponent(view)}`);
}

async function api(url, options = {}) {
  const requestOptions = { credentials: "same-origin", cache: "no-store", ...options };
  const showProgress = authenticated && url !== "/api/state" && url !== "/api/live";
  if (showProgress) setProgress(true);
  if (requestOptions.body && !(requestOptions.body instanceof FormData)) {
    requestOptions.headers = { "Content-Type": "application/json", ...(requestOptions.headers || {}) };
  }
  let response;
  try { response = await fetch(url, requestOptions); } catch (error) { if (showProgress) setProgress(false); throw error; }
  const raw = await response.text();
  let result = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = {}; }
  if (response.status === 401 && url !== "/api/auth/login") {
    showLogin("Tu sesión venció. Ingresá nuevamente.");
  }
  if (showProgress) setProgress(false);
  if (!response.ok) {
    const fallback = raw && !raw.trim().startsWith("<") ? raw.trim().slice(0, 300) : `Error HTTP ${response.status}`;
    throw new Error(result.error || result.message || fallback || "No se pudo completar la acción.");
  }
  return result;
}

function setState(next, { hydrateSettings = false } = {}) {
  const previousReports = appState?.reports;
  const previousUser = appState?.currentUser;
  const previousUsers = appState?.users;
  appState = next;
  if (Number.isFinite(Number(next?.revision))) lastStateRevision = Number(next.revision);
  if (previousReports && !appState.reports) appState.reports = previousReports;
  if (previousUser && !appState.currentUser) appState.currentUser = previousUser;
  if (previousUsers && !appState.users) appState.users = previousUsers;
  if (hydrateSettings) settingsHydrated = false;
  applyExperienceSettings();
  renderAll();
  const snapshot = { deals:(appState.deals||[]).filter(d=>["new","contacted","waiting"].includes(d.stage)).length, waiting:(appState.deals||[]).filter(d=>d.stage==="waiting").length, won:(appState.deals||[]).filter(d=>d.stage==="won").length, lowStock:(appState.products||[]).filter(p=>p.active!==false&&Number(p.available)<=Number(p.minStock)).length, news:Number(appState.newsUnreadCount||0) };
  if (motionEnabled("attentionMotion")) {
    if (snapshot.deals > previousVisualSnapshot.deals) $("#nav-deal-count")?.classList.add("attention-pop");
    if (snapshot.waiting > previousVisualSnapshot.waiting) $("#metric-waiting")?.closest(".metric")?.classList.add("attention-pop");
    if (snapshot.news > previousVisualSnapshot.news) $("#nav-news-count")?.classList.add("attention-pop");
    window.setTimeout(()=>$$('.attention-pop').forEach(x=>x.classList.remove('attention-pop')),1200);
  }
  previousVisualSnapshot = snapshot;
  window.dispatchEvent(new CustomEvent("crm:state", { detail: { revision:lastStateRevision, view:currentView } }));
}

async function mutate(url, method = "POST", body) {
  const next = await api(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  setState(next);
  return next;
}

function switchView(view) {
  if (!viewCopy[view]) return;
  currentView = view;
  $$(".nav-item[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$("[data-view-panel]").forEach((panel) => { const active = panel.dataset.viewPanel === view; panel.classList.toggle("active", active); if (active && motionEnabled("pageTransitions")) { panel.classList.remove("view-motion-enter"); void panel.offsetWidth; panel.classList.add("view-motion-enter"); window.setTimeout(()=>panel.classList.remove("view-motion-enter"),700); } });
  $("#header-section").textContent = viewCopy[view][0];
  $("#header-title").textContent = viewCopy[view][1];
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "reports" && (!appState?.reports || appState.reports.periodDays !== reportPeriod)) {
    void fetchReports();
  }
  if (view === "drive") void fetchDriveStatus();
  if (view === "campaigns") void fetchCampaigns();
  if (view === "news") renderNews();
  if (view === "ai") renderAiCenter();
  if (view === "productivity") renderProductivity();
  if (view === "organization") void fetchOrganization();
  // Actualiza únicamente la vista recién abierta con el estado ya disponible.
  renderAll();
}


function renderConnection() {
  const connection = appState.connection || { status: "disconnected" };
  const status = connection.status || "disconnected";
  const cloud = connection.provider === "cloud" || appState.settings?.whatsappMode === "cloud";
  const connected = status === "connected";
  $("#whatsapp-mode").value = cloud ? "cloud" : "qr";
  $("#qr-connection-section").hidden = cloud;
  $("#api-connection-section").hidden = !cloud;
  const pending = status === "starting" || status === "qr";
  const pill = $("#connection-pill");
  pill.className = `connection-pill${connected ? " online" : pending ? " pending" : ""}`;
  $("span", pill).textContent = connected ? (cloud ? "API conectada" : "Conectado") : pending ? "Vinculando" : "Sin vincular";
  $("#nav-connection-dot").className = `connection-dot${connected ? " online" : pending ? " pending" : ""}`;

  const mini = $("#mini-status");
  mini.className = `mini-status${connected ? " online" : pending ? " pending" : ""}`;
  $("b", mini).textContent = connected ? (cloud ? "API activa" : "Conectado") : pending ? "En proceso" : "Pendiente";
  const [title, detail] = connectionCopy[status] || connectionCopy.disconnected;
  $("#connection-title").textContent = title;
  $("#connection-detail").textContent = connection.error || detail;

  const stage = $("#qr-stage");
  if (connection.qr) {
    stage.innerHTML = `<div class="qr-frame"><img src="${escapeHtml(connection.qr)}" alt="Código QR para vincular WhatsApp" /></div>`;
  } else if (connected) {
    stage.innerHTML = `<div class="phone-illustration"><span>✓</span><i></i><small>${escapeHtml(connection.account || "Cuenta vinculada")}</small></div>`;
  } else if (status === "starting") {
    stage.innerHTML = `<div class="phone-illustration"><span>…</span><i></i><small>Generando un código seguro</small></div>`;
  } else {
    stage.innerHTML = `<div class="phone-illustration"><span>W</span><i></i><small>${status === "error" ? "Volvé a intentarlo" : "Generá un QR para comenzar"}</small></div>`;
  }
  $("#connect-button").hidden = cloud || !["disconnected", "error"].includes(status);
  $("#unlink-button").hidden = cloud || !connected;
  const sync = $("#sync-detail");
  if (connection.syncing) {
    sync.textContent = "Revisando mensajes que llegaron mientras el equipo estuvo desconectado…";
  } else if (connection.lastImportAt && connection.lastImportCount) {
    sync.textContent = `${connection.lastImportCount} mensaje${connection.lastImportCount === 1 ? " recuperado" : "s recuperados"} en la última reconexión · ${relativeTime(connection.lastImportAt)}.`;
  } else {
    sync.textContent = "Al reconectar, los mensajes pendientes aparecerán en el CRM sin duplicarse.";
  }
}

function activeReserved(deal) {
  return (deal.items || []).filter((item) => item.status === "reserved");
}

function renderMetrics() {
  const deals = appState.deals || [];
  const products = (appState.products || []).filter((product) => product.active !== false);
  const open = deals.filter((deal) => ["new", "contacted", "waiting"].includes(deal.stage));
  const waiting = deals.filter((deal) => deal.stage === "waiting");
  const won = deals.filter((deal) => deal.stage === "won");
  const low = products.filter((product) => Number(product.available) <= Number(product.minStock));
  const oldest = waiting.slice().sort((a, b) => Number(b.heat?.minutes || 0) - Number(a.heat?.minutes || 0))[0];

  animateNumberElement($("#metric-open"), open.length);
  $("#metric-open-note").textContent = open.length ? `${open.length} conversación${open.length === 1 ? "" : "es"} activa${open.length === 1 ? "" : "s"}` : "Sin conversaciones";
  animateNumberElement($("#metric-waiting"), waiting.length);
  $("#metric-oldest").textContent = oldest ? elapsedLabel(oldest.heat?.minutes, "Mayor espera:") : "Al día";
  animateNumberElement($("#metric-won"), won.length);
  animateNumberElement($("#metric-low-stock"), low.length);
  $("#nav-deal-count").textContent = open.length;
  $("#nav-stock-alert").textContent = low.length;
  animateNumberElement($("#stock-total-products"), products.length);
  animateNumberElement($("#stock-total-units"), products.reduce((sum, item) => sum + Number(item.available || 0), 0));
  animateNumberElement($("#stock-total-reserved"), products.reduce((sum, item) => sum + Number(item.reserved || 0), 0));
}

function renderBoard() {
  const search = $("#deal-search").value.trim().toLowerCase();
  const filter = $("#deal-filter").value;
  let deals = appState.deals || [];
  if (search) {
    deals = deals.filter((deal) => [deal.name, deal.phone, deal.contactPersonName, deal.contactRole, deal.lastMessage]
      .some((value) => String(value || "").toLowerCase().includes(search)));
  }
  if (filter === "mine") deals = deals.filter((deal) => deal.ownerUserId === appState.currentUser?.id);
  if (filter === "unassigned") deals = deals.filter((deal) => !deal.ownerUserId);
  if (filter === "bot") deals = deals.filter((deal) => deal.botActive);
  if (filter === "reserved") deals = deals.filter((deal) => activeReserved(deal).length);

  $$(".board-column").forEach((column) => {
    const stage = column.dataset.stage;
    const entries = deals.filter((deal) => deal.stage === stage);
    $("header > span", column).textContent = entries.length;
    const list = $(".deal-list", column);
    if (!entries.length) {
      list.innerHTML = `<div class="column-empty">No hay negociaciones</div>`;
      return;
    }
    const mobileCount = document.querySelector(`[data-mobile-stage-count="${stage}"]`);
    if (mobileCount) mobileCount.textContent = entries.length;
    list.innerHTML = entries.map((deal) => {
      const reserved = activeReserved(deal).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const heat = stage === "waiting" && ["warm", "hot", "red", "critical"].includes(deal.heat?.level)
        ? ` heat-${deal.heat.level}` : "";
      const time = stage === "waiting"
        ? `<span class="wait-time">${escapeHtml(elapsedLabel(deal.heat?.minutes))}</span>`
        : `<span>${escapeHtml(relativeTime(deal.updatedAt))}</span>`;
      return `<button class="deal-card${heat}" type="button" data-deal-id="${escapeHtml(deal.id)}">
        <span class="deal-top"><span class="avatar">${escapeHtml(initials(deal.name))}</span><span><strong>${escapeHtml(deal.name)}</strong><small>${escapeHtml(deal.contactPersonName ? `${deal.contactPersonName}${deal.contactRole ? ` · ${deal.contactRole}` : ""} · ${deal.phone}` : deal.phone)}</small></span><span class="bot-badge${deal.botActive ? "" : " off"}">${deal.botActive ? "BOT" : deal.botHumanHandoff ? "COPILOTO" : "PAUSADO"}</span></span>
        <span class="deal-message">${escapeHtml(deal.lastMessage || "Sin mensajes todavía")}</span>
        <span class="deal-owner ${deal.ownerUserId ? "assigned" : "unassigned"}">${deal.ownerUserId ? `● ${escapeHtml(deal.ownerName || "Asignado")}` : "○ Sin responsable"}</span>
        <span class="deal-branch-badge">⌂ ${escapeHtml(dealBranch(deal)?.name || "Sucursal")}${deal.lineId ? ` · ◉ ${escapeHtml((appState.whatsappLines||[]).find(line=>line.id===deal.lineId)?.name || "Línea")}` : ""}</span>
        <span class="deal-footer">${time}${reserved ? `<span class="item-badge">${reserved} reserv.</span>` : ""}</span>
      </button>`;
    }).join("");
  });
  updateMobileStage();
}

function updateMobileStage() {
  $$("[data-mobile-stage]").forEach((button) => button.classList.toggle("active", button.dataset.mobileStage === mobileStage));
  $$(".board-column").forEach((column) => column.classList.toggle("mobile-active", column.dataset.stage === mobileStage));
}

function renderActivity() {
  const list = $("#activity-list");
  const entries = (appState.activities || []).slice(0, 15);
  list.innerHTML = entries.length
    ? entries.map((entry) => `<div class="activity-row ${escapeHtml(entry.tone || "neutral")}"><i></i><span>${escapeHtml(entry.text)}</span><time title="${escapeHtml(formatDate(entry.at))}">${escapeHtml(relativeTime(entry.at))}</time></div>`).join("")
    : `<div class="column-empty">La actividad aparecerá aquí</div>`;
}

function renderStock() {
  const search = $("#stock-search").value.trim().toLowerCase();
  let products = (appState.products || []).filter((product) => product.active !== false);
  if (search) products = products.filter((product) => [product.name, product.sku, product.description]
    .some((value) => String(value || "").toLowerCase().includes(search)));
  const body = $("#stock-table-body");
  body.innerHTML = products.map((product) => {
    const low = Number(product.available) <= Number(product.minStock);
    return `<tr>
      <td><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.description || "Sin descripción")}</small></td>
      <td>${escapeHtml(product.sku)}</td>
      <td><span class="stock-number${low ? " low" : ""}">${Number(product.available || 0)}</span></td>
      <td>${Number(product.reserved || 0)}</td><td>${Number(product.minStock || 0)}</td>
      <td>${Number(product.price || 0) ? escapeHtml(money.format(product.price)) : "—"}</td>
      <td><div class="row-actions">${["admin", "manager"].includes(appState.currentUser?.role) ? `<button type="button" data-product-action="adjust" data-product-id="${escapeHtml(product.id)}">Ajustar</button><button type="button" data-product-action="edit" data-product-id="${escapeHtml(product.id)}">Editar</button><button type="button" data-product-action="archive" data-product-id="${escapeHtml(product.id)}">Archivar</button>` : ""}</div></td>
    </tr>`;
  }).join("");
  $("#stock-empty").classList.toggle("visible", products.length === 0);
  $(".table-scroll", $("#stock-table-body").closest(".panel")).hidden = products.length === 0;

  const movements = (appState.stockMovements || []).slice(0, 20);
  const typeCopy = {
    initial: ["＋", "Stock inicial"], adjustment: ["±", "Ajuste"], reserve: ["□", "Reserva"], release: ["↩", "Devolución"], sale: ["✓", "Venta"],
  };
  $("#movement-list").innerHTML = movements.length
    ? movements.map((movement) => {
      const [icon, label] = typeCopy[movement.type] || ["•", movement.type];
      const qty = Number(movement.quantity || 0);
      return `<div class="movement-row"><span class="movement-type">${icon}</span><span><strong>${escapeHtml(movement.productName)}</strong><small>${escapeHtml(label)} · ${escapeHtml(movement.note || "")}</small></span><span><strong>${escapeHtml(formatDate(movement.at))}</strong><small>Disponible: ${Number(movement.after || 0)}</small></span><b class="${qty < 0 ? "negative" : qty > 0 ? "positive" : ""}">${qty > 0 ? "+" : ""}${qty}</b></div>`;
    }).join("")
    : `<div class="column-empty">Todavía no hay movimientos</div>`;
}

function hydrateSettings() {
  if (settingsHydrated) return;
  const settings = appState.settings;
  $("#instructions").value = settings.instructions || "";
  $("#model").value = settings.model || "gpt-4.1-mini";
  $("#api-key").value = "";
  $("#api-key").placeholder = settings.hasApiKey ? "•••••••• clave configurada" : "sk-…";
  $("#api-key-status").textContent = settings.hasApiKey ? "Clave configurada" : "No configurada";
  $("#bot-can-reserve").checked = settings.botCanReserve !== false;
  const wa = settings.whatsappApi || {};
  $("#whatsapp-mode").value = settings.whatsappMode === "cloud" ? "cloud" : "qr";
  $("#wa-phone-number-id").value = wa.phoneNumberId || "";
  $("#wa-business-id").value = wa.businessAccountId || "";
  $("#wa-api-version").value = wa.apiVersion || "v26.0";
  $("#wa-access-token").value = "";
  $("#wa-verify-token").value = "";
  $("#wa-token-status").textContent = wa.hasAccessToken ? "Token configurado" : "No configurado";
  $("#wa-verify-status").textContent = wa.hasVerifyToken ? "Token configurado" : "No configurado";
  $("#wa-webhook-url").textContent = `${window.location.origin}/api/whatsapp/webhook`;
  $("#followup-enabled").checked = settings.followup?.enabled !== false;
  $("#followup-value").value = settings.followup?.value ?? 30;
  $("#followup-unit").value = settings.followup?.unit || "minutes";
  $("#followup-message").value = settings.followup?.message || "";
  $("#close-enabled").checked = settings.autoClose?.enabled !== false;
  $("#close-value").value = settings.autoClose?.value ?? 24;
  $("#close-unit").value = settings.autoClose?.unit || "hours";
  $("#heat-warm").value = settings.heatMinutes?.warm ?? 15;
  $("#heat-hot").value = settings.heatMinutes?.hot ?? 30;
  $("#heat-red").value = settings.heatMinutes?.red ?? 60;
  $("#heat-critical").value = settings.heatMinutes?.critical ?? 120;
  const brand = settings.branding || {};
  $("#brand-system-name").value = brand.systemName || "WhatsBot CRM";
  $("#brand-short-name").value = brand.shortName || "WhatsBot";
  $("#brand-subtitle").value = brand.subtitle || "CRM LOCAL";
  $("#brand-primary-color").value = brand.primaryColor || "#143c2f";
  $("#brand-accent-color").value = brand.accentColor || "#b9d977";
  $("#brand-background-color").value = brand.backgroundColor || "#f4f2ea";
  if ($("#brand-sidebar-color")) $("#brand-sidebar-color").value = brand.sidebarColor || brand.primaryColor || "#143c2f";
  if ($("#brand-surface-color")) $("#brand-surface-color").value = brand.surfaceColor || "#ffffff";
  if ($("#brand-text-color")) $("#brand-text-color").value = brand.textColor || "#1a2b24";
  if ($("#brand-font-style")) $("#brand-font-style").value = brand.fontStyle || "modern";
  if ($("#brand-radius")) $("#brand-radius").value = String(brand.radius || "18");
  if ($("#brand-logo-fit")) $("#brand-logo-fit").value = brand.logoFit || "contain";
  if ($("#brand-default-theme")) $("#brand-default-theme").value = brand.defaultTheme || "light";
  if ($("#brand-login-kicker")) $("#brand-login-kicker").value = brand.loginKicker || "CONTROL LOCAL · 24/7";
  if ($("#brand-login-message")) $("#brand-login-message").value = brand.loginMessage || "Ingresá con tu usuario para administrar las conversaciones, el bot y el stock.";
  if ($("#brand-login-style")) $("#brand-login-style").value = brand.loginStyle || "ambient";
  if ($("#brand-show-subtitle")) $("#brand-show-subtitle").value = String(brand.showSubtitle !== false);
  applyBranding();
  const exp = settings.experience || {};
  if ($("#experience-motion-level")) $("#experience-motion-level").value = exp.motionLevel || "full";
  if ($("#experience-density")) $("#experience-density").value = exp.density || "comfortable";
  renderExperienceSettings();
  applyExperienceSettings();
  settingsHydrated = true;
  updateInstructionCounter();
}

function renderBotToggle() {
  const button = $("#global-bot-toggle");
  const active = appState.settings.botEnabled !== false;
  button.setAttribute("aria-checked", String(active));
  $("span", button).textContent = active ? "Activo" : "Pausado";
}

function roleLabel(role) {
  return role === "admin" ? "Administrador" : role === "manager" ? "Gerente" : role === "supervisor" ? "Jefe" : "Agente";
}

function branchById(id) {
  return (appState?.branches || []).find((branch) => branch.id === id) || null;
}

function dealBranch(deal) {
  return branchById(deal?.branchId) || (appState?.branches || [])[0] || null;
}

function branchConnection(branch) {
  return branch?.connection || (appState?.branchConnections || []).find((entry) => entry.branchId === branch?.id) || { status: "disconnected", provider: "qr" };
}

function connectionStatusLabel(connection = {}) {
  if (connection.status === "remote") return "Sucursal externa";
  if (connection.status === "connected") return connection.provider === "cloud" ? "API conectada" : "WhatsApp conectado";
  if (connection.status === "qr") return "QR listo";
  if (connection.status === "starting") return "Conectando…";
  if (connection.status === "error") return "Error de conexión";
  return "Sin conectar";
}

function renderBranches() {
  const list = $("#branches-list");
  if (!list) return;
  const branches = appState.branches || [];
  const user = appState.currentUser || {};
  $("#nav-branch-count").textContent = branches.length;
  $("#new-branch-button").hidden = user.role !== "admin";
  if (!branches.length) { list.innerHTML = `<div class="panel column-empty">No hay sucursales configuradas.</div>`; return; }
  list.innerHTML = branches.map((branch) => {
    const connection = branchConnection(branch);
    const connected = connection.status === "connected";
    const pending = ["qr", "starting"].includes(connection.status);
    const canConnect = user.role === "admin" || (user.role === "manager" && user.branchId === branch.id);
    const canEdit = user.role === "admin";
    const employees = (appState.users || []).filter((entry) => entry.branchId === branch.id && entry.active !== false);
    const location = [branch.address, branch.city].filter(Boolean).join(" · ") || "Ubicación no configurada";
    const phone = connection.account || branch.phone || "Número no configurado";
    const qr = connection.qr ? `<div class="branch-qr"><img src="${escapeHtml(connection.qr)}" alt="QR de ${escapeHtml(branch.name)}" /><small>Escaneá este QR con el WhatsApp exclusivo de ${escapeHtml(branch.name)}.</small></div>` : "";
    const statusClass = connected ? "online" : pending ? "pending" : connection.status === "error" ? "error" : "";
    return `<article class="panel branch-card central-branch-card" data-branch-id="${escapeHtml(branch.id)}">
      <div class="branch-card-head"><div><p class="kicker">${branch.isPrimary ? "PRINCIPAL · " : "RED CENTRAL · "}${escapeHtml(branch.code || "SUCURSAL")}</p><h3>${escapeHtml(branch.name)}</h3><p>${escapeHtml(location)}</p></div><span class="branch-status ${statusClass}"><i></i>${escapeHtml(connectionStatusLabel(connection))}</span></div>
      <div class="branch-card-stats"><div><small>WhatsApp de la sucursal</small><strong>${escapeHtml(phone)}</strong></div><div><small>Usuarios</small><strong>${Number(branch.userCount ?? employees.length)}</strong></div><div><small>Negociaciones abiertas</small><strong>${Number(branch.openDealCount || 0)}</strong></div></div>
      ${employees.length ? `<div class="branch-employees"><small>Equipo:</small>${employees.slice(0, 10).map((entry) => `<span class="${entry.online ? "online" : ""}">${escapeHtml(entry.name)}</span>`).join("")}${employees.length > 10 ? `<span>+${employees.length - 10}</span>` : ""}</div>` : `<div class="branch-employees"><small>Sin usuarios asignados a esta sucursal</small></div>`}
      ${qr}${connection.error ? `<div class="branch-error">${escapeHtml(connection.error)}</div>` : ""}
      <div class="branch-card-actions">${canConnect ? (connected ? `<button class="button danger-outline" type="button" data-branch-action="disconnect">Desvincular WhatsApp</button>` : `<button class="button primary" type="button" data-branch-action="connect">${pending ? "Regenerar QR" : "Conectar WhatsApp"}</button>`) : ""}${canEdit ? `<button class="button ghost" type="button" data-branch-action="edit">Configurar sucursal</button>` : ""}</div>
    </article>`;
  }).join("");
}

function auditActionLabel(action) {
  const labels = {
    inicio_sesion: "Inicio de sesión",
    mensaje_enviado: "Mensaje enviado",
    archivo_enviado: "Archivo enviado",
    mensaje_cliente_recibido: "Mensaje recibido",
    mensaje_bot_enviado: "Bot respondió",
    seguimiento_bot_enviado: "Seguimiento automático",
    mensaje_agente_desde_whatsapp: "Mensaje desde WhatsApp",
    responsable_asignado: "Responsable asignado",
    bot_modificado: "Bot modificado",
    negociacion_ganada: "Negociación ganada",
    negociacion_perdida: "Negociación perdida",
    negociacion_cerrada_automaticamente: "Cierre automático",
    producto_reservado: "Producto reservado",
    reserva_devuelta: "Reserva devuelta",
    conversacion_transferida: "Conversación transferida",
    transferencia_recibida: "Transferencia recibida",
    transferencia_recibida_sin_bienvenida: "Transferencia recibida con error",
    llamada_iniciada: "Llamada iniciada",
    cliente_creado: "Cliente creado",
    cliente_actualizado: "Cliente actualizado",
    stock_modificado: "Stock modificado",
    usuario_modificado: "Usuario modificado",
    sucursal_modificada: "Sucursal modificada",
    respuesta_rapida_modificada: "Respuesta rápida modificada",
    identidad_modificada: "Identidad visual modificada",
    datos_importados: "Datos importados",
    configuracion_modificada: "Configuración modificada",
    drive_configurado: "Drive configurado",
    drive_sincronizado: "Drive sincronizado",
  };
  return labels[action] || String(action || "Movimiento").replaceAll("_", " ");
}

function renderDrive() {
  const shared = appState?.sharedDrive || {};
  const overview = driveOverview || shared.overview || { branches: [], uniqueClients: 0, recentMovements: [] };
  const admin = appState?.currentUser?.role === "admin";
  const connected = shared.enabled && shared.status === "connected";
  const pending = shared.enabled && ["pending", "syncing"].includes(shared.status);
  const dot = $("#nav-drive-dot");
  if (dot) dot.className = `connection-dot${connected ? " online" : pending ? " pending" : ""}`;
  const pill = $("#drive-status-pill");
  if (pill) {
    pill.className = `mini-status${connected ? " online" : pending ? " pending" : ""}`;
    $("b", pill).textContent = connected ? "Sincronizado" : shared.enabled ? (shared.status === "error" ? "Con error" : "Pendiente") : "Desactivado";
  }
  if ($("#drive-folder-path") && admin && document.activeElement !== $("#drive-folder-path")) $("#drive-folder-path").value = shared.folderPath || "";
  if ($("#drive-sync-interval") && admin) $("#drive-sync-interval").value = String(shared.syncIntervalSeconds || 15);
  if ($("#drive-enabled") && admin) $("#drive-enabled").checked = shared.enabled === true;
  if ($("#drive-settings-panel")) {
    $$("input,select,button", $("#drive-settings-panel")).forEach((control) => { if (!["drive-open-folder"].includes(control.id)) control.disabled = !admin; });
  }
  $("#drive-last-sync").textContent = shared.lastSyncAt ? `Última sincronización ${relativeTime(shared.lastSyncAt)}` : "Todavía no sincronizado";
  $("#drive-error-copy").textContent = shared.lastError || (shared.enabled ? "Sin errores registrados" : "Activá Drive para compartir información");
  $("#drive-branch-count").textContent = Number(overview.branches?.length || shared.branches || 0);
  $("#drive-client-count").textContent = Number(overview.uniqueClients || shared.clients || 0);
  $("#drive-deal-count").textContent = Number((overview.branches || []).reduce((sum, branch) => sum + Number(branch.deals || 0), 0) || shared.deals || 0);
  $("#drive-branches-list").innerHTML = overview.branches?.length ? overview.branches.map((branch) => `<div class="drive-branch-row"><div><strong>${escapeHtml(branch.name)}</strong><small>${escapeHtml(branch.code || "")} · ${escapeHtml(branch.city || "Sin ciudad")} · ${branch.generatedAt ? `actualizado ${escapeHtml(relativeTime(branch.generatedAt))}` : "sin fecha"}</small></div><div><span>${Number(branch.clients || 0)} clientes</span><span>${Number(branch.open || 0)} abiertas</span><span>${Number(branch.won || 0)} ganadas</span><b>${money.format(Number(branch.salesValue || 0))}</b></div></div>`).join("") : `<div class="column-empty">Todavía no hay snapshots de sucursales en la carpeta compartida</div>`;
  renderDriveStock();
  const movements = overview.recentMovements || [];
  $("#drive-audit-list").innerHTML = movements.length ? movements.map((event) => `<div class="movement-row"><span>${escapeHtml(formatDate(event.at))}</span><div><strong>${escapeHtml(auditActionLabel(event.action))}</strong><small>${escapeHtml(event.userName || "Sistema")} · ${escapeHtml(event.branchName || event.branchCode || "Sucursal")}${event.details?.clientPhone ? ` · ${escapeHtml(event.details.clientPhone)}` : ""}</small></div></div>`).join("") : `<div class="column-empty">Los movimientos aparecerán después de sincronizar las sucursales</div>`;
  $("#drive-audit-panel").hidden = !overview.canViewGlobalReports && appState?.currentUser?.role !== "admin";
}

function renderDriveStock() {
  const overview = driveOverview || appState?.sharedDrive?.overview || { branches: [] };
  const query = String($("#drive-stock-search")?.value || "").trim().toLowerCase();
  const rows = (overview.branches || []).flatMap((branch) => (branch.products || []).map((product) => ({ ...product, branchName: branch.name, branchCode: branch.code }))).filter((row) => !query || `${row.branchName} ${row.branchCode} ${row.name} ${row.sku}`.toLowerCase().includes(query));
  $("#drive-stock-body").innerHTML = rows.length ? rows.map((row) => `<tr><td><strong>${escapeHtml(row.branchName)}</strong><small>${escapeHtml(row.branchCode || "")}</small></td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.sku || "")}</td><td><b>${Number(row.available || 0)}</b></td><td>${Number(row.reserved || 0)}</td><td>${Number(row.minStock || 0)}</td></tr>`).join("") : `<tr><td colspan="6"><div class="column-empty">Sin stock compartido para mostrar</div></td></tr>`;
}

async function fetchDriveStatus() {
  if (driveLoading || !authenticated) return;
  driveLoading = true;
  try {
    const result = await api("/api/shared-drive/status");
    driveOverview = result.overview || null;
    appState.sharedDrive = { ...(appState.sharedDrive || {}), ...result };
    renderDrive();
  } catch (error) {
    showToast(error.message, "warning");
  } finally {
    driveLoading = false;
  }
}

function openBranchDialog(branch = null) {
  $("#branch-form").reset();
  $("#branch-id").value = branch?.id || "";
  $("#branch-name").value = branch?.name || "";
  $("#branch-code").value = branch?.code || "";
  $("#branch-city").value = branch?.city || "";
  $("#branch-address").value = branch?.address || "";
  $("#branch-phone").value = branch?.phone || "";
  $("#branch-weather-location").value = branch?.weatherLocation || branch?.city || "";
  $("#branch-timezone").value = branch?.timezone || "America/Asuncion";
  $("#branch-intro-message").value = branch?.introMessage || "Hola {cliente}, te saluda {sucursal}. Estamos ubicados en {ubicacion}. {contexto}";
  $("#branch-intro-row").hidden = false;
  $("#branch-active").checked = branch?.active !== false;
  $("#branch-dialog-title").textContent = branch ? "Configurar sucursal" : "Nueva sucursal";
  $("#branch-dialog").showModal();
}

function updateTransferFields() {
  const type = $("#transfer-type").value;
  $("#transfer-user-row").hidden = type !== "user";
  $("#transfer-branch-row").hidden = type !== "branch";
  $("#transfer-context-fields").hidden = type !== "branch";
  if (type === "branch") {
    $("#transfer-explanation").innerHTML = `<span>↔</span><p>La derivación ocurre dentro del <b>servidor central</b>. Se crea inmediatamente una negociación en la sucursal destino, se asigna un responsable de ese equipo y, si su WhatsApp está conectado, se contacta al cliente desde la línea correcta.</p>`;
  } else {
    $("#transfer-explanation").innerHTML = `<span>i</span><p>El compañero seleccionado pasa a ser el responsable principal del cliente dentro de esta misma instalación.</p>`;
  }
}

function openTransferDialog() {
  const deal = (appState.deals || []).find((entry) => entry.id === selectedDealId);
  if (!deal) return;
  const source = dealBranch(deal);
  const coworkers = (appState.users || []).filter((entry) => entry.active !== false && (!entry.branchId || entry.branchId === deal.branchId) && entry.id !== deal.ownerUserId);
  const branches = (appState.branches || []).filter((entry) => entry.active !== false && entry.id !== deal.branchId);
  const reserved = (deal.items || []).filter((item) => item.status === "reserved").map((item) => `${item.name}${Number(item.quantity || 0) > 1 ? ` x${Number(item.quantity)}` : ""}`);
  const lastClientMessages = (deal.messages || []).filter((message) => message.direction === "incoming" && message.origin !== "transfer" && message.text).slice(-2).map((message) => message.text);
  $("#transfer-client-copy").textContent = `${deal.name} · ${deal.phone}`;
  $("#transfer-source-branch").textContent = source?.name || "Sucursal actual";
  $("#transfer-user").innerHTML = coworkers.length ? coworkers.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}${entry.online ? " · en línea" : ""}</option>`).join("") : `<option value="">No hay otros compañeros disponibles</option>`;
  $("#transfer-branch").innerHTML = branches.length ? branches.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}${entry.city ? ` · ${escapeHtml(entry.city)}` : ""}</option>`).join("") : `<option value="">No hay otra sucursal configurada</option>`;
  const visiblePhone = String(deal.phone || "").replace(/\D/g, "");
  $("#transfer-client-phone").value = visiblePhone.length >= 10 && visiblePhone.length <= 15 ? visiblePhone : "";
  $("#transfer-interest").value = reserved.join(", ");
  $("#transfer-reason").value = lastClientMessages.join(" / ").slice(0, 600);
  $("#transfer-note").value = "";
  $("#transfer-type").value = coworkers.length ? "user" : "branch";
  updateTransferFields();
  $("#transfer-dialog").showModal();
}
function renderUserStatus() {
  const user = appState.currentUser || {};
  const admin = user.role === "admin";
  const manager = user.role === "manager";
  const supervisor = user.role === "supervisor";
  const elevated = admin || manager || supervisor;
  $("#current-user-name").textContent = user.name || user.username || "Usuario";
  $("#current-user-role").textContent = roleLabel(user.role);
  $("#current-user-branch").textContent = user.branchName || (admin ? "Administración general" : "Sin sucursal");
  $("#current-user-avatar").textContent = initials(user.name || user.username || "U").slice(0, 1);
  $("#users-panel").hidden = !elevated;
  $("#new-user-button").hidden = !admin;
  $("#automation-admin-content").hidden = !admin;
  $("#automation-admin-footer").hidden = !admin;
  $("#admin-assistant-panel").hidden = !admin;
  $("#branding-panel").hidden = !admin;
  if ($("#operations-admin-panel")) $("#operations-admin-panel").hidden = !admin;
  if ($("#new-news-button")) $("#new-news-button").hidden = !(user.permissions?.newsPublish === true || admin || manager || supervisor);
  $("#backup-panel").hidden = !admin;
  $("#data-users-card").hidden = !admin;
  $("#data-branches-card").hidden = !admin;
  $("#data-replies-card").hidden = !elevated;
  const stockDataCard = $('[data-data-type="stock"]'); if (stockDataCard) stockDataCard.hidden = !elevated;
  const whatsappNav = $('.nav-item[data-view="whatsapp"]');
  if (whatsappNav) whatsappNav.hidden = !admin;
  const campaignNav = $('.nav-item[data-view="campaigns"]');
  if (campaignNav) campaignNav.hidden = !(admin || user.permissions?.campaignView === true || user.permissions?.campaignManage === true);
  $("#import-stock-button").hidden = !elevated;
  $("#new-product-button").hidden = !elevated;
  $("#new-reply-button").hidden = !elevated;
  const newDocButton = $("#new-assistant-document-button"); if (newDocButton) newDocButton.hidden = !elevated;
  const customFieldPanel = $("#custom-fields-list")?.closest(".panel"); if (customFieldPanel) customFieldPanel.hidden = !(admin || user.permissions?.customFieldsManage === true);
  const botRulesPanel = $("#bot-rules-list")?.closest(".panel"); if (botRulesPanel) botRulesPanel.hidden = !elevated;
  const driveSyncButton = $("#drive-sync-button"); if (driveSyncButton) driveSyncButton.hidden = true;
  const driveOpenFolder = $("#drive-open-folder"); if (driveOpenFolder) driveOpenFolder.hidden = true;
  if (!admin && currentView === "whatsapp") switchView("crm");
}

function renderUsers() {
  const list = $("#users-list");
  const currentRole = appState.currentUser?.role;
  if (!list || !["admin", "manager"].includes(currentRole)) return;
  const canEdit = currentRole === "admin";
  const users = appState.users || [];
  list.innerHTML = users.length ? users.map((user) => { const assignedLines=(appState.whatsappLines||[]).filter((line)=>(user.whatsappLineIds||[]).includes(line.id)); return `<div class="user-row" data-user-id="${escapeHtml(user.id)}">
    <span class="user-avatar">${escapeHtml(initials(user.name))}</span>
    <div><strong>${escapeHtml(user.name)}</strong><small>@${escapeHtml(user.username)} · ${escapeHtml(roleLabel(user.role))} · ${escapeHtml(user.branchName || "Todas las sucursales")} · ${Number(user.clientLoadsToday || 0)}/${Number(user.clientDailyLimit || 0)} clientes cargados hoy</small><small>${assignedLines.length ? `WhatsApp: ${escapeHtml(assignedLines.map((line)=>line.name).join(", "))}` : "WhatsApp: sin líneas asignadas"}</small></div>
    <span class="online-badge ${user.online ? "online" : ""}">${user.online ? "● En línea" : "○ Desconectado"}</span>
    <span class="active-badge ${user.active ? "" : "inactive"}">${user.active ? "Activo" : "Inactivo"}</span>
    ${canEdit ? `<button type="button" data-user-edit="${escapeHtml(user.id)}">Editar</button>` : ""}
  </div>`; }).join("") : `<div class="column-empty">No hay usuarios cargados</div>`;
}

function ensureUserWhatsappAssignment() {
  let section = $("#user-whatsapp-assignment");
  if (section) return section;
  section = document.createElement("section");
  section.id = "user-whatsapp-assignment";
  section.className = "line-user-selector user-whatsapp-assignment";
  section.innerHTML = `<div class="panel-title"><div><p class="kicker">LÍNEAS DE WHATSAPP</p><h4>Números asignados al usuario</h4><small>Asignale una, dos o todas las líneas, sin importar su sucursal. También podés cambiarlo después desde esta misma ficha.</small></div><span id="user-whatsapp-line-count">0 seleccionadas</span></div><div id="user-whatsapp-line-list" class="line-user-list"></div>`;
  const passwordInput = $("#user-password");
  passwordInput?.closest("label")?.before(section);
  section.addEventListener("change", updateUserWhatsappLineCount);
  return section;
}

function updateUserWhatsappLineCount() {
  const count = $$("#user-whatsapp-line-list input:checked").length;
  const label = $("#user-whatsapp-line-count");
  if (label) label.textContent = `${count} seleccionada${count === 1 ? "" : "s"}`;
}

function renderUserWhatsappLineAssignments(selectedIds = []) {
  ensureUserWhatsappAssignment();
  const selected = new Set(selectedIds || []);
  const lines = (appState.whatsappLines || []).filter((line) => line.active !== false);
  const list = $("#user-whatsapp-line-list");
  if (!list) return;
  list.innerHTML = lines.length ? lines.map((line) => `<label class="line-user-row"><input type="checkbox" value="${escapeHtml(line.id)}" ${selected.has(line.id) ? "checked" : ""}><span><b>${escapeHtml(line.name)}</b><small>${escapeHtml(line.phone || line.connection?.account || "Número pendiente")} · ${escapeHtml(line.routingBranchName || line.branchName || "Ingreso general")}</small></span></label>`).join("") : `<div class="column-empty">Todavía no hay líneas de WhatsApp activas.</div>`;
  updateUserWhatsappLineCount();
}

function openUserDialog(user = null) {
  $("#user-form").reset();
  setUserFormError("");
  $("#user-id").value = user?.id || "";
  $("#user-name").value = user?.name || "";
  $("#user-username").value = user?.username || "";
  $("#user-username").disabled = Boolean(user);
  $("#user-role").value = user?.role || "agent";
  const branches = (appState.branches || []).filter((branch) => branch.active !== false);
  $("#user-branch").innerHTML = `<option value="">Administración general</option>` + branches.map((branch) => `<option value="${escapeHtml(branch.id)}">${escapeHtml(branch.name)}${branch.city ? ` · ${escapeHtml(branch.city)}` : ""}</option>`).join("");
  $("#user-branch").value = user?.branchId || (user?.role === "admin" ? "" : branches[0]?.id || "");
  renderUserWhatsappLineAssignments(user?.whatsappLineIds || []);
  $("#user-client-limit").value = user?.clientDailyLimit ?? 30;
  const adminRole = (user?.role || "agent") === "admin";
  $("#user-branch-reports").checked = adminRole || user?.role === "manager" || user?.permissions?.branchReports === true;
  $("#user-team-reports").checked = adminRole || user?.role === "manager" || user?.permissions?.teamReports === true;
  $("#user-global-reports").checked = adminRole || user?.permissions?.globalReports === true;
  $("#user-audit-reports").checked = adminRole || user?.permissions?.auditReports === true;
  $("#user-campaign-view").checked = adminRole || user?.role === "manager" || user?.permissions?.campaignView === true;
  $("#user-campaign-manage").checked = adminRole || user?.role === "manager" || user?.permissions?.campaignManage === true;
  $("#user-custom-fields-manage").checked = adminRole || user?.permissions?.customFieldsManage === true;
  $("#user-news-publish").checked = adminRole || ["manager","supervisor"].includes(user?.role) || user?.permissions?.newsPublish === true;
  for (const id of ["#user-branch-reports", "#user-team-reports", "#user-global-reports", "#user-audit-reports", "#user-campaign-view", "#user-campaign-manage", "#user-custom-fields-manage", "#user-news-publish"]) $(id).disabled = adminRole;
  $("#user-active").checked = user?.active !== false;
  $("#user-active-row").hidden = !user;
  $("#user-password").required = !user;
  $("#user-password-note").textContent = user ? "(dejar vacío para mantenerla)" : "*";
  $("#user-dialog-title").textContent = user ? "Editar usuario" : "Nuevo usuario";
  $("#user-dialog").showModal();
}

function renderReasons(force = false) {
  const list = $("#reason-list");
  if (!force && document.activeElement?.closest("#reason-list")) return;
  list.innerHTML = (appState.settings.lossReasons || []).map((reason) => `<div class="reason-row" data-reason-id="${escapeHtml(reason.id)}"><input maxlength="120" value="${escapeHtml(reason.name)}" aria-label="Motivo de pérdida" /><button type="button" data-reason-action="save" title="Guardar">✓</button><button class="delete" type="button" data-reason-action="delete" title="Eliminar">×</button></div>`).join("");
}

function attachmentMarkup(attachment) {
  if (!attachment) return "";
  const name = escapeHtml(attachment.fileName || "Archivo");
  if (!attachment.available || !attachment.url) {
    return `<div class="attachment unavailable"><span>□</span><div><strong>${name}</strong><small>No se pudo guardar este archivo</small></div></div>`;
  }
  const url = escapeHtml(attachment.url);
  if (attachment.kind === "image") {
    return `<a class="media-preview" href="${url}" target="_blank" rel="noreferrer"><img src="${url}" alt="${name}" loading="lazy" /></a>`;
  }
  if (attachment.kind === "video") {
    return `<video class="media-preview" controls preload="metadata" src="${url}"></video>`;
  }
  if (attachment.kind === "audio") {
    return `<audio class="audio-preview" controls preload="metadata" src="${url}"></audio>`;
  }
  return `<a class="attachment" href="${url}" download="${name}"><span>⇩</span><div><strong>${name}</strong><small>${escapeHtml(formatBytes(attachment.size))}</small></div></a>`;
}

function barReport(entries, empty = "Sin datos en este período") {
  if (!entries?.length || !entries.some((entry) => Number(entry.value))) {
    return `<div class="column-empty">${escapeHtml(empty)}</div>`;
  }
  const max = Math.max(1, ...entries.map((entry) => Number(entry.value) || 0));
  return entries.map((entry) => `<div class="bar-row"><div><span>${escapeHtml(entry.label)}</span><b>${Number(entry.value || 0)}</b></div><progress max="${max}" value="${Number(entry.value || 0)}"></progress></div>`).join("");
}

function renderDailyChart(entries = []) {
  if (!entries.length || !entries.some((entry) => entry.contacts || entry.incoming || entry.won)) {
    $("#daily-chart").innerHTML = `<div class="column-empty">La evolución aparecerá cuando ingresen conversaciones</div>`;
    return;
  }
  const width = Math.max(640, entries.length * 30);
  const height = 190;
  const baseline = 154;
  const group = width / entries.length;
  const maximum = Math.max(1, ...entries.flatMap((entry) => [entry.contacts, entry.incoming, entry.won]));
  const labelEvery = entries.length > 14 ? 5 : 1;
  const bars = entries.map((entry, index) => {
    const x = index * group + group * 0.16;
    const barWidth = Math.max(2, group * 0.2);
    const values = [entry.contacts, entry.incoming, entry.won];
    const rects = values.map((value, position) => {
      const barHeight = Math.max(0, (Number(value) / maximum) * 126);
      return `<rect class="chart-${["contacts", "incoming", "wins"][position]}" x="${(x + position * barWidth).toFixed(2)}" y="${(baseline - barHeight).toFixed(2)}" width="${Math.max(2, barWidth - 1).toFixed(2)}" height="${barHeight.toFixed(2)}"><title>${escapeHtml(entry.label)}: ${Number(value)}</title></rect>`;
    }).join("");
    const label = index % labelEvery === 0 || index === entries.length - 1
      ? `<text x="${(index * group + group / 2).toFixed(2)}" y="178" text-anchor="middle">${escapeHtml(entry.label)}</text>`
      : "";
    return rects + label;
  }).join("");
  $("#daily-chart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución diaria"><line x1="0" y1="${baseline}" x2="${width}" y2="${baseline}"></line>${bars}</svg>`;
}

function renderMiniBars(entries = [], labelKey = "label") {
  if (!entries.length || !entries.some((entry) => Number(entry.value))) return `<div class="column-empty">Sin actividad suficiente</div>`;
  const max = Math.max(1, ...entries.map((entry) => Number(entry.value || 0)));
  return `<div class="mini-bars">${entries.map((entry) => {
    const height = Math.max(5, Math.round((Number(entry.value || 0) / max) * 100));
    return `<div class="mini-bar-item" title="${escapeHtml(entry[labelKey])}: ${Number(entry.value || 0)}"><b style="height:${height}%"></b><small>${escapeHtml(entry[labelKey])}</small><span>${Number(entry.value || 0)}</span></div>`;
  }).join("")}</div>`;
}

function renderReports() {
  const report = appState?.reports;
  if (!report) return;
  const user = appState.currentUser || {};
  const permissions = report.permissions || user.permissions || {};
  const isAgent = user.role === "agent";
  const isManager = user.role === "manager";
  const isAdmin = user.role === "admin";

  $("#report-audience-kicker").textContent = isAdmin ? "VISIÓN EJECUTIVA" : isManager ? "GESTIÓN DE EQUIPO" : "MI RENDIMIENTO";
  $("#report-audience-title").textContent = isAdmin ? "Centro de inteligencia comercial" : isManager ? `Reportes · ${user.branchName || "Sucursal"}` : `Mi panel · ${user.name || "Agente"}`;
  $("#report-audience-copy").textContent = isAdmin
    ? "Compará sucursales, equipos, ventas, atención, riesgos y auditoría desde una sola base central."
    : isManager
      ? "Controlá carga de trabajo, atención, conversión y oportunidades de tu equipo según tus permisos."
      : "Tus resultados, tiempos de respuesta, oportunidades abiertas y clientes que requieren seguimiento.";

  const branchBox = $("#report-branch-filter-box");
  if (branchBox) branchBox.hidden = !permissions.global;
  if (permissions.global && $("#report-branch")) {
    const branches = report.branches || [];
    const current = reportBranchId || "all";
    $("#report-branch").innerHTML = `<option value="all">Todas las sucursales</option>` + branches.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}${entry.city ? ` · ${escapeHtml(entry.city)}` : ""}</option>`).join("");
    $("#report-branch").value = branches.some((entry) => entry.id === current) ? current : "all";
    if ($("#report-branch").value === "all" && current !== "all") reportBranchId = "all";
  }

  const canFilterUser = permissions.team === true;
  $("#report-user-filter-box").hidden = !canFilterUser;
  if (canFilterUser && $("#report-user")) {
    const selectedBranch = reportBranchId !== "all" ? reportBranchId : null;
    const sourceUsers = (appState.users || []).filter((entry) => entry.active !== false && entry.role !== "admin" && (!selectedBranch || entry.branchId === selectedBranch));
    const current = reportUserId || "all";
    $("#report-user").innerHTML = `<option value="all">Todo el equipo</option>` + sourceUsers.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}${permissions.global && entry.branchName ? ` · ${escapeHtml(entry.branchName)}` : ""}</option>`).join("");
    $("#report-user").value = sourceUsers.some((entry) => entry.id === current) ? current : "all";
    if ($("#report-user").value === "all" && current !== "all") reportUserId = "all";
  }

  const summary = report.summary || {};
  $("#report-new-clients").textContent = Number(summary.newClients || 0).toLocaleString("es-PY");
  $("#report-conversion").textContent = `${Number(summary.conversionRate || 0).toLocaleString("es-PY")}%`;
  $("#report-sales").textContent = money.format(Number(summary.salesValue || 0));
  $("#report-first-response").textContent = compactDuration(summary.averageFirstResponseMinutes);
  $("#report-open").textContent = Number(summary.open || 0).toLocaleString("es-PY");
  $("#report-sla-rate").textContent = `${Number(summary.sla15Rate || 0).toLocaleString("es-PY")}%`;
  $("#report-close-time").textContent = Number(summary.averageCloseHours || 0) < 24 ? `${Number(summary.averageCloseHours || 0).toLocaleString("es-PY")} h` : `${(Number(summary.averageCloseHours || 0) / 24).toFixed(1)} d`;
  $("#report-returning").textContent = `${Number(summary.returningRate || 0).toLocaleString("es-PY")}%`;
  $("#report-generated").textContent = `Actualizado ${relativeTime(report.generatedAt)}`;
  if ($("#report-campaign-response")) $("#report-campaign-response").textContent = `${Number(summary.campaignResponseRate || 0).toLocaleString("es-PY")}%`;
  if ($("#report-available-agents")) $("#report-available-agents").textContent = Number(summary.availableAgents || 0).toLocaleString("es-PY");
  if ($("#campaign-report-panel")) $("#campaign-report-panel").hidden = !(permissions.campaigns === true || user.permissions?.campaignView === true || isAdmin || isManager);
  if ($("#campaign-report-body")) {
    const rows = report.campaignPerformance?.campaigns || [];
    $("#campaign-report-body").innerHTML = rows.length ? rows.map((entry) => `<tr><td><strong>${escapeHtml(entry.name || "Campaña")}</strong><small>${escapeHtml(entry.branchName || "")}</small></td><td>${escapeHtml(campaignStatusLabel(entry.status))}</td><td>${Number(entry.sent || 0)}</td><td>${Number(entry.replied || 0)}</td><td><b>${Number(entry.responseRate || 0).toLocaleString("es-PY")}%</b></td><td>${Number(entry.converted || 0)}</td><td>${Number(entry.conversionRate || 0).toLocaleString("es-PY")}%</td></tr>`).join("") : `<tr><td colspan="7"><div class="column-empty">Todavía no hay campañas en este período</div></td></tr>`;
  }
  if ($("#attendance-report")) {
    const att = report.attendance || {};
    $("#attendance-report").innerHTML = `<div><small>Disponibles</small><strong>${Number(att.active || 0)}</strong></div><div><small>En pausa</small><strong>${Number(att.paused || 0)}</strong></div><div><small>Ausentes</small><strong>${Number(att.away || 0)}</strong></div><div><small>Fuera de línea</small><strong>${Number(att.offline || 0)}</strong></div><div class="wide"><small>Clientes con cobertura temporal</small><strong>${Number(att.coverageRequired || 0)}</strong></div>`;
  }

  const globalPanel = $("#branch-comparison-panel");
  if (globalPanel) globalPanel.hidden = !(permissions.global && !report.scopeBranchId && reportUserId === "all");
  if (!globalPanel?.hidden && $("#branch-comparison-body")) {
    const rows = report.branchSummaries || [];
    $("#branch-comparison-body").innerHTML = rows.length ? rows.map((entry) => `<tr><td><strong>${escapeHtml(entry.name || entry.code)}</strong><small>${escapeHtml(entry.city || entry.code || "")}</small></td><td>${Number(entry.newClients || 0)}</td><td>${Number(entry.open || 0)}</td><td>${Number(entry.waiting || 0)}</td><td><b>${Number(entry.won || 0)}</b></td><td>${Number(entry.conversionRate || 0).toLocaleString("es-PY")}%</td><td>${escapeHtml(compactDuration(entry.averageFirstResponseMinutes || 0))}</td><td><b>${money.format(Number(entry.salesValue || 0))}</b></td></tr>`).join("") : `<tr><td colspan="8"><div class="column-empty">Sin datos suficientes para comparar sucursales</div></td></tr>`;
  }

  const teamPanel = $("#agent-performance-panel");
  if (teamPanel) teamPanel.hidden = !permissions.team;
  if (permissions.team && $("#agent-performance-body")) {
    const rows = report.agentPerformance || [];
    $("#agent-performance-body").innerHTML = rows.length ? rows.map((entry, index) => `<tr><td><div class="rank-user"><span>${index + 1}</span><div><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(roleLabel(entry.role))}</small></div></div></td><td>${Number(entry.assigned || 0)}</td><td>${Number(entry.open || 0)}</td><td>${Number(entry.waiting || 0)}</td><td><b>${Number(entry.won || 0)}</b></td><td>${Number(entry.conversionRate || 0).toLocaleString("es-PY")}%</td><td>${escapeHtml(compactDuration(entry.averageFirstResponseMinutes || 0))}</td><td><b>${money.format(Number(entry.salesValue || 0))}</b></td></tr>`).join("") : `<tr><td colspan="8"><div class="column-empty">Todavía no hay actividad del equipo en este período</div></td></tr>`;
  }

  const funnelLabels = { new: "Nuevos", contacted: "Contactados", waiting: "Esperan respuesta", won: "Ganados", lost: "Perdidos" };
  $("#funnel-list").innerHTML = barReport((report.funnel || []).map((entry) => ({ label: funnelLabels[entry.stage] || entry.stage, value: entry.value })));
  $("#sla-chart").innerHTML = barReport(report.responseBuckets || []);
  $("#aging-chart").innerHTML = barReport(report.agingBuckets || []);
  $("#loss-chart").innerHTML = barReport(report.lossReasons || [], "No hubo cierres perdidos");
  $("#weekday-demand").innerHTML = barReport(report.weekdayDemand || [], "Sin mensajes entrantes");
  $("#hourly-demand").innerHTML = renderMiniBars((report.hourlyDemand || []).filter((entry) => Number(entry.value) > 0 || (entry.hour >= 7 && entry.hour <= 20)));
  renderDailyChart(report.daily || []);

  $("#products-report").innerHTML = report.topProducts?.length ? report.topProducts.map((product, index) => `<div class="ranking-row"><span>${index + 1}</span><div><strong>${escapeHtml(product.label)}</strong><small>${Number(product.units)} unidad${Number(product.units) === 1 ? "" : "es"}</small></div><b>${money.format(Number(product.value || 0))}</b></div>`).join("") : `<div class="column-empty">Todavía no hay productos vendidos</div>`;
  $("#top-clients-report").innerHTML = report.topClients?.length ? report.topClients.map((client, index) => `<div class="ranking-row"><span>${index + 1}</span><div><strong>${escapeHtml(client.name)}</strong><small>${Number(client.purchases || 0)} compra${Number(client.purchases || 0) === 1 ? "" : "s"}${client.phone ? ` · ${escapeHtml(client.phone)}` : ""}</small></div><b>${money.format(Number(client.value || 0))}</b></div>`).join("") : `<div class="column-empty">Sin ventas suficientes para identificar clientes destacados</div>`;

  const communications = report.communications || {};
  const communicationItems = [["Mensajes", communications.total], ["Del cliente", communications.incoming], ["Del asesor", communications.human], ["Automáticos", communications.bot], ["Archivos", communications.attachments]];
  $("#communications-report").innerHTML = communicationItems.map(([label, value]) => `<div><strong>${Number(value || 0)}</strong><span>${escapeHtml(label)}</span></div>`).join("") + `<div class="media-breakdown">${(communications.mediaKinds || []).map((entry) => `<span>${escapeHtml(entry.label)} <b>${Number(entry.value || 0)}</b></span>`).join("")}</div>`;

  const calls = report.calls || {};
  $("#calls-summary").innerHTML = `<div><strong>${Number(calls.incoming || 0)}</strong><span>Entrantes</span></div><div><strong>${Number(calls.missed || 0)}</strong><span>Perdidas</span></div>`;
  const statusLabels = { offer: "Entrante", timeout: "Perdida", accept: "Atendida", reject: "Rechazada", terminate: "Finalizada", failed: "Fallida" };
  $("#calls-list").innerHTML = calls.recent?.length ? calls.recent.map((call) => `<div class="call-row"><span>${call.isVideo ? "▣" : "☎"}</span><div><strong>${escapeHtml(call.name || call.phone)}</strong><small>${escapeHtml(statusLabels[call.status] || call.status)} · ${escapeHtml(formatDate(call.startedAt || call.updatedAt))}</small></div></div>`).join("") : `<div class="column-empty">Sin eventos de llamada registrados</div>`;

  $("#waiting-risk").innerHTML = report.waitingRisk?.length ? report.waitingRisk.map((entry, index) => `<button class="risk-row" type="button" data-risk-deal="${escapeHtml(entry.id)}"><span>${index + 1}</span><div><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.ownerName || "Sin responsable")} · ${escapeHtml(entry.phone || "")}</small></div><b>${escapeHtml(compactDuration(entry.minutes))}</b></button>`).join("") : `<div class="column-empty">No hay clientes esperando respuesta</div>`;
  $("#inactivity-risk").innerHTML = report.inactivityRisk?.length ? report.inactivityRisk.map((entry, index) => `<button class="risk-row" type="button" data-risk-deal="${escapeHtml(entry.id)}"><span>${index + 1}</span><div><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.ownerName || "Sin responsable")} · ${escapeHtml(stageLabels[entry.stage] || entry.stage)}</small></div><b>${Number(entry.hours || 0).toLocaleString("es-PY")} h</b></button>`).join("") : `<div class="column-empty">No hay negociaciones con inactividad relevante</div>`;

  $("#stock-alert-report").hidden = !permissions.team;
  $("#operational-health-panel").hidden = !permissions.team;
  if (permissions.team) {
    $("#low-stock-report").innerHTML = report.lowStock?.length ? report.lowStock.map((entry) => `<div class="risk-row static"><span>!</span><div><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.sku || "Sin código")}</small></div><b>${Number(entry.available)} / mín. ${Number(entry.minStock)}</b></div>`).join("") : `<div class="column-empty">No hay productos bajo mínimo</div>`;
    $("#operational-health").innerHTML = `<div><small>Sin responsable</small><strong>${Number(summary.unassigned || 0)}</strong></div><div><small>Nuevas sin tocar</small><strong>${Number(summary.untouched || 0)}</strong></div><div><small>En espera</small><strong>${Number(summary.waiting || 0)}</strong></div><div><small>Derivaciones</small><strong>${Number(summary.transfers || 0)}</strong></div><div class="wide"><small>Pipeline reservado</small><strong>${money.format(Number(summary.pipelineValue || 0))}</strong></div>`;
  }

  const auditPanel = $("#report-audit-panel");
  if (auditPanel) auditPanel.hidden = !permissions.audit;
  if (permissions.audit && $("#report-audit-body")) {
    const events = report.auditEvents || [];
    $("#report-audit-count").textContent = `${events.length.toLocaleString("es-PY")} movimiento${events.length === 1 ? "" : "s"}`;
    $("#report-audit-body").innerHTML = events.length ? events.map((event) => {
      const ref = event.details?.clientName || event.details?.clientPhone || event.details?.dealId || event.details?.clientId || "—";
      return `<tr><td>${escapeHtml(formatDate(event.at))}</td><td><strong>${escapeHtml(event.branchName || event.branchCode || "Sucursal")}</strong></td><td>${escapeHtml(event.userName || "Sistema")}<small>${event.username ? `@${escapeHtml(event.username)}` : escapeHtml(event.actorType || "")}</small></td><td>${escapeHtml(auditActionLabel(event.action))}</td><td>${escapeHtml(String(ref))}</td></tr>`;
    }).join("") : `<tr><td colspan="5"><div class="column-empty">No hay movimientos auditados en este período</div></td></tr>`;
  }
}

function renderCallAlert() {
  const alert = $("#call-alert");
  const currentUser = appState?.currentUser || {};
  const call = (appState.calls || []).find((entry) => {
    if (entry.provider === "pbx" || entry.direction !== "incoming" || entry.status !== "offer") return false;
    const ageMs = Date.now() - new Date(entry.startedAt || entry.updatedAt).getTime();
    if (ageMs >= 10 * 60 * 1000) return false;
    if (entry.ownerUserId) return entry.ownerUserId === currentUser.id;
    return ["agent", "manager"].includes(currentUser.role);
  });
  if (!call || dismissedCallId === call.id) { alert.hidden = true; return; }
  $("#call-alert-icon").textContent = call.isVideo ? "▣" : "☎";
  $("#call-alert-title").textContent = `${call.isVideo ? "Videollamada" : "Llamada"} de ${call.name || call.phone}`;
  $("#call-alert-detail").textContent = call.ownerUserId === currentUser.id ? "Esta llamada fue dirigida a vos porque sos el responsable del cliente." : "Cliente sin responsable; la llamada está disponible para tu sucursal.";
  $("#call-alert-open").textContent = "Ver cliente";
  $("#call-alert-open").dataset.dealId = call.dealId || "";
  $("#call-alert-open").hidden = !call.dealId;
  alert.dataset.callId = call.id;
  alert.hidden = false;
}

async function fetchReports() {
  if (reportLoading || !authenticated) return;
  reportLoading = true;
  $("#refresh-report-button").disabled = true;
  try {
    const permissions = appState.currentUser?.permissions || {};
    const branchParam = permissions.global && reportBranchId !== "all" ? `&branchId=${encodeURIComponent(reportBranchId)}` : "";
    const userParam = permissions.team && reportUserId !== "all" ? `&userId=${encodeURIComponent(reportUserId)}` : "";
    const report = await api(`/api/reports?days=${encodeURIComponent(reportPeriod)}${branchParam}${userParam}`);
    appState.reports = report;
    renderReports();
  } catch (error) {
    showToast(error.message, "warning");
  } finally {
    reportLoading = false;
    $("#refresh-report-button").disabled = false;
  }
}

function mediaKind(file) {
  const type = String(file?.type || "").toLowerCase();
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "document";
}

function renderMediaComposer() {
  const form = $("#media-form");
  if (!pendingMedia) {
    form.hidden = true;
    return;
  }
  const icons = { image: "▧", video: "▣", audio: "♪", document: "□" };
  $("#media-pending-icon").textContent = icons[pendingMedia.kind] || "□";
  $("#media-pending-name").textContent = pendingMedia.file.name || "Archivo";
  $("#media-pending-size").textContent = `${formatBytes(pendingMedia.file.size)}${pendingMedia.voiceNote ? " · audio grabado" : ""}`;
  $("#media-caption").hidden = pendingMedia.kind === "audio" && pendingMedia.voiceNote;
  form.hidden = false;
}

function clearPendingMedia() {
  pendingMedia = null;
  $("#media-file").value = "";
  $("#media-caption").value = "";
  renderMediaComposer();
}

function renderDrawer() {
  const drawer = $("#deal-drawer");
  if (!selectedDealId) return;
  const deal = (appState.deals || []).find((entry) => entry.id === selectedDealId);
  if (!deal) {
    closeDrawer();
    return;
  }
  const open = ["new", "contacted", "waiting"].includes(deal.stage);
  const user = appState.currentUser || {};
  const owner = (appState.users || []).find((entry) => entry.id === deal.ownerUserId);
  const ownerAway = Boolean(deal.ownerUserId && ["away", "offline"].includes(owner?.attendance?.status || "offline"));
  const managerCoverage = ["manager", "supervisor"].includes(user.role) && user.branchId === deal.branchId && ownerAway;
  const temporaryCommunication = (appState.communicationRequests || []).find((request) => request.status === "approved" && request.mode === "temporary" && request.requestedByUserId === user.id && request.clientId === deal.clientId && request.branchId === deal.branchId && (!request.dealId || request.dealId === deal.id) && (!request.grantedUntil || Date.parse(request.grantedUntil) > Date.now()));
  const canManage = open && (!deal.ownerUserId || deal.ownerUserId === user.id || user.role === "admin" || managerCoverage);
  const canCommunicate = canManage || (open && Boolean(temporaryCommunication));
  const canWork = canManage;
  const coverage = $("#coverage-section");
  if (coverage) {
    coverage.hidden = !deal.coverageRequired && !temporaryCommunication;
    if (!coverage.hidden) $("#coverage-copy").textContent = temporaryCommunication ? `Comunicación autorizada temporalmente${temporaryCommunication.grantedUntil ? ` hasta ${new Date(temporaryCommunication.grantedUntil).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" })}` : ""}. ${deal.ownerName ? `El responsable principal sigue siendo ${deal.ownerName}.` : ""}` : `${deal.coverageReason || "El responsable está ausente."}${managerCoverage ? " Podés responder temporalmente sin cambiar el responsable." : ""}`;
  }
  $("#drawer-stage").textContent = stageLabels[deal.stage] || "NEGOCIACIÓN";
  $("#drawer-name").textContent = deal.name;
  $("#drawer-phone").textContent = deal.contactPersonName
    ? `Contacto: ${deal.contactPersonName}${deal.contactRole ? ` · ${deal.contactRole}` : ""} · ${deal.phone}`
    : deal.phone;
  const currentBranch = dealBranch(deal);
  const currentLine=(appState.whatsappLines||[]).find(line=>line.id===deal.lineId);
  $("#drawer-branch").textContent = `${currentBranch?.name || "Sucursal"}${currentLine ? ` · ${currentLine.name}` : ""}`;
  $("#drawer-owner").textContent = deal.ownerName || "Sin asignar";
  const activeUsers = (appState.users || []).filter((entry) => entry.active !== false && entry.branchId === deal.branchId && (["admin", "manager", "supervisor"].includes(user.role) || entry.id === user.id));
  $("#drawer-owner-select").innerHTML = activeUsers.map((entry) => `<option value="${escapeHtml(entry.id)}"${entry.id === (deal.ownerUserId || user.id) ? " selected" : ""}>${escapeHtml(entry.name)}${entry.online ? " · en línea" : ""}</option>`).join("");
  const canManageOwner = ["admin", "manager", "supervisor"].includes(user.role);
  $("#drawer-owner-select").hidden = !canManageOwner;
  $("#assign-owner-button").hidden = !canManageOwner;
  $("#assign-owner-button").textContent = deal.ownerUserId ? "Reasignar" : "Asignar responsable";
  const wait = $("#drawer-wait");
  if (deal.stage === "waiting") {
    wait.innerHTML = `<span class="wait-chip${["red", "critical"].includes(deal.heat?.level) ? " urgent" : ""}">${escapeHtml(elapsedLabel(deal.heat?.minutes))}</span>`;
  } else if (deal.stage === "lost") {
    wait.innerHTML = `<span class="wait-chip">${escapeHtml(deal.lossReasonName || "Cerrado")}</span>`;
  } else if (deal.stage === "transferred") {
    const destination = branchById(deal.transferredToBranchId);
    wait.innerHTML = `<span class="wait-chip">Derivado${destination?.name ? ` a ${escapeHtml(destination.name)}` : ""}</span>`;
  } else {
    wait.innerHTML = `<span class="wait-chip">${escapeHtml(relativeTime(deal.updatedAt))}</span>`;
  }
  const botToggle = $("#deal-bot-toggle");
  botToggle.disabled = !canWork;
  botToggle.setAttribute("aria-checked", String(Boolean(deal.botActive)));
  botToggle.classList.toggle("copilot-mode", deal.botHumanHandoff === true && !deal.botActive);
  $("span", botToggle).textContent = deal.botActive ? "Bot activo" : deal.botHumanHandoff ? "Copiloto" : "Bot pausado";
  botToggle.title = deal.botActive
    ? "El bot puede responder automáticamente. Al responder un agente pasará a Copiloto."
    : deal.botHumanHandoff
      ? "Intervención humana activa: la IA solo sugiere y nunca envía automáticamente. Hacé clic para reactivar el bot de forma explícita."
      : "Bot pausado manualmente.";
  $("#open-whatsapp-button").href = whatsappUrl(deal.phone);

  const messages = (deal.messages || []).slice(-80);
  $("#drawer-messages").innerHTML = messages.length
    ? messages.map((message) => `<div class="message ${message.direction === "outgoing" ? "outgoing" : message.direction === "system" ? "system" : ""}">${attachmentMarkup(message.attachment)}${message.text ? `<p>${escapeHtml(message.text)}</p>` : ""}<small>${message.origin === "human" ? escapeHtml(message.agentName || "Asesor") : message.origin === "bot" ? "Bot" : message.origin === "followup" ? "Seguimiento" : message.origin === "transfer" ? "Transferencia interna" : "Cliente"} · ${escapeHtml(formatDate(message.at))}${message.historical ? " · recuperado" : ""}</small></div>`).join("")
    : `<div class="column-empty">Sin mensajes guardados</div>`;

  $("#manual-message").disabled = !canCommunicate;
  $("#message-form button").disabled = !canCommunicate;
  $("#attach-button").disabled = !canCommunicate;
  $("#record-audio-button").disabled = !canCommunicate;
  $("#show-reserve-form").hidden = !canWork;
  $("#mark-lost-button").hidden = !canWork;
  $("#mark-won-button").hidden = !canWork;
  $("#transfer-conversation-button").hidden = !canWork;
  $("#transfer-conversation-button").disabled = !canWork;
  if (!open) $("#reserve-form").hidden = true;

  const products = (appState.products || []).filter((product) => product.active !== false && Number(product.available) > 0);
  $("#reserve-product").innerHTML = products.length
    ? products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)} · ${Number(product.available)} disp.</option>`).join("")
    : `<option value="">Sin stock disponible</option>`;
  $("#reserve-form button").disabled = !products.length;

  renderDealCustomFields(deal, canWork);
  renderDrawerQuickReplies(deal, canWork);
  renderCopilotSuggestion(deal, canWork);
  renderSmartDataSuggestions(deal, canWork);
  if ($("#agent-ai-toolbar")) {
    const ai=appState.aiFeatures||{}; const enabled=appState.settings?.aiSuite?.enabled!==false;
    $("#agent-ai-toolbar").hidden=!enabled;
    $$('[data-ai-rewrite]',$("#agent-ai-toolbar")).forEach(b=>b.hidden=ai.rewrite===false);
    if($("#open-ai-center-deal")) $("#open-ai-center-deal").hidden=(appState.modules?.aiCenter===false);
  }
  resizeMessageComposer();

  const items = deal.items || [];
  $("#reserved-list").innerHTML = items.length
    ? items.map((item) => `<div class="reserved-item"><span><strong>${escapeHtml(item.name)}</strong><small>${item.status === "reserved" ? "Reservado" : item.status === "sold" ? "Vendido" : "Devuelto"}</small></span><b>× ${Number(item.quantity || 0)}</b>${item.status === "reserved" && canWork ? `<button type="button" data-remove-item="${escapeHtml(item.id)}" title="Cliente ya no está interesado: devolver al stock">↩ Devolver</button>` : "<span></span>"}</div>`).join("")
    : `<div class="column-empty">No hay productos reservados</div>`;

  renderMediaComposer();

  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    const list = $("#drawer-messages");
    if (list) list.scrollTop = list.scrollHeight;
  });
}

function renderQuickReplies() {
  const list = $("#quick-replies-list");
  if (!list) return;
  const replies = (appState.quickReplies || []).slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const canManage = ["admin", "manager"].includes(appState.currentUser?.role);
  list.innerHTML = replies.length ? replies.map((reply) => `<div class="quick-reply-card ${reply.active === false ? "inactive" : ""}" data-reply-id="${escapeHtml(reply.id)}">
    <div><span class="reply-category">${escapeHtml(reply.category || "General")}</span><strong>${escapeHtml(reply.title)}</strong><small>${escapeHtml(reply.shortcut || "Sin atajo")}</small><p>${escapeHtml(reply.body)}</p></div>
    ${canManage ? `<div class="inline-actions"><button class="button ghost" type="button" data-reply-action="edit">Editar</button><button class="button danger-outline" type="button" data-reply-action="delete">Eliminar</button></div>` : ""}
  </div>`).join("") : `<div class="column-empty">No hay respuestas rápidas cargadas</div>`;
}

function openReplyDialog(reply = null) {
  $("#reply-form").reset();
  $("#reply-id").value = reply?.id || "";
  $("#reply-title").value = reply?.title || "";
  $("#reply-shortcut").value = reply?.shortcut || "";
  $("#reply-category").value = reply?.category || "General";
  $("#reply-body").value = reply?.body || "";
  $("#reply-active").checked = reply?.active !== false;
  $("#reply-dialog-title").textContent = reply ? "Editar respuesta" : "Nueva respuesta";
  $("#reply-dialog").showModal();
}

function quickReplyText(reply, deal) {
  return String(reply?.body || "")
    .replaceAll("{cliente}", deal?.name || "cliente")
    .replaceAll("{telefono}", deal?.phone || "")
    .replaceAll("{agente}", appState.currentUser?.name || "asesor");
}

function renderDrawerQuickReplies(deal, canWork) {
  const select = $("#drawer-quick-reply");
  const replies = (appState.quickReplies || []).filter((reply) => reply.active !== false);
  select.innerHTML = `<option value="">Respuesta rápida…</option>` + replies.map((reply) => `<option value="${escapeHtml(reply.id)}">${escapeHtml(reply.title)}${reply.shortcut ? ` · ${escapeHtml(reply.shortcut)}` : ""}</option>`).join("");
  select.disabled = !canWork || !replies.length;
  $("#insert-quick-reply").disabled = !canWork || !replies.length;
  $("#send-quick-reply").disabled = !canWork || !replies.length;
}


function latestIncomingMessage(deal) {
  return [...(deal?.messages || [])].reverse().find((message) => message.direction === "incoming") || null;
}

function copilotCacheKey(deal) {
  const message = latestIncomingMessage(deal);
  return `${deal?.id || ""}:${message?.id || message?.at || deal?.updatedAt || ""}`;
}

function clientAwaitingResponse(deal) {
  const last = [...(deal?.messages || [])].reverse().find((message) => ["incoming", "outgoing"].includes(message.direction));
  return last?.direction === "incoming";
}

function resizeMessageComposer() {
  const textarea = $("#manual-message");
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(150, Math.max(44, textarea.scrollHeight))}px`;
}

function renderCopilotSuggestion(deal, canWork) {
  const card = $("#copilot-card");
  if (!card) return;
  const enabled = appState?.settings?.copilot?.enabled !== false && appState?.settings?.aiSuite?.enabled !== false && appState?.aiFeatures?.copilotReply !== false;
  const incoming = latestIncomingMessage(deal);
  card.hidden = !enabled || !canWork || !incoming || !clientAwaitingResponse(deal);
  if (card.hidden) return;

  const key = copilotCacheKey(deal);
  const suggestion = copilotSuggestionCache.get(key) || null;
  const loading = copilotLoadingKey === key;
  $("#copilot-loading").hidden = !loading;
  $("#copilot-content").hidden = loading || !suggestion;
  $("#refresh-copilot").disabled = loading;

  if (!suggestion && !loading) {
    void fetchCopilotSuggestion(deal);
    return;
  }
  if (!suggestion) return;

  activeCopilotSuggestion = suggestion;
  $("#copilot-reply").textContent = suggestion.reply || "";
  $("#copilot-reason").textContent = suggestion.reason || "Sugerencia basada en el contexto disponible.";
  $("#copilot-source").textContent = suggestion.source === "ai"
    ? "Sugerencia privada con IA · nunca se envía sola"
    : "Sugerencia privada con datos del CRM · nunca se envía sola";
  const docs = suggestion.documents || [];
  $("#copilot-documents").innerHTML = docs.length
    ? `<div class="copilot-doc-label">Documentos que pueden ayudar</div>` + docs.map((document) => `
      <button class="copilot-document-card" type="button" data-copilot-doc="${escapeHtml(document.id)}">
        <span class="doc-icon">${document.editableTemplate ? "✎" : "▤"}</span>
        <span><strong>${escapeHtml(document.title)}</strong><small>${escapeHtml(document.editableTemplate ? "Plantilla personalizable" : "Documento listo para enviar")}</small></span>
        <b>Preparar →</b>
      </button>`).join("")
    : "";
  $("#send-copilot").disabled = !suggestion.reply;
  $("#edit-copilot").disabled = !suggestion.reply;
}

async function fetchCopilotSuggestion(deal, { force = false } = {}) {
  if (!deal?.id) return;
  const key = copilotCacheKey(deal);
  if (!force && copilotSuggestionCache.has(key)) {
    if (selectedDealId === deal.id) renderCopilotSuggestion(deal, true);
    return;
  }
  if (copilotLoadingKey === key) return;
  copilotLoadingKey = key;
  if (selectedDealId === deal.id) renderCopilotSuggestion(deal, true);
  try {
    const suggestion = await api(`/api/deals/${encodeURIComponent(deal.id)}/copilot-suggestion`, {
      method: "POST",
      body: JSON.stringify({ refresh: force }),
    });
    copilotSuggestionCache.set(key, suggestion);
    activeCopilotSuggestion = suggestion;
  } catch (error) {
    copilotSuggestionCache.set(key, {
      reply: "",
      reason: error.message || "No se pudo generar una sugerencia.",
      documents: [],
      source: "error",
    });
  } finally {
    if (copilotLoadingKey === key) copilotLoadingKey = "";
    const current = (appState?.deals || []).find((entry) => entry.id === deal.id);
    if (selectedDealId === deal.id && current) renderCopilotSuggestion(current, true);
  }
}


function smartDataCacheKey(deal) { const message=latestIncomingMessage(deal); return `${deal?.id||""}:${message?.id||message?.at||deal?.updatedAt||""}`; }
function smartDataValue(value) { return value===null||value===undefined||value===""?"—":String(value); }
function renderSmartDataSuggestions(deal,canWork){
  const card=$("#smart-data-card");if(!card)return;const cfg=appState?.settings?.smartCapture||{},incoming=latestIncomingMessage(deal);card.hidden=cfg.enabled===false||appState?.aiFeatures?.dataExtraction===false||!canWork||!incoming;if(card.hidden)return;
  const key=smartDataCacheKey(deal),cached=smartDataSuggestionCache.get(key),loading=smartDataLoadingKey===key;$("#refresh-smart-data").disabled=loading;const list=$("#smart-data-list");
  if(loading&&!cached){list.innerHTML=`<div class="smart-data-empty"><i></i><span>Buscando datos explícitos en el último mensaje…</span></div>`;return;}if(!cached){list.innerHTML=`<div class="smart-data-empty"><span>Analizando datos del cliente…</span></div>`;void fetchSmartDataSuggestions(deal);return;}
  const rows=cached.suggestions||cached||[];if(!rows.length){list.innerHTML=`<div class="smart-data-empty"><span>No se detectaron datos nuevos para completar.</span></div>`;return;}
  list.innerHTML=rows.map(item=>{const applied=item.status==="applied",conflict=item.conflict===true&&!applied,source=item.source==="ai"?"IA":item.source==="custom"?"Campo personalizado":"Detección local";return `<article class="smart-data-item ${applied?"applied":conflict?"conflict":""}" data-smart-suggestion="${escapeHtml(item.id)}"><div class="smart-data-mark">${applied?"✓":"✦"}</div><div class="smart-data-copy"><div><strong>${escapeHtml(item.fieldLabel||item.field)}</strong><span>${Math.round(Number(item.confidence||0))}% · ${escapeHtml(source)}</span></div><b>${escapeHtml(smartDataValue(item.value))}</b><small>“${escapeHtml(item.evidence||"Dato detectado en el mensaje")}”</small>${conflict?`<em>Ya existe: ${escapeHtml(smartDataValue(item.previousValue))}. Requiere revisión.</em>`:applied?`<em>${item.autoApplied?"Completado automáticamente":"Aprobado por el agente"}</em>`:""}</div><div class="smart-data-actions">${applied?`<span class="smart-data-applied">Aplicado</span>`:`<button class="button primary" data-smart-action="apply" type="button">${conflict?"Reemplazar":"Completar"}</button><button class="button ghost" data-smart-action="dismiss" type="button">Descartar</button>`}</div></article>`;}).join("");
}
async function fetchSmartDataSuggestions(deal,{force=false}={}){if(!deal?.id)return;const key=smartDataCacheKey(deal);if(!force&&smartDataSuggestionCache.has(key)){if(selectedDealId===deal.id)renderSmartDataSuggestions(deal,true);return;}if(smartDataLoadingKey===key)return;smartDataLoadingKey=key;if(selectedDealId===deal.id)renderSmartDataSuggestions(deal,true);try{const result=force?await api(`/api/deals/${encodeURIComponent(deal.id)}/data-suggestions/analyze`,{method:"POST",body:JSON.stringify({withAi:true})}):await api(`/api/deals/${encodeURIComponent(deal.id)}/data-suggestions`);smartDataSuggestionCache.set(key,result);}catch(error){smartDataSuggestionCache.set(key,{suggestions:[],error:error.message});}finally{if(smartDataLoadingKey===key)smartDataLoadingKey="";const current=(appState?.deals||[]).find(x=>x.id===deal.id);if(selectedDealId===deal.id&&current)renderSmartDataSuggestions(current,true);}}

function renderAssistantDocuments() {
  const list = $("#assistant-document-list");
  if (!list) return;
  const documents = appState?.assistantDocuments || [];
  const canManage = ["admin", "manager"].includes(appState?.currentUser?.role);
  $("#new-assistant-document-button").hidden = !canManage;
  if (!documents.length) {
    list.innerHTML = `<div class="document-empty"><span>✦</span><strong>Sumá conocimiento al Copiloto</strong><p>Cargá una cotización, catálogo, formulario o plantilla y explicá cuándo debe recomendarse.</p></div>`;
    return;
  }
  list.innerHTML = documents.map((document) => `
    <article class="assistant-document-card" data-assistant-document="${escapeHtml(document.id)}">
      <div class="assistant-doc-icon">${document.editableTemplate ? "✎" : "▤"}</div>
      <div class="assistant-doc-main">
        <div><strong>${escapeHtml(document.title)}</strong>${document.editableTemplate ? `<span class="template-chip">Personalizable</span>` : ""}</div>
        <small>${escapeHtml(document.fileName || "")} · ${formatBytes(document.size)}</small>
        <p>${escapeHtml(document.context || "Sin contexto cargado")}</p>
        ${(document.tags || []).length ? `<div class="doc-tags">${document.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="assistant-doc-actions">
        <a class="button ghost" href="${escapeHtml(document.downloadUrl || "#")}" download>Descargar</a>
        ${canManage ? `<button class="button ghost" type="button" data-document-action="edit">Editar contexto</button><button class="icon-button danger-icon" type="button" data-document-action="delete" title="Eliminar">×</button>` : ""}
      </div>
    </article>`).join("");
}

function openAssistantDocumentDialog(document = null) {
  $("#assistant-document-form").reset();
  $("#assistant-document-id").value = document?.id || "";
  $("#assistant-document-dialog-title").textContent = document ? "Editar documento" : "Cargar documento con contexto";
  $("#assistant-document-file-required").textContent = document ? "(sin reemplazar archivo)" : "*";
  $("#assistant-document-title").value = document?.title || "";
  $("#assistant-document-context").value = document?.context || "";
  $("#assistant-document-tags").value = (document?.tags || []).join(", ");
  $("#assistant-document-editable").checked = document?.editableTemplate === true || !document;
  $("#assistant-document-dialog").showModal();
}

function openPrepareDocumentDialog(document) {
  if (!document || !selectedDealId) return;
  activeDocumentForSend = document;
  const deal = (appState?.deals || []).find((entry) => entry.id === selectedDealId);
  const latest = latestIncomingMessage(deal);
  $("#prepare-document-id").value = document.id;
  $("#prepare-document-title").textContent = document.editableTemplate ? `Preparar ${document.title}` : `Enviar ${document.title}`;
  $("#prepare-document-copy").textContent = document.editableTemplate
    ? "El CRM completará la plantilla con la ficha del cliente, responsable, sucursal, pedido y solicitud."
    : "Este archivo se enviará sin modificar; podés personalizar el mensaje que lo acompaña.";
  $("#prepare-document-details").value = latest?.text || "";
  $("#prepare-document-caption").value = `Te comparto ${document.title}. Si necesitás algún ajuste, quedo atento.`;
  $("#document-merge-preview").innerHTML = document.editableTemplate
    ? `<span>✦</span><div><strong>Se completarán automáticamente</strong><small>Cliente · teléfono · empresa · dirección · responsable · sucursal · pedido · solicitud · fecha</small></div>`
    : `<span>▤</span><div><strong>Documento estático</strong><small>El archivo original no será modificado.</small></div>`;
  $("#prepare-document-dialog").showModal();
}

async function uploadAssistantDocument() {
  const id = $("#assistant-document-id").value;
  const title = $("#assistant-document-title").value.trim();
  const context = $("#assistant-document-context").value.trim();
  const tags = $("#assistant-document-tags").value.trim();
  const editableTemplate = $("#assistant-document-editable").checked;
  if (!context) throw new Error("Explicá cuándo debe utilizarse el documento.");

  if (id) {
    const next = await api(`/api/assistant/documents/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ title, context, tags, editableTemplate }),
    });
    setState(next);
    return;
  }

  const file = $("#assistant-document-file").files?.[0];
  if (!file) throw new Error("Seleccioná un documento.");
  if (file.size > 24 * 1024 * 1024) throw new Error("El documento supera el límite de 24 MB.");
  const query = new URLSearchParams({
    title: title || file.name.replace(/\.[^.]+$/, ""),
    context,
    tags,
    editable: editableTemplate ? "1" : "0",
  });
  const response = await fetch(`/api/assistant/documents?${query.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No se pudo cargar el documento.");
  setState(payload);
}


async function openClientProfile() {
  const deal = (appState.deals || []).find((entry) => entry.id === selectedDealId);
  if (!deal?.clientId) return showToast("Este cliente todavía no tiene ficha asociada.", "warning");
  try {
    const profile = await api(`/api/clients/${encodeURIComponent(deal.clientId)}/profile`);
    const client = profile.client;
    selectedClientProfileId = client.id;
    $("#client-profile-title").textContent = client.name || client.phone || "Cliente";
    $("#client-profile-id").textContent = `ID: ${client.id} · ${client.phone || ""}${deal.contactPersonName ? ` · Contacto actual: ${deal.contactPersonName}${deal.contactRole ? ` (${deal.contactRole})` : ""}` : ""} · Responsable: ${client.ownerName || "Sin asignar"}`;
    $("#profile-entity-type").value = client.entityType === "company" ? "company" : "person";
    $("#profile-branch-choice-mode").value = client.branchChoiceMode || "ask_when_multiple";
    $("#profile-name").value = client.name || "";
    $("#profile-document").value = client.document || "";
    $("#profile-ruc").value = client.ruc || "";
    $("#profile-marketing-optin").checked = client.marketingOptIn === true;
    $("#profile-company").value = client.company || "";
    $("#profile-email").value = client.email || "";
    $("#profile-city").value = client.city || "";
    $("#profile-address").value = client.address || "";
    if ($("#profile-age")) $("#profile-age").value = client.age || "";
    if ($("#profile-birth-date")) $("#profile-birth-date").value = client.birthDate || "";
    if ($("#profile-job-title")) $("#profile-job-title").value = client.jobTitle || "";
    if ($("#profile-country")) $("#profile-country").value = client.country || "";
    if ($("#profile-neighborhood")) $("#profile-neighborhood").value = client.neighborhood || "";
    $("#profile-tags").value = (client.tags || []).join(", ");
    $("#profile-notes").value = client.notes || "";
    renderDynamicCustomFields($("#profile-custom-fields"), "contact", client.customFields || {}, true);
    const negotiations = profile.negotiations || [];
    $("#client-history-count").textContent = `${negotiations.length} negociación${negotiations.length === 1 ? "" : "es"}`;
    $("#client-history-list").innerHTML = negotiations.length ? negotiations.map((entry) => {
      const total = (entry.items || []).filter((item) => item.status === "sold").reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
      return `<button type="button" class="client-history-row" data-history-deal="${escapeHtml(entry.id)}"><span class="stage-chip ${escapeHtml(entry.stage)}">${escapeHtml(stageLabels[entry.stage] || entry.stage)}</span><div><strong>${escapeHtml(formatDate(entry.createdAt))}</strong><small>${escapeHtml(dealBranch(entry)?.name || "Sucursal")} · ${escapeHtml(entry.lastMessage || "Sin mensajes")}</small></div><b>${total ? money.format(total) : ""}</b></button>`;
    }).join("") : `<div class="column-empty">Sin negociaciones anteriores</div>`;
    const globalHistory = profile.globalHistory || { found: false, negotiations: [], branches: [] };
    $("#global-client-history").hidden = false;
    $("#global-client-history-count").textContent = globalHistory.found ? `${Number(globalHistory.negotiations?.length || 0)} movimientos` : "Sin coincidencias";
    const lastSale = globalHistory.lastSale;
    const lastContact = globalHistory.lastContact;
    $("#global-client-summary").innerHTML = globalHistory.found ? `<div><small>Cliente identificado como</small><strong>${escapeHtml(globalHistory.name || client.name || client.phone)}</strong></div><div><small>Última venta</small><strong>${lastSale ? `${escapeHtml(lastSale.ownerName || "Sin responsable")} · ${escapeHtml(lastSale.branchName || "Sucursal")}` : "Sin ventas previas"}</strong>${lastSale?.at ? `<small>${escapeHtml(formatDate(lastSale.at))} · ${money.format(Number(lastSale.value || 0))}</small>` : ""}</div><div><small>Último contacto</small><strong>${lastContact ? `${escapeHtml(lastContact.ownerName || "Sin responsable")} · ${escapeHtml(lastContact.branchName || "Sucursal")}` : "Sin contacto previo"}</strong>${lastContact?.at ? `<small>${escapeHtml(formatDate(lastContact.at))}</small>` : ""}</div>` : `<div class="column-empty">Este número todavía no tiene historial en otras sucursales del servidor central</div>`;
    window.v212RenderClientIdentity?.(profile);
    $("#global-client-history-list").innerHTML = globalHistory.negotiations?.length ? globalHistory.negotiations.slice(0, 80).map((entry) => {
      const total = (entry.items || []).filter((item) => item.status === "sold").reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
      return `<div class="client-history-row global-row"><span class="stage-chip ${escapeHtml(entry.stage)}">${escapeHtml(stageLabels[entry.stage] || entry.stage)}</span><div><strong>${escapeHtml(entry.branchName || "Sucursal")} · ${escapeHtml(entry.ownerName || "Sin responsable")}</strong><small>${escapeHtml(formatDate(entry.createdAt || entry.updatedAt))} · ${escapeHtml(entry.lastMessage || "Sin mensaje")}</small></div><b>${total ? money.format(total) : ""}</b></div>`;
    }).join("") : "";
    $("#client-profile-dialog").showModal();
  } catch (error) { showToast(error.message, "warning"); }
}


const moduleLabels={crm:["Negociaciones","Pipeline y conversaciones"],whatsapp:["WhatsApp y bot","Conexión de líneas y bot"],branches:["Sucursales","Red central multi-sucursal"],organization:["Estructura","Organigrama, sectores y jerarquías"],attendance:["Marcación","Disponibilidad y cobertura"],stock:["Stock","Inventario y reservas"],replies:["Respuestas rápidas","Biblioteca de mensajes"],documents:["Documentos inteligentes","Plantillas y archivos"],campaigns:["Campañas","Segmentación y efectividad"],news:["Noticias","Comunicación interna"],reports:["Reportes","Dashboards por permisos"],data:["Datos y respaldos","Importar, exportar y backup"],aiCenter:["Centro IA","Copiloto y análisis 360°"],productivity:["Productividad","Tareas, alertas, metas y aprobaciones"],tasks:["Tareas y compromisos","Seguimientos con vencimiento"],approvals:["Aprobaciones","Solicitudes controladas"],objectives:["Objetivos","Metas por equipo/agente"],alerts:["Alertas inteligentes","Riesgos operativos"],customFields:["Campos personalizados","Datos configurables con contexto"],botAutomation:["Automatizaciones BOT","Reglas y tratamientos"],customer360:["Ficha 360°","Historial integral del cliente"],audit:["Auditoría","Trazabilidad de movimientos"],globalSearch:["Búsqueda global","Acceso rápido a información"],quality:["Calidad","Evaluación de atención"],knowledge:["Base de conocimiento","Contexto documental"],forecasting:["Forecast","Proyección comercial"],goals:["Metas y ranking","Desempeño visible"]};
const aiFeatureLabels={copilotReply:["Sugerencia de respuesta","Respuesta lista para revisar"],nextBestAction:["Siguiente mejor acción","Qué debería hacer el agente"],customerSummary:["Resumen 360°","Síntesis instantánea del cliente"],dataExtraction:["Extracción de datos","Nombre, RUC, CI y campos"],askCrm:["Preguntarle al CRM","Consultas naturales sobre datos"],rewrite:["Mejorar redacción","Profesional, breve, comercial, técnico"],translation:["Traducción","Asistencia multidioma"],sentiment:["Sentimiento","Detectar satisfacción o molestia"],urgency:["Urgencia","Priorizar mensajes sensibles"],missingData:["Datos faltantes","Detectar información necesaria"],objectionCoach:["Coach de objeciones","Ayuda ante precio y dudas"],crossSell:["Venta cruzada","Oportunidades relevantes"],closeProbability:["Probabilidad de cierre","Estimación comercial explicable"],commitments:["Compromisos","Detectar promesas y seguimientos"],qualityScoring:["Calidad IA","Puntuación y coaching"],riskDetection:["Riesgos","Abandono, demora o pérdida"],knowledgeAssistant:["Conocimiento empresarial","Consultar políticas y documentos"],documentGenerator:["Documentos IA","Preparar plantillas personalizadas"],salesCoach:["Coach del agente","Recomendaciones privadas"],autoTags:["Etiquetado automático","Clasificación interna"],conversationSummary:["Resumen de conversación","No releer decenas de mensajes"],managementBrief:["Brief gerencial","Resumen ejecutivo con IA"],duplicateDetection:["Duplicados","Detectar fichas posiblemente repetidas"],smartAssignment:["Asignación inteligente","Balance y especialización"],churnRisk:["Riesgo de abandono","Clientes que dejaron de comprar"],forecasting:["Forecast IA","Proyección de ventas"]};
function renderModuleVisibility(){const modules=appState?.modules||appState?.settings?.modules||{};$$('[data-module]').forEach(el=>{const key=el.dataset.module;el.hidden=modules[key]===false;});const organizationNav=$('.nav-item[data-view="organization"]');if(organizationNav)organizationNav.hidden=modules.organization===false||!["admin","manager","supervisor"].includes(appState?.currentUser?.role);$$('[data-module-block]').forEach(el=>{el.hidden=modules[el.dataset.moduleBlock]===false;});if(modules[currentView]===false || (currentView==='organization'&&organizationNav?.hidden)||(currentView==='ai'&&modules.aiCenter===false)||(currentView==='productivity'&&modules.productivity===false)||(currentView==='advanced'&&modules.advancedSuite===false)){switchView('crm');}}
function renderPlatformConfig(){const panel=$('#platform-config-panel');if(!panel)return;const admin=appState?.currentUser?.role==='admin';panel.hidden=!admin;if(!admin)return;const modules=appState.modules||appState.settings?.modules||{};const ai=appState.aiFeatures||appState.settings?.aiFeatures||{};$('#module-toggle-grid').innerHTML=Object.entries(moduleLabels).map(([key,[label,copy]])=>`<label class="module-toggle-card"><span><b>${escapeHtml(label)}</b><small>${escapeHtml(copy)}</small></span><input type="checkbox" data-module-toggle="${escapeHtml(key)}" ${modules[key]!==false?'checked':''} ${key==='settings'?'disabled':''}/><i></i></label>`).join('');$('#ai-feature-toggle-grid').innerHTML=Object.entries(aiFeatureLabels).map(([key,[label,copy]])=>`<label class="module-toggle-card ai"><span><b>${escapeHtml(label)}</b><small>${escapeHtml(copy)}</small></span><input type="checkbox" data-ai-toggle="${escapeHtml(key)}" ${ai[key]!==false?'checked':''}/><i></i></label>`).join('');const suite=appState.settings?.aiSuite||{};$('#ai-suite-enabled').value=String(suite.enabled!==false);$('#ai-proactive').value=String(suite.proactive!==false);$('#ai-confidence').value=Number(suite.confidenceThreshold||70);$('#ai-context-messages').value=Number(suite.maxContextMessages||20);$('#ai-auto-fields').checked=suite.allowAutoFieldUpdates!==false;$('#ai-auto-tags').checked=suite.allowAutoTags===true;$('#ai-human-approval').checked=suite.requireHumanApprovalForExternalActions!==false;}
function renderAiCenter(){if(!appState)return;const deals=(appState.deals||[]).filter(d=>['new','contacted','waiting'].includes(d.stage));const select=$('#ai-deal-select');if(select){const previous=select.value||selectedDealId||deals[0]?.id||'';select.innerHTML=deals.length?deals.map(d=>`<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} · ${escapeHtml(stageLabels[d.stage]||d.stage)} · ${escapeHtml(d.ownerName||'Sin responsable')}</option>`).join(''):'<option value="">Sin negociaciones abiertas</option>';if(deals.some(d=>d.id===previous))select.value=previous;}const enabled=appState.settings?.aiSuite?.enabled!==false; if($('#ai-management-brief-panel')) $('#ai-management-brief-panel').hidden=!['admin','manager','supervisor'].includes(appState.currentUser?.role)||(appState.aiFeatures?.managementBrief===false); $('#ai-suite-status').textContent=enabled?'IA activa':'IA desactivada';$('#ai-suite-model').textContent=appState.settings?.hasApiKey?`Modelo: ${appState.settings?.model||'configurado'}`:'Modo local · cargá una API Key para análisis avanzado';const features=appState.aiFeatures||{};$('#ai-capability-grid').innerHTML=Object.entries(aiFeatureLabels).filter(([key])=>features[key]!==false).map(([key,[label,copy]])=>`<div class="ai-capability"><span>✦</span><div><b>${escapeHtml(label)}</b><small>${escapeHtml(copy)}</small></div></div>`).join('')||'<div class="ai-empty">No hay funciones IA habilitadas.</div>';if(activeAiInsight)renderAiInsight(activeAiInsight);const sc=appState.settings?.smartCapture||{},scPanel=$('#smart-capture-settings-panel');if(scPanel){scPanel.hidden=appState.currentUser?.role!=='admin';$('#smart-capture-enabled').checked=sc.enabled!==false;$('#smart-capture-auto').checked=sc.autoApplySafe!==false;$('#smart-capture-ai').checked=sc.aiExtraction!==false;$('#smart-capture-threshold').value=Number(sc.confidenceThreshold||82);$('#smart-capture-auto-threshold').value=Number(sc.autoApplyConfidence||96);}}
function renderExperienceSettings(){
  const grid=$("#experience-toggle-grid"); if(!grid||!appState)return;
  const exp=appState.settings?.experience||{};
  grid.innerHTML=Object.entries(experienceOptions).map(([key,[title,desc]])=>`<label class="module-toggle-card experience"><span><b>${escapeHtml(title)}</b><small>${escapeHtml(desc)}</small></span><input type="checkbox" data-experience-toggle="${escapeHtml(key)}" ${exp[key]!==false?"checked":""} /></label>`).join("");
}

function renderAiInsight(insight){const grid=$('#ai-insight-grid');if(!grid)return;const list=(items)=>Array.isArray(items)&&items.length?`<ul>${items.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:'<small>Sin observaciones.</small>';grid.innerHTML=`<article class="ai-insight-card summary"><small>RESUMEN</small><strong>${escapeHtml(insight.summary||'Sin resumen')}</strong></article><article class="ai-insight-card"><small>SENTIMIENTO</small><strong>${escapeHtml(insight.sentiment||'neutral')}</strong><em>Urgencia: ${escapeHtml(insight.urgency||'normal')}</em></article><article class="ai-insight-card probability"><small>PROBABILIDAD DE CIERRE</small><strong>${Number(insight.closeProbability||0)}%</strong><div class="probability-bar"><i style="width:${Math.max(0,Math.min(100,Number(insight.closeProbability||0)))}%"></i></div></article><article class="ai-insight-card"><small>SIGUIENTE MEJOR ACCIÓN</small>${list(insight.nextActions)}</article><article class="ai-insight-card"><small>DATOS FALTANTES</small>${list(insight.missingData)}</article><article class="ai-insight-card"><small>RIESGOS</small>${list(insight.risks)}</article><article class="ai-insight-card"><small>OPORTUNIDADES</small>${list(insight.opportunities)}</article><article class="ai-insight-card"><small>CALIDAD</small><strong>${Number(insight.quality?.score||0)}/100</strong>${list(insight.quality?.notes)}</article>`;}
function renderProductivity(){if(!appState)return;const alerts=appState.operationalAlerts||[],tasks=appState.tasks||[],objectives=appState.objectives||[],approvals=appState.approvals||[];$('#productivity-alert-count').textContent=alerts.length;$('#productivity-task-count').textContent=tasks.filter(t=>!['done','cancelled'].includes(t.status)).length;$('#productivity-objective-count').textContent=objectives.filter(o=>o.active!==false).length;$('#productivity-approval-count').textContent=approvals.filter(a=>a.status==='pending').length;$('#nav-task-count').textContent=tasks.filter(t=>!['done','cancelled'].includes(t.status)).length;$('#smart-alert-list').innerHTML=alerts.length?alerts.map(a=>`<button class="smart-alert ${escapeHtml(a.severity)}" type="button" ${a.dealId?`data-alert-deal="${escapeHtml(a.dealId)}"`:''}><span>${a.severity==='critical'?'!':'•'}</span><div><b>${escapeHtml(a.title)}</b><small>${escapeHtml(a.detail)}</small></div></button>`).join(''):'<div class="ai-empty">Sin alertas críticas. Operación al día.</div>';$('#task-list').innerHTML=tasks.length?tasks.map(t=>`<article class="task-card ${escapeHtml(t.priority)} ${escapeHtml(t.status)}" data-task-id="${escapeHtml(t.id)}"><div><b>${escapeHtml(t.title)}</b><small>${escapeHtml(t.assignedUserName||'Sin responsable')}${t.dueAt?` · vence ${escapeHtml(formatDate(t.dueAt))}`:''}</small></div><div class="inline-actions">${t.status!=='done'?'<button class="button ghost" data-task-action="done" type="button">✓ Completar</button>':''}<button class="icon-button" data-task-action="delete" type="button">×</button></div></article>`).join(''):'<div class="ai-empty">No hay tareas.</div>';$('#objective-list').innerHTML=objectives.length?objectives.map(o=>`<article class="objective-card"><span>◎</span><div><b>${escapeHtml(o.name)}</b><small>${escapeHtml(o.metric)} · Meta ${Number(o.target||0).toLocaleString('es-PY')}</small></div>${['admin','manager','supervisor'].includes(appState.currentUser?.role)?`<button class="icon-button" data-objective-delete="${escapeHtml(o.id)}" type="button">×</button>`:''}</article>`).join(''):'<div class="ai-empty">Sin objetivos configurados.</div>';$('#approval-list').innerHTML=approvals.length?approvals.map(a=>`<article class="approval-card ${escapeHtml(a.status)}" data-approval-id="${escapeHtml(a.id)}"><div><span>${escapeHtml(a.status==='pending'?'PENDIENTE':a.status==='approved'?'APROBADO':'RECHAZADO')}</span><b>${escapeHtml(a.title)}</b><small>${escapeHtml(a.requestedByName||'')} ${a.amount?`· ${money.format(a.amount)}`:''}</small></div>${a.status==='pending'&&['admin','manager','supervisor'].includes(appState.currentUser?.role)?'<div class="inline-actions"><button class="button primary" data-approval-action="approved" type="button">Aprobar</button><button class="button danger-outline" data-approval-action="rejected" type="button">Rechazar</button></div>':''}</article>`).join(''):'<div class="ai-empty">Sin solicitudes de aprobación.</div>';}

const organizationKindLabels={company:"Empresa",director:"Dirección",manager:"Gerencia",supervisor:"Jefatura",agent:"Agente",department:"Departamento",sector:"Sector",branch:"Sucursal",other:"Otro"};
function organizationRoots(nodes){const ids=new Set(nodes.map(node=>node.id));return nodes.filter(node=>!node.parentId||!ids.has(node.parentId));}
function organizationLevel(parentId,nodes,seen=new Set()){
  const children=(parentId===null?organizationRoots(nodes):nodes.filter(node=>node.parentId===parentId)).filter(node=>!seen.has(node.id));if(!children.length)return "";
  return `<ul>${children.map(node=>{const nextSeen=new Set(seen);nextSeen.add(node.id);const details=[node.userName,node.branchName].filter(Boolean).join(" · ");return `<li><article class="organization-node kind-${escapeHtml(node.kind)}" data-organization-id="${escapeHtml(node.id)}"><span class="organization-kind">${escapeHtml(organizationKindLabels[node.kind]||"Otro")}</span><strong>${escapeHtml(node.label)}</strong>${details?`<small>${escapeHtml(details)}</small>`:""}${node.description?`<p>${escapeHtml(node.description)}</p>`:""}${organizationData?.canManage?`<div class="organization-node-actions"><button type="button" data-organization-action="add" title="Agregar dependiente">＋</button><button type="button" data-organization-action="edit" title="Editar">✎</button><button type="button" data-organization-action="delete" title="Eliminar">×</button></div>`:""}</article>${organizationLevel(node.id,nodes,nextSeen)}</li>`}).join("")}</ul>`;
}
function renderOrganization(){
  const canvas=$("#organization-canvas");if(!canvas||!organizationData)return;const nodes=organizationData.nodes||[];
  $("#organization-company-name").textContent=organizationData.company?.name||"Empresa";$("#organization-summary").textContent=nodes.length?`${nodes.length} elemento${nodes.length===1?"":"s"} en la estructura`:"Sin estructura configurada";
  $("#new-organization-node").hidden=!organizationData.canManage;
  canvas.innerHTML=nodes.length?`<div class="organization-tree">${organizationLevel(null,nodes)}</div>`:`<div class="organization-empty"><span>◇</span><h3>Creá el primer nivel</h3><p>Podés comenzar con la empresa y luego agregar direcciones, sectores, sucursales y personas.</p></div>`;
}
async function fetchOrganization(){
  try{organizationData=await api("/api/organization");renderOrganization();}catch(error){organizationData=null;showToast(error.message,"warning");}
}
function organizationDescendants(id){const result=new Set();const visit=(parent)=>{for(const node of organizationData?.nodes||[]){if(node.parentId===parent&&!result.has(node.id)){result.add(node.id);visit(node.id);}}};visit(id);return result;}
function openOrganizationDialog(node=null,parentId=""){
  if(!organizationData?.canManage)return;$("#organization-form").reset();$("#organization-node-id").value=node?.id||"";$("#organization-dialog-title").textContent=node?"Editar elemento":"Nuevo elemento";$("#organization-kind").value=node?.kind||"company";$("#organization-label").value=node?.label||"";$("#organization-description").value=node?.description||"";
  const blocked=node?organizationDescendants(node.id):new Set();if(node)blocked.add(node.id);const parentOptions=(organizationData.nodes||[]).filter(entry=>!blocked.has(entry.id));$("#organization-parent").innerHTML=`<option value="">Nivel principal</option>`+parentOptions.map(entry=>`<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.label)} · ${escapeHtml(organizationKindLabels[entry.kind]||entry.kind)}</option>`).join("");$("#organization-parent").value=node?.parentId||parentId||"";
  $("#organization-user").innerHTML=`<option value="">Sin usuario</option>`+(organizationData.users||[]).map(user=>`<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} · ${escapeHtml(user.role)}</option>`).join("");$("#organization-user").value=node?.userId||"";
  $("#organization-branch").innerHTML=`<option value="">Sin sucursal</option>`+(organizationData.branches||[]).map(branch=>`<option value="${escapeHtml(branch.id)}">${escapeHtml(branch.name)}</option>`).join("");$("#organization-branch").value=node?.branchId||"";$("#organization-dialog").showModal();
}

function renderAll() {
  if (!appState) return;
  // Render global mínimo. Las vistas pesadas se actualizan solo cuando están visibles.
  applyExperienceSettings();
  applyBranding();
  renderConnection();
  renderUserStatus();
  renderMetrics();
  renderHeaderOperations();
  renderCampaignSummaryFromState();
  renderCallAlert();
  renderModuleVisibility();
  renderBotToggle();
  renderReasons();
  const newsCount = $("#nav-news-count"); if (newsCount) newsCount.textContent = String(appState.newsUnreadCount || 0);

  if (currentView === "crm") renderBoard();
  if (currentView === "whatsapp") { renderActivity(); renderAssistantDocuments(); hydrateSettings(); renderBotAutomationSettings(); }
  if (currentView === "branches") { renderUsers(); renderBranches(); }
  if (currentView === "organization" && organizationData) renderOrganization();
  if (currentView === "drive") renderDrive();
  if (currentView === "stock") renderStock();
  if (currentView === "replies") renderQuickReplies();
  if (currentView === "reports") renderReports();
  if (currentView === "attendance") renderAttendance();
  if (currentView === "news") renderNews();
  if (currentView === "ai") { renderAssistantDocuments(); renderAiCenter(); }
  if (currentView === "productivity") renderProductivity();
  if (currentView === "settings") { renderUsers(); hydrateSettings(); renderOperationsAdmin(); renderCustomFieldDefinitions(); renderPlatformConfig(); renderBotAutomationSettings(); }
  if (currentView === "design") hydrateSettings();
  if (currentView === "advanced") renderOperationsAdmin();
  if (selectedDealId) renderDrawer();
}

function openDrawer(id) {
  selectedDealId = id;
  setDrawerPane("conversation");
  renderDrawer();
}

function setDrawerPane(name="conversation") {
  $$('[data-drawer-tab]').forEach((button)=>button.classList.toggle('active',button.dataset.drawerTab===name));
  $$('[data-drawer-pane]').forEach((pane)=>pane.classList.toggle('active',pane.dataset.drawerPane===name));
}

function closeDrawer() {
  selectedDealId = null;
  const drawer = $("#deal-drawer");
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (isRecordingAudio) stopRecording(true);
  clearPendingMedia();
}

function updateInstructionCounter() {
  $("#instruction-counter").textContent = `${$("#instructions").value.length.toLocaleString("es-PY")} / 12.000`;
}

function patchLiveState(live) {
  if (!appState || !live) return;
  if (live.connection) appState.connection = live.connection;
  if (Array.isArray(live.branchConnections)) {
    appState.branchConnections = live.branchConnections;
    const byBranch = new Map(live.branchConnections.map((entry)=>[entry.branchId,entry]));
    for (const branch of (appState.branches || [])) if (byBranch.has(branch.id)) branch.connection = byBranch.get(branch.id);
  }
  if (Array.isArray(live.whatsappLines)) {
    const byLine = new Map(live.whatsappLines.map((entry)=>[entry.id,entry.connection]));
    for (const line of (appState.whatsappLines || [])) if (byLine.has(line.id)) line.connection = byLine.get(line.id);
  }
  renderConnection();
  if (currentView === "branches") renderBranches();
}

function nextPollDelay() {
  if (document.hidden) return 12000;
  const status = appState?.connection?.status;
  if (currentView === "whatsapp" && ["starting","qr"].includes(status)) return 850;
  if (["whatsappLines","branches"].includes(currentView)) return 1500;
  return 5000;
}

function schedulePoll(delay = nextPollDelay()) {
  clearTimeout(pollTimer);
  pollTimer = window.setTimeout(() => void poll(), delay);
}

async function poll() {
  if (!authenticated || polling || document.hidden) { schedulePoll(); return; }
  polling = true;
  try {
    const live = await api("/api/live");
    patchLiveState(live);
    const revision = Number(live?.revision || 0);
    if (revision && revision !== lastStateRevision) {
      setState(await api("/api/state"));
    }
  } catch (error) {
    const now = Date.now();
    if (authenticated && now - lastPollErrorAt > 30000) { showToast(error.message, "warning"); lastPollErrorAt = now; }
  } finally {
    polling = false;
    schedulePoll();
  }
}

function confirmAction(title, message) {
  const dialog = $("#confirm-dialog");
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener("close", onClose);
      resolve(dialog.returnValue === "confirm");
    };
    dialog.addEventListener("close", onClose);
    dialog.showModal();
  });
}

function openProductDialog(product = null) {
  $("#product-form").reset();
  $("#product-id").value = product?.id || "";
  $("#product-name").value = product?.name || "";
  $("#product-sku").value = product?.sku || "";
  $("#product-description").value = product?.description || "";
  $("#product-available").value = product?.available ?? 0;
  $("#product-min").value = product?.minStock ?? 0;
  $("#product-price").value = product?.price ?? 0;
  renderDynamicCustomFields($("#product-custom-fields"), "product", product?.customFields || {}, true);
  $("#product-dialog-title").textContent = product ? "Editar producto" : "Nuevo producto";
  $("#product-dialog").showModal();
}

function openAdjustDialog(product) {
  $("#adjust-form").reset();
  $("#adjust-product-id").value = product.id;
  $("#adjust-product-name").textContent = `${product.name} · ${product.available} disponibles`;
  $("#adjust-note").value = "Ajuste manual";
  $("#adjust-dialog").showModal();
}

async function uploadPendingMedia() {
  if (!pendingMedia || !selectedDealId) return;
  const file = pendingMedia.file;
  if (file.size > 64 * 1024 * 1024) throw new Error("El archivo supera el límite de 64 MB.");
  const response = await fetch(`/api/deals/${encodeURIComponent(selectedDealId)}/media`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name || "archivo"),
      "X-Media-Kind": pendingMedia.kind,
      "X-Caption": encodeURIComponent($("#media-caption").value.trim()),
      "X-Duration": String(pendingMedia.duration || 0),
      "X-Voice-Note": pendingMedia.voiceNote ? "1" : "0",
    },
    body: file,
  });
  const raw = await response.text();
  let result = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = {}; }
  if (response.status === 401) showLogin("Tu sesión venció. Ingresá nuevamente.");
  if (!response.ok) throw new Error(result.error || "No se pudo enviar el archivo.");
  setState(result);
}

function preferredRecordingMime() {
  if (!window.MediaRecorder) return "";
  const choices = [
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/webm;codecs=opus",
    "audio/webm",
  ];
  return choices.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

function stopRecording(discard = false) {
  if (!isRecordingAudio) return;
  discardRecording = discard;
  isRecordingAudio = false;
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  $("#record-audio-button").classList.remove("recording");
  $("#record-audio-button").textContent = "● Grabar audio";
}

async function toggleRecording() {
  if (isRecordingAudio) {
    stopRecording();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    throw new Error("Este navegador no permite grabar audio. Podés adjuntar un archivo de audio.");
  }
  recorderStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const mimeType = preferredRecordingMime();
  mediaRecorderChunks = [];
  mediaRecorder = mimeType ? new MediaRecorder(recorderStream, { mimeType, audioBitsPerSecond: 96000 }) : new MediaRecorder(recorderStream);
  recordingStartedAt = Date.now();
  discardRecording = false;
  mediaRecorder.addEventListener("dataavailable", (event) => { if (event.data?.size) mediaRecorderChunks.push(event.data); });
  mediaRecorder.addEventListener("stop", () => {
    const duration = Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000));
    const actualType = String(mediaRecorder?.mimeType || mimeType || mediaRecorderChunks[0]?.type || "audio/webm").split(";")[0];
    if (!discardRecording && mediaRecorderChunks.length) {
      const blob = new Blob(mediaRecorderChunks, { type: actualType });
      const extension = actualType.includes("mp4") ? "m4a" : actualType.includes("ogg") ? "ogg" : actualType.includes("mpeg") ? "mp3" : "webm";
      const file = new File([blob], `audio-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`, { type: actualType });
      pendingMedia = { file, kind: "audio", voiceNote: actualType === "audio/ogg", duration };
    }
    recorderStream?.getTracks().forEach((track) => track.stop());
    recorderStream = null;
    mediaRecorder = null;
    mediaRecorderChunks = [];
    renderMediaComposer();
  }, { once: true });
  mediaRecorder.start(250);
  isRecordingAudio = true;
  $("#record-audio-button").classList.add("recording");
  $("#record-audio-button").textContent = "■ Detener grabación";
}


$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("button[type='submit']", event.currentTarget);
  button.disabled = true;
  $("#login-error").textContent = "";
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: $("#login-username").value.trim(), password: $("#login-password").value }) });
    $("#login-password").value = "";
    showApp();
    setState(await api("/api/state"), { hydrateSettings: true });
    void fetchHeaderOperations(true);
  } catch (error) {
    $("#login-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("#logout-button").addEventListener("click", async () => {
  const master=appState?.currentUser?.isMaster===true;
  try { await api("/api/auth/logout", { method: "POST" }); } finally { if(master)window.location.assign("/master");else showLogin(); }
});


function customFieldsFor(entity) {
  return (appState?.customFieldDefinitions || []).filter((field) => field.active !== false && field.entity === entity);
}

function customFieldInput(field, value, editable = true) {
  const disabled = editable ? "" : " disabled";
  const key = escapeHtml(field.key);
  const safe = value ?? "";
  if (field.type === "boolean") return `<label class="check-row dynamic-field"><input data-custom-key="${key}" data-custom-entity="${escapeHtml(field.entity)}" type="checkbox" ${safe === true || safe === "true" ? "checked" : ""}${disabled}/><span><b>${escapeHtml(field.label)}</b><small>${escapeHtml(field.context || "")}</small></span></label>`;
  if (field.type === "select") return `<label class="dynamic-field"><span>${escapeHtml(field.label)}</span><select data-custom-key="${key}" data-custom-entity="${escapeHtml(field.entity)}"${disabled}><option value="">Sin dato</option>${(field.options || []).map((option) => `<option value="${escapeHtml(option)}"${String(option) === String(safe) ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select><small>${escapeHtml(field.context || "")}</small></label>`;
  const type = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
  return `<label class="dynamic-field"><span>${escapeHtml(field.label)}${field.required ? " *" : ""}</span><input data-custom-key="${key}" data-custom-entity="${escapeHtml(field.entity)}" type="${type}" value="${escapeHtml(safe)}"${disabled}/><small>${escapeHtml(field.context || "")}</small></label>`;
}

function renderDynamicCustomFields(container, entity, values = {}, editable = true) {
  if (!container) return;
  const fields = customFieldsFor(entity);
  container.innerHTML = fields.length ? fields.map((field) => customFieldInput(field, values?.[field.key], editable)).join("") : `<div class="column-empty compact">No hay campos personalizados para ${entity === "contact" ? "contactos" : entity === "deal" ? "negociaciones" : "productos"}.</div>`;
}

function collectDynamicCustomFields(container) {
  const values = {};
  if (!container) return values;
  $$('[data-custom-key]', container).forEach((input) => { values[input.dataset.customKey] = input.type === "checkbox" ? input.checked : input.value; });
  return values;
}

function renderDealCustomFields(deal, canWork) {
  const container = $("#drawer-custom-fields");
  if (!container) return;
  const client = (appState.clients || []).find((entry) => entry.id === deal.clientId);
  const contactFields = customFieldsFor("contact");
  const dealFields = customFieldsFor("deal");
  const groups = [];
  if (contactFields.length) groups.push(`<div class="dynamic-field-group"><b>Contacto</b>${contactFields.map((field) => customFieldInput(field, client?.customFields?.[field.key], canWork)).join("")}</div>`);
  if (dealFields.length) groups.push(`<div class="dynamic-field-group"><b>Negociación</b>${dealFields.map((field) => customFieldInput(field, deal.customFields?.[field.key], canWork)).join("")}</div>`);
  container.innerHTML = groups.join("") || `<div class="column-empty compact">Sin campos personalizados</div>`;
  $("#save-drawer-custom-fields").hidden = !canWork || (!contactFields.length && !dealFields.length);
}

async function saveDrawerCustomFields() {
  const deal = (appState.deals || []).find((entry) => entry.id === selectedDealId);
  if (!deal) return;
  const client = (appState.clients || []).find((entry) => entry.id === deal.clientId);
  const root = $("#drawer-custom-fields");
  const contactValues = {}, dealValues = {};
  $$('[data-custom-key]', root).forEach((input) => {
    const key = input.dataset.customKey;
    const entity = input.dataset.customEntity;
    const value = input.type === "checkbox" ? input.checked : input.value;
    if (entity === "contact") contactValues[key] = value;
    if (entity === "deal") dealValues[key] = value;
  });
  if (client && Object.keys(contactValues).length) await api(`/api/custom-values/contact/${encodeURIComponent(client.id)}`, { method: "PUT", body: JSON.stringify({ values: contactValues }) });
  if (Object.keys(dealValues).length) await api(`/api/custom-values/deal/${encodeURIComponent(deal.id)}`, { method: "PUT", body: JSON.stringify({ values: dealValues }) });
  setState(await api("/api/state"));
  showToast("Datos personalizados guardados");
}

const attendanceLabels = { active: "Disponible", paused: "En pausa", away: "Permiso / Ausente", offline: "Fuera de línea" };
function renderAttendance() {
  if (!appState) return;
  const user = appState.currentUser || {};
  const status = user.attendance?.status || (user.role === "agent" ? "offline" : "active");
  if ($("#attendance-my-title")) $("#attendance-my-title").textContent = attendanceLabels[status] || status;
  if ($("#attendance-my-copy")) $("#attendance-my-copy").textContent = status === "active" ? "Estás recibiendo clientes nuevos sin responsable." : status === "away" ? "Tus clientes conservan tu responsabilidad; jefatura puede cubrirlos temporalmente." : status === "paused" ? "No recibirás clientes nuevos hasta volver a Disponible." : "Marcá Disponible para comenzar a recibir clientes nuevos.";
  if ($("#attendance-reason") && document.activeElement !== $("#attendance-reason")) $("#attendance-reason").value = user.attendance?.reason || "";
  if ($("#attendance-my-light")) $("#attendance-my-light").className = `attendance-light ${status}`;
  $$('[data-attendance-status]').forEach((button) => button.classList.toggle("selected", button.dataset.attendanceStatus === status));
  const visibleTeam = appState.presence?.users || [];
  if ($("#attendance-team")) $("#attendance-team").innerHTML = visibleTeam.length ? visibleTeam.map((entry) => { const st = entry.status || "offline"; return `<div class="attendance-person"><span class="attendance-dot ${escapeHtml(st)}"></span><div><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.branchName || "Sucursal")}${entry.reason ? ` · ${escapeHtml(entry.reason)}` : ""}</small></div><b>${escapeHtml(attendanceLabels[st] || st)}</b></div>`; }).join("") : `<div class="column-empty">No hay agentes visibles para tu rol</div>`;
  if ($("#nav-available-count")) $("#nav-available-count").textContent = String(appState.presence?.counts?.active || 0);
}


function startHeaderClock() {
  if (headerClockTimer) return;
  const tick=()=>{
    const timezone=headerOperations?.timezone || appState?.branches?.find(b=>b.id===appState?.currentUser?.branchId)?.timezone || "America/Asuncion";
    const now=new Date();
    try { if($("#live-time")) $("#live-time").textContent=new Intl.DateTimeFormat("es-PY",{timeZone:timezone,hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(now); if($("#live-date")) $("#live-date").textContent=new Intl.DateTimeFormat("es-PY",{timeZone:timezone,weekday:"short",day:"2-digit",month:"short",year:"numeric"}).format(now).replaceAll(".",""); } catch { if($("#live-time")) $("#live-time").textContent=now.toLocaleTimeString("es-PY"); }
  }; tick(); headerClockTimer=setInterval(tick,1000);
}
async function fetchHeaderOperations(force=false){ if(!authenticated)return; try{ if(force) headerOperations=null; headerOperations=await api("/api/operations/header"); renderHeaderOperations(); }catch{} }
function renderHeaderOperations(){
  if(!appState)return; startHeaderClock();
  const user=appState.currentUser||{}; const status=user.attendance?.status || (user.role==="agent"?"offline":"active");
  const select=$("#header-attendance-select"); if(select&&document.activeElement!==select)select.value=status;
  if($("#header-attendance-dot")) $("#header-attendance-dot").className=`attendance-dot ${status}`;
  const p=appState.presence||{counts:{},scope:"self"}; if($("#presence-count"))$("#presence-count").textContent=`${Number(p.counts?.active||0)} disponibles`; if($("#presence-scope"))$("#presence-scope").textContent=p.scope==="all"?"Todos los agentes":p.scope==="branch"?"Mi sucursal":"Mi estado";
  const weather=headerOperations?.weather; if(weather?.ok){ $("#weather-icon").textContent=weather.icon||"🌤"; $("#weather-temp").textContent=`${Math.round(Number(weather.temperature)||0)}°`; $("#weather-location").textContent=`${weather.location||headerOperations?.branchName||"Sucursal"} · ${weather.label||""}`; $("#weather-pill").classList.remove("weather-error"); } else { $("#weather-icon").textContent=weather?.enabled===false?"○":"☁"; $("#weather-temp").textContent=weather?.enabled===false?"OFF":"--°"; $("#weather-location").textContent=weather?.enabled===false?"Clima oculto":(weather?.location||headerOperations?.branchName||"Sin ubicación"); $("#weather-pill")?.classList.toggle("weather-error",weather?.enabled!==false); }
  const incident=headerOperations?.incident || appState.settings?.operational?.incident || {}; const banner=$("#incident-banner"); if(banner){banner.hidden=!(incident.enabled&&incident.message);banner.className=`incident-banner ${escapeHtml(incident.severity||"warning")}`;$("#incident-title").textContent=incident.title||"Aviso operativo";$("#incident-message").textContent=incident.message||"";$("#incident-icon").textContent=incident.severity==="critical"?"‼":incident.severity==="info"?"i":"!";}
}
function renderPresenceDialog(){ const p=appState?.presence||{users:[],counts:{}}; if($("#presence-dialog-scope"))$("#presence-dialog-scope").textContent=p.scope==="all"?"Vista general de todas las sucursales":p.scope==="branch"?"Agentes de tu sucursal":"Tu disponibilidad"; if($("#presence-summary"))$("#presence-summary").innerHTML=Object.entries(attendanceLabels).map(([key,label])=>`<div><span class="attendance-dot ${key}"></span><strong>${Number(p.counts?.[key]||0)}</strong><small>${escapeHtml(label)}</small></div>`).join(""); if($("#presence-list"))$("#presence-list").innerHTML=p.users?.length?p.users.map(u=>`<div class="presence-person"><span class="attendance-dot ${escapeHtml(u.status)}"></span><div><strong>${escapeHtml(u.name)}</strong><small>${escapeHtml(u.branchName)}${u.reason?` · ${escapeHtml(u.reason)}`:""}</small></div><b>${escapeHtml(attendanceLabels[u.status]||u.status)}</b><em class="${u.online?"online":""}">${u.online?"En línea":"Sin sesión"}</em></div>`).join(""):`<div class="column-empty">Sin agentes visibles.</div>`; }
function renderNews(){ if(!appState)return; const news=appState.news||[]; if($("#nav-news-count"))$("#nav-news-count").textContent=String(appState.newsUnreadCount||0); if($("#news-unread-total"))$("#news-unread-total").textContent=String(news.filter(n=>!n.read).length); if($("#news-important-total"))$("#news-important-total").textContent=String(news.filter(n=>["important","urgent"].includes(n.priority)).length); if($("#news-visible-total"))$("#news-visible-total").textContent=String(news.length); const feed=$("#news-feed"); if(!feed)return; feed.innerHTML=news.length?news.map(n=>{ const files=(n.attachments||[]).map(f=>f.kind==="image"?`<a class="news-media image" href="${escapeHtml(f.url)}" target="_blank"><img src="${escapeHtml(f.url)}" alt="${escapeHtml(f.fileName)}" /></a>`:f.kind==="video"?`<div class="news-media video"><video controls preload="metadata" src="${escapeHtml(f.url)}"></video><small>${escapeHtml(f.fileName)}</small></div>`:f.kind==="audio"?`<div class="news-media audio"><audio controls src="${escapeHtml(f.url)}"></audio><small>${escapeHtml(f.fileName)}</small></div>`:`<a class="news-document" href="${escapeHtml(f.url)}" target="_blank"><span>□</span><div><strong>${escapeHtml(f.fileName)}</strong><small>${formatBytes(f.size||0)}</small></div></a>`).join(""); return `<article class="news-card ${escapeHtml(n.priority||"normal")} ${n.read?"read":"unread"}" data-news-id="${escapeHtml(n.id)}"><header><div><span class="news-priority">${n.priority==="urgent"?"URGENTE":n.priority==="important"?"IMPORTANTE":"NOVEDAD"}</span>${n.pinned?'<span class="news-pinned">FIJADA</span>':""}<h3>${escapeHtml(n.title)}</h3><small>${escapeHtml(n.createdByName||"Equipo")} · ${escapeHtml(formatDate(n.createdAt))}</small></div>${!n.read?'<i class="news-unread-dot"></i>':""}</header><p>${escapeHtml(n.body).replaceAll("\n","<br>")}</p>${files?`<div class="news-media-grid">${files}</div>`:""}<footer><button class="button ghost" type="button" data-news-action="read">${n.read?"Leída":"Marcar como leída"}</button>${appState.currentUser?.role==="admin"||appState.currentUser?.role==="manager"||(appState.currentUser?.role==="supervisor"&&n.createdByUserId===appState.currentUser.id)?'<button class="button danger-outline" type="button" data-news-action="delete">Eliminar</button>':""}</footer></article>`;}).join(""):`<div class="panel column-empty">No hay noticias para vos todavía.</div>`; }
function openNewsDialog(){ const user=appState.currentUser||{}; $("#news-form").reset(); const branches=(appState.branches||[]).filter(b=>b.active!==false&&(user.role!=="supervisor"||b.id===user.branchId)); $("#news-branch").innerHTML=branches.map(b=>`<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join(""); if(user.branchId)$("#news-branch").value=user.branchId; const audience=$("#news-audience-mode"); if(audience){ audience.disabled=false; audience.innerHTML=user.role==="supervisor"?`<option value="branch">Toda mi sucursal</option><option value="users">Agentes seleccionados</option>`:`<option value="all">Todo el equipo</option><option value="branch">Sucursal seleccionada</option><option value="users">Agentes seleccionados</option>`; audience.value=user.role==="supervisor"?"branch":"all"; } updateNewsAudience(); $("#news-dialog").showModal(); }
function updateNewsAudience(){ const mode=$("#news-audience-mode")?.value||"all", branchId=$("#news-branch")?.value||appState.currentUser?.branchId; if($("#news-branch-row"))$("#news-branch-row").hidden=mode!=="branch"&&mode!=="users"; if($("#news-users-row"))$("#news-users-row").hidden=mode!=="users"; const users=(appState.users||[]).filter(u=>u.active!==false&&u.role==="agent"&&(!branchId||u.branchId===branchId)); if($("#news-users"))$("#news-users").innerHTML=users.map(u=>`<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)} · ${escapeHtml(roleLabel(u.role))}</option>`).join(""); }
function renderOperationsAdmin(){ if(!appState||appState.currentUser?.role!=="admin")return; const op=appState.settings?.operational||{}; const branches=(appState.branches||[]).filter(b=>b.active!==false); if($("#ops-branch")&&document.activeElement!==$("#ops-branch")){ const current=$("#ops-branch").value||appState.currentUser?.branchId||branches[0]?.id||""; $("#ops-branch").innerHTML=branches.map(b=>`<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join(""); $("#ops-branch").value=branches.some(b=>b.id===current)?current:(branches[0]?.id||""); } const branch=branches.find(b=>b.id===$("#ops-branch")?.value)||branches[0]; if(branch){if($("#ops-timezone")&&document.activeElement!==$("#ops-timezone"))$("#ops-timezone").value=branch.timezone||op.timezoneDefault||"America/Asuncion";if($("#ops-weather-location")&&document.activeElement!==$("#ops-weather-location"))$("#ops-weather-location").value=branch.weatherLocation||branch.city||"";if($("#ops-weather-lat")&&document.activeElement!==$("#ops-weather-lat"))$("#ops-weather-lat").value=branch.weatherLatitude??"";if($("#ops-weather-lon")&&document.activeElement!==$("#ops-weather-lon"))$("#ops-weather-lon").value=branch.weatherLongitude??"";} if($("#ops-weather-enabled"))$("#ops-weather-enabled").checked=op.weatherEnabled!==false;if($("#ops-weather-refresh"))$("#ops-weather-refresh").value=String(op.weatherRefreshMinutes||15);if($("#ops-support-message")&&document.activeElement!==$("#ops-support-message"))$("#ops-support-message").value=op.supportMessage||"";const incident=op.incident||{};if($("#ops-incident-enabled"))$("#ops-incident-enabled").value=incident.enabled?"true":"false";if($("#ops-incident-severity"))$("#ops-incident-severity").value=incident.severity||"warning";if($("#ops-incident-title")&&document.activeElement!==$("#ops-incident-title"))$("#ops-incident-title").value=incident.title||"Aviso operativo";if($("#ops-incident-message")&&document.activeElement!==$("#ops-incident-message"))$("#ops-incident-message").value=incident.message||""; }

function renderBotAutomationSettings() {
  if (!appState) return;
  const profiles = appState.settings?.botProfiles || {};
  const mappings = [["#bot-profile-new", profiles.newClientInstructions], ["#bot-profile-known", profiles.knownClientInstructions], ["#bot-profile-away", profiles.ownerAwayInstructions]];
  for (const [id, value] of mappings) if ($(id) && document.activeElement !== $(id)) $(id).value = value || "";
  if ($("#bot-rules-list")) {
    const rules = (appState.botInstructions || []).slice().sort((a,b)=>Number(a.order||0)-Number(b.order||0));
    $("#bot-rules-list").innerHTML = rules.length ? rules.map((rule) => `<div class="automation-rule-card ${rule.active === false ? "inactive" : ""}" data-bot-rule="${escapeHtml(rule.id)}"><div><span class="ai-badge">✦ BOT</span><strong>${escapeHtml(rule.name)}</strong><p>${escapeHtml(rule.instruction)}</p></div><div class="inline-actions"><button class="button ghost" type="button" data-bot-rule-action="edit">Editar</button><button class="button danger-outline" type="button" data-bot-rule-action="delete">Eliminar</button></div></div>`).join("") : `<div class="column-empty">No hay instrucciones adicionales. Podés crear reglas como captura automática de nombre, CI o RUC.</div>`;
  }
}

function entityLabel(entity) { return entity === "contact" ? "Contacto" : entity === "deal" ? "Negociación" : "Stock / Producto"; }
function renderCustomFieldDefinitions() {
  const list = $("#custom-fields-list"); if (!list || !appState) return;
  const fields = (appState.customFieldDefinitions || []).filter((entry)=>entry.active!==false);
  list.innerHTML = fields.length ? fields.map((field) => `<div class="custom-field-card" data-custom-field-id="${escapeHtml(field.id)}"><div><span class="field-entity">${escapeHtml(entityLabel(field.entity))}</span><strong>${escapeHtml(field.label)}</strong><small>${escapeHtml(field.key)} · ${escapeHtml(field.type)}</small><p>${escapeHtml(field.context || "Sin contexto")}</p><div class="field-flags"><span>${field.botReadable ? "Bot lee" : "Bot no lee"}</span><span>${field.botWritable ? "Bot completa" : "Carga manual"}</span>${field.required ? "<span>Obligatorio</span>" : ""}</div></div><div class="inline-actions"><button class="button ghost" type="button" data-custom-field-action="edit">Editar</button><button class="button danger-outline" type="button" data-custom-field-action="delete">Desactivar</button></div></div>`).join("") : `<div class="column-empty">Todavía no hay campos personalizados.</div>`;
}

function campaignStatusLabel(status) { return ({ draft: "Borrador", running: "Enviando", paused: "Pausada", completed: "Finalizada", failed: "Con error" })[status] || status || "Borrador"; }
function campaignMetrics(campaign) {
  const recipients = campaign.recipients || [];
  const sent = recipients.filter((r)=>r.sentAt).length;
  const replied = recipients.filter((r)=>r.repliedAt).length;
  const converted = recipients.filter((r)=>r.convertedAt).length;
  const failed = recipients.filter((r)=>r.status === "failed" || r.error).length;
  return { sent, replied, converted, failed, responseRate: sent ? Math.round(replied*1000/sent)/10 : 0, conversionRate: sent ? Math.round(converted*1000/sent)/10 : 0, total: recipients.length };
}
function renderCampaignSummaryFromState() {
  const nav = $("#nav-campaign-count"); if (nav) nav.textContent = String((appState?.campaigns || []).filter((c)=>c.status==="running").length);
}
async function fetchCampaigns() {
  if (!authenticated || !(appState.currentUser?.role === "admin" || appState.currentUser?.permissions?.campaignView || appState.currentUser?.permissions?.campaignManage)) return;
  try { campaignCatalog = await api("/api/campaigns"); renderCampaigns(); } catch (error) { showToast(error.message,"warning"); }
}
function renderCampaigns() {
  const campaigns = campaignCatalog.campaigns || [];
  const totals = campaigns.reduce((acc,c)=>{ const m=campaignMetrics(c); acc.sent+=m.sent; acc.replied+=m.replied; acc.converted+=m.converted; return acc; },{sent:0,replied:0,converted:0});
  if ($("#campaign-total")) $("#campaign-total").textContent = campaigns.length.toLocaleString("es-PY");
  if ($("#campaign-sent")) $("#campaign-sent").textContent = totals.sent.toLocaleString("es-PY");
  if ($("#campaign-response-rate")) $("#campaign-response-rate").textContent = `${totals.sent ? Math.round(totals.replied*1000/totals.sent)/10 : 0}%`;
  if ($("#campaign-conversions")) $("#campaign-conversions").textContent = totals.converted.toLocaleString("es-PY");
  if ($("#campaign-list")) $("#campaign-list").innerHTML = campaigns.length ? campaigns.map((campaign)=>{ const m=campaignMetrics(campaign); const branch=branchById(campaign.branchId); const canManage=appState.currentUser?.role==="admin"||appState.currentUser?.permissions?.campaignManage===true; return `<article class="campaign-card" data-campaign-id="${escapeHtml(campaign.id)}"><div class="campaign-card-head"><div><span class="campaign-status ${escapeHtml(campaign.status)}">${escapeHtml(campaignStatusLabel(campaign.status))}</span><h3>${escapeHtml(campaign.name)}</h3><small>${escapeHtml(branch?.name || "Sucursal")} · ${escapeHtml(campaign.lineName || "Línea predeterminada")} · ${m.total} destinatarios</small></div><div class="inline-actions">${canManage && ["draft","paused"].includes(campaign.status) ? `<button class="button primary" type="button" data-campaign-action="start">▶ Iniciar</button>` : ""}${canManage && campaign.status==="running" ? `<button class="button ghost" type="button" data-campaign-action="pause">Ⅱ Pausar</button>` : ""}${canManage && campaign.status!=="running" ? `<button class="button danger-outline" type="button" data-campaign-action="delete">Eliminar</button>` : ""}</div></div><p class="campaign-copy">${escapeHtml(campaign.message)}</p>${campaign.pauseReason ? `<div class="campaign-warning">${escapeHtml(campaign.pauseReason)}</div>` : ""}<div class="campaign-kpis"><div><strong>${m.sent}</strong><small>Enviados</small></div><div><strong>${m.replied}</strong><small>Respuestas · ${m.responseRate}%</small></div><div><strong>${m.converted}</strong><small>Conversiones · ${m.conversionRate}%</small></div><div><strong>${m.failed}</strong><small>Fallidos</small></div></div></article>`; }).join("") : `<div class="column-empty">Todavía no hay campañas creadas.</div>`;
  if ($("#nav-campaign-count")) $("#nav-campaign-count").textContent = String(campaigns.filter((c)=>c.status==="running").length);
  const safety=campaignCatalog.safety||appState.settings?.campaignSafety||{};
  if ($("#campaign-qr-daily-limit") && document.activeElement !== $("#campaign-qr-daily-limit")) $("#campaign-qr-daily-limit").value=Number(safety.qrDailyLimitPerBranch||25);
  if ($("#campaign-qr-interval") && document.activeElement !== $("#campaign-qr-interval")) $("#campaign-qr-interval").value=Number(safety.qrIntervalSeconds||90);
  if ($("#campaign-qr-cooldown") && document.activeElement !== $("#campaign-qr-cooldown")) $("#campaign-qr-cooldown").value=Number(safety.qrClientCooldownDays ?? 7);
  if ($("#campaign-qr-start-hour") && document.activeElement !== $("#campaign-qr-start-hour")) $("#campaign-qr-start-hour").value=Number(safety.qrStartHour ?? 8);
  if ($("#campaign-qr-end-hour") && document.activeElement !== $("#campaign-qr-end-hour")) $("#campaign-qr-end-hour").value=Number(safety.qrEndHour ?? 19);
  if ($("#campaign-safety-config")) $("#campaign-safety-config").hidden=appState.currentUser?.role!=="admin";
}
function campaignFormPayload() {
  return { name: $("#campaign-name").value.trim(), branchId: $("#campaign-branch").value, lineId: $("#campaign-line")?.value || null, message: $("#campaign-message").value.trim(), documentId: $("#campaign-document").value || null, filters: { city: $("#campaign-filter-city").value.trim(), company: $("#campaign-filter-company").value.trim(), document: $("#campaign-filter-document").value.trim(), ruc: $("#campaign-filter-ruc").value.trim(), tag: $("#campaign-filter-tag").value.trim(), stage: $("#campaign-filter-stage").value, ownerUserId: $("#campaign-filter-owner").value, minPurchases: Number($("#campaign-filter-purchases").value||0), minPurchaseValue: Number($("#campaign-filter-purchase-value").value||0), lastPurchaseWithinDays: Number($("#campaign-filter-last-days").value||0) || null, purchaseInactivityDays: Number($("#campaign-filter-inactive-purchase-days").value||0) || null, lastContactWithinDays: Number($("#campaign-filter-contact-days").value||0) || null, customFieldKey: $("#campaign-filter-custom-key").value, customFieldValue: $("#campaign-filter-custom-value").value.trim(), dealCustomFieldKey: $("#campaign-filter-deal-custom-key").value, dealCustomFieldValue: $("#campaign-filter-deal-custom-value").value.trim() } };
}
function openCampaignDialog() {
  $("#campaign-form").reset();
  const user=appState.currentUser||{}; const branches=(appState.branches||[]).filter(b=>b.active!==false && (user.role==="admin" || !user.branchId || b.id===user.branchId));
  $("#campaign-branch").innerHTML=branches.map(b=>`<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join("");
  if (user.branchId) $("#campaign-branch").value=user.branchId;
  $("#campaign-branch").disabled=user.role!=="admin";
  const refreshCampaignLines=()=>{ const branchId=$("#campaign-branch").value; const lines=(appState.whatsappLines||[]).filter(line=>line.active!==false&&line.canUse!==false).sort((a,b)=>Number(b.branchId===branchId)-Number(a.branchId===branchId)||String(a.name||"").localeCompare(String(b.name||""),"es")); $("#campaign-line").innerHTML=lines.length?lines.map(line=>`<option value="${escapeHtml(line.id)}">${escapeHtml(line.name)} · ${escapeHtml(line.phone||line.connection?.account||"Sin número")} · ${line.provider==="cloud"?"Cloud API":"QR"}</option>`).join(""):`<option value="">Sin línea habilitada</option>`; const preferred=lines.find(line=>line.branchId===branchId&&line.isDefault)||lines[0]; if(preferred)$("#campaign-line").value=preferred.id; };
  refreshCampaignLines();
  $("#campaign-line").dataset.refreshReady="1";
  $("#campaign-document").innerHTML=`<option value="">Sin adjunto</option>`+(campaignCatalog.documents||appState.assistantDocuments||[]).map(d=>`<option value="${escapeHtml(d.id)}">${escapeHtml(d.title||d.fileName)}</option>`).join("");
  const fields=customFieldsFor("contact"); $("#campaign-filter-custom-key").innerHTML=`<option value="">Ninguno</option>`+fields.map(f=>`<option value="${escapeHtml(f.key)}">${escapeHtml(f.label)}</option>`).join("");
  const dealFields=customFieldsFor("deal"); $("#campaign-filter-deal-custom-key").innerHTML=`<option value="">Ninguno</option>`+dealFields.map(f=>`<option value="${escapeHtml(f.key)}">${escapeHtml(f.label)}</option>`).join("");
  const eligibleUsers=(appState.users||[]).filter(entry=>entry.active!==false && entry.role!=="admin" && (!$("#campaign-branch").value || entry.branchId===$("#campaign-branch").value)); $("#campaign-filter-owner").innerHTML=`<option value="all">Cualquier responsable</option>`+eligibleUsers.map(entry=>`<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</option>`).join("");
  $("#campaign-preview").innerHTML=`<span>⌕</span><div><strong>Sin previsualizar</strong><small>Comprobá cuántos clientes cumplen los filtros antes de crear.</small></div>`;
  $("#campaign-dialog").showModal();
}
function openBotRuleDialog(rule=null){ $("#bot-rule-form").reset(); $("#bot-rule-id").value=rule?.id||""; $("#bot-rule-name").value=rule?.name||""; $("#bot-rule-instruction").value=rule?.instruction||""; $("#bot-rule-active").checked=rule?.active!==false; $("#bot-rule-dialog").showModal(); }
function openCustomFieldDialog(field=null){ $("#custom-field-form").reset(); $("#custom-field-id").value=field?.id||""; $("#custom-field-entity").value=field?.entity||"contact"; $("#custom-field-type").value=field?.type||"text"; $("#custom-field-label").value=field?.label||""; $("#custom-field-key").value=field?.key||""; $("#custom-field-key").disabled=Boolean(field); $("#custom-field-context").value=field?.context||""; $("#custom-field-options").value=(field?.options||[]).join(", "); $("#custom-field-readable").checked=field?.botReadable!==false; $("#custom-field-writable").checked=field?.botWritable===true; $("#custom-field-required").checked=field?.required===true; $("#custom-field-dialog").showModal(); }


$$('[data-platform-tab]').forEach(btn=>btn.addEventListener('click',()=>{$$('[data-platform-tab]').forEach(b=>b.classList.toggle('active',b===btn));$$('[data-platform-panel]').forEach(p=>p.classList.toggle('active',p.dataset.platformPanel===btn.dataset.platformTab));}));
$('#experience-preview-button')?.addEventListener('click',previewExperience);
$('#save-platform-config')?.addEventListener('click',async()=>{try{const modules={};$$('[data-module-toggle]').forEach(x=>modules[x.dataset.moduleToggle]=x.checked);const aiFeatures={};$$('[data-ai-toggle]').forEach(x=>aiFeatures[x.dataset.aiToggle]=x.checked);const experience={motionLevel:$('#experience-motion-level')?.value||'full',density:$('#experience-density')?.value||'comfortable'};$$('[data-experience-toggle]').forEach(x=>experience[x.dataset.experienceToggle]=x.checked);setState(await api('/api/platform/config',{method:'POST',body:JSON.stringify({modules,aiFeatures,experience,aiSuite:{enabled:$('#ai-suite-enabled').value==='true',proactive:$('#ai-proactive').value==='true',confidenceThreshold:Number($('#ai-confidence').value),maxContextMessages:Number($('#ai-context-messages').value),allowAutoFieldUpdates:$('#ai-auto-fields').checked,allowAutoTags:$('#ai-auto-tags').checked,requireHumanApprovalForExternalActions:$('#ai-human-approval').checked}})}),{hydrateSettings:true});applyExperienceSettings();showToast('Configuración modular, IA y experiencia visual guardada');}catch(error){showToast(error.message,'warning');}});
$('#generate-management-brief')?.addEventListener('click',async()=>{try{$('#generate-management-brief').disabled=true;$('#management-brief-content').innerHTML='<span>✦</span><p>Analizando operación…</p>';const result=await api('/api/ai/management-brief',{method:'POST',body:'{}'});$('#management-brief-content').innerHTML=`<span>✦</span><p>${escapeHtml(result.brief).replaceAll('\n','<br>')}</p>`;}catch(error){showToast(error.message,'warning');}finally{$('#generate-management-brief').disabled=false;}});
$('#ai-analyze-button')?.addEventListener('click',async()=>{const id=$('#ai-deal-select')?.value;if(!id)return showToast('Seleccioná una negociación','warning');try{$('#ai-analyze-button').disabled=true;$('#ai-insight-grid').innerHTML='<div class="ai-empty">✦ Analizando contexto, historial y conversación…</div>';activeAiInsight=await api(`/api/ai/deals/${encodeURIComponent(id)}/analyze`,{method:'POST',body:'{}'});renderAiInsight(activeAiInsight);}catch(error){showToast(error.message,'warning');}finally{$('#ai-analyze-button').disabled=false;}});
async function askCrm(){const q=$('#ai-question')?.value.trim();if(!q)return;const dealId=$('#ai-deal-select')?.value||selectedDealId||null;const log=$('#ai-question-log');log.insertAdjacentHTML('beforeend',`<div class="ai-q user">${escapeHtml(q)}</div>`);$('#ai-question').value='';try{const result=await api('/api/ai/ask',{method:'POST',body:JSON.stringify({question:q,dealId})});log.insertAdjacentHTML('beforeend',`<div class="ai-q assistant"><span>✦</span><p>${escapeHtml(result.answer).replaceAll('\n','<br>')}</p></div>`);log.scrollTop=log.scrollHeight;}catch(error){showToast(error.message,'warning');}}
$('#ai-question-button')?.addEventListener('click',()=>void askCrm());$('#ai-question')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void askCrm();}});
$('#new-task-button')?.addEventListener('click',()=>{const users=(appState.users||[]).filter(u=>u.active!==false&&u.role!=='admin'&&(!appState.currentUser?.branchId||u.branchId===appState.currentUser.branchId));$('#task-assignee').innerHTML=users.map(u=>`<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`).join('');if(users.some(u=>u.id===appState.currentUser?.id))$('#task-assignee').value=appState.currentUser.id;$('#task-form').reset();$('#task-dialog').showModal();});
$('#task-form')?.addEventListener('submit',async e=>{e.preventDefault();try{setState(await api('/api/tasks',{method:'POST',body:JSON.stringify({title:$('#task-title').value,description:$('#task-description').value,assignedUserId:$('#task-assignee').value,priority:$('#task-priority').value,dueAt:$('#task-due').value?new Date($('#task-due').value).toISOString():null})}));$('#task-dialog').close();showToast('Tarea creada');}catch(error){showToast(error.message,'warning');}});
$('#task-list')?.addEventListener('click',async e=>{const card=e.target.closest('[data-task-id]'),action=e.target.closest('[data-task-action]')?.dataset.taskAction;if(!card||!action)return;try{if(action==='done')setState(await api(`/api/tasks/${encodeURIComponent(card.dataset.taskId)}`,{method:'PUT',body:JSON.stringify({status:'done'})}));if(action==='delete'&&await confirmAction('Eliminar tarea','Se eliminará esta tarea.'))setState(await api(`/api/tasks/${encodeURIComponent(card.dataset.taskId)}`,{method:'DELETE'}));}catch(error){showToast(error.message,'warning');}});
$('#smart-alert-list')?.addEventListener('click',e=>{const id=e.target.closest('[data-alert-deal]')?.dataset.alertDeal;if(id){switchView('crm');openDrawer(id);}});
$('#new-objective-button')?.addEventListener('click',()=>{if(!['admin','manager','supervisor'].includes(appState.currentUser?.role))return showToast('Solo jefatura o gerencia puede crear metas','warning');const users=(appState.users||[]).filter(u=>u.active!==false&&u.role==='agent'&&(!appState.currentUser?.branchId||u.branchId===appState.currentUser.branchId));$('#objective-user').innerHTML='<option value="">Toda la sucursal</option>'+users.map(u=>`<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`).join('');$('#objective-form').reset();$('#objective-dialog').showModal();});
$('#objective-form')?.addEventListener('submit',async e=>{e.preventDefault();try{setState(await api('/api/objectives',{method:'POST',body:JSON.stringify({name:$('#objective-name').value,metric:$('#objective-metric').value,target:Number($('#objective-target').value),userId:$('#objective-user').value||null})}));$('#objective-dialog').close();}catch(error){showToast(error.message,'warning');}});
$('#objective-list')?.addEventListener('click',async e=>{const id=e.target.closest('[data-objective-delete]')?.dataset.objectiveDelete;if(!id)return;try{setState(await api(`/api/objectives/${encodeURIComponent(id)}`,{method:'DELETE'}));}catch(error){showToast(error.message,'warning');}});
$('#new-approval-button')?.addEventListener('click',()=>{$('#approval-form').reset();$('#approval-dialog').showModal();});$('#approval-form')?.addEventListener('submit',async e=>{e.preventDefault();try{setState(await api('/api/approvals',{method:'POST',body:JSON.stringify({title:$('#approval-title').value,detail:$('#approval-detail').value,amount:Number($('#approval-amount').value||0)})}));$('#approval-dialog').close();}catch(error){showToast(error.message,'warning');}});$('#approval-list')?.addEventListener('click',async e=>{const card=e.target.closest('[data-approval-id]'),decision=e.target.closest('[data-approval-action]')?.dataset.approvalAction;if(!card||!decision)return;try{setState(await api(`/api/approvals/${encodeURIComponent(card.dataset.approvalId)}/decision`,{method:'POST',body:JSON.stringify({decision})}));}catch(error){showToast(error.message,'warning');}});

$('#new-organization-node')?.addEventListener('click',()=>openOrganizationDialog());
$('#organization-form')?.addEventListener('submit',async event=>{event.preventDefault();const id=$('#organization-node-id').value;const payload={kind:$('#organization-kind').value,label:$('#organization-label').value,description:$('#organization-description').value,parentId:$('#organization-parent').value||null,userId:$('#organization-user').value||null,branchId:$('#organization-branch').value||null};try{await api(id?`/api/organization/nodes/${encodeURIComponent(id)}`:'/api/organization/nodes',{method:id?'PUT':'POST',body:JSON.stringify(payload)});$('#organization-dialog').close();await fetchOrganization();showToast(id?'Elemento actualizado':'Elemento agregado al organigrama');}catch(error){showToast(error.message,'warning');}});
$('#organization-canvas')?.addEventListener('click',async event=>{const card=event.target.closest('[data-organization-id]'),action=event.target.closest('[data-organization-action]')?.dataset.organizationAction;if(!card||!action||!organizationData)return;const node=organizationData.nodes.find(entry=>entry.id===card.dataset.organizationId);if(!node)return;if(action==='add')openOrganizationDialog(null,node.id);if(action==='edit')openOrganizationDialog(node);if(action==='delete'&&await confirmAction('Eliminar elemento',`Se eliminará ${node.label}. Sus dependientes deben moverse primero.`)){try{await api(`/api/organization/nodes/${encodeURIComponent(node.id)}`,{method:'DELETE'});await fetchOrganization();showToast('Elemento eliminado');}catch(error){showToast(error.message,'warning');}}});
$('#organization-fit')?.addEventListener('click',()=>{const canvas=$('#organization-canvas');if(!canvas)return;canvas.scrollTo({left:0,top:0,behavior:'smooth'});canvas.classList.toggle('compact');});
$$('[data-drawer-tab]').forEach(button=>button.addEventListener('click',()=>setDrawerPane(button.dataset.drawerTab)));
$('#master-company-select')?.addEventListener('change',event=>void selectMasterCompany(event.target.value,currentView));
$$('[data-master-view]').forEach(button=>button.addEventListener('click',()=>switchView(button.dataset.masterView)));

$$(".nav-item[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
$("#refresh-button").addEventListener("click", () => void poll());
$("#deal-search").addEventListener("input", renderBoard);
$("#deal-filter").addEventListener("change", renderBoard);
$("#stock-search").addEventListener("input", renderStock);
$("#instructions").addEventListener("input", updateInstructionCounter);
$("#report-branch")?.addEventListener("change", (event) => {
  reportBranchId = event.target.value || "all";
  reportUserId = "all";
  void fetchReports();
});
$("#report-period").addEventListener("change", (event) => {
  reportPeriod = Number(event.target.value);
  void fetchReports();
});
$("#report-user").addEventListener("change", (event) => {
  reportUserId = event.target.value || "all";
  void fetchReports();
});

$("#drive-stock-search").addEventListener("input", renderDriveStock);
$("#drive-sync-button").addEventListener("click", async () => {
  try {
    $("#drive-sync-button").disabled = true;
    driveOverview = await api("/api/shared-drive/sync", { method: "POST" });
    showToast("Drive sincronizado");
    await fetchDriveStatus();
  } catch (error) { showToast(error.message, "warning"); } finally { $("#drive-sync-button").disabled = false; }
});
$("#save-drive-settings").addEventListener("click", async () => {
  try {
    const next = await api("/api/shared-drive/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: $("#drive-enabled").checked, folderPath: $("#drive-folder-path").value, syncIntervalSeconds: Number($("#drive-sync-interval").value) }) });
    setState(next);
    showToast($("#drive-enabled").checked ? "Drive configurado y probado" : "Sincronización desactivada");
    await fetchDriveStatus();
  } catch (error) { showToast(error.message, "warning"); }
});
$("#drive-open-folder").addEventListener("click", async () => {
  const pathText = appState?.sharedDrive?.folderPath || $("#drive-folder-path").value;
  if (!pathText) return showToast("Todavía no hay una ruta configurada", "warning");
  try { await navigator.clipboard.writeText(pathText); showToast("Ruta copiada al portapapeles"); } catch { showToast(pathText); }
});

$("#new-reply-button").addEventListener("click", () => openReplyDialog());
$("#quick-replies-list").addEventListener("click", async (event) => {
  const card = event.target.closest("[data-reply-id]");
  const action = event.target.closest("[data-reply-action]")?.dataset.replyAction;
  if (!card || !action) return;
  const reply = (appState.quickReplies || []).find((entry) => entry.id === card.dataset.replyId);
  if (!reply) return;
  if (action === "edit") openReplyDialog(reply);
  if (action === "delete" && await confirmAction("Eliminar respuesta", `Se eliminará ${reply.title}.`)) {
    try { await mutate(`/api/quick-replies/${encodeURIComponent(reply.id)}`, "DELETE"); showToast("Respuesta eliminada"); }
    catch (error) { showToast(error.message, "warning"); }
  }
});

$("#reply-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#reply-id").value;
  const payload = { title: $("#reply-title").value, shortcut: $("#reply-shortcut").value, category: $("#reply-category").value, body: $("#reply-body").value, active: $("#reply-active").checked };
  try {
    await mutate(id ? `/api/quick-replies/${encodeURIComponent(id)}` : "/api/quick-replies", id ? "PUT" : "POST", payload);
    $("#reply-dialog").close();
    showToast(id ? "Respuesta actualizada" : "Respuesta creada");
  } catch (error) { showToast(error.message, "warning"); }
});


$("#new-assistant-document-button")?.addEventListener("click", () => openAssistantDocumentDialog());

$("#assistant-document-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("button[type='submit']", event.currentTarget);
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Guardando…";
  try {
    await uploadAssistantDocument();
    $("#assistant-document-dialog").close();
    showToast($("#assistant-document-id").value ? "Documento actualizado" : "Documento cargado para el Copiloto");
  } catch (error) {
    showToast(error.message, "warning");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

$("#assistant-document-list")?.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-assistant-document]");
  const action = event.target.closest("[data-document-action]")?.dataset.documentAction;
  if (!card || !action) return;
  const document = (appState.assistantDocuments || []).find((entry) => entry.id === card.dataset.assistantDocument);
  if (!document) return;
  if (action === "edit") return openAssistantDocumentDialog(document);
  if (action === "delete" && await confirmAction("Eliminar documento", `Se eliminará “${document.title}” de la biblioteca del Copiloto.`)) {
    try {
      await mutate(`/api/assistant/documents/${encodeURIComponent(document.id)}`, "DELETE");
      showToast("Documento eliminado");
    } catch (error) { showToast(error.message, "warning"); }
  }
});

$("#refresh-copilot")?.addEventListener("click", () => {
  const deal = (appState.deals || []).find((entry) => entry.id === selectedDealId);
  if (deal) void fetchCopilotSuggestion(deal, { force: true });
});

$("#edit-copilot")?.addEventListener("click", () => {
  if (!activeCopilotSuggestion?.reply) return;
  $("#manual-message").value = activeCopilotSuggestion.reply;
  resizeMessageComposer();
  $("#manual-message").focus();
});

$("#send-copilot")?.addEventListener("click", async () => {
  const deal = (appState.deals || []).find((entry) => entry.id === selectedDealId);
  if (!deal || !activeCopilotSuggestion?.reply) return;
  const button = $("#send-copilot");
  button.disabled = true;
  try {
    await mutate(`/api/deals/${encodeURIComponent(deal.id)}/message`, "POST", { text: activeCopilotSuggestion.reply });
    showToast("Sugerencia enviada por el agente");
  } catch (error) { showToast(error.message, "warning"); }
  finally { button.disabled = false; }
});

$("#copilot-documents")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-copilot-doc]");
  if (!button) return;
  const document = (appState.assistantDocuments || []).find((entry) => entry.id === button.dataset.copilotDoc)
    || activeCopilotSuggestion?.documents?.find((entry) => entry.id === button.dataset.copilotDoc);
  if (document) openPrepareDocumentDialog(document);
});

$("#prepare-document-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedDealId || !$("#prepare-document-id").value) return;
  const button = $("button[type='submit']", event.currentTarget);
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Preparando…";
  try {
    const result = await api(`/api/deals/${encodeURIComponent(selectedDealId)}/assistant-documents/${encodeURIComponent($("#prepare-document-id").value)}/send`, {
      method: "POST",
      body: JSON.stringify({
        requestDetails: $("#prepare-document-details").value,
        caption: $("#prepare-document-caption").value,
      }),
    });
    if (result.state) setState(result.state);
    $("#prepare-document-dialog").close();
    showToast(result.unmodified ? "Documento enviado sin modificar" : "Documento personalizado y enviado");
  } catch (error) { showToast(error.message, "warning"); }
  finally { button.disabled = false; button.textContent = original; }
});



$("#refresh-smart-data")?.addEventListener("click",()=>{const deal=(appState.deals||[]).find(x=>x.id===selectedDealId);if(deal)void fetchSmartDataSuggestions(deal,{force:true});});
$("#smart-data-list")?.addEventListener("click",async(event)=>{const button=event.target.closest("[data-smart-action]");if(!button)return;const row=button.closest("[data-smart-suggestion]"),deal=(appState.deals||[]).find(x=>x.id===selectedDealId);if(!row||!deal)return;const action=button.dataset.smartAction;button.disabled=true;try{const result=await api(`/api/deals/${encodeURIComponent(deal.id)}/data-suggestions/${encodeURIComponent(row.dataset.smartSuggestion)}/${action}`,{method:"POST",body:"{}"});smartDataSuggestionCache.set(smartDataCacheKey(deal),{suggestions:result.suggestions||[]});if(result.state)setState(result.state);const current=(appState.deals||[]).find(x=>x.id===deal.id)||deal;renderSmartDataSuggestions(current,true);showToast(action==="apply"?"Dato agregado a la ficha del cliente":"Recomendación descartada");}catch(error){showToast(error.message,"warning");}finally{button.disabled=false;}});
$("#save-smart-capture-settings")?.addEventListener("click",async()=>{const button=$("#save-smart-capture-settings"),original=button.textContent;button.disabled=true;button.textContent="Guardando…";try{await mutate("/api/settings","POST",{smartCapture:{enabled:$("#smart-capture-enabled").checked,autoApplySafe:$("#smart-capture-auto").checked,aiExtraction:$("#smart-capture-ai").checked,confidenceThreshold:Number($("#smart-capture-threshold").value||82),autoApplyConfidence:Number($("#smart-capture-auto-threshold").value||96)}});showToast("Captura inteligente configurada");}catch(error){showToast(error.message,"warning");}finally{button.disabled=false;button.textContent=original;}});

$("#open-client-profile-button").addEventListener("click", () => void openClientProfile());
$("#client-profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedClientProfileId) return;
  const payload = {
    entityType: $("#profile-entity-type")?.value || "person",
    branchChoiceMode: $("#profile-branch-choice-mode")?.value || "ask_when_multiple",
    name: $("#profile-name").value,
    document: $("#profile-document").value,
    ruc: $("#profile-ruc").value,
    marketingOptIn: $("#profile-marketing-optin").checked,
    customFields: collectDynamicCustomFields($("#profile-custom-fields")),
    company: $("#profile-company").value,
    email: $("#profile-email").value,
    city: $("#profile-city").value,
    address: $("#profile-address").value,
    age: Number($("#profile-age")?.value || 0),
    birthDate: $("#profile-birth-date")?.value || "",
    jobTitle: $("#profile-job-title")?.value || "",
    country: $("#profile-country")?.value || "",
    neighborhood: $("#profile-neighborhood")?.value || "",
    tags: $("#profile-tags").value.split(",").map((value) => value.trim()).filter(Boolean),
    notes: $("#profile-notes").value,
  };
  try {
    await mutate(`/api/clients/${encodeURIComponent(selectedClientProfileId)}`, "PUT", payload);
    $("#client-profile-dialog").close();
    showToast("Ficha del cliente actualizada");
  } catch (error) { showToast(error.message, "warning"); }
});
$("#client-history-list").addEventListener("click", (event) => {
  const row = event.target.closest("[data-history-deal]");
  if (!row) return;
  $("#client-profile-dialog").close();
  openDrawer(row.dataset.historyDeal);
});

$("#insert-quick-reply").addEventListener("click", () => {
  const deal = (appState.deals || []).find((entry) => entry.id === selectedDealId);
  const reply = (appState.quickReplies || []).find((entry) => entry.id === $("#drawer-quick-reply").value);
  if (deal && reply) {
    $("#manual-message").value = quickReplyText(reply, deal);
    resizeMessageComposer();
    $("#manual-message").focus();
  }
});
$("#send-quick-reply").addEventListener("click", async () => {
  const deal = (appState.deals || []).find((entry) => entry.id === selectedDealId);
  const reply = (appState.quickReplies || []).find((entry) => entry.id === $("#drawer-quick-reply").value);
  if (!deal || !reply) return;
  try {
    await mutate(`/api/deals/${encodeURIComponent(deal.id)}/message`, "POST", { text: quickReplyText(reply, deal) });
    showToast("Respuesta rápida enviada");
  } catch (error) { showToast(error.message, "warning"); }
});

$("#run-admin-command").addEventListener("click", async () => {
  const command = $("#admin-command").value.trim();
  if (!command) return;
  try {
    const result = await api("/api/admin-assistant", { method: "POST", body: JSON.stringify({ command }) });
    $("#admin-result").textContent = result.message || "Acción realizada.";
    $("#admin-command").value = "";
    if (result.state) setState(result.state);
    showToast(result.message || "Acción realizada");
  } catch (error) {
    $("#admin-result").textContent = error.message;
    showToast(error.message, "warning");
  }
});
$("#refresh-report-button").addEventListener("click", () => void fetchReports());
$("#print-report-button").addEventListener("click", () => window.print());
$("#waiting-risk").addEventListener("click", (event) => {
  const row = event.target.closest("[data-risk-deal]");
  if (row) openDrawer(row.dataset.riskDeal);
});
$("#inactivity-risk")?.addEventListener("click", (event) => {
  const row = event.target.closest("[data-risk-deal]");
  if (row) openDrawer(row.dataset.riskDeal);
});

$("#crm-board").addEventListener("click", (event) => {
  const card = event.target.closest("[data-deal-id]");
  if (card) openDrawer(card.dataset.dealId);
});

$$('[data-close-drawer]').forEach((button) => button.addEventListener("click", closeDrawer));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("#deal-drawer").classList.contains("open")) closeDrawer();
});

$("#connect-button").addEventListener("click", async () => {
  const button = $("#connect-button");
  button.disabled = true;
  button.textContent = "Generando…";
  try {
    const result = await api("/api/connect", { method:"POST", body:"{}" });
    if (result?.connection && appState) { appState.connection = result.connection; renderConnection(); }
    showToast("Preparando el código QR");
    switchView("whatsapp");
    schedulePoll(120);
  } catch (error) { showToast(error.message, "warning"); }
  finally { button.disabled = false; button.textContent = "▦ Generar código QR"; }
});

$("#unlink-button").addEventListener("click", async () => {
  if (!await confirmAction("Desvincular WhatsApp", "Se borrará la sesión vinculada y tendrás que escanear otro QR para reconectar.")) return;
  try { const result=await api("/api/disconnect",{method:"POST",body:"{}"}); if(result?.connection&&appState){appState.connection=result.connection;renderConnection();} showToast("Cuenta desvinculada"); schedulePoll(250); }
  catch (error) { showToast(error.message, "warning"); }
});

$("#whatsapp-mode").addEventListener("change", async (event) => {
  try {
    await mutate("/api/settings", "POST", { whatsappMode: event.target.value });
    settingsHydrated = false;
    hydrateSettings();
    showToast(event.target.value === "cloud" ? "Modo WhatsApp API seleccionado" : "Modo QR seleccionado");
  } catch (error) { showToast(error.message, "warning"); }
});

$("#save-whatsapp-api-button").addEventListener("click", async () => {
  const whatsappApi = {
    phoneNumberId: $("#wa-phone-number-id").value.trim(),
    businessAccountId: $("#wa-business-id").value.trim(),
    apiVersion: $("#wa-api-version").value.trim() || "v26.0",
  };
  if ($("#wa-access-token").value.trim()) whatsappApi.accessToken = $("#wa-access-token").value.trim();
  if ($("#wa-verify-token").value.trim()) whatsappApi.verifyToken = $("#wa-verify-token").value.trim();
  try {
    await mutate("/api/settings", "POST", { whatsappMode: "cloud", whatsappApi });
    settingsHydrated = false;
    hydrateSettings();
    showToast("Configuración de WhatsApp API guardada");
  } catch (error) { showToast(error.message, "warning"); }
});

$("#test-whatsapp-api-button").addEventListener("click", async () => {
  try { await mutate("/api/connect"); showToast("WhatsApp API activada"); }
  catch (error) { showToast(error.message, "warning"); }
});

$("#global-bot-toggle").addEventListener("click", async () => {
  try {
    await mutate("/api/settings", "POST", { botEnabled: appState.settings.botEnabled === false });
    showToast(appState.settings.botEnabled ? "Bot global activado" : "Bot global pausado");
  } catch (error) { showToast(error.message, "warning"); }
});

$("#save-bot-button").addEventListener("click", async () => {
  const instructions = $("#instructions").value.trim();
  const payload = {
    model: $("#model").value.trim() || "gpt-4.1-mini",
    botCanReserve: $("#bot-can-reserve").checked,
  };

  if (instructions) {
    if (instructions.length < 10)
      return showToast("Las instrucciones deben tener al menos 10 caracteres.", "warning");
    payload.instructions = instructions;
  }

  if ($("#api-key").value.trim())
    payload.apiKey = $("#api-key").value.trim();

  try {
    await mutate("/api/settings", "POST", payload);
    settingsHydrated = false;
    setState(await api("/api/state"), { hydrateSettings: true });
    showToast("Configuración del bot guardada");
  } catch (error) {
    showToast(error.message, "warning");
  }
});

$("#clear-key-button").addEventListener("click", async () => {
  if (!await confirmAction("Quitar clave", "El bot dejará de responder con inteligencia artificial hasta que guardes otra clave.")) return;
  try {
    await mutate("/api/settings", "POST", { clearApiKey: true });
    settingsHydrated = false;
    setState(await api("/api/state"), { hydrateSettings: true });
    showToast("Clave eliminada");
  } catch (error) {
    showToast(error.message, "warning");
  }
});

$("#deal-bot-toggle").addEventListener("click", async () => {
  const deal = appState.deals.find((entry) => entry.id === selectedDealId);
  if (!deal) return;
  try {
    const enabling = !deal.botActive;
    await mutate(`/api/deals/${encodeURIComponent(deal.id)}/bot`, "POST", { active: enabling });
    const current = appState.deals.find((entry) => entry.id === selectedDealId);
    showToast(current?.botActive ? "Bot automático reactivado para este cliente" : current?.botHumanHandoff ? "Modo Copiloto: la IA solo sugerirá respuestas" : "Bot pausado para este cliente");
  } catch (error) { showToast(error.message, "warning"); }
});

$("#assign-owner-button").addEventListener("click", async () => {
  if (!selectedDealId) return;
  try {
    await mutate(`/api/deals/${encodeURIComponent(selectedDealId)}/assign`, "POST", { userId: $("#drawer-owner-select").value || appState.currentUser?.id });
    showToast("Responsable actualizado");
  } catch (error) { showToast(error.message, "warning"); }
});

$$("[data-ai-rewrite]").forEach((button)=>button.addEventListener("click",async()=>{const box=$("#manual-message");const text=box.value.trim();if(!text)return showToast("Escribí primero un mensaje para mejorarlo","warning");try{button.disabled=true;const result=await api("/api/ai/rewrite",{method:"POST",body:JSON.stringify({text,tone:button.dataset.aiRewrite})});box.value=result.text||text;resizeMessageComposer();box.focus();showToast("Texto preparado por IA; revisalo antes de enviar");}catch(error){showToast(error.message,"warning");}finally{button.disabled=false;}}));
$("#open-ai-center-deal")?.addEventListener("click",()=>{if(selectedDealId){switchView("ai");requestAnimationFrame(()=>{if($("#ai-deal-select")){ $("#ai-deal-select").value=selectedDealId; renderAiCenter();}});}});

$("#message-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = $("#manual-message").value.trim();
  const dealId = selectedDealId;

  if (!text)
    return showToast("Escribí un mensaje.", "warning");

  if (!dealId)
    return showToast("Volvé a abrir la conversación antes de enviar.", "warning");

  const button = $("button", event.currentTarget);
  button.disabled = true;

  try {
    const next = await api(`/api/deals/${encodeURIComponent(dealId)}/message`, {
      method: "POST",
      body: JSON.stringify({ text })
    });

    setState(next);
    $("#manual-message").value = "";
    resizeMessageComposer();
    showToast("Mensaje enviado");
  } catch (error) {
    showToast(error.message, "warning");
  } finally {
    button.disabled = false;
  }
});

$("#manual-message").addEventListener("input", resizeMessageComposer);
$("#manual-message").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if ($("#manual-message").value.trim()) $("#message-form").requestSubmit();
});

$("#attach-button").addEventListener("click", () => $("#media-file").click());
$("#media-file").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 64 * 1024 * 1024) {
    event.target.value = "";
    return showToast("El archivo supera el límite de 64 MB", "warning");
  }
  pendingMedia = { file, kind: mediaKind(file), voiceNote: false, duration: 0 };
  renderMediaComposer();
});
$("#cancel-media-button").addEventListener("click", clearPendingMedia);
$("#media-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("button[type='submit']", event.currentTarget);
  button.disabled = true;
  button.textContent = "Enviando…";
  try {
    await uploadPendingMedia();
    clearPendingMedia();
    showToast("Archivo enviado; conversación en modo Copiloto");
  } catch (error) {
    showToast(error.message, "warning");
  } finally {
    button.disabled = false;
    button.textContent = "Enviar archivo";
  }
});
$("#record-audio-button").addEventListener("click", async () => {
  try { await toggleRecording(); }
  catch (error) { showToast(error.message, "warning"); }
});

$("#call-alert-open")?.addEventListener("click", () => {
  const dealId = $("#call-alert-open").dataset.dealId;
  if (dealId) openDrawer(dealId);
});
$("#dismiss-call-alert").addEventListener("click", () => {
  dismissedCallId = $("#call-alert").dataset.callId || null;
  $("#call-alert").hidden = true;
});

$("#show-reserve-form").addEventListener("click", () => {
  $("#reserve-form").hidden = !$("#reserve-form").hidden;
});

$("#reserve-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedDealId) return;
  try {
    await mutate(`/api/deals/${encodeURIComponent(selectedDealId)}/reserve`, "POST", {
      productId: $("#reserve-product").value,
      quantity: Number($("#reserve-quantity").value),
    });
    $("#reserve-form").hidden = true;
    $("#reserve-quantity").value = 1;
    showToast("Producto reservado y descontado del disponible");
  } catch (error) { showToast(error.message, "warning"); }
});

$("#reserved-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-item]");
  if (!button || !selectedDealId) return;
  if (!await confirmAction("Devolver reserva", "El producto volverá al stock disponible.")) return;
  try {
    await mutate(`/api/deals/${encodeURIComponent(selectedDealId)}/items/${encodeURIComponent(button.dataset.removeItem)}`, "DELETE");
    showToast("Reserva devuelta al stock");
  } catch (error) { showToast(error.message, "warning"); }
});

$("#mark-won-button").addEventListener("click", async () => {
  if (!selectedDealId || !await confirmAction("Marcar como ganado", "Las reservas se confirmarán como venta y la negociación se cerrará.")) return;
  try { await mutate(`/api/deals/${encodeURIComponent(selectedDealId)}/won`); showToast("Negociación ganada"); }
  catch (error) { showToast(error.message, "warning"); }
});

$("#mark-lost-button").addEventListener("click", () => {
  $("#lost-reason").innerHTML = (appState.settings.lossReasons || []).map((reason) => `<option value="${escapeHtml(reason.id)}">${escapeHtml(reason.name)}</option>`).join("");
  $("#lost-dialog").showModal();
});

$("#lost-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedDealId) return;
  try {
    await mutate(`/api/deals/${encodeURIComponent(selectedDealId)}/lost`, "POST", { reasonId: $("#lost-reason").value });
    $("#lost-dialog").close();
    showToast("Negociación cerrada; las reservas volvieron al stock");
  } catch (error) { showToast(error.message, "warning"); }
});

$("#new-client-button").addEventListener("click", () => {
  $("#client-form").reset();
  const user = appState.currentUser || {};
  const branches = (appState.branches || []).filter((branch) => branch.active !== false);
  $("#client-branch").innerHTML = branches.map((branch) => `<option value="${escapeHtml(branch.id)}">${escapeHtml(branch.name)}</option>`).join("");
  $("#client-branch").value = user.branchId || branches[0]?.id || "";
  $("#client-branch-row").hidden = user.role !== "admin";
  $("#client-limit-copy").textContent = `Tu límite es de ${Number(appState.currentUser?.clientDailyLimit || 0)} clientes por día.`;
  $("#client-dialog").showModal();
});

$("#client-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await mutate("/api/clients", "POST", { name: $("#client-name").value, phone: $("#client-phone").value, branchId: $("#client-branch").value || appState.currentUser?.branchId });
    $("#client-dialog").close();
    showToast("Cliente cargado y asignado a tu usuario");
  } catch (error) { showToast(error.message, "warning"); }
});

$("#import-stock-button").addEventListener("click", () => $("#stock-csv-file").click());
$("#stock-csv-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const response = await fetch("/api/products/import-csv", { method: "POST", headers: { "Content-Type": "text/csv;charset=utf-8" }, body: await file.text() });
    const raw = await response.text();
    const result = raw ? JSON.parse(raw) : {};
    if (!response.ok) throw new Error(result.error || "No se pudo importar el CSV.");
    setState(result);
    const summary = result.importResult || {};
    const errors = summary.errors?.length ? ` · ${summary.errors.length} fila(s) con observaciones` : "";
    showToast(`${Number(summary.created || 0)} productos nuevos y ${Number(summary.updated || 0)} actualizados${errors}`);
  } catch (error) { showToast(error.message, "warning"); }
  finally { event.target.value = ""; }
});

$("#new-product-button").addEventListener("click", () => openProductDialog());
$("#stock-table-body").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-product-action]");
  if (!button) return;
  const product = appState.products.find((entry) => entry.id === button.dataset.productId);
  if (!product) return;
  if (button.dataset.productAction === "edit") openProductDialog(product);
  if (button.dataset.productAction === "adjust") openAdjustDialog(product);
  if (button.dataset.productAction === "archive") {
    if (!await confirmAction("Archivar producto", `${product.name} dejará de aparecer para nuevas reservas.`)) return;
    try { await mutate(`/api/products/${encodeURIComponent(product.id)}`, "DELETE"); showToast("Producto archivado"); }
    catch (error) { showToast(error.message, "warning"); }
  }
});

$("#product-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#product-id").value;
  const payload = {
    name: $("#product-name").value,
    sku: $("#product-sku").value,
    description: $("#product-description").value,
    available: Number($("#product-available").value),
    minStock: Number($("#product-min").value),
    price: Number($("#product-price").value),
    customFields: collectDynamicCustomFields($("#product-custom-fields")),
  };
  try {
    await mutate(id ? `/api/products/${encodeURIComponent(id)}` : "/api/products", id ? "PUT" : "POST", payload);
    $("#product-dialog").close();
    showToast(id ? "Producto actualizado" : "Producto agregado");
  } catch (error) { showToast(error.message, "warning"); }
});

$("#adjust-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#adjust-product-id").value;
  try {
    await mutate(`/api/products/${encodeURIComponent(id)}/adjust`, "POST", { quantity: Number($("#adjust-quantity").value), note: $("#adjust-note").value });
    $("#adjust-dialog").close();
    showToast("Stock ajustado");
  } catch (error) { showToast(error.message, "warning"); }
});

$("#new-user-button").addEventListener("click", () => openUserDialog());
$("#users-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-user-edit]");
  if (!button) return;
  const user = (appState.users || []).find((entry) => entry.id === button.dataset.userEdit);
  if (user) openUserDialog(user);
});
$("#user-role").addEventListener("change", (event) => {
  const firstBranch = (appState.branches || []).find((branch) => branch.active !== false);
  const isAdmin = event.target.value === "admin";
  const isManager = event.target.value === "manager";
  const isSupervisor = event.target.value === "supervisor";
  if (!isAdmin && !$("#user-branch").value) $("#user-branch").value = firstBranch?.id || "";
  const permissionIds = ["#user-branch-reports", "#user-team-reports", "#user-global-reports", "#user-audit-reports", "#user-campaign-view", "#user-campaign-manage", "#user-custom-fields-manage", "#user-news-publish"];
  for (const id of permissionIds) $(id).disabled = isAdmin;
  if (isAdmin) for (const id of permissionIds) $(id).checked = true;
  else if (isManager || isSupervisor) { $("#user-branch-reports").checked = true; $("#user-team-reports").checked = true; $("#user-campaign-view").checked = true; $("#user-campaign-manage").checked = true; $("#user-news-publish").checked = true; }
});
$("#user-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setUserFormError("");
  const id = $("#user-id").value;
  const name = $("#user-name").value.trim();
  const username = $("#user-username").value.trim().toLowerCase();
  const password = $("#user-password").value;
  const role = $("#user-role").value;
  const branchId = $("#user-branch").value || null;

  let validationError = "";
  if (!name) validationError = "Ingresá el nombre del usuario.";
  else if (!id && !/^[a-z0-9._-]{3,80}$/.test(username)) validationError = "El usuario debe tener al menos 3 caracteres, sin espacios. Usá letras, números, punto, guion o guion bajo.";
  else if (!id && (password.length < 8 || password.length > 128)) validationError = "La contraseña debe tener entre 8 y 128 caracteres.";
  else if (password && (password.length < 8 || password.length > 128)) validationError = "La nueva contraseña debe tener entre 8 y 128 caracteres.";
  else if (role !== "admin" && !branchId) validationError = "Seleccioná una sucursal de trabajo para este usuario.";
  if (validationError) {
    setUserFormError(validationError);
    showToast(validationError, "warning");
    return;
  }

  const payload = {
    name,
    username,
    role,
    branchId,
    clientDailyLimit: Number($("#user-client-limit").value),
    branchReports: role === "admin" || $("#user-branch-reports").checked,
    teamReports: role === "admin" || $("#user-team-reports").checked,
    globalReports: role === "admin" || $("#user-global-reports").checked,
    auditReports: role === "admin" || $("#user-audit-reports").checked,
    campaignView: role === "admin" || $("#user-campaign-view").checked,
    campaignManage: role === "admin" || $("#user-campaign-manage").checked,
    customFieldsManage: role === "admin" || $("#user-custom-fields-manage").checked,
    newsPublish: role === "admin" || $("#user-news-publish").checked,
    active: $("#user-active").checked,
    whatsappLineIds: $$("#user-whatsapp-line-list input:checked").map((input) => input.value),
  };
  if (password) payload.password = password;
  const saveButton = $("#user-save-button");
  const originalLabel = saveButton?.textContent || "Guardar usuario";
  if (saveButton) { saveButton.disabled = true; saveButton.textContent = id ? "Actualizando…" : "Creando…"; }
  try {
    await mutate(id ? `/api/users/${encodeURIComponent(id)}` : "/api/users", id ? "PUT" : "POST", payload);
    $("#user-dialog").close();
    setUserFormError("");
    showToast(id ? "Usuario actualizado correctamente" : "Usuario creado correctamente");
  } catch (error) {
    const message = error?.message || "No se pudo guardar el usuario.";
    setUserFormError(message);
    showToast(message, "warning");
  } finally {
    if (saveButton) { saveButton.disabled = false; saveButton.textContent = originalLabel; }
  }
});

for (const selector of ["#user-name", "#user-username", "#user-password", "#user-role", "#user-branch"]) {
  $(selector)?.addEventListener("input", () => setUserFormError(""));
  $(selector)?.addEventListener("change", () => setUserFormError(""));
}

$("#new-branch-button").addEventListener("click", () => openBranchDialog());
$("#branches-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-branch-action]");
  if (!button) return;
  const card = button.closest("[data-branch-id]");
  const branch = branchById(card?.dataset.branchId);
  if (!branch) return;
  if (button.dataset.branchAction === "edit") return openBranchDialog(branch);
  button.disabled = true;
  try {
    if (button.dataset.branchAction === "connect") {
      await mutate(`/api/branches/${encodeURIComponent(branch.id)}/connect`);
      showToast(`Preparando WhatsApp de ${branch.name}`);
    } else if (button.dataset.branchAction === "disconnect") {
      if (!await confirmAction("Desvincular sucursal", `Se cerrará la sesión de WhatsApp de ${branch.name}.`)) return;
      await mutate(`/api/branches/${encodeURIComponent(branch.id)}/disconnect`);
      showToast(`WhatsApp de ${branch.name} desvinculado`);
    }
  } catch (error) { showToast(error.message, "warning"); }
  finally { button.disabled = false; }
});

$("#branch-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#branch-id").value;
  const payload = {
    name: $("#branch-name").value,
    code: $("#branch-code").value,
    city: $("#branch-city").value,
    address: $("#branch-address").value,
    phone: $("#branch-phone").value,
    weatherLocation: $("#branch-weather-location").value,
    timezone: $("#branch-timezone").value,
    introMessage: $("#branch-intro-message").value,
    active: $("#branch-active").checked,
  };
  try {
    await mutate(id ? `/api/branches/${encodeURIComponent(id)}` : "/api/branches", id ? "PUT" : "POST", payload);
    $("#branch-dialog").close();
    showToast(id ? "Sucursal actualizada" : "Sucursal creada");
  } catch (error) { showToast(error.message, "warning"); }
});

$("#transfer-conversation-button").addEventListener("click", openTransferDialog);
$("#transfer-type").addEventListener("change", updateTransferFields);
$("#transfer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const deal = (appState.deals || []).find((entry) => entry.id === selectedDealId);
  if (!deal) return;
  const type = $("#transfer-type").value;
  const payload = type === "user"
    ? { userId: $("#transfer-user").value }
    : {
        branchId: $("#transfer-branch").value,
        clientPhone: $("#transfer-client-phone").value,
        interest: $("#transfer-interest").value,
        reason: $("#transfer-reason").value,
        note: $("#transfer-note").value,
      };
  if (!(payload.userId || payload.branchId)) return showToast("Seleccioná un destino para la transferencia.", "warning");
  const destination = type === "user" ? $("#transfer-user option:checked")?.textContent : $("#transfer-branch option:checked")?.textContent;
  const confirmation = type === "branch"
    ? `Se creará inmediatamente una negociación de ${deal.name} en ${destination || "la sucursal destino"}. Se asignará un responsable de ese equipo y se utilizará el WhatsApp de esa sucursal.`
    : `El cliente ${deal.name} será transferido a ${destination || "el compañero seleccionado"}.`;
  if (!await confirmAction("Transferir conversación", confirmation)) return;
  try {
    await mutate(`/api/deals/${encodeURIComponent(deal.id)}/transfer`, "POST", payload);
    $("#transfer-dialog").close();
    if (type === "branch") closeDrawer();
    showToast(type === "branch" ? "Cliente derivado internamente a la sucursal destino" : "Conversación transferida al compañero");
  } catch (error) { showToast(error.message, "warning"); }
});

$$('[data-dialog-close]').forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

$("#save-automation-button").addEventListener("click", async () => {
  try {
    await mutate("/api/settings", "POST", {
      followup: { enabled: $("#followup-enabled").checked, value: Number($("#followup-value").value), unit: $("#followup-unit").value, message: $("#followup-message").value },
      autoClose: { enabled: $("#close-enabled").checked, value: Number($("#close-value").value), unit: $("#close-unit").value },
      heatMinutes: { warm: Number($("#heat-warm").value), hot: Number($("#heat-hot").value), red: Number($("#heat-red").value), critical: Number($("#heat-critical").value) },
    });
    settingsHydrated = false;
    hydrateSettings();
    showToast("Automatizaciones guardadas");
  } catch (error) { showToast(error.message, "warning"); }
});

$("#add-reason-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#new-reason").value.trim();
  if (!name) return;
  try {
    await mutate("/api/loss-reasons", "POST", { name });
    $("#new-reason").value = "";
    renderReasons();
    showToast("Motivo agregado");
  } catch (error) { showToast(error.message, "warning"); }
});

$("#reason-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-reason-action]");
  if (!button) return;
  const row = button.closest("[data-reason-id]");
  const id = row.dataset.reasonId;
  try {
    if (button.dataset.reasonAction === "save") {
      await mutate(`/api/loss-reasons/${encodeURIComponent(id)}`, "PUT", { name: $("input", row).value });
      showToast("Motivo actualizado");
    } else if (await confirmAction("Eliminar motivo", "Ya no aparecerá en los próximos cierres.")) {
      await mutate(`/api/loss-reasons/${encodeURIComponent(id)}`, "DELETE");
      showToast("Motivo eliminado");
    }
    renderReasons(true);
  } catch (error) { showToast(error.message, "warning"); }
});

document.addEventListener("click", (event) => {
  const templateButton = event.target.closest("[data-template]");
  if (templateButton) window.location.href = `/api/data/template/${encodeURIComponent(templateButton.dataset.template)}.csv`;
  const exportButton = event.target.closest("[data-export]");
  if (exportButton) window.location.href = `/api/data/export/${encodeURIComponent(exportButton.dataset.export)}.csv`;
  const importButton = event.target.closest("[data-import]");
  if (importButton) { dataImportType = importButton.dataset.import || ""; $("#data-import-file").click(); }
});

$("#data-import-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file || !dataImportType) return;
  try {
    const response = await fetch(`/api/data/import/${encodeURIComponent(dataImportType)}`, { method: "POST", headers: { "Content-Type": "text/csv;charset=utf-8" }, body: await file.text() });
    const raw = await response.text(); let result = {}; try { result = raw ? JSON.parse(raw) : {}; } catch { result = {}; }
    if (!response.ok) throw new Error(result.error || "No se pudo importar el archivo.");
    setState(result, { hydrateSettings: true });
    const summary = result.importResult || {};
    showToast(`${Number(summary.created || 0)} nuevos · ${Number(summary.updated || 0)} actualizados${summary.errors?.length ? ` · ${summary.errors.length} observaciones` : ""}`);
  } catch (error) { showToast(error.message, "warning"); }
  finally { event.target.value = ""; dataImportType = ""; }
});

$("#export-backup-button").addEventListener("click", () => { window.location.href = "/api/backup/export"; });
$("#import-backup-button").addEventListener("click", () => $("#backup-import-file").click());
$("#backup-import-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!await confirmAction("Restaurar respaldo completo", "La información actual será reemplazada por la del respaldo seleccionado. Solo continuá si este archivo corresponde a tu sistema.")) { event.target.value = ""; return; }
  try {
    const response = await fetch("/api/backup/import", { method: "POST", headers: { "Content-Type": "application/zip" }, body: file });
    const raw = await response.text(); let result = {}; try { result = raw ? JSON.parse(raw) : {}; } catch { result = {}; }
    if (!response.ok) throw new Error(result.error || "No se pudo restaurar el respaldo.");
    try { applyBranding(await api("/api/branding/public")); } catch {}
    showLogin(result.message || "Respaldo restaurado. Ingresá nuevamente.");
  } catch (error) { showToast(error.message, "warning"); }
  finally { event.target.value = ""; }
});

$("#save-branding-button").addEventListener("click", async () => {
  try {
    const next = await mutate("/api/branding", "POST", { systemName: $("#brand-system-name").value, shortName: $("#brand-short-name").value, subtitle: $("#brand-subtitle").value, primaryColor: $("#brand-primary-color").value, accentColor: $("#brand-accent-color").value, backgroundColor: $("#brand-background-color").value, sidebarColor: $("#brand-sidebar-color")?.value, surfaceColor: $("#brand-surface-color")?.value, textColor: $("#brand-text-color")?.value, fontStyle: $("#brand-font-style")?.value, radius: $("#brand-radius")?.value, logoFit: $("#brand-logo-fit")?.value, defaultTheme: $("#brand-default-theme")?.value, loginKicker: $("#brand-login-kicker")?.value, loginMessage: $("#brand-login-message")?.value, loginStyle: $("#brand-login-style")?.value, showSubtitle: $("#brand-show-subtitle")?.value !== "false" });
    settingsHydrated = false; applyBranding(next.branding || {}); hydrateSettings(); showToast("Identidad visual actualizada");
  } catch (error) { showToast(error.message, "warning"); }
});
$("#upload-brand-logo-button").addEventListener("click", () => $("#brand-logo-file").click());
$("#brand-logo-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error("El logo no puede superar 2 MB.");
    const response = await fetch("/api/branding/logo", { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
    const raw = await response.text(); let result = {}; try { result = raw ? JSON.parse(raw) : {}; } catch { result = {}; }
    if (!response.ok) throw new Error(result.error || "No se pudo subir el logo.");
    setState(result, { hydrateSettings: true }); applyBranding(result.branding || {}); showToast("Logo actualizado");
  } catch (error) { showToast(error.message, "warning"); }
  finally { event.target.value = ""; }
});
$("#remove-brand-logo-button").addEventListener("click", async () => {
  if (!await confirmAction("Quitar logo", "El sistema volverá a mostrar la inicial del nombre.")) return;
  try { const next = await mutate("/api/branding/logo", "DELETE"); settingsHydrated = false; applyBranding(next.branding || {}); hydrateSettings(); showToast("Logo eliminado"); }
  catch (error) { showToast(error.message, "warning"); }
});

$("#password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/password", { method: "POST", body: JSON.stringify({ current: $("#current-password").value, password: $("#new-password").value }) });
    event.currentTarget.reset();
    showLogin("Contraseña cambiada. Ingresá con la nueva contraseña.");
  } catch (error) { showToast(error.message, "warning"); }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const button = $("#install-app-button");
  if (button) button.hidden = false;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const button = $("#install-app-button");
  if (button) button.hidden = true;
  showToast("App instalada en el dispositivo");
});

$("#install-app-button")?.addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    $("#install-app-button").hidden = true;
    return;
  }
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  showToast(isiOS ? "En Safari: Compartir → Agregar a pantalla de inicio" : "Abrí el menú del navegador y elegí Instalar app", "warning");
});

$("#mobile-stage-tabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mobile-stage]");
  if (!button) return;
  mobileStage = button.dataset.mobileStage || "new";
  updateMobileStage();
  document.querySelector("#crm-board")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => null));
}

async function boot() {
  try {
    try { applyBranding(await api("/api/branding/public")); } catch {}
    const status = await api("/api/auth/status");
    if (!status.authenticated) return showLogin();
    showApp();
    setState(await api("/api/state"), { hydrateSettings: true });
    await hydrateMasterContext();
    const requestedView=new URLSearchParams(window.location.search).get("view");
    if(requestedView&&viewCopy[requestedView])switchView(requestedView);
  } catch (error) {
    showLogin(error.message);
  }
}

void boot().finally(() => schedulePoll(1200));
document.addEventListener("visibilitychange", () => { if (!document.hidden) schedulePoll(150); });

// V16 · interacción de marcación, automatización, campos y campañas.
$("#save-drawer-custom-fields")?.addEventListener("click", async () => {
  try { await saveDrawerCustomFields(); } catch (error) { showToast(error.message, "warning"); }
});

$$('[data-attendance-status]').forEach((button) => button.addEventListener("click", async () => {
  button.disabled = true;
  try {
    await mutate("/api/attendance/me", "POST", { status: button.dataset.attendanceStatus, reason: $("#attendance-reason")?.value || "" });
    showToast(`Estado actualizado: ${attendanceLabels[button.dataset.attendanceStatus] || button.dataset.attendanceStatus}`);
  } catch (error) { showToast(error.message, "warning"); }
  finally { button.disabled = false; }
}));

$("#new-bot-rule-button")?.addEventListener("click", () => openBotRuleDialog());
$("#bot-rules-list")?.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-bot-rule]"); const action = event.target.closest("[data-bot-rule-action]")?.dataset.botRuleAction;
  if (!card || !action) return;
  const rule = (appState.botInstructions || []).find((entry) => entry.id === card.dataset.botRule);
  if (!rule) return;
  if (action === "edit") return openBotRuleDialog(rule);
  if (action === "delete" && await confirmAction("Eliminar instrucción", `Se eliminará “${rule.name}”.`)) {
    try { await mutate(`/api/bot/instructions/${encodeURIComponent(rule.id)}`, "DELETE"); showToast("Instrucción eliminada"); } catch (error) { showToast(error.message,"warning"); }
  }
});
$("#bot-rule-form")?.addEventListener("submit", async (event) => {
  event.preventDefault(); const id=$("#bot-rule-id").value;
  const payload={ name:$("#bot-rule-name").value, instruction:$("#bot-rule-instruction").value, active:$("#bot-rule-active").checked };
  try { await mutate(id ? `/api/bot/instructions/${encodeURIComponent(id)}` : "/api/bot/instructions", id ? "PUT" : "POST", payload); $("#bot-rule-dialog").close(); showToast(id?"Instrucción actualizada":"Instrucción creada"); } catch(error){ showToast(error.message,"warning"); }
});
$("#save-bot-profiles")?.addEventListener("click", async () => {
  try { await mutate("/api/bot/profiles", "POST", { newClientInstructions:$("#bot-profile-new").value, knownClientInstructions:$("#bot-profile-known").value, ownerAwayInstructions:$("#bot-profile-away").value }); showToast("Protocolos del bot guardados"); } catch(error){ showToast(error.message,"warning"); }
});

$("#new-custom-field-button")?.addEventListener("click", () => openCustomFieldDialog());
$("#custom-fields-list")?.addEventListener("click", async (event) => {
  const card=event.target.closest("[data-custom-field-id]"); const action=event.target.closest("[data-custom-field-action]")?.dataset.customFieldAction;
  if(!card||!action)return; const field=(appState.customFieldDefinitions||[]).find((entry)=>entry.id===card.dataset.customFieldId); if(!field)return;
  if(action==="edit") return openCustomFieldDialog(field);
  if(action==="delete" && await confirmAction("Desactivar campo", `El campo “${field.label}” dejará de mostrarse, pero los valores guardados no se borrarán.`)) { try{ await mutate(`/api/custom-fields/${encodeURIComponent(field.id)}`,"DELETE"); showToast("Campo desactivado"); }catch(error){showToast(error.message,"warning");} }
});
$("#custom-field-form")?.addEventListener("submit", async (event)=>{
  event.preventDefault(); const id=$("#custom-field-id").value;
  const payload={ entity:$("#custom-field-entity").value, type:$("#custom-field-type").value, label:$("#custom-field-label").value, key:$("#custom-field-key").value, context:$("#custom-field-context").value, options:$("#custom-field-options").value, botReadable:$("#custom-field-readable").checked, botWritable:$("#custom-field-writable").checked, required:$("#custom-field-required").checked };
  try{ await mutate(id?`/api/custom-fields/${encodeURIComponent(id)}`:"/api/custom-fields",id?"PUT":"POST",payload); $("#custom-field-dialog").close(); showToast(id?"Campo actualizado":"Campo creado"); }catch(error){showToast(error.message,"warning");}
});

$("#new-campaign-button")?.addEventListener("click", async ()=>{ if(!campaignCatalog.campaigns?.length && currentView==="campaigns") await fetchCampaigns(); openCampaignDialog(); });
$("#preview-campaign-button")?.addEventListener("click", async ()=>{
  try{ const payload=campaignFormPayload(); const preview=await api("/api/campaigns/preview",{method:"POST",body:JSON.stringify({branchId:payload.branchId,lineId:payload.lineId,filters:payload.filters})}); $("#campaign-preview").innerHTML=`<span>✓</span><div><strong>${Number(preview.count||0).toLocaleString("es-PY")} clientes elegibles</strong><small>${preview.optedInRequired?"Solo incluye clientes con consentimiento registrado.":"Consentimiento no exigido por configuración."}${preview.sample?.length?` · Muestra: ${preview.sample.slice(0,3).map(e=>escapeHtml(e.name)).join(", ")}`:""}</small></div>`; }catch(error){showToast(error.message,"warning");}
});
$("#campaign-form")?.addEventListener("submit",async(event)=>{
  event.preventDefault(); try{ const result=await api("/api/campaigns",{method:"POST",body:JSON.stringify(campaignFormPayload())}); if(result.state)setState(result.state); $("#campaign-dialog").close(); await fetchCampaigns(); showToast("Campaña creada en borrador"); }catch(error){showToast(error.message,"warning");}
});
$("#campaign-list")?.addEventListener("click",async(event)=>{
  const card=event.target.closest("[data-campaign-id]"); const action=event.target.closest("[data-campaign-action]")?.dataset.campaignAction; if(!card||!action)return; const id=card.dataset.campaignId;
  try{
    if(action==="start"){ await api(`/api/campaigns/${encodeURIComponent(id)}/start`,{method:"POST",body:"{}"}); showToast("Campaña iniciada"); }
    if(action==="pause"){ await api(`/api/campaigns/${encodeURIComponent(id)}/pause`,{method:"POST",body:JSON.stringify({reason:"Pausada manualmente."})}); showToast("Campaña pausada"); }
    if(action==="delete"){ if(!await confirmAction("Eliminar campaña","Se eliminará la campaña y su detalle de ejecución."))return; await api(`/api/campaigns/${encodeURIComponent(id)}`,{method:"DELETE"}); showToast("Campaña eliminada"); }
    await fetchCampaigns();
  }catch(error){showToast(error.message,"warning");}
});
$("#save-campaign-safety")?.addEventListener("click", async () => {
  try {
    await mutate("/api/campaign-safety", "POST", { qrDailyLimitPerBranch:Number($("#campaign-qr-daily-limit").value||25), qrIntervalSeconds:Number($("#campaign-qr-interval").value||90), qrClientCooldownDays:Number($("#campaign-qr-cooldown").value||0), qrStartHour:Number($("#campaign-qr-start-hour").value||8), qrEndHour:Number($("#campaign-qr-end-hour").value||19), requireOptIn:true, stopOnProviderError:true });
    campaignCatalog.safety = appState.settings?.campaignSafety || campaignCatalog.safety;
    renderCampaigns();
    showToast("Protección de campañas actualizada");
  } catch(error) { showToast(error.message,"warning"); }
});
$("#campaign-branch")?.addEventListener("change", () => {
  const branchId=$("#campaign-branch").value;
  const eligible=(appState.users||[]).filter(entry=>entry.active!==false&&entry.role!=="admin"&&(!branchId||entry.branchId===branchId));
  $("#campaign-filter-owner").innerHTML=`<option value="all">Cualquier responsable</option>`+eligible.map(entry=>`<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</option>`).join("");
  const lines=(appState.whatsappLines||[]).filter(line=>line.active!==false&&line.canUse!==false).sort((a,b)=>Number(b.branchId===branchId)-Number(a.branchId===branchId)||String(a.name||"").localeCompare(String(b.name||""),"es"));
  if($("#campaign-line")){ $("#campaign-line").innerHTML=lines.length?lines.map(line=>`<option value="${escapeHtml(line.id)}">${escapeHtml(line.name)} · ${escapeHtml(line.phone||line.connection?.account||"Sin número")}</option>`).join(""):`<option value="">Sin línea habilitada</option>`; const preferred=lines.find(line=>line.branchId===branchId&&line.isDefault)||lines[0]; if(preferred)$("#campaign-line").value=preferred.id; }
});


// V17 · barra operativa, clima, presencia y noticias internas.
$("#header-attendance-select")?.addEventListener("change", async (event)=>{ try{ await mutate("/api/attendance/me","POST",{status:event.target.value,reason:appState.currentUser?.attendance?.reason||""}); showToast(`Estado: ${attendanceLabels[event.target.value]||event.target.value}`); }catch(error){showToast(error.message,"warning");} });
$("#presence-button")?.addEventListener("click",()=>{renderPresenceDialog();$("#presence-dialog").showModal();});
$("#weather-pill")?.addEventListener("click",()=>void fetchHeaderOperations(true));
$("#new-news-button")?.addEventListener("click",openNewsDialog);
$("#news-audience-mode")?.addEventListener("change",updateNewsAudience); $("#news-branch")?.addEventListener("change",updateNewsAudience);
$("#news-form")?.addEventListener("submit",async(event)=>{event.preventDefault();const mode=$("#news-audience-mode").value;const userIds=[...$("#news-users")?.selectedOptions||[]].map(o=>o.value);try{const result=await api("/api/news",{method:"POST",body:JSON.stringify({title:$("#news-title").value,body:$("#news-body").value,priority:$("#news-priority").value,pinned:$("#news-pinned").checked,audienceMode:mode,branchIds:mode==="branch"||mode==="users"?[$("#news-branch").value]:[],userIds})});let state=result.state;if(result.news){for(const file of [...($("#news-files").files||[])].slice(0,8)){const res=await fetch(`/api/news/${encodeURIComponent(result.news.id)}/attachments`,{method:"POST",headers:{"Content-Type":file.type||"application/octet-stream","X-File-Name":encodeURIComponent(file.name)},body:file});const raw=await res.text();const parsed=raw?JSON.parse(raw):{};if(!res.ok)throw new Error(parsed.error||`No se pudo adjuntar ${file.name}`);state=parsed.state||state;}}if(state)setState(state);$("#news-dialog").close();showToast("Noticia publicada");}catch(error){showToast(error.message,"warning");}});
$("#news-feed")?.addEventListener("click",async(event)=>{const card=event.target.closest("[data-news-id]");const action=event.target.closest("[data-news-action]")?.dataset.newsAction;if(!card||!action)return;try{if(action==="read"){await api(`/api/news/${encodeURIComponent(card.dataset.newsId)}/read`,{method:"POST",body:"{}"});const n=(appState.news||[]).find(x=>x.id===card.dataset.newsId);if(n)n.read=true;appState.newsUnreadCount=(appState.news||[]).filter(x=>!x.read).length;renderNews();}if(action==="delete"&&await confirmAction("Eliminar noticia","La noticia y sus archivos adjuntos serán eliminados.")){setState(await api(`/api/news/${encodeURIComponent(card.dataset.newsId)}`,{method:"DELETE"}));showToast("Noticia eliminada");}}catch(error){showToast(error.message,"warning");}});
$("#ops-branch")?.addEventListener("change",renderOperationsAdmin);
$("#save-operations-settings")?.addEventListener("click",async()=>{try{await mutate("/api/operations/settings","POST",{branchId:$("#ops-branch").value,timezone:$("#ops-timezone").value,weatherLocation:$("#ops-weather-location").value,weatherLatitude:$("#ops-weather-lat").value,weatherLongitude:$("#ops-weather-lon").value,weatherEnabled:$("#ops-weather-enabled").checked,weatherRefreshMinutes:Number($("#ops-weather-refresh").value||15),supportMessage:$("#ops-support-message").value,incident:{enabled:$("#ops-incident-enabled").value==="true",severity:$("#ops-incident-severity").value,title:$("#ops-incident-title").value,message:$("#ops-incident-message").value}});await fetchHeaderOperations(true);showToast("Configuración operativa guardada");}catch(error){showToast(error.message,"warning");}});
$("#test-weather-button")?.addEventListener("click",async()=>{try{await api("/api/operations/settings",{method:"POST",body:JSON.stringify({branchId:$("#ops-branch").value,timezone:$("#ops-timezone").value,weatherLocation:$("#ops-weather-location").value,weatherLatitude:$("#ops-weather-lat").value,weatherLongitude:$("#ops-weather-lon").value})});await fetchHeaderOperations(true);showToast(headerOperations?.weather?.ok?`Clima actualizado: ${Math.round(headerOperations.weather.temperature)}° · ${headerOperations.weather.label}`:"No se pudo obtener el clima","warning");}catch(error){showToast(error.message,"warning");}});
window.setInterval(()=>{if(authenticated)void fetchHeaderOperations(false);},60000);


// V19 · Microinteracciones globales
window.addEventListener("click", (event) => {
  if (!motionEnabled("buttonMotion")) return;
  const button = event.target.closest("button,.button,.nav-item"); if (!button) return;
  const rect = button.getBoundingClientRect(); const ripple = document.createElement("i"); ripple.className="ui-ripple"; ripple.style.left=`${event.clientX-rect.left}px`; ripple.style.top=`${event.clientY-rect.top}px`; button.appendChild(ripple); window.setTimeout(()=>ripple.remove(),650);
}, { passive:true });
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) { applyExperienceSettings(); setupLiveActivity(); } });
