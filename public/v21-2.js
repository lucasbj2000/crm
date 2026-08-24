/* V21.2 · Cliente Maestro + Identidad Multi-contacto + Multi-sucursal */
(() => {
  'use strict';
  let currentProfile = null;
  let editingContactId = null;

  const q = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const digits = (v) => String(v || '').replace(/\D/g, '');
  const fmtMoney = (v) => new Intl.NumberFormat('es-PY', { style:'currency', currency:'PYG', maximumFractionDigits:0 }).format(Number(v || 0));
  const fmtDate = (v) => { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-PY'); };
  const branchById = (id) => (appState?.branches || []).find((b) => b.id === id) || null;

  function phoneChip(record, { person = false } = {}) {
    const label = record.label || (person ? 'WhatsApp' : 'Teléfono');
    return `<span class="v212-phone-chip ${record.primary ? 'primary' : ''} ${record.active === false ? 'inactive' : ''}"><b>${esc(label)}</b><span>${esc(record.phone || '')}</span>${record.primary ? '<i>PRINCIPAL</i>' : ''}${record.active === false ? '<i>ARCHIVADO</i>' : ''}</span>`;
  }

  function renderPhones(client) {
    const rows = (client.phones || []).filter((p) => p.active !== false);
    q('#v212-phone-count').textContent = String(rows.length);
    q('#v212-client-phones').innerHTML = rows.length ? rows.map((p) => `
      <div class="v212-row">
        <div class="v212-row-main">${phoneChip(p)}${p.whatsapp !== false ? '<small>WhatsApp habilitado</small>' : '<small>Solo contacto</small>'}</div>
        <div class="v212-row-actions">${!p.primary ? `<button type="button" class="v212-text-btn" data-v212-phone-primary="${esc(p.id)}">Hacer principal</button>` : ''}<button type="button" class="v212-icon-danger" data-v212-phone-delete="${esc(p.id)}" title="Quitar número">×</button></div>
      </div>`).join('') : '<div class="v212-empty">Todavía no hay números adicionales registrados.</div>';
  }

  function renderContacts(client) {
    const rows = (client.contactPersons || []).filter((p) => p.active !== false);
    q('#v212-contact-count').textContent = String(rows.length);
    q('#v212-contact-persons').innerHTML = rows.length ? rows.map((p) => `
      <article class="v212-contact-person">
        <div class="v212-contact-avatar">${esc((p.name || '?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())}</div>
        <div class="v212-contact-body"><div class="v212-contact-title"><b>${esc(p.name || 'Contacto')}</b>${p.role ? `<span>${esc(p.role)}</span>` : ''}</div>${p.email ? `<small>${esc(p.email)}</small>` : ''}<div class="v212-phone-wrap">${(p.phones || []).filter(x=>x.active!==false).map(x=>phoneChip(x,{person:true})).join('') || '<small>Sin teléfono asociado</small>'}</div></div>
        <div class="v212-contact-actions"><button class="v212-text-btn" type="button" data-v212-contact-edit="${esc(p.id)}">Editar</button><button class="v212-icon-danger" type="button" data-v212-contact-delete="${esc(p.id)}">×</button></div>
      </article>`).join('') : '<div class="v212-empty">Si este cliente es una empresa, agregá acá a Compras, Administración, Gerencia u otros contactos.</div>';
  }

  function renderBranches(client) {
    const rows = (client.branchRelationships || []).filter((r) => r.active !== false && branchById(r.branchId));
    q('#v212-branch-count').textContent = String(rows.length);
    q('#v212-client-branches').innerHTML = rows.length ? rows.map((r) => {
      const b = branchById(r.branchId);
      const preferred = r.preferred || client.preferredBranchId === r.branchId;
      return `<article class="v212-branch-card ${preferred ? 'preferred' : ''}">
        <div class="v212-branch-mark">${preferred ? '★' : 'S'}</div>
        <div class="v212-branch-copy"><div><b>${esc(b?.name || 'Sucursal')}</b>${preferred ? '<span class="v212-preferred">PREFERIDA</span>' : ''}</div><small>${esc(b?.city || b?.address || 'Sin ubicación')}</small><div class="v212-branch-metrics"><span><small>Compras</small><b>${Number(r.purchaseCount || 0)}</b></span><span><small>Total</small><b>${fmtMoney(r.totalPurchased || 0)}</b></span><span><small>Última compra</small><b>${fmtDate(r.lastPurchaseAt)}</b></span><span><small>Responsable</small><b>${esc(r.ownerName || client.branchOwners?.[r.branchId]?.userName || 'Sin asignar')}</b></span></div></div>
        <div class="v212-branch-actions">${!preferred ? `<button type="button" class="v212-text-btn" data-v212-branch-prefer="${esc(r.branchId)}">Preferir</button>` : ''}<button type="button" class="v212-icon-danger" data-v212-branch-delete="${esc(r.branchId)}">×</button></div>
      </article>`;
    }).join('') : '<div class="v212-empty">Las sucursales aparecerán automáticamente cuando existan compras o podés vincularlas manualmente.</div>';

    const used = new Set(rows.map((r) => r.branchId));
    const available = (appState?.branches || []).filter((b) => b.active !== false && !used.has(b.id));
    const select = q('#v212-add-branch-select');
    select.innerHTML = available.length ? available.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}${b.city ? ` · ${esc(b.city)}` : ''}</option>`).join('') : '<option value="">Todas las sucursales ya están vinculadas</option>';
    q('#v212-routing-note').innerHTML = rows.length >= 2 && client.branchChoiceMode === 'ask_when_multiple'
      ? '<b>Selector inteligente activo.</b> En una nueva consulta, el BOT preguntará con qué sucursal desea continuar antes de asignar la gestión.'
      : rows.length >= 2 && client.branchChoiceMode === 'prefer_last'
        ? '<b>Ruta preferida activa.</b> El CRM intentará continuar con la sucursal preferida/última elegida.'
        : rows.length >= 2
          ? '<b>Varias sucursales detectadas.</b> El selector automático está desactivado para este cliente.'
          : '<b>Sin ambigüedad de sucursal.</b> El selector se activará automáticamente cuando existan dos o más relaciones comerciales.';
  }

  function renderMaster(profile) {
    const client = profile?.client;
    if (!client) return;
    currentProfile = profile;
    const summary = profile.identitySummary || {};
    const master = q('#v212-master-banner');
    master?.classList.toggle('company', client.entityType === 'company');
    if (q('#v212-master-stats')) q('#v212-master-stats').innerHTML = `<span><b>${Number(summary.directPhones ?? (client.phones||[]).length)}</b><small>números</small></span><span><b>${Number(summary.contactPersons ?? (client.contactPersons||[]).length)}</b><small>contactos</small></span><span><b>${Number(summary.branches ?? (client.branchRelationships||[]).filter(x=>x.active!==false).length)}</b><small>sucursales</small></span>`;
    renderPhones(client); renderContacts(client); renderBranches(client);
  }

  window.v212RenderClientIdentity = renderMaster;

  async function refreshProfile() {
    const id = currentProfile?.client?.id || (typeof selectedClientProfileId !== 'undefined' ? selectedClientProfileId : null);
    if (!id) return;
    const profile = await api(`/api/clients/${encodeURIComponent(id)}/profile`);
    renderMaster(profile);
    if (q('#profile-entity-type')) q('#profile-entity-type').value = profile.client.entityType || 'person';
    if (q('#profile-branch-choice-mode')) q('#profile-branch-choice-mode').value = profile.client.branchChoiceMode || 'ask_when_multiple';
  }

  async function callClientApi(url, method, body, success) {
    try {
      const result = await api(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? undefined : {'Content-Type':'application/json'} });
      if (result.state) setState(result.state);
      await refreshProfile();
      showToast?.(success || 'Cliente actualizado');
      return result;
    } catch (error) { showToast?.(error.message, 'warning'); return null; }
  }

  q('#v212-add-phone')?.addEventListener('click', async () => {
    const id=currentProfile?.client?.id, phone=q('#v212-phone-number').value.trim(); if(!id||!phone)return showToast?.('Ingresá un número.', 'warning');
    const result=await callClientApi(`/api/clients/${encodeURIComponent(id)}/phones`,'POST',{phone,label:q('#v212-phone-label').value.trim()||'Teléfono'},'Número vinculado al Cliente Maestro');
    if(result){q('#v212-phone-number').value='';q('#v212-phone-label').value='';}
  });

  q('#v212-client-phones')?.addEventListener('click', async (event) => {
    const id=currentProfile?.client?.id; if(!id)return;
    const del=event.target.closest('[data-v212-phone-delete]'); if(del){await callClientApi(`/api/clients/${encodeURIComponent(id)}/phones/${encodeURIComponent(del.dataset.v212PhoneDelete)}`,'DELETE',undefined,'Número actualizado');return;}
    const primary=event.target.closest('[data-v212-phone-primary]'); if(primary){await callClientApi(`/api/clients/${encodeURIComponent(id)}/phones/${encodeURIComponent(primary.dataset.v212PhonePrimary)}`,'PUT',{primary:true},'Número principal actualizado');}
  });

  q('#v212-add-contact')?.addEventListener('click', async () => {
    const id=currentProfile?.client?.id,name=q('#v212-contact-name').value.trim(); if(!id||!name)return showToast?.('Ingresá el nombre de la persona de contacto.','warning');
    const phones=q('#v212-contact-phones-input').value.split(/[;,\n]+/).map(v=>v.trim()).filter(Boolean).map((phone,index)=>({phone,label:index===0?'Principal':'Alternativo',primary:index===0}));
    const payload={name,role:q('#v212-contact-role').value.trim(),email:q('#v212-contact-email').value.trim(),phones};
    const url=editingContactId?`/api/clients/${encodeURIComponent(id)}/contacts/${encodeURIComponent(editingContactId)}`:`/api/clients/${encodeURIComponent(id)}/contacts`;
    const result=await callClientApi(url,editingContactId?'PUT':'POST',payload,editingContactId?'Contacto actualizado':'Persona vinculada a la empresa');
    if(result){editingContactId=null;['#v212-contact-name','#v212-contact-role','#v212-contact-email','#v212-contact-phones-input'].forEach(s=>q(s).value='');q('#v212-add-contact').textContent='Agregar contacto';}
  });

  q('#v212-contact-persons')?.addEventListener('click', async (event) => {
    const id=currentProfile?.client?.id;if(!id)return;
    const edit=event.target.closest('[data-v212-contact-edit]'); if(edit){const p=(currentProfile.client.contactPersons||[]).find(x=>x.id===edit.dataset.v212ContactEdit);if(!p)return;editingContactId=p.id;q('#v212-contact-name').value=p.name||'';q('#v212-contact-role').value=p.role||'';q('#v212-contact-email').value=p.email||'';q('#v212-contact-phones-input').value=(p.phones||[]).filter(x=>x.active!==false).map(x=>x.phone).join(', ');q('#v212-add-contact').textContent='Guardar contacto';q('#v212-contact-name').focus();return;}
    const del=event.target.closest('[data-v212-contact-delete]');if(del)await callClientApi(`/api/clients/${encodeURIComponent(id)}/contacts/${encodeURIComponent(del.dataset.v212ContactDelete)}`,'DELETE',undefined,'Contacto archivado');
  });

  q('#v212-add-branch')?.addEventListener('click', async () => {
    const id=currentProfile?.client?.id,branchId=q('#v212-add-branch-select').value;if(!id||!branchId)return showToast?.('Seleccioná una sucursal.','warning');
    await callClientApi(`/api/clients/${encodeURIComponent(id)}/branches`,'POST',{branchId,preferred:q('#v212-branch-preferred').checked},'Sucursal vinculada al Cliente Maestro');q('#v212-branch-preferred').checked=false;
  });

  q('#v212-client-branches')?.addEventListener('click', async (event) => {
    const id=currentProfile?.client?.id;if(!id)return;
    const prefer=event.target.closest('[data-v212-branch-prefer]');if(prefer){await callClientApi(`/api/clients/${encodeURIComponent(id)}/branches`,'POST',{branchId:prefer.dataset.v212BranchPrefer,preferred:true},'Sucursal preferida actualizada');return;}
    const del=event.target.closest('[data-v212-branch-delete]');if(del)await callClientApi(`/api/clients/${encodeURIComponent(id)}/branches/${encodeURIComponent(del.dataset.v212BranchDelete)}`,'DELETE',undefined,'Relación con sucursal actualizada');
  });

  function linkTargetClient() {
    const id = q('#v212-link-master-client')?.value;
    return (appState?.clients || []).find((client) => client.id === id) || null;
  }

  function updateLinkMode() {
    const target = linkTargetClient();
    const isCompany = target?.entityType === 'company';
    const generic = q('#v212-link-company-number');
    if (!generic) return;
    if (!isCompany) { generic.checked = true; generic.disabled = true; }
    else generic.disabled = false;
    q('#v212-link-contact-fields').hidden = !isCompany || generic.checked;
  }

  q('#v212-link-master-button')?.addEventListener('click', () => {
    const deal = (appState?.deals || []).find((entry) => entry.id === (typeof selectedDealId !== 'undefined' ? selectedDealId : null));
    if (!deal) return showToast?.('Abrí una conversación antes de vincularla.', 'warning');
    const candidates = (appState?.clients || []).filter((client) => client.id !== deal.clientId).sort((a,b) => Number(b.entityType === 'company') - Number(a.entityType === 'company') || String(a.name||'').localeCompare(String(b.name||''), 'es'));
    if (!candidates.length) return showToast?.('Todavía no existe otro Cliente Maestro para vincular. Crealo primero desde Clientes.', 'warning');
    q('#v212-link-current').innerHTML = `<span>Conversación actual</span><b>${esc(deal.contactPersonName || deal.name || 'Cliente')}</b><small>${esc(deal.phone || '')}${deal.name && deal.contactPersonName ? ` · ${esc(deal.name)}` : ''}</small>`;
    q('#v212-link-master-client').innerHTML = candidates.map((client) => `<option value="${esc(client.id)}">${client.entityType === 'company' ? 'Empresa' : 'Persona'} · ${esc(client.name || client.phone || 'Sin nombre')}${client.ruc ? ` · RUC ${esc(client.ruc)}` : ''}</option>`).join('');
    q('#v212-link-contact-name').value = '';
    q('#v212-link-contact-role').value = '';
    q('#v212-link-contact-email').value = '';
    q('#v212-link-company-number').checked = false;
    updateLinkMode();
    q('#v212-link-master-dialog')?.showModal();
  });

  q('#v212-link-master-client')?.addEventListener('change', () => { q('#v212-link-company-number').checked = false; updateLinkMode(); });
  q('#v212-link-company-number')?.addEventListener('change', updateLinkMode);

  q('#v212-link-master-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const deal = (appState?.deals || []).find((entry) => entry.id === (typeof selectedDealId !== 'undefined' ? selectedDealId : null));
    const target = linkTargetClient();
    if (!deal || !target) return showToast?.('Seleccioná el Cliente Maestro.', 'warning');
    const asCompanyNumber = target.entityType !== 'company' || q('#v212-link-company-number').checked;
    const contactName = q('#v212-link-contact-name').value.trim();
    if (target.entityType === 'company' && !asCompanyNumber && !contactName) return showToast?.('Ingresá el nombre de la persona de contacto o marcá número general de la empresa.', 'warning');
    const button = event.submitter;
    if (button) { button.disabled = true; button.textContent = 'Vinculando…'; }
    try {
      const result = await api(`/api/deals/${encodeURIComponent(deal.id)}/link-master-client`, { method:'POST', body: JSON.stringify({ clientId:target.id, asCompanyNumber, contactName, contactRole:q('#v212-link-contact-role').value.trim(), contactEmail:q('#v212-link-contact-email').value.trim() }) });
      if (result.state) setState(result.state);
      q('#v212-link-master-dialog')?.close();
      showToast?.(`Conversación vinculada a ${target.name || 'Cliente Maestro'}`);
      if (typeof openDealDrawer === 'function') openDealDrawer(deal.id);
    } catch (error) { showToast?.(error.message, 'warning'); }
    finally { if (button) { button.disabled = false; button.textContent = 'Vincular conversación'; } }
  });

  q('#profile-entity-type')?.addEventListener('change', () => q('#v212-master-banner')?.classList.toggle('company', q('#profile-entity-type').value === 'company'));

  document.documentElement.classList.add('v212-ready');
})();
