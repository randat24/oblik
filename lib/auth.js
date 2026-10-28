import crypto from 'crypto';
import { friendlyError, statusFor } from './quota.js';
import { AsyncLocalStorage } from 'async_hooks';

const COOKIE_NAME = 'oblik_session';

// Хто саме виконує запит. Зберігаємо тут, щоб журнал міг це записати,
// не протягуючи «хто» через кожен виклик у кожному маршруті.
const actorStore = new AsyncLocalStorage();

export function currentActor() {
  return actorStore.getStore()?.actor || '';
}

/**
 * Головний.
 *
 * Адміністраторів може бути кілька — вони заводять людей і ведуть
 * довідники. Але є дії, після яких запис перестає відповідати тому, що
 * справді сталося: переписати дати етапів, відкотити доставку назад.
 * Такі речі лишаються за однією людиною.
 *
 * Позивний береться зі змінної оточення, а не з листа «Люди», і це
 * навмисно: сенс «тільки я» зникає, щойно право можна видати собі
 * самому, маючи доступ до таблиці.
 */
export const chiefName = () => (process.env.OWNER || process.env.HEALTH_OWNER || '').trim();

export function isChief(callsign) {
  const chief = chiefName();
  if (!chief) return false;
  return String(callsign || '').trim().toLowerCase() === chief.toLowerCase();
}

/** Чи прийшов запит без сесії — за відкритим посиланням */
export function isGuest() {
  return !!actorStore.getStore()?.guest;
}

/*
 * Ключ, яким підписані сесії.
 *
 * Раніше тут стояло `|| 'change-me-in-env'`: без заданої змінної сесії
 * підписувались рядком, який лежить у відкритому репозиторії. Підробити
 * адмінський токен міг будь-хто, хто бачив вихідники, — і жодної ознаки
 * поломки при цьому не було, вхід працював як завжди. Найгірший вид
 * дірки: та, що виглядає як робочий застосунок.
 *
 * Тепер без ключа підпису не існує. Вхід чесно каже, що зламано.
 */
const PLACEHOLDER = 'change-me-in-env';
let warned = false;

function secret() {
  const s = String(process.env.SESSION_SECRET || '').trim();
  if (!s || s === PLACEHOLDER) return null;
  /*
   * Довжину не вимагаємо, а лише згадуємо в журналі: вимога зробила б
   * так, що чинний короткий ключ раптом перестав би пускати всіх у
   * робочому застосунку. Замкнути двері й загубити ключ — не безпека.
   */
  if (s.length < 16 && !warned) {
    warned = true;
    console.warn('SESSION_SECRET коротший за 16 символів — варто подовжити: openssl rand -hex 32');
  }
  return s;
}


/** Чи є чим підписати сесію. Без цього вхід вимикається, а не робить вигляд */
export const signingReady = () => secret() !== null;

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

/**
 * Токен несе позивний, роль і час, коли сесія добігає кінця.
 *
 * Роль за замовчуванням — найменша: обидва місця, де токен видають,
 * задають її явно, тож замовчування тут працює лише тоді, коли роль
 * забули передати. Забути й отримати «тільки перегляд» — незручно й
 * помітно; забути й тихо отримати адміністратора — те, чого не видно
 * взагалі.
 */
export function makeToken({ callsign = '', role = 'user' } = {}) {
  const key = secret();
  if (!key) throw new Error('SESSION_SECRET не задано — сесію нема чим підписати');
  const payload = b64(JSON.stringify({
    t: Date.now(), c: callsign, r: role, e: windowEnd(),
  }));
  const sig = crypto.createHmac('sha256', key).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/** Повертає дані сесії або null */
export function readToken(token) {
  const key = secret();
  // немає ключа — немає й довіри до жодного підпису
  if (!key) return null;
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', key).update(payload).digest('hex');
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
    /*
     * Невідома роль — не адміністратор.
     *
     * Раніше правило було зворотне: «user» лишався користувачем, а все
     * інше ставало адміністратором. Дірки з цього не виходило — токен
     * підписаний, а обидва місця, де його видають, кладуть туди рівно
     * «admin» або «user». Але правило падало не в той бік: варто було
     * колись покласти в токен щось третє — «guest», порожній рядок,
     * недописану роль — і воно мовчки ставало адмінським.
     *
     * Тепер навпаки: адміністратором стає лише те, що записане
     * адміністратором. Жодна наявна сесія від цього не міняється.
     */
    role: data.r === 'admin' ? 'admin' : 'user',
    expires,
  };
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

/**
 * Чи потрібен вхід.
 *
 * Без APP_PASSWORD застосунок вважається ненастроєним і відкритим — але
 * лише локально. На Vercel (там завжди є змінна VERCEL) зникла змінна
 * означала б, що вся таблиця відкрита в інтернет із правами адміністратора,
 * і нічого б цього не показало. Тож там без пароля не пускаємо нікого.
 */
export const authRequired = () => !!process.env.APP_PASSWORD || !!process.env.VERCEL;

/** Дані сесії з запиту; null — не авторизовано */
export function session(req) {
  if (!authRequired()) return { callsign: '', role: 'admin', expires: 0 };
  if (!process.env.APP_PASSWORD) return null;
  return readToken(parseCookies(req)[COOKIE_NAME]);
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
 *
 * З `adminOnly` він не поєднується: гість адміністратором не буває.
 */
export function withAuth(handler, { adminOnly = false, openGet = false } = {}) {
  return async (req, res) => {
    const who = session(req);
    const guest = !who && openGet && req.method === 'GET';
    if (!who && !guest) {
      return res.status(401).json({ error: 'Не авторизовано' });
    }
    /*
     * Гість — не адміністратор.
     *
     * Раніше перевірка починалась із `!guest`, тобто саме гість її й
     * оминав. Жоден маршрут не поєднував `adminOnly` з `openGet`, тож на
     * практиці це не спрацьовувало, — але пастка чекала: досить було
     * додати `openGet` до адмінського маршруту, і той відкрився б
     * мовчки, без жодної помилки.
     */
    if (adminOnly && who?.role !== 'admin') {
      return res.status(403).json({ error: 'Потрібні права адміністратора' });
    }
    return actorStore.run({ actor: who?.callsign || '', guest }, async () => {
      try {
        return await handler(req, res);
      } catch (err) {
        console.error(err);
        /*
         * «Quota exceeded for quota metric 'Read requests'…» нічого не
         * каже тому, хто просто відкрив налаштування, — а саме цей рядок
         * і показувався в шапці застосунку. Причина тимчасова, дія
         * очевидна: зачекати хвилину. Так і пишемо, а код відповіді
         * ставимо 429, бо це не поломка, а «зараз зайнято».
         */
        return res.status(statusFor(err)).json({ error: friendlyError(err) });
      }
    });
  };
}

export { COOKIE_NAME };
