import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyV2617ChatRefreshPatches } from "../lib/v26-17-chat-refresh-patches.mjs";
import { applyV2625CoreUiPatches } from "../lib/v26-25-agent-messaging-ux-patches.mjs";
import { applyV2626CoreUiPatches } from "../lib/v26-26-messaging-scroll-draft-fix-patches.mjs";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
let patched = applyV2617ChatRefreshPatches(app);
patched = applyV2625CoreUiPatches(patched);
patched = applyV2626CoreUiPatches(patched);

assert.match(patched, /V26\.26 MESSAGING_SCROLL_DRAFT_FIX/, "Debe aplicar V26.26.");
assert.match(patched, /v2626CancelPendingDrawerAutoScroll/, "Debe cancelar autoscroll pendiente cuando el agente interactúa.");
assert.match(patched, /addEventListener\("wheel", cancelPending, \{ passive: true \}\)/, "La rueda debe conservar scroll nativo y solo cancelar autoscroll pendiente.");
assert.doesNotMatch(patched, /wheel[\s\S]{0,180}preventDefault\(/, "V26.26 no debe interceptar la rueda con preventDefault.");
assert.match(patched, /overflow-y:auto!important/, "El historial debe seguir siendo un área desplazable.");
assert.match(patched, /touch-action:pan-y!important/, "Debe permitir desplazamiento táctil vertical.");
assert.match(patched, /sessionStorage\.removeItem\(v2625DraftKey\("deal-draft", String\(dealId \|\| ""\)\)\)/, "Debe limpiar el borrador de la negociación antes de actualizar el estado.");
assert.match(patched, /v2626PrepareDraftForSend/, "Debe limpiar preventivamente el borrador al enviar.");
assert.match(patched, /v2626TrackSendCompletion/, "Debe restaurar el borrador únicamente si el envío falla y el texto sigue presente.");

const first = patched.indexOf("V26.25 AGENT_MESSAGING_EXPERIENCE");
const second = patched.indexOf("V26.26 MESSAGING_SCROLL_DRAFT_FIX");
assert.ok(first >= 0 && second > first, "V26.26 debe ejecutarse después de V26.25.");

console.log("V26.26 messaging scroll/draft smoke OK");
