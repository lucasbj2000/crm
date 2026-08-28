function replaceOnce(source, find, replacement, label) {
  const first=source.indexOf(find),last=source.lastIndexOf(find);
  if(first<0)throw new Error(`V25.12 social platform: no se encontró ${label}.`);
  if(first!==last)throw new Error(`V25.12 social platform: ${label} aparece más de una vez.`);
  return source.slice(0,first)+replacement+source.slice(first+find.length);
}

const helpers=String.raw`
function v2512PlatformMetaConfig(){
  return {
    appId:cleanText(process.env.CRM_SOCIAL_META_APP_ID,220),
    appSecret:String(process.env.CRM_SOCIAL_META_APP_SECRET||'').trim().slice(0,1000),
    verifyToken:cleanText(process.env.CRM_SOCIAL_META_VERIFY_TOKEN,300),
  };
}
function v2512PlatformTikTokConfig(){
  return {
    clientKey:cleanText(process.env.CRM_SOCIAL_TIKTOK_CLIENT_KEY,220),
    clientSecret:String(process.env.CRM_SOCIAL_TIKTOK_CLIENT_SECRET||'').trim().slice(0,1000),
  };
}
async function v2512SubscribeMetaPage(pageId,pageToken,provider){
  if(!pageId||!pageToken)return false;
  const url=new URL('https://graph.facebook.com/v26.0/'+encodeURIComponent(pageId)+'/subscribed_apps');
  url.searchParams.set('access_token',pageToken);
  url.searchParams.set('subscribed_fields',provider==='instagram'?'messages,messaging_postbacks':'messages,messaging_postbacks,message_deliveries,message_reads');
  const result=await v2511FetchJson(url,{method:'POST'});
  return result?.success!==false;
}
`;

export function applyV2512SocialPlatformPatches(source){
  let patched=source;
  patched=replaceOnce(patched,
    'if (!data.settings.socialOAuth.tiktok || typeof data.settings.socialOAuth.tiktok !== "object") data.settings.socialOAuth.tiktok = {};',
    'if (!data.settings.socialOAuth.tiktok || typeof data.settings.socialOAuth.tiktok !== "object") data.settings.socialOAuth.tiktok = {};\n'+helpers,
    'helpers de credenciales globales');
  patched=replaceOnce(patched,
    'function v2511MetaCallback(request) { return v2511BaseUrl(request) + v2511TenantPrefix() + "/api/social/oauth/meta/callback"; }',
    'function v2511MetaCallback(request) { return v2511BaseUrl(request) + "/api/social/oauth/meta/callback"; }',
    'callback global Meta');
  patched=replaceOnce(patched,
    'function v2511TikTokCallback(request) { return v2511BaseUrl(request) + v2511TenantPrefix() + "/api/social/oauth/tiktok/callback"; }',
    'function v2511TikTokCallback(request) { return v2511BaseUrl(request) + "/api/social/oauth/tiktok/callback"; }',
    'callback global TikTok');
  patched=replaceOnce(patched,
    '  const entry = { id: randomBytes(24).toString("hex"), provider, userId: user.id, expiresAt: Date.now() + 10 * 60 * 1000 };',
    '  const entry = { id: tenantSlug + "." + randomBytes(24).toString("hex"), provider, userId: user.id, expiresAt: Date.now() + 10 * 60 * 1000 };',
    'state con tenant');
  patched=replaceOnce(patched,
    'function v2511MetaPublic(request) {\n  const cfg = data.settings.socialOAuth.meta || {};\n  return { configured:Boolean(cfg.appId && cfg.appSecret), appId:cleanText(cfg.appId,220), hasAppSecret:Boolean(cfg.appSecret), verifyToken:cleanText(cfg.verifyToken,300), callbackUrl:v2511MetaCallback(request), webhookUrl:v2511BaseUrl(request) + v2511TenantPrefix() + "/api/social/meta/webhook" };\n}',
    'function v2511MetaPublic(request) {\n  const cfg = v2512PlatformMetaConfig();\n  return { managedByPlatform:true, configured:Boolean(cfg.appId && cfg.appSecret), appId:cleanText(cfg.appId,220), hasAppSecret:Boolean(cfg.appSecret), callbackUrl:v2511MetaCallback(request), webhookUrl:v2511BaseUrl(request) + "/api/social/meta/webhook" };\n}',
    'config pública Meta');
  patched=replaceOnce(patched,
    'function v2511TikTokPublic(request) {\n  const cfg = data.settings.socialOAuth.tiktok || {};\n  return { configured:Boolean(cfg.clientKey && cfg.clientSecret), clientKey:cleanText(cfg.clientKey,220), hasClientSecret:Boolean(cfg.clientSecret), callbackUrl:v2511TikTokCallback(request) };\n}',
    'function v2511TikTokPublic(request) {\n  const cfg = v2512PlatformTikTokConfig();\n  return { managedByPlatform:true, configured:Boolean(cfg.clientKey && cfg.clientSecret), clientKey:cleanText(cfg.clientKey,220), hasClientSecret:Boolean(cfg.clientSecret), callbackUrl:v2511TikTokCallback(request) };\n}',
    'config pública TikTok');
  patched=replaceOnce(patched,
    '  const secret=String(data.settings.socialOAuth.meta?.appSecret||""); const signature=String(request.headers["x-hub-signature-256"]||"");',
    '  const secret=String(v2512PlatformMetaConfig().appSecret||""); const signature=String(request.headers["x-hub-signature-256"]||"");',
    'firma Meta global');
  const putRoute='app.put("/api/social/oauth/config",async(request,response,next)=>{try{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});if(!v2511CanManage(user))return response.status(403).json({error:"Solo administración puede configurar aplicaciones sociales."});\n  if(request.body?.meta){const current=data.settings.socialOAuth.meta||{},incoming=request.body.meta||{};data.settings.socialOAuth.meta={...current,appId:cleanText(incoming.appId??current.appId,220),verifyToken:cleanText(incoming.verifyToken??current.verifyToken,300)||randomBytes(24).toString("hex")};if(String(incoming.appSecret||"").trim())data.settings.socialOAuth.meta.appSecret=String(incoming.appSecret).trim().slice(0,1000);}\n  if(request.body?.tiktok){const current=data.settings.socialOAuth.tiktok||{},incoming=request.body.tiktok||{};data.settings.socialOAuth.tiktok={...current,clientKey:cleanText(incoming.clientKey??current.clientKey,220)};if(String(incoming.clientSecret||"").trim())data.settings.socialOAuth.tiktok.clientSecret=String(incoming.clientSecret).trim().slice(0,1000);}\n  await store.save();response.json({ok:true,meta:v2511MetaPublic(request),tiktok:v2511TikTokPublic(request)});\n}catch(error){next(error);}});';
  patched=replaceOnce(patched,putRoute,'app.put("/api/social/oauth/config",(request,response)=>{const user=currentUser(request);if(!user)return response.status(401).json({error:"Sesión requerida."});return response.status(403).json({error:"La configuración técnica de redes sociales se administra únicamente desde el Administrador Maestro."});});','bloquear configuración por empresa');
  patched=replaceOnce(patched,
    'if(provider==="facebook"||provider==="instagram"){const cfg=data.settings.socialOAuth.meta||{};if(!cfg.appId||!cfg.appSecret)return response.status(400).json({error:"Configurá primero App ID y App Secret de Meta en Configuración avanzada."});const scopes=provider==="facebook"?["pages_show_list","pages_read_engagement","pages_messaging"]:["pages_show_list","pages_read_engagement","pages_messaging","instagram_basic","instagram_manage_messages"];',
    'if(provider==="facebook"||provider==="instagram"){const cfg=v2512PlatformMetaConfig();if(!cfg.appId||!cfg.appSecret)return response.status(503).json({error:"La conexión con Meta todavía no fue habilitada por el Administrador Maestro."});const scopes=provider==="facebook"?["pages_show_list","pages_read_engagement","pages_manage_metadata","pages_messaging"]:["pages_show_list","pages_read_engagement","pages_manage_metadata","pages_messaging","instagram_basic","instagram_manage_messages"];',
    'inicio OAuth Meta global');
  patched=replaceOnce(patched,
    'else{const cfg=data.settings.socialOAuth.tiktok||{};if(!cfg.clientKey||!cfg.clientSecret)return response.status(400).json({error:"Configurá primero Client Key y Client Secret de TikTok en Configuración avanzada."});',
    'else{const cfg=v2512PlatformTikTokConfig();if(!cfg.clientKey||!cfg.clientSecret)return response.status(503).json({error:"La conexión con TikTok todavía no fue habilitada por el Administrador Maestro."});',
    'inicio OAuth TikTok global');
  patched=replaceOnce(patched,
    'try{const cfg=data.settings.socialOAuth.meta||{},redirectUri=v2511MetaCallback(request);',
    'try{const cfg=v2512PlatformMetaConfig(),redirectUri=v2511MetaCallback(request);',
    'callback Meta global');
  patched=replaceOnce(patched,
    'for(const page of pages.data||[]){if(!page?.id||!page?.access_token)continue;',
    'for(const page of pages.data||[]){if(!page?.id||!page?.access_token)continue;await v2512SubscribeMetaPage(page.id,page.access_token,state.provider).catch(()=>false);',
    'suscripción automática webhook Meta');
  patched=replaceOnce(patched,
    'try{const cfg=data.settings.socialOAuth.tiktok||{},form=new URLSearchParams(',
    'try{const cfg=v2512PlatformTikTokConfig(),form=new URLSearchParams(',
    'callback TikTok global');
  patched=replaceOnce(patched,
    'app.get("/api/social/meta/webhook",(request,response)=>{const cfg=data.settings.socialOAuth.meta||{},mode=request.query["hub.mode"],token=request.query["hub.verify_token"],challenge=request.query["hub.challenge"];',
    'app.get("/api/social/meta/webhook",(request,response)=>{const cfg=v2512PlatformMetaConfig(),mode=request.query["hub.mode"],token=request.query["hub.verify_token"],challenge=request.query["hub.challenge"];',
    'webhook verify global');
  return patched;
}
