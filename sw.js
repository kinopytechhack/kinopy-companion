// Service Worker for Kinopy Companion PWA (Cache Busting v20260914-0826)
const CACHE_NAME = "companion-pwa-v20260914-0826";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  // すべてのリクエストをネットワーク優先でフェッチ
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
