import { applyV269AccessControlPatches } from "./v26-9-access-control-patches.mjs";

export function applyV269AccessControlStable(source) {
  const marker = "function userCanAccessBranch(user, branchId) {";
  const index = source.indexOf(marker);
  if (index < 0) throw new Error("V26.9 acceso: no se encontró el punto estable de alcance por sucursal.");
  if (source.indexOf(marker, index + marker.length) >= 0) throw new Error("V26.9 acceso: el punto estable de alcance por sucursal aparece más de una vez.");

  const shim = [
    "function v269AccessAnchorShim(request, response, next) {",
    "  const user = currentUser(request);",
    "  request.currentUser = user;",
    "  return next();",
    "}",
    "",
    "",
  ].join("\n");

  return applyV269AccessControlPatches(source.slice(0, index) + shim + source.slice(index));
}
