const MARKER = "// V26.28 CORE_ESCAPE_FIX";
const BROKEN = String.raw`typeof v2628ActiveReplyMessageId === \"function\"`;
const FIXED = 'typeof v2628ActiveReplyMessageId === "function"';

export function applyV2628CoreFixPatches(source) {
  if (source.includes(MARKER)) return source;
  if (!source.includes(BROKEN)) throw new Error("V26.28 core fix: no se encontró el escape del payload de respuesta citada.");
  return source.replace(BROKEN, FIXED) + `\n\n${MARKER}\n`;
}
