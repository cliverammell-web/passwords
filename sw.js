/* Passwords — network-first with a dependable offline fallback.
   Bump CACHE whenever you upload a new index.html. */
const CACHE = 'pw-cache-v9';
const BASE  = '/passwords/';
const PAGE  = BASE + 'index.html';
const NET_TIMEOUT = 4000;   // don't let a stalled connection hold the app shut

const ASSETS = [BASE, PAGE, BASE + 'manifest.json',
                BASE + 'icon-192.png', BASE + 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One at a time: a single failure must never leave the vault uncached.
    await Promise.all(ASSETS.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Fetch with a ceiling, so a half-open connection fails fast to the cache
   rather than hanging on the splash screen. */
function fetchWithTimeout(req, ms){
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req, { cache: 'no-cache' }).then(res => {
      clearTimeout(timer); resolve(res);
    }, err => {
      clearTimeout(timer); reject(err);
    });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Sync traffic and anything else off-site goes straight to the network.
  if (!req.url.startsWith(self.location.origin)) return;

  e.respondWith((async () => {
    try {
      const res = await fetchWithTimeout(req, NET_TIMEOUT);
      if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (err) {
      // Exact match first, then the app shell, then an honest error —
      // never an undefined response, which shows as a network failure.
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate' || req.url.endsWith(BASE) || req.url.includes('index.html')) {
        const shell = await caches.match(PAGE) || await caches.match(BASE);
        if (shell) return shell;
      }
      return new Response('Passwords is not cached on this device yet.', {
        status: 503, headers: { 'Content-Type': 'text/plain' }
      });
    }
  })());
});
