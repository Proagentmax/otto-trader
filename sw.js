/* Otto Trader service worker.
   Network-first for anything that changes, cache-first only for static assets.
   A cache-first HTML strategy would pin users to an old build forever, which is
   exactly the failure we already hit once by hand. */
const VERSION = 'otto-v2.4.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest',   // config.js is deliberately NOT precached
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

  // config.js decides WHICH BACKEND the whole app talks to. A stale copy points
  // it at the wrong Supabase project — which is exactly the failure we hit, and
  // it is invisible because everything still "works", just against the wrong
  // database. Never cached, never stored, no fallback copy. If it cannot be
  // fetched the app should fail loudly rather than quietly use an old address.
  if (url.pathname.endsWith('config.js')) {
    e.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  const isDoc  = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  // The corpus files must never go stale in an installed PWA: publishing a new
  // call is the whole update mechanism, and a cache-first copy would freeze the
  // brain at whatever Josh installed on day one.
  const isData = url.pathname.endsWith('week-latest.json')
              || url.pathname.endsWith('brain-latest.json')
              || url.pathname.endsWith('config.js');

  if (isDoc || isData) {
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
