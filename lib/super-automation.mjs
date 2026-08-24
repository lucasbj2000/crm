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
    maxExecutions: M