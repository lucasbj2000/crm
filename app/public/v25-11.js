(() => {
  "use strict";

  const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
  const $$ = (selector, root = document) => Array.from(root?.querySelectorAll?.(selector) || []);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
  const channelMeta = {
    whatsapp:{label:"WhatsApp",icon:"◉"},
    facebook:{label:"Facebook",icon:"f"},
    instagram:{label:"Instagram",icon:"◎"},
    tiktok:{label:"TikTok",icon:"♪"},
  };
  let oauthConfig = { canManage:false, meta:{}, tiktok:{} };
  let inbox = [];
  let activeId = "";
  let filter = "all";
  let search = "";
  let poll = null;
  let socialGridObserver = null;

  function notify(message, tone="success") { try { if (typeof showToast === "function") return showToast(message, tone); } catch {} console.log(message); }
  async function request(url, options = {}) {
    const next = { ...options };
    if (next.body && typeof next.body === "object" && !(next.body instanceof FormData) && !(next.body instanceof Blob)) next.body = JSON.stringify(next.body);
    try { if (typeof api === "function") return await api(url, next); } catch (error) { throw error; }
    const response = await fetch(url, { credentials:"same-origin", cache:"no-store", ...next, headers: next.body && typeof next.body === "string" ? { "Content-Type":"application/json", ...(next.headers || {}) } : next.headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
    return data;
  }
  function appVisible() { const shell=$("#app-shell"); return Boolean(shell && !shell.hidden); }
  function channelViewActive() { return Boolean($("[data-view-panel='whatsapp']")?.classList.contains("active")); }
  function currentConversation() { return inbox.find((item) => item.id === activeId) || null; }
  function formatTime(value) { const date=new Date(value||""); if(Number.isNaN(date.getTime()))return ""; const now=Date.now(),diff=Math.max(0,now-date.getTime());if(diff<60000)return "Ahora";if(diff<3600000)return Math.floor(diff/60000)+" min";if(diff<86400000)return Math.floor(diff/3600000)+" h";return date.toLocaleDateString("es-PY",{day:"2-digit",month:"2-digit"}); }
  function pending(item) { return item?.lastDirection === "incoming"; }
  function quickReplies() { try { return (appState?.quickReplies || []).filter((entry)=>entry.active!==false); } catch { return []; } }

  function suppressLegacyInbox() {
    const legacy = $("#v252-whatsapp-shell");
    if (legacy) {
      legacy.setAttribute("aria-hidden","true");
      legacy.dataset.v2511Suppressed="legacy-inbox";
      legacy.hidden = true;
      legacy.style.setProperty("display","none","important");
    }

    const view = $("[data-view-panel='whatsapp']");
    if (!view) return;
    const candidates = $$("section,article,div", view)
      .filter((node) => !node.closest("#v2511-unified-inbox,#v2510-social-hub"))
      .filter((node) => {
        const text = String(node.textContent || "").replace(/\s+/g," ").trim().toLowerCase();
        return text.includes("bandeja unificada")
          && text.includes("contexto inmediato")
          && (text.includes("abrir conversación") || text.includes("trabajar conversación"));
      })
      .sort((a,b) => String(a.textContent || "").length - String(b.textContent || "").length);
    const duplicate = candidates[0];
    if (duplicate) {
      duplicate.setAttribute("aria-hidden","true");
      duplicate.dataset.v2511Suppressed="duplicate-unified-inbox";
      duplicate.hidden = true;
      duplicate.style.setProperty("display","none","important");
    }
  }

  function createUnifiedInbox() {
    if ($("#v2511-unified-inbox")) return;
    const view=$("[data-view-panel='whatsapp']"); if(!view)return;
    const hub=$("#v2510-social-hub",view);
    const section=document.createElement("section");
    section.id="v2511-unified-inbox";
    section.className="v2511-inbox";
    section.innerHTML=`<header class="v2511-inbox-head"><div><p>BANDEJA UNIFICADA</p><h3>Conversaciones de todos los canales</h3><small>Respondé desde un solo lugar. Los pendientes se destacan automáticamente.</small></div><button type="button" id="v2511-refresh" title="Actualizar">↻</button></header><div class="v2511-inbox-tabs" id="v2511-tabs"><button class="active" data-v2511-filter="all">Todos <b>0</b></button><button data-v2511-filter="whatsapp">WhatsApp <b>0</b></button><button data-v2511-filter="facebook">Facebook <b>0</b></button><button data-v2511-filter="instagram">Instagram <b>0</b></button></div><div class="v2511-inbox-body"><aside class="v2511-list-pane"><label class="v2511-search"><span>⌕</span><input id="v2511-search" type="search" placeholder="Buscar conversación..."></label><div class="v2511-list" id="v2511-list"></div></aside><section class="v2511-chat-empty" id="v2511-empty"><div><span>💬</span><strong>Seleccioná una conversación</strong><small>WhatsApp, Facebook e Instagram aparecerán juntos en esta bandeja.</small></div></section><section class="v2511-chat" id="v2511-chat" hidden><header class="v2511-chat-head"><button type="button" class="v2511-back" id="v2511-back">←</button><span class="v2511-avatar" id="v2511-avatar">C</span><div class="v2511-chat-title"><strong id="v2511-name">Cliente</strong><small id="v2511-meta"></small></div><span class="v2511-channel-pill" id="v2511-channel"></span><button type="button" class="v2511-tools" id="v2511-tools">Gestión completa</button></header><div class="v2511-messages" id="v2511-messages"></div><div class="v2511-ai-row"><button type="button" id="v2511-ai">✦ Sugerir con IA</button><span id="v2511-ai-note">La sugerencia nunca se envía sola.</span></div><form class="v2511-composer" id="v2511-composer"><div class="v2511-quick"><select id="v2511-quick"><option value="">Respuesta rápida…</option></select><button type="button" id="v2511-quick-use">Insertar</button></div><div class="v2511-write"><textarea id="v2511-message" rows="2" maxlength="4000" placeholder="Escribí un mensaje"></textarea><button type="submit" id="v2511-send">Enviar</button></div><small class="v2511-error" id="v2511-error"></small></form></section></div>`;
    if(hub?.nextSibling)view.insertBefore(section,hub.nextSibling);else if(hub)view.appendChild(section);else view.prepend(section);
    $("#v2511-refresh").addEventListener("click",()=>void loadInbox());
    $("#v2511-tabs").addEventListener("click",(event)=>{const button=event.target.closest("[data-v2511-filter]");if(!button)return;filter=button.dataset.v2511Filter;renderInbox();});
    $("#v2511-search").addEventListener("input",(event)=>{search=event.target.value.trim().toLowerCase();renderList();});
    $("#v2511-list").addEventListener("click",(event)=>{const row=event.target.closest("[data-v2511-conversation]");if(row)selectConversation(row.dataset.v2511Conversation);});
    $("#v2511-back").addEventListener("click",()=>section.classList.remove("mobile-chat-open"));
    $("#v2511-tools").addEventListener("click",openCompleteManagement);
    $("#v2511-ai").addEventListener("click",()=>void suggestReply());
    $("#v2511-quick-use").addEventListener("click",useQuickReply);
    $("#v2511-composer").addEventListener("submit",sendMessage);
    $("#v2511-message").addEventListener("keydown",(event)=>{if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){event.preventDefault();$("#v2511-composer").requestSubmit();}});
  }

  function filteredInbox() {
    return inbox.filter((item)=>{
      if(filter!=="all"&&item.provider!==filter)return false;
      if(!search)return true;
      return [item.name,item.handle,item.ownerName,item.lastMessage,channelMeta[item.provider]?.label].some((value)=>String(value||"").toLowerCase().includes(search));
    });
  }
  function renderTabs() {
    $$("#v2511-tabs [data-v2511-filter]").forEach((button)=>{
      const key=button.dataset.v2511Filter;const count=key==="all"?inbox.length:inbox.filter((item)=>item.provider===key).length;button.classList.toggle("active",key===filter);const b=$("b",button);if(b)b.textContent=String(count);
    });
  }
  function renderList() {
    const list=$("#v2511-list");if(!list)return;const rows=filteredInbox();
    list.innerHTML=rows.length?rows.slice(0,400).map((item)=>{const meta=channelMeta[item.provider]||{label:item.provider,icon:"•"};const isPending=pending(item);return `<button type="button" class="v2511-row ${isPending?"pending":""} ${item.id===activeId?"active":""}" data-v2511-conversation="${esc(item.id)}"><span class="v2511-row-avatar">${esc(String(item.name||"C").charAt(0).toUpperCase())}<i data-channel="${esc(item.provider)}">${esc(meta.icon)}</i></span><span class="v2511-row-copy"><span><strong>${esc(item.name||item.handle||"Cliente")}</strong><time>${esc(formatTime(item.lastMessageAt))}</time></span><small>${esc(item.lastMessage||"Sin mensajes")}</small><em>${esc(meta.label)}${item.ownerName?" · "+esc(item.ownerName):""}</em></span>${isPending?'<span class="v2511-pending">PENDIENTE</span>':""}</button>`;}).join(""):'<div class="v2511-list-empty">No hay conversaciones para este filtro.</div>';
  }
  function renderInbox() { renderTabs();renderList();renderConversation(); }

  function renderAttachment(attachment) {
    if(!attachment)return "";const url=attachment.url||attachment.publicUrl||attachment.path||"";const label=attachment.fileName||attachment.name||attachment.kind||"Adjunto";if(!url)return `<span class="v2511-attachment">📎 ${esc(label)}</span>`;if(String(attachment.mimeType||"").startsWith("image/")||attachment.kind==="image")return `<a class="v2511-media" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(label)}"></a>`;return `<a class="v2511-attachment" href="${esc(url)}" target="_blank" rel="noopener">📎 ${esc(label)}</a>`;
  }
  function renderConversation() {
    const item=currentConversation(),chat=$("#v2511-chat"),empty=$("#v2511-empty");if(!chat||!empty)return;
    if(!item){chat.hidden=true;empty.hidden=false;return;}chat.hidden=false;empty.hidden=true;
    const meta=channelMeta[item.provider]||{label:item.provider,icon:"•"};$("#v2511-avatar").textContent=String(item.name||"C").charAt(0).toUpperCase();$("#v2511-name").textContent=item.name||item.handle||"Cliente";$("#v2511-meta").textContent=[item.handle,item.ownerName].filter(Boolean).join(" · ")||"Conversación";$("#v2511-channel").textContent=meta.icon+" "+meta.label;$("#v2511-channel").dataset.channel=item.provider;$("#v2511-tools").hidden=item.provider!=="whatsapp";
    const messages=$("#v2511-messages");const rows=item.messages||[];messages.innerHTML=rows.length?rows.map((message)=>`<article class="v2511-message ${message.direction==="outgoing"?"out":"in"}">${renderAttachment(message.attachment)}${message.text?`<p>${esc(message.text)}</p>`:""}<small>${message.direction==="outgoing"?esc(message.agentName||"Asesor"):"Cliente"} · ${esc(formatTime(message.createdAt))}</small></article>`).join(""):'<div class="v2511-list-empty">Todavía no hay mensajes.</div>';requestAnimationFrame(()=>{messages.scrollTop=messages.scrollHeight;});
    const replies=quickReplies();$("#v2511-quick").innerHTML='<option value="">Respuesta rápida…</option>'+replies.map((reply)=>`<option value="${esc(reply.id)}">${esc(reply.title||reply.name||"Respuesta")}</option>`).join("");$("#v2511-error").textContent="";
  }
  function selectConversation(id) { activeId=id;$("#v2511-unified-inbox")?.classList.add("mobile-chat-open");renderInbox();requestAnimationFrame(()=>$("#v2511-message")?.focus()); }

  function useQuickReply() {
    const item=currentConversation(),id=$("#v2511-quick")?.value,reply=quickReplies().find((entry)=>entry.id===id);if(!item||!reply)return;const text=String(reply.text||reply.body||"").replaceAll("{cliente}",item.name||"cliente").replaceAll("{telefono}",item.handle||"");$("#v2511-message").value=text;$("#v2511-message").focus();
  }
  async function suggestReply() {
    const item=currentConversation(),button=$("#v2511-ai");if(!item)return;button.disabled=true;const original=button.textContent;button.textContent="Analizando…";
    try{let result;if(item.provider==="whatsapp")result=await request(`/api/deals/${encodeURIComponent(item.entityId)}/copilot-suggestion`,{method:"POST",body:{refresh:true}});else result=await request(`/api/omnichannel/conversations/${encodeURIComponent(item.id)}/copilot`,{method:"POST",body:{}});const reply=result.reply||result.text||"";if(reply){$("#v2511-message").value=reply;$("#v2511-message").focus();}else notify("La IA no generó una sugerencia.","warning");}catch(error){notify(error.message||"No se pudo generar la sugerencia.","warning");}finally{button.disabled=false;button.textContent=original;}
  }
  async function sendMessage(event) {
    event.preventDefault();const item=currentConversation(),box=$("#v2511-message"),button=$("#v2511-send"),text=box?.value.trim()||"";if(!item)return;if(!text){$("#v2511-error").textContent="Escribí un mensaje.";return;}button.disabled=true;button.textContent="Enviando…";
    try{if(item.provider==="whatsapp")await request(`/api/deals/${encodeURIComponent(item.entityId)}/message`,{method:"POST",body:{text}});else await request(`/api/omnichannel/conversations/${encodeURIComponent(item.id)}/message`,{method:"POST",body:{text}});box.value="";await loadInbox({quiet:true});notify("Mensaje enviado por "+(channelMeta[item.provider]?.label||item.provider));}catch(error){$("#v2511-error").textContent=error.message||"No se pudo enviar.";notify(error.message||"No se pudo enviar.","warning");}finally{button.disabled=false;button.textContent="Enviar";}
  }
  function openCompleteManagement() { const item=currentConversation();if(item?.provider!=="whatsapp")return;try{if(typeof openDrawer==="function")openDrawer(item.entityId);}catch{notify("No se pudo abrir la gestión completa.","warning");} }

  async function loadInbox({quiet=false}={}) {
    if(!appVisible())return;createUnifiedInbox();suppressLegacyInbox();try{const data=await request("/api/omnichannel/inbox");inbox=Array.isArray(data.conversations)?data.conversations:[];if(activeId&&!inbox.some((item)=>item.id===activeId))activeId="";renderInbox();}catch(error){if(!quiet)notify(error.message||"No se pudo cargar la bandeja unificada.","warning");}
  }

  function createOAuthDialog() {
    if($("#v2511-oauth-dialog"))return;const dialog=document.createElement("dialog");dialog.id="v2511-oauth-dialog";dialog.className="v2511-oauth-dialog";dialog.innerHTML=`<form id="v2511-oauth-form" class="v2511-oauth-card"><header><div><h3>Configuración avanzada de conexiones</h3><p>Estos datos se configuran una sola vez por empresa. Después los usuarios conectan las cuentas iniciando sesión en la red social.</p></div><button type="button" data-v2511-oauth-close>×</button></header><section><h4>Meta · Facebook e Instagram</h4><div class="v2511-oauth-grid"><label>App ID<input id="v2511-meta-app" autocomplete="off"></label><label>App Secret<input id="v2511-meta-secret" type="password" autocomplete="new-password" placeholder="Dejá vacío para conservarlo"></label><label class="wide">OAuth Redirect URI<input id="v2511-meta-callback" readonly></label><label class="wide">Webhook URL<input id="v2511-meta-webhook" readonly></label><label class="wide">Verify Token<input id="v2511-meta-verify" readonly></label></div><small>En Meta Developers registrá exactamente el OAuth Redirect URI y el Webhook URL mostrados arriba.</small></section><section><h4>TikTok</h4><div class="v2511-oauth-grid"><label>Client Key<input id="v2511-tt-key" autocomplete="off"></label><label>Client Secret<input id="v2511-tt-secret" type="password" autocomplete="new-password" placeholder="Dejá vacío para conservarlo"></label><label class="wide">Redirect URI<input id="v2511-tt-callback" readonly></label></div></section><footer><button type="button" data-v2511-oauth-close>Cancelar</button><button type="submit" class="primary" id="v2511-oauth-save">Guardar configuración</button></footer></form>`;document.body.appendChild(dialog);$$('[data-v2511-oauth-close]',dialog).forEach((button)=>button.addEventListener("click",()=>dialog.close()));$("#v2511-oauth-form").addEventListener("submit",saveOAuthConfig);
  }
  function fillOAuthDialog() { createOAuthDialog();$("#v2511-meta-app").value=oauthConfig.meta?.appId||"";$("#v2511-meta-secret").value="";$("#v2511-meta-callback").value=oauthConfig.meta?.callbackUrl||"";$("#v2511-meta-webhook").value=oauthConfig.meta?.webhookUrl||"";$("#v2511-meta-verify").value=oauthConfig.meta?.verifyToken||"Se generará al guardar";$("#v2511-tt-key").value=oauthConfig.tiktok?.clientKey||"";$("#v2511-tt-secret").value="";$("#v2511-tt-callback").value=oauthConfig.tiktok?.callbackUrl||"";$("#v2511-oauth-dialog").showModal(); }
  async function saveOAuthConfig(event) { event.preventDefault();const button=$("#v2511-oauth-save");button.disabled=true;button.textContent="Guardando…";const meta={appId:$("#v2511-meta-app").value.trim()},tiktok={clientKey:$("#v2511-tt-key").value.trim()};const metaSecret=$("#v2511-meta-secret").value.trim(),ttSecret=$("#v2511-tt-secret").value.trim();if(metaSecret)meta.appSecret=metaSecret;if(ttSecret)tiktok.clientSecret=ttSecret;try{await request("/api/social/oauth/config",{method:"PUT",body:{meta,tiktok}});await loadOAuthConfig();$("#v2511-oauth-dialog").close();notify("Configuración OAuth guardada.");}catch(error){notify(error.message||"No se pudo guardar.","warning");}finally{button.disabled=false;button.textContent="Guardar configuración";} }
  async function startOAuth(provider) { try{const result=await request(`/api/social/oauth/${encodeURIComponent(provider)}/start`);if(result.url)location.assign(result.url);}catch(error){if(/Configurá primero/i.test(error.message||"")){fillOAuthDialog();notify(error.message,"warning");}else notify(error.message||"No se pudo iniciar la conexión.","warning");} }
  function providerFromCard(card) { const title=$(".v2510-channel-title strong",card)?.textContent?.trim().toLowerCase()||"";if(title.includes("facebook"))return"facebook";if(title.includes("instagram"))return"instagram";if(title.includes("tiktok"))return"tiktok";if(title.includes("whatsapp"))return"whatsapp";return""; }
  function enhanceSocialCards() {
    const hub=$("#v2510-social-hub");if(!hub)return;const head=$(".v2510-social-head",hub);if(oauthConfig.canManage&&head&&!$("#v2511-oauth-settings",head)){const button=document.createElement("button");button.type="button";button.id="v2511-oauth-settings";button.className="v2511-oauth-settings";button.textContent="⚙ Conexión avanzada";button.addEventListener("click",fillOAuthDialog);head.appendChild(button);}
    $$(".v2510-channel-card",hub).forEach((card)=>{const provider=providerFromCard(card);if(!["facebook","instagram","tiktok"].includes(provider))return;const manual=$("[data-v2510-add]",card);if(manual){manual.textContent="Configuración manual";manual.classList.add("v2511-manual-button");}if(oauthConfig.canManage&&!$("[data-v2511-oauth]",card)){const button=document.createElement("button");button.type="button";button.className="v2511-connect-oauth";button.dataset.v2511Oauth=provider;const configured=provider==="tiktok"?oauthConfig.tiktok?.configured:oauthConfig.meta?.configured;button.textContent=(configured?"Conectar con ":"Preparar conexión con ")+(channelMeta[provider]?.label||provider);button.addEventListener("click",()=>void startOAuth(provider));if(manual)card.insertBefore(button,manual);else card.appendChild(button);}});
  }
  function observeSocialGrid() { const grid=$("#v2510-channel-grid");if(!grid||socialGridObserver)return;socialGridObserver=new MutationObserver(()=>queueMicrotask(enhanceSocialCards));socialGridObserver.observe(grid,{childList:true});enhanceSocialCards(); }
  async function loadOAuthConfig({quiet=false}={}) { if(!appVisible())return;try{oauthConfig=await request("/api/social/oauth/config");enhanceSocialCards();}catch(error){if(!quiet)notify(error.message||"No se pudo cargar OAuth.","warning");} }
  function processOAuthReturn() { const url=new URL(location.href),result=url.searchParams.get("social_oauth"),provider=url.searchParams.get("provider");if(!result)return;if(result==="success")notify((channelMeta[provider]?.label||provider||"Canal")+" conectado correctamente.");else if(result==="no_assets")notify("La autorización fue correcta, pero no se encontraron activos compatibles.","warning");else notify("La red social no pudo completar la autorización.","warning");url.searchParams.delete("social_oauth");url.searchParams.delete("provider");history.replaceState({},"",url.pathname+(url.search?url.search:"")+url.hash); }

  function boot() {
    createUnifiedInbox();createOAuthDialog();suppressLegacyInbox();processOAuthReturn();void loadOAuthConfig({quiet:true});void loadInbox({quiet:true});
    const retry=setInterval(()=>{suppressLegacyInbox();observeSocialGrid();enhanceSocialCards();if($("#v2510-social-hub")){clearInterval(retry);}},500);
    clearInterval(poll);poll=setInterval(()=>{if(appVisible()&&channelViewActive()){suppressLegacyInbox();void loadInbox({quiet:true});void loadOAuthConfig({quiet:true});}},5000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();