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

  let patched = applyV269AccessControlPatches(source.slice(0, index) + shim + source.slice(index));

  const middlewareStartText = "app.use((request, response, next) => {\n  const pathname = String(request.path || \"\");\n  if (!pathname.startsWith(\"/api/\")) return next();\n  const user = currentUser(request);";
  const middlewareStart = patched.indexOf(middlewareStartText);
  if (middlewareStart < 0) throw new Error("V26.9 acceso: no se encontró la barrera de seguridad generada.");
  const middlewareEndMarker = "\n});\n";
  const middlewareEnd = patched.indexOf(middlewareEndMarker, middlewareStart);
  if (middlewareEnd < 0) throw new Error("V26.9 acceso: no se pudo cerrar la barrera de seguridad generada.");
  const middleware = patched.slice(middlewareStart, middlewareEnd + middlewareEndMarker.length);
  patched = patched.slice(0, middlewareStart) + patched.slice(middlewareEnd + middlewareEndMarker.length);

  const appMarker = "const app = express();";
  const appIndex = patched.indexOf(appMarker);
  if (appIndex < 0) throw new Error("V26.9 acceso: no se encontró la inicialización de Express.");
  if (patched.indexOf(appMarker, appIndex + appMarker.length) >= 0) throw new Error("V26.9 acceso: la inicialización de Express aparece más de una vez.");
  const insertAt = appIndex + appMarker.length;
  patched = patched.slice(0, insertAt) + "\n\n" + middleware.trimEnd() + "\n" + patched.slice(insertAt);

  return patched;
}
