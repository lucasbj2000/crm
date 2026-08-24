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
    co