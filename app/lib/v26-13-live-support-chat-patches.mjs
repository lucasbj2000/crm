import { readFileSync } from "node:fs";
import { improveV2610LiveSupportJs, improveV2610LiveSupportCss } from "./v26-12-live-support-fluency-patches.mjs";

function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.13 soporte: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.13 soporte: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function insertBeforeOnce(source, marker, block, label) {
  const first = source.indexOf(marker);
  const last = source.lastIndexOf(marker);
  if (first < 0) throw new Error(`V26.13 soporte: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.13 soporte: ${label} aparece más de una vez.`);
  return source.slice(0, first) + block + source.slice(first);
}

function replaceRegexOnce(source, regex, replacement, label) {
  const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
  const matches = [...source.matchAll(new RegExp(regex.source, flags))];
  if (matches.length !== 1) throw new Error(`V26.13 soporte: ${label} esperaba 1 coincidencia y encontró ${matches.length}.`);
  return source.replace(regex, replacement);
}

function improveV2613Js(source) {
  let patched = improveV2610LiveSupportJs(source);

  patched = replaceOnce(
    patched,
    'let identityLoading = false;',
    'let identityLoading = false;\n  const v2613AdminChatIds = new Set();\n  const v2613AgentChatIds = new Set();',
    "estado del chat",
  );

  patched = replaceOnce(
    patched,
    '<iframe id="v2610-mirror-frame" title="Vista en vivo del CRM" sandbox="allow-same-origin"></iframe>',
    '<iframe id="v2610-mirror-frame" title="Vista en vivo del CRM" src="/v26-13-live-mirror" sandbox="allow-scripts allow-same-origin"></iframe>',
    "iframe del visor",
  );

  patched = replaceOnce(
    patched,
    '          <footer class="v2610-viewer-foot"><span>Solo CRM · sin acceso al escritorio del empleado</span><span id="v2610-viewer-time"></span></footer>',
    `          <aside class="v2613-admin-chat" id="v2613-admin-chat">
            <header><div><small>SOPORTE</small><b>Chat en vivo</b></div><span class="v2613-chat-live">● EN VIVO</span></header>
            <div class="v2613-chat-messages" id="v2613-admin-chat-messages"><div class="v2613-chat-empty">Podés escribirle al agente durante el soporte.</div></div>
            <form id="v2613-admin-chat-form" class="v2613-chat-form"><textarea id="v2613-admin-chat-input" maxlength="2000" rows="2" placeholder="Escribir al agente…"></textarea><button type="submit">Enviar</button></form>
          </aside>
          <footer class="v2610-viewer-foot"><span>Solo CRM · sin acceso al escritorio del empleado</span><span id="v2610-viewer-time"></span></footer>`,
    "chat del administrador",
  );

  patched = replaceOnce(
    patched,
    '      window.addEventListener("resize", scaleMirror);',
    `      window.addEventListener("resize", scaleMirror);
      const mirrorFrame = $("#v2610-mirror-frame");
      mirrorFrame?.addEventListener("load", () => { mirrorFrame.dataset.v2613Ready = "1"; if (adminTelemetry) renderTelemetry(adminTelemetry); });
      $("#v2613-admin-chat-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = $("#v2613-admin-chat-input");
        const text = String(input?.value || "").trim();
        if (!text || !adminSession?.id) return;
        if (input) input.value = "";
        try { await v2613SendChat(adminSession.id, text); }
        catch (error) { if (input) input.value = text; window.alert(error.message); }
      });`,
    "eventos del visor y chat",
  );

  const helpers = String.raw`
  function v2613ChatTime(value) {
    try { return new Date(value).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  }

  function v2613ChatMarkup(message, mine) {
    return '<article class="v2613-chat-message ' + (mine ? 'mine' : 'theirs') + '" data-chat-id="' + escapeAttr(message.id || "") + '">' +
      '<div><b>' + escapeHtml(message.senderName || (mine ? "Vos" : "Soporte")) + '</b><small>' + escapeHtml(v2613ChatTime(message.at)) + '</small></div>' +
      '<p>' + escapeHtml(message.text || "") + '</p></article>';
  }

  function v2613ReplaceChat(containerId, messages, ids) {
    const container = $(containerId); if (!container) return;
    ids.clear();
    const rows = Array.isArray(messages) ? messages.slice(-120) : [];
    if (!rows.length) { container.innerHTML = '<div class="v2613-chat-empty">Sin mensajes todavía.</div>'; return; }
    container.innerHTML = rows.map((message) => {
      if (message?.id) ids.add(message.id);
      return v2613ChatMarkup(message, message?.senderUserId === currentUser?.id);
    }).join("");
    container.scrollTop = container.scrollHeight;
  }

  function v2613AppendChat(containerId, message, ids) {
    if (!message?.id || ids.has(message.id)) return;
    const container = $(containerId); if (!container) return;
    ids.add(message.id);
    container.querySelector(".v2613-chat-empty")?.remove();
    container.insertAdjacentHTML("beforeend", v2613ChatMarkup(message, message.senderUserId === currentUser?.id));
    container.scrollTop = container.scrollHeight;
  }

  async function v2613SendChat(sessionId, text) {
    return api('/api/live-support/' + encodeURIComponent(sessionId) + '/chat', { method: "POST", body: JSON.stringify({ text }) });
  }

  function v2613RenderAdminChat(messages) { v2613ReplaceChat("#v2613-admin-chat-messages", messages, v2613AdminChatIds); }
  function v2613AppendAdminChat(message) { v2613AppendChat("#v2613-admin-chat-messages", message, v2613AdminChatIds); }

  function v2613EnsureAgentChat(session) {
    let panel = $("#v2613-agent-chat");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "v2613-agent-chat";
      panel.className = "v2613-agent-chat";
      panel.innerHTML = '<header><div><small>SOPORTE EN VIVO</small><b>Chat con ' + escapeHtml(session.adminName || "Administrador") + '</b></div><button type="button" id="v2613-agent-chat-minimize" aria-label="Minimizar">—</button></header>' +
        '<div class="v2613-chat-messages" id="v2613-agent-chat-messages"><div class="v2613-chat-empty">Podés hablar con soporte desde acá.</div></div>' +
        '<form id="v2613-agent-chat-form" class="v2613-chat-form"><textarea id="v2613-agent-chat-input" maxlength="2000" rows="2" placeholder="Responder a soporte…"></textarea><button type="submit">Enviar</button></form>';
      document.body.appendChild(panel);
      $("#v2613-agent-chat-minimize")?.addEventListener("click", () => panel.classList.toggle("minimized"));
      $("#v2613-agent-chat-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = $("#v2613-agent-chat-input");
        const text = String(input?.value || "").trim();
        if (!text || !agentSession?.id) return;
        if (input) input.value = "";
        try { await v2613SendChat(agentSession.id, text); }
        catch (error) { if (input) input.value = text; window.alert(error.message); }
      });
    }
    panel.hidden = false;
    panel.classList.remove("minimized");
    const title = panel.querySelector("header b"); if (title) title.textContent = 'Chat con ' + (session.adminName || "Administrador");
    $("#v2613-agent-chat-open")?.addEventListener("click", () => panel.classList.remove("minimized"));
  }

  function v2613RenderAgentChat(messages) { v2613ReplaceChat("#v2613-agent-chat-messages", messages, v2613AgentChatIds); }
  function v2613AppendAgentChat(message) {
    v2613AppendChat("#v2613-agent-chat-messages", message, v2613AgentChatIds);
    const panel = $("#v2613-agent-chat");
    if (panel?.classList.contains("minimized") && message?.senderUserId !== currentUser?.id) panel.classList.add("has-unread");
  }

`;
  patched = insertBeforeOnce(patched, '  function openAdminStream(id) {', helpers, "funciones de chat");

  patched = replaceOnce(
    patched,
    '      updateViewerSession(session);\n      (session?.annotations || []).forEach(renderAdminAnnotation);',
    '      updateViewerSession(session);\n      v2613RenderAdminChat(session?.chat || []);\n      (session?.annotations || []).forEach(renderAdminAnnotation);',
    "historial inicial del chat admin",
  );

  patched = replaceOnce(
    patched,
    '    adminStream.addEventListener("annotation", (event) => renderAdminAnnotation(parseEvent(event)));',
    '    adminStream.addEventListener("chat", (event) => v2613AppendAdminChat(parseEvent(event)));\n    adminStream.addEventListener("annotation", (event) => renderAdminAnnotation(parseEvent(event)));',
    "evento de chat admin",
  );

  const telemetryReplacement = String.raw`  function renderTelemetry(telemetry) {
    if (!telemetry) return;
    const frame = $("#v2610-mirror-frame"), scaler = $("#v2610-mirror-scaler"), waiting = $("#v2610-viewer-waiting");
    if (!frame || !scaler) return;
    const width = Math.max(240, Number(telemetry.viewport?.width || 1280));
    const height = Math.max(240, Number(telemetry.viewport?.height || 720));
    scaler.style.width = String(width) + "px";
    scaler.style.height = String(height) + "px";
    frame.style.width = String(width) + "px";
    frame.style.height = String(height) + "px";
    if (frame.dataset.v2613Ready === "1" && telemetry.html) {
      const styles = $$("link[rel='stylesheet']", document.head).map((node) => node.href).filter(Boolean);
      try { frame.contentWindow?.postMessage({ type: "v2613-snapshot", html: telemetry.html, styles, scroll: telemetry.scroll || {}, viewport: telemetry.viewport || {} }, location.origin); } catch {}
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
    /  function renderTelemetry\(telemetry\) \{[\s\S]*?\n  function scaleMirror\(\) \{/,
    telemetryReplacement,
    "renderizado por página espejo",
  );

  patched = replaceOnce(
    patched,
    '    ensureAgentIndicator(agentSession); openAgentStream(agentSession.id);',
    '    ensureAgentIndicator(agentSession); v2613EnsureAgentChat(agentSession); openAgentStream(agentSession.id);',
    "inicio del chat del agente",
  );

  patched = replaceOnce(
    patched,
    '    indicator.innerHTML = `<span class="v2610-live-dot"></span><div><b>${session.mode === "urgent" ? "Soporte urgente activo" : "Soporte en vivo activo"}</b><small>${escapeHtml(session.adminName || "Administrador")} está viendo únicamente tu sesión del CRM.</small></div>`;',
    '    indicator.innerHTML = `<span class="v2610-live-dot"></span><div><b>${session.mode === "urgent" ? "Soporte urgente activo" : "Soporte en vivo activo"}</b><small>${escapeHtml(session.adminName || "Administrador")} está viendo únicamente tu sesión del CRM.</small></div><button type="button" id="v2613-agent-chat-open">Chat</button>`;',
    "botón de chat del agente",
  );

  patched = replaceOnce(
    patched,
    '    $("#v2610-agent-indicator")?.remove(); $$(".v2610-agent-annotation").forEach((node) => node.remove());',
    '    $("#v2610-agent-indicator")?.remove(); $("#v2613-agent-chat")?.remove(); v2613AgentChatIds.clear(); $$(".v2610-agent-annotation").forEach((node) => node.remove());',
    "limpieza del chat del agente",
  );

  patched = replaceRegexOnce(
    patched,
    /  function openAgentStream\(id\) \{[\s\S]*?\n  \}\n\n  function captureMouse/,
    String.raw`  function openAgentStream(id) {
    agentStream?.close(); agentStream = new EventSource('/api/live-support/' + encodeURIComponent(id) + '/stream');
    agentStream.addEventListener("session", (event) => {
      const session = parseEvent(event);
      v2613RenderAgentChat(session?.chat || []);
    });
    agentStream.addEventListener("chat", (event) => v2613AppendAgentChat(parseEvent(event)));
    agentStream.addEventListener("annotation", (event) => showAgentAnnotation(parseEvent(event)));
    agentStream.addEventListener("ended", () => stopAgentLive());
    agentStream.addEventListener("status", (event) => { const session = parseEvent(event); if (["ended", "rejected", "expired"].includes(session?.status)) stopAgentLive(); });
  }

  function captureMouse`,
    "stream del agente con chat",
  );

  patched = patched.replace("ADMINISTRACIÓN · V26.12", "ADMINISTRACIÓN · V26.13");
  return patched;
}

function improveV2613Css(source) {
  return improveV2610LiveSupportCss(source) + String.raw`

/* V26.13 · visor estable + chat en vivo */
.v2610-viewer-card{grid-template-columns:minmax(0,1fr) 330px!important;grid-template-rows:auto minmax(0,1fr) auto!important}
.v2610-viewer-head{grid-column:1/-1!important}.v2610-viewer-stage{grid-column:1!important;grid-row:2!important}.v2610-viewer-foot{grid-column:1/-1!important;grid-row:3!important}
.v2613-admin-chat{grid-column:2!important;grid-row:2!important;min-width:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#f8f9fb;border-left:1px solid #ffffff16;color:#1c1e22;overflow:hidden}
.v2613-admin-chat>header,.v2613-agent-chat>header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 13px;border-bottom:1px solid #00000010;background:#fff}.v2613-admin-chat header small,.v2613-agent-chat header small{display:block;font-size:9px;letter-spacing:.12em;font-weight:850;opacity:.5}.v2613-admin-chat header b,.v2613-agent-chat header b{font-size:13px}.v2613-chat-live{font-size:9px;font-weight:850;color:#23834c}.v2613-chat-messages{overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth}.v2613-chat-empty{margin:auto;text-align:center;font-size:11px;color:#757a82;padding:22px}
.v2613-chat-message{max-width:88%;padding:8px 10px;border-radius:13px;background:#fff;border:1px solid #0000000e;box-shadow:0 3px 10px #00000008}.v2613-chat-message.mine{align-self:flex-end;background:color-mix(in srgb,var(--green,#1f6f4a) 10%,#fff);border-color:color-mix(in srgb,var(--green,#1f6f4a) 18%,transparent)}.v2613-chat-message.theirs{align-self:flex-start}.v2613-chat-message>div{display:flex;justify-content:space-between;gap:10px;align-items:center}.v2613-chat-message b{font-size:9px}.v2613-chat-message small{font-size:8px;opacity:.5}.v2613-chat-message p{margin:4px 0 0;font-size:11px;line-height:1.38;white-space:pre-wrap;overflow-wrap:anywhere}
.v2613-chat-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;padding:10px;border-top:1px solid #00000010;background:#fff}.v2613-chat-form textarea{resize:none;width:100%;border:1px solid #0002;border-radius:10px;padding:9px 10px;font:11px/1.35 system-ui;min-height:38px;max-height:90px}.v2613-chat-form button{align-self:end;border:0;border-radius:10px;background:var(--green,#1f6f4a);color:#fff;padding:10px 12px;font-size:10px;font-weight:800;cursor:pointer}
.v2613-agent-chat{position:fixed;right:14px;bottom:76px;z-index:3290;width:min(360px,calc(100vw - 28px));height:330px;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#f8f9fb;color:#1c1e22;border:1px solid #00000018;border-radius:16px;box-shadow:0 20px 60px #0004;overflow:hidden}.v2613-agent-chat.minimized{height:auto}.v2613-agent-chat.minimized .v2613-chat-messages,.v2613-agent-chat.minimized .v2613-chat-form{display:none}.v2613-agent-chat.has-unread>header::after{content:"Nuevo";font-size:8px;font-weight:850;background:#d92d20;color:#fff;border-radius:999px;padding:3px 6px}.v2613-agent-chat>header button{border:0;background:#00000008;border-radius:8px;width:30px;height:28px;cursor:pointer}.v2610-agent-indicator #v2613-agent-chat-open{border:0;border-radius:999px;padding:6px 9px;background:currentColor;color:#fff;font-size:9px;font-weight:800;cursor:pointer}
#v2610-mirror-frame{background:#fff!important}
@media(max-width:900px){.v2610-viewer-card{grid-template-columns:1fr!important}.v2610-viewer-stage{grid-column:1!important}.v2613-admin-chat{position:absolute;right:8px;bottom:42px;width:min(340px,calc(100% - 16px));height:min(420px,55%);border:1px solid #0002;border-radius:14px;box-shadow:0 18px 55px #0005;z-index:20}.v2610-viewer-foot{grid-column:1!important}}
@media(max-width:720px){.v2613-agent-chat{left:10px;right:10px;bottom:132px;width:auto;height:300px}.v2613-admin-chat{left:8px;width:auto}}
`;
}

const originalJs = readFileSync(new URL("../public/v26-10.js", import.meta.url), "utf8");
const originalCss = readFileSync(new URL("../public/v26-10.css", import.meta.url), "utf8");
const v2613Js = improveV2613Js(originalJs);
const v2613Css = improveV2613Css(originalCss);

const mirrorHtml = String.raw`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;background:#fff}body{overflow:auto;pointer-events:none}.v2610-admin-launcher,.v2610-panel,.v2610-live-viewer,.v2610-support-request,.v2610-agent-indicator,.v2610-agent-annotation,.v2613-agent-chat,.toast,.progress-bar{display:none!important}*{animation:none!important;transition:none!important;caret-color:transparent!important}</style><script>(()=>{const loaded=new Set();function styles(list){for(const href of Array.isArray(list)?list:[]){if(!href||loaded.has(href))continue;loaded.add(href);const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.appendChild(link)}}function restore(data){requestAnimationFrame(()=>{try{document.querySelectorAll('[data-v2610-scroll-top]').forEach(node=>{node.scrollTop=Number(node.getAttribute('data-v2610-scroll-top')||0);node.scrollLeft=Number(node.getAttribute('data-v2610-scroll-left')||0)});window.scrollTo(Number(data.scroll?.x||0),Number(data.scroll?.y||0))}catch{}})}window.addEventListener('message',event=>{if(event.origin!==location.origin||event.data?.type!=='v2613-snapshot')return;styles(event.data.styles);const html=String(event.data.html||'');if(!html){document.body.innerHTML='<div style="padding:24px;font:13px system-ui;color:#777">Esperando pantalla del agente…</div>';return}document.body.innerHTML=html;restore(event.data)});})();</script></head><body><div style="padding:24px;font:13px system-ui;color:#777">Esperando pantalla del agente…</div></body></html>`;

const assetRoutes = `
app.get("/v26-10.js", (request, response) => {
  response.type("application/javascript");
  response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  response.send(${JSON.stringify(v2613Js)});
});
app.get("/v26-10.css", (request, response) => {
  response.type("text/css");
  response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  response.send(${JSON.stringify(v2613Css)});
});
app.get("/v26-13-live-mirror", (request, response) => {
  if (!currentUser(request)) return response.status(401).send("Sesión requerida.");
  response.type("text/html");
  response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  response.send(${JSON.stringify(mirrorHtml)});
});
`;

const chatRoute = String.raw`
app.post("/api/live-support/:id/chat", (request, response) => {
  const user = currentUser(request);
  if (!user) return response.status(401).json({ error: "Sesión requerida." });
  const session = v2610LiveSupportSessions.get(request.params.id);
  if (!v2610SupportCanView(user, session) || session?.status !== "active") return response.status(404).json({ error: "Sesión de soporte no activa." });
  const text = cleanText(request.body?.text, 2000);
  if (!text) return response.status(400).json({ error: "Escribí un mensaje." });
  if (!Array.isArray(session.chat)) session.chat = [];
  const message = {
    id: makeId("support_chat"),
    senderUserId: user.id,
    senderName: user.name,
    senderRole: user.role === "admin" ? "admin" : "agent",
    text,
    at: timestamp(),
  };
  session.chat.push(message);
  if (session.chat.length > 200) session.chat.splice(0, session.chat.length - 200);
  v2610SupportBroadcast(session, "chat", message);
  response.json({ message });
});

`;

export function applyV2613LiveSupportChatPatches(source) {
  let patched = source;
  patched = replaceOnce(
    patched,
    '      annotations: [],\n    };',
    '      annotations: [],\n      chat: [],\n    };',
    "chat al crear sesión",
  );
  patched = replaceOnce(
    patched,
    '    annotations: (session.annotations || []).slice(-40),\n    telemetry: includeTelemetry ? (session.telemetry || null) : undefined,',
    '    annotations: (session.annotations || []).slice(-40),\n    chat: (session.chat || []).slice(-120),\n    telemetry: includeTelemetry ? (session.telemetry || null) : undefined,',
    "chat público de la sesión",
  );
  patched = insertBeforeOnce(
    patched,
    'app.post("/api/live-support/:id/annotation", requireAdmin, (request, response) => {',
    chatRoute,
    "ruta de anotaciones",
  );
  patched = replaceOnce(
    patched,
    '{ sessionId: session.id, agentUserId: session.agentUserId, agentName: session.agentName, mode: session.mode, annotations: session.annotations.length },',
    '{ sessionId: session.id, agentUserId: session.agentUserId, agentName: session.agentName, mode: session.mode, annotations: session.annotations.length, chatMessages: (session.chat || []).length },',
    "auditoría final de soporte",
  );
  patched = replaceOnce(
    patched,
    'app.use(express.static(publicDirectory, { extensions: ["html"] }));',
    assetRoutes + '\napp.use(express.static(publicDirectory, { extensions: ["html"] }));',
    "rutas de assets del soporte",
  );
  return patched;
}

export { improveV2613Js, improveV2613Css, mirrorHtml };
