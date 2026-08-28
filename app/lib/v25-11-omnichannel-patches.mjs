function replaceOne(source, pattern, replacement, label) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) throw new Error(`V25.11 omnichannel patch "${label}" esperaba 1 coincidencia y encontró ${matches.length}.`);
  return source.replace(pattern, replacement);
}

const omnichannelBlock = String.raw`
if (!Array.isArray(data.socialThreads)) data.socialThreads = [];
if (!Array.isArray(data.socialOauthStates)) data.socialOauthStates = [];
if (!data.settings.socialOAuth || typeof data.settings.socialOAuth !== "object") data.settings.socialOAuth = {};
if (!data.settings.socialOAuth.meta || typeof data.settings.socialOAuth.meta !== "object") data.settings.socialOAuth.meta = {};
if (!data.settings.socialOAuth.tiktok || typeof data.settings.socialOAuth.tiktok !== "object") data.settings.socialOAuth.tiktok = {};

function v2511BaseUrl(request) {
  const configured = String(publicBaseUrl || "").replace(/\/$/, "");
  if (configured) return configured;
  const proto = cleanText(request.headers["x-forwarded-proto"], 20).split(",")[0] || request.protocol || "https";
  const hostName = cleanText(request.headers["x-forwarded-host"] || request.headers.host, 300);
  return hostName ? proto + "://" + hostName : "";
}
function v2511TenantPrefix() { return "/t/" + tenantSlug; }
function v2511MetaCallback(request) { return v2511BaseUrl(request) + v2511TenantPrefix() + "/api/social/oauth/meta/callback"; }
function v2511TikTokCallback(request) { return v2511BaseUrl(request) + v2511TenantPrefix() + "/api/social/oauth/tiktok/callback"; }
function v2511UiReturn(request, result, provider = "") {
  const params = new URLSearchParams({ social_oauth: result, provider });
  return v2511BaseUrl(request) + v2511TenantPrefix() + "/?" + params.toString();
}
function v2511CanManage(user) {
  return Boolean(user && (user.isMaster === true || user.role === "admin" || user.permissions?.socialChannelsManage === true));
}
function v2511OauthState(provider, user) {
  const entry = { id: randomBytes(24).toString("hex"), provider, userId: user.id, expiresAt: Date.now() + 10 * 60 * 1000 };
  data.socialOauthStates = (data.socialOauthStates || []).filter((item) => Number(item.expiresAt || 0) > Date.now()).slice(-100);
  data.socialOauthStates.push(entry);
  return entry;
}
function v2511ConsumeState(value, providers) {
  const allowed = Array.isArray(providers) ? providers : [providers];
  const index = (data.socialOauthStates || []).findIndex((entry) => entry.id === cleanText(value, 200) && allowed.includes(entry.provider) && Number(entry.expiresAt || 0) > Date.now());
  if (index < 0) return null;
  return data.socialOauthStates.splice(index, 1)[0] || null;
}
function v2511MetaPublic(request) {
  const cfg = data.settings.socialOAuth.meta || {};
  return { configured:Boolean(cfg.appId && cfg.appSecret), appId:cleanText(cfg.appId,220), hasAppSecret:Boolean(cfg.appSecret), verifyToken:cleanText(cfg.verifyToken,300), callbackUrl:v2511MetaCallback(request), webhookUrl:v2511BaseUrl(request) + v2511TenantPrefix() + "/api/social/meta/webhook" };
}
function v2511TikTokPublic(request) {
  const cfg = data.settings.socialOAuth.tiktok || {};
  return { configured:Boolean(cfg.clientKey && cfg.clientSecret), clientKey:cleanText(cfg.clientKey,220), hasClientSecret:Boolean(cfg.clientSecret), callbackUrl:v2511TikTokCallback(request) };
}
async function v2511FetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal:AbortSignal.timeout(15000), headers:{ Accept:"application/json", ...(options.headers || {}) } });
  const text = await response.text(); let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw:cleanText(text,1200) }; }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || payload?.error_description || "El proveedor rechazó la solicitud.";
    const error = new Error(cleanText(message,900)); error.status = response.status; throw error;
  }
  return payload || {};
}
function v2511UpsertConnection(input) {
  const existing = (data.socialConnections || []).find((entry) => entry.provider === input.provider && entry.accountId === input.accountId);
  const now = timestamp();
  if (existing) { Object.assign(existing,input,{status:"connected",statusMessage:"Conectado mediante autorización oficial.",lastTestAt:now,lastSyncAt:now,updatedAt:now}); return existing; }
  const connection = { id:makeId("social"), label:input.accountName || input.provider, branchId:null, allowedUserIds:[], status:"connected", statusMessage:"Conectado mediante autorización oficial.", lastTestAt:now, lastSyncAt:now, createdAt:now, updatedAt:now, ...input };
  data.socialConnections.push(connection); return connection;
}
function v2511CanUseConnection(connection,user) {
  if (!connection || !user || connection.status !== "connected") return false;
  if (connection.branchId && !userCanAccessBranch(user,connection.branchId) && !v2511CanManage(user)) return false;
  const allowed = connection.allowedUserIds || [];
  return !allowed.length || allowed.includes(user.id) || v2511CanManage(user);
}
function v2511Thread(connection,externalUserId,fallback={}) {
  let thread = (data.socialThreads || []).find((entry)=>entry.connectionId===connection.id && entry.externalUserId===externalUserId);
  if (!thread) {
    const now=timestamp(); thread={id:makeId("socialthread"),provider:connection.provider,connectionId:connection.id,externalUserId,name:fallback.name||fallback.handle||"Cliente",handle:fallback.handle||"",avatarUrl:fallback.avatarUrl||"",branchId:connection.branchId||null,ownerUserId:null,ownerName:"",status:"open",messages:[],createdAt:now,updatedAt:now,lastMessageAt:now,lastDirection:"incoming",lastMessage:""};
    data.socialThreads.unshift(thread);
  }
  return thread;
}
function v2511Push(thread,direction,text,providerMessageId="",user=null) {
  if (providerMessageId && (thread.messages || []).some((entry)=>entry.providerMessageId===providerMessageId)) return null;
  const now=timestamp(); const message={id:makeId("socialmsg"),direction,text:cleanText(text,4000),providerMessageId:cleanText(providerMessageId,300),createdAt:now,agentName:user?.name||user?.username||""};
  thread.messages=Array.isArray(thread.messages)?thread.messages:[]; thread.messages.push(message); if(thread.messages.length>500)thread.messages.splice(0,thread.messages.length-500);
  thread.updatedAt=now;thread.lastMessageAt=now;thread.lastDirection=direction;thread.lastMessage=message.text; return message;
}
function v2511ThreadPublic(thread) {
  return { id:thread.id,provider:thread.provider,connectionId:thread.connectionId,externalUserId:thread.externalUserId,name:thread.name||thread.handle||"Cliente",handle:thread.handle||"",avatarUrl:thread.avatarUrl||"",branchId:thread.branchId||null,ownerUserId:thread.ownerUserId||null,ownerName:thread.ownerName||"",status:thread.status||"open",lastMessageAt:thread.lastMessageAt||thread.updatedAt||thread.createdAt,lastDirection:thread.lastDirection||"incoming",lastMessage:thread.lastMessage||"",messages:(thread.messages||[]).slice(-250).map((message)=>({id:message.id,direction:message.direction,text:message.text||"",createdAt:message.createdAt,providerMessageId:message.providerMessageId||"",agentName:message.agentName||""})) };
}
async function v2511MetaProfile(connection,userId) {
  try { const version=/^v\d+\.\d+$/.test(connection.graphVersion||"")?connection.graphVersion:"v26.0"; const url=new URL("https://graph.facebook.com/"+version+"/"+encodeURIComponent(userId)); url.searchParams.set("fields",connection.provider==="instagram"?"id,username,name,profile_pic":"id,name,profile_pic");url.searchParams.set("access_token",connection.accessToken);return await v2511FetchJson(url); } catch { return {}; }
}
async function v2511SendSocial(thread,text,user) {
  const connection=(data.socialConnections||[]).find((entry)=>entry.id===thread.connectionId); if(!v2511CanUseConnection(connection,user))throw new Error("No tenés permiso para utilizar este canal.");
  const version=/^v\d+\.\d+$/.test(connection.graphVersion||"")?connection.graphVersion:"v26.0";
  if(connection.provider==="facebook") { const url="https://graph.facebook.com/"+version+"/"+encodeURIComponent(connection.pageId||connection.accountId)+"/messages";return await v2511FetchJson(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipient:{id:thread.externalUserId},messaging_type:"RESPONSE",message:{text},access_token:connection.accessToken})}); }
  if(connection.provider==="instagram") { const url="https://graph.facebook.com/"+version+"/"+encodeURIComponent(connection.accountId)+"/messages";return await v2511FetchJson(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipient:{id:thread.externalUserId},message:{text},access_token:connection.accessToken})}); }
  throw new Error("Este proveedor no tiene mensajería bidireccional habilitada en el CRM.");
}
function v2511VerifyMetaSignature(request) {
  const secret=String(data.settings.socialOAuth.meta?.appSecret||""); const signature=String(request.headers["x-hub-signature-256"]||"");
  if(!secret||!signature||!Buffer.isBuffer(request.rawBody))return false;
  const expected="sha256="+createHmac("sha256",secret).update(request.rawBody).digest("hex");
  const a=Buffer.from(signature);const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);
}

app.get("/api/social/oauth/config",(request,response)=>{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});response.setHeader("Cache-Control","no-store");response.json({canManage:v2511CanManage(user),meta:v2511MetaPublic(request),tiktok:v2511TikTokPublic(request)});});
app.put("/api/social/oauth/config",async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});if(!v2511CanManage(user))return response.status(403).json({error:"Solo administración puede configurar aplicaciones sociales."});
  if(request.body?.meta){const current=data.settings.socialOAuth.meta||{},incoming=request.body.meta||{};data.settings.socialOAuth.meta={...current,appId:cleanText(incoming.appId??current.appId,220),verifyToken:cleanText(incoming.verifyToken??current.verifyToken,300)||randomBytes(24).toString("hex")};if(String(incoming.appSecret||"").trim())data.settings.socialOAuth.meta.appSecret=String(incoming.appSecret).trim().slice(0,1000);}
  if(request.body?.tiktok){const current=data.settings.socialOAuth.tiktok||{},incoming=request.body.tiktok||{};data.settings.socialOAuth.tiktok={...current,clientKey:cleanText(incoming.clientKey??current.clientKey,220)};if(String(incoming.clientSecret||"").trim())data.settings.socialOAuth.tiktok.clientSecret=String(incoming.clientSecret).trim().slice(0,1000);}
  await store.save();response.json({ok:true,meta:v2511MetaPublic(request),tiktok:v2511TikTokPublic(request)});
}catch(error){next(error);}});

app.get("/api/social/oauth/:provider/start",async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});if(!v2511CanManage(user))return response.status(403).json({error:"Solo administración puede conectar canales."});const provider=cleanText(request.params.provider,40);if(!["facebook","instagram","tiktok"].includes(provider))return response.status(400).json({error:"Proveedor no soportado."});const state=v2511OauthState(provider,user);let url;
  if(provider==="facebook"||provider==="instagram"){const cfg=data.settings.socialOAuth.meta||{};if(!cfg.appId||!cfg.appSecret)return response.status(400).json({error:"Configurá primero App ID y App Secret de Meta en Configuración avanzada."});const scopes=provider==="facebook"?["pages_show_list","pages_read_engagement","pages_messaging"]:["pages_show_list","pages_read_engagement","pages_messaging","instagram_basic","instagram_manage_messages"];url=new URL("https://www.facebook.com/v26.0/dialog/oauth");url.searchParams.set("client_id",cfg.appId);url.searchParams.set("redirect_uri",v2511MetaCallback(request));url.searchParams.set("state",state.id);url.searchParams.set("response_type","code");url.searchParams.set("scope",scopes.join(","));}
  else{const cfg=data.settings.socialOAuth.tiktok||{};if(!cfg.clientKey||!cfg.clientSecret)return response.status(400).json({error:"Configurá primero Client Key y Client Secret de TikTok en Configuración avanzada."});url=new URL("https://www.tiktok.com/v2/auth/authorize/");url.searchParams.set("client_key",cfg.clientKey);url.searchParams.set("redirect_uri",v2511TikTokCallback(request));url.searchParams.set("state",state.id);url.searchParams.set("response_type","code");url.searchParams.set("scope","user.info.basic");}
  await store.save();response.json({url:url.toString()});
}catch(error){next(error);}});

app.get("/api/social/oauth/meta/callback",async(request,response)=>{const state=v2511ConsumeState(request.query.state,["facebook","instagram"]);if(!state)return response.redirect(v2511UiReturn(request,"error","meta"));try{const cfg=data.settings.socialOAuth.meta||{},redirectUri=v2511MetaCallback(request);const tokenUrl=new URL("https://graph.facebook.com/v26.0/oauth/access_token");tokenUrl.searchParams.set("client_id",cfg.appId);tokenUrl.searchParams.set("client_secret",cfg.appSecret);tokenUrl.searchParams.set("redirect_uri",redirectUri);tokenUrl.searchParams.set("code",cleanText(request.query.code,2000));const shortToken=await v2511FetchJson(tokenUrl);let userToken=shortToken.access_token;if(!userToken)throw new Error("Meta no devolvió access token.");
  try{const longUrl=new URL("https://graph.facebook.com/v26.0/oauth/access_token");longUrl.searchParams.set("grant_type","fb_exchange_token");longUrl.searchParams.set("client_id",cfg.appId);longUrl.searchParams.set("client_secret",cfg.appSecret);longUrl.searchParams.set("fb_exchange_token",userToken);const longToken=await v2511FetchJson(longUrl);if(longToken.access_token)userToken=longToken.access_token;}catch{}
  const pagesUrl=new URL("https://graph.facebook.com/v26.0/me/accounts");pagesUrl.searchParams.set("fields","id,name,access_token,instagram_business_account{id,username,name}");pagesUrl.searchParams.set("access_token",userToken);const pages=await v2511FetchJson(pagesUrl);let created=0;
  for(const page of pages.data||[]){if(!page?.id||!page?.access_token)continue;if(state.provider==="facebook"){v2511UpsertConnection({provider:"facebook",accountId:cleanText(page.id,220),pageId:cleanText(page.id,220),accountName:cleanText(page.name,240),handle:"",accessToken:page.access_token,appId:cfg.appId,graphVersion:"v26.0"});created+=1;}if(state.provider==="instagram"&&page.instagram_business_account?.id){const ig=page.instagram_business_account;v2511UpsertConnection({provider:"instagram",accountId:cleanText(ig.id,220),pageId:cleanText(page.id,220),accountName:cleanText(ig.name||ig.username||page.name,240),handle:cleanText(ig.username,220),accessToken:page.access_token,appId:cfg.appId,graphVersion:"v26.0"});created+=1;}}
  await store.save();return response.redirect(v2511UiReturn(request,created?"success":"no_assets",state.provider));
}catch(error){await store.save().catch(()=>{});return response.redirect(v2511UiReturn(request,"error",state.provider));}});

app.get("/api/social/oauth/tiktok/callback",async(request,response)=>{const state=v2511ConsumeState(request.query.state,"tiktok");if(!state)return response.redirect(v2511UiReturn(request,"error","tiktok"));try{const cfg=data.settings.socialOAuth.tiktok||{},form=new URLSearchParams({client_key:cfg.clientKey,client_secret:cfg.clientSecret,code:cleanText(request.query.code,2000),grant_type:"authorization_code",redirect_uri:v2511TikTokCallback(request)});const token=await v2511FetchJson("https://open.tiktokapis.com/v2/oauth/token/",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form.toString()});const accessToken=token.access_token;if(!accessToken)throw new Error("TikTok no devolvió access token.");const infoUrl=new URL("https://open.tiktokapis.com/v2/user/info/");infoUrl.searchParams.set("fields","open_id,union_id,avatar_url,display_name");const info=await v2511FetchJson(infoUrl,{headers:{Authorization:"Bearer "+accessToken}}),profile=info?.data?.user||{};v2511UpsertConnection({provider:"tiktok",accountId:cleanText(profile.open_id||token.open_id,220),accountName:cleanText(profile.display_name,240),handle:cleanText(profile.display_name,220),avatarUrl:cleanText(profile.avatar_url,1000),accessToken,refreshToken:String(token.refresh_token||"").slice(0,12000),clientKey:cfg.clientKey});await store.save();return response.redirect(v2511UiReturn(request,"success","tiktok"));}catch(error){await store.save().catch(()=>{});return response.redirect(v2511UiReturn(request,"error","tiktok"));}});

app.get("/api/social/meta/webhook",(request,response)=>{const cfg=data.settings.socialOAuth.meta||{},mode=request.query["hub.mode"],token=request.query["hub.verify_token"],challenge=request.query["hub.challenge"];if(mode==="subscribe"&&cfg.verifyToken&&token===cfg.verifyToken)return response.status(200).send(String(challenge||""));return response.sendStatus(403);});
app.post("/api/social/meta/webhook",async(request,response,next)=>{try{if(!v2511VerifyMetaSignature(request))return response.sendStatus(403);const entries=Array.isArray(request.body?.entry)?request.body.entry:[];for(const entry of entries){const entryId=cleanText(entry.id,220);const fb=(data.socialConnections||[]).find((item)=>item.provider==="facebook"&&(item.pageId===entryId||item.accountId===entryId));const ig=(data.socialConnections||[]).find((item)=>item.provider==="instagram"&&(item.pageId===entryId||item.accountId===entryId));
  for(const event of entry.messaging||[]){if(event.message?.is_echo)continue;const connection=fb||ig;if(!connection)continue;const sender=cleanText(event.sender?.id,300),text=cleanText(event.message?.text,4000)||(event.message?.attachments?.length?"[Adjunto recibido]":"");if(!sender||!text)continue;const profile=await v2511MetaProfile(connection,sender),thread=v2511Thread(connection,sender,{name:profile.name||profile.username||sender,handle:profile.username||"",avatarUrl:profile.profile_pic||""});v2511Push(thread,"incoming",text,event.message?.mid||"");}
  for(const change of entry.changes||[]){const value=change.value||{},sender=cleanText(value.sender?.id||value.from?.id,300),message=value.message||value.messages?.[0]||{},text=cleanText(message.text||message?.text?.body,4000)||(message.attachments?.length?"[Adjunto recibido]":"");if(!ig||!sender||!text)continue;const profile=await v2511MetaProfile(ig,sender),thread=v2511Thread(ig,sender,{name:profile.name||profile.username||sender,handle:profile.username||"",avatarUrl:profile.profile_pic||""});v2511Push(thread,"incoming",text,message.mid||message.id||"");}}
  await store.save();response.sendStatus(200);
}catch(error){next(error);}});

app.get("/api/omnichannel/inbox",(request,response)=>{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});const whatsapp=(data.deals||[]).filter((deal)=>userCanAccessDeal(user,deal)).map((deal)=>({id:"wa:"+deal.id,kind:"deal",entityId:deal.id,provider:"whatsapp",name:deal.name||deal.phone||"Cliente",handle:deal.phone||"",branchId:deal.branchId||null,ownerUserId:deal.ownerUserId||null,ownerName:deal.ownerName||"",status:deal.stage||"open",lastMessageAt:deal.updatedAt||deal.lastMessageAt||deal.createdAt,lastDirection:deal.lastDirection||"",lastMessage:deal.lastMessage||"",messages:(deal.messages||[]).slice(-250).map((message)=>({id:message.id,direction:message.direction,text:message.text||"",createdAt:message.at||message.createdAt,agentName:message.agentName||message.userName||"",attachment:message.attachment||null}))}));const social=(data.socialThreads||[]).filter((thread)=>{const connection=(data.socialConnections||[]).find((entry)=>entry.id===thread.connectionId);return v2511CanUseConnection(connection,user);}).map((thread)=>({id:"social:"+thread.id,kind:"social",entityId:thread.id,...v2511ThreadPublic(thread)}));const conversations=[...whatsapp,...social].sort((a,b)=>String(b.lastMessageAt||"").localeCompare(String(a.lastMessageAt||"")));response.setHeader("Cache-Control","no-store");response.json({conversations});});
app.post("/api/omnichannel/conversations/:id/message",async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});const rawId=cleanText(request.params.id,300),text=cleanText(request.body?.text,4000);if(!text)return response.status(400).json({error:"Escribí un mensaje."});if(rawId.startsWith("wa:"))return response.status(409).json({error:"whatsapp_delegate",dealId:rawId.slice(3)});const threadId=rawId.startsWith("social:")?rawId.slice(7):rawId,thread=(data.socialThreads||[]).find((entry)=>entry.id===threadId);if(!thread)return response.status(404).json({error:"Conversación no encontrada."});const connection=(data.socialConnections||[]).find((entry)=>entry.id===thread.connectionId);if(!v2511CanUseConnection(connection,user))return response.status(403).json({error:"No tenés acceso a este canal."});const result=await v2511SendSocial(thread,text,user);v2511Push(thread,"outgoing",text,result?.message_id||result?.recipient_id||"",user);await store.save();response.json({ok:true,conversation:{id:"social:"+thread.id,kind:"social",entityId:thread.id,...v2511ThreadPublic(thread)}});}catch(error){next(error);}});
app.post("/api/omnichannel/conversations/:id/copilot",async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});const rawId=cleanText(request.params.id,300);if(rawId.startsWith("wa:"))return response.status(409).json({error:"whatsapp_delegate",dealId:rawId.slice(3)});const threadId=rawId.startsWith("social:")?rawId.slice(7):rawId,thread=(data.socialThreads||[]).find((entry)=>entry.id===threadId);if(!thread)return response.status(404).json({error:"Conversación no encontrada."});const connection=(data.socialConnections||[]).find((entry)=>entry.id===thread.connectionId);if(!v2511CanUseConnection(connection,user))return response.status(403).json({error:"Sin acceso."});const recent=(thread.messages||[]).slice(-14).map((m)=>({role:m.direction==="incoming"?"cliente":"agente",text:m.text}));let reply="Gracias por tu mensaje. ¿Podrías darme un poco más de detalle para ayudarte mejor?",source="local";if(data.settings.apiKey){try{const result=await requestOpenAiText({instructions:"Sos copiloto de un agente de atención. Proponé una sola respuesta breve, humana y profesional para continuar esta conversación de "+thread.provider+". No inventes precios, políticas ni datos. Devolvé solo el mensaje sugerido.",input:{cliente:thread.name,canal:thread.provider,mensajes:recent},maxOutputTokens:280});reply=cleanText(result.text,1200)||reply;source="ai";}catch{}}response.json({reply,source});}catch(error){next(error);}});

`;

export function applyV2511OmnichannelPatches(source) {
  let patched = replaceOne(source, /  createHash,\n/, "  createHash,\n  createHmac,\n", "import createHmac");
  patched = replaceOne(patched, /const jsonParser = express\.json\(\{ limit: \"128kb\" \}\);/, 'const jsonParser = express.json({ limit: "128kb", verify: (request, _response, buffer) => { request.rawBody = Buffer.from(buffer); } });', "captura raw para firma Meta");
  patched = replaceOne(patched, /app\.get\("\/api\/health", \(_request, response\) => \{/, omnichannelBlock + 'app.get("/api/health", (_request, response) => {', "rutas omnicanal antes de health");
  return patched;
}
