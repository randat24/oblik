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

export function getState() {
  return {
    online: isBrowser() ? navigator.onLine : true,
    pending: getQueue().length,
    syncing,
  };
}

/* ---------- черга записів ---------- */
export const getQueue = () => read(QUEUE_KEY, []);
const setQueue = (q) => { write(QUEUE_KEY, q); notify(); };

export function enqueue(entry) {
  const q = getQueue();
  q.push({ ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now() });
  setQueue(q);
}

let syncing = false;
let dropped = [];

/** Що сервер відхилив назавжди — показуємо людині, а не ховаємо */
export function takeDropped() {
  const d = dropped;
  dropped = [];
  return d;
}

/**
 * Відправляє чергу по одному й у тому ж порядку, у якому вносили.
 * Обрив зв'язку — зупиняємось і чекаємо; відмова сервера — прибираємо
 * запис із черги, бо повторення нічого не змінить.
 */
export async function flushQueue() {
  if (!isBrowser() || syncing || !navigator.onLine) return { sent: 0, failed: 0 };
  const q = getQueue();
  if (!q.length) return { sent: 0, failed: 0 };

  syncing = true;
  notify();
  let sent = 0;

  try {
    while (getQueue().length) {
      const [next] = getQueue();
      let res;
      try {
        res = await fetch(next.url, {
          method: next.method,
          headers: { 'Content-Type': 'application/json' },
          body: next.body ? JSON.stringify(next.body) : undefined,
        });
      } catch {
        break; // зв'язку знову немає — решта чекає
      }
      const rest = getQueue().slice(1);
      if (!res.ok && res.status !== 401) {
        let msg = '';
        try { msg = (await res.json())?.error || ''; } catch {}
        dropped.push({ ...next, error: msg || `помилка ${res.status}` });
      } else if (res.ok) {
        sent++;
      } else {
        break; // 401 — сесія завершилась, спробуємо після входу
      }
      setQueue(rest);
    }
  } finally {
    syncing = false;
    notify();
  }
  return { sent, failed: dropped.length };
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
