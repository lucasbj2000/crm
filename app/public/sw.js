// Compatibilidad de regresión preservada: whatsbot-mobile-v25-4-2-production-shell
// Compatibilidad V25.5 preservada: whatsbot-mobile-v25-5-production-shell
// Compatibilidad V25.6 preservada: whatsbot-mobile-v25-6-production-shell
// Compatibilidad V25.7 preservada: whatsbot-mobile-v25-7-production-shell
// Compatibilidad V25.7.1 preservada: whatsbot-mobile-v25-7-1-production-shell
// Compatibilidad V25.7.2 preservada: whatsbot-mobile-v25-7-2-production-shell
// Compatibilidad V25.8 preservada: whatsbot-mobile-v25-8-production-shell
// Compatibilidad V25.8.1 preservada: whatsbot-mobile-v25-8-1-production-shell
// Compatibilidad V25.9 preservada: whatsbot-mobile-v25-9-production-shell
// Compatibilidad V25.10 preservada: whatsbot-mobile-v25-10-production-shell
// Compatibilidad V25.11 preservada: whatsbot-mobile-v25-11-production-shell
// Compatibilidad V25.12 preservada: whatsbot-mobile-v25-12-production-shell
// Compatibilidad V26.1 preservada: whatsbot-mobile-v26-1-production-shell
// Compatibilidad V26.1.1 preservada: whatsbot-mobile-v26-1-1-production-shell
// Compatibilidad V26.2 preservada: whatsbot-mobile-v26-2-production-shell
// Compatibilidad V26.2.1 preservada: whatsbot-mobile-v26-2-1-production-shell
// Compatibilidad V26.3 preservada: whatsbot-mobile-v26-3-production-shell
// Compatibilidad V26.4 preservada: whatsbot-mobile-v26-4-production-shell
// Compatibilidad V26.5 preservada: whatsbot-mobile-v26-5-production-shell
// Compatibilidad V26.6 preservada: whatsbot-mobile-v26-6-production-shell
// Compatibilidad V26.7 preservada: whatsbot-mobile-v26-7-production-shell
// Compatibilidad V26.8 preservada: whatsbot-mobile-v26-8-production-shell
// Compatibilidad V26.9 preservada: whatsbot-mobile-v26-9-production-shell
// Compatibilidad V26.10 preservada: whatsbot-mobile-v26-10-production-shell
// Compatibilidad V26.14 preservada: whatsbot-mobile-v26-14-performance-shell
// Compatibilidad V26.17 preservada: whatsbot-mobile-v26-17-message-attachments-shell
// Compatibilidad V26.18.1 preservada: whatsbot-mobile-v26-18-1-fetch-stability-shell
// Compatibilidad V26.18.2 preservada: whatsbot-mobile-v26-18-2-chat-stability-shell
// Compatibilidad V26.46 preservada: whatsbot-mobile-v26-46-complete-mobile-recontact
const CACHE = "whatsbot-mobile-v26-51-agent-mobile-inbox";
const SHELL = ["/", "/styles.css", "/v20.css", "/v20-1.css", "/v20-2.css", "/v20-3.css", "/v21.css", "/v21-1.css", "/v21-2.css", "/v21-3.css", "/v21-4.css", "/v21-5.css", "/v21-6.css",
  "/v21-8.css", "/app.js", "/v20.js", "/v20-1.js", "/v20-2.js", "/v20-3.js", "/v21.js", "/v21-1.js", "/v21-2.js", "/v21-3.js", "/v21-4.js", "/v21-6.js",
  "/v21-7.js", "/v22.css", "/v23-1.css", "/v22.js", "/v24.css", "/v24.js", "/v24-1.css", "/v24-1.js", "/v25.css", "/v25-2-1.js", "/v25-3.css", "/v25-3.js", "/v25.js", "/v25-4.css", "/v25-4-2.css", "/v25-4.js", "/v25-4-1.js", "/v25-5.css", "/v25-5.js", "/v25-6.css", "/v25-6.js", "/v25-7.css", "/v25-7.js", "/v25-7-core.js", "/v25-8.css", "/v25-8.js", "/v25-8-1.js", "/v25-9.css", "/v25-9.js", "/v25-10.css", "/v25-10.js", "/v25-11.css", "/v25-11.js", "/v25-12.js", "/v26-1.css", "/v26-1.js", "/v26-2.css", "/v26-2.js", "/v26-3.js", "/v26-4.css", "/v26-4.js", "/v26-6.css", "/v26-6.js", "/v26-7.js", "/v26-8.js", "/v26-9.css", "/v26-9.js", "/v26-10.css", "/v26-10.js", "/v26-14.css", "/v26-14.js", "/v26-17.js", "/v26-18-1.js", "/v26-18-2.js", "/form-public.css", "/form-public.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
const STATIC_PATHS = new Set(SHELL.filter((path) => path !== "/"));
const NETWORK_FIRST_STATIC = new Set([
  "/app.js",
  "/v26-2.js",
  "/v26-6.js",
  "/v26-7.js",
  "/v26-18-1.js",
  "/v26-18-2.js",
]);

self.addEventListener("install", (event) => event.waitUntil(
  caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
));

self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
));

async function networkFirst(request, fallbackPath = "/") {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response?.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || cache.match(fallbackPath);
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then(async (response) => {
    if (response?.ok) await cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  if (cached) {
    void refresh;
    return cached;
  }
  return (await refresh) || cache.match("/");
}


self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let notification = null;
    try {
      const response = await fetch("/api/push/notifications/next", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        notification = payload?.notification || null;
      }
    } catch {}
    const title = notification?.title || "ICIIA CRM";
    const body = notification?.body || "Tenés una nueva actividad en el CRM.";
    const dealId = notification?.dealId || null;
    await self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: notification?.id ? "iciia-" + notification.id : "iciia-activity",
      renotify: true,
      requireInteraction: notification?.kind === "new_lead",
      data: { dealId, notificationId: notification?.id || null },
      actions: [{ action: "open", title: "Abrir CRM" }],
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const dealId = event.notification?.data?.dealId || null;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const current = windows[0] || null;
    if (current) {
      await current.focus();
      if (dealId) current.postMessage({ type: "ICIIA_OPEN_DEAL", dealId });
      return;
    }
    const target = dealId ? "/?deal=" + encodeURIComponent(dealId) : "/";
    await self.clients.openWindow(target);
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request));
    return;
  }
  if (NETWORK_FIRST_STATIC.has(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  if (STATIC_PATHS.has(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
  event.respondWith(networkFirst(event.request));
});
