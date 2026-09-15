(() => {
  "use strict";

  const guardedIds=new Set(["v2511-messages","v2511-list","v2511-quick","drawer-messages","drawer-quick-reply"]);
  const messageIds=new Set(["v2511-messages","drawer-messages"]);
  const changedAt=new WeakMap();
  let installed=false;

  function installStableStyles(){
    if(document.querySelector("style[data-v267-stable-conversation]"))return;
    const style=document.createElement("style");
    style.dataset.v267StableConversation="1";
    style.textContent=`
      html.v267-stable-conversation #v2511-messages,
      html.v267-stable-conversation #drawer-messages{scroll-behavior:auto!important;overflow-anchor:auto}
      html.v267-stable-conversation #v2511-messages>*,
      html.v267-stable-conversation #drawer-messages>*{animation:none!important;transition:none!important}
      html.v267-stable-conversation #v2511-list>*{animation:none!important;transition:none!important}
    `;
    document.head.appendChild(style);
    document.documentElement.classList.add("v267-stable-conversation");
  }

  function drawerSemanticSignatureFromRoot(root){
    const rows=Array.from(root?.children||[]).filter((node)=>node?.matches?.(".message,[data-v262-message]"));
    if(!rows.length)return "";
    return JSON.stringify(rows.map((node)=>{
      const text=node.querySelector("p")?.textContent||"";
      const footer=node.querySelector("small")?.textContent||"";
      const origin=footer.includes(" · ")?footer.split(" · ")[0]:footer;
      const image=node.querySelector("img")?.getAttribute("src")||"";
      const media=node.querySelector("audio,video")?.getAttribute("src")||"";
      const link=node.querySelector("a")?.getAttribute("href")||"";
      const attachment=node.querySelector(".attachment,.v266-document")?.textContent||"";
      const direction=node.classList.contains("outgoing")?"outgoing":node.classList.contains("system")?"system":"incoming";
      return [direction,origin,text,image,media,link,attachment.trim()];
    }));
  }

  function drawerSemanticSignatureFromHtml(html){
    const template=document.createElement("template");
    template.innerHTML=String(html||"");
    return drawerSemanticSignatureFromRoot(template.content);
  }

  function installInnerHtmlGuard(){
    const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,"innerHTML");
    if(!descriptor?.get||!descriptor?.set||descriptor.set.__v267StableConversation)return;
    const nativeGet=descriptor.get;
    const nativeSet=descriptor.set;
    const wrapped=function(value){
      if(!guardedIds.has(this.id))return nativeSet.call(this,value);
      const next=String(value??"");
      let current="";
      try{current=nativeGet.call(this);}catch{}
      if(current===next)return;

      if(this.id==="drawer-messages"){
        const currentSemantic=drawerSemanticSignatureFromRoot(this);
        const nextSemantic=drawerSemanticSignatureFromHtml(next);
        if(currentSemantic&&currentSemantic===nextSemantic)return;
      }

      const top=Number(this.scrollTop||0);
      const height=Number(this.scrollHeight||0);
      const nearBottom=height-top-Number(this.clientHeight||0)<90;
      nativeSet.call(this,value);
      changedAt.set(this,performance.now());

      if(this.id==="v2511-list"){
        requestAnimationFrame(()=>{if(this.isConnected)this.scrollTop=top;});
      }else if(messageIds.has(this.id)&&!nearBottom){
        requestAnimationFrame(()=>{
          if(!this.isConnected)return;
          const delta=Math.max(0,Number(this.scrollHeight||0)-height);
          this.scrollTop=Math.max(0,top+delta);
        });
      }
    };
    wrapped.__v267StableConversation=true;
    Object.defineProperty(Element.prototype,"innerHTML",{
      configurable:descriptor.configurable,
      enumerable:descriptor.enumerable,
      get:nativeGet,
      set:wrapped,
    });
  }

  function installScrollGuard(){
    const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,"scrollTop");
    if(!descriptor?.get||!descriptor?.set||descriptor.set.__v267StableConversation)return;
    const nativeGet=descriptor.get;
    const nativeSet=descriptor.set;
    const wrapped=function(value){
      if(messageIds.has(this.id)){
        const age=performance.now()-(changedAt.get(this)||0);
        const current=Number(nativeGet.call(this)||0);
        const max=Math.max(0,Number(this.scrollHeight||0)-Number(this.clientHeight||0));
        const requested=Number(value||0);
        const composer=document.activeElement;
        const composing=Boolean(composer?.matches?.("#v2511-message,#manual-message"));
        const userReadingAbove=max-current>90;
        const forcingBottom=requested>=max-2;
        if(age>250&&forcingBottom&&(composing||userReadingAbove))return current;
      }
      return nativeSet.call(this,value);
    };
    wrapped.__v267StableConversation=true;
    Object.defineProperty(Element.prototype,"scrollTop",{
      configurable:descriptor.configurable,
      enumerable:descriptor.enumerable,
      get:nativeGet,
      set:wrapped,
    });
  }

  function markCurrentContent(){
    for(const id of messageIds){
      const node=document.getElementById(id);
      if(node&&!changedAt.has(node))changedAt.set(node,performance.now());
    }
  }

  function install(){
    installStableStyles();
    installInnerHtmlGuard();
    installScrollGuard();
    markCurrentContent();
    if(installed)return;
    installed=true;
    window.addEventListener("crm:state",()=>requestAnimationFrame(markCurrentContent));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)requestAnimationFrame(markCurrentContent);});
  }

  function boot(){
    install();
    setTimeout(install,250);
    setTimeout(install,900);
    setTimeout(install,2200);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
