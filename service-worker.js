// PWA cache minimal : offline after first load.
const CACHE_NAME = "casino-crush-pwa-v8";

const ASSETS = [
  "./",
  "./index.html",
  "./tower.html",
  "./styles.css",
  "./app.js",
  "./tower.js",
  "./manifest.webmanifest",
  "./service-worker.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",

  // Slots sprites (si présents)
  "./assets/sprites/cherry.png",
  "./assets/sprites/lemon.png",
  "./assets/sprites/dice.png",
  "./assets/sprites/chip.png",
  "./assets/sprites/card.png",
  "./assets/sprites/diamond.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

