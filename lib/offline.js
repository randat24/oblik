/**
 * Офлайн-режим. У полі зв'язку може не бути, а внести треба зараз.
 *
 * Записи, які не пішли через мережу, лягають у чергу в самому браузері
 * і відправляються, щойно зв'язок повернеться. Читання підстраховане
 * останньою вдалою відповіддю, щоб застосунок не був порожнім екраном.
 */
const QUEUE_KEY = 'oblik-queue';
const CACHE_KEY = 'oblik-cache';
const CACHE_LIMIT = 40;

const isBrowser = () => typeof window !== 'undefined';

function read(key, fallback) {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // місце скінчилось — краще втратити кеш читань, ніж чергу записів
    if (key === CACHE_KEY) localStorage.removeItem(CACHE_KEY);
  }
}

/* ---------- підписники ---------- */
const listeners = new Set();
export function onOfflineChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  const state = getState();
  listeners.forEach((fn) => fn(state));
}

/*
 * Чому остання спроба надіслати зупинилась: 'offline', 'auth', 'network'
 * або null, якщо все пішло.
 *
 * Доти черга зупинялась мовчки. Людина тиснула «Надіслати», не відбувалось
 * нічого — ні руху лічильника, ні слова, — і єдиний доступний висновок був
 * «застосунок зламався». Насправді там найчастіше завершена сесія: вікно
 * входу живе чотири години, а записи в черзі — скільки завгодно.
 */
let lastStop = null;

export function getState() {
  return {
    online: isBrowser() ? navigator.onLine : true,
    pending: getQueue().length,
    syncing,
    stopped: lastStop,
  };
}

/* ---------- черга записів ---------- */
export const getQueue = () => read(QUEUE_KEY, []);
const setQueue = (q) => { write(QUEUE_KEY, q); notify(); };

export function enqueue(entry) {
  const q = getQueue();
  q.push({
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    tries: 0,
  });
  setQueue(q);
}

let syncing = false;
let dropped = [];
let resent = [];

/** Що сервер відхилив назавжди — показуємо людині, а не ховаємо */
export function takeDropped() {
  const d = dropped;
  dropped = [];
  return d;
}

/**
 * Записи, які пішли не з першої спроби.
 *
 * Коли зв'язок рветься посеред запиту, браузер каже лише «не вийшло» —
 * і це однаково виглядає в двох різних випадках: запит не дійшов, або
 * дійшов, сервер його записав, а відповідь загубилась дорогою назад.
 * Розрізнити їх звідси неможливо.
 *
 * Тому ми надсилаємо ще раз — і це свідомий вибір на користь дубліката.
 * Зайвий рядок у таблиці видно, і його видаляють за два дотики; втрачена
 * заявка не видно ніяк, і виявляється вона тоді, коли по неї приїхали.
 *
 * Але мовчати про це не можна: людина має знати, які саме записи варто
 * перевірити на задвоєння.
 */
export function takeResent() {
  const r = resent;
  resent = [];
  return r;
}

/**
 * Відправляє чергу по одному й у тому ж порядку, у якому вносили.
 * Обрив зв'язку — зупиняємось і чекаємо; відмова сервера — прибираємо
 * запис із черги, бо повторення нічого не змінить.
 */
export async function flushQueue() {
  if (!isBrowser() || syncing) return { sent: 0, failed: 0, stopped: lastStop };
  if (!navigator.onLine) {
    lastStop = 'offline';
    notify();
    return { sent: 0, failed: 0, stopped: lastStop };
  }
  const q = getQueue();
  if (!q.length) return { sent: 0, failed: 0, stopped: null };

  syncing = true;
  lastStop = null;
  notify();
  let sent = 0;

  try {
    while (getQueue().length) {
      const [next] = getQueue();

      /*
       * Лічильник спроб пишемо в чергу ДО запиту, а не після.
       * Обрив може статися будь-коли, зокрема й тоді, коли сервер уже
       * записав; після перезавантаження сторінки ми маємо пам'ятати,
       * що ця спроба була.
       */
      const tries = (next.tries || 0) + 1;
      const head = { ...next, tries };
      setQueue([head, ...getQueue().slice(1)]);

      let res;
      try {
        res = await fetch(head.url, {
          method: head.method,
          headers: { 'Content-Type': 'application/json' },
          body: head.body ? JSON.stringify(head.body) : undefined,
        });
      } catch {
        lastStop = 'network';
        break; // зв'язку знову немає — решта чекає
      }
      const rest = getQueue().slice(1);
      if (!res.ok && res.status !== 401) {
        let msg = '';
        try { msg = (await res.json())?.error || ''; } catch {}
        dropped.push({ ...head, error: msg || `помилка ${res.status}` });
      } else if (res.ok) {
        sent++;
        // пішло не з першої спроби — попередня могла й записатись
        if (tries > 1) resent.push(head);
      } else {
        lastStop = 'auth';
        break; // 401 — сесія завершилась, спробуємо після входу
      }
      setQueue(rest);
    }
  } finally {
    syncing = false;
    notify();
  }
  return { sent, failed: dropped.length, stopped: lastStop };
}

/* ---------- кеш читань ---------- */
export function cachePut(url, data) {
  const cache = read(CACHE_KEY, {});
  cache[url] = { data, at: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > CACHE_LIMIT) {
    keys.sort((a, b) => cache[a].at - cache[b].at).slice(0, keys.length - CACHE_LIMIT)
      .forEach((k) => delete cache[k]);
  }
  write(CACHE_KEY, cache);
}

export function cacheGet(url) {
  return read(CACHE_KEY, {})[url] || null;
}

/* ---------- запуск ---------- */
export function startOffline() {
  if (!isBrowser()) return () => {};
  const onOnline = () => { notify(); flushQueue(); };
  const onOffline = () => notify();
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  // мережа могла зʼявитися ще до відкриття застосунку
  flushQueue();
  const timer = setInterval(() => { if (navigator.onLine && getQueue().length) flushQueue(); }, 20000);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    clearInterval(timer);
  };
}
