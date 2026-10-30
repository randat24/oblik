// Розширення в імпортах сусідів стоїть навмисно: файл покритий тестами, а
// вбудований у Node запускач шукає модуль рівно за тим шляхом, який написали.

/**
 * Календар: чиста логіка для вибору дати.
 *
 * Системне вікно `<input type="date">` малює сама система, і стилізувати
 * його не можна: воно виглядало чужим у темній темі й показувало місяці
 * мовою телефону. Тому календар свій, а тут лише правила: які клітинки
 * в місяці, куди переходить стрілка, як дата виглядає на екрані.
 *
 * Дати — рядки «РРРР-ММ-ДД», як їх і зберігає таблиця. Жодних локальних
 * поясів: усе рахується в UTC, щоб «сьогодні» не залежало від годинника
 * того, хто дивиться.
 */

export const MONTH_NAMES = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

/** Тиждень починається з понеділка — так заведено в нас, а не в Америці */
export const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Розбір «РРРР-ММ-ДД»; хибна або неіснуюча дата (31 лютого) дає null */
export function parseIso(value) {
  const m = ISO.exec(String(value || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

export const toIso = (y, m, d) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** «28.10.2026» — як дату пишуть у нас; порожнє значення лишається порожнім */
export function showDate(iso) {
  const p = parseIso(iso);
  return p ? `${String(p.d).padStart(2, '0')}.${String(p.m).padStart(2, '0')}.${p.y}` : '';
}

/** Перехід на `delta` місяців: через кінець року й назад */
export function shiftMonth({ y, m }, delta) {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12 + 12) % 12 + 1 };
}

/**
 * Сітка місяця: тижні по сім клітинок, починаючи з понеділка.
 *
 * Крайні клітинки — дні сусідніх місяців, щоб тиждень не мав дірок;
 * позначені `out`, їх можна вибрати так само, як і свої. Тижнів завжди
 * шість: висота вікна тоді не стрибає, коли гортаєш місяці.
 */
export function monthGrid(y, m, today = '') {
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // скільки днів минулого місяця перед першим
  const start = Date.UTC(y, m - 1, 1 - lead);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const t = new Date(start + (w * 7 + d) * 86400000);
      const iso = toIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
      row.push({ iso, day: t.getUTCDate(), out: t.getUTCMonth() !== m - 1, today: iso === today });
    }
    weeks.push(row);
  }
  return weeks;
}

/** Сьогодні за київським часом: інакше після півночі там ще «вчора» */
export function kyivToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(now);
}
