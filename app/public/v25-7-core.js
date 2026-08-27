(() => {
  "use strict";
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const MOBILE_QUERY="(max-width: 760px)";
  const esc=(value)=>String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  let loadedFormKey=null;
  let designBlocks=[];

  const defaultTheme=()=>({
    primaryColor:$("#form-primary-color")?.value||"#171717",
    accentColor:$("#form-accent-color")?.value||"#FF7A00",
    backgroundColor:"#F3F3F4",surfaceColor:"#FFFFFF",textColor:"#1B1B1D",mutedColor:"#6F7178",borderColor:"#E1E2E6",
    buttonColor:$("#form-primary-color")?.value||"#171717",buttonTextColor:"#FFFFFF",radius:20,logoUrl:"",coverUrl:"",showProgress:true,
    startButtonLabel:"Comenzar",nextButtonLabel:"Continuar",brandName:"",footerText:""
  });
  let currentTheme=defaultTheme();

  function notify(message,tone="success"){
    try{if(typeof showToast==="function")return showToast(message,tone)}catch{}
    console.log(message);
  }
  function isMobile(){return window.matchMedia?.(MOBILE_QUERY)?.matches===true}

  function injectMobileChrome(){
    if(!$("#v257-mobile-topbar")){
      const bar=document.createElement("header");bar.id="v257-mobile-topbar";bar.className="v257-mobile-topbar";
      bar.innerHTML='<button type="button" data-v257-menu aria-label="Abrir menú">☰</button><div><small>CRM</small><strong id="v257-mobile-title">Inicio</strong></div><span class="v257-mobile-status" id="v257-mobile-status"></span><button type="button" data-v257-refresh aria-label="Actualizar">↻</button>';
      $(".workspace")?.prepend(bar);
      bar.querySelector("[data-v257-menu]")?.addEventListener("click",()=>document.body.classList.add("v24-nav-open"));
      bar.querySelector("[data-v257-refresh]")?.addEventListener("click",()=>$("#refresh-button")?.click());
    }
    if(!$("#v257-mobile-nav")){
      const nav=document.createElement("nav");nav.id="v257-mobile-nav";nav.className="v257-mobile-nav";nav.setAttribute("aria-label","Navegación móvil");
      nav.innerHTML='<button type="button" data-v257-view="crm"><span>◫</span><b>Negocios</b></button><button type="button" data-v257-view="whatsapp"><span>◉</span><b>WhatsApp</b></button><button type="button" data-v257-view="contacts"><span>◎</span><b>Contactos</b></button><button type="button" data-v257-more><span>☰</span><b>Más</b></button>';
      document.body.append(nav);
      nav.addEventListener("click",(event)=>{
        const view=event.target.closest("[data-v257-view]")?.dataset.v257View;
        if(view){
          const target=$(`.sidebar [data-view="${view}"],.sidebar [data-module="${view}"]`);target?.click();syncMobileChrome();
        }
        if(event.target.closest("[data-v257-more]"))document.body.classList.add("v24-nav-open");
      });
    }
  }

  function activeViewName(){
    const active=$('.view.active[data-view-panel]');
    const key=active?.dataset.viewPanel||"crm";
    const map={crm:"Negociaciones",whatsapp:"WhatsApp",contacts:"Contactos",productivity:"Productividad",forms:"Formularios",branches:"Sucursales",organization:"Estructura",attendance:"Marcación",campaigns:"Campañas",reports:"Reportes",settings:"Configuración",design:"Diseño",stock:"Stock",replies:"Respuestas",data:"Datos",ai:"Centro IA"};
    return map[key]||$("#header-title")?.textContent?.trim()||"CRM";
  }
  function syncMobileChrome(){
    const mobile=isMobile();document.body.classList.toggle("v257-mobile",mobile);document.documentElement.dataset.v257=mobile?"mobile":"desktop";
    if(!mobile){document.body.classList.remove("v257-overlay-open");return}
    injectMobileChrome();
    const title=$("#v257-mobile-title");if(title)title.textContent=activeViewName();
    const conn=$("#connection-pill span")?.textContent?.trim()||"";const status=$("#v257-mobile-status");if(status){status.textContent=conn?"●":"";status.title=conn;status.classList.toggle("online",/conect|activo|online/i.test(conn));}
    const active=$('.view.active[data-view-panel]')?.dataset.viewPanel||"crm";
    $$('[data-v257-view]').forEach((b)=>b.classList.toggle("active",b.dataset.v257View===active));
    syncOverlayState();
  }

  function installStageMode(){
    const tabs=$("#mobile-stage-tabs");if(!tabs||tabs.dataset.v257Bound)return;tabs.dataset.v257Bound="1";
    const setStage=(stage)=>{const board=$("#crm-board");if(board)board.dataset.v257Stage=stage||"new";$$('[data-mobile-stage]',tabs).forEach((b)=>b.classList.toggle("active",b.dataset.mobileStage===(stage||"new")));};
    tabs.addEventListener("click",(event)=>{const b=event.target.closest("[data-mobile-stage]");if(b)setStage(b.dataset.mobileStage)});
    setStage(tabs.querySelector(".active[data-mobile-stage]")?.dataset.mobileStage||"new");
  }

  function installDrawerTabs(){
    const drawer=$("#deal-drawer");if(!drawer||drawer.dataset.v257Tabs)return;drawer.dataset.v257Tabs="1";
    const tabs=$(".drawer-mobile-tabs",drawer);if(!tabs)return;
    const setPane=(pane)=>{drawer.dataset.v257Pane=pane;$$('[data-drawer-tab]',tabs).forEach((b)=>b.classList.toggle("active",b.dataset.drawerTab===pane));};
    tabs.addEventListener("click",(event)=>{const b=event.target.closest("[data-drawer-tab]");if(b)setPane(b.dataset.drawerTab)});
    setPane("conversation");
  }

  function syncOverlayState(){
    const drawer=$("#deal-drawer");const drawerOpen=drawer&&(drawer.getAttribute("aria-hidden")==="false"||drawer.classList.contains("open")||drawer.classList.contains("active"));
    const dialogOpen=Boolean($("dialog[open]"));
    const waChat=$("#v252-whatsapp-shell.mobile-chat-open");
    document.body.classList.toggle("v257-overlay-open",Boolean(drawerOpen||dialogOpen||waChat));
  }

  async function uploadAsset(file){
    if(!file)throw new Error("Seleccioná una imagen.");
    if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw new Error("Usá PNG, JPG o WEBP.");
    if(file.size>3*1024*1024)throw new Error("La imagen no puede superar 3 MB.");
    const response=await fetch("/api/forms/assets",{method:"POST",headers:{"Content-Type":file.type},body:file,credentials:"same-origin"});
    const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"No se pudo subir la imagen.");return result.url;
  }

  function themeField(id,key){const input=$(id);if(!input)return;input.value=currentTheme[key]??input.value;input.addEventListener("input",()=>{currentTheme[key]=input.type==="number"?Number(input.value):input.type==="checkbox"?input.checked:input.value;if(key==="primaryColor"&&$("#form-primary-color"))$("#form-primary-color").value=input.value;if(key==="accentColor"&&$("#form-accent-color"))$("#form-accent-color").value=input.value;renderDesignerPreview();});}

  function designerMarkup(){return `<section class="v257-form-designer" id="v257-form-designer">
    <header><div><p class="kicker">DISEÑO VISUAL · V25.7</p><h4>Personalizá el formulario</h4><small>Logo, portada, colores y bloques visuales. La vista previa se actualiza al instante.</small></div><button type="button" class="button ghost" id="v257-preview-public">Vista previa</button></header>
    <div class="v257-designer-layout">
      <div class="v257-designer-controls">
        <details open><summary>Marca e imágenes</summary><div class="v257-design-grid">
          <label><span>Nombre de marca</span><input id="v257-brand-name" maxlength="120"></label><label><span>Pie del formulario</span><input id="v257-footer-text" maxlength="400"></label>
          <div class="v257-upload-row"><span>Logo</span><button type="button" class="button ghost" data-v257-upload="logo">Subir logo</button><button type="button" class="text-button" data-v257-clear="logo">Quitar</button><input hidden type="file" accept="image/png,image/jpeg,image/webp" id="v257-logo-file"></div>
          <div class="v257-upload-row"><span>Imagen de portada</span><button type="button" class="button ghost" data-v257-upload="cover">Subir portada</button><button type="button" class="text-button" data-v257-clear="cover">Quitar</button><input hidden type="file" accept="image/png,image/jpeg,image/webp" id="v257-cover-file"></div>
        </div></details>
        <details open><summary>Colores y botones</summary><div class="v257-color-grid">
          <label><span>Principal</span><input id="v257-primary" type="color"></label><label><span>Acento</span><input id="v257-accent" type="color"></label><label><span>Fondo</span><input id="v257-background" type="color"></label><label><span>Tarjeta</span><input id="v257-surface" type="color"></label><label><span>Texto</span><input id="v257-text" type="color"></label><label><span>Texto secundario</span><input id="v257-muted" type="color"></label><label><span>Bordes</span><input id="v257-border" type="color"></label><label><span>Botón</span><input id="v257-button" type="color"></label><label><span>Texto botón</span><input id="v257-button-text" type="color"></label><label><span>Redondeo</span><input id="v257-radius" type="number" min="0" max="40"></label>
        </div><div class="v257-design-grid"><label><span>Botón inicial</span><input id="v257-start-label" maxlength="80"></label><label><span>Botón siguiente</span><input id="v257-next-label" maxlength="80"></label><label class="check-row"><input id="v257-show-progress" type="checkbox"><span><b>Mostrar progreso</b></span></label></div></details>
        <details open><summary>Bloques de contenido</summary><div class="v257-block-toolbar"><button type="button" data-v257-add="title">＋ Título</button><button type="button" data-v257-add="subtitle">＋ Subtítulo</button><button type="button" data-v257-add="text">＋ Texto</button><button type="button" data-v257-add="separator">＋ Separador</button><button type="button" data-v257-add="image">＋ Imagen</button><button type="button" data-v257-add="button">＋ Botón</button><button type="button" data-v257-add="spacer">＋ Espacio</button></div><div id="v257-block-list" class="v257-block-list"></div></details>
      </div>
      <aside class="v257-form-preview"><div class="v257-preview-device" id="v257-preview-device"></div></aside>
    </div>
  </section>`}

  function ensureDesigner(){
    const dialog=$("#form-builder-dialog"),form=$("#form-builder");if(!dialog||!form)return;
    if(!$("#v257-form-designer")){
      const wrap=document.createElement("div");wrap.innerHTML=designerMarkup();const panel=wrap.firstElementChild;
      const anchor=$("#form-description")?.closest("label")||$("#form-description")||form.querySelector("header");anchor?.after(panel);
      bindDesigner();
    }
    if(dialog.open)hydrateDesignerForCurrentForm();
  }

  function bindDesigner(){
    themeField("#v257-primary","primaryColor");themeField("#v257-accent","accentColor");themeField("#v257-background","backgroundColor");themeField("#v257-surface","surfaceColor");themeField("#v257-text","textColor");themeField("#v257-muted","mutedColor");themeField("#v257-border","borderColor");themeField("#v257-button","buttonColor");themeField("#v257-button-text","buttonTextColor");themeField("#v257-radius","radius");themeField("#v257-brand-name","brandName");themeField("#v257-footer-text","footerText");themeField("#v257-start-label","startButtonLabel");themeField("#v257-next-label","nextButtonLabel");themeField("#v257-show-progress","showProgress");
    $("#v257-form-designer")?.addEventListener("click",async(event)=>{
      const add=event.target.closest("[data-v257-add]");if(add){addBlock(add.dataset.v257Add);return}
      const upload=event.target.closest("[data-v257-upload]");if(upload){$(`#v257-${upload.dataset.v257Upload}-file`)?.click();return}
      const clear=event.target.closest("[data-v257-clear]");if(clear){currentTheme[clear.dataset.v257Clear+"Url"]="";renderDesignerPreview();return}
      const action=event.target.closest("[data-v257-block-action]");if(action){handleBlockAction(action);return}
      if(event.target.closest("#v257-preview-public")){const id=$("#form-id")?.value;if(!id)return notify("Guardá el formulario primero para abrir el enlace público.","warning");try{const response=await fetch("/api/forms",{cache:"no-store"});const result=await response.json();const found=(result.forms||[]).find(f=>f.id===id);if(found?.sharePath)window.open(found.sharePath,"_blank","noopener");else notify("No se encontró el enlace público.","warning")}catch{notify("No se pudo abrir la vista previa.","warning")}}
    });
    for(const kind of ["logo","cover"]){$(`#v257-${kind}-file`)?.addEventListener("change",async(event)=>{const file=event.target.files?.[0];if(!file)return;try{event.target.disabled=true;currentTheme[kind+"Url"]=await uploadAsset(file);notify("Imagen cargada.");renderDesignerPreview()}catch(error){notify(error.message,"warning")}finally{event.target.disabled=false;event.target.value=""}})}
    $("#v257-block-list")?.addEventListener("input",(event)=>{const card=event.target.closest("[data-v257-block-id]");if(!card)return;const block=designBlocks.find(b=>b.id===card.dataset.v257BlockId);if(!block)return;const key=event.target.dataset.v257BlockField;if(key)block[key]=event.target.value;renderDesignerPreview()});
    $("#v257-block-list")?.addEventListener("change",async(event)=>{const card=event.target.closest("[data-v257-block-id]");if(!card)return;const block=designBlocks.find(b=>b.id===card.dataset.v257BlockId);if(!block)return;const key=event.target.dataset.v257BlockField;if(key)block[key]=event.target.value;if(event.target.matches("[data-v257-block-file]")){const file=event.target.files?.[0];if(file){try{block.url=await uploadAsset(file);notify("Imagen cargada.")}catch(error){notify(error.message,"warning")}event.target.value="";renderBlockList()}}renderDesignerPreview()});
  }

  function addBlock(type){designBlocks.push({id:`block_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,type,text:type==="button"?"Abrir enlace":type==="title"?"Nuevo título":type==="subtitle"?"Nuevo subtítulo":type==="text"?"Escribí aquí el contenido…":"",url:"",href:"",alt:"",align:"left",size:type==="title"?"large":"medium",showOn:"all"});renderBlockList();renderDesignerPreview()}
  function handleBlockAction(button){const card=button.closest("[data-v257-block-id]");if(!card)return;const index=designBlocks.findIndex(b=>b.id===card.dataset.v257BlockId);if(index<0)return;const action=button.dataset.v257BlockAction;if(action==="remove")designBlocks.splice(index,1);if(action==="up"&&index>0)[designBlocks[index-1],designBlocks[index]]=[designBlocks[index],designBlocks[index-1]];if(action==="down"&&index<designBlocks.length-1)[designBlocks[index+1],designBlocks[index]]=[designBlocks[index],designBlocks[index+1]];renderBlockList();renderDesignerPreview()}

  function renderBlockList(){const list=$("#v257-block-list");if(!list)return;list.innerHTML=designBlocks.length?designBlocks.map((b,i)=>`<article class="v257-block-card" data-v257-block-id="${esc(b.id)}"><header><b>${esc({title:"Título",subtitle:"Subtítulo",text:"Texto",separator:"Separador",image:"Imagen",button:"Botón",spacer:"Espacio"}[b.type]||b.type)}</b><span>${i+1}</span><div><button type="button" data-v257-block-action="up" title="Subir">↑</button><button type="button" data-v257-block-action="down" title="Bajar">↓</button><button type="button" data-v257-block-action="remove" title="Eliminar">×</button></div></header>${["separator","spacer"].includes(b.type)?"":`<label><span>${b.type==="image"?"Pie / descripción":"Texto"}</span><input data-v257-block-field="text" value="${esc(b.text)}"></label>`}${b.type==="image"?`<label><span>Imagen</span><input type="file" accept="image/png,image/jpeg,image/webp" data-v257-block-file>${b.url?'<small>✓ Imagen cargada</small>':''}</label><label><span>Texto alternativo</span><input data-v257-block-field="alt" value="${esc(b.alt)}"></label>`:""}${b.type==="button"?`<label><span>Enlace</span><input data-v257-block-field="href" placeholder="https://..." value="${esc(b.href)}"></label>`:""}<div class="v257-block-meta"><label><span>Alinear</span><select data-v257-block-field="align"><option value="left" ${b.align==="left"?"selected":""}>Izquierda</option><option value="center" ${b.align==="center"?"selected":""}>Centro</option><option value="right" ${b.align==="right"?"selected":""}>Derecha</option></select></label><label><span>Tamaño</span><select data-v257-block-field="size"><option value="small" ${b.size==="small"?"selected":""}>Pequeño</option><option value="medium" ${b.size==="medium"?"selected":""}>Normal</option><option value="large" ${b.size==="large"?"selected":""}>Grande</option><option value="xl" ${b.size==="xl"?"selected":""}>XL</option></select></label><label><span>Mostrar</span><select data-v257-block-field="showOn"><option value="all" ${b.showOn==="all"?"selected":""}>Siempre</option><option value="landing" ${b.showOn==="landing"?"selected":""}>Inicio</option><option value="questions" ${b.showOn==="questions"?"selected":""}>Preguntas</option><option value="completed" ${b.showOn==="completed"?"selected":""}>Final</option></select></label></div></article>`).join(""):'<div class="v257-empty-blocks">Agregá títulos, textos, imágenes, separadores o botones.</div>'}

  function previewBlocks(){return designBlocks.filter(b=>b.showOn==="all"||b.showOn==="landing").map(b=>{const style=`text-align:${b.align||"left"}`;if(b.type==="separator")return '<hr>';if(b.type==="spacer")return '<div style="height:20px"></div>';if(b.type==="image")return b.url?`<img class="v257-preview-img" src="${esc(b.url)}" alt="">`:'';if(b.type==="button")return `<span class="v257-preview-btn" style="${style}">${esc(b.text||"Botón")}</span>`;if(b.type==="title")return `<h3 style="${style}">${esc(b.text)}</h3>`;if(b.type==="subtitle")return `<h4 style="${style}">${esc(b.text)}</h4>`;return `<p style="${style}">${esc(b.text)}</p>`}).join("")}
  function renderDesignerPreview(){const preview=$("#v257-preview-device");if(!preview)return;const name=$("#form-name")?.value||"Nombre del formulario";const desc=$("#form-description")?.value||"Descripción del formulario";preview.style.setProperty("--pv-bg",currentTheme.backgroundColor);preview.style.setProperty("--pv-surface",currentTheme.surfaceColor);preview.style.setProperty("--pv-text",currentTheme.textColor);preview.style.setProperty("--pv-muted",currentTheme.mutedColor);preview.style.setProperty("--pv-line",currentTheme.borderColor);preview.style.setProperty("--pv-accent",currentTheme.accentColor);preview.style.setProperty("--pv-button",currentTheme.buttonColor);preview.style.setProperty("--pv-button-text",currentTheme.buttonTextColor);preview.style.setProperty("--pv-radius",`${currentTheme.radius}px`);preview.innerHTML=`<div class="v257-preview-bg"><div class="v257-preview-card">${currentTheme.coverUrl?`<img class="v257-preview-cover" src="${esc(currentTheme.coverUrl)}" alt="">`:""}<div class="v257-preview-inner"><div class="v257-preview-brand">${currentTheme.logoUrl?`<img src="${esc(currentTheme.logoUrl)}" alt="">`:'<span>CRM</span>'}<b>${esc(currentTheme.brandName||"Tu empresa")}</b></div><h2>${esc(name)}</h2><p>${esc(desc)}</p>${previewBlocks()}<div class="v257-preview-field">Tu respuesta…</div><button>${esc(currentTheme.startButtonLabel||"Comenzar")}</button>${currentTheme.footerText?`<small>${esc(currentTheme.footerText)}</small>`:""}</div></div></div>`}

  async function hydrateDesignerForCurrentForm(){
    const id=$("#form-id")?.value||"";const key=id||"__new__";if(loadedFormKey===key)return;loadedFormKey=key;
    currentTheme=defaultTheme();designBlocks=[];
    if(id){try{const response=await fetch("/api/forms",{credentials:"same-origin",cache:"no-store"});const result=await response.json();const form=(result.forms||[]).find(f=>f.id===id);if(form){currentTheme={...currentTheme,...(form.theme||{})};designBlocks=Array.isArray(form.designBlocks)?structuredClone(form.designBlocks):[]}}catch{}}
    syncDesignerInputs();renderBlockList();renderDesignerPreview();
  }
  function syncDesignerInputs(){const map={"#v257-primary":"primaryColor","#v257-accent":"accentColor","#v257-background":"backgroundColor","#v257-surface":"surfaceColor","#v257-text":"textColor","#v257-muted":"mutedColor","#v257-border":"borderColor","#v257-button":"buttonColor","#v257-button-text":"buttonTextColor","#v257-radius":"radius","#v257-brand-name":"brandName","#v257-footer-text":"footerText","#v257-start-label":"startButtonLabel","#v257-next-label":"nextButtonLabel"};Object.entries(map).forEach(([sel,key])=>{const el=$(sel);if(el)el.value=currentTheme[key]??""});if($("#v257-show-progress"))$("#v257-show-progress").checked=currentTheme.showProgress!==false;if($("#form-primary-color"))$("#form-primary-color").value=currentTheme.primaryColor;if($("#form-accent-color"))$("#form-accent-color").value=currentTheme.accentColor}

  function installFetchAugment(){
    if(window.fetch.__v257Forms)return;const original=window.fetch.bind(window);
    const wrapped=async function(input,init={}){const url=typeof input==="string"?input:input?.url||"";const method=String(init?.method||"GET").toUpperCase();if((method==="POST"&&/^\/api\/forms$/.test(url)||method==="PUT"&&/^\/api\/forms\/[^/]+$/.test(url))&&typeof init.body==="string"){try{const body=JSON.parse(init.body);body.theme={...(body.theme||{}),...currentTheme};body.designBlocks=designBlocks;init={...init,body:JSON.stringify(body)}}catch{}}return original(input,init)};wrapped.__v257Forms=true;window.fetch=wrapped;
  }

  function installDesignerObservers(){
    ensureDesigner();const dialog=$("#form-builder-dialog");if(dialog&&!dialog.dataset.v257Observed){dialog.dataset.v257Observed="1";new MutationObserver(()=>{if(dialog.open){loadedFormKey=null;setTimeout(()=>{ensureDesigner();hydrateDesignerForCurrentForm()},60)}}).observe(dialog,{attributes:true,attributeFilter:["open"]})}
    document.addEventListener("click",(event)=>{if(event.target.closest("#new-form-button,[data-form-action=edit]"))setTimeout(()=>{loadedFormKey=null;ensureDesigner();hydrateDesignerForCurrentForm()},180)},true);
    $("#form-name")?.addEventListener("input",renderDesignerPreview);$("#form-description")?.addEventListener("input",renderDesignerPreview);
  }

  function install(){installFetchAugment();injectMobileChrome();syncMobileChrome();installStageMode();installDrawerTabs();installDesignerObservers();window.addEventListener("resize",syncMobileChrome,{passive:true});window.addEventListener("orientationchange",()=>setTimeout(syncMobileChrome,120),{passive:true});document.addEventListener("click",()=>setTimeout(()=>{syncMobileChrome();syncOverlayState();installStageMode();installDrawerTabs();ensureDesigner()},30),true);new MutationObserver(()=>{syncMobileChrome();syncOverlayState();installStageMode();installDrawerTabs();ensureDesigner()}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class","open","aria-hidden"]});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
