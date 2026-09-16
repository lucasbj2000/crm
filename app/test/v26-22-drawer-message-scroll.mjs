import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { applyV2617ChatRefreshPatches } from "../lib/v26-17-chat-refresh-patches.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(testDir, "..");
const source = await readFile(path.join(appDir, "public", "app.js"), "utf8");
const patched = applyV2617ChatRefreshPatches(source);

assert.match(patched, /function ensureDrawerMessageScrollArea\(\)/, "Debe preparar un área de scroll independiente para el drawer.");
assert.match(patched, /overflow-y:auto!important/, "El historial debe tener desplazamiento vertical real.");
assert.match(patched, /touch-action:pan-y/, "El historial debe permitir desplazamiento vertical también en touchpad y móvil.");
assert.match(patched, /align-content:start!important/, "Las burbujas deben comenzar arriba y no estirarse para ocupar la altura disponible.");
assert.match(patched, /grid-auto-rows:max-content!important/, "Cada fila de mensaje debe adaptarse al alto real de su contenido.");
assert.match(patched, /#drawer-messages>\.message\{align-self:start;height:auto!important;min-height:0!important\}/, "Cada burbuja debe conservar alto automático según su texto.");
assert.match(patched, /scroll-behavior:auto!important/, "El desplazamiento del drawer debe ser inmediato y nativo, sin animación que desplace el final.");
assert.doesNotMatch(patched, /wheelScrollBound/, "No debe interceptar manualmente la rueda del mouse.");
assert.match(patched, /function drawerMessagesMaxScroll\(list\)/, "Debe calcular explícitamente el final real del historial.");
assert.match(patched, /list\.scrollTop = drawerMessagesMaxScroll\(list\)/, "El autoscroll debe posicionarse exactamente en el máximo desplazamiento válido.");
assert.match(patched, /const appendedMessage = sameDeal/, "Debe detectar cuando llega un mensaje nuevo en la conversación abierta.");
assert.match(patched, /const shouldScrollBottom = force \|\| !sameDeal \|\| appendedMessage/, "Debe bajar al final al abrir o recibir un mensaje nuevo.");
assert.match(patched, /scrollDrawerMessagesToLatest\(messageList\)/, "Al abrir una negociación debe posicionarse en el último mensaje.");
assert.match(patched, /Math\.min\(drawerMessagesMaxScroll\(list\), preserved\)/, "Si no llega un mensaje nuevo debe conservar la lectura manual dentro de límites válidos.");

const generated = path.join(appDir, ".v26-22-drawer-scroll-check.js");
await writeFile(generated, patched, "utf8");
const syntax = spawnSync(process.execPath, ["--check", generated], { encoding: "utf8" });
await rm(generated, { force: true });
assert.equal(syntax.status, 0, `El app.js generado debe ser JavaScript válido: ${syntax.stderr || syntax.stdout}`);

console.log("OK · Drawer con burbujas autoajustadas y scroll nativo validado.");
