/* V21.9 · Product Design System + UX integral */
(()=>{
  'use strict';
  const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const icon=(n)=>typeof window.crmIcon==='function'?window.crmIcon(n):'';
  const UI_KEY='whatsbot-v21-9-ui';
  const HOME_WIDGETS={metrics:'Indicadores principales',attention:'Prioridades',health:'Salud operativa',activity:'Ritmo comercial',team:'Equipo disponible',timeline:'Actividad reciente',recommendations:'Recomendaciones IA'};
  const DEFAULTS={home:{metrics:true,attention:true,health:true,activity:true,team:true,timeline:false,recommendations:true},compactHeader:true};
  let prefs=load();
  let formObserver=null;
  function load(){try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(UI_KEY)||'{}'),home:{...DEFAULTS.home,...(JSON.parse(localStorage.getItem(UI_KEY)||'{}').home||{})}}}catch{return structuredClone(DEFAULTS)}}
  function save(){try{localStorage.setItem(UI_KEY,JSON.stringify(prefs))}catch{}}
  function toast(m,t){if(typeof window.showToast==='function')window.showToast(m,t);else if(typeof window.toast==='function')window.toast(m,t)}
  function safe(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

  function installTooltips(root=document){
    qa('button,[role="button"],.icon-button,.xp-tool-button',root).forEach(el=>{
      if(el.dataset.tooltip)return;
      const label=el.getAttribute('aria-label')||el.getAttribute('title');
      if(label){el.dataset.tooltip=label;el.removeAttribute('title')}
    });
  }

  function installHeader(){
    const tools=q('.xp-header-tools'), operational=q('.header-actions.operational-header');
    if(!tools||q('#v219-more-button'))return;
    document.body.classList.add('v219-header-clean');
    const attendance=q('.header-attendance');
    if(attendance){attendance.classList.add('v219-status-pill');tools.insertBefore(attendance,q('#xp-create-button'))}
    const moreBtn=document.createElement('button');moreBtn.type='button';moreBtn.className='xp-tool-button v219-more-button';moreBtn.id='v219-more-button';moreBtn.innerHTML=icon('menu');moreBtn.setAttribute('aria-label','Más herramientas');
    const profile=document.createElement('button');profile.type='button';profile.className='v219-profile-button';profile.id='v219-profile-button';profile.setAttribute('aria-label','Cuenta y preferencias');profile.innerHTML='<span id="v219-profile-avatar">A</span>';
    const create=q('#xp-create-button');tools.insertBefore(moreBtn,create?.nextSibling||null);tools.appendChild(profile);

    const menu=document.createElement('div');menu.className='v219-popover';menu.id='v219-more-menu';menu.innerHTML=`<header><b>Herramientas</b><small>Información secundaria y preferencias</small></header><div class="v219-popover-grid" id="v219-operational-tools"></div><div class="v219-popover-actions"><button type="button" data-v219-action="theme">${icon('moon')}<span>Tema claro / oscuro</span></button><button type="button" data-v219-action="focus">${icon('focus')}<span>Modo foco</span></button><button type="button" data-v219-action="density">${icon('list')}<span>Densidad cómoda / compacta</span></button><button type="button" data-v219-action="shortcuts">${icon('menu')}<span>Atajos del teclado</span></button></div>`;
    document.body.appendChild(menu);
    const op=q('#v219-operational-tools');
    if(operational){
      [...operational.children].forEach(el=>{if(el!==attendance){el.classList.add('v219-moved-tool');op.appendChild(el)}});
      operational.hidden=true;
    }
    const oldTheme=q('#xp-theme-button'),oldFocus=q('#xp-focus-button');if(oldTheme)oldTheme.hidden=true;if(oldFocus)oldFocus.hidden=true;
    moreBtn.addEventListener('click',e=>{e.stopPropagation();menu.classList.toggle('open');account.classList.remove('open');positionPopover(menu,moreBtn)});
    menu.addEventListener('click',e=>{const b=e.target.closest('[data-v219-action]');if(!b)return;const a=b.dataset.v219Action;if(a==='theme')oldTheme?.click();if(a==='focus')oldFocus?.click();if(a==='density')toggleDensity();if(a==='shortcuts')openShortcuts();});

    const account=document.createElement('div');account.id='v219-account-menu';account.className='v219-popover v219-account-popover';account.innerHTML=`<div class="v219-account-head"><span id="v219-account-avatar">A</span><div><b id="v219-account-name">Usuario</b><small id="v219-account-meta">Cuenta</small></div></div><button data-v219-account="settings" type="button">${icon('settings')}<span>Configuración</span></button><button data-v219-account="design" type="button">${icon('spark')}<span>Diseño y marca</span></button><button data-v219-account="logout" type="button">${icon('arrow')}<span>Cerrar sesión</span></button>`;document.body.appendChild(account);
    profile.addEventListener('click',e=>{e.stopPropagation();account.classList.toggle('open');menu.classList.remove('open');syncAccount();positionPopover(account,profile)});
    account.addEventListener('click',e=>{const b=e.target.closest('[data-v219-account]');if(!b)return;account.classList.remove('open');const a=b.dataset.v219Account;if(a==='settings')window.switchView?.('settings');if(a==='design')window.switchView?.('design');if(a==='logout')q('#logout-button')?.click()});
    document.addEventListener('click',e=>{if(!e.target.closest('#v219-more-menu,#v219-more-button'))menu.classList.remove('open');if(!e.target.closest('#v219-account-menu,#v219-profile-button'))account.classList.remove('open')});
    window.addEventListener('resize',()=>{menu.classList.remove('open');account.classList.remove('open')});
    const weatherIcon=q('#weather-icon');if(weatherIcon)weatherIcon.innerHTML=icon('cloud');
    const logoutGlyph=q('#logout-button > span');if(logoutGlyph)logoutGlyph.innerHTML=icon('logout');
    syncAccount();
  }
  function positionPopover(el,anchor){const r=anchor.getBoundingClientRect();el.style.top=`${Math.min(innerHeight-20,r.bottom+8)}px`;el.style.right=`${Math.max(12,innerWidth-r.right)}px`}
  function syncAccount(){const n=q('#current-user-name')?.textContent?.trim()||'Usuario',role=q('#current-user-role')?.textContent?.trim()||'',branch=q('#current-user-branch')?.textContent?.trim()||'';const initials=n.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'U';['#v219-profile-avatar','#v219-account-avatar'].forEach(s=>{if(q(s))q(s).textContent=initials});if(q('#v219-account-name'))q('#v219-account-name').textContent=n;if(q('#v219-account-meta'))q('#v219-account-meta').textContent=[role,branch].filter(Boolean).join(' · ')}
  function toggleDensity(){const key='whatsbot-v21-1-experience';let xp={};try{xp=JSON.parse(localStorage.getItem(key)||'{}')}catch{};xp.density=xp.density==='compact'?'comfortable':'compact';localStorage.setItem(key,JSON.stringify(xp));document.body.classList.toggle('xp-density-compact',xp.density==='compact');toast(`Vista ${xp.density==='compact'?'compacta':'cómoda'} activada.`)}

  function openShortcuts(){
    let d=q('#v219-shortcuts-dialog');if(!d){d=document.createElement('dialog');d.id='v219-shortcuts-dialog';d.innerHTML=`<section class="dialog-card v219-shortcuts"><header><div><p class="kicker">ATAJOS</p><h3>Trabajá más rápido</h3></div><button class="icon-button close" type="button" aria-label="Cerrar">${icon('close')}</button></header><div class="v219-shortcut-grid"><span><kbd>Ctrl</kbd><kbd>K</kbd><b>Buscar y navegar</b></span><span><kbd>A</kbd><b>Abrir Copiloto IA</b></span><span><kbd>Esc</kbd><b>Cerrar paneles</b></span><span><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>B</kbd><b>Diseño y marca</b></span></div><footer><button class="button primary" type="button">Entendido</button></footer></section>`;document.body.appendChild(d);qa('button',d).forEach(b=>b.addEventListener('click',()=>d.close()))}d.showModal()}

  function installHomeCustomizer(){
    const home=q('#xp-home');if(!home||q('#v219-home-customize'))return;
    annotateHome();
    const button=document.createElement('button');button.type='button';button.id='v219-home-customize';button.className='button ghost v219-home-customize';button.innerHTML=`${icon('settings')}<span>Personalizar inicio</span>`;
    const hero=q('.xp-home-hero',home);hero?.appendChild(button);
    const panel=document.createElement('div');panel.id='v219-home-panel';panel.className='v219-home-panel';panel.innerHTML=`<header><div><b>Tu centro de trabajo</b><small>Mostrá solo lo que necesitás para tu rol.</small></div><button type="button" aria-label="Cerrar">${icon('close')}</button></header><div>${Object.entries(HOME_WIDGETS).map(([k,v])=>`<label><input type="checkbox" data-v219-widget-toggle="${k}"><span>${v}</span></label>`).join('')}</div><footer><button class="button ghost" type="button" data-v219-home="reset">Restablecer</button><button class="button primary" type="button" data-v219-home="done">Listo</button></footer>`;document.body.appendChild(panel);
    button.addEventListener('click',e=>{e.stopPropagation();syncHomeControls();panel.classList.toggle('open');const r=button.getBoundingClientRect();panel.style.top=`${r.bottom+8}px`;panel.style.right=`${Math.max(12,innerWidth-r.right)}px`});
    panel.addEventListener('change',e=>{if(!e.target.matches('[data-v219-widget-toggle]'))return;prefs.home[e.target.dataset.v219WidgetToggle]=e.target.checked;save();applyHomePrefs()});
    panel.addEventListener('click',e=>{const close=e.target.closest('header button');if(close)panel.classList.remove('open');const b=e.target.closest('[data-v219-home]');if(!b)return;if(b.dataset.v219Home==='reset'){prefs.home={...DEFAULTS.home};save();syncHomeControls();applyHomePrefs()}else panel.classList.remove('open')});
    document.addEventListener('click',e=>{if(!e.target.closest('#v219-home-panel,#v219-home-customize'))panel.classList.remove('open')});
    applyHomePrefs();
  }
  function annotateHome(){const map={metrics:q('#xp-home-metrics'),attention:q('#xp-home-attention')?.closest('article'),health:q('#xp-home-health-bars')?.closest('article'),activity:q('#xp-home-chart')?.closest('article'),team:q('#xp-home-team')?.closest('article'),timeline:q('#xp-home-timeline')?.closest('article'),recommendations:q('#xp-home-recommendations')?.closest('article')};for(const[k,el]of Object.entries(map))if(el)el.dataset.v219HomeWidget=k}
  function syncHomeControls(){qa('[data-v219-widget-toggle]').forEach(i=>i.checked=prefs.home[i.dataset.v219WidgetToggle]!==false)}
  function applyHomePrefs(){annotateHome();qa('[data-v219-home-widget]').forEach(el=>el.hidden=prefs.home[el.dataset.v219HomeWidget]===false);qa('.xp-home-grid').forEach(g=>{const visible=[...g.children].some(c=>!c.hidden);g.hidden=!visible;g.classList.toggle('v219-single',[...g.children].filter(c=>!c.hidden).length===1)})}

  function statusTone(label=''){const s=label.toLowerCase();if(/ganad|aprobado|confirmado|entregado|postventa/.test(s))return'success';if(/perdid|rechaz|cancel/.test(s))return'danger';if(/esper|pendiente|presupuesto enviado|pago pendiente/.test(s))return'warning';if(/prepar|negoci|relev|contact/.test(s))return'info';return'neutral'}
  function decorateStatuses(){qa('.v216-deal-status').forEach(el=>{el.dataset.tone=statusTone(el.textContent)});const box=q('#v216-commercial-status');if(box){box.dataset.tone=statusTone(q('#v216-commercial-status-label')?.textContent||'')}}

  function upgradeFormBuilder(){
    const form=q('#form-builder');if(!form||form.dataset.v219==='1')return;form.dataset.v219='1';form.classList.add('v219-form-builder');
    const questions=q('#form-questions',form);if(!questions)return;
    const config=questions.closest('.v216-config');
    const palette=document.createElement('div');palette.className='v219-field-palette';palette.innerHTML=`<div><b>Agregar campo</b><small>Elegí el tipo y luego personalizalo.</small></div><div>${[['text','Texto','edit'],['longtext','Texto largo','list'],['options','Opciones','filter'],['yesno','Sí / No','check'],['rating','Calificación','spark'],['number','Número','chart'],['email','Correo','send'],['date','Fecha','task']].map(([type,label,ic])=>`<button type="button" data-v219-add-field="${type}">${icon(ic)}<span>${label}</span></button>`).join('')}</div>`;config?.insertBefore(palette,questions);
    palette.addEventListener('click',e=>{const b=e.target.closest('[data-v219-add-field]');if(!b)return;q('#form-add-question')?.click();requestAnimationFrame(()=>{const card=questions.lastElementChild;if(!card)return;const sel=q('[data-q-type]',card);sel.value=b.dataset.v219AddField;sel.dispatchEvent(new Event('change',{bubbles:true}));if(b.dataset.v219AddField==='yesno'){const t=q('[data-q-options]',card);if(t&&!t.value.trim())t.value='Sí\nNo'}q('[data-q-text]',card)?.focus();updateFormPreview()})});
    const preview=document.createElement('aside');preview.id='v219-form-live-preview';preview.className='v219-form-live-preview';preview.innerHTML=`<div class="v219-phone"><header><span class="v219-phone-avatar">B</span><div><b>Vista del cliente</b><small>WhatsApp · Bot</small></div></header><main id="v219-form-preview-chat"></main><footer><span>Escribí un mensaje</span>${icon('send')}</footer></div><small>Vista previa orientativa. El formulario real se conversa por WhatsApp.</small></aside>`;form.appendChild(preview);
    questions.addEventListener('dragstart',e=>{const card=e.target.closest('.v216-question');if(!card)return;card.classList.add('dragging');e.dataTransfer.effectAllowed='move'});questions.addEventListener('dragend',e=>{e.target.closest('.v216-question')?.classList.remove('dragging');qa('.v216-question',questions).forEach((c,i)=>{const n=q('.v216-q-number',c);if(n)n.textContent=String(i+1)});updateFormPreview()});questions.addEventListener('dragover',e=>{e.preventDefault();const dragging=q('.v216-question.dragging',questions);if(!dragging)return;const after=getDragAfter(questions,e.clientY);if(after)questions.insertBefore(dragging,after);else questions.appendChild(dragging)});
    const markDraggable=()=>qa('.v216-question',questions).forEach(c=>{c.draggable=true;c.classList.add('v219-draggable')});
    const mo=new MutationObserver(()=>{markDraggable();updateFormPreview()});mo.observe(questions,{childList:true,subtree:true,characterData:true});markDraggable();
    form.addEventListener('input',updateFormPreview);form.addEventListener('change',updateFormPreview);updateFormPreview();
  }
  function getDragAfter(container,y){const els=qa('.v216-question:not(.dragging)',container);return els.reduce((closest,child)=>{const box=child.getBoundingClientRect(),offset=y-box.top-box.height/2;return offset<0&&offset>closest.offset?{offset,element:child}:closest},{offset:Number.NEGATIVE_INFINITY}).element}
  function updateFormPreview(){const chat=q('#v219-form-preview-chat'),form=q('#form-builder');if(!chat||!form)return;const intro=q('#form-intro')?.value?.trim()||'Necesitamos algunos datos para continuar.';const close=q('#form-closing')?.value?.trim()||'¡Gracias!';const cards=qa('.v216-question',form);let html=`<div class="v219-bubble bot">${safe(intro)}</div>`;cards.slice(0,5).forEach((c,i)=>{const text=q('[data-q-text]',c)?.value?.trim()||`Pregunta ${i+1}`;const type=q('[data-q-type]',c)?.value;html+=`<div class="v219-bubble bot"><b>${i+1}.</b> ${safe(text)}${type==='rating'?'<small>Respondé del 1 al 10</small>':type==='yesno'?'<small>Sí / No</small>':type==='options'?'<small>Elegí una opción</small>':''}</div>`});if(cards.length>5)html+=`<div class="v219-bubble system">+ ${cards.length-5} campos más</div>`;html+=`<div class="v219-bubble bot muted">${safe(close)}</div>`;chat.innerHTML=html;chat.scrollTop=0}

  function installLoadingExperience(){
    const original=window.switchView;if(typeof original==='function'&&!original.__v219){const wrapped=function(view){const panel=q(`[data-view-panel="${CSS.escape(view)}"]`);if(panel){panel.classList.add('v219-entering');setTimeout(()=>panel.classList.remove('v219-entering'),260)}return original.apply(this,arguments)};wrapped.__v219=true;window.switchView=wrapped}
  }

  function improveEmptyStates(){qa('.column-empty,.xp-empty').forEach(el=>{if(el.dataset.v219Empty)return;el.dataset.v219Empty='1';el.classList.add('v219-empty');if(!el.querySelector('svg'))el.insertAdjacentHTML('afterbegin',icon('spark'))})}

  function labelPrimaryActions(){const view=q('.view.active');if(!view)return;qa('.button.primary',view).forEach((b,i)=>b.classList.toggle('v219-secondary-primary',i>0))}

  function enhance(){installHeader();installHomeCustomizer();upgradeFormBuilder();decorateStatuses();installTooltips();improveEmptyStates();syncAccount();applyHomePrefs();labelPrimaryActions()}
  function init(){document.body.classList.add('v219-product-ui');installLoadingExperience();enhance();let enhanceTimer=null;const scheduleEnhance=(delay=100)=>{clearTimeout(enhanceTimer);enhanceTimer=setTimeout(enhance,delay)};const mo=new MutationObserver(rows=>{if(rows.some(r=>r.addedNodes?.length||r.removedNodes?.length))scheduleEnhance(120)});mo.observe(document.body,{childList:true,subtree:true,characterData:false});window.addEventListener('crm:state',()=>scheduleEnhance(60));window.addEventListener('beforeunload',()=>{mo.disconnect();formObserver?.disconnect()},{once:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
