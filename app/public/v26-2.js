(() => {
  "use strict";

  const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
  let activeDealId="";
  let requestSequence=0;

  function esc(value){
    return String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  }

  async function request(url,options={}){
    try{
      if(typeof window.api==="function")return await window.api(url,options);
    }catch(error){throw error;}
    const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Error ${response.status}`);
    return data;
  }

  function dateLabel(value){
    try{
      if(typeof window.formatDate==="function")return window.formatDate(value);
    }catch{}
    const date=new Date(value||"");
    if(Number.isNaN(date.getTime()))return "";
    return new Intl.DateTimeFormat("es-PY",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(date);
  }

  function attachmentHtml(attachment){
    if(!attachment)return "";
    try{
      if(typeof window.attachmentMarkup==="function")return window.attachmentMarkup(attachment);
    }catch{}
    const url=attachment.url||attachment.publicUrl||attachment.path||"";
    const name=attachment.fileName||attachment.name||"Archivo";
    if(!url)return `<span class="v2511-attachment">📎 ${esc(name)}</span>`;
    if(String(attachment.mimeType||"").startsWith("image/")||attachment.kind==="image")return `<a class="v2511-media" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(name)}"></a>`;
    return `<a class="v2511-attachment" href="${esc(url)}" target="_blank" rel="noopener">📎 ${esc(name)}</a>`;
  }

  function originLabel(message){
    if(message.direction==="incoming")return "Cliente";
    if(message.origin==="bot")return "Bot";
    if(message.origin==="followup")return "Seguimiento";
    if(message.origin==="transfer")return "Transferencia interna";
    return message.agentName||"Asesor";
  }

  function renderFullHistory(messages){
    const list=$("#drawer-messages");
    if(!list)return;
    if(!Array.isArray(messages)||!messages.length){
      list.innerHTML='<div class="column-empty">Sin mensajes guardados</div>';
      return;
    }
    list.innerHTML=messages.map((message)=>{
      const classes=["message"];
      if(message.direction==="outgoing")classes.push("outgoing");
      if(message.direction==="system")classes.push("system");
      return `<div class="${classes.join(" ")}" data-v262-message="${esc(message.id||"")}">${attachmentHtml(message.attachment)}${message.text?`<p>${esc(message.text)}</p>`:""}<small>${esc(originLabel(message))} · ${esc(dateLabel(message.createdAt))}${message.historical?" · historial":""}</small></div>`;
    }).join("");
    requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight;});
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
      console.warn("V26.2: no se pudo cargar el historial completo.",error?.message||error);
    }
  }

  function installDrawerHook(){
    const original=window.openDrawer;
    if(typeof original!=="function"||original.__v262FullHistory)return;
    const wrapped=function(dealId,...args){
      activeDealId=String(dealId||"");
      const result=original.call(this,dealId,...args);
      setTimeout(()=>void loadFullHistory(activeDealId),50);
      return result;
    };
    wrapped.__v262FullHistory=true;
    wrapped.__v262Original=original;
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

    document.addEventListener("click",(event)=>{
      const button=event.target.closest?.('#branches-list [data-branch-action="connect"]');
      if(!button)return;
      event.preventDefault();
      const card=button.closest("[data-branch-id]");
      const snapshot=card?{branchId:card.dataset.branchId,top:card.getBoundingClientRect().top,scrollY:window.scrollY}:null;
      setTimeout(()=>restoreQrViewport(snapshot),250);
      setTimeout(()=>restoreQrViewport(snapshot),900);
    },true);
  }

  function trackConversationClicks(){
    if(document.documentElement.dataset.v262HistoryClicks==="1")return;
    document.documentElement.dataset.v262HistoryClicks="1";
    document.addEventListener("click",(event)=>{
      const dealButton=event.target.closest("[data-deal-id],[data-history-deal]");
      if(dealButton){
        activeDealId=dealButton.dataset.dealId||dealButton.dataset.historyDeal||activeDealId;
        setTimeout(()=>void loadFullHistory(activeDealId),80);
        return;
      }
      if(event.target.closest("#v2511-tools")){
        const active=$("#v2511-list .v2511-row.active[data-v2511-conversation]");
        const conversation=active?.dataset.v2511Conversation||"";
        if(conversation.startsWith("wa:")){
          activeDealId=conversation.slice(3);
          setTimeout(()=>void loadFullHistory(activeDealId),80);
        }
      }
    },true);
  }

  function refresh(){
    installDrawerHook();
    installQrScrollGuard();
    if($("#deal-drawer")?.classList.contains("open")&&activeDealId)setTimeout(()=>void loadFullHistory(activeDealId),0);
  }

  function boot(){
    installDrawerHook();
    installQrScrollGuard();
    trackConversationClicks();
    window.addEventListener("crm:state",refresh);
    setTimeout(installDrawerHook,500);
    setTimeout(installDrawerHook,1500);
    setTimeout(installQrScrollGuard,500);
    setTimeout(installQrScrollGuard,1500);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
