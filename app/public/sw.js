const CACHE = "whatsbot-mobile-v24-1-company-shell";
const SHELL = ["/", "/styles.css", "/v20.css", "/v20-1.css", "/v20-2.css", "/v20-3.css", "/v21.css", "/v21-1.css", "/v21-2.css", "/v21-3.css", "/v21-4.css", "/v21-5.css", "/v21-6.css",
  "/v21-8.css", "/app.js", "/v20.js", "/v20-1.js", "/v20-2.js", "/v20-3.js", "/v21.js", "/v21-1.js", "/v21-2.js", "/v21-3.js", "/v21-4.js", "/v21-6.js",
  "/v21-7.js", "/v22.css", "/v23-1.css", "/v22.js", "/v24.css", "/v24.js", "/v24-1.css", "/v24-1.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
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
