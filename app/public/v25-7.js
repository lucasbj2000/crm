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

  function loadV258Assets() {
    if (!document.querySelector("link[data-v258]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/v25-8.css?v=2580";
      link.dataset.v258 = "1";
      document.head.appendChild(link);
    }
    if (!document.querySelector("script[data-v258]")) {
      const script = document.createElement("script");
      script.src = "/v25-8.js?v=2580";
      script.async = false;
      script.dataset.v258 = "1";
      document.head.appendChild(script);
    }
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
