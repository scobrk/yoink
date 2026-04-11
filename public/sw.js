// ===== Cabo an der Riss — Service Worker =====
const CACHE = 'cabo-cards-v1';

// All card images to precache on install
const CARD_IMAGES = Array.from({ length: 14 }, (_, i) => `/images/cards/${i}.jpg`);

// ── Install: precache card images immediately ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CARD_IMAGES))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: drop old cache versions ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for images, network-first for everything else ──
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/images/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        });
      })
    );
  }
  // All other requests go straight to the network so code updates
  // (JS, CSS, HTML) are always fresh.
});
