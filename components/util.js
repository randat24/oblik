/**
 * Дрібниці, спільні для обох світів «Особистого».
 *
 * Раніше все це лежало в `pages/me.js` — сторінці на сім тисяч рядків.
 * Файл такого розміру не читають цілком, тож правлять наосліп: шукають
 * потрібне пошуком і міняють, не бачачи, що поруч.
 *
 * Тут лишилось те, чим користуються і «Тіло», і «Навчання»: запит на
 * сервер, київська дата й українська множина. Нічого більшого сюди
 * складати не варто — модуль «різне» росте так само непомітно, як
 * сторінка, з якої його дістали.
 */
import { enqueue } from '../lib/offline';


/*
 * Чи можна змінювати.
 *
 * Прапорець живе поруч із `api`, а не в пропсах: інакше його довелося б
 * протягувати крізь кожну вкладку й кожну картку, а перевірка потрібна
 * рівно в одному місці — перед відправкою запису.
 */
let canEdit = true;

export const setCanEdit = (v) => { canEdit = v !== false; };

export const mayEdit = () => canEdit;

/**
 * Запит із межею терпіння. Без неї застряглий запит виглядає як вічне
 * «Завантаження…»: сторінка ніби працює, а насправді вже нікуди не йде.
 */
export async function api(path, opts = {}) {
  if (opts.method && opts.method !== 'GET' && !canEdit) {
    const err = new Error('Тільки перегляд. Увійдіть у застосунок, щоб змінювати.');
    err.status = 403;
    throw err;
  }
  const stop = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const bell = stop ? setTimeout(() => stop.abort(), opts.wait || 25000) : null;
  let res;
  try {
    res = await fetch(path, {
      ...opts,
      signal: stop?.signal,
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error('Таблиця не відповіла за 25 секунд. Спробуйте ще раз.');
      err.status = 0;
      throw err;
    }
    /*
     * Звʼязку немає.
     *
     * Досі сюди долітало «Failed to fetch» — англійською й без жодної
     * підказки, що робити. У полі це читається як «застосунок зламався»,
     * хоч зламався якраз не він.
     *
     * Запис при цьому не втрачаємо: черга та сама, що й у решті
     * застосунку, і піде вона, щойно мережа зʼявиться.
     */
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const method = (opts.method || 'GET').toUpperCase();
    if (method !== 'GET') {
      enqueue({ url: path, method, body: opts.body, label: opts.label || '' });
      const err = new Error(offline
        ? 'Немає звʼязку. Запис збережено — надішлемо, щойно зʼявиться мережа'
        : 'Не вдалось достукатись до сервера. Запис збережено — надішлемо пізніше');
      err.offline = true;
      throw err;
    }
    const err = new Error(offline
      ? 'Немає звʼязку. Цей розділ читається просто з таблиці, тож без мережі він порожній.'
      : 'Не вдалось достукатись до сервера. Перевірте звʼязок і спробуйте ще раз.');
    err.offline = true;
    err.status = 0;
    throw err;
  } finally {
    if (bell) clearTimeout(bell);
  }
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!res.ok) {
    const err = new Error(data.error || `Помилка ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Сьогодні за київським годинником: «29.08.2026» */
export function today() {
  const fmt = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p = {};
  fmt.formatToParts(new Date()).forEach((x) => (p[x.type] = x.value));
  return `${p.day}.${p.month}.${p.year}`;
}

/** «29.08.2026» → число для порівнянь; сміття дає 0, а не падіння */
export function stamp(d) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((d || '').toString().trim());
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0;
}

/** «29.08» — день і місяць, коли рік і так зрозумілий */
export const short = (d) => (d || '').slice(0, 5);

export const num = (v) => {
  const x = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(x) ? x : 0;
};

/**
 * «21 день», «22 дні», «25 днів» — за останньою цифрою, крім підлітків.
 * Дні тут за замовчуванням, бо їх рахують найчастіше, але форми можна
 * передати й свої: `plural(n, 'зміна', 'зміни', 'змін')`.
 */
export function plural(n, one = 'день', few = 'дні', many = 'днів') {
  const t = n % 100;
  const o = n % 10;
  if (t >= 11 && t <= 14) return many;
  if (o === 1) return one;
  if (o >= 2 && o <= 4) return few;
  return many;
}

/** Те саме, але формами списком: `plur(n, ['раз', 'рази', 'разів'])` */
export function plur(n, [one, few, many]) {
  const a = Math.abs(Math.round(n));
  const t = a % 100;
  const o = a % 10;
  if (t >= 11 && t <= 14) return many;
  if (o === 1) return one;
  if (o >= 2 && o <= 4) return few;
  return many;
}
