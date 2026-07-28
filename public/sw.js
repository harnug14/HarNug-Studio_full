// Service Worker minimal — hanya untuk memenuhi syarat "installable PWA" di Chrome.
// Tidak melakukan caching kompleks, hanya pass-through semua request.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
