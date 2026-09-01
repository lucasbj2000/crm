function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.3 QR: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.3 QR: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceBetween(source, start, end, replacement, label) {
  const first = source.indexOf(start);
  if (first < 0) throw new Error(`V26.3 QR: no se encontró inicio de ${label}.`);
  const next = source.indexOf(end, first + start.length);
  if (next < 0) throw new Error(`V26.3 QR: no se encontró final de ${label}.`);
  return source.slice(0, first) + replacement + "\n" + source.slice(next);
}

function transformBetween(source, start, end, transform, label) {
  const first = source.indexOf(start);
  if (first < 0) throw new Error(`V26.3 QR: no se encontró inicio de ${label}.`);
  const next = source.indexOf(end, first + start.length);
  if (next < 0) throw new Error(`V26.3 QR: no se encontró final de ${label}.`);
  const block = source.slice(first, next);
  const transformed = transform(block);
  if (transformed === block) throw new Error(`V26.3 QR: ${label} no recibió cambios.`);
  return source.slice(0, first) + transformed + source.slice(next);
}

function localReplace(block, find, replacement, label) {
  const index = block.indexOf(find);
  if (index < 0) throw new Error(`V26.3 QR: no se encontró ${label} dentro del bloque.`);
  return block.slice(0, index) + replacement + block.slice(index + find.length);
}

const helpers = String.raw`
async function v263CloseWhatsappSocket(socket) {
  if (!socket) return;
  const close = async () => {
    try {
      if (typeof socket.logout === "function") await socket.logout();
      else if (typeof socket.end === "function") socket.end(new Error("QR reiniciado por el usuario"));
    } catch {}
  };
  await Promise.race([
    close(),
    new Promise((resolve) => setTimeout(resolve, 1400)),
  ]).catch(() => {});
}

async function v263ResolveWhatsappVersion(fetchLatestBaileysVersion) {
  let timer = null;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => fetchLatestBaileysVersion()),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("La consulta de versión de WhatsApp tardó demasiado.")), 8000);
      }),
    ]);
    return Array.isArray(result?.version) ? result.version : null;
  } catch (error) {
    console.warn("[whatsapp version]", error?.message || error);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function v263WaitForQrState(getState, timeoutMs = 16000) {
  const deadline = Date.now() + timeoutMs;
  let state = getState();
  while (Date.now() < deadline) {
    state = getState();
    if (["qr", "connected", "error"].includes(state?.status)) return state;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return getState();
}
`;

const primaryConnectRoute = String.raw`app.post("/api/connect", async (request, response, next) => {
  try {
    if (data.settings.whatsappMode === "cloud") {
      if (!cloudApiConfigured()) throw new Error("Completá el ID del número y el token de WhatsApp API.");
      addActivity(data, "WhatsApp API configurada como conexión activa.", "success");
      await store.save();
      return response.json(stateResponse(request));
    }

    if (connectionStatus !== "connected") {
      await disconnect().catch(() => {});
      await startConnection();
      const state = await v263WaitForQrState(() => connectionState());
      if (!["qr", "connected"].includes(state?.status)) {
        v263PrimaryGeneration += 1;
        startingPromise = null;
        await v263CloseWhatsappSocket(whatsappSocket);
        whatsappSocket = null;
        qrDataUrl = null;
        connectionStatus = "error";
        lastError = cleanText(state?.error || "WhatsApp no entregó un código QR. Tocá Generar QR para intentar nuevamente.", 300);
        addLog(`QR: ${lastError}`, "warning");
      }
    }

    response.setHeader("Cache-Control", "no-store");
    return response.json(stateResponse(request));
  } catch (error) {
    connectionStatus = "error";
    qrDataUrl = null;
    lastError = cleanText(error?.message || "No se pudo generar el código QR.", 300);
    addLog(`QR: ${lastError}`, "warning");
    return response.status(502).json({ ...stateResponse(request), error: lastError });
  }
});`;

const branchConnectRoute = String.raw`app.post("/api/branches/:id/connect", requireManagerOrAdmin, async (request,response,next)=>{
  try {
    const user=request.currentUser||currentUser(request);
    const branch=getBranch(request.params.id);
    if(!branch||branch.active===false)throw new Error("Sucursal no encontrada o inactiva.");
    if(user.role!=="admin"&&!userCanAccessBranch(user,branch.id))throw new Error("No tenés acceso a esa sucursal.");
    let connection=branchConnectionState(branch.id);
    if(connection?.provider!=="cloud"&&connection?.status!=="connected"){
      await disconnectBranchConnection(branch.id).catch(()=>{});
      await startBranchConnection(branch.id);
      connection=await v263WaitForQrState(()=>branchConnectionState(branch.id));
      if(!["qr","connected"].includes(connection?.status)){
        if(branch.id===primaryBranchId()){
          v263PrimaryGeneration+=1;startingPromise=null;await v263CloseWhatsappSocket(whatsappSocket);whatsappSocket=null;connectionStatus="error";qrDataUrl=null;lastError=cleanText(connection?.error||"WhatsApp no entregó un QR.",300);
        }else{
          const runtime=extraBranchRuntime(branch.id);runtime.generation=Number(runtime.generation||0)+1;runtime.startingPromise=null;await v263CloseWhatsappSocket(runtime.socket);runtime.socket=null;runtime.status="error";runtime.qr=null;runtime.error=cleanText(connection?.error||"WhatsApp no entregó un QR.",300);
        }
      }
    }
    response.setHeader("Cache-Control","no-store");
    response.json(stateResponse(request));
  } catch(error) { next(error); }
});`;

const lineConnectRoute = String.raw`app.post("/api/whatsapp-lines/:id/connect", requireManagerOrAdmin, async (request,response,next)=>{
  try {
    const user=request.currentUser||currentUser(request),line=whatsappLineById(request.params.id);
    if(!line||line.active===false)throw new Error("Línea no encontrada o inactiva.");
    if(user.role!=="admin"&&!canUserUseWhatsappLine(user,line))throw new Error("No tenés permiso para conectar esta línea.");
    let connection=whatsappLineConnectionState(line.id);
    if(line.provider==="qr"&&connection?.status!=="connected"){
      await disconnectWhatsappLineConnection(line.id).catch(()=>{});
      await startWhatsappLineConnection(line.id);
      connection=await v263WaitForQrState(()=>whatsappLineConnectionState(line.id));
      if(!["qr","connected"].includes(connection?.status)){
        if(line.legacyBranchSession){
          if(line.branchId===primaryBranchId()){
            v263PrimaryGeneration+=1;startingPromise=null;await v263CloseWhatsappSocket(whatsappSocket);whatsappSocket=null;connectionStatus="error";qrDataUrl=null;lastError=cleanText(connection?.error||"WhatsApp no entregó un QR.",300);
          }else{
            const runtime=extraBranchRuntime(line.branchId);runtime.generation=Number(runtime.generation||0)+1;runtime.startingPromise=null;await v263CloseWhatsappSocket(runtime.socket);runtime.socket=null;runtime.status="error";runtime.qr=null;runtime.error=cleanText(connection?.error||"WhatsApp no entregó un QR.",300);
          }
        }else{
          const runtime=extraLineRuntime(line.id);runtime.generation=Number(runtime.generation||0)+1;runtime.startingPromise=null;await v263CloseWhatsappSocket(runtime.socket);runtime.socket=null;runtime.status="error";runtime.qr=null;runtime.error=cleanText(connection?.error||"WhatsApp no entregó un QR.",300);
        }
      }
    }
    response.setHeader("Cache-Control","no-store");
    response.json(stateResponse(request));
  } catch(error) { next(error); }
});`;

export function applyV263QrRecoveryPatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    "let startingPromise = null;",
    "let startingPromise = null;\nlet v263PrimaryGeneration = 0;",
    "generación principal de WhatsApp",
  );

  patched = replaceOnce(
    patched,
    'runtime = { status: "disconnected", qr: null, account: null, error: null, socket: null, reconnectTimer: null, manualLogout: false, startingPromise: null, syncing: false };',
    'runtime = { status: "disconnected", qr: null, account: null, error: null, socket: null, reconnectTimer: null, manualLogout: false, startingPromise: null, syncing: false, generation: 0 };',
    "generación por sucursal",
  );

  patched = replaceOnce(
    patched,
    'runtime = { status: "disconnected", qr: null, account: null, error: null, socket: null, reconnectTimer: null, manualLogout: false, startingPromise: null, syncing: false, lastConnectedAt: null };',
    'runtime = { status: "disconnected", qr: null, account: null, error: null, socket: null, reconnectTimer: null, manualLogout: false, startingPromise: null, syncing: false, lastConnectedAt: null, generation: 0 };',
    "generación por línea",
  );

  patched = replaceOnce(
    patched,
    "async function startMockConnection() {",
    helpers + "\nasync function startMockConnection() {",
    "helpers de recuperación QR",
  );

  patched = transformBetween(patched, "async function startConnection() {", "async function disconnect() {", (block) => {
    let next = block;
    next = localReplace(next,
      "startingPromise = (async () => {\n    connectionStatus = \"starting\";",
      "startingPromise = (async () => {\n    const v263Generation = ++v263PrimaryGeneration;\n    connectionStatus = \"starting\";",
      "token del intento principal",
    );
    next = localReplace(next,
      "const { version } = await fetchLatestBaileysVersion();",
      "const version = await v263ResolveWhatsappVersion(fetchLatestBaileysVersion);\n      if (v263Generation !== v263PrimaryGeneration) return;",
      "versión de WhatsApp principal",
    );
    next = localReplace(next,
      "auth: state,\n        version,",
      "auth: state,\n        ...(version ? { version } : {}),",
      "fallback de versión principal",
    );
    next = localReplace(next,
      "const { connection, qr, lastDisconnect } = update;",
      "const { connection, qr, lastDisconnect } = update;\n        if (v263Generation !== v263PrimaryGeneration) return;",
      "protección de eventos principal",
    );
    next = localReplace(next,
      'lastError = "No se pudo iniciar la vinculación. Volvé a intentarlo.";',
      'lastError = cleanText(error?.message || "No se pudo iniciar la vinculación. Volvé a intentarlo.", 300);',
      "error técnico principal",
    );
    return next;
  }, "inicio principal de WhatsApp");

  patched = transformBetween(patched, "async function disconnect() {", "async function startExtraBranchConnection", (block) => {
    let next = block;
    next = localReplace(next,
      "manualLogout = true;\n  clearTimeout(reconnectTimer);",
      "manualLogout = true;\n  v263PrimaryGeneration += 1;\n  startingPromise = null;\n  clearTimeout(reconnectTimer);",
      "invalidación principal al desconectar",
    );
    next = localReplace(next,
      "try {\n    if (whatsappSocket) await whatsappSocket.logout();\n  } catch {\n    // Remove the local credentials even when WhatsApp is unavailable.\n  }",
      "await v263CloseWhatsappSocket(whatsappSocket);",
      "cierre principal con timeout",
    );
    return next;
  }, "desconexión principal");

  patched = transformBetween(patched, "async function startExtraBranchConnection", "async function startBranchConnection", (block) => {
    let next = block;
    next = localReplace(next,
      "runtime.startingPromise = (async () => {\n    runtime.status = \"starting\";",
      "runtime.startingPromise = (async () => {\n    const v263Generation = ++runtime.generation;\n    runtime.status = \"starting\";",
      "token del intento de sucursal",
    );
    next = localReplace(next,
      "const { version } = await fetchLatestBaileysVersion();",
      "const version = await v263ResolveWhatsappVersion(fetchLatestBaileysVersion);\n      if (v263Generation !== runtime.generation) return;",
      "versión de WhatsApp por sucursal",
    );
    next = localReplace(next,
      "runtime.socket = makeWASocket({ auth: state, version, browser:",
      "runtime.socket = makeWASocket({ auth: state, ...(version ? { version } : {}), browser:",
      "fallback de versión por sucursal",
    );
    next = localReplace(next,
      "const { connection, qr, lastDisconnect } = update;",
      "const { connection, qr, lastDisconnect } = update;\n        if (v263Generation !== runtime.generation) return;",
      "protección de eventos por sucursal",
    );
    return next;
  }, "inicio de WhatsApp por sucursal");

  patched = transformBetween(patched, "async function disconnectBranchConnection", "async function startWhatsappLineConnection", (block) => {
    let next = block;
    next = localReplace(next,
      "runtime.manualLogout = true; clearTimeout(runtime.reconnectTimer);",
      "runtime.manualLogout = true; runtime.generation = Number(runtime.generation || 0) + 1; runtime.startingPromise = null; clearTimeout(runtime.reconnectTimer);",
      "invalidación de sucursal",
    );
    next = localReplace(next,
      "try { if (runtime.socket) await runtime.socket.logout(); } catch {}",
      "await v263CloseWhatsappSocket(runtime.socket);",
      "cierre de sucursal con timeout",
    );
    return next;
  }, "desconexión de sucursal");

  patched = transformBetween(patched, "async function startWhatsappLineConnection", "async function disconnectWhatsappLineConnection", (block) => {
    let next = block;
    next = localReplace(next,
      'runtime.startingPromise=(async()=>{runtime.status="starting";',
      'runtime.startingPromise=(async()=>{const v263Generation=++runtime.generation;runtime.status="starting";',
      "token del intento por línea",
    );
    next = localReplace(next,
      'const {version}=await fetchLatestBaileysVersion();',
      'const version=await v263ResolveWhatsappVersion(fetchLatestBaileysVersion);if(v263Generation!==runtime.generation)return;',
      "versión de WhatsApp por línea",
    );
    next = localReplace(next,
      'runtime.socket=makeWASocket({auth:state,version,browser:',
      'runtime.socket=makeWASocket({auth:state,...(version?{version}:{}),browser:',
      "fallback de versión por línea",
    );
    next = localReplace(next,
      'runtime.socket.ev.on("connection.update",async(update)=>{const {connection,qr,lastDisconnect}=update;',
      'runtime.socket.ev.on("connection.update",async(update)=>{const {connection,qr,lastDisconnect}=update;if(v263Generation!==runtime.generation)return;',
      "protección de eventos por línea",
    );
    return next;
  }, "inicio de WhatsApp por línea");

  patched = transformBetween(patched, "async function disconnectWhatsappLineConnection", "function cookieValue", (block) => {
    let next = block;
    next = localReplace(next,
      'const runtime=extraLineRuntime(line.id);runtime.manualLogout=true;clearTimeout(runtime.reconnectTimer);try{if(runtime.socket)await runtime.socket.logout();}catch{}',
      'const runtime=extraLineRuntime(line.id);runtime.manualLogout=true;runtime.generation=Number(runtime.generation||0)+1;runtime.startingPromise=null;clearTimeout(runtime.reconnectTimer);await v263CloseWhatsappSocket(runtime.socket);',
      "invalidación y cierre por línea",
    );
    return next;
  }, "desconexión de línea");

  patched = replaceBetween(patched, 'app.post("/api/connect",', 'app.post("/api/disconnect",', primaryConnectRoute, "ruta QR principal");
  patched = replaceBetween(patched, 'app.post("/api/branches/:id/connect",', 'app.post("/api/branches/:id/disconnect",', branchConnectRoute, "ruta QR por sucursal");
  patched = replaceBetween(patched, 'app.post("/api/whatsapp-lines/:id/connect",', 'app.post("/api/whatsapp-lines/:id/disconnect",', lineConnectRoute, "ruta QR por línea");

  return patched;
}
