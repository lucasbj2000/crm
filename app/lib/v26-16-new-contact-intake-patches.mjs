function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.16 contactos nuevos: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.16 contactos nuevos: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

function replaceFirstAfter(source, startMarker, find, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V26.16 contactos nuevos: no se encontró inicio de ${label}.`);
  const index = source.indexOf(find, start);
  if (index < 0) throw new Error(`V26.16 contactos nuevos: no se encontró ${label}.`);
  return source.slice(0, index) + replacement + source.slice(index + find.length);
}

const identityReliabilityHelpers = String.raw`
if (!Array.isArray(data.pendingIncomingIdentity)) data.pendingIncomingIdentity = [];
const v2616PendingIdentityTimers = new Map();
const v2616IdentityRetryDelays = [10_000, 20_000, 40_000, 60_000, 120_000, 180_000, 300_000];

function v2616IdentityMessageIds(event) {
  return [...new Set((event?.messages || []).map((item) => cleanText(item?.key?.id, 200)).filter(Boolean))];
}

function v2616IdentityKey(event) {
  return v2616IdentityMessageIds(event).sort().join("|") || makeId("pendingidentity");
}

function v2616SerializableEvent(event) {
  try {
    return JSON.parse(JSON.stringify({
      type: cleanText(event?.type || "notify", 40) || "notify",
      requestId: cleanText(event?.requestId, 200) || undefined,
      messages: Array.isArray(event?.messages) ? event.messages : [],
    }));
  } catch {
    return null;
  }
}

function v2616RemovePendingIdentity(key) {
  const timer = v2616PendingIdentityTimers.get(key);
  if (timer) clearTimeout(timer);
  v2616PendingIdentityTimers.delete(key);
  const before = data.pendingIncomingIdentity.length;
  data.pendingIncomingIdentity = data.pendingIncomingIdentity.filter((row) => row.key !== key);
  if (data.pendingIncomingIdentity.length !== before) void store.save().catch(() => {});
}

function v2616PersistPendingIdentity(event, options = {}, attempt = 0) {
  const key = v2616IdentityKey(event);
  const serializable = v2616SerializableEvent(event);
  if (!serializable) return null;
  let row = data.pendingIncomingIdentity.find((entry) => entry.key === key);
  if (!row) {
    row = {
      key,
      event: serializable,
      options: {
        branchId: cleanText(options.branchId, 160) || null,
        lineId: cleanText(options.lineId, 160) || null,
        history: options.history === true,
      },
      attempts: 0,
      createdAt: timestamp(),
      updatedAt: timestamp(),
      nextRetryAt: null,
    };
    data.pendingIncomingIdentity.unshift(row);
    if (data.pendingIncomingIdentity.length > 100) data.pendingIncomingIdentity.splice(100);
  }
  row.event = serializable;
  row.options = { ...row.options, branchId: cleanText(options.branchId, 160) || null, lineId: cleanText(options.lineId, 160) || null, history: options.history === true };
  row.attempts = Math.max(Number(row.attempts) || 0, Number(attempt) || 0);
  row.updatedAt = timestamp();
  return row;
}

function v2616ScheduleIdentityRetry(event, options = {}) {
  const key = v2616IdentityKey(event);
  let row = v2616PersistPendingIdentity(event, options);
  if (!row) return false;
  if (v2616PendingIdentityTimers.has(key)) return true;
  if (Number(row.attempts || 0) >= v2616IdentityRetryDelays.length) return false;
  const index = Math.min(Number(row.attempts || 0), v2616IdentityRetryDelays.length - 1);
  const delay = v2616IdentityRetryDelays[index];
  row.attempts = Number(row.attempts || 0) + 1;
  row.nextRetryAt = new Date(Date.now() + delay).toISOString();
  row.updatedAt = timestamp();
  void store.save().catch(() => {});
  const timer = setTimeout(async () => {
    v2616PendingIdentityTimers.delete(key);
    const current = data.pendingIncomingIdentity.find((entry) => entry.key === key);
    if (!current) return;
    try {
      const ok = await v2611QueueIncoming(current.event, current.options || {});
      if (ok) v2616RemovePendingIdentity(key);
    } catch (error) {
      console.warn("[V26.16 identidad pendiente]", error?.message || error);
      v2616ScheduleIdentityRetry(current.event, current.options || {});
    }
  }, delay);
  timer.unref?.();
  v2616PendingIdentityTimers.set(key, timer);
  return true;
}

function v2616ResumePendingIdentity() {
  for (const row of (data.pendingIncomingIdentity || []).slice(0, 100)) {
    if (!row?.key || !row?.event) continue;
    if (v2616IdentityMessageIds(row.event).some((id) => v2611CommunicationRecorded(id))) {
      v2616RemovePendingIdentity(row.key);
      continue;
    }
    v2616ScheduleIdentityRetry(row.event, row.options || {});
  }
}

async function v2616ResolveLidWithRetry(jid, branchId = null, lineId = null) {
  const waits = [0, 120, 350, 800, 1600, 3200];
  for (const wait of waits) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    const mapped = await pnJidForLid(jid, branchId, lineId);
    if (mapped) return mapped;
  }
  return "";
}

const v2616ResumeTimer = setTimeout(() => v2616ResumePendingIdentity(), 5_000);
v2616ResumeTimer.unref?.();
`;

export function applyV2616NewContactIntakePatches(source) {
  let patched = source;

  patched = replaceOnce(
    patched,
    "async function pnJidForLid(jid, branchId = null) {",
    "async function pnJidForLid(jid, branchId = null, lineId = null) {",
    "firma de resolución LID",
  );

  patched = replaceFirstAfter(
    patched,
    "async function pnJidForLid(jid, branchId = null, lineId = null) {",
    "const socket = branchSocket(branchId || primaryBranchId());",
    "const socket = lineSocket(lineId) || branchSocket(branchId || primaryBranchId());",
    "socket correcto para LID",
  );

  patched = replaceOnce(
    patched,
    "async function canonicalClientJidFromMessage(item, branchId = null) {",
    "async function canonicalClientJidFromMessage(item, branchId = null, lineId = null) {",
    "firma de identidad entrante",
  );

  patched = replaceFirstAfter(
    patched,
    "async function canonicalClientJidFromMessage(item, branchId = null, lineId = null) {",
    "    const mapped = await pnJidForLid(candidate, branchId);",
    "    const mapped = await v2616ResolveLidWithRetry(candidate, branchId, lineId);",
    "reintento de mapeo LID para contacto nuevo",
  );

  patched = replaceOnce(
    patched,
    "const v2611IncomingQueues = new Map();",
    "const v2611IncomingQueues = new Map();\n" + identityReliabilityHelpers.trim(),
    "cola persistente de identidad",
  );

  patched = replaceFirstAfter(
    patched,
    "async function handleIncomingMessages(event, { history = false, branchId = null, lineId = null } = {}) {",
    "const jid = await canonicalClientJidFromMessage(item, branchId);",
    "const jid = await canonicalClientJidFromMessage(item, branchId, lineId);",
    "resolución por línea real",
  );

  patched = replaceFirstAfter(
    patched,
    "async function handleIncomingMessages(event, { history = false, branchId = null, lineId = null } = {}) {",
    "    if (\n      !isDirectChat(jid) ||",
    "    if (isLidJid(jid) && !isPhoneNumberJid(jid)) {\n      const identityError = new Error(\"WhatsApp entregó un contacto nuevo como LID y todavía no publicó su número. El CRM lo mantendrá pendiente y lo reintentará automáticamente.\");\n      identityError.code = \"V2616_LID_PENDING\";\n      identityError.messageId = messageId;\n      identityError.lineId = lineId;\n      identityError.branchId = branchId;\n      throw identityError;\n    }\n    if (\n      !isDirectChat(jid) ||",
    "barrera contra contacto LID sin teléfono",
  );

  patched = replaceFirstAfter(
    patched,
    "async function v2611ProcessIncoming(event, options = {}) {",
    "  for (const id of ids.filter((value) => !v2611CommunicationRecorded(value))) {",
    "  if (lastError?.code === \"V2616_LID_PENDING\" && v2616ScheduleIdentityRetry(event, options)) {\n    addLog(\"WhatsApp: llegó un contacto nuevo cuya identidad todavía no fue publicada por WhatsApp. El mensaje quedó en recuperación automática y NO se descartó.\", \"warning\");\n    await store.save().catch(() => {});\n    return false;\n  }\n  for (const id of ids.filter((value) => !v2611CommunicationRecorded(value))) {",
    "rescate persistente después de reintentos inmediatos",
  );

  patched = replaceFirstAfter(
    patched,
    "function connectionState() {",
    "watchdog: cloud ? null : v2615PublicHealth(v2615PrimaryHealth),",
    "watchdog: cloud ? null : v2615PublicHealth(v2615PrimaryHealth),\n    pendingNewContacts: Number((data.pendingIncomingIdentity || []).length),",
    "diagnóstico de contactos pendientes",
  );

  return patched;
}
