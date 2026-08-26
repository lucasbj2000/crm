(() => {
  "use strict";
  const q=(s,r=document)=>r.querySelector(s);
  const qq=(s,r=document)=>[...r.querySelectorAll(s)];
  let companyToDelete=null;
  let catalog=[];

  async function api(url,opt={}){
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt});
    const raw=await response.text();let payload={};try{payload=raw?JSON.parse(raw):{}}catch{}
    if(!response.ok){const error=new Error(payload.error||`Error ${response.status}`);error.payload=payload;throw error;}
    return payload;
  }

  async function refreshCatalog(){
    const payload=await api('/api/gateway/master/companies');
    catalog=Array.isArray(payload.companies)?payload.companies:[];
    return catalog;
  }

  function ensureDialog(){
    if(q('#v2551-delete-company-dialog'))return;
    const dialog=document.createElement('dialog');
    dialog.id='v2551-delete-company-dialog';
    dialog.className='v255-dialog';
    dialog.innerHTML=`
      <form method="dialog" id="v2551-delete-company-form">
        <header><div><strong>Eliminar empresa</strong><small id="v2551-delete-company-copy"></small></div><button class="btn" value="cancel" type="submit">Cerrar</button></header>
        <div class="v255-delete-warning" style="background:#fff4f3;color:#8e2c24">La empresa desaparecerá del CRM y su proceso se detendrá. Sus datos se moverán a un respaldo recuperable dentro de <b>storage/deleted-tenants</b>.</div>
        <label class="field"><span id="v2551-delete-company-label">Código de empresa</span><input id="v2551-delete-company-code" autocomplete="off" spellcheck="false" required></label>
        <div class="actions"><button class="btn danger" id="v2551-confirm-company-delete" type="button">Eliminar empresa</button><button class="btn" value="cancel" type="submit">Cancelar</button></div>
        <div class="error" id="v2551-delete-company-error"></div>
      </form>`;
    document.body.appendChild(dialog);
    q('#v2551-confirm-company-delete').onclick=confirmDeleteCompany;
    dialog.addEventListener('close',()=>{companyToDelete=null;q('#v2551-delete-company-code').value='';q('#v2551-delete-company-error').textContent='';});
  }

  function syncDeleteButtons(){
    for(const card of qq('#companies .company[data-slug]')){
      const footer=card.querySelector('footer');
      if(!footer||footer.querySelector('[data-v2551-delete-company]'))continue;
      const button=document.createElement('button');
      button.type='button';button.className='btn danger';button.dataset.v2551DeleteCompany='1';button.textContent='Eliminar empresa';
      footer.appendChild(button);
    }
  }

  async function openDeleteCompany(slug){
    ensureDialog();
    try{await refreshCatalog();}catch(error){alert(error.message);return;}
    companyToDelete=catalog.find(company=>company.slug===slug)||null;
    if(!companyToDelete){alert('La empresa ya no existe.');return;}
    const expected=companyToDelete.code||companyToDelete.slug;
    q('#v2551-delete-company-copy').textContent=`${companyToDelete.name} · ${expected}`;
    q('#v2551-delete-company-label').textContent=`Escribí ${expected} para confirmar`;
    q('#v2551-delete-company-code').value='';
    q('#v2551-delete-company-error').textContent='';
    q('#v2551-delete-company-dialog').showModal();
    setTimeout(()=>q('#v2551-delete-company-code')?.focus(),50);
  }

  async function confirmDeleteCompany(){
    if(!companyToDelete)return;
    const expected=String(companyToDelete.code||companyToDelete.slug||'').trim();
    const typed=String(q('#v2551-delete-company-code')?.value||'').trim();
    if(typed.toLowerCase()!==expected.toLowerCase()){
      q('#v2551-delete-company-error').textContent=`Para confirmar, escribí exactamente: ${expected}`;
      return;
    }
    const button=q('#v2551-confirm-company-delete');button.disabled=true;
    q('#v2551-delete-company-error').textContent='';
    try{
      const result=await api(`/api/gateway/master/companies/${encodeURIComponent(companyToDelete.slug)}`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({confirmCode:typed})});
      const deletedName=result.deletedCompany?.name||companyToDelete.name;
      const archiveName=result.archiveName||'';
      q('#v2551-delete-company-dialog').close();
      q('#drawer')?.classList.remove('open');
      q('#refresh')?.click();
      setTimeout(syncDeleteButtons,250);
      alert(archiveName?`Empresa ${deletedName} eliminada. Respaldo conservado en deleted-tenants/${archiveName}.`:`Empresa ${deletedName} eliminada.`);
    }catch(error){q('#v2551-delete-company-error').textContent=error.message;}
    finally{button.disabled=false;}
  }

  function boot(){
    ensureDialog();
    const box=q('#companies');if(!box)return;
    syncDeleteButtons();
    const observer=new MutationObserver(()=>syncDeleteButtons());
    observer.observe(box,{childList:true,subtree:true});
    box.addEventListener('click',(event)=>{
      const button=event.target.closest('[data-v2551-delete-company]');
      if(!button)return;
      const card=button.closest('[data-slug]');if(!card)return;
      event.preventDefault();
      openDeleteCompany(card.dataset.slug);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,80),{once:true});else setTimeout(boot,80);
})();
