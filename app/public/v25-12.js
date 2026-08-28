(() => {
  "use strict";

  const $ = (selector, root=document) => root?.querySelector?.(selector) || null;
  const $$ = (selector, root=document) => Array.from(root?.querySelectorAll?.(selector) || []);
  const labels = { facebook:"Facebook", instagram:"Instagram", tiktok:"TikTok" };
  let observer = null;
  let enhancing = false;

  function notify(message, tone="warning") {
    try { if (typeof showToast === "function") return showToast(message, tone); } catch {}
    console.log(message);
  }

  async function request(url, options={}) {
    try { if (typeof api === "function") return await api(url, options); } catch (error) { throw error; }
    const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Error ${response.status}`);
    return data;
  }

  function ensureStyle() {
    if($("#v2512-social-direct-style"))return;
    const style=document.createElement("style");
    style.id="v2512-social-direct-style";
    style.textContent="#v2511-oauth-settings,.v2511-manual-button,[data-v2510-add],#v2511-oauth-dialog{display:none!important}";
    document.head.appendChild(style);
  }

  function providerFromCard(card) {
    const title=$(".v2510-channel-title strong",card)?.textContent?.trim().toLowerCase()||"";
    if(title.includes("facebook"))return "facebook";
    if(title.includes("instagram"))return "instagram";
    if(title.includes("tiktok"))return "tiktok";
    return "";
  }

  async function connect(provider, button) {
    const original=button.textContent;
    button.disabled=true;
    button.textContent="Abriendo autorización…";
    try {
      const result=await request(`/api/social/oauth/${encodeURIComponent(provider)}/start`);
      if(!result?.url)throw new Error("El proveedor no devolvió la pantalla de autorización.");
      location.assign(result.url);
    } catch (error) {
      notify(error.message||"No se pudo iniciar la conexión.","warning");
      button.disabled=false;
      button.textContent=original;
    }
  }

  function removeTechnicalUi() {
    $("#v2511-oauth-settings")?.remove();
    $("#v2511-oauth-dialog")?.remove();
    $$(".v2511-manual-button,[data-v2510-add]").forEach((node)=>node.remove());
  }

  function enhanceCards() {
    if(enhancing)return;
    enhancing=true;
    try {
      ensureStyle();
      removeTechnicalUi();
      const hub=$("#v2510-social-hub");
      if(!hub)return;
      $$(".v2510-channel-card",hub).forEach((card)=>{
        const provider=providerFromCard(card);
        if(!labels[provider])return;
        $$(".v2511-manual-button,[data-v2510-add]",card).forEach((node)=>node.remove());
        const old=$("[data-v2511-oauth]",card);
        if(!old)return;
        if(old.dataset.v2512Direct==="1"){
          old.textContent=`Conectar con ${labels[provider]}`;
          return;
        }
        const button=old.cloneNode(true);
        button.dataset.v2512Direct="1";
        button.textContent=`Conectar con ${labels[provider]}`;
        button.removeAttribute("title");
        button.addEventListener("click",(event)=>{event.preventDefault();event.stopPropagation();void connect(provider,button);});
        old.replaceWith(button);
      });
    } finally {
      enhancing=false;
    }
  }

  function boot() {
    ensureStyle();
    removeTechnicalUi();
    enhanceCards();
    const root=$("[data-view-panel='whatsapp']")||document.body;
    observer?.disconnect();
    observer=new MutationObserver(()=>queueMicrotask(enhanceCards));
    observer.observe(root,{childList:true,subtree:true});
    window.addEventListener("crm:state",()=>queueMicrotask(enhanceCards));
    const timer=setInterval(()=>{
      enhanceCards();
      if($("#v2510-social-hub"))clearInterval(timer);
    },400);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
