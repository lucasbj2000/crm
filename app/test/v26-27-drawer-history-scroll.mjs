import assert from "node:assert/strict";
import { applyV2627CoreUiPatches } from "../lib/v26-27-drawer-history-scroll-patches.mjs";

const base = `// V26.26 MESSAGING_SCROLL_DRAFT_FIX\nconst ready = true;`;
const patched = applyV2627CoreUiPatches(base);

assert.match(patched, /V26\.27 DRAWER_HISTORY_SCROLL/, "Debe aplicar el marcador V26.27.");
assert.match(patched, /chat-only-section>\.drawer-section-title\{display:none!important\}/, "Debe ocultar el encabezado superior de conversación.");
assert.match(patched, /title\.remove\(\)/, "Debe retirar físicamente el encabezado del drawer.");
assert.match(patched, /classList\.remove\("v2625-focus-mode"\)/, "Debe limpiar el modo Solo conversación guardado.");
assert.match(patched, /overflow-y:scroll!important/, "El historial debe ser una zona de scroll vertical real.");
assert.match(patched, /touch-action:pan-y!important/, "El historial debe permitir desplazamiento táctil vertical.");
assert.match(patched, /list\.addEventListener\("wheel"/, "Debe capturar la rueda sobre el historial.");
assert.match(patched, /passive: false/, "La rueda debe poder controlar el scroll del contenedor.");
assert.match(patched, /event\.preventDefault\(\)/, "Debe evitar que la rueda se pierda en el contenedor padre cuando el historial puede desplazarse.");
assert.match(patched, /list\.scrollTop = next/, "La rueda debe modificar directamente la posición del historial.");
assert.match(patched, /v2626CancelPendingDrawerAutoScroll/, "El movimiento manual debe cancelar autoscrolls pendientes.");

assert.equal(applyV2627CoreUiPatches(patched), patched, "La capa V26.27 debe ser idempotente.");
console.log("V26.27 drawer history scroll smoke OK");
