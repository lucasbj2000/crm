(() => {
  "use strict";
  const q=(s,r=document)=>r.querySelector(s);
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let companies=[];
  let currentOverview=null;
  let deleteUser=null;

  async function api255(url,opt={}){
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt});
    const raw=await response.text();let payload={};try{payload=raw?JSON.parse(raw):{}}catch{}
    if(!response.ok){const error=new Error(payload.error||`Error ${response.status}`);error.payload=payload;throw error;}
    return payload;
  }
  function notify(message,tone='ok'){
    const box=q('#v255-personnel-status');if(!box)return;
    box.textContent=message||'';box.dataset.tone=tone;
  }
  function roleLabel(role){return role==='admin'?'Administrador':role==='manager'?'Supervisor / Manager':'Agente';}
  function branchName(id){return currentOverview?.branches?.find(x=>x.id===id)?.name||'Todas / sin sucursal';}

  function ensureUi(){
    const companiesBox=q('#companies');
    if(!companiesBox||q('#v255-personnel-card'))return;
    const companyCard=companiesBox.closest('.card');
    const createCard=q('#createForm')?.closest('.card');
    if(createCard){
      const title=createCard.querySelector('h2');if(title)title.textContent='Agregar empresa';
      const toggle=q('#toggleCreate');if(toggle)toggle.textContent='+ Agregar empresa';
    }
    const card=document.createElement('section');
    card.className='card v255-personnel-card';card.id='v255-personnel-card';
    card.innerHTML=`
      <div class="v255-personnel-head"><div><h2>Personal</h2><p class="muted">Administrá usuarios sin ingresar a la empresa. Cada alta y baja afecta únicamente a la empresa seleccionada.</p></div><button class="btn orange" id="v255-toggle-user" type="button">+ Agregar personal</button></div>
      <div class="v255-personnel-toolbar"><label class="field"><span>Empresa</span><select id="v255-company"></select></label><div class="v255-isolation-note">🔒 Personal, clientes y responsabilidades permanecen dentro del tenant seleccionado.</div></div>
      <form id="v255-user-form" class="v255-user-form hidden">
        <div class="grid"><label class="field"><span>Nombre</span><input id="v255-name" required maxlength="120"></label><label class="field"><span>Usuario</span><input id="v255-username" required maxlength="80" autocomplete="off"></label><label class="field"><span>Contraseña inicial</span><input id="v255-password" type="password" required minlength="8" autocomplete="new-password"></label><label class="field"><span>Rol</span><select id="v255-role"><option value="agent">Agente</option><option value="manager">Supervisor / Manager</option><option value="admin">Administrador</option></select></label><label class="field"><span>Sucursal</span><select id="v255-branch"><option value="">Sin sucursal / todas</option></select></label><label class="field"><span>Límite clientes por día</span><input id="v255-limit" type="number" min="1" max="1000" value="100"></label></div>
        <div class="actions"><button class="btn orange" type="submit">Crear personal</button><button class="btn" id="v255-cancel-user" type="button">Cancelar</button></div>
      </form>
      <div class="v255-personnel-list" id="v255-personnel-list"><div class="v255-empty">Seleccioná una empresa.</div></div><div id="v255-personnel-status" class="v255-status"></div>`;
    companyCard?.parentNode?.insertBefore(card,companyCard);

    const dialog=document.createElement('dialog');dialog.id='v255-delete-dialog';dialog.className='v255-dialog';
    dialog.innerHTML=`<form method="dialog" id="v255-delete-form"><header><div><strong>Eliminar personal</strong><small id="v255-delete-copy"></small></div><button class="btn" value="cancel" type="submit">Cerrar</button></header><div class="v255-delete-warning">Las negociaciones, clientes asignados, tareas y demás responsabilidades operativas detectadas se transferirán antes de eliminar al usuario.</div><label class="field"><span>Transferir sus cosas a</span><select id="v255-transfer-user" required></select></label><div class="actions"><button class="btn danger" id="v255-confirm-delete" type="button">Transferir y eliminar</button><button class="btn" value="cancel" type="submit">Cancelar</button></div><div class="error" id="v255-delete-error"></div></form>`;
    document.body.appendChild(dialog);

    q('#v255-toggle-user').onclick=()=>q('#v255-user-form').classList.toggle('hidden');
    q('#v255-cancel-user').onclick=()=>q('#v255-user-form').classList.add('hidden');
    q('#v255-company').onchange=()=>loadOverview();
    q('#v255-role').onchange=syncRoleBranch;
    q('#v255-user-form').onsubmit=createUser;
    q('#v255-confirm-delete').onclick=confirmDelete;
  }

  function syncRoleBranch(){
    const admin=q('#v255-role')?.value==='admin';
    const branch=q('#v255-branch');if(branch){branch.disabled=admin;if(admin)branch.value='';}
  }

  async function loadCompanies(){
    ensureUi();
    try{
      const payload=await api255('/api/gateway/master/companies');
      companies=payload.companies||[];
      const select=q('#v255-company');if(!select)return;
      const previous=select.value;
      select.innerHTML=companies.map(c=>`<option value="${esc(c.slug)}">${esc(c.name)} · ${esc(c.code||c.slug)}</option>`).join('');
      if(previous&&companies.some(c=>c.slug===previous))select.value=previous;
      await loadOverview();
    }catch(error){if(error.message.includes('Iniciá sesión'))return;notify(error.message,'bad');}
  }

  async function loadOverview(){
    const slug=q('#v255-company')?.value;if(!slug)return;
    try{
      currentOverview=await api255(`/api/gateway/master/companies/${encodeURIComponent(slug)}/overview`);
      const branch=q('#v255-branch');if(branch)branch.innerHTML='<option value="">Sin sucursal / todas</option>'+((currentOverview.branches||[]).filter(x=>x.active!==false).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join(''));
      renderUsers();notify('');
    }catch(error){notify(error.message,'bad');}
  }

  function renderUsers(){
    const list=q('#v255-personnel-list');if(!list)return;
    const users=currentOverview?.users||[];
    if(!users.length){list.innerHTML='<div class="v255-empty">Esta empresa todavía no tiene personal.</div>';return;}
    list.innerHTML=users.map(user=>`<article class="v255-user-row"><div class="v255-user-avatar">${esc((user.name||user.username||'U').slice(0,1).toUpperCase())}</div><div class="v255-user-main"><strong>${esc(user.name||user.username)}</strong><small>@${esc(user.username)} · ${esc(roleLabel(user.role))}</small><span>${esc(branchName(user.branchId))}${user.active===false?' · Inactivo':''}</span></div><button class="btn danger v255-delete-user" type="button" data-user="${esc(user.id)}">Eliminar</button></article>`).join('');
    for(const button of list.querySelectorAll('.v255-delete-user'))button.onclick=()=>openDelete(button.dataset.user);
  }

  async function createUser(event){
    event.preventDefault();
    const slug=q('#v255-company')?.value;if(!slug)return;
    notify('Creando personal…');
    try{
      await api255(`/api/gateway/master/companies/${encodeURIComponent(slug)}/users`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:q('#v255-name').value,username:q('#v255-username').value,password:q('#v255-password').value,role:q('#v255-role').value,branchId:q('#v255-branch').value,clientDailyLimit:Number(q('#v255-limit').value)||100})});
      event.currentTarget.reset();q('#v255-limit').value='100';q('#v255-user-form').classList.add('hidden');syncRoleBranch();await loadOverview();notify('Personal creado correctamente.');
    }catch(error){notify(error.message,'bad');}
  }

  function openDelete(userId){
    const users=currentOverview?.users||[];deleteUser=users.find(x=>x.id===userId)||null;if(!deleteUser)return;
    q('#v255-delete-copy').textContent=`${deleteUser.name||deleteUser.username} · @${deleteUser.username}`;
    const candidates=users.filter(x=>x.id!==userId&&x.active!==false);
    const select=q('#v255-transfer-user');select.innerHTML='<option value="">Seleccionar reemplazo…</option>'+candidates.map(x=>`<option value="${esc(x.id)}">${esc(x.name||x.username)} · ${esc(roleLabel(x.role))}</option>`).join('');
    q('#v255-delete-error').textContent='';q('#v255-delete-dialog').showModal();
  }

  async function confirmDelete(){
    if(!deleteUser)return;
    const slug=q('#v255-company')?.value;const transferToUserId=q('#v255-transfer-user').value;
    if(!transferToUserId){q('#v255-delete-error').textContent='Seleccioná a quién transferir sus cosas.';return;}
    q('#v255-delete-error').textContent='';q('#v255-confirm-delete').disabled=true;
    try{
      const result=await api255(`/api/gateway/master/companies/${encodeURIComponent(slug)}/users/${encodeURIComponent(deleteUser.id)}`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({transferToUserId})});
      q('#v255-delete-dialog').close();deleteUser=null;await loadOverview();
      const total=Object.values(result.reassigned||{}).reduce((a,b)=>a+Number(b||0),0);notify(`Personal eliminado. ${total} responsabilidad${total===1?'':'es'} transferida${total===1?'':'s'} a ${result.transferredTo?.name||'su reemplazo'}.`);
    }catch(error){q('#v255-delete-error').textContent=error.message;}
    finally{q('#v255-confirm-delete').disabled=false;}
  }

  async function check(){
    ensureUi();
    try{const status=await api255('/api/gateway/master/status');if(status.authenticated){q('#v255-personnel-card')?.classList.remove('hidden');await loadCompanies();}else q('#v255-personnel-card')?.classList.add('hidden');}catch{}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(check,50),{once:true});else setTimeout(check,50);
  document.addEventListener('click',(event)=>{if(event.target?.id==='refresh')setTimeout(loadCompanies,100);});
})();
