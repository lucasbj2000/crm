(() => {
  "use strict";

  const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
  let sources=[];
  let canManage=false;
  let installed=false;
  let searching=false;

  function esc(value){
    return String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  }

  function notify(message,tone="success"){
    try{if(typeof window.showToast==="function")return window.showToast(message,tone);}catch{}
    console.log(message);
  }

  async function request(url,options={}){
    const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
    const raw=await response.text();
    let payload={};
    try{payload=raw?JSON.parse(raw):{};}catch{}
    if(!response.ok)throw new Error(payload.error||`Error ${response.status}`);
    return payload;
  }

  function moneyLabel(item){
    if(item.priceText)return item.priceText;
    const value=Number(item.price);
    if(!Number.isFinite(value)||value<=0)return "Precio no publicado";
    const currency=item.currency||"PYG";
    try{return new Intl.NumberFormat("es-PY",{style:"currency",currency,maximumFractionDigits:currency==="PYG"?0:2}).format(value);}catch{return String(value);}
  }

  function ensureUi(){
    const view=$("[data-view-panel='stock']");
    if(!view||$("#v264-catalog-zone",view))return;
    const movements=$(".movements-panel",view);
    const zone=document.createElement("section");
    zone.id="v264-catalog-zone";
    zone.className="v264-catalog-zone";
    zone.innerHTML=`
      <article class="panel v264-catalog-search-panel">
        <div class="panel-title v264-title"><div><p class="kicker">CATÁLOGO EXTERNO</p><h3>Consulta asistida de productos</h3><p>Si el producto no está cargado en el stock interno, buscá precio, descripción y referencia en los catálogos de esta empresa.</p></div></div>
        <form id="v264-catalog-search-form" class="v264-search-form">
          <label class="search-box"><span>⌕</span><input id="v264-catalog-query" type="search" placeholder="Producto, modelo o código…" autocomplete="off"></label>
          <button class="button primary" type="submit">Buscar en catálogos</button>
        </form>
        <div id="v264-stock-fallback" class="v264-stock-fallback" hidden></div>
        <div class="v264-rule"><strong>Regla comercial:</strong> el catálogo puede aportar precio y descripción publicados, pero <b>no confirma disponibilidad</b>. La existencia se valida con el stock interno o con un agente.</div>
        <div id="v264-catalog-results" class="v264-catalog-results"><div class="v264-empty">Todavía no realizaste una búsqueda externa.</div></div>
      </article>
      <article class="panel v264-sources-panel">
        <div class="panel-title v264-title"><div><p class="kicker">FUENTES POR EMPRESA</p><h3>Enlaces de catálogos</h3><p>Estos enlaces pertenecen únicamente a esta empresa y serán usados como segunda fuente cuando el stock local no encuentre el producto.</p></div><button id="v264-add-source" class="button ghost" type="button" hidden>＋ Agregar catálogo</button></div>
        <div id="v264-source-list" class="v264-source-list"></div>
      </article>`;
    view.insertBefore(zone,movements||null);

    const dialog=document.createElement("dialog");
    dialog.id="v264-source-dialog";
    dialog.className="form-dialog v264-dialog";
    dialog.innerHTML=`<form method="dialog" id="v264-source-form">
      <div class="dialog-head"><div><p class="kicker">CATÁLOGO EXTERNO</p><h3 id="v264-source-title">Agregar catálogo</h3></div><button type="button" class="dialog-close" data-v264-close>×</button></div>
      <input type="hidden" id="v264-source-id">
      <label class="input-label" for="v264-source-name">Nombre de la fuente</label>
      <input id="v264-source-name" required placeholder="Ej.: Catálogo web principal">
      <label class="input-label" for="v264-source-url">Enlace principal del catálogo</label>
      <input id="v264-source-url" required type="url" placeholder="https://empresa.com/catalogo">
      <label class="input-label" for="v264-source-search">Enlace de búsqueda <small>(opcional)</small></label>
      <input id="v264-source-search" type="text" placeholder="https://empresa.com/buscar?q={query}">
      <p class="v264-help">Si la web tiene buscador, copiá su URL y reemplazá el texto buscado por <code>{query}</code>. Ejemplo: <b>https://sitio.com/search?q={query}</b>.</p>
      <label class="v264-check"><input id="v264-source-active" type="checkbox" checked> Usar esta fuente en las búsquedas</label>
      <div class="dialog-actions"><button type="button" class="button ghost" data-v264-close>Cancelar</button><button type="submit" class="button primary">Guardar catálogo</button></div>
    </form>`;
    document.body.appendChild(dialog);

    $("#v264-catalog-search-form")?.addEventListener("submit",(event)=>{event.preventDefault();void searchCatalog($("#v264-catalog-query")?.value||"");});
    $("#v264-add-source")?.addEventListener("click",()=>openSourceDialog());
    $("#v264-source-form")?.addEventListener("submit",(event)=>{event.preventDefault();void saveSource();});
    dialog.addEventListener("click",(event)=>{if(event.target.closest("[data-v264-close]"))dialog.close();});
    $("#v264-source-list")?.addEventListener("click",handleSourceAction);
    $("#v264-catalog-results")?.addEventListener("click",handleResultAction);
    $("#v264-stock-fallback")?.addEventListener("click",(event)=>{if(event.target.closest("[data-v264-fallback-search]"))void searchCatalog($("#stock-search")?.value||"");});
    $("#stock-search")?.addEventListener("input",()=>setTimeout(syncFallback,0));
    installed=true;
  }

  function openSourceDialog(source=null){
    const dialog=$("#v264-source-dialog");
    if(!dialog)return;
    $("#v264-source-id").value=source?.id||"";
    $("#v264-source-name").value=source?.name||"";
    $("#v264-source-url").value=source?.catalogUrl||"";
    $("#v264-source-search").value=source?.searchUrlTemplate||"";
    $("#v264-source-active").checked=source?.active!==false;
    $("#v264-source-title").textContent=source?"Editar catálogo":"Agregar catálogo";
    dialog.showModal();
  }

  async function saveSource(){
    const id=$("#v264-source-id")?.value||"";
    const payload={name:$("#v264-source-name")?.value||"",catalogUrl:$("#v264-source-url")?.value||"",searchUrlTemplate:$("#v264-source-search")?.value||"",active:$("#v264-source-active")?.checked!==false};
    try{
      const result=await request(id?`/api/catalog-sources/${encodeURIComponent(id)}`:"/api/catalog-sources",{method:id?"PUT":"POST",body:JSON.stringify(payload)});
      sources=result.sources||sources;
      $("#v264-source-dialog")?.close();
      renderSources();
      syncFallback();
      notify(id?"Catálogo actualizado":"Catálogo agregado");
    }catch(error){notify(error.message,"warning");}
  }

  async function handleSourceAction(event){
    const button=event.target.closest("[data-v264-source-action]");
    if(!button)return;
    const source=sources.find((item)=>item.id===button.dataset.sourceId);
    if(!source)return;
    const action=button.dataset.v264SourceAction;
    if(action==="edit")return openSourceDialog(source);
    if(action==="open")return window.open(source.catalogUrl,"_blank","noopener,noreferrer");
    if(action==="delete"){
      if(!window.confirm(`¿Eliminar el catálogo “${source.name}”?`))return;
      try{
        const result=await request(`/api/catalog-sources/${encodeURIComponent(source.id)}`,{method:"DELETE"});
        sources=result.sources||[];
        renderSources();
        syncFallback();
        notify("Catálogo eliminado");
      }catch(error){notify(error.message,"warning");}
    }
  }

  function renderSources(){
    const list=$("#v264-source-list");
    if(!list)return;
    $("#v264-add-source")?.toggleAttribute("hidden",!canManage);
    if(!sources.length){
      list.innerHTML=`<div class="v264-empty"><strong>Sin catálogos configurados</strong><span>${canManage?"Agregá el enlace de la web o catálogo de esta empresa para habilitar la búsqueda de respaldo.":"Un administrador puede configurar aquí las fuentes externas de productos."}</span></div>`;
      return;
    }
    list.innerHTML=sources.map((source)=>`<div class="v264-source ${source.active===false?"inactive":""}">
      <div><span class="v264-source-dot"></span><p><strong>${esc(source.name)}</strong><small>${esc(source.catalogUrl)}</small></p></div>
      <em>${source.active===false?"Inactivo":source.searchUrlTemplate?"Búsqueda directa":"Catálogo general"}</em>
      <div class="v264-source-actions"><button type="button" data-v264-source-action="open" data-source-id="${esc(source.id)}">Abrir</button>${canManage?`<button type="button" data-v264-source-action="edit" data-source-id="${esc(source.id)}">Editar</button><button class="danger" type="button" data-v264-source-action="delete" data-source-id="${esc(source.id)}">Eliminar</button>`:""}</div>
    </div>`).join("");
  }

  function syncFallback(){
    const box=$("#v264-stock-fallback");
    const input=$("#stock-search");
    const query=input?.value?.trim()||"";
    if(!box)return;
    const rows=$("#stock-table-body")?.querySelectorAll("tr")?.length||0;
    const available=sources.some((source)=>source.active!==false);
    if(query.length>=2&&rows===0&&available){
      box.hidden=false;
      box.innerHTML=`<div><strong>No aparece en el stock interno.</strong><span>Podés buscar <b>${esc(query)}</b> en los catálogos externos antes de responder al cliente.</span></div><button class="button ghost" type="button" data-v264-fallback-search>Buscar en catálogo →</button>`;
      const external=$("#v264-catalog-query");if(external)external.value=query;
    }else box.hidden=true;
  }

  async function searchCatalog(query){
    const clean=String(query||"").trim();
    if(clean.length<2)return notify("Escribí al menos dos caracteres para buscar.","warning");
    if(searching)return;
    searching=true;
    const results=$("#v264-catalog-results");
    if(results)results.innerHTML='<div class="v264-loading"><span></span>Consultando las fuentes configuradas…</div>';
    const button=$("#v264-catalog-search-form button[type='submit']");
    if(button)button.disabled=true;
    try{
      const payload=await request("/api/catalog-search",{method:"POST",body:JSON.stringify({query:clean,forceExternal:true})});
      renderResults(payload);
    }catch(error){
      if(results)results.innerHTML=`<div class="v264-empty warning"><strong>No se pudo consultar el catálogo</strong><span>${esc(error.message)}</span></div>`;
      notify(error.message,"warning");
    }finally{
      searching=false;
      if(button)button.disabled=false;
    }
  }

  function renderResults(payload){
    const root=$("#v264-catalog-results");
    if(!root)return;
    const local=payload.local||[];
    const external=payload.external||[];
    const errors=payload.errors||[];
    const blocks=[];
    if(local.length){
      blocks.push(`<div class="v264-result-heading"><strong>Stock interno</strong><span>Disponibilidad confirmada por el CRM</span></div>`);
      blocks.push(local.map((item)=>`<article class="v264-result local"><div class="v264-result-main"><span class="v264-badge confirmed">STOCK CRM</span><h4>${esc(item.name)}</h4><p>${esc(item.description||"Sin descripción")}</p><small>${esc(item.sku||"Sin código")} · <b>${Number(item.available||0)} disponible(s)</b></small></div><div class="v264-price">${moneyLabel(item)}</div></article>`).join(""));
    }
    if(external.length){
      blocks.push(`<div class="v264-result-heading"><strong>Referencias externas</strong><span>Precio/descripción publicados · disponibilidad por confirmar</span></div>`);
      blocks.push(external.map((item,index)=>`<article class="v264-result external"><div class="v264-result-main"><span class="v264-badge external">${esc(item.sourceName||"CATÁLOGO")}</span><h4>${esc(item.name||"Producto")}</h4><p>${esc(item.description||"La publicación no expone una descripción legible.")}</p><small>${esc(item.sku||"Sin código publicado")} · <b>Disponibilidad no confirmada</b></small></div><div class="v264-result-side"><div class="v264-price">${esc(moneyLabel(item))}</div><div class="v264-result-actions"><button type="button" data-v264-result-action="open" data-result-index="${index}">Abrir publicación</button>${canManage?`<button type="button" class="primary" data-v264-result-action="add" data-result-index="${index}">Agregar al stock</button>`:""}</div></div></article>`).join(""));
    }
    if(!local.length&&!external.length){
      blocks.push(`<div class="v264-empty"><strong>No encontré coincidencias</strong><span>El producto no está en el stock interno ni apareció en las fuentes externas configuradas.</span></div>`);
    }
    if(errors.length){
      blocks.push(`<details class="v264-errors"><summary>${errors.length} fuente(s) no pudieron consultarse</summary>${errors.map((item)=>`<p><b>${esc(item.sourceName||"Catálogo")}</b>: ${esc(item.error||"Error de consulta")}</p>`).join("")}</details>`);
    }
    root.dataset.external=JSON.stringify(external);
    root.innerHTML=blocks.join("");
  }

  function handleResultAction(event){
    const button=event.target.closest("[data-v264-result-action]");
    if(!button)return;
    const root=$("#v264-catalog-results");
    let external=[];
    try{external=JSON.parse(root?.dataset.external||"[]");}catch{}
    const item=external[Number(button.dataset.resultIndex)];
    if(!item)return;
    if(button.dataset.v264ResultAction==="open")return window.open(item.url,"_blank","noopener,noreferrer");
    if(button.dataset.v264ResultAction==="add")prefillProduct(item);
  }

  function prefillProduct(item){
    $("#new-product-button")?.click();
    setTimeout(()=>{
      const set=(selector,value)=>{const field=$(selector);if(field)field.value=value??"";};
      set("#product-name",item.name||"");
      set("#product-sku",item.sku||"");
      const reference=item.url?`\nReferencia de catálogo: ${item.url}`:"";
      set("#product-description",String(item.description||"").slice(0,1200)+reference);
      set("#product-available",0);
      set("#product-min",0);
      set("#product-price",Number.isFinite(Number(item.price))?Number(item.price):0);
      notify(item.sku?"Producto precargado. Confirmá la disponibilidad antes de guardar.":"Producto precargado. Completá un código interno y confirmá la disponibilidad.","warning");
    },80);
  }

  async function loadContext(){
    try{
      const [catalogs,auth]=await Promise.all([request("/api/catalog-sources"),request("/api/auth/status")]);
      sources=catalogs.sources||[];
      canManage=["admin","manager"].includes(auth.user?.role);
      renderSources();
      syncFallback();
    }catch(error){console.warn("V26.4 catalog context",error?.message||error);}
  }

  function boot(){
    ensureUi();
    void loadContext();
    window.addEventListener("crm:state",()=>{
      ensureUi();
      setTimeout(syncFallback,0);
    });
    setTimeout(()=>{ensureUi();if(!installed)ensureUi();},600);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
