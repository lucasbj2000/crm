// Compatibilidad de regresión preservada: whatsbot-mobile-v25-4-2-production-shell
// Compatibilidad V25.5 preservada: whatsbot-mobile-v25-5-production-shell
// Compatibilidad V25.6 preservada: whatsbot-mobile-v25-6-production-shell
// Compatibilidad V25.7 preservada: whatsbot-mobile-v25-7-production-shell
// Compatibilidad V25.7.1 preservada: whatsbot-mobile-v25-7-1-production-shell
const CACHE = "whatsbot-mobile-v25-7-2-production-shell";
const SHELL = ["/", "/styles.css", "/v20.css", "/v20-1.css", "/v20-2.css", "/v20-3.css", "/v21.css", "/v21-1.css", "/v21-2.css", "/v21-3.css", "/v21-4.css", "/v21-5.css", "/v21-6.css",
  "/v21-8.css", "/app.js", "/v20.js", "/v20-1.js", "/v20-2.js", "/v20-3.js", "/v21.js", "/v21-1.js", "/v21-2.js", "/v21-3.js", "/v21-4.js", "/v21-6.js",
  "/v21-7.js", "/v22.css", "/v23-1.css", "/v22.js", "/v24.css", "/v24.js", "/v24-1.css", "/v24-1.js", "/v25.css", "/v25-2-1.js", "/v25-3.css", "/v25-3.js", "/v25.js", "/v25-4.css", "/v25-4-2.css", "/v25-4.js", "/v25-4-1.js", "/v25-5.css", "/v25-5.js", "/v25-6.css", "/v25-6.js", "/v25-7.css", "/v25-7.js", "/v25-7-core.js", "/form-public.css", "/form-public.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).then((response) => {
    const clone = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, clone));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))));
});
