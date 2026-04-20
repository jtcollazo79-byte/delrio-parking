const CACHE = "delrio-v8.0";
const FILES = [
  "./",
  "./index.html",
  "./styles-v3.css",
  "./app-v3.js",
  "./manifest.json",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"
];

// Install: cache files, skip waiting
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES))
  );
  self.skipWaiting();
});

// Activate: delete old caches, claim all clients immediately
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network first, fallback to cache
self.addEventListener("fetch", (e) => {
  // Only cache same-origin and firebase CDN
  const url = new URL(e.request.url);
  const isCacheable = url.origin === self.location.origin || 
    url.hostname.includes("gstatic.com");
  
  if (!isCacheable || e.request.method !== "GET") {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
