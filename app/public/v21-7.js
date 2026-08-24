/* V21.7 · Iconografía consistente y retoques de experiencia */
(()=>{
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const icon=(name)=>typeof window.crmIcon==='function'?window.crmIcon(name):'';
  function iconOnly(el,name,label){if(!el||el.dataset.v217Iconized==='1')return;el.innerHTML=icon(name);if(label)el.setAttribute('aria-label',label);el.dataset.v217Iconized='1';}
  function textIcon(el,name){if(!el||el.dataset.v217Iconized==='1')return;let text=(el.textContent||'').trim().replace(/^[＋+↻✓✦◆▦▤⚡⇅▥⌕☎]+\s*/,'');el.innerHTML=`${icon(name)}<span>${text}</span>`;el.classList.add('v217-icon-text');el.dataset.v217Iconized='1';}
  function decorate(){
    qa('.icon-button.close,[data-dialog-close].icon-button,[data-v216-close].icon-button').forEach(el=>iconOnly(el,'close','Cerrar'));
    iconOnly(q('#dismiss-call-alert'),'close','Cerrar alerta');
    const bell=q('#xp-notification-button');if(bell&&!bell.dataset.v217Bell){const badge=q('#xp-notification-count',bell);bell.innerHTML=`${icon('bell')}${badge?badge.outerHTML:'<span class="xp-badge" id="xp-notification-count" hidden>0</span>'}`;bell.dataset.v217Bell='1';}
    iconOnly(q('#refresh-button'),'refresh','Actualizar');
    textIcon(q('#new-client-button'),'plus');textIcon(q('#install-app-button'),'plus');textIcon(q('#new-task-button'),'plus');textIcon(q('#new-objective-button'),'plus');textIcon(q('#new-approval-button'),'plus');
    const search=q('.search-box>span');if(search&&!search.dataset.v217Iconized){search.innerHTML=icon('search');search.classList.add('v217-search-icon');search.dataset.v217Iconized='1';}
    const metrics=qa('.metric-icon');const names=['deals','alert','check','stock'];metrics.forEach((el,i)=>iconOnly(el,names[i]||'chart'));
    const call=q('#call-alert-icon');if(call&&!call.dataset.v217Iconized){call.innerHTML=icon('phone');call.classList.add('v217-symbol-icon');call.dataset.v217Iconized='1';}
    qa('.smart-alert>span').forEach(el=>iconOnly(el,'alert'));
    textIcon(q('#connect-button'),'whatsapp');
    textIcon(q('#generate-management-brief'),'ai');textIcon(q('#ai-analyze-button'),'ai');textIcon(q('#mark-won-button'),'check');textIcon(q('#experience-preview-button'),'play');
    iconOnly(q('#stock-empty > span'),'stock');iconOnly(q('#campaign-preview > span'),'search');iconOnly(q('.v213-style-note > span'),'check');iconOnly(q('.experience-note > span'),'spark');
    qa('.ai-hero-badge > span,.management-brief-content > span,.copilot-orb').forEach(el=>{iconOnly(el,'ai');el.classList.add('v217-symbol-icon');});
    const aiBadge=q('.ai-badge');if(aiBadge&&!aiBadge.dataset.v217Iconized){aiBadge.innerHTML=`${icon('ai')}<span>IA asistida</span>`;aiBadge.classList.add('v217-icon-text');aiBadge.dataset.v217Iconized='1';}
    const aiToolbar=q('.agent-ai-toolbar > span');if(aiToolbar&&!aiToolbar.dataset.v217Iconized){aiToolbar.innerHTML=`${icon('ai')}<b>IA</b>`;aiToolbar.classList.add('v217-icon-text');aiToolbar.dataset.v217Iconized='1';}
    const newsIcons=['news','alert','check'];qa('.news-summary article > span').forEach((el,i)=>iconOnly(el,newsIcons[i]||'news'));
    qa('.notice > span').forEach(el=>{iconOnly(el,'ai');el.classList.add('v217-symbol-icon');});
    const formNav=q('.nav-item[data-view="forms"] > span');if(formNav&&(!formNav.querySelector('svg'))){formNav.className='xp-icon';formNav.innerHTML=icon('forms');}
    qa('[data-form-action]').forEach(el=>{if(el.querySelector('svg'))return;const map={edit:'edit',send:'send',report:'reports',preview:'eye',toggle:(el.textContent||'').includes('Pausar')?'pause':'play',delete:'trash'};textIcon(el,map[el.dataset.formAction]||'forms');});
    qa('[data-remove-q]').forEach(el=>iconOnly(el,'trash','Eliminar campo'));
  }
  function init(){document.body.classList.add('v217-ui');decorate();let decorateTimer=null;const observer=new MutationObserver((rows)=>{if(!rows.some(r=>r.addedNodes?.length))return;clearTimeout(decorateTimer);decorateTimer=setTimeout(decorate,90)});observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('crm:state',()=>{clearTimeout(decorateTimer);decorateTimer=setTimeout(decorate,40)});window.addEventListener('beforeunload',()=>observer.disconnect(),{once:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
