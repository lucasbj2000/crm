(() => {
  "use strict";

  const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
  const $$=(selector,root=document)=>Array.from(root?.querySelectorAll?.(selector)||[]);
  const storage={
    get(key,fallback=""){try{return localStorage.getItem(key)||fallback}catch{return fallback}},
    set(key,value){try{localStorage.setItem(key,value)}catch{}},
  };

  let currentMobileView="crm";
  let stateAttempts=0;

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

  function themePreference(){
    const value=storage.get("crm_v26_theme","system");
    return ["light","dark","system"].includes(value)?value:"system";
  }

  function actualTheme(mode=themePreference()){
    if(mode==="dark")return "dark";
    if(mode==="light")return "light";
    return matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
  }

  function applyTheme(mode=themePreference()){
    const actual=actualTheme(mode);
    document.documentElement.dataset.v26Theme=actual;
    document.documentElement.dataset.v26ThemeMode=mode;
    const toggle=$("#v26-theme-toggle");
    if(toggle){
      toggle.textContent=mode==="system"?"◐":mode==="dark"?"☾":"☀";
      toggle.title=`Tema: ${mode==="system"?"Sistema":mode==="dark"?"Oscuro":"Claro"}. Tocá para cambiar.`;
      toggle.setAttribute("aria-label",toggle.title);
    }
  }

  function cycleTheme(){
    const mode=themePreference();
    const next=mode==="system"?"light":mode==="light"?"dark":"system";
    storage.set("crm_v26_theme",next);
    applyTheme(next);
  }

  function ensureThemeToggle(){
    if($("#v26-theme-toggle"))return;
    const actions=$(".workspace-header .header-actions");
    if(!actions)return;
    const button=document.createElement("button");
    button.id="v26-theme-toggle";
    button.className="v26-theme-toggle";
    button.type="button";
    button.addEventListener("click",cycleTheme);
    const refresh=$("#refresh-button",actions);
    actions.insertBefore(button,refresh||actions.firstChild);
    applyTheme();
  }

  function ensureSidebarToggle(){
    const shell=$("#app-shell"),brand=$(".sidebar-brand");
    if(!shell||!brand||$("#v26-sidebar-toggle"))return;
    const button=document.createElement("button");
    button.id="v26-sidebar-toggle";
    button.className="v26-sidebar-toggle";
    button.type="button";
    button.textContent="‹";
    button.title="Compactar navegación";
    button.setAttribute("aria-label","Compactar o ampliar navegación");
    brand.appendChild(button);

    const saved=storage.get("crm_v26_sidebar","expanded");
    shell.classList.toggle("v26-sidebar-collapsed",saved==="collapsed");
    button.textContent=saved==="collapsed"?"›":"‹";

    button.addEventListener("click",()=>{
      const collapsed=shell.classList.toggle("v26-sidebar-collapsed");
      storage.set("crm_v26_sidebar",collapsed?"collapsed":"expanded");
      button.textContent=collapsed?"›":"‹";
    });
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

  function openView(view){
    if(view==="contacts"){openContacts();return;}
    if(view==="crm"||view==="whatsapp")clickExisting(`[data-view="${view}"]`);
  }

  function setMobileActive(view){
    currentMobileView=view;
    $$("#v26-mobile-nav [data-v26-view]").forEach((button)=>button.classList.toggle("active",button.dataset.v26View===view));
  }

  function ensureMobileNav(){
    if($("#v26-mobile-nav"))return;
    const nav=document.createElement("nav");
    nav.id="v26-mobile-nav";
    nav.className="v26-mobile-nav";
    nav.setAttribute("aria-label","Navegación móvil");
    nav.innerHTML=`
      <button type="button" class="active" data-v26-view="crm"><span>⌂</span><b>Inicio</b></button>
      <button type="button" data-v26-view="whatsapp"><span>◉</span><b>Chats</b></button>
      <button type="button" data-v26-action="new"><span>＋</span><b>Nuevo</b></button>
      <button type="button" data-v26-view="contacts"><span>◎</span><b>Clientes</b></button>
      <button type="button" data-v26-action="more"><span>☰</span><b>Más</b></button>`;
    document.body.appendChild(nav);

    nav.addEventListener("click",(event)=>{
      const button=event.target.closest("button");
      if(!button)return;
      const view=button.dataset.v26View;
      const action=button.dataset.v26Action;
      if(view){
        openView(view);
        setMobileActive(view);
        $("#app-shell")?.classList.remove("v26-mobile-more-open");
      }else if(action==="new"){
        openNewClient();
        $("#app-shell")?.classList.remove("v26-mobile-more-open");
      }else if(action==="more"){
        $("#app-shell")?.classList.toggle("v26-mobile-more-open");
      }
    });
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
        <p>Tené a mano lo importante: conversaciones, clientes y oportunidades que necesitan atención.</p>
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
      const action=button.dataset.v26Quick;
      if(action==="new")openNewClient();
      if(action==="chats"){openView("whatsapp");setMobileActive("whatsapp")}
      if(action==="contacts"){openContacts();setMobileActive("contacts")}
    });
    updateWelcome();
  }

  function updateWelcome(){
    const greeting=$("#v26-greeting");
    if(!greeting)return;
    const name=firstName();
    greeting.textContent=name?`${hourGreeting()}, ${name}`:hourGreeting();
  }

  function bindNavigationTracking(){
    const nav=$(".nav-list");
    if(!nav||nav.dataset.v26Bound==="1")return;
    nav.dataset.v26Bound="1";
    nav.addEventListener("click",(event)=>{
      const button=event.target.closest(".nav-item, [data-v254-contacts-nav]");
      if(!button)return;
      if(button.matches("[data-v254-contacts-nav]"))setMobileActive("contacts");
      else if(button.dataset.view==="whatsapp")setMobileActive("whatsapp");
      else if(button.dataset.view==="crm")setMobileActive("crm");
      $("#app-shell")?.classList.remove("v26-mobile-more-open");
    });
  }

  function syncCompanyColors(){
    const root=document.documentElement;
    const computed=getComputedStyle(root);
    const primary=computed.getPropertyValue("--primary").trim();
    const accent=computed.getPropertyValue("--accent").trim();
    if(primary)root.style.setProperty("--crm-primary",primary);
    if(accent)root.style.setProperty("--crm-accent",accent);
  }

  function refreshV26(){
    ensureThemeToggle();
    ensureSidebarToggle();
    ensureMobileNav();
    ensureWelcome();
    bindNavigationTracking();
    updateWelcome();
    syncCompanyColors();
  }

  function waitForApp(){
    refreshV26();
    stateAttempts+=1;
    if(stateAttempts<12&&(!$("#app-shell")||!$("#v26-welcome")))setTimeout(waitForApp,350);
  }

  function boot(){
    document.documentElement.classList.add("v26-ready");
    applyTheme();
    waitForApp();
    window.addEventListener("crm:state",()=>setTimeout(refreshV26,0));
    window.addEventListener("resize",()=>{
      if(innerWidth>760)$("#app-shell")?.classList.remove("v26-mobile-more-open");
    },{passive:true});
    document.addEventListener("keydown",(event)=>{
      if(event.key==="Escape")$("#app-shell")?.classList.remove("v26-mobile-more-open");
    });
    try{
      const media=matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener?.("change",()=>{if(themePreference()==="system")applyTheme("system")});
    }catch{}
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
