(() => {
  "use strict";
  if (window.__v2521ObserverGuardInstalled) return;
  const NativeMutationObserver = window.MutationObserver;
  if (typeof NativeMutationObserver !== "function") return;

  class V2521GuardedMutationObserver {
    constructor(callback) {
      this._native = new NativeMutationObserver(callback);
    }
    observe(target, options) {
      const isCrmBoard = target?.id === "crm-board";
      const isRecursiveBoardWatch = isCrmBoard && options?.childList === true && options?.subtree === true;
      if (isRecursiveBoardWatch) return;
      this._native.observe(target, options);
    }
    disconnect() { this._native.disconnect(); }
    takeRecords() { return this._native.takeRecords(); }
  }

  window.MutationObserver = V2521GuardedMutationObserver;
  window.__v2521ObserverGuardInstalled = true;
})();
