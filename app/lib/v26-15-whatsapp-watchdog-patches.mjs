function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.15 WhatsApp: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.15 WhatsApp: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceFirstAfter(source, startMarker, find, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.15 WhatsApp: no se encontró inicio de ${label}.`);
  const index = source.indexOf(find, start);
  if (index < 0) throw new Error(`V26.15 WhatsApp: no se encontró ${label}.`);
  return source.slice(0, index) + replacement + source.slice(index + find.length);
}

const watchdogHelpers = String.raw`
const v2615ProbeIntervalMs = 45_000;
const v2615ProbeTimeoutMs = 10_000;
const v2615FailureLimit = 2;

function v2615NewHealth() {
  return {
    timer: null,
    probing: false,
    failures: 0,
    lastProbeAt: null,
    lastProbeOkAt: null,
    lastEventAt: null,
    lastMessageEventAt: null,
    lastRecoveryAt: null,
    recoveries: 0,
    recovering: false,
  };
}

const v2615PrimaryHealth = v2615NewHealth();

function v2615Touch(health, type = "event") {
  if (!health) return;
  const at = timestamp();
  health.lastEventAt = at;
  if (type === "message") health.lastMessageEventAt = at;
}

function v2615PublicHealth(health) {
  if (!health) return null;
  return {
    state: health.recovering ? "recovering" : health.failures > 0 ? "degraded" : "healthy",
    failures: Number(health.failures || 0),
    lastProbeAt: health.lastProbeAt || null,
    lastProbeOkAt: health.lastProbeOkAt || null,
    lastEventAt: health.lastEventAt || null,
    lastMessageEventAt: health.lastMessageEventAt || null,
    lastRecoveryAt: health.lastRecoveryAt || null,
    recoveries: Number(health.recoveries || 0),
  };
}

function v2615Delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function v2615WithTimeout(promise, timeoutMs, label) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(String(label) + " excedió " + String(timeoutMs) + " ms")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function v2615ProbeSocket(socket) {
  if (!socket) throw new Error("socket inexistente");
  if (socket.ws && socket.ws.isOpen === false) throw new Error("websocket cerrado");

  // Un round-trip real detecta sesiones que siguen figurando como conectadas pero dejaron de recibir eventos.
  if (typeof socket.fetchBlocklist === "function") {
    await v2615WithTimeout(Promise.resolve().then(() => socket.fetchBlocklist()), v2615ProbeTimeoutMs, "probe fetchBlocklist");
    return true;
  }
  if (typeof socket.fetchPrivacySettings === "function") {
    await v2615WithTimeout(Promise.resolve().then(() => socket.fetchPrivacySettings(true)), v2615ProbeTimeoutMs, "probe privacidad");
    return true;
  }
  if (socket.ws?.isOpen === true) return true;
  throw new Error("no existe un mecanismo de liveness disponible");
}

function v2615StopWatch(health) {
  if (!health) return;
  if (health.timer) clearInterval(health.timer);
  health.timer = null;
  health.probing = false;
}

function v2615StartWatch({ health, label, getSocket, getStatus, recover }) {
  if (!health) return;
  v2615StopWatch(health);
  health.failures = 0;
  v2615Touch(health);

  const check = async () => {
    if (health.probing || health.recovering || getStatus() !== "connected") return;
    health.probing = true;
    health.lastProbeAt = timestamp();
    try {
      await v2615ProbeSocket(getSocket());
      health.failures = 0;
      health.lastProbeOkAt = timestamp();
      v2615Touch(health);
    } catch (error) {
      health.failures = Number(health.failures || 0) + 1;
      console.warn("[whatsapp watchdog " + String(label) + "] probe " + String(health.failures) + "/" + String(v2615FailureLimit) + ":", error?.message || error);
      if (health.failures >= v2615FailureLimit) {
        await recover(cleanText(error?.message || "la sesión dejó de responder", 240));
      }
    } finally {
      health.probing = false;
    }
  };

  health.timer = setInterval(() => void check(), v2615ProbeIntervalMs);
  health.timer.unref?.();
  const initial = setTimeout(() => void check(), 8_000);
  initial.unref?.();
}

async function v2615SoftClose(socket) {
  if (!socket) return;
  try {
    if (typeof socket.end === "function") socket.end(new Error("V26.15 watchdog: reinicio de transporte"));
    else if (typeof socket.ws?.close === "function") socket.ws.close();
  } catch {}
  await v2615Delay(350);
}

function v2615MarkRecovery(health) {
  health.recovering = true;
  health.failures = 0;
  health.lastRecoveryAt = timestamp();
  health.recoveries = Number(health.recoveries || 0) + 1;
  v2615StopWatch(health);
}

async function v2615RecoverPrimary(reason = "conexión sin respuesta") {
  const health = v2615PrimaryHealth;
  if (health.recovering || mockMode || manualLogout || data.settings.whatsappMode === "cloud") return;
  v2615MarkRecovery(health);
  const oldSocket = whatsappSocket;
  try {
    v263PrimaryGeneration += 1;
    startingPromise = null;
    clearTimeout(reconnectTimer);
    whatsappSocket = null;
    qrDataUrl = null;
    connectedAccount = null;
    historySyncing = true;
    connectionStatus = "starting";
    lastError = "Recuperando automáticamente una conexión de WhatsApp sin respuesta…";
    data.sync.lastActiveAt = timestamp();
    await store.save().catch(() => {});
    addLog("WhatsApp: se detectó una sesión conectada pero sin respuesta (" + cleanText(reason, 180) + "). Recuperando automáticamente…", "warning");
    await v2615SoftClose(oldSocket);
    await v2615Delay(650);
    connectionStatus = "disconnected";
    lastError = null;
    await startConnection();
  } catch (error) {
    connectionStatus = "error";
    lastError = cleanText(error?.message || "Falló la recuperación automática de WhatsApp.", 300);
    addLog("WhatsApp: " + lastError, "warning");
  } finally {
    health.recovering = false;
  }
}

async function v2615RecoverBranch(branchId, reason = "conexión sin respuesta") {
  const runtime = extraBranchRuntime(branchId);
  const health = runtime.v2615Health || (runtime.v2615Health = v2615NewHealth());
  if (health.recovering || mockMode || runtime.manualLogout) return;
  v2615MarkRecovery(health);
  const oldSocket = runtime.socket;
  try {
    runtime.generation = Number(runtime.generation || 0) + 1;
    runtime.startingPromise = null;
    clearTimeout(runtime.reconnectTimer);
    runtime.socket = null;
    runtime.qr = null;
    runtime.account = null;
    runtime.syncing = true;
    runtime.status = "starting";
    runtime.error = "Recuperando automáticamente una conexión sin respuesta…";
    addLog((getBranch(branchId)?.name || "Sucursal") + ": sesión de WhatsApp sin respuesta (" + cleanText(reason, 180) + "). Recuperando automáticamente…", "warning");
    await v2615SoftClose(oldSocket);
    await v2615Delay(650);
    runtime.status = "disconnected";
    runtime.error = null;
    await startExtraBranchConnection(branchId);
  } catch (error) {
    runtime.status = "error";
    runtime.error = cleanText(error?.message || "Falló la recuperación automática de WhatsApp.", 300);
    addLog((getBranch(branchId)?.name || "Sucursal") + ": " + runtime.error, "warning");
  } finally {
    health.recovering = false;
  }
}

async function v2615RecoverLine(lineId, reason = "conexión sin respuesta") {
  const line = whatsappLineById(lineId);
  if (!line || line.provider !== "qr" || line.legacyBranchSession) return;
  const runtime = extraLineRuntime(lineId);
  const health = runtime.v2615Health || (runtime.v2615Health = v2615NewHealth());
  if (health.recovering || mockMode || runtime.manualLogout) return;
  v2615MarkRecovery(health);
  const oldSocket = runtime.socket;
  try {
    runtime.generation = Number(runtime.generation || 0) + 1;
    runtime.startingPromise = null;
    clearTimeout(runtime.reconnectTimer);
    runtime.socket = null;
    runtime.qr = null;
    runtime.account = null;
    runtime.syncing = true;
    runtime.status = "starting";
    runtime.error = "Recuperando automáticamente una conexión sin respuesta…";
    addLog(line.name + ": sesión de WhatsApp sin respuesta (" + cleanText(reason, 180) + "). Recuperando automáticamente…", "warning");
    await v2615SoftClose(oldSocket);
    await v2615Delay(650);
    runtime.status = "disconnected";
    runtime.error = null;
    await startWhatsappLineConnection(lineId);
  } catch (error) {
    runtime.status = "error";
    runtime.error = cleanText(error?.message || "Falló la recuperación automática de WhatsApp.", 300);
    addLog(line.name + ": " + runtime.error, "warning");
  } finally {
    health.recovering = false;
  }
}
`;

export function applyV2615WhatsappWatchdogPatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    "let v263PrimaryGeneration = 0;",
    "let v263PrimaryGeneration = 0;\n" + watchdogHelpers.trim(),
    "estado del watchdog principal",
  );

  patched = replaceOnce(
    patched,
    'runtime = { status: "disconnected", qr: null, account: null, error: null, socket: null, reconnectTimer: null, manualLogout: false, startingPromise: null, syncing: false, generation: 0 };',
    'runtime = { status: "disconnected", qr: null, account: null, error: null, socket: null, reconnectTimer: null, manualLogout: false, startingPromise: null, syncing: false, generation: 0, v2615Health: v2615NewHealth() };',
    "health por sucursal",
  );

  patched = replaceOnce(
    patched,
    'runtime = { status: "disconnected", qr: null, account: null, error: null, socket: null, reconnectTimer: null, manualLogout: false, startingPromise: null, syncing: false, lastConnectedAt: null, generation: 0 };',
    'runtime = { status: "disconnected", qr: null, account: null, error: null, socket: null, reconnectTimer: null, manualLogout: false, startingPromise: null, syncing: false, lastConnectedAt: null, generation: 0, v2615Health: v2615NewHealth() };',
    "health por línea",
  );

  patched = replaceOnce(
    patched,
    'whatsappSocket.ev.on("messages.upsert", (event) => {\n        void handleIncomingMessages(event, { branchId: primaryBranchId() });\n      });',
    'whatsappSocket.ev.on("messages.upsert", (event) => {\n        v2615Touch(v2615PrimaryHealth, "message");\n        void handleIncomingMessages(event, { branchId: primaryBranchId() });\n      });',
    "actividad de mensajes principal",
  );
  patched = replaceOnce(
    patched,
    'whatsappSocket.ev.on("messaging-history.set", (event) => {\n        historySyncing = true;',
    'whatsappSocket.ev.on("messaging-history.set", (event) => {\n        v2615Touch(v2615PrimaryHealth, "message");\n        historySyncing = true;',
    "actividad de historial principal",
  );
  patched = replaceOnce(
    patched,
    'whatsappSocket.ev.on("call", (calls) => {\n        void handleCalls(calls, primaryBranchId());\n      });',
    'whatsappSocket.ev.on("call", (calls) => {\n        v2615Touch(v2615PrimaryHealth);\n        void handleCalls(calls, primaryBranchId());\n      });',
    "actividad de llamadas principal",
  );
  patched = replaceFirstAfter(
    patched,
    'whatsappSocket.ev.on("connection.update", async (update) => {',
    'if (v263Generation !== v263PrimaryGeneration) return;',
    'if (v263Generation !== v263PrimaryGeneration) return;\n        v2615Touch(v2615PrimaryHealth);',
    "actividad de transporte principal",
  );
  patched = replaceFirstAfter(
    patched,
    'if (connection === "open") {',
    'connectionStatus = "connected";',
    'connectionStatus = "connected";\n          v2615StartWatch({ health: v2615PrimaryHealth, label: "principal", getSocket: () => whatsappSocket, getStatus: () => connectionStatus, recover: v2615RecoverPrimary });',
    "watchdog al conectar principal",
  );
  patched = replaceFirstAfter(
    patched,
    'if (connection === "close") {',
    'const statusCode =',
    'v2615StopWatch(v2615PrimaryHealth);\n          const statusCode =',
    "detener watchdog al cerrar principal",
  );
  patched = replaceFirstAfter(
    patched,
    'async function disconnect() {',
    'manualLogout = true;',
    'v2615StopWatch(v2615PrimaryHealth);\n  manualLogout = true;',
    "detener watchdog al desvincular principal",
  );

  patched = replaceOnce(
    patched,
    'runtime.socket.ev.on("messages.upsert", (event) => { void handleIncomingMessages(event, { branchId }); });',
    'runtime.socket.ev.on("messages.upsert", (event) => { v2615Touch(runtime.v2615Health, "message"); void handleIncomingMessages(event, { branchId }); });',
    "actividad de mensajes por sucursal",
  );
  patched = replaceOnce(
    patched,
    'runtime.socket.ev.on("messaging-history.set", (event) => { runtime.syncing = true;',
    'runtime.socket.ev.on("messaging-history.set", (event) => { v2615Touch(runtime.v2615Health, "message"); runtime.syncing = true;',
    "actividad de historial por sucursal",
  );
  patched = replaceOnce(
    patched,
    'runtime.socket.ev.on("call", (calls) => { void handleCalls(calls, branchId); });',
    'runtime.socket.ev.on("call", (calls) => { v2615Touch(runtime.v2615Health); void handleCalls(calls, branchId); });',
    "actividad de llamadas por sucursal",
  );
  patched = replaceFirstAfter(
    patched,
    'async function startExtraBranchConnection(branchId) {',
    'if (v263Generation !== runtime.generation) return;',
    'if (v263Generation !== runtime.generation) return;\n        v2615Touch(runtime.v2615Health);',
    "actividad de transporte por sucursal",
  );
  patched = replaceFirstAfter(
    patched,
    'async function startExtraBranchConnection(branchId) {',
    'runtime.status = "connected";',
    'runtime.status = "connected"; v2615StartWatch({ health: runtime.v2615Health, label: `sucursal:${branchId}`, getSocket: () => runtime.socket, getStatus: () => runtime.status, recover: (reason) => v2615RecoverBranch(branchId, reason) });',
    "watchdog al conectar sucursal",
  );
  patched = replaceFirstAfter(
    patched,
    'async function startExtraBranchConnection(branchId) {',
    'if (connection === "close") {',
    'if (connection === "close") {\n          v2615StopWatch(runtime.v2615Health);',
    "detener watchdog al cerrar sucursal",
  );
  patched = replaceFirstAfter(
    patched,
    'async function disconnectBranchConnection(branchId) {',
    'const runtime = extraBranchRuntime(branchId);',
    'const runtime = extraBranchRuntime(branchId);\n  v2615StopWatch(runtime.v2615Health);',
    "detener watchdog al desvincular sucursal",
  );

  patched = replaceOnce(
    patched,
    'runtime.socket.ev.on("messages.upsert",(event)=>{void handleIncomingMessages(event,{branchId:line.branchId,lineId:line.id});});',
    'runtime.socket.ev.on("messages.upsert",(event)=>{v2615Touch(runtime.v2615Health,"message");void handleIncomingMessages(event,{branchId:line.branchId,lineId:line.id});});',
    "actividad de mensajes por línea",
  );
  patched = replaceOnce(
    patched,
    'runtime.socket.ev.on("messaging-history.set",(event)=>{runtime.syncing=true;',
    'runtime.socket.ev.on("messaging-history.set",(event)=>{v2615Touch(runtime.v2615Health,"message");runtime.syncing=true;',
    "actividad de historial por línea",
  );
  patched = replaceOnce(
    patched,
    'runtime.socket.ev.on("call",(calls)=>{void handleCalls(calls,line.branchId,line.id);});',
    'runtime.socket.ev.on("call",(calls)=>{v2615Touch(runtime.v2615Health);void handleCalls(calls,line.branchId,line.id);});',
    "actividad de llamadas por línea",
  );
  patched = replaceFirstAfter(
    patched,
    'async function startWhatsappLineConnection(lineId) {',
    'if(v263Generation!==runtime.generation)return;',
    'if(v263Generation!==runtime.generation)return;v2615Touch(runtime.v2615Health);',
    "actividad de transporte por línea",
  );
  patched = replaceFirstAfter(
    patched,
    'async function startWhatsappLineConnection(lineId) {',
    'runtime.status="connected";',
    'runtime.status="connected";v2615StartWatch({health:runtime.v2615Health,label:`linea:${line.id}`,getSocket:()=>runtime.socket,getStatus:()=>runtime.status,recover:(reason)=>v2615RecoverLine(line.id,reason)});',
    "watchdog al conectar línea",
  );
  patched = replaceFirstAfter(
    patched,
    'async function startWhatsappLineConnection(lineId) {',
    'if(connection==="close"){',
    'if(connection==="close"){v2615StopWatch(runtime.v2615Health);',
    "detener watchdog al cerrar línea",
  );
  patched = replaceFirstAfter(
    patched,
    'async function disconnectWhatsappLineConnection(lineId) {',
    'const runtime=extraLineRuntime(line.id);',
    'const runtime=extraLineRuntime(line.id);v2615StopWatch(runtime.v2615Health);',
    "detener watchdog al desvincular línea",
  );

  patched = replaceFirstAfter(
    patched,
    'function connectionState() {',
    'lastImportCount: Number(data.sync?.lastImportCount || 0),',
    'lastImportCount: Number(data.sync?.lastImportCount || 0),\n    watchdog: cloud ? null : v2615PublicHealth(v2615PrimaryHealth),',
    "estado público del watchdog principal",
  );
  patched = replaceFirstAfter(
    patched,
    'function branchConnectionState(branchId) {',
    'syncing: Boolean(runtime.syncing),',
    'syncing: Boolean(runtime.syncing),\n    watchdog: v2615PublicHealth(runtime.v2615Health),',
    "estado público del watchdog de sucursal",
  );
  patched = replaceFirstAfter(
    patched,
    'function whatsappLineConnectionState(lineId) {',
    'syncing:Boolean(runtime.syncing)',
    'syncing:Boolean(runtime.syncing),watchdog:v2615PublicHealth(runtime.v2615Health)',
    "estado público del watchdog por línea",
  );

  return patched;
}
