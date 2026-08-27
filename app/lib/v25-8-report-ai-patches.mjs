function replaceOne(source, pattern, replacement, label) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) throw new Error(`V25.8 patch "${label}" esperaba 1 coincidencia y encontró ${matches.length}.`);
  return source.replace(pattern, replacement);
}

export function applyV258ReportAiPatches(source) {
  return replaceOne(
    source,
    /app\.get\("\/api\/forms\/:id\/report", requireManagerOrAdmin,/,
    `function v258CompactGeneralReport(report){
  return {
    generatedAt:report.generatedAt,periodDays:report.periodDays,summary:report.summary||{},
    funnel:(report.funnel||[]).slice(0,10),lossReasons:(report.lossReasons||[]).slice(0,8),
    topProducts:(report.topProducts||[]).slice(0,8),
    agentPerformance:(report.agentPerformance||[]).slice(0,12).map((entry)=>({name:entry.name,assigned:entry.assigned,open:entry.open,waiting:entry.waiting,won:entry.won,lost:entry.lost,conversionRate:entry.conversionRate,averageFirstResponseMinutes:entry.averageFirstResponseMinutes,salesValue:entry.salesValue,attendanceStatus:entry.attendanceStatus})),
    branchSummaries:(report.branchSummaries||[]).slice(0,12).map((entry)=>({name:entry.name,city:entry.city,newClients:entry.newClients,open:entry.open,waiting:entry.waiting,won:entry.won,lost:entry.lost,conversionRate:entry.conversionRate,averageFirstResponseMinutes:entry.averageFirstResponseMinutes,salesValue:entry.salesValue})),
    campaignPerformance:{totals:report.campaignPerformance?.totals||{},campaigns:(report.campaignPerformance?.campaigns||[]).slice(0,12)},
    communications:report.communications||{},attendance:report.attendance||{},
    risks:{waiting:(report.waitingRisk||[]).length,inactivity:(report.inactivityRisk||[]).length,lowStock:(report.lowStock||[]).length},
  };
}
function v258CompactFormReport(form){
  const report=formReportPayload(form);
  return {
    form:{id:form.id,name:form.name,description:form.description||"",formType:form.formType||"survey",createdAt:form.createdAt,active:form.active!==false,branch:getBranch(form.branchId)?.name||"Sucursal"},
    summary:report.summary||{},
    questions:(report.questions||[]).slice(0,30).map((q)=>({id:q.id,text:q.text,type:q.type,totalAnswers:q.totalAnswers,average:q.average,min:q.min,max:q.max,distribution:q.distribution||[],samples:(q.samples||[]).slice(0,8).map((s)=>({value:cleanText(s.value,600),at:s.at}))})),
  };
}
function v258CompactCampaignReport(campaign){
  const metrics=campaignRecipientMetrics(campaign);const errors=new Map();
  for(const recipient of campaign.recipients||[]){if(!recipient.error)continue;const key=cleanText(recipient.error,300)||"Error";errors.set(key,(errors.get(key)||0)+1)}
  return {campaign:{id:campaign.id,name:campaign.name,status:campaign.status,branch:getBranch(campaign.branchId)?.name||"Sucursal",lineName:campaign.lineName||"Línea predeterminada",createdAt:campaign.createdAt,startedAt:campaign.startedAt,finishedAt:campaign.finishedAt,message:cleanText(campaign.message,1200),pauseReason:cleanText(campaign.pauseReason,600)},metrics,errors:[...errors.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([label,count])=>({label,count}))};
}
function v258LocalInsight(scope,context){
  if(scope==="campaign"){
    const m=context.metrics||{};
    return "• Resultado: "+(m.sent||0)+" enviados, "+(m.replied||0)+" respuestas ("+(m.responseRate||0)+"%) y "+(m.converted||0)+" conversiones ("+(m.conversionRate||0)+"%).\\n"+
      "• Entrega: "+(m.failed||0)+" fallidos y "+(m.pending||0)+" pendientes.\\n"+
      "• Lectura: "+(Number(m.responseRate||0)>=20?"la campaña muestra buena interacción":"la respuesta es baja y conviene revisar mensaje, segmento y momento de envío")+".\\n"+
      "• Acción: compará el contenido y el público con las campañas de mejor tasa antes del próximo envío.";
  }
  if(scope==="form"){
    const s=context.summary||{};const answered=(context.questions||[]).filter(q=>Number(q.totalAnswers||0)>0).length;
    return "• Participación: "+(s.completed||0)+" completados de "+(s.sent||0)+" envíos ("+(s.completionRate||0)+"%).\\n"+
      "• Cobertura: "+answered+" preguntas recibieron respuestas.\\n"+
      "• Lectura: "+(Number(s.completionRate||0)>=60?"la finalización es saludable":"hay abandono relevante; revisá longitud, claridad y orden de preguntas")+".\\n"+
      "• Acción: priorizá las preguntas con menor respuesta y los comentarios repetidos.";
  }
  const s=context.summary||{};
  return "• Comercial: "+(s.newClients||0)+" clientes nuevos, "+(s.won||0)+" ganadas y "+(s.conversionRate||0)+"% de conversión.\\n"+
    "• Ventas: "+Number(s.salesValue||0).toLocaleString("es-PY")+" Gs. confirmados.\\n"+
    "• Servicio: primera respuesta promedio "+(s.averageFirstResponseMinutes||0)+" min y SLA ≤15 min de "+(s.sla15Rate||0)+"%.\\n"+
    "• Operación: "+(s.open||0)+" abiertas, "+(s.waiting||0)+" esperando respuesta y "+(s.availableAgents||0)+" agentes disponibles.\\n"+
    "• Acción: priorizá esperas, oportunidades estancadas y el segmento con peor conversión.";
}
app.post("/api/ai/report-insight", async(request,response,next)=>{try{
  const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});if(data.settings.aiSuite?.enabled===false)return response.status(403).json({error:"La IA está desactivada para esta empresa."});
  const scope=["general","campaign","form"].includes(request.body?.scope)?request.body.scope:"general";const question=cleanText(request.body?.question,1600)||"Evaluá este reporte y decime qué salió bien, qué requiere atención y cuál debería ser la siguiente acción.";let context=null,title="Reporte general";
  if(scope==="campaign"){
    if(!(user.role==="admin"||user.permissions?.campaignView===true||user.permissions?.campaignManage===true))return response.status(403).json({error:"No tenés permisos para analizar campañas."});
    const campaign=(data.campaigns||[]).find((entry)=>entry.id===cleanText(request.body?.id,160));if(!campaign)return response.status(404).json({error:"Campaña no encontrada."});if(!userCanAccessBranch(user,campaign.branchId))return response.status(403).json({error:"No podés acceder a esta campaña."});context=v258CompactCampaignReport(campaign);title=campaign.name||"Campaña";
  } else if(scope==="form"){
    if(!canViewSurveys(user))return response.status(403).json({error:"No tenés permisos para analizar formularios."});
    const form=(data.surveys||[]).find((entry)=>entry.id===cleanText(request.body?.id,160));if(!form)return response.status(404).json({error:"Formulario no encontrado."});if(!userCanAccessBranch(user,form.branchId))return response.status(403).json({error:"No podés acceder a este formulario."});context=v258CompactFormReport(form);title=form.name||"Formulario";
  } else {
    const permissions=reportPermissions(user);let branchId=cleanText(request.body?.branchId,120);let ownerUserId=cleanText(request.body?.userId,120);const days=Number(request.body?.days);
    if(user.role==="agent"){branchId=user.branchId||branchId;ownerUserId=user.id}else{if(branchId&&!permissions.global&&!userCanAccessBranch(user,branchId))branchId=user.branchId||"";if(ownerUserId&&!permissions.team)ownerUserId=user.id}
    context=v258CompactGeneralReport(buildReports(data,{days,branchId:branchId||null,ownerUserId:ownerUserId||null}));
  }
  const local=v258LocalInsight(scope,context);if(!data.settings.apiKey)return response.json({analysis:local,source:"local",scope,title});
  try{
    const result=await requestOpenAiText({instructions:"Sos un analista ejecutivo dentro de un CRM. Respondé en español claro y directo. Usá solo los datos del contexto. No inventes. Máximo 6 viñetas y 1.200 caracteres. Debés cubrir: conclusión general, fortalezas, problemas/riesgos, dato más importante y siguiente acción recomendada. Si el usuario hace una pregunta específica, respondela primero. No repitas todos los números y no escribas introducciones largas.",input:{question,scope,context},maxOutputTokens:420});
    recordAiUsage(user,"reportInsight",{model:result.model,inputTokens:result.usage.inputTokens,outputTokens:result.usage.outputTokens});await store.save();return response.json({analysis:cleanText(result.text,1800)||local,source:"ai",scope,title});
  }catch(error){return response.json({analysis:local,source:"local",scope,title,warning:cleanText(error.message,500)})}
}catch(error){next(error)}});

app.get("/api/forms/:id/report", requireManagerOrAdmin,`,
    "endpoint IA de reportes",
  );
}
