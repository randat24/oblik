import crypto from 'crypto';

const COOKIE_NAME = 'oblik_session';

function secret() {
  // Без секрету будь-хто міг би підробити сесію — краще не пускати нікого
  if (!process.env.SESSION_SECRET) throw new Error('Не заданий SESSION_SECRET у змінних оточення');
  return process.env.SESSION_SECRET;
}

/** Порівняння пароля за сталий час (через хеші однакової довжини) */
export function checkPassword(password) {
  const hash = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest();
  return crypto.timingSafeEqual(hash(password), hash(process.env.APP_PASSWORD));
}

export function makeToken() {
  const payload = String(Date.now());
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  // сесія живе 30 днів
  const age = Date.now() - Number(payload);
  return age < 30 * 24 * 60 * 60 * 1000;
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

/** Без пароля сайт відкритий лише локально; на Vercel — ніколи */
export function authDisabled() {
  return !process.env.APP_PASSWORD && !process.env.VERCEL;
}

export function isAuthed(req) {
  if (authDisabled()) return true;
  if (!process.env.APP_PASSWORD) return false;
  const cookies = parseCookies(req);
  return verifyToken(cookies[COOKIE_NAME]);
}

export function setSessionCookie(res) {
  const token = makeToken();
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}; Secure`
  );
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Обгортка для API-роутів: перевіряє автентифікацію */
export function withAuth(handler) {
  return async (req, res) => {
    try {
      if (!isAuthed(req)) {
        return res.status(401).json({ error: 'Не авторизовано' });
      }
      return await handler(req, res);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message || 'Помилка сервера' });
    }
  };
}

export { COOKIE_NAME };
