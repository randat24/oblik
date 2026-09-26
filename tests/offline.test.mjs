import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Черга офлайну — єдине місце застосунку, де збій не «незручно», а
 * «запис зник».
 *
 * У полі зв'язку немає, а внести треба зараз: записи лягають у браузер
 * і йдуть, щойно мережа повернеться. Доти тут не було жодного тесту —
 * при тому, що саме ця черга тримає те, чого більше ніде немає.
 *
 * Модуль тримає стан у собі й у localStorage, тож перед кожним тестом
 * підміна браузера створюється наново, а сам модуль завантажується
 * свіжим — інакше черга з попереднього тесту тече в наступний.
 */

/** Мінімальний браузер: сховище, мережа, події */
function fakeBrowser({ online = true } = {}) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  // у Node 22 `navigator` свій і лише на читання — підміняємо через опис
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: online },
    configurable: true,
    writable: true,
  });
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  return store;
}

/** Відповіді сервера по черзі; кидок — це обрив зв'язку */
function fakeFetch(steps) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, method: opts.method, body: opts.body });
    const step = steps[calls.length - 1] ?? { status: 200 };
    if (step.throw) throw new Error('мережі немає');
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      json: async () => step.json || {},
    };
  };
  return calls;
}

/** Свіжий модуль: інакше черга й лічильники течуть між тестами */
let seq = 0;
const load = () => import(`../lib/offline.js?t=${++seq}`);

test('запис лягає в чергу й видно, скільки їх', async () => {
  fakeBrowser();
  const off = await load();
  assert.equal(off.getState().pending, 0);

  off.enqueue({ url: '/api/item', method: 'POST', body: { a: 1 } });
  off.enqueue({ url: '/api/item', method: 'POST', body: { a: 2 } });

  assert.equal(off.getState().pending, 2);
  assert.equal(off.getQueue()[0].body.a, 1, 'порядок внесення зберігається');
  assert.ok(off.getQueue()[0].id, 'у кожного запису свій номер');
});

test('черга йде по одному, у тому ж порядку, і порожніє', async () => {
  fakeBrowser();
  const calls = fakeFetch([{ status: 200 }, { status: 200 }]);
  const off = await load();

  off.enqueue({ url: '/api/a', method: 'POST', body: { n: 1 } });
  off.enqueue({ url: '/api/b', method: 'POST', body: { n: 2 } });
  const r = await off.flushQueue();

  assert.equal(r.sent, 2);
  assert.equal(off.getState().pending, 0);
  assert.deepEqual(calls.map((c) => c.url), ['/api/a', '/api/b']);
});

test('без мережі не пробуємо й кажемо чому', async () => {
  fakeBrowser({ online: false });
  const calls = fakeFetch([]);
  const off = await load();

  off.enqueue({ url: '/api/a', method: 'POST' });
  const r = await off.flushQueue();

  assert.equal(r.sent, 0);
  assert.equal(r.stopped, 'offline');
  assert.equal(calls.length, 0, 'жодного запиту');
  assert.equal(off.getState().pending, 1, 'запис лишається чекати');
});

test('обрив посеред черги — решта чекає, а не губиться', async () => {
  fakeBrowser();
  fakeFetch([{ status: 200 }, { throw: true }]);
  const off = await load();

  off.enqueue({ url: '/api/a', method: 'POST' });
  off.enqueue({ url: '/api/b', method: 'POST' });
  off.enqueue({ url: '/api/c', method: 'POST' });
  const r = await off.flushQueue();

  assert.equal(r.sent, 1);
  assert.equal(r.stopped, 'network');
  assert.equal(off.getState().pending, 2, 'другий і третій лишились');
  assert.equal(off.getQueue()[0].url, '/api/b', 'і саме в тому ж порядку');
});

test('сесія завершилась — черга стоїть цілою й каже про це', async () => {
  fakeBrowser();
  fakeFetch([{ status: 401 }]);
  const off = await load();

  off.enqueue({ url: '/api/a', method: 'POST' });
  const r = await off.flushQueue();

  assert.equal(r.sent, 0);
  assert.equal(r.stopped, 'auth');
  assert.equal(off.getState().pending, 1, 'після входу піде само');
});

test('відмову сервера не повторюємо, а показуємо людині', async () => {
  fakeBrowser();
  fakeFetch([{ status: 400, json: { error: 'Вкажіть назву' } }, { status: 200 }]);
  const off = await load();

  off.enqueue({ url: '/api/a', method: 'POST' });
  off.enqueue({ url: '/api/b', method: 'POST' });
  const r = await off.flushQueue();

  assert.equal(r.sent, 1, 'другий пішов');
  assert.equal(off.getState().pending, 0, 'у черзі не лишилось нічого');
  const bad = off.takeDropped();
  assert.equal(bad.length, 1);
  assert.equal(bad[0].error, 'Вкажіть назву', 'причину видно словами');
  assert.deepEqual(off.takeDropped(), [], 'забране не повертається вдруге');
});

test('повторна відправка після обриву — і про неї кажуть', async () => {
  fakeBrowser();
  // перша спроба обривається, друга проходить
  fakeFetch([{ throw: true }, { status: 200 }]);
  const off = await load();

  off.enqueue({ url: '/api/a', method: 'POST', body: { що: 'вода' } });

  await off.flushQueue();
  assert.equal(off.getQueue()[0].tries, 1, 'спроба порахована ще до запиту');

  const r = await off.flushQueue();
  assert.equal(r.sent, 1);

  const again = off.takeResent();
  assert.equal(again.length, 1, 'запис міг записатись двічі — про це треба сказати');
  assert.equal(again[0].tries, 2);
  assert.deepEqual(off.takeResent(), [], 'попередження показують один раз');
});

test('з першої спроби — жодних попереджень', async () => {
  fakeBrowser();
  fakeFetch([{ status: 200 }]);
  const off = await load();

  off.enqueue({ url: '/api/a', method: 'POST' });
  await off.flushQueue();

  assert.deepEqual(off.takeResent(), []);
  assert.deepEqual(off.takeDropped(), []);
});

test('порожня черга не будить мережу', async () => {
  fakeBrowser();
  const calls = fakeFetch([]);
  const off = await load();

  const r = await off.flushQueue();
  assert.equal(r.sent, 0);
  assert.equal(calls.length, 0);
});

test('кеш читань віддає останнє вдале, а чого не питали — не вигадує', async () => {
  fakeBrowser();
  const off = await load();

  off.cachePut('/api/sheet?name=ПНВ', { items: [1, 2] });
  assert.deepEqual(off.cacheGet('/api/sheet?name=ПНВ').data, { items: [1, 2] });
  assert.equal(off.cacheGet('/api/sheet?name=Дрони'), null);
});

test('зіпсоване сховище не валить сторінку', async () => {
  const store = fakeBrowser();
  const off = await load();
  store.set('oblik-queue', '{це не json');
  assert.deepEqual(off.getQueue(), [], 'читаємо як порожню чергу');
  assert.equal(off.getState().pending, 0);
});
