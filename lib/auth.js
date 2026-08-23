import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

const COOKIE_NAME = 'oblik_session';

// Хто саме виконує запит. Зберігаємо тут, щоб журнал міг це записати,
// не протягуючи «хто» через кожен виклик у кожному маршруті.
const actorStore = new AsyncLocalStorage();

export function currentActor() {
  return actorStore.getStore()?.actor || '';
}

/** Чи прийшов запит без сесії — за відкритим посиланням */
export function isGuest() {
  return !!actorStore.getStore()?.guest;
}

function secret() {
  return process.env.SESSION_SECRET || 'change-me-in-env';
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString('utf8');

/** Довжина вікна сесії: 00:00, 04:00, 08:00 і так далі за київським часом */
export const WINDOW_HOURS = 4;

/**
 * Кінець поточного вікна. Прив'язка до годинника, а не до моменту входу:
 * усі виходять з системи одночасно, о рівній годині.
 */
export function windowEnd(now = Date.now()) {
  const fmt = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = {};
  fmt.formatToParts(new Date(now)).forEach((x) => (p[x.type] = x.value));
  const h = Number(p.hour) % 24;
  const into = ((h % WINDOW_HOURS) * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000;
  return now + WINDOW_HOURS * 3600 * 1000 - into;
}

/** Токен несе позивний, роль і час, коли сесія добігає кінця */
export function makeToken({ callsign = '', role = 'admin' } = {}) {
  const payload = b64(JSON.stringify({
    t: Date.now(), c: callsign, r: role, e: windowEnd(),
  }));
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/** Повертає дані сесії або null */
export function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  if (!sig || sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  let data;
  try {
    data = JSON.parse(unb64(payload));
  } catch {
    return null;
  }
  if (!data?.t) return null;
  // токени, видані до появи вікон, доживають своє за старим правилом
  const expires = Number(data.e) || Number(data.t) + WINDOW_HOURS * 3600 * 1000;
  if (Date.now() >= expires) return null;
  return {
    callsign: data.c || '',
    role: data.r === 'user' ? 'user' : 'admin',
    expires,
  };
}

export function verifyToken(token) {
  return !!readToken(token);
}

/**
 * Порівняння секретів, що не підказує довжиною збігу, скільки символів
 * угадано. Потрібне скрізь, де ключ приходить із посилання, а не з куки.
 */
export function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Ключ із запиту: заголовком, у тілі або в адресі */
export function keyFrom(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    || (req.body?.token || '')
    || (req.query?.token || '');
}

export function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

/** Дані сесії з запиту; null — не авторизовано */
export function session(req) {
  if (!process.env.APP_PASSWORD) return { callsign: '', role: 'admin', expires: 0 };
  return readToken(parseCookies(req)[COOKIE_NAME]);
}

export function isAuthed(req) {
  return !!session(req);
}

export function setSessionCookie(res, who) {
  const token = makeToken(who);
  const end = windowEnd();
  // куку теж не тримаємо довше за саму сесію
  const maxAge = Math.max(60, Math.round((end - Date.now()) / 1000));
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Secure`
  );
  return end;
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/**
 * Обгортка для API-роутів: перевіряє автентифікацію.
 *
 * `openGet` відкриває лише читання (GET) тим, хто зайшов за посиланням без
 * входу. Запис у такому маршруті все одно лишається за сесією — маршрут сам
 * вирішує, що показувати гостю, через `isGuest()`.
 */
export function withAuth(handler, { adminOnly = false, openGet = false } = {}) {
  return async (req, res) => {
    const who = session(req);
    const guest = !who && openGet && req.method === 'GET';
    if (!who && !guest) {
      return res.status(401).json({ error: 'Не авторизовано' });
    }
    if (!guest && adminOnly && who.role !== 'admin') {
      return res.status(403).json({ error: 'Потрібні права адміністратора' });
    }
    return actorStore.run({ actor: who?.callsign || '', guest }, async () => {
      try {
        return await handler(req, res);
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message || 'Помилка сервера' });
      }
    });
  };
}

export { COOKIE_NAME };
