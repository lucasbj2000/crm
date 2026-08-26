(() => {
  "use strict";
  let installPrompt=null;
  const q=(s,r=document)=>r.querySelector(s);
  const standalone=()=>window.matchMedia?.('(display-mode: standalone)')?.matches===true||navigator.standalone===true;
  const isiOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent||'');
  const isAndroid=()=>/android/i.test(navigator.userAgent||'');
  function toast(message,tone='warning'){try{if(typeof showToast==='function')return showToast(message,tone);}catch{}console.log(message);}

  function ensureGuide(){
    let dialog=q('#v255-install-guide');if(dialog)return dialog;
    dialog=document.createElement('dialog');dialog.id='v255-install-guide';dialog.className='v255-install-guide';
    dialog.innerHTML='<div class="v255-install-card"><header><div><strong>Instalar CRM</strong><small id="v255-install-platform">Acceso directo como aplicación</small></div><button type="button" class="icon-button close" id="v255-install-close">×</button></header><div id="v255-install-steps"></div><button type="button" class="button primary wide" id="v255-install-ok">Entendido</button></div>';
    document.body.appendChild(dialog);q('#v255-install-close').onclick=()=>dialog.close();q('#v255-install-ok').onclick=()=>dialog.close();return dialog;
  }
  function manualGuide(){
    const dialog=ensureGuide();const steps=q('#v255-install-steps');
    if(isiOS())steps.innerHTML='<ol><li>Abrí este CRM en <b>Safari</b>.</li><li>Tocá el botón <b>Compartir</b> (cuadrado con flecha hacia arriba).</li><li>Elegí <b>Agregar a pantalla de inicio</b>.</li><li>Confirmá con <b>Agregar</b>.</li></ol><p>Después vas a poder abrir el CRM desde el ícono del teléfono como una app.</p>';
    else if(isAndroid())steps.innerHTML='<ol><li>Abrí el menú <b>⋮</b> de Chrome.</li><li>Elegí <b>Instalar aplicación</b> o <b>Agregar a pantalla principal</b>.</li><li>Confirmá la instalación.</li></ol><p>Si Chrome habilita el instalador automático, el botón del CRM lo abrirá directamente.</p>';
    else steps.innerHTML='<ol><li>Abrí el menú del navegador.</li><li>Elegí <b>Instalar aplicación</b> o <b>Crear acceso directo</b>.</li><li>Confirmá la instalación.</li></ol>';
    dialog.showModal();
  }

  function ensureMobileButton(){
    let button=q('#v255-mobile-install-app');if(button)return button;
    const bottom=q('.sidebar-bottom');if(!bottom)return null;
    button=document.createElement('button');button.id='v255-mobile-install-app';button.type='button';button.className='nav-item v255-mobile-install';button.innerHTML='<span>⇩</span><b>Instalar app</b>';
    bottom.insertBefore(button,q('#logout-button')||null);button.addEventListener('click',install);return button;
  }
  function sync(){
    const installed=standalone();const header=q('#install-app-button');const mobile=ensureMobileButton();
    if(header){header.hidden=installed;header.textContent='＋ Instalar app';header.classList.add('v255-install-visible');}
    if(mobile)mobile.hidden=installed;
    document.body?.classList.toggle('v255-app-installed',installed);
  }

  async function install(event){
    event?.preventDefault();event?.stopImmediatePropagation?.();
    if(standalone())return toast('La aplicación ya está instalada.','success');
    if(installPrompt){
      try{
        const current=installPrompt;installPrompt=null;await current.prompt();const choice=await current.userChoice.catch(()=>null);
        if(choice?.outcome==='accepted')toast('Instalación iniciada.','success');else{toast('Podés instalarla cuando quieras.');sync();}
        return;
      }catch{installPrompt=null;}
    }
    manualGuide();
  }

  window.addEventListener('beforeinstallprompt',(event)=>{event.preventDefault();installPrompt=event;sync();},{capture:true});
  window.addEventListener('appinstalled',()=>{installPrompt=null;sync();toast('App instalada en el dispositivo.','success');});
  window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change',sync);

  async function prepare(){
    if('serviceWorker' in navigator){
      try{await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;}catch(error){console.warn('PWA V25.5:',error);}
    }
    ensureMobileButton();
    const header=q('#install-app-button');if(header)header.addEventListener('click',install,{capture:true});
    sync();setTimeout(sync,800);setTimeout(sync,2500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',prepare,{once:true});else prepare();
})();
