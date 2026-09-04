(() => {
  "use strict";

  const root = document.documentElement;
  root.classList.add("v2614-fast-ui");

  let longTaskCount = 0;
  let windowStartedAt = performance.now();

  function degradeMotionIfNeeded() {
    const now = performance.now();
    if (now - windowStartedAt > 8000) {
      longTaskCount = 0;
      windowStartedAt = now;
    }
    longTaskCount += 1;
    if (longTaskCount >= 3) root.classList.add("v2614-low-motion");
  }

  try {
    if ("PerformanceObserver" in window && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (entry.duration >= 80) degradeMotionIfNeeded();
      });
      observer.observe({ type: "longtask", buffered: true });
    }
  } catch {}

  if ((navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) || (navigator.deviceMemory && navigator.deviceMemory <= 2)) {
    root.classList.add("v2614-low-motion");
  }
})();
