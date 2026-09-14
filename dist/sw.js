const CACHE = 'sayid-english-v4-1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './css/base.css', './css/components.css', './css/responsive.css', './js/app.js', './js/storage.js', './js/stats.js', './js/i18n.js', './js/planner.js', './js/cloud.js', './js/locales/en.js', './js/locales/tr.js', './assets/icons/icon.svg', './assets/icons/icon-192.png', './assets/icons/icon-512.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// HTML/JS/CSS: network-first (stale code never sticks); icons: cache-first; all fall back offline.
// API calls are NEVER cached: only GET, same-origin, non-/api requests touch the cache.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return;
  if (url.origin !== self.location.origin) return;
  const kind = (url.pathname.split('.').pop() || '').toLowerCase();
  if (e.request.mode === 'navigate' || ['js', 'css', 'html'].includes(kind)) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
