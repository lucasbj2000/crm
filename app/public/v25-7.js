(() => {
  "use strict";

  const NativeMutationObserver = window.MutationObserver;

  function installLegacySelectorCompatibility() {
    const resolveRoot = (value) => {
      const selector = String(value || "").trim();
      if (!selector || !/^[#.[a-zA-Z]/.test(selector)) return null;
      try { return document.querySelector(selector); } catch { return null; }
    };

    if (typeof String.prototype.querySelectorAll !== "function") {
      Object.defineProperty(String.prototype, "querySelectorAll", {
        configurable: true,
        enumerable: false,
        writable: true,
        value(selector) {
          const root = resolveRoot(this);
          return root ? root.querySelectorAll(selector) : [];
        },
      });
    }

    if (typeof String.prototype.querySelector !== "function") {
      Object.defineProperty(String.prototype, "querySelector", {
        configurable: true,
        enumerable: false,
        writable: true,
        value(selector) {
          const root = resolveRoot(this);
          return root ? root.querySelector(selector) : null;
        },
      });
    }
  }

  function installV258ApiCompatibility() {
    const original = window.api;
    if (typeof original !== "function" || original.__v258JsonBody) return;
    const wrapped = function(url, options = {}) {
      const next = { ...options };
      if (next.body && typeof next.body === "object" && !(next.body instanceof FormData)) {
        next.body = JSON.stringify(next.body);
      }
      return original.call(this, url, next);
    };
    wrapped.__v258JsonBody = true;
    window.api = wrapped;
  }

  function loadV259Assets() {
    if (!document.querySelector("link[data-v259]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/v25-9.css?v=2590";
      link.dataset.v259 = "1";
      document.head.appendChild(link);
    }
    if (!document.querySelector("script[data-v259]")) {
      const script = document.createElement("script");
      script.src = "/v25-9.js?v=2590";
      script.async = false;
      script.dataset.v259 = "1";
      document.head.appendChild(script);
    }
  }

  function loadV258Assets() {
    installV258ApiCompatibility();
    if (!document.querySelector("link[data-v258]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/v25-8.css?v=2580";
      link.dataset.v258 = "1";
      document.head.appendChild(link);
    }
    if (!document.querySelector("script[data-v2581]")) {
      const hotfix = document.createElement("script");
      hotfix.src = "/v25-8-1.js?v=2581";
      hotfix.async = false;
      hotfix.dataset.v2581 = "1";
      document.head.appendChild(hotfix);
    }
    if (!document.querySelector("script[data-v258]")) {
      const script = document.createElement("script");
      script.src = "/v25-8.js?v=2581";
      script.async = false;
      script.dataset.v258 = "1";
      document.head.appendChild(script);
    }
    loadV259Assets();
  }

  installLegacySelectorCompatibility();

  function loadCore() {
    const script = document.createElement("script");
    script.src = "/v25-7-core.js?v=2572";
    script.async = false;
    script.dataset.v257Core = "1";
    script.onload = loadV258Assets;
    script.onerror = () => console.error("V25.7.2: no se pudo cargar el núcleo de interfaz.");
    document.head.appendChild(script);
  }

  if (typeof NativeMutationObserver !== "function") {
    loadCore();
    return;
  }

  class V257SafeMutationObserver {
    constructor(callback) {
      this.nativeObserver = new NativeMutationObserver(callback);
    }

    observe(target, options = {}) {
      const filter = Array.isArray(options.attributeFilter) ? options.attributeFilter : [];
      const isUnsafeGlobalObserver = target === document.body
        && options.subtree === true
        && options.childList === true
        && options.attributes === true
        && filter.includes("class")
        && filter.includes("open")
        && filter.includes("aria-hidden");

      if (isUnsafeGlobalObserver) {
        console.warn("V25.7.2: observador global bloqueado para evitar congelamiento de la interfaz.");
        return;
      }

      return this.nativeObserver.observe(target, options);
    }

    disconnect() {
      return this.nativeObserver.disconnect();
    }

    takeRecords() {
      return this.nativeObserver.takeRecords();
    }
  }

  window.MutationObserver = V257SafeMutationObserver;

  const script = document.createElement("script");
  script.src = "/v25-7-core.js?v=2572";
  script.async = false;
  script.dataset.v257Core = "1";
  const restore = () => {
    if (window.MutationObserver === V257SafeMutationObserver) window.MutationObserver = NativeMutationObserver;
  };
  script.onload = () => {
    restore();
    loadV258Assets();
  };
  script.onerror = () => {
    restore();
    console.error("V25.7.2: no se pudo cargar el núcleo de interfaz.");
  };
  document.head.appendChild(script);
})();
