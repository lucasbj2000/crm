(() => {
  "use strict";

  // Compatibilidad V26.2.1 preservada: /v26-2.css?v=26021 · /v26-2.js?v=26021
  // V26.8 agrega soporte visual de mensajes editados sobre V26.7.
  const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
  const $$=(selector,root=document)=>Array.from(root?.querySelectorAll?.(selector)||[]);
  let attempts=0;

  function loadV268Assets(){
    if(document.querySelector("script[data-v268]"))return;
    const script=document.createElement("script");
    script.src="/v26-8.js?v=26080";
    script.async=false;
    script.dataset.v268="1";
    document.head.appendChild(script);
  }

  function loadV267Assets(){
    const existing=document.querySelector("script[data-v267]");
    if(!existing){
      const script=document.createElement("script");
      script.src="/v26-7.js?v=26070";
      script.async=false;
      script.dataset.v267="1";
      script.onload=loadV268Assets;
      document.head.appendChild(script);
    }else{
      loadV268Assets();
    }
  }

  function loadV266Assets(){
    if(!document.querySelector("link[data-v266]")){
      const link=document.createElement("link");
      link.rel="stylesheet";
      link.href="/v26-6.css?v=26060";
      link.dataset.v266="1";
      document.head.appendChild(link);
    }
    const existing=document.querySelector("script[data-v266]");
    if(!existing){
      const script=document.createElement("script");
      script.src="/v26-6.js?v=26060";
      script.async=false;
      script.dataset.v266="1";
      script.onload=loadV267Assets;
      document.head.appendChild(script);
    }else{
      loadV267Assets();
    }
  }

  function loadV262Assets(){
    if(!document.querySelector("link[data-v262]")){
      const link=document.createElement("link");
      link.rel="stylesheet";
      link.href="/v26-2.css?v=26060";
      link.dataset.v262="1";
      document.head.appendChild(link);
    }
    if(!document.querySelector("script[data-v262]")){
      const script=document.createElement("script");
      script.src="/v26-2.js?v=26060";
      script.async=false;
      script.dataset.v262="1";
      document.head.appendChild(script);
    }
    if(!document.querySelector("script[data-v263]")){
      const script=document.createElement("script");
      script.src="/v26-3.js?v=26030";
      script.async=false;
      script.dataset.v263="1";
      document.head.appendChild(script);
    }
    if(!document.querySelector("link[data-v264]")){
      const link=document.createElement("link");
      link.rel="stylesheet";
      link.href="/v26-4.css?v=26040";
      link.dataset.v264="1";
      document.head.appendChild(link);
    }
    const v264=document.querySelector("script[data-v264]");
    if(!v264){
      const script=document.createElement("script");
      script.src="/v26-4.js?v=26040";
      script.async=false;
      script.dataset.v264="1";
      script.onload=loadV266Assets;
      document.head.appendChild(script);
    }else{
      loadV266Assets();
    }
  }

  function hourGreeting(){
    const hour=new Date().getHours();
    if(hour<12)return "Buenos días";
    if(hour<19)return "Buenas tardes";
    return "Buenas noches";
  }

  function firstName(){
    const text=$("#current-user-name")?.textContent?.trim()||"";
    return text.split(/\s+/)[0]||"";
  }

  function clickExisting(selector){
    const target=$(selector);
    if(!target)return false;
    target.click();
    return true;
  }

  function openNewClient(){
    if(clickExisting("#new-client-button"))return;
    clickExisting('[data-view="crm"]');
    setTimeout(()=>$("#new-client-button")?.click(),80);
  }

  function openContacts(){
    if(clickExisting("[data-v254-contacts-nav]"))return;
    clickExisting('[data-view="crm"]');
  }

  function ensureWelcome(){
    const view=$("[data-view-panel='crm']");
    if(!view||$("#v26-welcome",view))return;
    const block=document.createElement("section");
    block.id="v26-welcome";
    block.className="v26-welcome";
    block.innerHTML=`
      <div class="v26-welcome-copy">
        <small>RESUMEN DE HOY</small>
        <h1 id="v26-greeting">${hourGreeting()}</h1>
        <p>Conversaciones, clientes y oportunidades importantes en un solo lugar.</p>
      </div>
      <div class="v26-welcome-actions">
        <button type="button" class="primary" data-v26-quick="new">＋ Nuevo cliente</button>
        <button type="button" data-v26-quick="chats">Conversaciones</button>
        <button type="button" data-v26-quick="contacts">Clientes</button>
      </div>`;
    const metric=$(".metric-grid",view);
    view.insertBefore(block,metric||view.firstChild);
    block.addEventListener("click",(event)=>{
      const button=event.target.closest("[data-v26-quick]");
      if(!button)return;
      if(button.dataset.v26Quick==="new")openNewClient();
      if(button.dataset.v26Quick==="chats")clickExisting('[data-view="whatsapp"]');
      if(button.dataset.v26Quick==="contacts")openContacts();
    });
    updateWelcome();
  }

  function updateWelcome(){
    const greeting=$("#v26-greeting");
    if(!greeting)return;
    const name=firstName();
    greeting.textContent=name?`${hourGreeting()}, ${name}`:hourGreeting();
  }

  function removeUnstableV26Controls(){
    $("#v26-sidebar-toggle")?.remove();
    $("#v26-mobile-nav")?.remove();
    $("#v26-theme-toggle")?.remove();
    const shell=$("#app-shell");
    shell?.classList.remove("v26-sidebar-collapsed","v26-mobile-more-open");
  }

  function refresh(){
    removeUnstableV26Controls();
    ensureWelcome();
    updateWelcome();
  }

  function waitForApp(){
    refresh();
    attempts+=1;
    if(attempts<12&&(!$("#app-shell")||!$("#v26-welcome")))setTimeout(waitForApp,300);
  }

  function boot(){
    document.documentElement.classList.add("v26-ready");
    document.documentElement.removeAttribute("data-v26-theme");
    document.documentElement.removeAttribute("data-v26-theme-mode");
    loadV262Assets();
    waitForApp();
    window.addEventListener("crm:state",()=>setTimeout(refresh,0));
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
