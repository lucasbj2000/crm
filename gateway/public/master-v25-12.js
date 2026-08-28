(() => {
  "use strict";

  const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
  let loaded=false;

  async function request(url,options={}){
    const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...options});
    const raw=await response.text();let payload={};
    try{payload=raw?JSON.parse(raw):{};}catch{}
    if(!response.ok)throw new Error(payload.error||`Error ${response.status}`);
    return payload;
  }

  function install(){
    if($("#v2512-social-platform"))return;
    const admin=$("#admin");const hero=admin?.querySelector(".hero");
    if(!admin||!hero)return;
    const card=document.createElement("section");
    card.id="v2512-social-platform";
    card.className="card";
    card.innerHTML=`
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div><h2>Conexiones sociales de la plataforma</h2><p class="muted">Se configura una sola vez acá. Después cada empresa conecta Facebook, Instagram o TikTok únicamente iniciando sesión y aceptando permisos.</p></div>
        <span class="state" id="v2512-platform-status"><i class="dot"></i>Sin configurar</span>
      </div>
      <form id="v2512-social-form" style="margin-top:14px">
        <div class="panel-section" style="margin:0 0 10px">
          <h3>Meta · Facebook e Instagram</h3>
          <p class="muted">Estas credenciales pertenecen a la aplicación oficial de la plataforma, no a cada empresa.</p>
          <div class="grid" style="margin-top:10px">
            <label class="field"><span>App ID</span><input id="v2512-meta-app" autocomplete="off"></label>
            <label class="field"><span>App Secret</span><input id="v2512-meta-secret" type="password" autocomplete="new-password" placeholder="Dejá vacío para conservarlo"></label>
            <label class="field"><span>Estado</span><input id="v2512-meta-state" readonly></label>
            <label class="field" style="grid-column:span 3"><span>OAuth Redirect URI</span><input id="v2512-meta-callback" readonly></label>
            <label class="field" style="grid-column:span 3"><span>Webhook URL</span><input id="v2512-meta-webhook" readonly></label>
            <label class="field" style="grid-column:span 3"><span>Verify Token</span><input id="v2512-meta-verify" readonly></label>
          </div>
        </div>
        <div class="panel-section" style="margin:0">
          <h3>TikTok</h3>
          <p class="muted">La misma aplicación TikTok se reutiliza para todas las empresas.</p>
          <div class="grid" style="margin-top:10px">
            <label class="field"><span>Client Key</span><input id="v2512-tt-key" autocomplete="off"></label>
            <label class="field"><span>Client Secret</span><input id="v2512-tt-secret" type="password" autocomplete="new-password" placeholder="Dejá vacío para conservarlo"></label>
            <label class="field"><span>Estado</span><input id="v2512-tt-state" readonly></label>
            <label class="field" style="grid-column:span 3"><span>Redirect URI</span><input id="v2512-tt-callback" readonly></label>
          </div>
        </div>
        <div class="actions"><button class="btn orange" id="v2512-social-save" type="submit">Guardar conexiones de plataforma</button></div>
        <div class="error" id="v2512-social-error"></div>
      </form>`;
    hero.insertAdjacentElement("afterend",card);
    $("#v2512-social-form").addEventListener("submit",save);
  }

  function render(payload){
    const meta=payload.meta||{},tt=payload.tiktok||{};
    $("#v2512-meta-app").value=meta.appId||"";
    $("#v2512-meta-secret").value="";
    $("#v2512-meta-state").value=meta.configured?"Configurado":"Pendiente";
    $("#v2512-meta-callback").value=meta.callbackUrl||"";
    $("#v2512-meta-webhook").value=meta.webhookUrl||"";
    $("#v2512-meta-verify").value=meta.verifyToken||"Se generará al guardar";
    $("#v2512-tt-key").value=tt.clientKey||"";
    $("#v2512-tt-secret").value="";
    $("#v2512-tt-state").value=tt.configured?"Configurado":"Pendiente";
    $("#v2512-tt-callback").value=tt.callbackUrl||"";
    const status=$("#v2512-platform-status");
    if(status){const any=meta.configured||tt.configured;status.classList.toggle("on",any);status.innerHTML=`<i class="dot"></i>${meta.configured&&tt.configured?"PLATAFORMA LISTA":meta.configured?"META LISTO":tt.configured?"TIKTOK LISTO":"SIN CONFIGURAR"}`;}
  }

  async function load(){
    install();
    if($("#admin")?.classList.contains("hidden"))return;
    try{render(await request("/api/gateway/master/social-oauth"));loaded=true;$("#v2512-social-error").textContent="";}
    catch(error){if(error.message&&!/401/.test(error.message))$("#v2512-social-error").textContent=error.message;}
  }

  async function save(event){
    event.preventDefault();
    const button=$("#v2512-social-save");button.disabled=true;button.textContent="Guardando…";$("#v2512-social-error").textContent="";
    const meta={appId:$("#v2512-meta-app").value.trim()},tiktok={clientKey:$("#v2512-tt-key").value.trim()};
    const metaSecret=$("#v2512-meta-secret").value.trim(),ttSecret=$("#v2512-tt-secret").value.trim();
    if(metaSecret)meta.appSecret=metaSecret;if(ttSecret)tiktok.clientSecret=ttSecret;
    try{const result=await request("/api/gateway/master/social-oauth",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({meta,tiktok})});render(result);alert("Configuración social guardada. Las empresas usarán estas credenciales al conectarse.");}
    catch(error){$("#v2512-social-error").textContent=error.message;}
    finally{button.disabled=false;button.textContent="Guardar conexiones de plataforma";}
  }

  function boot(){
    install();
    const admin=$("#admin");
    if(admin){new MutationObserver(()=>{if(!admin.classList.contains("hidden"))void load();}).observe(admin,{attributes:true,attributeFilter:["class"]});}
    $("#refresh")?.addEventListener("click",()=>setTimeout(()=>void load(),100));
    const timer=setInterval(()=>{install();if(!$("#admin")?.classList.contains("hidden")){void load();if(loaded)clearInterval(timer);}},500);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
