// Service Worker for Kinopy Companion PWA
const CACHE_NAME = "companion-pwa-v3";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./assets/icon.png",
  "./assets/icon.jpg",
  "./assets/kinopy.jpg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("Service Worker cache install warning:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // APIリクエスト（Gemini, Google Sheets, VOICEVOX Web API）はキャッシュせず直接通信
  if (
    e.request.url.includes("googleapis.com") ||
    e.request.url.includes("google.com") ||
    e.request.url.includes("tts.quest")
  ) {
    return;
  }

  // 静的ファイルはネットワーク優先で最新を取得、オフライン時はキャッシュ
  e.respondWith(
    fetch(e.request)
      .then((networkRes) => {
        if (networkRes.ok && e.request.method === "GET") {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        }
        return networkRes;
      })
      .catch(() => caches.match(e.request))
  );
});
