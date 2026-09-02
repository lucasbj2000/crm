(() => {
  "use strict";

  const $=(selector,root=document)=>root?.querySelector?.(selector)||null;
  const $$=(selector,root=document)=>Array.from(root?.querySelectorAll?.(selector)||[]);
  const originalFetch=window.fetch.bind(window);
  let stateCache=null;
  let userDialogTargetId="";

  const moduleCatalog=[
    ["crm","Negociaciones y clientes","Conversaciones, pipeline y ficha 360°",[["manageDeals","Gestionar negociaciones"],["sendMessages","Enviar mensajes"],["assignDeals","Asignar responsables"],["transferDeals","Transferir conversaciones"]]],
    ["branches","Sucursales","Consultar la operativa y equipos por sucursal",[]],
    ["organization","Estructura","Consultar organigrama, sectores y jerarquías",[]],
    ["attendance","Marcación y presencia","Disponibilidad y cobertura del equipo",[["manageAttendance","Gestionar estados del equipo"]]],
    ["stock","Stock","Consultar inventario, precios y reservas",[["manageStock","Crear, editar y ajustar stock"]]],
    ["replies","Respuestas rápidas","Usar la biblioteca de respuestas",[["manageReplies","Administrar respuestas rápidas"]]],
    ["documents","Documentos","Consultar documentos y plantillas",[["manageDocuments","Administrar documentos"]]],
    ["campaigns","Campañas","Consultar campañas y resultados",[["manageCampaigns","Crear y gestionar campañas"]]],
    ["forms","Formularios","Consultar formularios y resultados",[["manageForms","Crear, editar y enviar formularios"]]],
    ["surveys","Encuestas","Consultar encuestas y respuestas",[["manageForms","Gestionar encuestas"]]],
    ["news","Noticias","Leer comunicaciones internas",[["manageNews","Publicar y administrar noticias"]]],
    ["reports","Reportes","Paneles y métricas operativas",[["viewGlobalReports","Comparar todas las sucursales"],["viewAudit","Ver auditoría operativa"]]],
    ["aiCenter","Ayuda IA","Copiloto, redacción y análisis para el empleado",[["useAi","Utilizar herramientas IA"]]],
    ["productivity","Productividad","Tareas, objetivos y aprobaciones",[["manageObjectives","Gestionar objetivos"],["manageApprovals","Resolver aprobaciones"]]],
  ];

  const safeModuleKeys=[...new Set(moduleCatalog.map(([key])=>key).concat(["tasks","approvals","objectives","customer360","globalSearch","quality","knowledge","forecasting","goals"]))];
  const functionKeys=["manageDeals","sendMessages","assignDeals","transferDeals","manageStock","manageReplies","manageDocuments","manageCampaigns","manageForms","manageNews","manageAttendance","manageObjectives","manageApprovals","viewGlobalReports","viewAudit","useAi"];

  function roleLabel(role){return role==="admin"?"Administrador":role==="director"?"Director":role==="manager"?"Gerente":role==="supervisor"?"Jefe":"Agente";}

  function roleDefaults(role="agent"){
    const modules=Object.fromEntries(safeModuleKeys.map(key=>[key,false]));
    const functions=Object.fromEntries(functionKeys.map(key=>[key,false]));
    if(role==="admin"){
      safeModuleKeys.forEach(key=>modules[key]=true);functionKeys.forEach(key=>functions[key]=true);return{modules,functions};
    }
    if(role==="director"){
      safeModuleKeys.forEach(key=>modules[key]=true);Object.assign(functions,{viewGlobalReports:true,viewAudit:true,useAi:true});return{modules,functions};
    }
    if(role==="manager"){
      safeModuleKeys.forEach(key=>modules[key]=true);Object.assign(functions,{manageDeals:true,sendMessages:true,assignDeals:true,transferDeals:true,manageStock:true,manageReplies:true,manageDocuments:true,manageCampaigns:true,manageForms:true,manageNews:true,manageAttendance:true,manageObjectives:true,manageApprovals:true,viewGlobalReports:true,viewAudit:true,useAi:true});return{modules,functions};
    }
    if(role==="supervisor"){
      safeModuleKeys.forEach(key=>modules[key]=true);Object.assign(functions,{manageDeals:true,sendMessages:true,assignDeals:true,transferDeals:true,manageStock:true,manageReplies:true,manageDocuments:true,manageCampaigns:true,manageForms:true,manageNews:true,manageAttendance:true,manageObjectives:true,manageApprovals:true,viewAudit:true,useAi:true});return{modules,functions};
    }
    Object.assign(modules,{crm:true,attendance:true,stock:true,replies:true,documents:true,news:true,reports:true,aiCenter:true,productivity:true,tasks:true,approvals:true,customer360:true,globalSearch:true,knowledge:true});
    Object.assign(functions,{manageDeals:true,sendMessages:true,transferDeals:true,useAi:true});
    return{modules,functions};
  }

  function ensureDialogUi(){
    const dialog=$("#user-dialog");if(!dialog)return null;
    const role=$("#user-role",dialog);
    if(role&&!role.querySelector('option[value="director"]')){
      const option=document.createElement("option");option.value="director";option.textContent="Director";
      const manager=role.querySelector('option[value="manager"]');role.insertBefore(option,manager||role.querySelector('option[value="admin"]'));
    }
    if($("#v269-user-access",dialog))return $("#v269-user-access",dialog);
    const panel=document.createElement("section");panel.id="v269-user-access";panel.className="v269-access-panel";
    panel.innerHTML=`<div class="v269-head"><div><small>CONTROL DE ACCESO · V26.9</small><h4>Bot, IA, sectores y funciones</h4></div><small>Definí exactamente qué puede usar este usuario. Los permisos técnicos nunca se delegan.</small></div>
      <div id="v269-role-scope" class="v269-role-scope"></div>
      <div class="v269-user-switches">
        <label class="v269-switch-card"><span><b>Bot automático</b><small>Permite que el bot responda automáticamente en las conversaciones asignadas a este empleado.</small></span><input id="v269-user-bot" type="checkbox" checked></label>
        <label class="v269-switch-card"><span><b>Ayuda IA para el empleado</b><small>Habilita Copiloto, mejorar redacción, análisis y Centro IA. No controla el bot automático.</small></span><input id="v269-user-ai" type="checkbox" checked></label>
      </div>
      <div id="v269-admin-note" class="v269-admin-note" hidden>El Administrador conserva acceso total a la plataforma y a la configuración técnica.</div>
      <div id="v269-permission-grid" class="v269-permission-grid">${moduleCatalog.map(([key,title,copy,functions])=>`<article class="v269-permission-card" data-v269-card="${key}"><label><input type="checkbox" data-v269-module="${key}"><span><b>${title}</b><small>${copy}</small></span></label>${functions.length?`<div class="v269-function-list">${functions.map(([fn,label])=>`<label><input type="checkbox" data-v269-function="${fn}" data-v269-function-module="${key}"><span>${label}</span></label>`).join("")}</div>`:""}</article>`).join("")}</div>
      <div class="v269-technical-lock"><b>🔒 Exclusivo del Administrador</b><span>Conexiones y QR de WhatsApp · Cloud API y credenciales · configuración técnica · alta/configuración de sucursales · campos técnicos · respaldos e importaciones · diseño y marca · automatización global · seguridad y gobierno de IA.</span></div>`;
    const activeRow=$("#user-active-row",dialog);
    if(activeRow)activeRow.before(panel);else $("#user-form",dialog)?.appendChild(panel);
    for(const id of ["#user-branch-reports","#user-team-reports","#user-global-reports","#user-audit-reports","#user-campaign-view","#user-campaign-manage","#user-custom-fields-manage","#user-news-publish"]){
      const input=$(id,dialog);input?.closest("label")?.classList.add("v269-hidden-technical");
    }
    panel.addEventListener("change",event=>{
      const moduleInput=event.target.closest?.("[data-v269-module]");if(moduleInput)syncPermissionCard(moduleInput.dataset.v269Module);
      if(event.target.id==="v269-user-ai"){
        const ai=$("[data-v269-module='aiCenter']",panel),use=$("[data-v269-function='useAi']",panel);if(!event.target.checked){if(ai)ai.checked=false;if(use)use.checked=false;}else{if(ai)ai.checked=true;if(use)use.checked=true;}syncPermissionCard("aiCenter");
      }
    });
    return panel;
  }

  function scopeCopy(role){
    if(role==="admin")return "Administrador · acceso total, incluida la configuración técnica.";
    if(role==="director")return "Director · visión ejecutiva de todas las sucursales. Por defecto es de consulta; las funciones operativas seguras se habilitan individualmente.";
    if(role==="manager")return "Gerente · ve la operativa de todas las sucursales. Puede operar únicamente las funciones marcadas; nunca administra conexiones ni configuración técnica.";
    if(role==="supervisor")return "Jefe · ve y gestiona solamente su sucursal según las funciones marcadas. No tiene acceso técnico.";
    return "Agente · trabaja dentro de su sucursal y sobre su cartera/gestiones según los permisos marcados.";
  }

  function syncPermissionCard(key){
    const card=$(`[data-v269-card="${key}"]`);if(!card)return;
    const moduleInput=$("[data-v269-module]",card);const disabled=!moduleInput?.checked||moduleInput?.disabled;
    $$(`[data-v269-function-module="${key}"]`,card).forEach(input=>{input.disabled=disabled;if(!moduleInput?.checked)input.checked=false;});
  }

  function applyAccessValues(user=null,{forceDefaults=false}={}){
    const panel=ensureDialogUi();if(!panel)return;
    const role=$("#user-role")?.value||user?.role||"agent";const defaults=roleDefaults(role);
    const modules=forceDefaults?defaults.modules:{...defaults.modules,...(user?.modulePermissions||{})};
    const functions=forceDefaults?defaults.functions:{...defaults.functions,...(user?.functionPermissions||{})};
    $("#v269-user-bot").checked=role==="admin"?true:(forceDefaults?true:user?.botEnabled!==false);
    $("#v269-user-ai").checked=role==="admin"?true:(forceDefaults?true:user?.aiHelpEnabled!==false);
    $("#v269-role-scope").textContent=scopeCopy(role);
    const admin=role==="admin";$("#v269-admin-note").hidden=!admin;$("#v269-permission-grid").hidden=admin;
    $$('[data-v269-module]',panel).forEach(input=>{input.checked=admin||modules[input.dataset.v269Module]===true;input.disabled=admin;});
    $$('[data-v269-function]',panel).forEach(input=>{input.checked=admin||functions[input.dataset.v269Function]===true;input.disabled=admin;});
    $("#v269-user-bot").disabled=admin;$("#v269-user-ai").disabled=admin;
    moduleCatalog.forEach(([key])=>syncPermissionCard(key));
  }

  function currentDialogUser(){return (stateCache?.users||[]).find(user=>user.id===userDialogTargetId)||null;}

  function prepareUserDialog(userId=""){
    userDialogTargetId=userId||"";ensureDialogUi();
    const user=currentDialogUser();applyAccessValues(user,{forceDefaults:!user});
  }

  function collectAccessPayload(existing={}){
    const panel=ensureDialogUi();if(!panel)return existing;
    const role=$("#user-role")?.value||"agent";const defaults=roleDefaults(role);const admin=role==="admin";
    const modulePermissions={...defaults.modules};const functionPermissions={...defaults.functions};
    $$('[data-v269-module]',panel).forEach(input=>modulePermissions[input.dataset.v269Module]=admin||input.checked);
    $$('[data-v269-function]',panel).forEach(input=>functionPermissions[input.dataset.v269Function]=admin||input.checked);
    const botEnabled=admin||$("#v269-user-bot")?.checked!==false;const aiHelpEnabled=admin||$("#v269-user-ai")?.checked!==false;
    modulePermissions.aiCenter=aiHelpEnabled&&modulePermissions.aiCenter===true;functionPermissions.useAi=aiHelpEnabled&&functionPermissions.useAi===true;
    return {...existing,role,botEnabled,aiHelpEnabled,modulePermissions,functionPermissions,
      branchReports:admin||["director","manager","supervisor"].includes(role)||existing.branchReports===true,
      teamReports:admin||["director","manager","supervisor"].includes(role)||existing.teamReports===true,
      globalReports:admin||["director","manager"].includes(role)||functionPermissions.viewGlobalReports===true,
      auditReports:admin||functionPermissions.viewAudit===true,
      campaignView:admin||modulePermissions.campaigns===true,
      campaignManage:admin||functionPermissions.manageCampaigns===true,
      customFieldsManage:admin,
      attendanceManage:admin||functionPermissions.manageAttendance===true,
      newsPublish:admin||functionPermissions.manageNews===true};
  }

  function captureState(payload){
    const state=payload?.currentUser?payload:payload?.state?.currentUser?payload.state:null;if(!state)return;
    stateCache=state;setTimeout(applyCurrentAccess,0);
  }

  window.fetch=async function(input,init={}){
    const url=typeof input==="string"?input:String(input?.url||"");let nextInit=init;
    const path=(()=>{try{return new URL(url,location.origin).pathname;}catch{return url.split("?")[0];}})();
    if(/^\/api\/users(?:\/[^/]+)?$/.test(path)&&["POST","PUT"].includes(String(init?.method||"GET").toUpperCase())&&typeof init?.body==="string"){
      try{const parsed=JSON.parse(init.body);nextInit={...init,body:JSON.stringify(collectAccessPayload(parsed))};}catch{}
    }
    const response=await originalFetch(input,nextInit);
    const type=response.headers?.get?.("content-type")||"";
    if(type.includes("application/json"))response.clone().json().then(payload=>captureState(payload)).catch(()=>{});
    return response;
  };

  async function loadStateCache(){
    try{const response=await originalFetch("/api/state",{credentials:"same-origin",cache:"no-store"});if(response.ok)captureState(await response.json());}catch{}
  }

  function hasModule(key){const user=stateCache?.currentUser;if(!user)return true;if(user.role==="admin")return true;return stateCache?.modules?.[key]!==false&&user.modulePermissions?.[key]===true;}
  function hasFunction(key){const user=stateCache?.currentUser;if(!user)return false;if(user.role==="admin")return true;return user.functionPermissions?.[key]===true;}

  function enforceNavigation(){
    const user=stateCache?.currentUser;if(!user)return;const admin=user.role==="admin";
    const technicalViews=["whatsapp","data","settings","design","advanced"];
    technicalViews.forEach(view=>{$(`.nav-item[data-view="${view}"]`)?.classList.toggle("v269-hidden-technical",!admin);});
    const viewModules={crm:"crm",branches:"branches",organization:"organization",attendance:"attendance",stock:"stock",replies:"replies",campaigns:"campaigns",news:"news",reports:"reports",ai:"aiCenter",productivity:"productivity"};
    for(const [view,module] of Object.entries(viewModules)){
      const nav=$(`.nav-item[data-view="${view}"]`);if(nav)nav.hidden=!hasModule(module);
    }
    if(user.role==="director"&&hasModule("organization")){$('.nav-item[data-view="organization"]')?.removeAttribute("hidden");}
    if(!admin){
      $$('[data-branch-action="connect"],[data-branch-action="disconnect"],#connect-button,#unlink-button,#save-whatsapp-api-button,#test-whatsapp-api-button').forEach(node=>node.classList.add("v269-hidden-technical"));
      const activeTechnical=technicalViews.some(view=>$(`[data-view-panel="${view}"]`)?.classList.contains("active"));if(activeTechnical)$('.nav-item[data-view="crm"]')?.click();
    }
  }

  function enforceRoleCopy(){
    const user=stateCache?.currentUser;if(!user)return;
    const roleNode=$("#current-user-role");if(roleNode)roleNode.textContent=roleLabel(user.role);
    const branchNode=$("#current-user-branch");if(branchNode&&["manager","director"].includes(user.role))branchNode.textContent="Todas las sucursales";
    $$("#users-list .user-row[data-user-id]").forEach(row=>{const entry=(stateCache.users||[]).find(user=>user.id===row.dataset.userId);const small=row.querySelector("div small");if(entry&&small)small.textContent=small.textContent.replace(/· (Administrador|Gerente|Jefe|Agente) ·/,`· ${roleLabel(entry.role)} ·`);});
    if($("#report-audience-title")&&$("[data-view-panel='reports']")?.classList.contains("active")){
      if(user.role==="manager"){$("#report-audience-kicker").textContent="VISIÓN GLOBAL";$("#report-audience-title").textContent="Operativa de todas las sucursales";$("#report-audience-copy").textContent="Compará sucursales, equipos, atención, ventas y riesgos con alcance global, sin acceso a configuración técnica.";}
      if(user.role==="director"){$("#report-audience-kicker").textContent="VISIÓN EJECUTIVA";$("#report-audience-title").textContent="Dirección · visión consolidada";$("#report-audience-copy").textContent="Información consolidada de todas las sucursales para seguimiento ejecutivo y toma de decisiones.";}
    }
  }

  function enforceAiAndBot(){
    const user=stateCache?.currentUser;if(!user)return;const ai=user.aiHelpEnabled!==false&&hasFunction("useAi")&&hasModule("aiCenter");
    ["#agent-ai-toolbar","#copilot-card","#smart-data-card","#ai-management-brief-panel"].forEach(selector=>{const node=$(selector);if(node&&!ai)node.hidden=true;});
    const aiNav=$('.nav-item[data-view="ai"]');if(aiNav&&!ai)aiNav.hidden=true;
    if(user.role==="agent"&&user.botEnabled===false){const toggle=$("#deal-bot-toggle");if(toggle){toggle.disabled=true;toggle.title="El Administrador desactivó el bot automático para este usuario.";}}
  }

  function enforceOperationalFunctions(){
    const user=stateCache?.currentUser;if(!user)return;
    const stockManage=hasFunction("manageStock");
    ["#new-product-button","#import-stock-button"].forEach(selector=>{const node=$(selector);if(node)node.hidden=!stockManage;});
    $$("#stock-table-body tr").forEach((row,index)=>{
      const actions=row.querySelector(".row-actions");if(!actions)return;
      if(!stockManage){actions.innerHTML="";return;}
      if(actions.children.length)return;
      const query=String($("#stock-search")?.value||"").trim().toLowerCase();const products=(stateCache.products||[]).filter(product=>product.active!==false).filter(product=>!query||[product.name,product.sku,product.description].some(value=>String(value||"").toLowerCase().includes(query)));
      const product=products[index];if(product)actions.innerHTML=`<button type="button" data-product-action="adjust" data-product-id="${product.id}">Ajustar</button><button type="button" data-product-action="edit" data-product-id="${product.id}">Editar</button><button type="button" data-product-action="archive" data-product-id="${product.id}">Archivar</button>`;
    });
    const repliesManage=hasFunction("manageReplies");const newReply=$("#new-reply-button");if(newReply)newReply.hidden=!repliesManage;
    if(repliesManage)$$("#quick-replies-list [data-reply-id]").forEach(card=>{if(card.querySelector("[data-reply-action]"))return;const actions=document.createElement("div");actions.className="inline-actions";actions.innerHTML='<button class="button ghost" type="button" data-reply-action="edit">Editar</button><button class="button danger-outline" type="button" data-reply-action="delete">Eliminar</button>';card.appendChild(actions);});
    if(!repliesManage)$$('#quick-replies-list [data-reply-action]').forEach(node=>node.remove());
    const docsManage=hasFunction("manageDocuments");const newDoc=$("#new-assistant-document-button");if(newDoc)newDoc.hidden=!docsManage;
    if(!docsManage)$$('#assistant-document-list [data-document-action]').forEach(node=>node.remove());
    const objectives=hasFunction("manageObjectives");const objectiveButton=$("#new-objective-button");if(objectiveButton)objectiveButton.hidden=!objectives;$$('[data-objective-delete]').forEach(node=>node.hidden=!objectives);
    const approvals=hasFunction("manageApprovals");$$('[data-approval-action]').forEach(node=>node.hidden=!approvals);
    const news=hasFunction("manageNews");const newsButton=$("#new-news-button");if(newsButton)newsButton.hidden=!news;
    const owner=hasFunction("assignDeals");if($("#drawer-owner-select"))$("#drawer-owner-select").hidden=!owner;if($("#assign-owner-button"))$("#assign-owner-button").hidden=!owner;
    const transfer=hasFunction("transferDeals");if($("#transfer-conversation-button"))$("#transfer-conversation-button").hidden=!transfer;
  }

  function applyCurrentAccess(){
    ensureDialogUi();enforceNavigation();enforceRoleCopy();enforceAiAndBot();enforceOperationalFunctions();
  }

  document.addEventListener("click",event=>{
    const edit=event.target.closest?.("[data-user-edit]");const fresh=event.target.closest?.("#new-user-button");
    if(edit){userDialogTargetId=edit.dataset.userEdit||"";setTimeout(()=>prepareUserDialog(userDialogTargetId),0);}
    if(fresh){userDialogTargetId="";setTimeout(()=>prepareUserDialog(""),0);}
  });
  document.addEventListener("change",event=>{
    if(event.target?.id==="user-role")setTimeout(()=>applyAccessValues(null,{forceDefaults:true}),0);
  });
  window.addEventListener("crm:state",()=>setTimeout(applyCurrentAccess,0));

  function boot(){ensureDialogUi();void loadStateCache();setTimeout(applyCurrentAccess,400);setTimeout(applyCurrentAccess,1400);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
