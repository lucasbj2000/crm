/* V21.3 · Order + White-Label Studio */
(() => {
  const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const BASE={
    systemName:'WhatsBot CRM',shortName:'WhatsBot',subtitle:'CRM LOCAL',
    primaryColor:'#171717',accentColor:'#FF7A00',backgroundColor:'#F3F3F3',sidebarColor:'#101010',surfaceColor:'#FFFFFF',textColor:'#1B1B1B',
    fontStyle:'modern',radius:'18',logoFit:'contain',defaultTheme:'light',loginKicker:'CONTROL LOCAL · 24/7',loginMessage:'Ingresá con tu usuario para administrar las conversaciones, el bot y el stock.',loginStyle:'ambient',showSubtitle:true
  };
  const PRESETS={
    emerald:{primaryColor:'#143c2f',accentColor:'#b9d977',backgroundColor:'#f4f2ea',sidebarColor:'#12382c',surfaceColor:'#ffffff',textColor:'#1a2b24'},
    corporate:{primaryColor:'#123A63',accentColor:'#4FA3FF',backgroundColor:'#F4F7FB',sidebarColor:'#102F50',surfaceColor:'#FFFFFF',textColor:'#172B3D'},
    navy:{primaryColor:'#111D38',accentColor:'#D5B45D',backgroundColor:'#F6F4EE',sidebarColor:'#101A31',surfaceColor:'#FFFFFF',textColor:'#1F2738'},
    burgundy:{primaryColor:'#5A1830',accentColor:'#E1B46E',backgroundColor:'#F8F3F2',sidebarColor:'#4A1227',surfaceColor:'#FFFFFF',textColor:'#35232A'},
    graphite:{primaryColor:'#252A31',accentColor:'#63C3A3',backgroundColor:'#F2F4F5',sidebarColor:'#20252B',surfaceColor:'#FFFFFF',textColor:'#242B30'},
    orange:{primaryColor:'#171717',accentColor:'#FF7A00',backgroundColor:'#F3F3F3',sidebarColor:'#101010',surfaceColor:'#FFFFFF',textColor:'#1B1B1B'}
  };
  let ready=false,dirty=false;
  const fields=['system-name','short-name','subtitle','primary-color','accent-color','background-color','sidebar-color','surface-color','text-color','font-style','radius','logo-fit','default-theme','login-kicker','login-message','login-style','show-subtitle'];
  const field=(key)=>q(`#brand-${key}`);
  const current=()=>({...BASE,...(appState?.settings?.branding||{})});
  function fromForm(){return {
    systemName:field('system-name')?.value.trim()||BASE.systemName,
    shortName:field('short-name')?.value.trim()||BASE.shortName,
    subtitle:field('subtitle')?.value.trim()||BASE.subtitle,
    primaryColor:field('primary-color')?.value||BASE.primaryColor,
    accentColor:field('accent-color')?.value||BASE.accentColor,
    backgroundColor:field('background-color')?.value||BASE.backgroundColor,
    sidebarColor:field('sidebar-color')?.value||BASE.sidebarColor,
    surfaceColor:field('surface-color')?.value||BASE.surfaceColor,
    textColor:field('text-color')?.value||BASE.textColor,
    fontStyle:field('font-style')?.value||'modern',radius:field('radius')?.value||'18',logoFit:field('logo-fit')?.value||'contain',defaultTheme:field('default-theme')?.value||'light',
    loginKicker:field('login-kicker')?.value.trim()||BASE.loginKicker,loginMessage:field('login-message')?.value.trim()||BASE.loginMessage,loginStyle:field('login-style')?.value||'ambient',showSubtitle:field('show-subtitle')?.value!=='false',
    logoUrl:current().logoUrl||'',logoFileName:current().logoFileName||''
  }}
  function setForm(brand){brand={...BASE,...brand};const set=(k,v)=>{const el=field(k);if(el)el.value=String(v??'')};set('system-name',brand.systemName);set('short-name',brand.shortName);set('subtitle',brand.subtitle);set('primary-color',brand.primaryColor);set('accent-color',brand.accentColor);set('background-color',brand.backgroundColor);set('sidebar-color',brand.sidebarColor||brand.primaryColor);set('surface-color',brand.surfaceColor);set('text-color',brand.textColor);set('font-style',brand.fontStyle);set('radius',brand.radius);set('logo-fit',brand.logoFit);set('default-theme',brand.defaultTheme);set('login-kicker',brand.loginKicker);set('login-message',brand.loginMessage);set('login-style',brand.loginStyle);set('show-subtitle',brand.showSubtitle!==false);paintPreview(brand,false)}
  function logoNode(target,brand,letter){if(!target)return;const url=brand.logoUrl||(brand.logoFileName?'/api/branding/logo':'');target.innerHTML=url?`<img src="${url}?v=${encodeURIComponent(brand.logoFileName||Date.now())}" alt="Logo">`:(letter||String(brand.shortName||brand.systemName||'W')[0].toUpperCase())}
  function paintPreview(input=fromForm(),mark=true){const b={...BASE,...input};
    document.documentElement.style.setProperty('--brand-sidebar',b.sidebarColor);document.documentElement.style.setProperty('--green',b.primaryColor);document.documentElement.style.setProperty('--green-2',b.primaryColor);document.documentElement.style.setProperty('--lime',b.accentColor);document.documentElement.style.setProperty('--cream',b.backgroundColor);document.documentElement.style.setProperty('--xp-surface',b.surfaceColor);document.documentElement.style.setProperty('--xp-text',b.textColor);document.documentElement.style.setProperty('--xp-radius',`${Number(b.radius)||18}px`);document.documentElement.style.setProperty('--brand-logo-fit',b.logoFit);document.body.dataset.brandFont=b.fontStyle;document.body.dataset.brandLogin=b.loginStyle;
    qa('[data-color-code]').forEach(code=>{const el=q(`#${code.dataset.colorCode}`);if(el)code.textContent=el.value.toUpperCase()});
    if(q('#v213-preview-system-name'))q('#v213-preview-system-name').textContent=b.systemName;if(q('#v213-preview-short-name'))q('#v213-preview-short-name').textContent=b.shortName;if(q('#v213-preview-login-name'))q('#v213-preview-login-name').textContent=b.systemName;if(q('#v213-preview-kicker'))q('#v213-preview-kicker').textContent=b.loginKicker;if(q('#v213-preview-login-message'))q('#v213-preview-login-message').textContent=b.loginMessage;
    logoNode(q('#v213-preview-login-logo'),b);logoNode(q('#v213-preview-sidebar-logo'),b);
    if(mark){dirty=true;q('#v213-brand-unsaved')?.removeAttribute('hidden')}
  }
  function clearDirty(){dirty=false;q('#v213-brand-unsaved')?.setAttribute('hidden','')}
  function showBrandSection(key){qa('[data-v213-brand-section]').forEach(x=>x.classList.toggle('active',x.dataset.v213BrandSection===key));qa('[data-v213-brand-panel]').forEach(x=>x.classList.toggle('active',x.dataset.v213BrandPanel===key));if(innerWidth<700)q('.v213-design-main')?.scrollIntoView({behavior:'smooth',block:'start'})}
  function setupBrandStudio(){
    qa('[data-v213-brand-section]').forEach(b=>b.addEventListener('click',()=>showBrandSection(b.dataset.v213BrandSection)));
    fields.forEach(k=>{const el=field(k);if(!el)return;el.addEventListener(el.matches('select,input[type=color]')?'change':'input',()=>paintPreview())});
    qa('[data-brand-preset]').forEach(btn=>btn.addEventListener('click',()=>{const preset=PRESETS[btn.dataset.brandPreset];if(!preset)return;Object.entries(preset).forEach(([k,v])=>{const id={'primaryColor':'primary-color','accentColor':'accent-color','backgroundColor':'background-color','sidebarColor':'sidebar-color','surfaceColor':'surface-color','textColor':'text-color'}[k];if(field(id))field(id).value=v});paintPreview();showToast?.(`Paleta ${btn.querySelector('b')?.textContent||''} aplicada. Guardá para confirmar.`)}));
    q('#v213-save-branding-bottom')?.addEventListener('click',()=>q('#save-branding-button')?.click());
    q('#v213-revert-branding')?.addEventListener('click',()=>{setForm(current());applyBranding(current());clearDirty();showToast?.('Cambios visuales descartados')});
    q('#v213-reset-branding')?.addEventListener('click',async()=>{if(!confirm('¿Restablecer el diseño base? El logo actual se conservará hasta que lo quites manualmente.'))return;setForm({...BASE,logoUrl:current().logoUrl,logoFileName:current().logoFileName});paintPreview();showToast?.('Diseño base preparado. Presioná Guardar diseño para aplicarlo.')});
    q('#v213-export-branding')?.addEventListener('click',()=>{const b=fromForm();delete b.logoUrl;delete b.logoFileName;const blob=new Blob([JSON.stringify({product:'CRM White-Label',version:'21.4',branding:b},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`tema-${String(b.shortName||'crm').toLowerCase().replace(/[^a-z0-9]+/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
    q('#v213-import-branding')?.addEventListener('click',()=>q('#v213-import-branding-file')?.click());
    q('#v213-import-branding-file')?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const raw=JSON.parse(await file.text());const b=raw.branding||raw;if(!b.primaryColor||!b.systemName)throw new Error('El archivo no contiene un tema compatible.');setForm({...current(),...b});paintPreview();showToast?.('Tema importado. Revisalo y guardalo para aplicarlo.')}catch(err){showToast?.(err.message||'No se pudo importar el tema','error')}finally{e.target.value=''}});
    q('#save-branding-button')?.addEventListener('click',()=>setTimeout(()=>{clearDirty();paintPreview(current(),false)},350));
    q('#upload-brand-logo-button')?.addEventListener('click',()=>setTimeout(()=>paintPreview(current(),false),550));
    q('#remove-brand-logo-button')?.addEventListener('click',()=>setTimeout(()=>paintPreview(current(),false),350));
    setForm(current());clearDirty();
  }
  function group(title,copy,key){const sec=document.createElement('section');sec.className='v213-settings-group';sec.dataset.v213SettingsGroup=key;sec.innerHTML=`<div class="v213-group-heading"><div><h3>${title}</h3><p>${copy}</p></div></div>`;return sec}
  function organizeSettings(){const view=q('[data-view-panel="settings"]');if(!view||q('.v213-settings-shell',view))return;
    const shell=document.createElement('div');shell.className='v213-settings-shell';shell.innerHTML=`<div class="v213-settings-hero"><div><p class="kicker">CENTRO DE CONFIGURACIÓN</p><h2>Configuración ordenada</h2><p>Las opciones están agrupadas por función para que puedas administrar el sistema sin recorrer una pantalla interminable.</p></div><button class="button primary v213-settings-design-button" type="button">Diseño y marca →</button></div><nav class="v213-settings-tabs"><button class="active" type="button" data-v213-settings-tab="general">General</button><button type="button" data-v213-settings-tab="team">Usuarios</button><button type="button" data-v213-settings-tab="automation">Automatización</button><button type="button" data-v213-settings-tab="ai">Administración IA</button><button type="button" data-v213-settings-tab="security">Seguridad</button><button type="button" data-v213-settings-tab="all">Ver todo</button></nav>`;
    const groups={general:group('General','Módulos, experiencia y operación.','general'),team:group('Usuarios y equipo','Altas, permisos y responsables.','team'),automation:group('Automatización','Seguimientos, BOT y campos del CRM.','automation'),ai:group('Administración asistida','Acciones administrativas controladas por IA.','ai'),security:group('Seguridad','Acceso y controles sensibles.','security')};
    const move=(sel,key)=>{const el=q(sel,view);if(el)groups[key].appendChild(el)};
    move('#xp-experience-studio','general');move('#platform-config-panel','general');move('#operations-admin-panel','general');move('#users-panel','team');move('#automation-admin-content','automation');move('#automation-admin-footer','automation');move('#bot-instructions-panel','automation');move('#custom-fields-panel','automation');move('#admin-assistant-panel','ai');move('.security-panel','security');
    Object.values(groups).forEach(g=>shell.appendChild(g));view.appendChild(shell);
    const select=key=>{qa('[data-v213-settings-tab]',shell).forEach(b=>b.classList.toggle('active',b.dataset.v213SettingsTab===key));qa('[data-v213-settings-group]',shell).forEach(g=>g.hidden=key!=='all'&&g.dataset.v213SettingsGroup!==key)};
    qa('[data-v213-settings-tab]',shell).forEach(b=>b.addEventListener('click',()=>select(b.dataset.v213SettingsTab)));q('.v213-settings-design-button',shell)?.addEventListener('click',()=>switchView('design'));select('general')
  }
  function access(){const admin=appState?.currentUser?.role==='admin';const nav=q('.nav-item[data-view="design"]');if(nav)nav.hidden=!admin;const view=q('[data-view-panel="design"]');if(view&&!admin&&currentView==='design')switchView('home');}
  function applyDefaultThemeOnce(){if(!appState)return;const key='whatsbot-v21-1-experience';if(localStorage.getItem(key))return;const b=current();let theme=b.defaultTheme||'light';if(theme==='system')theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';try{localStorage.setItem(key,JSON.stringify({theme,density:'comfortable',sidebar:'expanded',focus:false,start:'home',board:'kanban',navGroups:{}}))}catch{}}
  function updateFromState(){if(!appState)return;access();applyDefaultThemeOnce();if(!dirty&&field('system-name'))setForm(current());}
  function init(){if(ready)return;ready=true;document.body.classList.add('v213-order');organizeSettings();setupBrandStudio();
    const oldRender=renderAll;renderAll=function(){oldRender();updateFromState()};
    const oldSwitch=switchView;switchView=function(view){oldSwitch(view);if(view==='design'&&!dirty)setForm(current());if(view==='settings')setTimeout(()=>q('[data-v213-settings-tab="general"]')?.click(),0)};
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='b'&&appState?.currentUser?.role==='admin'){e.preventDefault();switchView('design')}});
    updateFromState();
  }
  init();
})();
