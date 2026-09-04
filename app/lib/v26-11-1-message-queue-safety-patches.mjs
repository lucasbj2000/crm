function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.11.1 colas: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.11.1 colas: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

export function applyV26111MessageQueueSafetyPatches(source) {
  let patched = source;
  patched = replaceOnce(
    patched,
    '  void next.finally(() => { if (v2611IncomingQueues.get(key) === next) v2611IncomingQueues.delete(key); });',
    '  void next.then(() => { if (v2611IncomingQueues.get(key) === next) v2611IncomingQueues.delete(key); }, () => { if (v2611IncomingQueues.get(key) === next) v2611IncomingQueues.delete(key); });',
    "limpieza segura de cola entrante",
  );
  patched = replaceOnce(
    patched,
    '  void next.finally(() => { if (v2611OutgoingQueues.get(key) === next) v2611OutgoingQueues.delete(key); });',
    '  void next.then(() => { if (v2611OutgoingQueues.get(key) === next) v2611OutgoingQueues.delete(key); }, () => { if (v2611OutgoingQueues.get(key) === next) v2611OutgoingQueues.delete(key); });',
    "limpieza segura de cola saliente",
  );
  return patched;
}
