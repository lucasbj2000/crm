(() => {
  "use strict";

  const editedByDeal=new Map();
  let installed=false;

  function installStyles(){
    if(document.querySelector("style[data-v268-edited]"))return;
    const style=document.createElement("style");
    style.dataset.v268Edited="1";
    style.textContent=`
      .v268-edited-label{opacity:.68;font-size:10px;font-style:italic;margin-left:4px;white-space:nowrap}
    `;
    document.head.appendChild(style);
  }

  function remember(dealId,messages){
    if(!dealId)return;
    const rows=Array.isArray(messages)?messages:[];
    editedByDeal.set(String(dealId),rows.map((message)=>({
      id:String(message?.id||""),
      edited:message?.edited===true||Boolean(message?.editedAt),
    })));
  }

  function decorateDrawer(dealId){
    const rows=editedByDeal.get(String(dealId||""))||[];
    for(const row of rows){
      if(!row.edited||!row.id)continue;
      let node=null;
      try{node=document.querySelector(`[data-v262-message="${CSS.escape(row.id)}"]`);}catch{}
      const small=node?.querySelector?.(":scope > small");
      if(!small||small.querySelector(".v268-edited-label"))continue;
      const label=document.createElement("span");
      label.className="v268-edited-label";
      label.textContent="· editado";
      small.append(" ",label);
    }
  }

  function activeWhatsappDealId(){
    const active=document.querySelector("#v2511-list .v2511-row.active[data-v2511-conversation]");
    const conversation=String(active?.dataset?.v2511Conversation||"");
    return conversation.startsWith("wa:")?conversation.slice(3):"";
  }

  function decorateUnified(dealId=activeWhatsappDealId()){
    if(!dealId)return;
    const rows=editedByDeal.get(String(dealId))||[];
    const nodes=Array.from(document.querySelectorAll("#v2511-messages .v2511-message"));
    if(!nodes.length)return;
    rows.forEach((row,index)=>{
      if(!row.edited)return;
      const small=nodes[index]?.querySelector?.("small");
      if(!small||small.querySelector(".v268-edited-label"))return;
      const label=document.createElement("span");
      label.className="v268-edited-label";
      label.textContent="· editado";
      small.append(" ",label);
    });
  }

  function scheduleDecorate(dealId=""){
    setTimeout(()=>{
      if(dealId)decorateDrawer(dealId);
      decorateUnified();
    },0);
    setTimeout(()=>{
      if(dealId)decorateDrawer(dealId);
      decorateUnified();
    },80);
  }

  function captureApiResult(url,result){
    const path=String(url||"").split("?")[0];
    const full=path.match(/^\/api\/deals\/([^/]+)\/full-history$/);
    if(full){
      let dealId="";
      try{dealId=decodeURIComponent(full[1]);}catch{dealId=full[1];}
      remember(dealId,result?.messages);
      scheduleDecorate(dealId);
      return;
    }
    if(path==="/api/omnichannel/inbox"){
      for(const conversation of result?.conversations||[]){
        if(conversation?.provider!=="whatsapp"||!conversation?.entityId)continue;
        remember(conversation.entityId,conversation.messages);
      }
      scheduleDecorate();
    }
  }

  function installApiWrapper(){
    const original=window.api;
    if(typeof original!=="function"||original.__v268EditedMessages)return;
    const wrapped=async function(url,options={},...rest){
      const result=await original.call(this,url,options,...rest);
      try{captureApiResult(url,result);}catch(error){console.warn("V26.8 edited label",error?.message||error);}
      return result;
    };
    wrapped.__v268EditedMessages=true;
    wrapped.__v268Original=original;
    window.api=wrapped;
  }

  function install(){
    installStyles();
    installApiWrapper();
    if(installed)return;
    installed=true;
    document.addEventListener("click",(event)=>{
      if(event.target.closest?.("[data-v2511-conversation],#v2511-tools,[data-deal-id]"))scheduleDecorate();
    },true);
    window.addEventListener("crm:state",()=>requestAnimationFrame(()=>{installApiWrapper();scheduleDecorate();}));
  }

  function boot(){
    install();
    setTimeout(install,300);
    setTimeout(install,1200);
    setTimeout(install,2600);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
