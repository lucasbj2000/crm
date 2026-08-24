import { randomBytes } from 'node:crypto';

const ARRAYS = [
  'v22Events','v22Automations','v22DelayedActions','v22Tickets','v22Quotes','v22PortalTokens',
  'v22Integrations','v22Webhooks','v22ApiTokens','v22Segments','v22CustomObjects','v22CustomRecords',
  'v22ReportDefinitions','v22Notifications','v22SlaPolicies','v22QualityReviews','v22Consents',
  'v22VersionedAssets','v22Tenants','v22Plans','v22ChannelEvents','v22ImportJobs','v22SavedViews'
];

function text(value,max=4000){return String(value??'').trim().slice(0,max)}
function arr(value){return Array.isArray(value)?value:[]}
function num(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback}
function bool(value){return value===true}
function now(){return new Date().toISOString()}
function clone(value){return JSON.parse(JSON.stringify(value))}
function slug(value){return text(value,120).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80)}
function esc(value){return String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function normalizePhone(value){return String(value||'').replace(/\D/g,'')}
function randomToken(prefix='tok'){return `${prefix}_${randomBytes(24).toString('base64url')}`}
function parseDate(value){const n=Date.parse(value||0);return Number.isFinite(n)?n:0}
function daysSince(value){const t=parseDate(value);return t?Math.max(0,(Date.now()-t)/86400000):9999}
function safeJson(value,fallback={}){return value&&typeof value==='object'?value:fallback}

export function installV22Platform(deps){
  const {app,data,store,currentUser,recordAuditEvent,sendBotMessage,surveyRecipientsFor,createSurveySession,startSurveySession,primaryBranchId,getBranch,OPEN_STAGES,findClient,findDeal,stateResponse,verifyPassword,hashPassword,makeId,timestamp,userCanAccessBranch} = deps;
  for(const key of ARRAYS) if(!Array.isArray(data[key])) data[key]=[];
  if(!data.settings.v22 || typeof data.settings.v22!=='object') data.settings.v22={};
  data.settings.v22={
    enabled:data.settings.v22.enabled!==false,
    communicationFrequencyDays:Math.max(0,num(data.settings.v22.communicationFrequencyDays,2)),
    maxMassMessagesPer7Days:Math.max(1,num(data.settings.v22.maxMassMessagesPer7Days,2)),
    portalEnabled:data.settings.v22.portalEnabled!==false,
    publicApiEnabled:data.settings.v22.publicApiEnabled!==false,
    offlineQueueEnabled:data.settings.v22.offlineQueueEnabled!==false,
    defaultSlaMinutes:Math.max(5,num(data.settings.v22.defaultSlaMinutes,60)),
    defaultCurrency:text(data.settings.v22.defaultCurrency||'PYG',8),
    smartRouting:data.settings.v22.smartRouting!==false,
    quoteAcceptanceUpdatesDeal:data.settings.v22.quoteAcceptanceUpdatesDeal!==false,
    eventRetention:Math.max(500,Math.min(20000,num(data.settings.v22.eventRetention,5000))),
  };

  const runtime={fingerprints:new Map(),timer:null,lastScanAt:null,lastError:null,lastRevision:-1};
  const audit=(actor,action,details={},branchId=null)=>{try{recordAuditEvent(actor,action,details,branchId||actor?.branchId||primaryBranchId(),'v22')}catch{}};
  const auth=(req,res)=>{const u=currentUser(req);if(!u){res.status(401).json({error:'Sesión requerida.'});return null}return u};
  const admin=(req,res)=>{const u=auth(req,res);if(!u)return null;if(u.role!=='admin'){res.status(403).json({error:'Solo administrador.'});return null}return u};
  const manager=(req,res)=>{const u=auth(req,res);if(!u)return null;if(!['admin','manager','supervisor'].includes(u.role)){res.status(403).json({error:'Requiere permisos de gestión.'});return null}return u};
  const accessibleDeal=(u,d)=>Boolean(d&&(u.role==='admin'||u.role==='manager'||!u.branchId||d.branchId===u.branchId||d.ownerUserId===u.id));
  const accessibleClient=(u,c)=>Boolean(c&&(u.role!=='agent'||(data.deals||[]).some(d=>d.clientId===c.id&&d.ownerUserId===u.id)));

  function event(type,payload={},actor=null){
    const row={id:makeId('evt22'),type:text(type,120),payload:clone(payload),actorUserId:actor?.id||null,actorName:actor?.name||'Sistema',at:timestamp()};
    data.v22Events.unshift(row);data.v22Events.splice(data.settings.v22.eventRetention);
    void runAutomations(row).catch(e=>{runtime.lastError=text(e?.message,500)});
    void dispatchWebhooks(row).catch(e=>{runtime.lastError=text(e?.message,500)});
    return row;
  }

  function clientLastPurchase(clientId){return (data.deals||[]).filter(d=>d.clientId===clientId&&d.stage==='won').sort((a,b)=>parseDate(b.outcomeAt||b.updatedAt)-parseDate(a.outcomeAt||a.updatedAt))[0]||null}
  function clientSpend(clientId){return (data.deals||[]).filter(d=>d.clientId===clientId&&d.stage==='won').reduce((s,d)=>s+(d.items||[]).reduce((x,i)=>x+num(i.price,0)*num(i.quantity,1),0),0)}
  function clientPurchaseCount(clientId){return (data.deals||[]).filter(d=>d.clientId===clientId&&d.stage==='won').length}

  function sentimentFromMessages(messages=[]){
    const s=messages.slice(-20).map(m=>String(m.text||'').toLowerCase()).join(' ');
    const neg=['malo','problema','reclamo','enoj','molesto','cancel','no sirve','demora','tarde','pésimo','pesimo'];
    const pos=['gracias','perfecto','excelente','genial','aprobado','confirmo','me sirve','dale'];
    const n=neg.filter(w=>s.includes(w)).length,p=pos.filter(w=>s.includes(w)).length;
    return n>p?'negative':p>n?'positive':'neutral';
  }
  function intentFromMessages(messages=[]){
    const s=messages.slice(-12).map(m=>String(m.text||'').toLowerCase()).join(' ');
    const map=[['complaint',['reclamo','problema','queja','devolu']],['quote',['presupuesto','cotiz','precio','cuánto','cuanto']],['purchase',['comprar','pedido','quiero','confirmo']],['payment',['pago','transfer','factura']],['support',['soporte','ayuda','no funciona']],['delivery',['entrega','envío','envio','retiro']]];
    return map.find(([,words])=>words.some(w=>s.includes(w)))?.[0]||'general';
  }
  function dealScore(deal){
    let score=30,reasons=[];
    if(deal.stage==='won')return {score:100,band:'won',reasons:['Negociación ganada.']};
    if(deal.stage==='lost')return {score:0,band:'lost',reasons:['Negociación perdida.']};
    const status=String(deal.commercialStatusId||'');
    if(/approved|payment_confirmed|order|delivery/.test(status)){score+=35;reasons.push('Estado comercial avanzado.')} else if(/quote|budget|approval/.test(status)){score+=20;reasons.push('Presupuesto/cotización en curso.')} else if(/waiting|pending/.test(status)){score+=5;reasons.push('Existe un pendiente definido.');}
    const incoming=(deal.messages||[]).filter(m=>m.direction==='incoming').length,out=(deal.messages||[]).filter(m=>m.direction==='outgoing').length;
    if(incoming>=2){score+=10;reasons.push('Cliente participó activamente.')}if(out>=1)score+=5;
    if((deal.items||[]).length){score+=10;reasons.push('Tiene productos/servicios asociados.');}
    const sentiment=sentimentFromMessages(deal.messages||[]);if(sentiment==='positive')score+=10;if(sentiment==='negative'){score-=15;reasons.push('Se detectó señal negativa.');}
    const stale=daysSince(deal.lastClientAt||deal.updatedAt);if(stale>7){score-=15;reasons.push('Sin actividad reciente.');}else if(stale<2)score+=5;
    score=Math.max(0,Math.min(99,Math.round(score)));
    return {score,band:score>=75?'hot':score>=50?'warm':'cold',reasons,sentiment,intent:intentFromMessages(deal.messages||[])};
  }
  function nextAction(deal){
    const intelligence=dealScore(deal),status=String(deal.commercialStatusId||'');
    if(deal.stage==='waiting'||/waiting|pending|approval/.test(status))return {action:'followup',label:'Dar seguimiento al pendiente',reason:'La negociación está esperando una respuesta o aprobación.',priority:daysSince(deal.lastClientAt||deal.updatedAt)>2?'high':'normal'};
    if(/quote/.test(status))return {action:'quote_followup',label:'Confirmar recepción del presupuesto',reason:'Hay un presupuesto en curso.',priority:'high'};
    if(intelligence.sentiment==='negative')return {action:'resolve',label:'Priorizar resolución',reason:'Se detectaron señales de insatisfacción.',priority:'urgent'};
    if(deal.stage==='new')return {action:'qualify',label:'Relevar necesidad y próximo paso',reason:'La negociación todavía está en etapa inicial.',priority:'normal'};
    return {action:'advance',label:'Definir próximo compromiso',reason:'Conviene evitar que la negociación quede sin una siguiente acción.',priority:intelligence.score>=70?'high':'normal'};
  }

  function timeline(clientId){
    const out=[];
    for(const d of data.deals||[]){if(d.clientId!==clientId)continue;out.push({type:'deal',at:d.createdAt,title:'Negociación creada',detail:d.name||d.phone,dealId:d.id});for(const m of d.messages||[])out.push({type:'message',at:m.at,title:m.direction==='incoming'?'Mensaje del cliente':'Mensaje enviado',detail:text(m.text||'[Adjunto]',320),dealId:d.id});if(d.outcomeAt)out.push({type:'deal_result',at:d.outcomeAt,title:d.stage==='won'?'Negociación ganada':'Negociación cerrada',detail:d.lossReasonName||d.commercialStatusLabel||''});}
    for(const c of data.campaigns||[]){for(const r of c.recipients||[])if(r.clientId===clientId)out.push({type:'campaign',at:r.sentAt||c.createdAt,title:`Campaña: ${c.name}`,detail:r.status||'enviada'});}
    for(const s of data.surveySessions||[])if(s.clientId===clientId)out.push({type:'form',at:s.completedAt||s.startedAt||s.createdAt,title:s.status==='completed'?'Formulario completado':'Formulario enviado',detail:s.surveyName||''});
    for(const t of data.tasks||[])if(t.clientId===clientId)out.push({type:'task',at:t.createdAt,title:`Tarea: ${t.title}`,detail:t.status||''});
    for(const q of data.v22Quotes||[])if(q.clientId===clientId)out.push({type:'quote',at:q.updatedAt||q.createdAt,title:`Presupuesto ${q.number}`,detail:q.status});
    for(const t of data.v22Tickets||[])if(t.clientId===clientId)out.push({type:'ticket',at:t.updatedAt||t.createdAt,title:`Ticket: ${t.subject}`,detail:t.status});
    for(const e of data.v22ChannelEvents||[])if(e.clientId===clientId)out.push({type:e.channel||'channel',at:e.at,title:e.title||'Interacción',detail:e.detail||''});
    return out.filter(x=>x.at).sort((a,b)=>parseDate(b.at)-parseDate(a.at)).slice(0,500);
  }
  function customer360(client){
    const deals=(data.deals||[]).filter(d=>d.clientId===client.id),open=deals.filter(d=>OPEN_STAGES.has(d.stage)),lastPurchase=clientLastPurchase(client.id),total=clientSpend(client.id),count=clientPurchaseCount(client.id);
    const scores=open.map(d=>({dealId:d.id,...dealScore(d),nextAction:nextAction(d)}));
    const last=timeline(client.id)[0]||null;
    const avgScore=scores.length?Math.round(scores.reduce((s,x)=>s+x.score,0)/scores.length):0;
    const predictedRebuyDays=count>=2?Math.max(7,Math.round((parseDate(lastPurchase?.outcomeAt||lastPurchase?.updatedAt)-parseDate(deals.filter(d=>d.stage==='won').sort((a,b)=>parseDate(b.outcomeAt||b.updatedAt)-parseDate(a.outcomeAt||a.updatedAt))[1]?.outcomeAt||0))/86400000)):null;
    return {client,deals:deals.slice(0,100),openDeals:open.length,purchaseCount:count,totalPurchased:total,lastPurchaseAt:lastPurchase?.outcomeAt||lastPurchase?.updatedAt||null,lastInteraction:last,score:avgScore,dealScores:scores,predictedRebuyDays,daysSinceLastPurchase:lastPurchase?Math.round(daysSince(lastPurchase.outcomeAt||lastPurchase.updatedAt)):null,timeline:timeline(client.id).slice(0,100),tickets:(data.v22Tickets||[]).filter(t=>t.clientId===client.id).slice(0,30),quotes:(data.v22Quotes||[]).filter(q=>q.clientId===client.id).slice(0,30),consents:(data.v22Consents||[]).filter(c=>c.clientId===client.id)};
  }

  function matchCondition(ctx,c){
    const field=text(c?.field,120),op=text(c?.operator||'eq',30),expected=c?.value;
    const source={...ctx,event:ctx.event?.type,stage:ctx.deal?.stage,status:ctx.deal?.commercialStatusId,clientTags:ctx.client?.tags||[],score:ctx.deal?dealScore(ctx.deal).score:0};
    const actual=field.split('.').reduce((v,k)=>v?.[k],source);
    if(op==='eq')return String(actual??'')===String(expected??'');if(op==='neq')return String(actual??'')!==String(expected??'');if(op==='contains')return Array.isArray(actual)?actual.map(String).includes(String(expected)):String(actual??'').toLowerCase().includes(String(expected??'').toLowerCase());if(op==='gt')return num(actual)>num(expected);if(op==='gte')return num(actual)>=num(expected);if(op==='lt')return num(actual)<num(expected);if(op==='exists')return actual!==undefined&&actual!==null&&actual!=='';return true;
  }
  async function executeAction(action,ctx,rule){
    const deal=ctx.deal,client=ctx.client;
    if(action.type==='create_task'){
      const assigned=(data.users||[]).find(u=>u.id===(action.assignedUserId||deal?.ownerUserId))||(data.users||[]).find(u=>u.role==='admin');
      const task={id:makeId('task'),title:text(action.title||`Seguimiento: ${client?.name||deal?.name||'cliente'}`,240),description:text(action.description||`Generado por automatización ${rule.name}.`,3000),branchId:deal?.branchId||assigned?.branchId||primaryBranchId(),assignedUserId:assigned?.id||null,assignedUserName:assigned?.name||'Sin asignar',dealId:deal?.id||null,clientId:client?.id||null,priority:['low','normal','high','urgent'].includes(action.priority)?action.priority:'normal',status:'pending',dueAt:action.dueMinutes?new Date(Date.now()+num(action.dueMinutes)*60000).toISOString():null,createdByUserId:null,createdByName:'Automatización V22',createdAt:timestamp(),updatedAt:timestamp()};data.tasks.unshift(task);return {taskId:task.id};
    }
    if(action.type==='set_status'&&deal){deal.commercialStatusId=text(action.statusId,100)||deal.commercialStatusId;deal.commercialStatusLabel=text(action.statusLabel,160)||action.statusId||deal.commercialStatusLabel;deal.commercialStatusSource='automation';deal.commercialStatusManual=false;deal.commercialStatusUpdatedAt=timestamp();deal.updatedAt=timestamp();return {status:deal.commercialStatusId};}
    if(action.type==='set_stage'&&deal&&['new','contacted','waiting','won','lost'].includes(action.stage)){deal.stage=action.stage;deal.updatedAt=timestamp();return {stage:deal.stage};}
    if(action.type==='add_tag'&&client){client.tags=[...new Set([...(client.tags||[]),text(action.tag,60)].filter(Boolean))].slice(0,30);client.updatedAt=timestamp();return {tags:client.tags};}
    if(action.type==='notification'){const n={id:makeId('not22'),userId:action.userId||deal?.ownerUserId||null,branchId:deal?.branchId||null,severity:action.severity||'info',title:text(action.title||rule.name,180),message:text(action.message||`Evento ${ctx.event.type}`,1000),read:false,createdAt:timestamp()};data.v22Notifications.unshift(n);return {notificationId:n.id};}
    if(action.type==='ticket'){const t=createTicket({clientId:client?.id,dealId:deal?.id,branchId:deal?.branchId,subject:action.subject||`Seguimiento automático: ${client?.name||deal?.name||''}`,description:action.description||`Creado por ${rule.name}`,priority:action.priority||'normal',category:action.category||'Automatización'});return {ticketId:t.id};}
    if(action.type==='send_whatsapp'&&deal){
      const message=text(action.message,4000),purpose=text(action.purpose||'service',40).toLowerCase();
      if(!message)return {skipped:'empty_message'};
      if(purpose==='marketing'){
        if(!client?.marketingOptIn)return {skipped:'marketing_consent_required'};
        const since=Date.now()-7*86400000;
        const direct=(data.v22ChannelEvents||[]).filter(x=>x.clientId===client?.id&&x.direction==='outgoing'&&x.purpose==='marketing'&&parseDate(x.at)>=since).length;
        let campaign=0;for(const c of data.campaigns||[])for(const r of c.recipients||[])if(r.clientId===client?.id&&parseDate(r.sentAt)>=since)campaign++;
        const max=Math.max(1,num(data.settings.v22.maxMassMessagesPer7Days,2));
        if(direct+campaign>=max)return {skipped:'frequency_limit',sentInLast7Days:direct+campaign,max};
        const cooldown=Math.max(0,num(data.settings.v22.communicationFrequencyDays,2));
        if(cooldown){const last=(data.v22ChannelEvents||[]).filter(x=>x.clientId===client?.id&&x.direction==='outgoing'&&x.purpose==='marketing').sort((a,b)=>parseDate(b.at)-parseDate(a.at))[0];if(last&&daysSince(last.at)<cooldown)return {skipped:'cooldown',cooldownDays:cooldown};}
      }
    