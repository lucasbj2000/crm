const MARKER = "// V26.29 AGENT_OWNERSHIP_UI";

function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  const last = source.lastIndexOf(find);
  if (first < 0) throw new Error(`V26.29 UI: no se encontró ${label}.`);
  if (first !== last) throw new Error(`V26.29 UI: ${label} aparece más de una vez.`);
  return source.slice(0, first) + replacement + source.slice(first + find.length);
}

export function applyV2629CoreUiPatches(source) {
  if (source.includes(MARKER)) return source;

  source = replaceOnce(
    source,
    `  const activeUsers = (appState.users || []).filter((entry) => entry.active !== false && entry.branchId === deal.branchId && (["admin", "manager", "supervisor"].includes(user.role) || entry.id === user.id));`,
    `  const activeUsers = (appState.users || []).filter((entry) => {\n    if (entry.active === false || entry.branchId !== deal.branchId) return false;\n    if (user.role === "admin") return true;\n    if (["manager", "supervisor"].includes(user.role)) return entry.role === "agent";\n    return entry.id === user.id;\n  });`,
    "selector de responsable",
  );

  return `${source}\n\n${MARKER}\n`;
}
