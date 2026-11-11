// Offline support: serve the app shell from cache, refresh it in the background.
const CACHE = 'stropping-shell-v2';
const SHELL = ['./', 'index.html', 'styles.css', 'firebase-config.js', 'logic.js', 'app.js', 'sync.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
// The Firebase SDK is cached too, so a shared household still opens offline
// (Firestore keeps its own offline copy of the data and queues changes).
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin && !req.url.startsWith(FIREBASE_SDK)) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
