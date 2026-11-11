// Offline support.
// App files: network first, so a new version shows up on the next open; the
// saved copy is used when offline or when the network is slow (> 3 s).
// Firebase SDK: cache first (its URLs include the version, so they never change).
const CACHE = 'stropping-shell-v3';
const SHELL = ['./', 'index.html', 'styles.css', 'firebase-config.js', 'logic.js', 'app.js', 'sync.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/';
const NETWORK_TIMEOUT_MS = 3000;

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

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    // Slow network: use the saved copy if there is one, otherwise keep waiting.
    return (await cache.match(req, { ignoreSearch: true })) || (await network);
  } catch (err) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.url.startsWith(FIREBASE_SDK)) e.respondWith(cacheFirst(req));
  else if (new URL(req.url).origin === location.origin) e.respondWith(networkFirst(req));
});
