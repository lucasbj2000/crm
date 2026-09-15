(() => {
  "use strict";

  const QUIET_ENDPOINTS = new Set([
    "/api/omnichannel/inbox",
    "/api/social/oauth/config",
  ]);
  const RETRY_ENDPOINTS = new Set([
    "/api/live",
    "/api/state",
    "/api/omnichannel/inbox",
    "/api/social/oauth/config",
  ]);
  let lastBackgroundFailureAt = 0;
  let installed = false;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pathOf = (url) => {
    try { return new URL(String(url || ""), window.location.href).pathname; }
    catch { return String(url || "").split("?")[0]; }
  };

  function transientNetworkError(error) {
    const text = String(error?.message || error || "").toLowerCase();
    return text.includes("failed to fetch")
      || text.includes("networkerror")
      || text.includes("network request failed")
      || text.includes("load failed")
      || text.includes("fetch failed");
  }

  async function quietRequest(url, options = {}) {
    const next = { credentials: "same-origin", cache: "no-store", ...options };
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(url, next);
        const raw = await response.text();
        let result = {};
        try { result = raw ? JSON.parse(raw) : {}; } catch { result = {}; }
        if (!response.ok) {
          const fallback = raw && !raw.trim().startsWith("<") ? raw.trim().slice(0, 300) : `Error HTTP ${response.status}`;
          const error = new Error(result.error || result.message || fallback || "No se pudo completar la sincronización.");
          error.v26181Http = true;
          error.status = response.status;
          throw error;
        }
        return result;
      } catch (error) {
        if (error?.v26181Http === true || !transientNetworkError(error)) throw error;
        lastBackgroundFailureAt = Date.now();
        lastError = error;
        if (attempt === 0) await wait(550);
      }
    }
    throw lastError || new Error("Failed to fetch");
  }

  function installApiWrapper() {
    const current = window.api;
    if (typeof current !== "function" || current.__v26181FetchStability) return;

    const wrapped = async function(url, options = {}, ...rest) {
      const path = pathOf(url);
      if (QUIET_ENDPOINTS.has(path)) return quietRequest(url, options);

      if (RETRY_ENDPOINTS.has(path)) {
        try {
          return await current.call(this, url, options, ...rest);
        } catch (error) {
          if (!transientNetworkError(error)) throw error;
          lastBackgroundFailureAt = Date.now();
          await wait(550);
          try {
            return await current.call(this, url, options, ...rest);
          } catch (secondError) {
            if (transientNetworkError(secondError)) lastBackgroundFailureAt = Date.now();
            throw secondError;
          }
        }
      }

      return current.call(this, url, options, ...rest);
    };

    wrapped.__v26181FetchStability = true;
    if (current.__v266SilentTracker) wrapped.__v266SilentTracker = true;
    wrapped.__v266Original = current.__v266Original || current;
    window.api = wrapped;
  }

  function installToastGuard() {
    const current = window.showToast;
    if (typeof current !== "function" || current.__v26181FetchStability) return;

    const wrapped = function(message, tone = "success", ...rest) {
      const recentBackgroundFailure = Date.now() - lastBackgroundFailureAt < 5000;
      if (tone === "warning" && recentBackgroundFailure && transientNetworkError({ message })) return;
      return current.call(this, message, tone, ...rest);
    };
    wrapped.__v26181FetchStability = true;
    window.showToast = wrapped;
  }

  function install() {
    installApiWrapper();
    installToastGuard();
    document.documentElement.classList.add("v26181-fetch-stable");
    if (installed) return;
    installed = true;
    window.addEventListener("crm:state", () => requestAnimationFrame(install));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) requestAnimationFrame(install); });
  }

  function boot() {
    install();
    setTimeout(install, 300);
    setTimeout(install, 1200);
    setTimeout(install, 3000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
