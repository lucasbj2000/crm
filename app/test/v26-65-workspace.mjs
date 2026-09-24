import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Repeated synchronization must not generate DOM mutations when user data is unchanged.
const source = await readFile(new URL('../public/v21-9.js', import.meta.url), 'utf8');
const sync = source.slice(source.indexOf('  function syncAccount()'), source.indexOf('  function toggleDensity()'));
let writes = 0;
const nodes = new Map();
for (const [id, initial] of Object.entries({
  'current-user-name': 'Ana López', 'current-user-role': 'Agente',
  'current-user-branch': 'Centro', 'v219-profile-avatar': '',
  'v219-account-avatar': '', 'v219-account-name': '', 'v219-account-meta': ''
})) {
  let value = initial;
  nodes.set('#' + id, { get textContent() { return value; }, set textContent(next) { writes++; value = next; } });
}
const context = vm.createContext({ q: (selector) => nodes.get(selector) });
vm.runInContext(sync + '\nsyncAccount();', context);
assert.equal(nodes.get('#v219-account-name').textContent, 'Ana López');
assert.equal(nodes.get('#v219-profile-avatar').textContent, 'AL');
const afterFirst = writes;
for (let i = 0; i < 20; i++) vm.runInContext('syncAccount()', context);
assert.equal(writes, afterFirst, 'Idle profile sync must not trigger its own MutationObserver');
nodes.get('#current-user-name').textContent = 'María Ruiz';
vm.runInContext('syncAccount()', context);
assert.equal(nodes.get('#v219-profile-avatar').textContent, 'MR');
assert.equal(nodes.get('#v219-account-name').textContent, 'María Ruiz');

// Navigation can group CRM inside another element. Insert beside its real parent.
const contactsSource = await readFile(new URL('../public/v25-4.js', import.meta.url), 'utf8');
const contactsStart = contactsSource.indexOf('  function ensureContactsModule()');
const contactsEnd = contactsSource.indexOf('    const workspace =', contactsStart);
let inserted = false;
const sibling = {};
const group = { insertBefore(button, next) { assert.equal(next, sibling); assert.equal(button.dataset.v254ContactsNav, '1'); inserted = true; } };
const crm = { parentElement: group, nextSibling: sibling };
const nav = { insertBefore() { throw new Error('Wrong parent'); }, prepend() { throw new Error('Expected CRM group'); } };
vm.runInNewContext(contactsSource.slice(contactsStart, contactsEnd) + '\n}\nensureContactsModule();', {
  $v: selector => selector === '.nav-list' ? nav : selector === '[data-view="crm"]' ? crm : null,
  document: { createElement: () => ({ dataset: {} }) }
});
assert.ok(inserted, 'Contact navigation must initialize inside grouped menus');

// Exercise worker installation: every precached asset must exist and the new CSS must be included.
const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const events = new Map();
let assets;
const workerContext = vm.createContext({
  self: { addEventListener: (event, handler) => events.set(event, handler), skipWaiting() {} },
  caches: { open: async () => ({ addAll: async (paths) => { assets = paths; } }) },
  Set, URL
});
vm.runInContext(worker, workerContext);
let installed;
events.get('install')({ waitUntil: (promise) => { installed = promise; } });
await installed;
assert.ok(assets.includes('/v26-65-workspace.css'));
for (const asset of assets) {
  await readFile(new URL('../public/' + (asset === '/' ? 'index.html' : asset.slice(1)), import.meta.url));
}
console.log('OK · V26.65 perfil sin bucle, Contactos en menú agrupado y recursos PWA completos.');
