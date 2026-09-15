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

  function loadV26182() {
    if (document.querySelector("script[data-v26182]")) return;
    const script = document.createElement("script");
    script.src = "/v26-18-2.js?v=26182";
    script.async = false;
    script.dataset.v26182 = "1";
    document.head.appendChild(script);
  }

  function loadV26181() {
    const existing = document.querySelector("script[data-v26181]");
    if (existing) {
      loadV26182();
      return;
    }
    const script = document.createElement("script");
    script.src = "/v26-18-1.js?v=26181";
    script.async = false;
    script.dataset.v26181 = "1";
    script.onload = loadV26182;
    script.onerror = loadV26182;
    document.head.appendChild(script);
  }

  const existingV2617 = document.querySelector("script[data-v2617]");
  if (!existingV2617) {
    const script = document.createElement("script");
    script.src = "/v26-17.js?v=26170";
    script.async = false;
    script.dataset.v2617 = "1";
    script.onload = loadV26181;
    script.onerror = loadV26181;
    document.head.appendChild(script);
  } else if (existingV2617.dataset.v26181Chained !== "1") {
    existingV2617.dataset.v26181Chained = "1";
    existingV2617.addEventListener("load", loadV26181, { once: true });
    setTimeout(loadV26181, 250);
  } else {
    loadV26181();
  }
})();
