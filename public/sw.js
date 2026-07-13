const CACHE = "system-2026-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// network-first: świeża wersja gdy online, cache gdy offline
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(e.request);
        if (res && res.ok && new URL(e.request.url).origin === self.location.origin) {
          cache.put(e.request, res.clone());
        }
        return res;
      } catch {
        const cached = await cache.match(e.request);
        return cached || Response.error();
      }
    })
  );
});
