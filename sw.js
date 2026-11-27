// Service worker: keeps the whole app available offline.
// Network first (so a deploy shows up on the next open), falling back to the cache after 3 s or when offline.
// Bump CACHE whenever a file in SHELL changes; tools/check.mjs enforces this.
const CACHE = 'advent-2026-v7';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'calendar.js',
  'logos-refs.js',
  'app.js',
  'reminder.js',
  'manifest.webmanifest',
  'img/nativity.jpg',
  'img/bibleproject-white.png',
  'img/stars.svg',
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

// Daily Reminder from the advent-remind function. Safari requires every push to
// show a notification, so fall back to a generic one if the payload is unreadable.
self.addEventListener('push', (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch (e) { /* unreadable */ }
  const text = (v, fallback, max) => (typeof v === 'string' && v ? v.slice(0, max) : fallback);
  const date = typeof msg.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(msg.date) ? msg.date : '';
  event.waitUntil(self.registration.showNotification(text(msg.title, 'Advent', 80), {
    body: text(msg.body, 'Time for today\u2019s Advent reading.', 300),
    icon: 'img/icon-192.png',
    tag: 'advent', // a new Reminder replaces yesterday's if it's still there
    data: { date },
  }));
});

// Open the app on that Day. Always our own scope, never a URL from the payload.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const date = (event.notification.data && event.notification.data.date) || '';
  const url = self.registration.scope + (date ? '#' + date : '');
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) return open.navigate(url).then((c) => (c || open).focus()).catch(() => open.focus());
    return self.clients.openWindow(url);
  }));
});
