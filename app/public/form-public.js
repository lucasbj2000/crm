(() => {
  "use strict";
  const app=document.getElementById("form-app");
  const path=location.pathname;
  const tenantMatch=path.match(/^\/t\/([^/]+)\/(forms?|form)\/([^/]+)/);
  const directMatch=path.match(/^\/(forms?|form)\/([^/]+)/);
  const tenant=tenantMatch?.[1]||"";
  const kind=tenantMatch?.[2]||directMatch?.[1]||"form";
  const token=tenantMatch?.[3]||directMatch?.[2]||"";
  const apiBase=tenant?`/t/${encodeURIComponent(tenant)}/api`:"/api";
  let sessionApi="";
  let payload=null;
  let singleValue="";
  const multipleValues=new Set();
  const escapeHtml=(value)=>String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  const assetUrl=(value)=>{const url=String(value||"");if(!url)return "";if(tenant&&url.startsWith("/api/"))return `/t/${encodeURIComponent(tenant)}${url}`;return url;};

  function setTheme(company={}){
    const root=document.documentElement;
    const vars={
      "--form-primary":company.primaryColor||"#171717",
      "--form-accent":company.accentColor||"#FF7A00",
      "--form-bg":company.backgroundColor||"#F3F3F4",
      "--form-surface":company.surfaceColor||"#FFFFFF",
      "--form-text":company.textColor||"#1B1B1D",
      "--form-muted":company.mutedColor||"#6F7178",
      "--form-line":company.borderColor||"#E1E2E6",
      "--form-button":company.buttonColor||company.primaryColor||"#171717",
      "--form-button-text":company.buttonTextColor||"#FFFFFF",
      "--form-radius":`${Math.max(0,Math.min(40,Number(company.radius)||20))}px`,
    };
    Object.entries(vars).forEach(([key,value])=>root.style.setProperty(key,value));
  }

  function cover(company={}){
    const url=assetUrl(company.coverUrl);
    return url?`<div class="form-cover"><img src="${escapeHtml(url)}" alt="Imagen de portada"></div>`:"";
  }

  function brand(company,copy="Formulario seguro"){
    const logo=assetUrl(company?.logoUrl);
    const name=company?.brandName||company?.name||"CRM";
    return `<div class="brand">${logo?`<span class="brand-logo"><img src="${escapeHtml(logo)}" alt="${escapeHtml(name)}"></span>`:`<span class="brand-mark">CRM</span>`}<div><b>${escapeHtml(name)}</b><small>${escapeHtml(copy)}</small></div></div>`;
  }

  function renderBlocks(blocks=[],screen="all"){
    return (Array.isArray(blocks)?blocks:[]).filter((block)=>!block.showOn||block.showOn==="all"||block.showOn===screen).map((block)=>{
      const align=["left","center","right"].includes(block.align)?block.align:"left";
      const size=["small","medium","large","xl"].includes(block.size)?block.size:"medium";
      const cls=`visual-block ${escapeHtml(block.type||"text")} align-${align} size-${size}`;
      if(block.type==="title")return `<h2 class="${cls}">${escapeHtml(block.text)}</h2>`;
      if(block.type==="subtitle")return `<h3 class="${cls}">${escapeHtml(block.text)}</h3>`;
      if(block.type==="separator")return `<div class="${cls}" aria-hidden="true"><i></i></div>`;
      if(block.type==="spacer")return `<div class="${cls}" aria-hidden="true"></div>`;
      if(block.type==="image"){
        const url=assetUrl(block.url);if(!url)return "";
        return `<figure class="${cls}"><img src="${escapeHtml(url)}" alt="${escapeHtml(block.alt||block.text||"Imagen")}">${block.text?`<figcaption>${escapeHtml(block.text)}</figcaption>`:""}</figure>`;
      }
      if(block.type==="button"){
        if(!block.href)return `<div class="${cls}"><span class="visual-button disabled">${escapeHtml(block.text||"Botón")}</span></div>`;
        return `<div class="${cls}"><a class="visual-button" href="${escapeHtml(block.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(block.text||"Abrir")}</a></div>`;
      }
      return `<p class="${cls}">${escapeHtml(block.text)}</p>`;
    }).join("");
  }

  const footer=(company={})=>company.footerText?`<footer class="form-footer">${escapeHtml(company.footerText)}</footer>`:"";
  const showError=(message)=>{const error=document.getElementById("form-error");if(error)error.textContent=message||"";};

  function renderLanding(definition){
    const company=definition.company||{},form=definition.form||{};setTheme(company);document.title=form.name||"Formulario";
    const identity=form.collectIdentity||"optional";
    const identityFields=identity==="anonymous"?"":`<div class="identity"><div class="identity-grid"><label class="field wide"><span>Nombre${identity==="required"?' *':''}</span><input class="input" id="visitor-name" maxlength="160" autocomplete="name" ${identity==="required"?'required':''}></label><label class="field"><span>Teléfono</span><input class="input" id="visitor-phone" type="tel" maxlength="30" autocomplete="tel"></label><label class="field"><span>Correo</span><input class="input" id="visitor-email" type="email" maxlength="240" autocomplete="email"></label></div><div class="identity-note">${identity==="required"?'El nombre es necesario para identificar la respuesta.':'Estos datos son opcionales; también podés responder de forma anónima.'}</div></div>`;
    app.innerHTML=`${cover(company)}<div class="form-inner">${brand(company,"Formulario independiente")}<h1>${escapeHtml(form.name)}</h1><p class="form-description">${escapeHtml(form.description||form.introMessage||"")}</p>${renderBlocks(form.designBlocks,"landing")}<div class="identity-note">${Number(form.questionCount||0)} campo${Number(form.questionCount||0)===1?'':'s'} para completar</div>${identityFields}<label class="honeypot" aria-hidden="true">Sitio web<input id="visitor-website" tabindex="-1" autocomplete="off"></label><div class="actions"><button class="button primary" id="start-form" type="button">${escapeHtml(company.startButtonLabel||"Comenzar")}</button></div><div class="error" id="form-error"></div>${footer(company)}</div>`;
    document.getElementById("start-form")?.addEventListener("click",startPublicForm);
  }

  function fieldMarkup(question){
    singleValue="";multipleValues.clear();const type=question.type;
    if(["options","yesno","consent","checkbox"].includes(type))return `<div class="options ${type==="checkbox"?'multi':''}">${(question.options||[]).map((option)=>`<button class="option" type="button" data-option="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join("")}</div>`;
    if(type==="longtext")return '<textarea id="answer" aria-label="Respuesta"></textarea>';
    if(type==="rating")return '<input class="input" id="answer" type="number" min="1" max="10" step="1" placeholder="1 a 10">';
    if(type==="nps")return '<input class="input" id="answer" type="number" min="0" max="10" step="1" placeholder="0 a 10">';
    if(type==="number")return '<input class="input" id="answer" type="number">';
    if(type==="email")return '<input class="input" id="answer" type="email" autocomplete="email">';
    if(type==="phone")return '<input class="input" id="answer" type="tel" autocomplete="tel" placeholder="Ej.: +595 981 000000">';
    if(type==="date")return '<input class="input" id="answer" type="date">';
    return '<input class="input" id="answer" type="text">';
  }

  function renderSession(){
    const company=payload.company||{},form=payload.form||{},session=payload.session||{};setTheme(company);document.title=form.name||"Formulario";
    if(session.status==="completed"){
      app.innerHTML=`${cover(company)}<div class="form-inner"><div class="done"><span class="brand-mark">✓</span><h1>Formulario completado</h1><p>${escapeHtml(form.closingMessage||"Gracias por completar el formulario.")}</p>${renderBlocks(form.designBlocks,"completed")}</div>${footer(company)}</div>`;return;
    }
    const question=payload.question;if(!question){app.innerHTML=`<div class="form-inner">${brand(company)}<h1>Formulario no disponible</h1><p>No encontramos una pregunta pendiente.</p></div>`;return;}
    const progress=Math.round((Number(session.answered||0)/Math.max(1,Number(session.total||1)))*100);
    app.innerHTML=`${cover(company)}<div class="form-inner">${brand(company)}<h1>${escapeHtml(form.name)}</h1><p class="form-description">${escapeHtml(form.description||"")}</p>${renderBlocks(form.designBlocks,"questions")}${company.showProgress===false?"":`<div class="progress" style="--progress:${progress}%"><i></i></div>`}<h2 class="question">${escapeHtml(question.text)}${question.required?'<span class="required"> *</span>':''}</h2>${fieldMarkup(question)}<div class="actions"><button class="button primary" id="next-question" type="button">${escapeHtml(company.nextButtonLabel||"Continuar")}</button></div><div class="error" id="form-error"></div>${footer(company)}</div>`;
    document.querySelectorAll("[data-option]").forEach((button)=>button.addEventListener("click",()=>{if(question.type==="checkbox"){button.classList.toggle("selected");if(button.classList.contains("selected"))multipleValues.add(button.dataset.option);else multipleValues.delete(button.dataset.option);}else{document.querySelectorAll("[data-option]").forEach((entry)=>entry.classList.remove("selected"));button.classList.add("selected");singleValue=button.dataset.option||"";}}));
    document.getElementById("next-question")?.addEventListener("click",submitAnswer);
    document.getElementById("answer")?.focus({preventScroll:true});
  }

  async function request(url,options){
    const response=await fetch(url,options);const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"No se pudo completar la operación.");return result;
  }
  async function startPublicForm(){
    const button=document.getElementById("start-form");showError("");try{button.disabled=true;const result=await request(`${apiBase}/public/form-definitions/${encodeURIComponent(token)}/start`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:document.getElementById("visitor-name")?.value||"",phone:document.getElementById("visitor-phone")?.value||"",email:document.getElementById("visitor-email")?.value||"",website:document.getElementById("visitor-website")?.value||""})});sessionApi=`${apiBase}/public/forms/${encodeURIComponent(result.token)}`;payload=result.payload;renderSession();}catch(error){showError(error.message);}finally{if(button)button.disabled=false;}
  }
  async function submitAnswer(){
    const button=document.getElementById("next-question"),question=payload.question;showError("");let value;if(question.type==="checkbox")value=[...multipleValues];else if(["options","yesno","consent"].includes(question.type))value=singleValue;else value=document.getElementById("answer")?.value||"";
    try{button.disabled=true;payload=await request(`${sessionApi}/answer`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({value})});renderSession();}catch(error){showError(error.message);button.disabled=false;}
  }
  async function init(){
    try{
      if(!token)throw new Error("El enlace del formulario no es válido.");
      if(kind==="forms")return renderLanding(await request(`${apiBase}/public/form-definitions/${encodeURIComponent(token)}`));
      sessionApi=`${apiBase}/public/forms/${encodeURIComponent(token)}`;payload=await request(sessionApi);renderSession();
    }catch(error){app.innerHTML=`<div class="form-inner"><h1>No disponible</h1><p>${escapeHtml(error.message||"El formulario no existe o expiró.")}</p></div>`;}
  }
  init();
})();
