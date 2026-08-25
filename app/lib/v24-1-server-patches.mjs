function replaceOne(source, pattern, replacement, label) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) {
    throw new Error(`V24.1 patch "${label}" esperaba 1 coincidencia y encontró ${matches.length}.`);
  }
  return source.replace(pattern, replacement);
}

export function applyV241ServerPatches(source) {
  let out = source;

  // Baileys puede entregar un estado con remoteJid=status@broadcast y además
  // participant/participantAlt con el número del cliente. Si canonicalizamos primero,
  // ese participant puede convertirse en un chat directo. Se corta antes de resolver JIDs.
  out = replaceOne(
    out,
    /const rawJid = item\.key\?\.remoteJid \|\| "";\n    const jid = await canonicalClientJidFromMessage\(item, branchId\);/,
    `const rawJid = item.key?.remoteJid || "";\n    if (rawJid === "status@broadcast" || rawJid.endsWith("@broadcast")) continue;\n    const jid = await canonicalClientJidFromMessage(item, branchId);`,
    "ignorar estados antes de canonicalizar",
  );

  return out;
}
