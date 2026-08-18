/* Otto Trader service worker.
   Network-first for anything that changes, cache-first only for static assets.
   A cache-first HTML strategy would pin users to an old build forever, which is
   exactly the failure we already hit once by hand. */
const VERSION = 'otto-b7';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png',
  './icon-maskable-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())   // a missing optional asset must not block install
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never touch the market data or Claude APIs — they must always hit the network,
  // and a cached quote is worse than no quote.
  if (url.origin !== self.location.origin) return;

  const isDoc  = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  const isWeek = url.pathname.endsWith('week-latest.json');

  if (isDoc || isWeek) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
