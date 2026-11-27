// Service worker: keeps the whole app available offline.
// Network first (so a deploy shows up on the next open), falling back to the cache after 3 s or when offline.
// Bump CACHE whenever a file in SHELL changes; tools/check.mjs enforces this.
const CACHE = 'advent-2026-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'calendar.js',
  'logos-refs.js',
  'app.js',
  'manifest.webmanifest',
  'img/nativity.jpg',
  'img/bibleproject-white.png',
  'img/icon.svg',
  'img/icon-180.png',
  'img/icon-192.png',
  'img/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((p) => new Request(p, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
    } catch (e) { /* offline: fall back to the cache */ }
    const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (cached) return cached;
    return network;
  })());
});
