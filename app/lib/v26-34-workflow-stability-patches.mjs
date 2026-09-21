const SERVER_MARKER = "// V26.34 SESSION_STABILITY";

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`V26.34: no se encontró ${label}.`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`V26.34: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

export function applyV2634ServerPatches(source) {
  if (source.includes(SERVER_MARKER)) return source;
  let patched = source;

  // V25.6 sigue controlando sesión, bloqueo, cookie Secure y expiración absoluta.
  // V26.34 únicamente amplía sus ventanas para evitar cierres frecuentes.
  patched = replaceOnce(
    patched,
    "const V256_IDLE_SESSION_MS = 60 * 60 * 1000;",
    "const V256_IDLE_SESSION_MS = 7 * 24 * 60 * 60 * 1000;",
    "ventana de inactividad segura",
  );
  patched = replaceOnce(
    patched,
    "const V256_ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1000;",
    "const V256_ABSOLUTE_SESSION_MS = 7 * 24 * 60 * 60 * 1000;",
    "duración absoluta segura",
  );
  patched = replaceOnce(
    patched,
    "Max-Age=43200${v256SecureCookieSuffix(request)}",
    "Max-Age=604800${v256SecureCookieSuffix(request)}",
    "duración de cookie segura",
  );

  return patched + "\n" + SERVER_MARKER + "\n";
}
