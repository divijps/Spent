// Offline support: answer from the cache right away, then refresh the cache in the
// background so the next launch picks up any update.
const CACHE = 'spent-v3';
const SHELL = [
  './',
  './style.css',
  './app.js',
  './lib.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const navigate = req.mode === 'navigate';
  const key = navigate ? self.registration.scope : url.origin + url.pathname;
  const fresh = fetch(navigate ? key : req, { cache: 'no-cache' }).then(async (res) => {
    if (res.ok && res.type === 'basic') {
      const cache = await caches.open(CACHE);
      await cache.put(key, res.clone());
    }
    return res;
  });

  event.waitUntil(fresh.then(() => {}, () => {}));
  event.respondWith(
    caches.match(key)
      .then((hit) => hit || fresh)
      .catch(() => (navigate ? caches.match(self.registration.scope) : Response.error())),
  );
});
