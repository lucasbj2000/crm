function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.59 media listener safety: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.59 media listener safety: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

const helpers = String.raw`
// V26.59 MEDIA_LISTENER_SAFETY
const v2659MediaRefreshState = new WeakMap();
const v2659MaxPendingRefreshesPerSocket = 2;
const v2659RefreshTimeoutMs = 7_000;

function v2659MediaRefreshKey(item) {
  const key = item?.key || {};
  return [
    String(key.remoteJid || ""),
    String(key.participant || ""),
    String(key.id || item?.messageTimestamp || ""),
  ].join("|");
}

function v2659SocketRefreshState(socket) {
  let state = v2659MediaRefreshState.get(socket);
  if (!state) {
    state = { pending: new Map(), skipped: 0 };
    v2659MediaRefreshState.set(socket, state);
  }
  return state;
}

function v2659StartOrReuseMediaRefresh(item, socket) {
  if (!socket || typeof socket.updateMediaMessage !== "function") return null;
  const state = v2659SocketRefreshState(socket);
  const key = v2659MediaRefreshKey(item);
  if (state.pending.has(key)) return state.pending.get(key);
  if (state.pending.size >= v2659MaxPendingRefreshesPerSocket) {
    state.skipped += 1;
    if (state.skipped === 1 || state.skipped % 25 === 0) {
      console.warn("[media refresh bounded] se omite un refresh para evitar listeners acumulados; pendientes:", state.pending.size);
    }
    return null;
  }

  let tracked = null;
  const operation = Promise.resolve()
    .then(() => socket.updateMediaMessage(item))
    .then(
      (refreshed) => refreshed?.message ? refreshed : item,
      (error) => {
        console.warn("[media refresh operation]", error?.message || error);
        return item;
      },
    );

  tracked = operation.finally(() => {
    const current = state.pending.get(key);
    if (current === tracked) state.pending.delete(key);
  });
  tracked.catch(() => {});
  state.pending.set(key, tracked);
  return tracked;
}

async function v2659AwaitMediaRefresh(item, socket) {
  const operation = v2659StartOrReuseMediaRefresh(item, socket);
  if (!operation) return item;
  let timer = null;
  try {
    return await Promise.race([
      operation,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(item), v2659RefreshTimeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
`;

const oldRefresh = `async function v265RefreshMedia(item, sourceSocket) {
  if (!sourceSocket || typeof sourceSocket.updateMediaMessage !== "function") return item;
  try {
    const refreshed = await Promise.race([
      sourceSocket.updateMediaMessage(item),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout refrescando multimedia")), 7000)),
    ]);
    return refreshed?.message ? refreshed : item;
  } catch (error) {
    console.warn("[media refresh]", error?.message || error);
    return item;
  }
}`;

const newRefresh = `async function v265RefreshMedia(item, sourceSocket) {
  if (!sourceSocket || typeof sourceSocket.updateMediaMessage !== "function") return item;
  const refreshed = await v2659AwaitMediaRefresh(item, sourceSocket);
  if (refreshed === item) {
    const state = v2659MediaRefreshState.get(sourceSocket);
    if (state?.pending?.size) console.warn("[media refresh] refresh pendiente o agotó tiempo; se conserva el mensaje original.");
  }
  return refreshed?.message ? refreshed : item;
}`;

const oldReupload = `        reuploadRequest: async (message) => {
          if (!socket?.updateMediaMessage) return message;
          const refreshed = await socket.updateMediaMessage(message);
          const usable = refreshed?.message ? refreshed : message;
          workingItem = usable;
          return usable;
        },`;

const newReupload = `        reuploadRequest: async (message) => {
          if (!socket?.updateMediaMessage) return message;
          const usable = await v2659AwaitMediaRefresh(message, socket);
          workingItem = usable?.message ? usable : message;
          return workingItem;
        },`;

export function applyV2659MediaListenerSafetyPatches(source) {
  let patched = source;
  if (patched.includes("// V26.59 MEDIA_LISTENER_SAFETY")) return patched;

  patched = replaceOnce(
    patched,
    oldRefresh,
    helpers + "\n" + newRefresh,
    "v265RefreshMedia",
  );

  patched = replaceOnce(
    patched,
    oldReupload,
    newReupload,
    "reuploadRequest multimedia",
  );

  return patched;
}
