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

  // Las presentaciones automáticas nunca deben contabilizarse como respuesta humana.
  patched = replaceOnce(
    patched,
    `    recordHumanOutgoing(data, {
      jid: deal.jid,
      name: deal.name,
      text: intro,
      messageId: introMessageId,
      userId: owner?.id || null,
      userName: owner?.name || localBranch.name,
      branchId: localBranch.id,
      now: occurredAt,
    });
    deal.stage = STAGES.CONTACTED;
    deal.botActive = false;`,
    `    recordBotOutgoing(data, {
      deal,
      text: intro,
      messageId: introMessageId,
      origin: "transfer-intro",
      now: occurredAt,
    });
    deal.botActive = false;`,
    "presentación automática de transferencia entrante",
  );

  patched = replaceOnce(
    patched,
    `        recordHumanOutgoing(data, { jid: targetDeal.jid, text: intro, messageId, userId: targetOwner?.id || actor.id, userName: targetOwner?.name || actor.name, branchId: targetBranch.id, lineId:targetDeal.lineId||targetLine?.id||null });
        targetDeal.stage = STAGES.CONTACTED;
        targetDeal.lastMessage = intro;`,
    `        recordBotOutgoing(data, { deal: targetDeal, text: intro, messageId, origin: "transfer-intro" });
        targetDeal.lastMessage = intro;`,
    "presentación automática de transferencia manual",
  );

  return patched + "\n" + SERVER_MARKER + "\n";
}
