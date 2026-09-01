(() => {
  "use strict";

  const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
  let connecting=false;

  function notify(message,tone="success"){
    try{if(typeof window.showToast==="function")return window.showToast(message,tone);}catch{}
    console.log(message);
  }

  function applyState(next){
    if(!next)return;
    try{if(typeof window.setState==="function"){window.setState(next);return;}}catch{}
    try{if(typeof setState==="function"){setState(next);return;}}catch{}
  }

  async function request(url,options={}){
    const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
    const raw=await response.text();
    let payload={};
    try{payload=raw?JSON.parse(raw):{};}catch{}
    if(!response.ok){
      if(payload?.connection||payload?.branches)applyState(payload);
      throw new Error(payload.error||`Error ${response.status}`);
    }
    return payload;
  }

  function viewportSnapshot(element=null){
    return {scrollY:window.scrollY,element,top:element?.getBoundingClientRect?.().top??null};
  }

  function restoreViewport(snapshot){
    if(!snapshot)return;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const element=snapshot.element?.isConnected?snapshot.element:null;
      if(element&&snapshot.top!==null){
        const delta=element.getBoundingClientRect().top-snapshot.top;
        if(Math.abs(delta)>1)window.scrollBy({top:delta,left:0,behavior:"auto"});
      }else if(Math.abs(window.scrollY-snapshot.scrollY)>1){
        window.scrollTo({top:snapshot.scrollY,left:0,behavior:"auto"});
      }
    }));
  }

  function branchConnectionFromState(state,branchId){
    return (state?.branches||[]).find((branch)=>branch.id===branchId)?.connection
      ||(state?.branchConnections||[]).find((connection)=>connection.branchId===branchId)
      ||null;
  }

  async function connectPrimary(button){
    if(connecting)return;
    connecting=true;
    const snapshot=viewportSnapshot(button.closest("section,article,.panel")||null);
    const original=button.textContent;
    button.disabled=true;
    button.textContent="Generando QR…";
    try{
      const state=await request("/api/connect",{method:"POST",body:"{}"});
      applyState(state);
      const connection=state.connection||{};
      if(connection.status==="qr"&&connection.qr)notify("QR listo para escanear");
      else if(connection.status==="connected")notify("WhatsApp ya está conectado");
      else throw new Error(connection.error||"WhatsApp no entregó el código QR. Volvé a intentarlo.");
    }catch(error){
      notify(error?.message||"No se pudo generar el QR.","warning");
    }finally{
      restoreViewport(snapshot);
      if(button.isConnected){button.disabled=false;button.textContent=original;}
      connecting=false;
    }
  }

  async function connectBranch(button){
    if(connecting)return;
    const card=button.closest("[data-branch-id]");
    const branchId=card?.dataset.branchId||"";
    if(!branchId)return;
    connecting=true;
    const snapshot=viewportSnapshot(card);
    const original=button.textContent;
    button.disabled=true;
    button.textContent="Generando QR…";
    try{
      const state=await request(`/api/branches/${encodeURIComponent(branchId)}/connect`,{method:"POST",body:"{}"});
      applyState(state);
      const connection=branchConnectionFromState(state,branchId)||{};
      if(connection.status==="qr"&&connection.qr)notify("QR listo para escanear");
      else if(connection.status==="connected")notify("WhatsApp ya está conectado");
      else throw new Error(connection.error||"WhatsApp no entregó el código QR. Volvé a intentarlo.");
    }catch(error){
      notify(error?.message||"No se pudo generar el QR.","warning");
    }finally{
      restoreViewport(snapshot);
      if(button.isConnected){button.disabled=false;button.textContent=original;}
      connecting=false;
    }
  }

  function install(){
    if(document.documentElement.dataset.v263QrUi==="1")return;
    document.documentElement.dataset.v263QrUi="1";
    document.addEventListener("click",(event)=>{
      const primary=event.target.closest?.("#connect-button");
      if(primary){
        event.preventDefault();
        event.stopImmediatePropagation();
        void connectPrimary(primary);
        return;
      }
      const branch=event.target.closest?.('#branches-list [data-branch-action="connect"]');
      if(branch){
        event.preventDefault();
        event.stopImmediatePropagation();
        void connectBranch(branch);
      }
    },true);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
