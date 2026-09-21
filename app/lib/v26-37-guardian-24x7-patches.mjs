function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.37 guardian app: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.37 guardian app: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceFirstAfter(source, startMarker, find, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.37 guardian app: no se encontró inicio de ${label}.`);
  const index = source.indexOf(find, start);
  if (index < 0) throw new Error(`V26.37 guardian app: no se encontró ${label}.`);
  return source.slice(0, index) + replacement + source.slice(index + find.length);
}

const guardianHelpers = String.raw`
const v2637QrSupervisorState = {
  lastRunAt: null,
  recoveries: 0,
  lastRecoveryAt: null,
  lastRecoveryTarget: null,
  lastError: null,
};

function v2637PrimaryCredentialsExist() {
  return existsSync(path.join(authDirectory, "creds.json"));
}

function v2637BranchCredentialsExist(branchId) {
  return Boolean(branchId && existsSync(path.join(branchAuthRoot, branchId, "creds.json")));
}

function v2637LineCredentialsExist(lineId) {
  return Boolean(lineId && existsSync(path.join(lineAuthRoot, lineId, "creds.json")));
}

function v2637MarkRecovery(target) {
  v2637QrSupervisorState.recoveries += 1;
  v2637QrSupervisorState.lastRecoveryAt = timestamp();
  v2637QrSupervisorState.lastRecoveryTarget = String(target || "");
  v2637QrSupervisorState.lastError = null;
}

async function v2637EnsureQrRuntime() {
  if (mockMode) return;
  v2637QrSupervisorState.lastRunAt = timestamp();
  try {
    if (data.settings.whatsappMode !== "cloud" && v2637PrimaryCredentialsExist() && !manualLogout) {
      if (!["connected", "starting", "qr"].includes(connectionStatus)) {
        v2637MarkRecovery("principal");
        addLog("Guardian 24/7: reactivando WhatsApp principal sin depender de usuarios conectados.", "warning");
        await startConnection();
      }
    }

    for (const branch of data.branches || []) {
      if (!branch?.id || branch.id === primaryBranchId() || branch.active === false) continue;
      if (!v2637BranchCredentialsExist(branch.id)) continue;
      const runtime = extraBranchRuntime(branch.id);
      if (runtime.manualLogout) continue;
      if (!["connected", "starting", "qr"].includes(runtime.status)) {
        v2637MarkRecovery("sucursal:" + branch.id);
        addLog("Guardian 24/7: reactivando WhatsApp de " + (branch.name || branch.id) + ".", "warning");
        await startExtraBranchConnection(branch.id);
      }
    }

    for (const line of data.whatsappLines || []) {
      if (!line?.id || line.active === false || line.legacyBranchSession || line.provider !== "qr") continue;
      if (!v2637LineCredentialsExist(line.id)) continue;
      const runtime = extraLineRuntime(line.id);
      if (runtime.manualLogout) continue;
      if (!["connected", "starting", "qr"].includes(runtime.status)) {
        v2637MarkRecovery("linea:" + line.id);
        addLog("Guardian 24/7: reactivando " + (line.name || "línea WhatsApp") + ".", "warning");
        await startWhatsappLineConnection(line.id);
      }
    }
  } catch (error) {
    v2637QrSupervisorState.lastError = cleanText(error?.message || error, 500);
    console.error("[guardian 24/7 whatsapp]", error?.message || error);
  }
}

const v2637QrSupervisorTimer = setInterval(() => { void v2637EnsureQrRuntime(); }, 30_000);
v2637QrSupervisorTimer.unref?.();
const v2637QrSupervisorInitial = setTimeout(() => { void v2637EnsureQrRuntime(); }, 12_000);
v2637QrSupervisorInitial.unref?.();
`;

export function applyV2637GuardianAppPatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    "const surveyTimer = setInterval(() => void runSurveyAutomation(), 30_000);",
    guardianHelpers + "\nconst surveyTimer = setInterval(() => void runSurveyAutomation(), 30_000);",
    "supervisor QR permanente",
  );

  patched = replaceOnce(
    patched,
    'app.get("/api/health", (_request, response) => {\n  response.json({ ok: true, mockMode });\n});',
    'app.get("/api/health", (_request, response) => {\n  response.json({ ok: true, mockMode, tenant: tenantSlug, uptimeSeconds: Math.floor(process.uptime()), guardian: { lastRunAt: v2637QrSupervisorState.lastRunAt, recoveries: v2637QrSupervisorState.recoveries, lastRecoveryAt: v2637QrSupervisorState.lastRecoveryAt, lastRecoveryTarget: v2637QrSupervisorState.lastRecoveryTarget, lastError: v2637QrSupervisorState.lastError } });\n});',
    "health del tenant con guardian",
  );

  patched = replaceFirstAfter(
    patched,
    "async function shutdown() {",
    "  clearTimeout(reconnectTimer);",
    "  clearInterval(v2637QrSupervisorTimer);\n  clearTimeout(v2637QrSupervisorInitial);\n  clearTimeout(reconnectTimer);",
    "apagado limpio del supervisor",
  );

  return patched;
}
