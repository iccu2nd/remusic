// Minimal SW — keeps app installable; audio itself uses Media Session + YT iframe
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', e => {
  // Network-first for API, cache-first not needed for this lightweight app
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
