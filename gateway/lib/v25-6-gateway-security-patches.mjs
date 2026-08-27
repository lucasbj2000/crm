function replaceOnce(source, find, replacement, label) {
  const first=source.indexOf(find), last=source.lastIndexOf(find);
  if(first<0)throw new Error(`V25.6 Gateway security: no se encontró ${label}.`);
  if(first!==last)throw new Error(`V25.6 Gateway security: ${label} aparece más de una vez.`);
  return source.slice(0,first)+replacement+source.slice(first+find.length);
}

const helpers=String.raw`
const v256GatewayAttempts=new Map();
const V256_GATEWAY_WINDOW=15*60*1000;
const V256_GATEWAY_LOCK=15*60*1000;
function v256GatewayIp(req){return clean(String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket?.remoteAddress||'unknown',100);}
function v256GatewayAttemptKey(req,scope){return v256GatewayIp(req)+':'+clean(scope,160).toLowerCase();}
function v256GatewayGuard(req,scope,limit=5){
  const key=v256GatewayAttemptKey(req,scope),now=Date.now();let state=v256GatewayAttempts.get(key);
  if(state&&state.lockedUntil>now)return {blocked:true,retryAfter:Math.max(1,Math.ceil((state.lockedUntil-now)/1000))};
  if(state&&now-state.firstAt>V256_GATEWAY_WINDOW){v256GatewayAttempts.delete(key);state=null;}
  return {blocked:false,key,state,limit};
}
function v256GatewayFailure(req,scope,limit=5){
  const key=v256GatewayAttemptKey(req,scope),now=Date.now();let state=v256GatewayAttempts.get(key);
  if(!state||now-state.firstAt>V256_GATEWAY_WINDOW)state={count:0,firstAt:now,lockedUntil:0};
  state.count+=1;if(state.count>=limit)state.lockedUntil=now+V256_GATEWAY_LOCK;v256GatewayAttempts.set(key,state);return state;
}
function v256GatewayClear(req,scope){v256GatewayAttempts.delete(v256GatewayAttemptKey(req,scope));}
const V256_GATEWAY_WEAK=new Set(['password','password123','admin','admin123','qwerty','qwerty123','12345678','123456789','1234567890','whatsapp','whatsapp123','crm12345','contraseña','contrasena']);
function v256GatewayPasswordIssue(value){
  const password=String(value||'');if(password.length<12||password.length>128)return 'La contraseña debe tener entre 12 y 128 caracteres.';
  if(V256_GATEWAY_WEAK.has(password.toLowerCase().replace(/\s+/g,'')))return 'La contraseña es demasiado común.';
  const groups=[/[a-záéíóúñ]/i.test(password),/[A-ZÁÉÍÓÚÑ]/.test(password),/\d/.test(password),/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9]/.test(password)].filter(Boolean).length;
  if(password.length<16&&groups<3)return 'Usá al menos 3 tipos de caracteres o una frase de 16 caracteres o más.';return '';
}
function v256GatewayHeaders(){return {'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','cross-origin-opener-policy':'same-origin','x-permitted-cross-domain-policies':'none','permissions-policy':'camera=(), microphone=(self), geolocation=(self)','strict-transport-security':'max-age=31536000; includeSubDomains'};}
const v256GatewaySecureCookies=process.env.NODE_ENV==='production'||process.env.CRM_SECURE_COOKIES==='1';
`;

export function applyV256GatewaySecurityPatches(source){
  let patched=source;
  patched=replaceOnce(patched,"const internalGatewaySecret=process.env.CRM_GATEWAY_SECRET||randomBytes(48).toString('hex');","const internalGatewaySecret=process.env.CRM_GATEWAY_SECRET||randomBytes(48).toString('hex');\n"+helpers,'helpers gateway');
  patched=replaceOnce(patched,
    "const json=(res,status,body,headers={})=>{const data=Buffer.from(JSON.stringify(body));res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':data.length,'cache-control':'no-store',...headers});res.end(data)};",
    "const json=(res,status,body,headers={})=>{const data=Buffer.from(JSON.stringify(body));res.writeHead(status,{...v256GatewayHeaders(),'content-type':'application/json; charset=utf-8','content-length':data.length,'cache-control':'no-store',...headers});res.end(data)};",
    'headers JSON');
  patched=replaceOnce(patched,
    "const html=(res,status,body)=>{const data=Buffer.from(body);res.writeHead(status,{'content-type':'text/html; charset=utf-8','content-length':data.length,'cache-control':'no-store'});res.end(data)};",
    "const html=(res,status,body)=>{const data=Buffer.from(body);res.writeHead(status,{...v256GatewayHeaders(),'content-type':'text/html; charset=utf-8','content-length':data.length,'cache-control':'no-store'});res.end(data)};",
    'headers HTML');
  patched=replaceOnce(patched,
    "const cookie=(name,value,maxAge=43200)=>`${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;",
    "const cookie=(name,value,maxAge=43200)=>`${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${v256GatewaySecureCookies?'; Secure':''}`;",
    'cookie segura');
  patched=replaceOnce(patched,"      const out={...u.headers};","      const out={...u.headers,...v256GatewayHeaders()};",'headers proxy');

  patched=replaceOnce(patched,
    "async function loginTenant(req,res,c,username,password){\n  await ensureTenant(c);",
    "async function loginTenant(req,res,c,username,password){\n  const v256Scope='tenant:'+c.slug+':'+clean(username,80).toLowerCase();const v256Guard=v256GatewayGuard(req,v256Scope,5);if(v256Guard.blocked)return json(res,429,{error:'Demasiados intentos. Esperá unos minutos antes de volver a intentar.'},{'retry-after':String(v256Guard.retryAfter)});\n  await ensureTenant(c);",
    'rate limit tenant');
  patched=replaceOnce(patched,
    "  if(!r.ok)return json(res,r.status,payload);",
    "  if(!r.ok){if(r.status===401||r.status===403)v256GatewayFailure(req,v256Scope,5);return json(res,r.status,payload);}v256GatewayClear(req,v256Scope);",
    'fallo tenant');

  const masterLogin="    if(p==='/api/gateway/master/login'&&req.method==='POST'){if(!cfg.masterPasswordHash)return json(res,409,{error:'Primero configurá la contraseña maestra desde el terminal del VPS.'});const b=await bodyJson(req);if(!verifyPassword(b.password,cfg.masterPasswordHash))return json(res,401,{error:'Contraseña maestra incorrecta.'});masterCookie(res);return json(res,200,{ok:true})}";
  const masterHardened="    if(p==='/api/gateway/master/login'&&req.method==='POST'){if(!cfg.masterPasswordHash)return json(res,409,{error:'Primero configurá la contraseña maestra desde el terminal del VPS.'});const b=await bodyJson(req);const scope='master';const guard=v256GatewayGuard(req,scope,5);if(guard.blocked)return json(res,429,{error:'Demasiados intentos. Esperá unos minutos antes de volver a intentar.'},{'retry-after':String(guard.retryAfter)});if(!verifyPassword(b.password,cfg.masterPasswordHash)){v256GatewayFailure(req,scope,5);return json(res,401,{error:'Contraseña maestra incorrecta.'})}v256GatewayClear(req,scope);masterCookie(res);return json(res,200,{ok:true})}";
  patched=replaceOnce(patched,masterLogin,masterHardened,'rate limit master');

  patched=replaceOnce(patched,
    "if(String(b.adminPassword||'').length<8)return json(res,400,{error:'La contraseña inicial debe tener al menos 8 caracteres.'});",
    "const passwordIssue=v256GatewayPasswordIssue(b.adminPassword);if(passwordIssue)return json(res,400,{error:passwordIssue});",
    'contraseña empresa');
  patched=replaceOnce(patched,
    "if(password.length<8)throw new Error('La contraseña debe tener al menos 8 caracteres.');",
    "const passwordIssue=v256GatewayPasswordIssue(password);if(passwordIssue)throw new Error(passwordIssue);",
    'contraseña personal master');
  return patched;
}
