import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

const COOKIE_NAME = 'oblik_session';

// Хто саме виконує запит. Зберігаємо тут, щоб журнал міг це записати,
// не протягуючи «хто» через кожен виклик у кожному маршруті.
const actorStore = new AsyncLocalStorage();

export function currentActor() {
  return actorStore.getStore()?.actor || '';
}

function secret() {
  return process.env.SESSION_SECRET || 'change-me-in-env';
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString('utf8');

/** Токен несе позивний і роль, тож сервер знає, хто діє */
export function makeToken({ callsign = '', role = 'admin' } = {}) {
  const payload = b64(JSON.stringify({ t: Date.now(), c: callsign, r: role }));
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
  // сесія живе 30 днів
  if (!data?.t || Date.now() - Number(data.t) > 30 * 24 * 60 * 60 * 1000) return null;
  return { callsign: data.c || '', role: data.r === 'user' ? 'user' : 'admin' };
}

export function verifyToken(token) {
  return !!readToken(token);
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
  if (!process.env.APP_PASSWORD) return { callsign: '', role: 'admin' };
  return readToken(parseCookies(req)[COOKIE_NAME]);
}

export function isAuthed(req) {
  return !!session(req);
}

export function setSessionCookie(res, who) {
  const token = makeToken(who);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}; Secure`
  );
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Обгортка для API-роутів: перевіряє автентифікацію */
export function withAuth(handler, { adminOnly = false } = {}) {
  return async (req, res) => {
    const who = session(req);
    if (!who) {
      return res.status(401).json({ error: 'Не авторизовано' });
    }
    if (adminOnly && who.role !== 'admin') {
      return res.status(403).json({ error: 'Потрібні права адміністратора' });
    }
    return actorStore.run({ actor: who.callsign }, async () => {
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
