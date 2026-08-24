import { cleanText, makeId, timestamp } from './domain.mjs';

export const AUTOMATION_TRIGGER_TYPES = new Set([
  'incoming_message','deal_created','outgoing_message','stage_changed','assignment_changed',
  'stock_changed','attendance_changed','scheduled','manual','task_overdue','order_status_changed',
  'whatsapp_disconnected','sla_warning','document_generated','campaign_replied','client_created'
]);

export const AUTOMATION_ACTION_TYPES = new Set([
  'send_whatsapp','wait_for_reply','delay','branch_condition','set_stage','assign_user','set_contact_field',
  'set_deal_field','set_custom_field','add_tag','remove_tag','create_task','toggle_bot',
  'reserve_stock','release_reservations','close_won','close_lost','create_news','set_module',
  'set_ai_feature','rename_stage','add_bot_instruction','create_custom_field','add_quick_reply',
  'adjust_stock','create_approval','create_order','set_order_status','create_visit','set_attendance',
  'create_objective','create_deal','configure_whatsapp_line','set_memory','clear_memory','call_subflow','cancel_pending_actions',
  'create_crm_flow','add_flow_stage','create_custom_module','create_dashboard','create_role_profile','set_ai_policy','create_subflow','set_power_policy'
]);

const STAGE_ALIASES = {
  new:'new',nuevo:'new',nueva:'new',contacted:'contacted',contactado:'contacted',contactada:'contacted',
  waiting:'waiting',espera:'waiting','en espera':'waiting',won:'won',ganado:'won',ganada:'won',
  lost:'lost',perdido:'lost',perdida:'lost',transferred:'transferred',transferido:'transferred',transferida:'transferred'
};

export function normalizeStage(value='') {
  const key = cleanText(value,80).toLocaleLowerCase('es').trim();
  return STAGE_ALIASES[key] || key;
}

function strArray(value, maxItems=30, maxLen=240) {
  const source = Array.isArray(value) ? value : value == null ? [] : [value];
  return source.map((item)=>cleanText(item,maxLen)).filter(Boolean).slice(0,maxItems);
}

function normalizeMatch(match={}) {
  return {
    contains: strArray(match.contains,20,240),
    anyContains: strArray(match.anyContains,20,240),
    equals: cleanText(match.equals,1000),
    regex: cleanText(match.regex,500),
    notContains: strArray(match.notContains,20,240),
  };
}

function sanitizeCondition(raw={}) {
  const op = ["equals","not_equals","contains","not_contains","gt","gte","lt","lte","in","exists"].includes(raw.op) ? raw.op : "equals";
  return { field: cleanText(raw.field,160), op, value: Array.isArray(raw.value) ? raw.value.map((v)=>cleanText(v,500)).slice(0,50) : raw.value == null ? "" : cleanText(raw.value,1000) };
}

function sanitizeConditions(value) { return (Array.isArray(value)?value:[]).map(sanitizeCondition).filter((c)=>c.field).slice(0,40); }

export function sanitizeAction(raw={}) {
  const type = cleanText(raw.type,80);
  if (!AUTOMATION_ACTION_TYPES.has(type)) return null;
  const action = { ...raw, type };
  if (type === 'send_whatsapp') {
    action.target = ['current_client','fixed_number'].includes(raw.target) ? raw.target : 'current_client';
    action.phone = cleanText(raw.phone,40);
    action.lineId = cleanText(raw.lineId,140) || null;
    action.lineName = cleanText(raw.lineName,160) || null;
    action.text = cleanText(raw.text,6000);
    action.silent = raw.silent !== false;
  } else if (type === 'wait_for_reply') {
    action.timeoutMinutes = Math.min(525600, Math.max(1, Number(raw.timeoutMinutes)||60));
    action.branches = (Array.isArray(raw.branches)?raw.branches:[]).slice(0,12).map((branch)=>({
      label: cleanText(branch.label,120) || 'Respuesta',
      match: normalizeMatch(branch.match||{}),
      actions: sanitizeActions(branch.actions),
    }));
    action.defaultActions = sanitizeActions(raw.defaultActions);
    action.timeoutActions = sanitizeActions(raw.timeoutActions);
  } else if (type === 'delay') {
    action.minutes = Math.min(525600, Math.max(1, Number(raw.minutes)||1));
    action.actions = sanitizeActions(raw.actions);
  } else if (type === 'branch_condition') {
    action.mode = raw.mode === 'any' ? 'any' : 'all';
    action.conditions = sanitizeConditions(raw.conditions);
    action.thenActions = sanitizeActions(raw.thenActions);
    action.elseActions = sanitizeActions(raw.elseActions);
  } else if (type === 'set_stage') {
    action.stage = normalizeStage(raw.stage);
  } else if (type === 'assign_user') {
    action.userId = cleanText(raw.userId,140)||null;
    action.userName = cleanText(raw.userName,160)||null;
    action.strategy = ['first_available','supervisor','manager','specific'].includes(raw.strategy) ? raw.strategy : 'specific';
  } else if (['set_contact_field','set_deal_field'].includes(type)) {
    action.field = cleanText(raw.field,120);
    action.value = raw.value == null ? '' : cleanText(raw.value,3000);
  } else if (type === 'set_custom_field') {
    action.entity = ['contact','deal','product'].includes(raw.entity) ? raw.entity : 'contact';
    action.key = cleanText(raw.key,100);
    action.value = raw.value;
    action.productQuery = cleanText(raw.productQuery,180);
  } else if (['add_tag','remove_tag'].includes(type)) {
    action.tag = cleanText(raw.tag,120);
  } else if (type === 'create_task') {
    action.title = cleanText(raw.title,240);
    action.description = cleanText(raw.description,3000);
    action.priority = ['low','normal','high','urgent'].includes(raw.priority) ? raw.priority : 'normal';
    action.dueMinutes = Math.min(525600, Math.max(0, Number(raw.dueMinutes)||0));
    action.assignTo = ['owner','supervisor','manager','specific'].includes(raw.assignTo) ? raw.assignTo : 'owner';
    action.userId = cleanText(raw.userId,140)||null;
  } else if (type === 'toggle_bot') {
    action.enabled = raw.enabled !== false;
  } else if (type === 'reserve_stock') {
    action.productQuery = cleanText(raw.productQuery,180);
    action.quantity = Math.max(1, Math.trunc(Number(raw.quantity)||1));
  } else if (type === 'adjust_stock') {
    action.productQuery = cleanText(raw.productQuery,180);
    action.quantity = Math.trunc(Number(raw.quantity)||0);
    action.note = cleanText(raw.note,1000)||'Ajuste por Super IA';
  } else if (type === 'create_approval') {
    action.approvalType = cleanText(raw.approvalType||raw.kind||'general',80);
    action.title = cleanText(raw.title,240)||'Aprobación solicitada por Super IA';
    action.detail = cleanText(raw.detail,4000);
    action.amount = Number(raw.amount)||0;
  } else if (type === 'create_order') {
    action.notes = cleanText(raw.notes,3000);
    action.status = ['preparing','ready','dispatched','delivered','incident','cancelled'].includes(raw.status) ? raw.status : 'preparing';
  } else if (type === 'set_order_status') {
    action.orderId = cleanText(raw.orderId,160)||null;
    action.status = ['preparing','ready','dispatched','delivered','incident','cancelled'].includes(raw.status) ? raw.status : 'preparing';
  } else if (type === 'create_visit') {
    action.title = cleanText(raw.title,200)||'Visita comercial';
    action.notes = cleanText(raw.notes,3000);
    action.scheduledMinutes = Math.max(0,Math.min(525600,Number(raw.scheduledMinutes)||0));
    action.assignTo = ['owner','supervisor','manager','specific'].includes(raw.assignTo) ? raw.assignTo : 'owner';
    action.userId = cleanText(raw.userId,140)||null;
    action.userName = cleanText(raw.userName,160)||null;
  } else if (type === 'set_attendance') {
    action.userId = cleanText(raw.userId,140)||null;
    action.userName = cleanText(raw.userName,160)||null;
    action.status = ['active','paused','away','offline'].includes(raw.status) ? raw.status : 'active';
    action.reason = cleanText(raw.reason,500);
    action.untilMinutes = Math.max(0,Math.min(10080,Number(raw.untilMinutes)||0));
  } else if (type === 'create_objective') {
    action.name = cleanText(raw.name,180)||'Objetivo creado por Super IA';
    action.metric = ['sales','wins','conversion','response','nps','contacts'].includes(raw.metric) ? raw.metric : 'sales';
    action.target = Math.max(0,Number(raw.target)||0);
    action.period = cleanText(raw.period,20);
    action.userId = cleanText(raw.userId,140)||null;
    action.userName = cleanText(raw.userName,160)||null;
    action.branchId = cleanText(raw.branchId,140)||null;
    action.branchName = cleanText(raw.branchName,160)||null;
  } else if (type === 'create_deal') {
    action.phone = cleanText(raw.phone,40);
    action.name = cleanText(raw.name,160)||'Cliente';
    action.branchId = cleanText(raw.branchId,140)||null;
    action.branchName = cleanText(raw.branchName,160)||null;
    action.lineId = cleanText(raw.lineId,140)||null;
    action.lineName = cleanText(raw.lineName,160)||null;
    action.source = cleanText(raw.source,100)||'super-automation';
  } else if (type === 'configure_whatsapp_line') {
    action.lineId = cleanText(raw.lineId,140)||null;
    action.lineName = cleanText(raw.lineName,160)||null;
    action.active = raw.active !== false;
    action.accessMode = ['branch','restricted'].includes(raw.accessMode) ? raw.accessMode : null;
    action.allowedUserIds = strArray(raw.allowedUserIds,100,140);
    action.allowedUserNames = strArray(raw.allowedUserNames,100,160);
    action.supervisorsCanUse = raw.supervisorsCanUse;
    action.managersCanUse = raw.managersCanUse;
    action.botEnabled = raw.botEnabled;
    action.isDefault = raw.isDefault;
  } else if (type === 'close_lost') {
    action.reason = cleanText(raw.reason,160)||'Sin retorno del cliente';
  } else if (type === 'create_news') {
    action.title = cleanText(raw.title,180)||'Aviso automático';
    action.body = cleanText(raw.body,8000);
    action.audience = ['all','branch'].includes(raw.audience) ? raw.audience : 'branch';
    action.priority = ['normal','important','urgent'].includes(raw.priority) ? raw.priority : 'normal';
  } else if (['set_module','set_ai_feature'].includes(type)) {
    action.key = cleanText(raw.key,120);
    action.enabled = raw.enabled !== false;
  } else if (type === 'rename_stage') {
    action.stage = normalizeStage(raw.stage);
    action.label = cleanText(raw.label,120);
  } else if (type === 'add_bot_instruction') {
    action.name = cleanText(raw.name,160)||'Regla automática';
    action.instruction = cleanText(raw.instruction,6000);
  } else if (type === 'create_custom_field') {
    action.entity = ['contact','deal','product'].includes(raw.entity) ? raw.entity : 'contact';
    action.key = cleanText(raw.key,80).replace(/[^a-zA-Z0-9_]/g,'_').toLowerCase();
    action.label = cleanText(raw.label,120)||action.key;
    action.fieldType = ['text','number','date','boolean','select'].includes(raw.fieldType) ? raw.fieldType : 'text';
    action.context = cleanText(raw.context,3000);
    action.options = strArray(raw.options,50,120);
    action.botReadable = raw.botReadable !== false;
    action.botWritable = raw.botWritable === true;
  } else if (type === 'add_quick_reply') {
    action.title = cleanText(raw.title,120);
    action.shortcut = cleanText(raw.shortcut,40);
    action.category = cleanText(raw.category,80)||'General';
    action.body = cleanText(raw.body,3000);
  } else if (type === 'set_memory') {
    action.key = cleanText(raw.key,100).replace(/[^a-zA-Z0-9_.-]/g,'_');
    action.value = raw.value == null ? '' : cleanText(raw.value,3000);
    action.scope = ['rule_client','client','deal'].includes(raw.scope) ? raw.scope : 'rule_client';
  } else if (type === 'clear_memory') {
    action.key = cleanText(raw.key,100).replace(/[^a-zA-Z0-9_.-]/g,'_');
    action.scope = ['rule_client','client','deal'].includes(raw.scope) ? raw.scope : 'rule_client';
  } else if (type === 'call_subflow') {
    action.subflowId = cleanText(raw.subflowId,160)||null;
    action.subflowName = cleanText(raw.subflowName,180)||null;
  } else if (type === 'cancel_pending_actions') {
    action.scope = ['deal','client','rule'].includes(raw.scope) ? raw.scope : 'deal';
    action.includeWaits = raw.includeWaits !== false;
    action.includeDelays = raw.includeDelays !== false;
  } else if (type === 'create_crm_flow') {
    action.name = cleanText(raw.name,180)||'Nuevo flujo';
    action.module = cleanText(raw.module,120)||'CRM';
    action.description = cleanText(raw.description,3000);
    action.stages = strArray(raw.stages,30,120);
    action.branchName = cleanText(raw.branchName,180)||null;
  } else if (type === 'add_flow_stage') {
    action.flowId = cleanText(raw.flowId,160)||null;
    action.flowName = cleanText(raw.flowName,180)||null;
    action.stageName = cleanText(raw.stageName,120);
    action.afterStage = cleanText(raw.afterStage,120)||null;
    action.condition = cleanText(raw.condition,1000);
  } else if (type === 'create_custom_module') {
    action.name = cleanText(raw.name,180)||'Módulo personalizado';
    action.description = cleanText(raw.description,3000);
    action.entityName = cleanText(raw.entityName,120)||action.name;
    action.statuses = strArray(raw.statuses,30,120);
    action.fields = (Array.isArray(raw.fields)?raw.fields:[]).slice(0,50).map((f)=>({key:cleanText(f?.key,80).replace(/[^a-zA-Z0-9_]/g,'_').toLowerCase(),label:cleanText(f?.label,120),type:['text','number','date','boolean','select'].includes(f?.type)?f.type:'text'})).filter((f)=>f.key);
  } else if (type === 'create_dashboard') {
    action.name = cleanText(raw.name,180)||'Dashboard';
    action.description = cleanText(raw.description,2000);
    action.kpis = strArray(raw.kpis,30,160);
    action.filters = strArray(raw.filters,30,160);
    action.periodDays = Math.min(3650,Math.max(1,Number(raw.periodDays)||90));
  } else if (type === 'create_role_profile') {
    action.name = cleanText(raw.name,180)||'Rol personalizado';
    action.baseRole = ['agent','supervisor','manager'].includes(raw.baseRole)?raw.baseRole:'agent';
    action.permissions = (raw.permissions&&typeof raw.permissions==='object')?raw.permissions:{};
    action.description = cleanText(raw.description,2000);
  } else if (type === 'set_ai_policy') {
    action.scope = cleanText(raw.scope,160)||'global';
    action.instructions = cleanText(raw.instructions,6000);
    action.never = strArray(raw.never,30,240);
    action.always = strArray(raw.always,30,240);
  } else if (type === 'create_subflow') {
    action.name = cleanText(raw.name,180)||'Subflujo';
    action.description = cleanText(raw.description,2000);
    action.actions = sanitizeActions(raw.actions);
  } else if (type === 'set_power_policy') {
    action.risk = ['low','medium','high','destructive'].includes(raw.risk)?raw.risk:'medium';
    action.mode = ['automatic','confirm','special_confirm','blocked'].includes(raw.mode)?raw.mode:'confirm';
  }
  return action;
}

export function sanitizeActions(actions) {
  return (Array.isArray(actions)?actions:[]).map(sanitizeAction).filter(Boolean).slice(0,50);
}

export function sanitizeRule(raw={}, actor=null) {
  const triggerType = AUTOMATION_TRIGGER_TYPES.has(raw.trigger?.type) ? raw.trigger.type : 'incoming_message';
  const trigger = {
    type: triggerType,
    text: normalizeMatch(raw.trigger?.text||{}),
    phone: cleanText(raw.trigger?.phone,40),
    clientName: cleanText(raw.trigger?.clientName,180),
    clientTag: cleanText(raw.trigger?.clientTag,120),
    branchId: cleanText(raw.trigger?.branchId,140)||null,
    branchName: cleanText(raw.trigger?.branchName,180)||null,
    lineId: cleanText(raw.trigger?.lineId,140)||null,
    lineName: cleanText(raw.trigger?.lineName,180)||null,
    stage: normalizeStage(raw.trigger?.stage||''),
    fromStage: normalizeStage(raw.trigger?.fromStage||''),
    toStage: normalizeStage(raw.trigger?.toStage||''),
    schedule: cleanText(raw.trigger?.schedule,160),
    everyMinutes: Math.min(10080, Math.max(0, Number(raw.trigger?.everyMinutes)||0)),
    slaMinutes: Math.min(525600, Math.max(0, Number(raw.trigger?.slaMinutes)||0)),
  };
  return {
    id: cleanText(raw.id,160)||makeId('autorule'),
    name: cleanText(raw.name,180)||'Automatización IA',
    instruction: cleanText(raw.instruction,6000),
    enabled: raw.enabled !== false,
    trigger,
    actions: sanitizeActions(raw.actions),
    conditionMode: raw.conditionMode === 'any' ? 'any' : 'all',
    conditions: sanitizeConditions(raw.conditions),
    cooldownMinutes: Math.min(10080, Math.max(0, Number(raw.cooldownMinutes)||0)),
    oncePerClient: raw.oncePerClient === true,
    maxExecutions: Math.min(100000, Math.max(0, Number(raw.maxExecutions)||0)),
    executionCount: Math.max(0, Number(raw.executionCount)||0),
    lastExecutedAt: raw.lastExecutedAt||null,
    lastError: cleanText(raw.lastError,1000)||null,
    createdByUserId: raw.createdByUserId||actor?.id||null,
    createdByName: cleanText(raw.createdByName||actor?.name,160),
    createdAt: raw.createdAt||timestamp(),
    updatedAt: timestamp(),
    version: Math.max(1, Number(raw.version)||1),
  };
}

function normalized(value) { return cleanText(value,10000).toLocaleLowerCase('es'); }

export function textMatches(match={}, value='') {
  const text = normalized(value);
  const contains = strArray(match.contains,30,240).map(normalized);
  if (contains.length && !contains.every((part)=>text.includes(part))) return false;
  const any = strArray(match.anyContains,30,240).map(normalized);
  if (any.length && !any.some((part)=>text.includes(part))) return false;
  const not = strArray(match.notContains,30,240).map(normalized);
  if (not.some((part)=>text.includes(part))) return false;
  if (match.equals && text !== normalized(match.equals)) return false;
  if (match.regex) { try { if (!new RegExp(match.regex,'iu').test(value)) return false; } catch { return false; } }
  return true;
}

function conditionValue(field, context={}) {
  const deal=context.deal||{}, client=context.client||{}, product=context.product||{}, user=context.user||{}, branch=context.branch||{}, line=context.line||{}, task=context.event?.task||context.task||{}, order=context.event?.order||context.order||{};
  const known={
    "message.text":context.text||context.message?.text||"", "client.name":client.name||deal.name||"", "client.phone":client.phone||deal.phone||context.phone||"",
    "client.ruc":client.ruc||"", "client.document":client.document||"", "client.company":client.company||"", "client.city":client.city||"", "client.tags":client.tags||[],
    "deal.stage":deal.stage||"", "deal.ownerName":deal.ownerName||"", "deal.total":(deal.items||[]).reduce((sum,item)=>sum+Number(item.price||item.unitPrice||0)*Number(item.quantity||0),0),
    "product.name":product.name||"", "product.sku":product.sku||"", "product.available":Number(product.available||0), "product.minStock":Number(product.minStock||0),
    "user.role":user.role||"", "user.name":user.name||"", "attendance.status":context.status||user.attendance?.status||"", "branch.name":branch.name||"", "line.name":line.name||"",
    "client.lastPurchase":context.calculated?.lastPurchase||client.lastPurchaseAt||"", "client.historicalAmount":Number(context.calculated?.historicalAmount||0), "client.daysWithoutBuying":Number(context.calculated?.daysWithoutBuying||0),
    "deal.waitingMinutes":Number(context.calculated?.waitingMinutes||0), "deal.closeProbability":Number(context.calculated?.closeProbability||0), "task.title":task.title||"", "task.priority":task.priority||"", "task.status":task.status||"", "task.dueAt":task.dueAt||"", "order.status":order.status||"", "order.number":order.number||""
  };
  if (Object.prototype.hasOwnProperty.call(known,field)) return known[field];
  if(field.startsWith("client.custom."))return client.customFields?.[field.slice(14)];
  if(field.startsWith("deal.custom."))return deal.customFields?.[field.slice(12)];
  if(field.startsWith("product.custom."))return product.customFields?.[field.slice(15)];
  if(field.startsWith("memory."))return context.memory?.[field.slice(7)];
  return undefined;
}

function oneConditionMatches(condition, context={}) {
  const actual=conditionValue(condition.field,context), expected=condition.value;
  if(condition.op==='exists')return expected===false||expected==='false' ? actual==null||actual==='' : actual!=null&&actual!=='';
  if(['gt','gte','lt','lte'].includes(condition.op)){const a=Number(actual),b=Number(expected);if(!Number.isFinite(a)||!Number.isFinite(b))return false;if(condition.op==='gt')return a>b;if(condition.op==='gte')return a>=b;if(condition.op==='lt')return a<b;return a<=b;}
  const arr=Array.isArray(actual)?actual.map(normalized):null, a=normalized(Array.isArray(actual)?actual.join(' '):actual), e=normalized(expected);
  if(condition.op==='equals')return arr?arr.includes(e):a===e;
  if(condition.op==='not_equals')return arr?!arr.includes(e):a!==e;
  if(condition.op==='contains')return arr?arr.some((v)=>v.includes(e)):a.includes(e);
  if(condition.op==='not_contains')return arr?!arr.some((v)=>v.includes(e)):!a.includes(e);
  if(condition.op==='in'){const expectedList=Array.isArray(expected)?expected.map(normalized):String(expected||'').split(',').map(normalized);return expectedList.includes(a);}
  return false;
}

export function automationConditionsMatch(conditions=[], context={}, mode='all') {
  if(!conditions?.length)return true; const checks=conditions.map((condition)=>oneConditionMatches(condition,context)); return mode==='any'?checks.some(Boolean):checks.every(Boolean);
}

export function ruleMatchesEvent(rule, event, helpers={}) {
  if (!rule?.enabled || !event || rule.trigger?.type !== event.type) return false;
  const t=rule.trigger||{}, deal=event.deal||{}, client=event.client||{}, line=event.line||{}, branch=event.branch||{};
  if (t.phone && String(client.phone||deal.phone||event.phone||'').replace(/\D/g,'') !== String(t.phone).replace(/\D/g,'')) return false;
  if (t.clientName && !normalized(client.name||deal.name).includes(normalized(t.clientName))) return false;
  if (t.clientTag && !(client.tags||[]).some((tag)=>normalized(tag)===normalized(t.clientTag))) return false;
  if (t.branchId && (deal.branchId||branch.id)!==t.branchId) return false;
  if (t.branchName && !normalized(branch.name||helpers.branchName?.(deal.branchId)).includes(normalized(t.branchName))) return false;
  if (t.lineId && (deal.lineId||line.id)!==t.lineId) return false;
  if (t.lineName && !normalized(line.name||helpers.lineName?.(deal.lineId)).includes(normalized(t.lineName))) return false;
  if (t.stage && deal.stage!==t.stage) return false;
  if (t.fromStage && event.fromStage!==t.fromStage) return false;
  if (t.toStage && event.toStage!==t.toStage) return false;
  if (['incoming_message','outgoing_message'].includes(event.type) && !textMatches(t.text,event.text||'')) return false;
  if (!automationConditionsMatch(rule.conditions||[], { ...event, deal, client, line, branch }, rule.conditionMode||'all')) return false;
  return true;
}

export function replyBranch(wait, text='') {
  for (const branch of wait?.branches||[]) if (textMatches(branch.match||{},text)) return branch;
  return null;
}

export function interpolate(template='', context={}) {
  const valueFor = (key) => {
    const deal=context.deal||{}, client=context.client||{}, line=context.line||{}, branch=context.branch||{}, message=context.message||{};
    const map={
      cliente:client.name||deal.name||'', nombre:client.name||deal.name||'', telefono:client.phone||deal.phone||'', ruc:client.ruc||'', documento:client.document||'', empresa:client.company||'', ciudad:client.city||'', direccion:client.address||'', responsable:deal.ownerName||'', sucursal:branch.name||'', linea:line.name||'', mensaje:message.text||context.text||'', etapa:deal.stage||'', fecha:new Date().toLocaleDateString('es-PY'), hora:new Date().toLocaleTimeString('es-PY',{hour:'2-digit',minute:'2-digit'}), ultimaCompra:context.calculated?.lastPurchase||client.lastPurchaseAt||'', montoHistorico:context.calculated?.historicalAmount||0, diasSinComprar:context.calculated?.daysWithoutBuying||0, tiempoEsperando:context.calculated?.waitingMinutes||0, probabilidadCierre:context.calculated?.closeProbability||0
    };
    if (Object.prototype.hasOwnProperty.call(map,key)) return map[key];
    if (key.startsWith('contacto.')) return client.customFields?.[key.slice(9)] ?? client[key.slice(9)] ?? '';
    if (key.startsWith('negociacion.')) return deal.customFields?.[key.slice(12)] ?? deal[key.slice(12)] ?? '';
    if (key.startsWith('memory.')) return context.memory?.[key.slice(7)] ?? '';
    return '';
  };
  return String(template||'').replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g,(_m,key)=>String(valueFor(key)??''));
}

export function summarizeRule(rule={}) {
  const trigger=rule.trigger||{};
  const triggerCopy={incoming_message:'Mensaje entrante',deal_created:'Nueva negociación',outgoing_message:'Mensaje saliente',stage_changed:'Cambio de etapa',assignment_changed:'Cambio de responsable',stock_changed:'Cambio de stock',attendance_changed:'Cambio de marcación',scheduled:'Programada',manual:'Manual'}[trigger.type]||trigger.type;
  return `${triggerCopy} → ${(rule.actions||[]).map(a=>a.type).join(' → ') || 'sin acciones'}`;
}

export function localParseInstruction(instruction, catalogs={}) {
  const text=cleanText(instruction,6000), lower=text.toLocaleLowerCase('es');
  const quoted=[...text.matchAll(/[“\"]([^”\"]{1,500})[”\"]/g)].map(m=>m[1]);
  const phones=[...text.matchAll(/\+?\d[\d\s().-]{8,18}\d/g)].map(m=>m[0].replace(/\D/g,''));
  const trigger={type:'incoming_message',text:{contains:[],anyContains:[],equals:'',regex:'',notContains:[]}};
  if(/cuando|si/.test(lower) && /escrib|diga|dice|mensaje/.test(lower) && quoted[0]) trigger.text.anyContains=[quoted[0]];
  const sendMatch=lower.match(/(?:envi(?:a|á|ar)|mand(?:a|á|ar)).{0,80}(?:mensaje|whatsapp)/i);
  const actions=[];
  if(sendMatch){
    const message=quoted.length>1?quoted[1]:quoted[0]||'Mensaje automático';
    const targetPhone=phones.at(-1)||'';
    actions.push({type:'send_whatsapp',target:targetPhone?'fixed_number':'current_client',phone:targetPhone,text:message,silent:!/con (?:notific|aviso)/i.test(lower)});
  }
  if(/esper(?:a|ar).{0,50}(?:respuesta|retorno)/i.test(lower) || /dependiendo del retorno/i.test(lower)) {
    actions.push({type:'wait_for_reply',timeoutMinutes:60,branches:[],defaultActions:[],timeoutActions:[]});
  }
  const stageMatch=lower.match(/(?:pas(?:a|ar)|mover|cambiar).{0,40}(?:etapa|estado).{0,20}(nuevo|contactado|espera|ganado|perdido|transferido)/i);
  if(stageMatch) actions.push({type:'set_stage',stage:normalizeStage(stageMatch[1])});
  if(!actions.length) actions.push({type:'create_task',title:'Revisar automatización: '+text.slice(0,120),priority:'normal',dueMinutes:0,assignTo:'owner'});
  return sanitizeRule({name:text.slice(0,80)||'Automatización',instruction:text,trigger,actions,enabled:true});
}
