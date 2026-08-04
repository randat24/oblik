/* Кеш оболонки застосунку: у полі сторінка має відкриватися й без мережі. */
const SHELL = 'oblik-shell-v1';
const PAGES = ['/', '/rybakivka'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(PAGES).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // дані застосунок кешує сам — тут лише оболонка
  if (url.pathname.startsWith('/api/')) return;

  // збірка має незмінні імена файлів, тож її можна брати з кешу одразу
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(request, copy));
        return res;
      }))
    );
    return;
  }

  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('/')))
  );
});
