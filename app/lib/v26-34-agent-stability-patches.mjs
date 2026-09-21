const CORE_MARKER = "// V26.34 CONTROLLED_DEAL_SEARCH";

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`V26.34 UI: no se encontró ${label}.`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`V26.34 UI: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

export function applyV2634CoreUiPatches(source) {
  if (source.includes(CORE_MARKER)) return source;
  let patched = source;

  patched = replaceOnce(
    patched,
    "let masterContext = null;",
    `let masterContext = null;
let dealSearchQuery = "";`,
    "estado principal del buscador",
  );

  patched = replaceOnce(
    patched,
    `function renderBoard() {
  const search = $("#deal-search").value.trim().toLowerCase();`,
    `function renderBoard() {
  const searchInput = $("#deal-search");
  if (searchInput && searchInput.value !== dealSearchQuery) searchInput.value = dealSearchQuery;
  const search = dealSearchQuery.trim().toLowerCase();`,
    "lectura controlada del buscador",
  );

  patched = replaceOnce(
    patched,
    `$("#deal-search").addEventListener("input", () => { renderBoard(); v2621SyncBulkDealUi(); });`,
    `const v2634DealSearchInput = $("#deal-search");
const v2634UpdateDealSearch = () => {
  dealSearchQuery = String(v2634DealSearchInput?.value || "");
  renderBoard();
  v2621SyncBulkDealUi();
};
v2634DealSearchInput?.addEventListener("input", v2634UpdateDealSearch);
v2634DealSearchInput?.addEventListener("search", v2634UpdateDealSearch);`,
    "listener de búsqueda transformado por V26.21",
  );

  patched = replaceOnce(
    patched,
    `async function boot() {
  try {
    try { applyBranding(await api("/api/branding/public")); } catch {}
    const status = await api("/api/auth/status");
    if (!status.authenticated) return showLogin();
    showApp();
    setState(await api("/api/state"), { hydrateSettings: true });`,
    `async function boot() {
  try {
    try { applyBranding(await api("/api/branding/public")); } catch {}
    const status = await api("/api/auth/status");
    if (!status.authenticated) return showLogin();
    showApp();
    dealSearchQuery = "";
    if ($("#deal-search")) $("#deal-search").value = "";
    setState(await api("/api/state"), { hydrateSettings: true });`,
    "reinicio del buscador dentro de boot",
  );

  patched = replaceOnce(
    patched,
    `void boot().finally(() => schedulePoll(1200));`,
    `void boot().finally(() => schedulePoll(1200));
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  dealSearchQuery = "";
  if ($("#deal-search")) $("#deal-search").value = "";
  if (appState) { renderBoard(); v2621SyncBulkDealUi(); }
});`,
    "limpieza de búsqueda restaurada por bfcache",
  );

  return patched + "\n" + CORE_MARKER + "\n";
}
