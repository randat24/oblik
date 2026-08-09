/* Кеш оболонки застосунку: у полі сторінка має відкриватися й без мережі.
 *
 * Ім'я кешу береться з версії, яку дописує сторінка під час реєстрації
 * (/sw.js?v=<коміт>). Кожна нова збірка — новий воркер і новий кеш, а старі
 * activate вичищає. Без цього кеш жив вічно: користувач бачив стару збірку
 * і не мав жодного способу зрозуміти, чому оновлень немає.
 */
const V = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL = 'oblik-shell-' + V;
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

// у кеш кладемо лише те, що справді вдалося: інакше туди потрапляє
// сторінка помилки й потім видається за застосунок
const keep = (request, res) => {
  if (res && res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches.open(SHELL).then((c) => c.put(request, copy));
  }
  return res;
};

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
      caches.match(request).then((hit) => hit || fetch(request).then((res) => keep(request, res)))
    );
    return;
  }

  e.respondWith(
    fetch(request)
      .then((res) => keep(request, res))
      .catch(() => caches.match(request).then((hit) => hit || caches.match('/')))
  );
});
