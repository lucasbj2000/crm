(() => {
  "use strict";

  const nativeOpen = window.open.bind(window);

  function createPdfPrintFrame() {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("title", "Generador temporal de PDF");
    frame.style.position = "fixed";
    frame.style.left = "-10000px";
    frame.style.top = "0";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    frame.style.border = "0";
    document.body.appendChild(frame);

    const printWindow = frame.contentWindow;
    if (!printWindow) {
      frame.remove();
      return null;
    }

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      frame.remove();
    };

    printWindow.addEventListener("afterprint", () => setTimeout(cleanup, 0), { once: true });
    window.setTimeout(cleanup, 120000);
    return printWindow;
  }

  if (window.open?.__v2581PdfBridge) return;

  const bridgedOpen = function(url = "", target = "", features = "") {
    const normalizedUrl = String(url ?? "");
    const normalizedTarget = String(target ?? "");
    const normalizedFeatures = String(features ?? "");
    const isV258PdfWindow = normalizedUrl === ""
      && normalizedTarget === "_blank"
      && /noopener/i.test(normalizedFeatures)
      && /noreferrer/i.test(normalizedFeatures);

    if (isV258PdfWindow) {
      const printWindow = createPdfPrintFrame();
      if (printWindow) return printWindow;
    }

    return nativeOpen(url, target, features);
  };

  bridgedOpen.__v2581PdfBridge = true;
  window.open = bridgedOpen;
})();
