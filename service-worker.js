// service-worker.js

const CACHE_NAME = "casino-crush-pwa-v21";

// IMPORTANT:
// - Inclure ici seulement les fichiers servis depuis VOTRE domaine GitHub Pages (same-origin).
// - Ne PAS inclure les URLs Firebase CDN (https://www.gstatic.com/...) dans ASSETS.
const ASSETS = [
  "./",
  "./index.html",
  "./tower.html",
  "./signup.html",
  "./login.html",

  "./styles.css",

  // scripts
  "./app.js",
  "./tower.js",
  "./auth-ui.js",
  "./firebase-config.js",
  "./firebase-auth.js",
  "./credits.js",

  // PWA
  "./manifest.webmanifest",
  "./service-worker.js",

  // icons (adapte si tes chemins diffèrent)
"./icons/favicon.ico",
"./icons/icon-192.png",
"./icons/icon-512.png",
"./icons/favicon-32.png",
"./icons/favicon-16.png",
"./icons/apple-touch-icon.png"
];

// --- Install: pré-cache ---
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

// --- Activate: nettoyage des anciens caches ---
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
    );
    await self.clients.claim();
  })());
});

// Helpers
function isHtmlRequest(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

async function cachePutSafe(cache, request, response) {
  // Cache only successful basic responses (same-origin)
  if (!response || response.status !== 200 || response.type !== "basic") return;
  await cache.put(request, response);
}

// --- Fetch strategy ---
// - HTML: Network-first (reduce stale-page issues on GitHub Pages/PWA)
// - Static assets (css/js/png...): Cache-first
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Only same-origin requests (ignore Firebase CDN, etc.)
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML/navigation
  if (isHtmlRequest(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(req);
        // Update cache
        await cachePutSafe(cache, req, fresh.clone());
        return fresh;
      } catch (e) {
        // Offline / network fail → fallback cache
        const cached = await cache.match(req);
        if (cached) return cached;

        // Final fallback: index.html (si navigation)
        const fallback = await cache.match("./index.html");
        return fallback || new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })());
    return;
  }

  // Cache-first for other assets
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      await cachePutSafe(cache, req, fresh.clone());
      return fresh;
    } catch (e) {
      // If asset missing and offline
      return new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })());
});









