function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V25.6 security: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V25.6 security: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceAllRequired(source, find, replacement, label) {
  if (!source.includes(find)) throw new Error(`V25.6 security: no se encontró ${label}.`);
  return source.split(find).join(replacement);
}

const helpers = String.raw`
const v256LoginAttempts = new Map();
const V256_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const V256_ACCOUNT_FAILURES = 5;
const V256_IP_FAILURES = 20;
const V256_LOCK_MS = 15 * 60 * 1000;
const V256_IDLE_SESSION_MS = 60 * 60 * 1000;
const V256_ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1000;
const V256_WEAK_PASSWORDS = new Set([
  'password','password123','admin','admin123','administrator','qwerty','qwerty123','12345678','123456789','1234567890',
  '11111111','00000000','abc12345','letmein','welcome','contraseña','contrasena','paraguay','whatsapp','whatsapp123','crm12345'
]);
function v256ClientIp(request){
  const forwarded=String(request.headers['x-forwarded-for']||'').split(',')[0].trim();
  return cleanText(forwarded||request.socket?.remoteAddress||'unknown',100);
}
function v256AttemptKey(request,username){return 'account:'+v256ClientIp(request)+':'+cleanText(username,80).toLowerCase();}
function v256IpKey(request){return 'ip:'+v256ClientIp(request);}
function v256PruneAttempts(){
  const now=Date.now();
  for(const [key,state] of v256LoginAttempts.entries()){
    if((state.lockedUntil||0)<now && now-(state.firstAt||0)>V256_LOGIN_WINDOW_MS)v256LoginAttempts.delete(key);
  }
}
function v256LoginGuard(request,username){
  v256PruneAttempts();
  const now=Date.now();
  const states=[v256LoginAttempts.get(v256AttemptKey(request,username)),v256LoginAttempts.get(v256IpKey(request))].filter(Boolean);
  const lockedUntil=Math.max(0,...states.map(state=>Number(state.lockedUntil)||0));
  if(lockedUntil>now)return {blocked:true,retryAfter:Math.max(1,Math.ceil((lockedUntil-now)/1000))};
  return {blocked:false,retryAfter:0};
}
function v256BumpAttempt(key,limit){
  const now=Date.now();
  let state=v256LoginAttempts.get(key);
  if(!state||now-(state.firstAt||0)>V256_LOGIN_WINDOW_MS)state={count:0,firstAt:now,lockedUntil:0};
  state.count+=1;
  if(state.count>=limit)state.lockedUntil=now+V256_LOCK_MS;
  v256LoginAttempts.set(key,state);
  return state;
}
function v256RecordSecurityAlert(request,type,details={}){
  if(!Array.isArray(data.securityAlerts))data.securityAlerts=[];
  data.securityAlerts.unshift({id:makeId('security'),type,severity:type.includes('blocked')?'high':'medium',tenant:tenantSlug,ip:v256ClientIp(request),userAgent:cleanText(request.headers['user-agent'],300),details,at:timestamp()});
  data.securityAlerts=data.securityAlerts.slice(0,2000);
  void store.save();
}
function v256RecordLoginFailure(request,username){
  const account=v256BumpAttempt(v256AttemptKey(request,username),V256_ACCOUNT_FAILURES);
  const ip=v256BumpAttempt(v256IpKey(request),V256_IP_FAILURES);
  const blocked=(account.lockedUntil||0)>Date.now()||(ip.lockedUntil||0)>Date.now();
  v256RecordSecurityAlert(request,blocked?'login_blocked':'login_failed',{username:cleanText(username,80),attempts:account.count});
  return blocked;
}
function v256ClearLoginFailures(request,username){v256LoginAttempts.delete(v256AttemptKey(request,username));}
function v256PasswordIssue(value){
  const password=String(value||'');
  if(password.length<12||password.length>128)return 'La contraseña debe tener entre 12 y 128 caracteres.';
  const normalized=password.toLowerCase().replace(/\s+/g,'');
  if(V256_WEAK_PASSWORDS.has(normalized))return 'La contraseña es demasiado común. Elegí una contraseña distinta.';
  const groups=[/[a-záéíóúñ]/i.test(password),/[A-ZÁÉÍÓÚÑ]/.test(password),/\d/.test(password),/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9]/.test(password)].filter(Boolean).length;
  if(password.length<16&&groups<3)return 'Usá al menos 3 tipos de caracteres (mayúsculas, minúsculas, números o símbolos), o una frase de 16 caracteres o más.';
  return '';
}
function v256SecureCookieSuffix(request){
  const secure=String(request.headers['x-forwarded-proto']||'').toLowerCase()==='https'||request.secure===true||process.env.NODE_ENV==='production';
  return secure?'; Secure':'';
}
`;

export function applyV256SecurityPatches(source) {
  let patched = source;
  patched = replaceOnce(patched, 'const sessions = new Map();', 'const sessions = new Map();\n' + helpers, 'mapa de sesiones');

  const headerAnchor='  response.setHeader("X-Frame-Options", "DENY");';
  const headerBlock=`  response.setHeader("X-Frame-Options", "DENY");\n  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");\n  response.setHeader("X-Permitted-Cross-Domain-Policies", "none");\n  response.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=(self)");\n  if (String(request.headers["x-forwarded-proto"] || "").toLowerCase() === "https" || request.secure === true) response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");`;
  patched = replaceOnce(patched, headerAnchor, headerBlock, 'headers de seguridad');
  patched = replaceOnce(patched,
    '"default-src \'self\'; img-src \'self\' data:; media-src \'self\' blob:; style-src \'self\'; script-src \'self\'; connect-src \'self\' ws: wss:; object-src \'none\'",',
    '"default-src \'self\'; base-uri \'self\'; form-action \'self\'; frame-ancestors \'none\'; img-src \'self\' data:; media-src \'self\' blob:; style-src \'self\'; script-src \'self\'; connect-src \'self\' ws: wss:; object-src \'none\'",',
    'CSP endurecida');

  const parserAnchor='const jsonParser = express.json({ limit: "128kb" });';
  const fetchGuard=`app.use((request,response,next)=>{\n  if(!request.path.startsWith('/api/'))return next();\n  const site=String(request.headers['sec-fetch-site']||'').toLowerCase();\n  const publicAllowed=request.path.startsWith('/api/public/')||request.path.startsWith('/api/v22/public/')||request.path==='/api/whatsapp/webhook';\n  if(!publicAllowed&&site==='cross-site')return response.status(403).json({error:'Solicitud bloqueada por seguridad.'});\n  next();\n});\n`;
  patched = replaceOnce(patched, parserAnchor, fetchGuard + parserAnchor, 'Fetch Metadata guard');

  patched = replaceOnce(patched,
    '  if (!token || !session || session.expiresAt < Date.now()) {',
    '  const v256Now = Date.now();\n  if (!token || !session || session.expiresAt < v256Now || (session.absoluteExpiresAt && session.absoluteExpiresAt < v256Now) || (session.lastSeenAt && v256Now - session.lastSeenAt > V256_IDLE_SESSION_MS)) {',
    'expiración de sesión');
  patched = replaceOnce(patched,
    '  session.expiresAt = Date.now() + 12 * 60 * 60 * 1000;\n  session.lastSeenAt = Date.now();',
    '  session.expiresAt = Math.min(session.absoluteExpiresAt || (v256Now + V256_ABSOLUTE_SESSION_MS), v256Now + V256_IDLE_SESSION_MS);\n  session.lastSeenAt = v256Now;',
    'renovación de sesión');

  const loginCredentialAnchor='  const password = String(request.body?.password || "");\n  const user = data.users.find((entry) => entry.username.toLowerCase() === username && entry.active !== false);';
  const loginCredentialReplacement=`  const password = String(request.body?.password || "");\n  const v256Guard = v256LoginGuard(request, username);\n  if (v256Guard.blocked) {\n    response.setHeader("Retry-After", String(v256Guard.retryAfter));\n    v256RecordSecurityAlert(request,"login_blocked",{username});\n    return response.status(429).json({ error: "Demasiados intentos. Esperá unos minutos antes de volver a intentar." });\n  }\n  const user = data.users.find((entry) => entry.username.toLowerCase() === username && entry.active !== false);`;
  patched = replaceOnce(patched, loginCredentialAnchor, loginCredentialReplacement, 'guard de login');
  patched = replaceOnce(patched,
    '  if (!user || !verifyPassword(password, user.passwordHash)) {\n    return response.status(401).json({ error: "Usuario o contraseña incorrectos." });\n  }',
    '  if (!user || !verifyPassword(password, user.passwordHash)) {\n    v256RecordLoginFailure(request, username);\n    return response.status(401).json({ error: "Usuario o contraseña incorrectos." });\n  }\n  v256ClearLoginFailures(request, username);',
    'registro de login fallido');
  patched = replaceOnce(patched,
    '  const token = randomBytes(32).toString("hex");\n  sessions.set(token, { userId: user.id, expiresAt: Date.now() + 12 * 60 * 60 * 1000, lastSeenAt: Date.now() });',
    '  const token = randomBytes(32).toString("hex");\n  const v256SessionNow = Date.now();\n  sessions.set(token, { userId: user.id, createdAt: v256SessionNow, absoluteExpiresAt: v256SessionNow + V256_ABSOLUTE_SESSION_MS, expiresAt: v256SessionNow + V256_IDLE_SESSION_MS, lastSeenAt: v256SessionNow });',
    'creación de sesión');
  patched = replaceOnce(patched,
    '`whatsbot_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,',
    '`whatsbot_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${v256SecureCookieSuffix(request)}`,',
    'cookie de sesión segura');

  patched = replaceAllRequired(patched,
    'if (password.length < 8 || password.length > 128) throw new Error("La contraseña debe tener entre 8 y 128 caracteres.");',
    'const v256PasswordError = v256PasswordIssue(password); if (v256PasswordError) throw new Error(v256PasswordError);',
    'política de contraseña');
  patched = replaceAllRequired(patched,
    'if (request.body.password.length < 8 || request.body.password.length > 128) throw new Error("La contraseña debe tener entre 8 y 128 caracteres.");',
    'const v256PasswordError = v256PasswordIssue(request.body.password); if (v256PasswordError) throw new Error(v256PasswordError);',
    'política de actualización de contraseña');
  patched = replaceAllRequired(patched,
    'if (password.length < 8) throw new Error("Para crear un usuario, la contraseña debe tener al menos 8 caracteres.");',
    'const v256PasswordError = v256PasswordIssue(password); if (v256PasswordError) throw new Error(v256PasswordError);',
    'política CSV de contraseña');
  patched = replaceAllRequired(patched,
    'if (password) { if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres."); user.passwordHash = hashPassword(password); }',
    'if (password) { const v256PasswordError = v256PasswordIssue(password); if (v256PasswordError) throw new Error(v256PasswordError); user.passwordHash = hashPassword(password); }',
    'política CSV al actualizar');
  patched = replaceAllRequired(patched,
    'if (!name || password.length < 8) throw new Error("Faltan nombre o una contraseña de al menos 8 caracteres.");',
    'if (!name) throw new Error("Falta el nombre del usuario."); const v256PasswordError = v256PasswordIssue(password); if (v256PasswordError) throw new Error(v256PasswordError);',
    'política IA de contraseña');

  const statusAnchor='app.get("/api/auth/status", (request, response) => {';
  const statusRoute=`app.get("/api/security/status", requireAdmin, (request,response)=>{\n  v256PruneAttempts();\n  const now=Date.now();\n  const blocked=[...v256LoginAttempts.values()].filter(state=>(state.lockedUntil||0)>now).length;\n  response.setHeader("Cache-Control","no-store");\n  response.json({ok:true,passwordPolicy:{minLength:12,maxLength:128,weakPasswordsBlocked:true},sessionPolicy:{idleMinutes:60,absoluteHours:12},blockedLoginBuckets:blocked,recentAlerts:(data.securityAlerts||[]).slice(0,20)});\n});\n\n`;
  patched = replaceOnce(patched, statusAnchor, statusRoute + statusAnchor, 'estado de seguridad');
  return patched;
}
