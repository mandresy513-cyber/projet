/* BOXIBY — service worker minimal : rend le site installable (icône sur l'écran d'accueil). */
const CACHE = 'boxiby-pwa-v1';
const ICONS = ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'logo.png', 'logo-noir.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['manifest.json', 'assets/img/icon-192.png', 'assets/img/icon-512.png'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin || u.pathname.includes('/api/')) return;
  if (ICONS.some((n) => u.pathname.endsWith(n))) {
    e.respondWith(
      caches.match(req).then((r) => r || fetch(req).then((resp) => {
        const copie = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, copie));
        return resp;
      }))
    );
  }
});
