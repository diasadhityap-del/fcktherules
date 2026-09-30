const CACHE_NAME = 'fvcktherules-v15';
const ASSETS = [
  'index.html',
  'style.css',
  'script.js',
  'journal.js',
  'manifest.json'
];

// Install Service Worker
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Bersihkan cache versi lama & ambil alih kontrol tab yang sedang terbuka
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// HTML/JS/CSS selalu coba ambil versi terbaru dulu, jatuh ke cache kalau offline
self.addEventListener('fetch', (e) => {
  const isCoreFile = ASSETS.some((asset) => e.request.url.includes(asset));

  if (isCoreFile) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request);
    })
  );
});