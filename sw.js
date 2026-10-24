const CACHE_NAME = "scrabbleren-v19";
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css?v=17",
  "./app.js?v=19",
  "./worker.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./data/words.txt",
  "./data/alphagrams.json",
  "./licenses/OPENTAAL-LICENSE.txt",
  "./licenses/OPENTAAL-HUNSPELL-LICENSE.txt",
  "./licenses/README.txt"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("scrabbleren-") && key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  })));
});
