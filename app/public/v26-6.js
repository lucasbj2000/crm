(() => {
  "use strict";

  const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
  let backgroundStateObject=null;
  let lastLiveCompletedAt=0;
  let installed=false;

  function appVisible(){
    const shell=$("#app-shell");
    return Boolean(shell&&!shell.hidden);
  }

  function activeView(){
    return $("[data-view-panel].active")?.dataset?.viewPanel||"";
  }

  function drawerOpen(){
    return $("#deal-drawer")?.classList.contains("open")===true;
  }

  function captureViewport(){
    const messages=$("#drawer-messages");
    return {
      x:window.scrollX,
      y:window.scrollY,
      messages:messages?{
        top:messages.scrollTop,
        height:messages.scrollHeight,
        nearBottom:messages.scrollHeight-messages.scrollTop-messages.clientHeight<90,
      }:null,
    };
  }

  function restoreViewport(snapshot){
    if(!snapshot)return;
    window.scrollTo({left:snapshot.x,top:snapshot.y,behavior:"auto"});
    const messages=$("#drawer-messages");
    if(messages&&snapshot.messages){
      if(snapshot.messages.nearBottom)messages.scrollTop=messages.scrollHeight;
      else messages.scrollTop=Math.max(0,snapshot.messages.top+Math.max(0,messages.scrollHeight-snapshot.messages.height));
    }
  }

  function withSilentDom(callback){
    const root=document.documentElement;
    const snapshot=captureViewport();
    const originalMotion=window.motionEnabled;
    root.classList.add("v266-silent-sync");
    if(typeof originalMotion==="function")window.motionEnabled=()=>false;
    try{return callback();}
    finally{
      if(typeof originalMotion==="function")window.motionEnabled=originalMotion;
      restoreViewport(snapshot);
      requestAnimationFrame(()=>root.classList.remove("v266-silent-sync"));
    }
  }

  function renderVisibleSlice(){
    if(!appVisible())return;
    withSilentDom(()=>{
      try{window.renderMetrics?.();}catch{}
      const view=activeView();
      if(view==="crm"&&!drawerOpen()){try{window.renderBoard?.();}catch{}}
      if(view==="stock"){try{window.renderStock?.();}catch{}}
      if(view==="branches"){try{window.renderBranches?.();}catch{}}
      if(view==="attendance"){try{window.renderAttendance?.();}catch{}}
      if(view==="replies"){try{window.renderQuickReplies?.();}catch{}}
      if(view==="news"){try{window.renderNews?.();}catch{}}
      if(view==="whatsapp"){try{window.renderConnection?.();}catch{}}
    });
  }

  function installApiTracker(){
    const original=window.api;
    if(typeof original!=="function"||original.__v266SilentTracker)return;
    const wrapped=async function(url,options={},...rest){
      const result=await original.call(this,url,options,...rest);
      const path=String(url||"").split("?")[0];
      if(path==="/api/live")lastLiveCompletedAt=performance.now();
      if(path==="/api/state"&&performance.now()-lastLiveCompletedAt<1800&&!(options&&options.__v266UserRefresh)){
        backgroundStateObject=result;
      }
      return result;
    };
    wrapped.__v266SilentTracker=true;
    wrapped.__v266Original=original;
    window.api=wrapped;
  }

  function installStateWrapper(){
    const original=window.setState;
    if(typeof original!=="function"||original.__v266SilentState)return;
    const wrapped=function(next,options={},...rest){
      const silent=next===backgroundStateObject&&options?.hydrateSettings!==true;
      if(!silent)return original.call(this,next,options,...rest);
      backgroundStateObject=null;
      const originalRenderAll=window.renderAll;
      let result;
      withSilentDom(()=>{
        if(typeof originalRenderAll==="function")window.renderAll=()=>{};
        try{result=original.call(this,next,options,...rest);}
        finally{if(typeof originalRenderAll==="function")window.renderAll=originalRenderAll;}
      });
      renderVisibleSlice();
      return result;
    };
    wrapped.__v266SilentState=true;
    wrapped.__v266Original=original;
    window.setState=wrapped;
  }

  function markManualRefresh(){
    const button=$("#refresh-button");
    if(!button||button.dataset.v266ManualRefresh==="1")return;
    button.dataset.v266ManualRefresh="1";
    button.addEventListener("click",()=>{lastLiveCompletedAt=0;backgroundStateObject=null;},{capture:true});
  }

  function install(){
    installApiTracker();
    installStateWrapper();
    markManualRefresh();
    if(!installed){
      installed=true;
      document.documentElement.classList.add("v266-ready");
      window.addEventListener("crm:state",()=>requestAnimationFrame(()=>{installApiTracker();installStateWrapper();}));
    }
  }

  function boot(){
    install();
    setTimeout(install,300);
    setTimeout(install,1000);
    setTimeout(install,2500);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
