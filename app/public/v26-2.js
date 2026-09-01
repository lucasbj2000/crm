(() => {
  "use strict";

  const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
  let activeDealId="";
  let requestSequence=0;
  let historyTimer=null;
  let periodicTimer=null;
  const retryBusy=new Set();

  function esc(value){
    return String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;"," ":" ",'"':"&quot;","'":"&#39;","<":"&lt;",">":"&gt;"})[char]||char);
  }

  async function request(url,options={}){
    if(typeof window.api==="function")return window.api(url,options);
    const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Error ${response.status}`);
    return data;
  }

  function notify(message,tone="warning"){
    try{if(typeof window.showToast==="function")return window.showToast(message,tone);}catch{}
    console[tone==="warning"?"warn":"log"](message);
  }

  function dateLabel(value){
    const date=new Date(value||"");
    if(Number.isNaN(date.getTime()))return "";
    return new Intl.DateTimeFormat("es-PY",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(date);
  }

  function mediaUrl(attachment){
    if(attachment?.url)return attachment.url;
    return attachment?.available!==false&&attachment?.id?`/api/media/${encodeURIComponent(attachment.id)}`:"";
  }

  function attachmentHtml(attachment){
    if(!attachment)return "";
    const id=String(attachment.id||"");
    const name=attachment.fileName||"Archivo";
    const url=mediaUrl(attachment);
    const mime=String(attachment.mimeType||"");
    const kind=attachment.kind||(
      mime.startsWith("image/")?"image":mime.startsWith("video/")?"video":mime.startsWith("audio/")?"audio":"document"
    );

    if(!attachment.available||!url){
      const retryable=attachment.retryable!==false&&Boolean(id);
      const detail=attachment.error?esc(attachment.error):"WhatsApp todavía no entregó el archivo al CRM.";
      return `<div class="attachment unavailable v266-unavailable" data-v266-attachment="${esc(id)}"><span>□</span><div><strong>${esc(name)}</strong><small>${detail}</small>${retryable?`<button type="button" class="v266-retry-media" data-v266-media-retry="${esc(id)}">↻ Reintentar archivo</button>`:""}</div></div>`;
    }

    if(kind==="image"||kind==="sticker"||mime.startsWith("image/")){
      return `<button type="button" class="v266-inline-image${kind==="sticker"?" sticker":""}" data-v266-open-media="${esc(url)}" data-v266-media-name="${esc(name)}"><img src="${esc(url)}" alt="${esc(name)}" loading="lazy"/></button>`;
    }
    if(kind==="video"||mime.startsWith("video/")){
      return `<div class="v266-inline-video"><video controls preload="metadata" playsinline src="${esc(url)}"></video><a href="${esc(url)}" target="_blank" rel="noopener">Abrir video</a></div>`;
    }
    if(kind==="audio"||mime.startsWith("audio/")){
      return `<div class="v266-inline-audio"><audio controls preload="metadata" src="${esc(url)}"></audio><small>${esc(name)}</small></div>`;
    }
    return `<a class="v266-document" href="${esc(url)}" target="_blank" rel="noopener" download="${esc(name)}"><span>□</span><div><strong>${esc(name)}</strong><small>Abrir / descargar archivo</small></div></a>`;
  }

  function originLabel(message){
    if(message.direction==="incoming")return "Cliente";
    if(message.origin==="bot")return "Bot";
    if(message.origin==="followup")return "Seguimiento";
    if(message.origin==="transfer")return "Transferencia interna";
    return message.agentName||"Asesor";
  }

  function signature(message){
    const a=message.attachment||{};
    const raw=[message.direction,message.origin,message.text,message.createdAt,message.historical,a.id,a.available,a.url,a.kind,a.fileName,a.mimeType,a.size,a.error,a.retryable].join("¦");
    let hash=2166136261;
    for(let i=0;i<raw.length;i+=1){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return (hash>>>0).toString(36);
  }

  function messageHtml(message){
    const classes=["message"];
    if(message.direction==="outgoing")classes.push("outgoing");
    if(message.direction==="system")classes.push("system");
    const id=String(message.id||`${message.createdAt||""}-${message.direction||""}`);
    return `<div class="${classes.join(" ")}" data-v262-message="${esc(id)}" data-v266-signature="${esc(signature(message))}">${attachmentHtml(message.attachment)}${message.text?`<p>${esc(message.text)}</p>`:""}<small>${esc(originLabel(message))} · ${esc(dateLabel(message.createdAt))}${message.historical?" · historial":""}</small></div>`;
  }

  function nodeFromHtml(html){
    const template=document.createElement("template");
    template.innerHTML=html.trim();
    return template.content.firstElementChild;
  }

  function renderFullHistory(messages){
    const list=$("#drawer-messages");
    if(!list)return;
    const rows=Array.isArray(messages)?messages:[];
    const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<90;
    const oldTop=list.scrollTop;
    const oldHeight=list.scrollHeight;

    if(!rows.length){
      if(!list.querySelector(".column-empty"))list.innerHTML='<div class="column-empty">Sin mensajes guardados</div>';
      return;
    }

    const managed=list.querySelector("[data-v262-message]");
    if(!managed){
      list.innerHTML=rows.map(messageHtml).join("");
      requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight;});
      return;
    }

    list.querySelector(".column-empty")?.remove();
    const wanted=new Set();
    for(const message of rows){
      const id=String(message.id||`${message.createdAt||""}-${message.direction||""}`);
      wanted.add(id);
      let node=list.querySelector(`[data-v262-message="${CSS.escape(id)}"]`);
      const nextSignature=signature(message);
      if(!node){
        node=nodeFromHtml(messageHtml(message));
        if(node)list.appendChild(node);
      }else if(node.dataset.v266Signature!==nextSignature){
        const replacement=nodeFromHtml(messageHtml(message));
        if(replacement){node.replaceWith(replacement);node=replacement;}
      }
      if(node)list.appendChild(node);
    }
    list.querySelectorAll("[data-v262-message]").forEach((node)=>{if(!wanted.has(node.dataset.v262Message||""))node.remove();});

    requestAnimationFrame(()=>{
      if(nearBottom)list.scrollTop=list.scrollHeight;
      else list.scrollTop=Math.max(0,oldTop+Math.max(0,list.scrollHeight-oldHeight));
    });
  }

  async function loadFullHistory(dealId=activeDealId){
    const drawer=$("#deal-drawer");
    if(!dealId||!drawer?.classList.contains("open"))return;
    activeDealId=dealId;
    const sequence=++requestSequence;
    try{
      const result=await request(`/api/deals/${encodeURIComponent(dealId)}/full-history`);
      if(sequence!==requestSequence||activeDealId!==dealId||!drawer.classList.contains("open"))return;
      renderFullHistory(result.messages||[]);
    }catch(error){
      console.warn("V26.6: no se pudo sincronizar el historial.",error?.message||error);
    }
  }

  function scheduleHistorySync(delay=80){
    clearTimeout(historyTimer);
    historyTimer=setTimeout(()=>void loadFullHistory(activeDealId),delay);
  }

  async function retryMedia(id,button){
    if(!id||retryBusy.has(id))return;
    retryBusy.add(id);
    const original=button?.textContent||"↻ Reintentar archivo";
    if(button){button.disabled=true;button.textContent="Recuperando…";}
    try{
      const result=await request(`/api/media/${encodeURIComponent(id)}/retry`,{method:"POST",body:"{}"});
      if(result?.attachment?.available)notify("Archivo recuperado","success");
      else notify(result?.attachment?.error||"WhatsApp todavía no entregó el archivo.","warning");
      scheduleHistorySync(50);
    }catch(error){
      notify(error.message||"No se pudo recuperar el archivo.","warning");
    }finally{
      retryBusy.delete(id);
      if(button){button.disabled=false;button.textContent=original;}
    }
  }

  function ensureViewer(){
    let viewer=$("#v266-media-viewer");
    if(viewer)return viewer;
    viewer=document.createElement("div");
    viewer.id="v266-media-viewer";
    viewer.className="v266-media-viewer";
    viewer.hidden=true;
    viewer.innerHTML='<button type="button" class="v266-viewer-close" aria-label="Cerrar">×</button><div class="v266-viewer-body"></div>';
    document.body.appendChild(viewer);
    viewer.addEventListener("click",(event)=>{if(event.target===viewer||event.target.closest(".v266-viewer-close")){viewer.hidden=true;$(".v266-viewer-body",viewer).innerHTML="";}});
    return viewer;
  }

  function openImage(url,name){
    const viewer=ensureViewer();
    $(".v266-viewer-body",viewer).innerHTML=`<img src="${esc(url)}" alt="${esc(name||"Imagen")}"/><a href="${esc(url)}" target="_blank" rel="noopener">Abrir en pestaña nueva</a>`;
    viewer.hidden=false;
  }

  function installDrawerHook(){
    const original=window.openDrawer;
    if(typeof original!=="function"||original.__v266FullHistory)return;
    const wrapped=function(dealId,...args){
      activeDealId=String(dealId||"");
      const result=original.call(this,dealId,...args);
      scheduleHistorySync(40);
      return result;
    };
    wrapped.__v266FullHistory=true;
    wrapped.__v262FullHistory=true;
    wrapped.__v266Original=original;
    window.openDrawer=wrapped;
  }

  function qrViewport(path){
    const match=String(path||"").match(/\/api\/branches\/([^/]+)\/connect$/);
    if(!match)return null;
    let branchId="";
    try{branchId=decodeURIComponent(match[1]);}catch{branchId=match[1];}
    const card=document.querySelector(`[data-branch-id="${CSS.escape(branchId)}"]`);
    return {branchId,top:card?.getBoundingClientRect().top??null,scrollY:window.scrollY};
  }

  function restoreQrViewport(snapshot){
    if(!snapshot)return;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const card=document.querySelector(`[data-branch-id="${CSS.escape(snapshot.branchId)}"]`);
      if(card&&snapshot.top!==null){
        const delta=card.getBoundingClientRect().top-snapshot.top;
        if(Math.abs(delta)>1)window.scrollBy({top:delta,left:0,behavior:"auto"});
      }else if(Math.abs(window.scrollY-snapshot.scrollY)>1){
        window.scrollTo({top:snapshot.scrollY,left:0,behavior:"auto"});
      }
    }));
  }

  function installQrScrollGuard(){
    const original=window.mutate;
    if(typeof original!=="function"||original.__v262QrScroll)return;
    const wrapped=async function(path,method,body,...rest){
      const snapshot=qrViewport(path);
      try{return await original.call(this,path,method,body,...rest);}
      finally{restoreQrViewport(snapshot);}
    };
    wrapped.__v262QrScroll=true;
    wrapped.__v262Original=original;
    window.mutate=wrapped;
  }

  function trackConversationClicks(){
    if(document.documentElement.dataset.v266HistoryClicks==="1")return;
    document.documentElement.dataset.v266HistoryClicks="1";
    document.addEventListener("click",(event)=>{
      const retry=event.target.closest?.("[data-v266-media-retry]");
      if(retry){event.preventDefault();void retryMedia(retry.dataset.v266MediaRetry,retry);return;}
      const opener=event.target.closest?.("[data-v266-open-media]");
      if(opener){event.preventDefault();openImage(opener.dataset.v266OpenMedia,opener.dataset.v266MediaName);return;}
      const dealButton=event.target.closest?.("[data-deal-id],[data-history-deal]");
      if(dealButton){activeDealId=dealButton.dataset.dealId||dealButton.dataset.historyDeal||activeDealId;scheduleHistorySync(70);return;}
      if(event.target.closest?.("#v2511-tools")){
        const active=$("#v2511-list .v2511-row.active[data-v2511-conversation]");
        const conversation=active?.dataset.v2511Conversation||"";
        if(conversation.startsWith("wa:")){activeDealId=conversation.slice(3);scheduleHistorySync(70);}
      }
    },true);
  }

  function refresh(){
    installDrawerHook();
    installQrScrollGuard();
    if($("#deal-drawer")?.classList.contains("open")&&activeDealId)scheduleHistorySync(100);
  }

  function periodic(){
    clearTimeout(periodicTimer);
    periodicTimer=setTimeout(()=>{
      if($("#deal-drawer")?.classList.contains("open")&&activeDealId)void loadFullHistory(activeDealId);
      periodic();
    },3000);
  }

  function boot(){
    installDrawerHook();
    installQrScrollGuard();
    trackConversationClicks();
    ensureViewer();
    window.addEventListener("crm:state",refresh);
    setTimeout(installDrawerHook,500);
    setTimeout(installDrawerHook,1500);
    setTimeout(installQrScrollGuard,500);
    periodic();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
