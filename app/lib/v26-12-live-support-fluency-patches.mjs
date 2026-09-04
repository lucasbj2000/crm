import { readFileSync } from "node:fs";

function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.12 soporte: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.12 soporte: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceRegexOnce(source, regex, replacement, label) {
  const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
  const probe = new RegExp(regex.source, flags);
  const matches = [...source.matchAll(probe)];
  if (matches.length !== 1) throw new Error(`V26.12 soporte: ${label} esperaba 1 coincidencia y encontró ${matches.length}.`);
  return source.replace(regex, replacement);
}

export function improveV2610LiveSupportJs(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    'const clone = source.cloneNode(true); clone.id = source.id ? `${source.id}-v2610-mirror` : "v2610-mirror-root";',
    'const clone = source.cloneNode(true); clone.id = source.id || "v2612-mirror-root";',
    "ID del contenedor espejado",
  );

  patched = replaceOnce(
    patched,
    'const farOutside = rect.bottom < -800 || rect.top > window.innerHeight + 800 || rect.right < -800 || rect.left > window.innerWidth + 800;',
    'const farOutside = rect.bottom < -48 || rect.top > window.innerHeight + 48 || rect.right < -48 || rect.left > window.innerWidth + 48;',
    "recorte de elementos fuera del viewport",
  );

  patched = replaceOnce(
    patched,
    'agentSnapshotTimer = setInterval(() => sendAgentTelemetry(true), 1400);\n    agentMouseTimer = setInterval(() => { if (Date.now() - lastMouseSentAt >= 220) sendAgentTelemetry(false); }, 240);',
    'agentSnapshotTimer = setInterval(() => sendAgentTelemetry(true), 650);\n    agentMouseTimer = setInterval(() => { if (Date.now() - lastMouseSentAt >= 90) sendAgentTelemetry(false); }, 110);',
    "frecuencia de actualización del soporte",
  );

  const mirrorReplacement = String.raw`  function mirrorStylesheetMarkup() {
    return $$("link[rel='stylesheet']", document.head).map((node) => {
      const href = node.getAttribute("href");
      return href ? '<link rel="stylesheet" href="' + escapeAttr(href) + '">' : "";
    }).join("");
  }

  function mirrorDocument(html) {
    return '<!doctype html><html><head><meta charset="utf-8"><base href="' + escapeAttr(location.origin + "/") + '">' +
      mirrorStylesheetMarkup() +
      '<style>html,body{margin:0!important;min-height:100%;overflow:auto!important;background:#fff!important}body{pointer-events:none!important}.v2610-admin-launcher,.v2610-panel,.v2610-live-viewer,.v2610-support-request,.v2610-agent-indicator,.v2610-agent-annotation,.toast,.progress-bar{display:none!important}*{animation:none!important;transition:none!important;caret-color:transparent!important}</style>' +
      '</head><body>' + (html || "") + '</body></html>';
  }

  function v2612MirrorHash(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function v2612RestoreMirrorScroll(frame, telemetry) {
    try {
      const doc = frame.contentDocument;
      doc?.querySelectorAll("[data-v2610-scroll-top]").forEach((node) => {
        node.scrollTop = Number(node.getAttribute("data-v2610-scroll-top") || 0);
        node.scrollLeft = Number(node.getAttribute("data-v2610-scroll-left") || 0);
      });
      frame.contentWindow?.scrollTo(Number(telemetry.scroll?.x || 0), Number(telemetry.scroll?.y || 0));
    } catch {}
  }

  function renderTelemetry(telemetry) {
    if (!telemetry) return;
    const frame = $("#v2610-mirror-frame"), scaler = $("#v2610-mirror-scaler"), waiting = $("#v2610-viewer-waiting");
    if (!frame || !scaler) return;
    const width = Math.max(240, Number(telemetry.viewport?.width || 1280));
    const height = Math.max(240, Number(telemetry.viewport?.height || 720));
    scaler.style.width = String(width) + "px";
    scaler.style.height = String(height) + "px";
    frame.style.width = String(width) + "px";
    frame.style.height = String(height) + "px";
    const snapshotSignature = telemetry.html ? String(telemetry.html.length) + ":" + v2612MirrorHash(telemetry.html) + ":" + (telemetry.view || "") : "";
    if (telemetry.html && frame.dataset.snapshot !== snapshotSignature) {
      frame.dataset.snapshot = snapshotSignature;
      const ready = frame.contentDocument?.body && frame.dataset.v2612Ready === "1";
      if (!ready) {
        frame.onload = () => {
          frame.dataset.v2612Ready = "1";
          v2612RestoreMirrorScroll(frame, telemetry);
        };
        frame.srcdoc = mirrorDocument(telemetry.html);
      } else {
        try {
          frame.contentDocument.body.innerHTML = telemetry.html;
          requestAnimationFrame(() => v2612RestoreMirrorScroll(frame, telemetry));
        } catch {
          frame.dataset.v2612Ready = "0";
          frame.srcdoc = mirrorDocument(telemetry.html);
        }
      }
    } else if (frame.dataset.v2612Ready === "1") {
      v2612RestoreMirrorScroll(frame, telemetry);
    }
    const cursor = $("#v2610-remote-cursor");
    if (cursor) {
      cursor.hidden = telemetry.cursor?.visible === false;
      cursor.style.left = String(Number(telemetry.cursor?.x || 0) * width) + "px";
      cursor.style.top = String(Number(telemetry.cursor?.y || 0) * height) + "px";
    }
    $("#v2610-viewer-time").textContent = telemetry.at ? "Actualizado " + new Date(telemetry.at).toLocaleTimeString("es-PY") : "";
    if (waiting) waiting.hidden = Boolean(telemetry.html);
    scaleMirror();
  }

  function scaleMirror() {`;

  patched = replaceRegexOnce(
    patched,
    /  function mirrorDocument\(html\) \{[\s\S]*?\n  function scaleMirror\(\) \{/,
    mirrorReplacement,
    "renderizado visual de la pantalla del agente",
  );

  patched = patched.replace("ADMINISTRACIÓN · V26.10", "ADMINISTRACIÓN · V26.12");
  return patched;
}

export function improveV2610LiveSupportCss(source) {
  return source + String.raw`

/* V26.12 · soporte en vivo más limpio y no invasivo */
.v2610-agent-indicator{top:auto!important;left:14px!important;bottom:14px!important;transform:none!important;max-width:min(390px,calc(100vw - 28px))!important;border-radius:14px!important;padding:8px 11px!important;box-shadow:0 10px 30px #00000024!important}
.v2610-live-viewer{padding:8px!important;background:#111318f2!important}
.v2610-viewer-card{border-radius:14px!important;background:#17191e!important}
.v2610-viewer-head{min-height:66px;padding:10px 14px!important;gap:12px!important}
.v2610-viewer-head h2{margin-top:3px!important;font-size:18px!important}.v2610-viewer-head p{margin-top:2px!important}
.v2610-viewer-actions button{padding:8px 11px!important;border-radius:10px!important}
.v2610-viewer-stage{background:#20232a!important;place-items:center!important;contain:layout paint;isolation:isolate}
.v2610-mirror-scaler{box-shadow:0 14px 45px #00000055!important;will-change:transform;overflow:hidden}
.v2610-mirror-scaler iframe{background:#fff!important;transform:translateZ(0)}
.v2610-remote-cursor{transition:left .08s linear,top .08s linear!important}
.v2610-viewer-foot{padding:7px 14px!important}
.v2610-support-request{right:14px!important;top:14px!important;width:min(420px,calc(100vw - 28px))!important;padding:14px!important;border-radius:14px!important}
@media(max-width:720px){.v2610-agent-indicator{left:10px!important;bottom:76px!important;width:calc(100vw - 20px)!important}.v2610-live-viewer{padding:0!important}.v2610-viewer-card{border-radius:0!important}.v2610-viewer-head{min-height:auto!important;padding:10px!important}.v2610-viewer-actions{gap:5px!important}.v2610-viewer-actions button{padding:8px!important;font-size:10px!important}}
`;
}

const originalJs = readFileSync(new URL("../public/v26-10.js", import.meta.url), "utf8");
const originalCss = readFileSync(new URL("../public/v26-10.css", import.meta.url), "utf8");
const improvedJs = improveV2610LiveSupportJs(originalJs);
const improvedCss = improveV2610LiveSupportCss(originalCss);

const assetRoutes = `
app.get("/v26-10.js", (request, response) => {
  response.type("application/javascript");
  response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  response.send(${JSON.stringify(improvedJs)});
});
app.get("/v26-10.css", (request, response) => {
  response.type("text/css");
  response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  response.send(${JSON.stringify(improvedCss)});
});
`;

export function applyV2612LiveSupportFluencyPatches(source) {
  return replaceOnce(
    source,
    'app.use(express.static(publicDirectory, { extensions: ["html"] }));',
    assetRoutes + '\napp.use(express.static(publicDirectory, { extensions: ["html"] }));',
    "middleware estático para servir el soporte mejorado",
  );
}
