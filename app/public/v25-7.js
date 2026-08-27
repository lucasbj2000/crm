(() => {
  "use strict";

  const NativeMutationObserver = window.MutationObserver;

  function loadCore() {
    const script = document.createElement("script");
    script.src = "/v25-7-core.js?v=2571";
    script.async = false;
    script.dataset.v257Core = "1";
    script.onerror = () => console.error("V25.7: no se pudo cargar el núcleo de interfaz.");
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
        console.warn("V25.7: observador global bloqueado para evitar congelamiento de la interfaz.");
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
  script.src = "/v25-7-core.js?v=2571";
  script.async = false;
  script.dataset.v257Core = "1";
  const restore = () => {
    if (window.MutationObserver === V257SafeMutationObserver) window.MutationObserver = NativeMutationObserver;
  };
  script.onload = restore;
  script.onerror = () => {
    restore();
    console.error("V25.7: no se pudo cargar el núcleo de interfaz.");
  };
  document.head.appendChild(script);
})();
