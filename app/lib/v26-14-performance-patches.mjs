import { readFileSync } from "node:fs";

function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.14 rendimiento: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.14 rendimiento: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.14 rendimiento: no se encontró inicio ${label}.`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`V26.14 rendimiento: no se encontró fin ${label}.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function optimizeUnifiedInbox(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    '  let socialGridObserver = null;',
    '  let socialGridObserver = null;\n  let inboxLoading = false;\n  let inboxSignature = "";\n  let lastInboxRenderAt = 0;\n  let oauthLoading = false;\n  let lastOAuthLoadAt = 0;',
    "estado de sincronización de bandeja",
  );

  patched = replaceOnce(
    patched,
    '  async function loadInbox({quiet=false}={}) {\n    if(!appVisible())return;createUnifiedInbox();suppressLegacyInbox();try{const data=await request("/api/omnichannel/inbox");inbox=Array.isArray(data.conversations)?data.conversations:[];if(activeId&&!inbox.some((item)=>item.id===activeId))activeId="";renderInbox();}catch(error){if(!quiet)notify(error.message||"No se pudo cargar la bandeja unificada.","warning");}\n  }',
    `  function inboxVisualSignature(items) {
    return (items || []).map((item) => {
      const messages = Array.isArray(item.messages) ? item.messages : [];
      const messagePart = item.id === activeId
        ? messages.map((message) => [message.id, message.text, message.createdAt, message.editedAt, message.status, message.attachment?.id, message.attachment?.url].join("|")).join("~")
        : String(messages.length);
      return [item.id, item.name, item.handle, item.ownerName, item.lastMessage, item.lastMessageAt, item.lastDirection, messagePart].join("¦");
    }).join("§");
  }

  async function loadInbox({quiet=false,force=false}={}) {
    if(!appVisible() || inboxLoading)return;
    createUnifiedInbox();
    suppressLegacyInbox();
    inboxLoading=true;
    try{
      const data=await request("/api/omnichannel/inbox");
      const nextInbox=Array.isArray(data.conversations)?data.conversations:[];
      inbox=nextInbox;
      if(activeId&&!inbox.some((item)=>item.id===activeId))activeId="";
      const signature=inboxVisualSignature(inbox);
      const minuteRefresh=Date.now()-lastInboxRenderAt>=60000;
      if(force||signature!==inboxSignature||minuteRefresh){
        inboxSignature=signature;
        lastInboxRenderAt=Date.now();
        renderInbox();
      }
    }catch(error){if(!quiet)notify(error.message||"No se pudo cargar la bandeja unificada.","warning");}
    finally{inboxLoading=false;}
  }`,
    "carga incremental de bandeja",
  );

  patched = replaceBetween(
    patched,
    '  function renderList() {',
    '  function renderInbox()',
    String.raw`  function v2618Signature(value) {
    const text=String(value??"");let hash=5381;
    for(let i=0;i<text.length;i++)hash=((hash<<5)+hash)^text.charCodeAt(i);
    return (hash>>>0).toString(36);
  }
  function v2618NodeFromHtml(html) {
    const template=document.createElement("template");
    template.innerHTML=String(html||"").trim();
    return template.content.firstElementChild;
  }
  function v2618ListRowHtml(item) {
    const meta=channelMeta[item.provider]||{label:item.provider,icon:"•"};
    const isPending=pending(item);
    return '<button type="button" class="v2511-row '+(isPending?'pending':'')+' '+(item.id===activeId?'active':'')+'" data-v2511-conversation="'+esc(item.id)+'"><span class="v2511-row-avatar">'+esc(String(item.name||"C").charAt(0).toUpperCase())+'<i data-channel="'+esc(item.provider)+'">'+esc(meta.icon)+'</i></span><span class="v2511-row-copy"><span><strong>'+esc(item.name||item.handle||"Cliente")+'</strong><time>'+esc(formatTime(item.lastMessageAt))+'</time></span><small>'+esc(item.lastMessage||"Sin mensajes")+'</small><em>'+esc(meta.label)+(item.ownerName?' · '+esc(item.ownerName):'')+'</em></span>'+(isPending?'<span class="v2511-pending">PENDIENTE</span>':'')+'</button>';
  }
  function renderList() {
    const list=$("#v2511-list");if(!list)return;
    const rows=filteredInbox().slice(0,400);
    const previousTop=list.scrollTop;
    if(!rows.length){
      if(!(list.children.length===1&&list.firstElementChild?.classList.contains("v2511-list-empty"))){
        const empty=document.createElement("div");empty.className="v2511-list-empty";empty.textContent="No hay conversaciones para este filtro.";list.replaceChildren(empty);
      }
      list.scrollTop=previousTop;return;
    }
    list.querySelector(".v2511-list-empty")?.remove();
    const existing=new Map(Array.from(list.querySelectorAll("[data-v2511-conversation]")).map((node)=>[node.dataset.v2511Conversation,node]));
    const wanted=new Set();
    rows.forEach((item,index)=>{
      const html=v2618ListRowHtml(item);const signature=v2618Signature(html);let node=existing.get(String(item.id));
      if(!node||node.dataset.v2618Signature!==signature){
        const next=v2618NodeFromHtml(html);next.dataset.v2618Signature=signature;
        if(node)node.replaceWith(next);node=next;
      }
      wanted.add(String(item.id));
      const current=list.children[index];if(current!==node)list.insertBefore(node,current||null);
    });
    for(const [id,node] of existing)if(!wanted.has(id)&&node.isConnected)node.remove();
    list.scrollTop=previousTop;
  }
`,
    "reconciliación incremental de lista",
  );

  patched = replaceBetween(
    patched,
    '  function renderConversation() {',
    '  function selectConversation',
    String.raw`  function v2618MessageHtml(message,key) {
    return '<article class="v2511-message '+(message.direction==="outgoing"?'out':'in')+'" data-v2618-message-key="'+esc(key)+'">'+renderAttachment(message.attachment)+(message.text?'<p>'+esc(message.text)+'</p>':'')+'<small>'+(message.direction==="outgoing"?esc(message.agentName||"Asesor"):"Cliente")+' · '+esc(formatTime(message.createdAt))+'</small></article>';
  }
  function renderConversation() {
    const item=currentConversation(),chat=$("#v2511-chat"),empty=$("#v2511-empty");if(!chat||!empty)return;
    if(!item){chat.hidden=true;empty.hidden=false;return;}chat.hidden=false;empty.hidden=true;
    const meta=channelMeta[item.provider]||{label:item.provider,icon:"•"};$("#v2511-avatar").textContent=String(item.name||"C").charAt(0).toUpperCase();$("#v2511-name").textContent=item.name||item.handle||"Cliente";$("#v2511-meta").textContent=[item.handle,item.ownerName].filter(Boolean).join(" · ")||"Conversación";$("#v2511-channel").textContent=meta.icon+" "+meta.label;$("#v2511-channel").dataset.channel=item.provider;$("#v2511-tools").hidden=item.provider!=="whatsapp";
    const messages=$("#v2511-messages"),rows=item.messages||[];
    const oldTop=messages.scrollTop,oldHeight=messages.scrollHeight,nearBottom=oldHeight-oldTop-messages.clientHeight<90;
    const active=document.activeElement,selection=active?.matches?.("#v2511-message")?{start:active.selectionStart,end:active.selectionEnd}:null;
    if(!rows.length){
      if(!(messages.children.length===1&&messages.firstElementChild?.classList.contains("v2511-list-empty"))){const emptyMessage=document.createElement("div");emptyMessage.className="v2511-list-empty";emptyMessage.textContent="Todavía no hay mensajes.";messages.replaceChildren(emptyMessage);}
    }else{
      messages.querySelector(".v2511-list-empty")?.remove();
      const existing=new Map(Array.from(messages.querySelectorAll("[data-v2618-message-key]")).map((node)=>[node.dataset.v2618MessageKey,node]));
      const wanted=new Set();
      rows.forEach((message,index)=>{
        const key=String(message.id||message.providerMessageId||((message.createdAt||"")+"|"+(message.direction||"")+"|"+index));
        const html=v2618MessageHtml(message,key);const signature=v2618Signature([html,message.editedAt||"",message.status||"",message.attachment?.id||"",message.attachment?.url||""].join("|"));let node=existing.get(key);
        if(!node||node.dataset.v2618Signature!==signature){const next=v2618NodeFromHtml(html);next.dataset.v2618Signature=signature;if(node)node.replaceWith(next);node=next;}
        wanted.add(key);const current=messages.children[index];if(current!==node)messages.insertBefore(node,current||null);
      });
      for(const [key,node] of existing)if(!wanted.has(key)&&node.isConnected)node.remove();
    }
    requestAnimationFrame(()=>{
      if(nearBottom)messages.scrollTop=messages.scrollHeight;else messages.scrollTop=Math.max(0,oldTop+Math.max(0,messages.scrollHeight-oldHeight));
      if(active?.isConnected){active.focus({preventScroll:true});if(selection&&typeof active.setSelectionRange==="function")active.setSelectionRange(selection.start,selection.end);}
    });
    const replies=quickReplies(),select=$("#v2511-quick"),previous=select?.value||"";const options='<option value="">Respuesta rápida…</option>'+replies.map((reply)=>'<option value="'+esc(reply.id)+'">'+esc(reply.title||reply.name||"Respuesta")+'</option>').join("");const optionsSignature=v2618Signature(options);if(select&&select.dataset.v2618Signature!==optionsSignature){select.innerHTML=options;select.dataset.v2618Signature=optionsSignature;if(replies.some((reply)=>reply.id===previous))select.value=previous;}
  }
`,
    "reconciliación incremental de conversación",
  );

  patched = replaceOnce(
    patched,
    '  async function loadOAuthConfig({quiet=false}={}) { if(!appVisible())return;try{oauthConfig=await request("/api/social/oauth/config");enhanceSocialCards();}catch(error){if(!quiet)notify(error.message||"No se pudo cargar OAuth.","warning");} }',
    '  async function loadOAuthConfig({quiet=false,force=false}={}) { if(!appVisible()||oauthLoading)return;if(!quiet)force=true;if(!force&&lastOAuthLoadAt&&Date.now()-lastOAuthLoadAt<60000)return;oauthLoading=true;try{oauthConfig=await request("/api/social/oauth/config");lastOAuthLoadAt=Date.now();enhanceSocialCards();}catch(error){if(!quiet)notify(error.message||"No se pudo cargar OAuth.","warning");}finally{oauthLoading=false;} }',
    "carga espaciada de OAuth",
  );

  patched = replaceOnce(
    patched,
    '    clearInterval(poll);poll=setInterval(()=>{if(appVisible()&&channelViewActive()){suppressLegacyInbox();void loadInbox({quiet:true});void loadOAuthConfig({quiet:true});}},5000);',
    '    clearInterval(poll);poll=setInterval(()=>{if(appVisible()&&channelViewActive()){suppressLegacyInbox();void loadInbox({quiet:true});if(!lastOAuthLoadAt||Date.now()-lastOAuthLoadAt>=60000)void loadOAuthConfig({quiet:true});}},4000);',
    "polling de bandeja",
  );

  return patched;
}

function optimizeCoreApp(source) {
  return replaceBetween(
    source,
    'function renderBoard() {',
    'function updateMobileStage()',
    String.raw`function v2618BoardSignature(value) {
  const text=String(value??"");let hash=5381;
  for(let i=0;i<text.length;i++)hash=((hash<<5)+hash)^text.charCodeAt(i);
  return (hash>>>0).toString(36);
}
function v2618DealNode(html) {
  const template=document.createElement("template");template.innerHTML=String(html||"").trim();return template.content.firstElementChild;
}
function v2618DealCardHtml(deal,stage) {
  const reserved=activeReserved(deal).reduce((sum,item)=>sum+Number(item.quantity||0),0);
  const heat=stage==="waiting"&&["warm","hot","red","critical"].includes(deal.heat?.level)?" heat-"+deal.heat.level:"";
  const time=stage==="waiting"?'<span class="wait-time">'+escapeHtml(elapsedLabel(deal.heat?.minutes))+'</span>':'<span>'+escapeHtml(relativeTime(deal.updatedAt))+'</span>';
  const contact=deal.contactPersonName?(deal.contactPersonName+(deal.contactRole?' · '+deal.contactRole:'')+' · '+deal.phone):deal.phone;
  const bot=deal.botActive?'BOT':(deal.botHumanHandoff?'COPILOTO':'PAUSADO');
  const owner=deal.ownerUserId?'<i>●</i><span><small>Responsable</small><strong>'+escapeHtml(deal.ownerName||"Asignado")+'</strong></span>':'<i>○</i><span><small>Responsable</small><strong>Sin responsable</strong></span>';
  const branch='⌂ '+escapeHtml(dealBranch(deal)?.name||"Sucursal")+(deal.lineId?' · ◉ '+escapeHtml((appState.whatsappLines||[]).find(line=>line.id===deal.lineId)?.name||"Línea"):"");
  return '<button class="deal-card'+heat+'" type="button" data-deal-id="'+escapeHtml(deal.id)+'"><span class="deal-top"><span class="avatar">'+escapeHtml(initials(deal.name))+'</span><span><strong>'+escapeHtml(deal.name)+'</strong><small>'+escapeHtml(contact)+'</small></span><span class="bot-badge'+(deal.botActive?'':' off')+'">'+bot+'</span></span><span class="deal-message">'+escapeHtml(deal.lastMessage||"Sin mensajes todavía")+'</span><span class="deal-owner '+(deal.ownerUserId?'assigned':'unassigned')+'">'+owner+'</span><span class="deal-branch-badge">'+branch+'</span><span class="deal-footer">'+time+(reserved?'<span class="item-badge">'+reserved+' reserv.</span>':'')+'</span></button>';
}
function v2618PatchDealList(list,entries,stage) {
  const previousTop=list.scrollTop;
  if(!entries.length){
    if(!(list.children.length===1&&list.firstElementChild?.classList.contains("column-empty"))){const empty=document.createElement("div");empty.className="column-empty";empty.textContent="No hay negociaciones";list.replaceChildren(empty);}
    list.scrollTop=previousTop;return;
  }
  list.querySelector(".column-empty")?.remove();
  const existing=new Map(Array.from(list.querySelectorAll("[data-deal-id]")).map(node=>[node.dataset.dealId,node]));
  const wanted=new Set();
  entries.forEach((deal,index)=>{
    const html=v2618DealCardHtml(deal,stage),signature=v2618BoardSignature(html);let node=existing.get(String(deal.id));
    if(!node||node.dataset.v2618Signature!==signature){const next=v2618DealNode(html);next.dataset.v2618Signature=signature;if(node)node.replaceWith(next);node=next;}
    wanted.add(String(deal.id));const current=list.children[index];if(current!==node)list.insertBefore(node,current||null);
  });
  for(const [id,node] of existing)if(!wanted.has(id)&&node.isConnected)node.remove();
  list.scrollTop=previousTop;
}
function renderBoard() {
  const search=String(typeof dealSearchTerm!=="undefined"?dealSearchTerm:"").trim().toLowerCase();
  const filter=$("#deal-filter").value;
  let deals=appState.deals||[];
  if(search)deals=deals.filter(deal=>[deal.name,deal.phone,deal.contactPersonName,deal.contactRole,deal.lastMessage].some(value=>String(value||"").toLowerCase().includes(search)));
  if(filter==="mine")deals=deals.filter(deal=>deal.ownerUserId===appState.currentUser?.id);
  if(filter==="unassigned")deals=deals.filter(deal=>!deal.ownerUserId);
  if(filter==="bot")deals=deals.filter(deal=>deal.botActive);
  if(filter==="reserved")deals=deals.filter(deal=>activeReserved(deal).length);
  $$(".board-column").forEach(column=>{
    const stage=column.dataset.stage,entries=deals.filter(deal=>deal.stage===stage),list=$(".deal-list",column);
    $("header > span",column).textContent=entries.length;
    const mobileCount=document.querySelector('[data-mobile-stage-count="'+stage+'"]');if(mobileCount)mobileCount.textContent=entries.length;
    if(list)v2618PatchDealList(list,entries,stage);
  });
  updateMobileStage();
}
`,
    "render incremental del pipeline",
  );
}

const optimizedV2511 = optimizeUnifiedInbox(readFileSync(new URL("../public/v25-11.js", import.meta.url), "utf8"));
const optimizedApp = optimizeCoreApp(readFileSync(new URL("../public/app.js", import.meta.url), "utf8"));

const assetRoute = `
app.get("/app.js", (request, response) => {
  response.type("application/javascript");
  response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  response.send(${JSON.stringify(optimizedApp)});
});
app.get("/v25-11.js", (request, response) => {
  response.type("application/javascript");
  response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  response.send(${JSON.stringify(optimizedV2511)});
});
`;

export function applyV2614PerformancePatches(source) {
  return replaceOnce(
    source,
    'app.use(express.static(publicDirectory, { extensions: ["html"] }));',
    assetRoute + '\napp.use(express.static(publicDirectory, { extensions: ["html"] }));',
    "middleware estático",
  );
}

export { optimizeCoreApp, optimizeUnifiedInbox };
