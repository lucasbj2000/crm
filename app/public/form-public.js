(() => {
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
  const setTheme=(company={})=>{document.documentElement.style.setProperty("--form-primary",company.primaryColor||"#171717");document.documentElement.style.setProperty("--form-accent",company.accentColor||"#FF7A00");};
  const brand=(company,copy="Formulario seguro")=>`<div class="brand"><span class="brand-mark">CRM</span><div><b>${escapeHtml(company?.name||"CRM")}</b><small>${escapeHtml(copy)}</small></div></div>`;
  const showError=(message)=>{const error=document.getElementById("form-error");if(error)error.textContent=message||"";};

  function renderLanding(definition){
    const company=definition.company||{},form=definition.form||{};setTheme(company);document.title=form.name||"Formulario";
    const identity=form.collectIdentity||"optional";
    const identityFields=identity==="anonymous"?"":`<div class="identity"><div class="identity-grid"><label class="field wide"><span>Nombre${identity==="required"?' *':''}</span><input class="input" id="visitor-name" maxlength="160" autocomplete="name" ${identity==="required"?'required':''}></label><label class="field"><span>Teléfono</span><input class="input" id="visitor-phone" type="tel" maxlength="30" autocomplete="tel"></label><label class="field"><span>Correo</span><input class="input" id="visitor-email" type="email" maxlength="240" autocomplete="email"></label></div><div class="identity-note">${identity==="required"?'El nombre es necesario para identificar la respuesta.':'Estos datos son opcionales; también podés responder de forma anónima.'}</div></div>`;
    app.innerHTML=`${brand(company,"Formulario independiente")}<h1>${escapeHtml(form.name)}</h1><p>${escapeHtml(form.description||form.introMessage||"")}</p><div class="identity-note">${Number(form.questionCount||0)} campo${Number(form.questionCount||0)===1?'':'s'} para completar</div>${identityFields}<label class="honeypot" aria-hidden="true">Sitio web<input id="visitor-website" tabindex="-1" autocomplete="off"></label><div class="actions"><button class="button primary" id="start-form" type="button">Comenzar</button></div><div class="error" id="form-error"></div>`;
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
      app.innerHTML=`<div class="done"><span class="brand-mark">✓</span><h1>Formulario completado</h1><p>${escapeHtml(form.closingMessage||"Gracias por completar el formulario.")}</p></div>`;return;
    }
    const question=payload.question;if(!question){app.innerHTML=`${brand(company)}<h1>Formulario no disponible</h1><p>No encontramos una pregunta pendiente.</p>`;return;}
    const progress=Math.round((Number(session.answered||0)/Math.max(1,Number(session.total||1)))*100);
    app.innerHTML=`${brand(company)}<h1>${escapeHtml(form.name)}</h1><p>${escapeHtml(form.description||"")}</p><div class="progress" style="--progress:${progress}%"><i></i></div><h2 class="question">${escapeHtml(question.text)}${question.required?'<span class="required"> *</span>':''}</h2>${fieldMarkup(question)}<div class="actions"><button class="button primary" id="next-question" type="button">Continuar</button></div><div class="error" id="form-error"></div>`;
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
    }catch(error){app.innerHTML=`<h1>No disponible</h1><p>${escapeHtml(error.message||"El formulario no existe o expiró.")}</p>`;}
  }
  init();
})();
