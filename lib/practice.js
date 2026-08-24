/**
 * Щоденник практики.
 *
 * Уроки закінчуються — і саме там більшість зупиняється. Пройдені
 * тридцять завдань дають відчуття, що вмієш, але вміння починається на
 * першій зміні, яку ніхто не задавав: коли хочеться, щоб на картці було
 * видно вагу, і ніякої підказки поруч немає.
 *
 * Цей щоденник — місце, куди такі зміни записуються. Не «сьогодні вчив
 * масиви», а «хотів показати вагу на картці, зробив у pages/zbir.js,
 * зламалось бо weight буває порожній, зрозумів різницю між 0 і null».
 *
 * Навіщо записувати:
 *   — за пів року це готова відповідь на «що ви робили» на співбесіді;
 *   — те, на чому спіткнувся й записав, вдруге не забирає день;
 *   — видно рух: тридцять записів — це вже не «проходив курс».
 *
 * Тут лише правила й розбір рядків. Жодного React і жодного читання
 * таблиць — щоб питання щоденника можна було міняти, не чіпаючи сторінку.
 */

export const PRACTICE_SHEET = 'Здоровʼя — практика';

export const PRACTICE_HEADERS = [
  'Дата', 'Що хотів', 'Що зробив', 'Де', 'Що зламалось', 'Що зрозумів', 'Хвилин',
];

export const PR = {
  date: 0, want: 1, did: 2, where: 3, broke: 4, learned: 5, mins: 6,
};

/**
 * Питання запису.
 *
 * Їх пʼять, і кожне тут не випадково. «Що хотів» відділяє задачу від
 * коду — через місяць саме воно пояснює, навіщо все це було. «Де» —
 * щоб можна було відкрити й подивитись. «Що зламалось» найцінніше:
 * помилки повторюються, і записана колись причина економить вечір.
 *
 * Обовʼязкове тільки перше поле. Щоденник, який вимагає заповнити сім
 * клітинок, не ведуть — його кидають на третьому записі.
 */
export const FIELDS = [
  {
    key: 'want', label: 'Що хотів зробити', required: true,
    hint: 'Задача людською мовою, без коду',
    example: 'Щоб на картці посилки було видно сумарну вагу мішків',
  },
  {
    key: 'did', label: 'Що зробив',
    hint: 'Коротко: який підхід спрацював',
    example: 'Порахував reduce-ом у partsOf і показав поруч із кількістю місць',
  },
  {
    key: 'where', label: 'Де',
    hint: 'Файл або сторінка — щоб потім знайти',
    example: 'lib/delivery.js, pages/index.js',
  },
  {
    key: 'broke', label: 'Що зламалось',
    hint: 'І чому. Це найцінніший рядок запису',
    example: 'Показувало 0 кг там, де ваги просто не вписали: Number("") дає нуль',
  },
  {
    key: 'learned', label: 'Що зрозумів',
    hint: 'Одне речення, яке варто памʼятати',
    example: 'Порожнє поле — це не нуль, і різницю треба тримати аж до екрана',
  },
];

/**
 * Підказки, коли записати нічого. Не «зроби застосунок», а зміна на
 * вечір: достатньо мала, щоб дійти до кінця, і достатньо справжня, щоб
 * зіткнутися з чужим кодом.
 */
export const IDEAS = [
  { t: 'Показати вагу поруч із назвою', d: 'На картці посилки вже є місця — додайте до кожного вагу.', where: 'pages/index.js' },
  { t: 'Порахувати середнє', d: 'Скільки кілограмів у середньому в одній посилці за тиждень.', where: 'lib/delivery.js' },
  { t: 'Свій фільтр', d: 'Кнопка «важчі за 10 кг» поруч із наявними фільтрами.', where: 'pages/index.js' },
  { t: 'Змінити колір етапу', d: 'Знайдіть, звідки береться колір смужки, і зробіть свій.', where: 'styles/globals.css' },
  { t: 'Нове поле в щоденнику', d: 'Додайте до цього щоденника питання, якого вам бракує.', where: 'lib/practice.js' },
  { t: 'Порахувати свої записи', d: 'Виведіть, скільки разів ви писали сюди цього місяця.', where: 'lib/practice.js' },
  { t: 'Підказка при помилці', d: 'Зробіть текст помилки зрозумілішим у формі, яка вас дратує.', where: 'pages/zbir.js' },
  { t: 'Свій тест', d: 'Напишіть тест на функцію, яку щойно правили, і зламайте її навмисно.', where: 'tests/' },
];

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** «16.08.2026» → мітка часу */
export function stampOf(d) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(str(d));
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0;
}

export function parsePractice(values) {
  const out = [];
  (values || []).slice(1).forEach((raw, i) => {
    const r = [...(raw || [])];
    const want = str(r[PR.want]);
    const date = str(r[PR.date]);
    if (!want && !date) return;
    out.push({
      row: i + 2,
      date,
      want,
      did: str(r[PR.did]),
      where: str(r[PR.where]),
      broke: str(r[PR.broke]),
      learned: str(r[PR.learned]),
      mins: num(r[PR.mins]),
      t: stampOf(date),
    });
  });
  // найновіші згори: щоденник читають з кінця
  return out.sort((a, b) => b.t - a.t || b.row - a.row);
}

export function practiceRow(e) {
  const r = new Array(PRACTICE_HEADERS.length).fill('');
  r[PR.date] = str(e.date);
  r[PR.want] = str(e.want);
  r[PR.did] = str(e.did);
  r[PR.where] = str(e.where);
  r[PR.broke] = str(e.broke);
  r[PR.learned] = str(e.learned);
  r[PR.mins] = num(e.mins) || '';
  return r;
}

/** Різні дні, у які щось робилося */
export const daysOf = (list) => [...new Set((list || []).map((e) => e.date).filter(Boolean))];

/**
 * Скільки днів поспіль. Учорашній день теж рахується початком: людина,
 * яка сьогодні ще не сідала, не має бачити обнулену серію.
 */
export function streakOf(list, today) {
  const days = new Set(daysOf(list));
  const t0 = stampOf(today);
  if (!t0) return 0;
  const fmt = (ms) => {
    const d = new Date(ms);
    const p = (x) => String(x).padStart(2, '0');
    return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  };
  const DAY = 86400000;
  const start = days.has(fmt(t0)) ? t0 : (days.has(fmt(t0 - DAY)) ? t0 - DAY : 0);
  if (!start) return 0;
  let n = 0;
  for (let t = start; days.has(fmt(t)); t -= DAY) n++;
  return n;
}

/**
 * Підсумок щоденника. Окремо рахуються записи з розібраною поломкою:
 * саме вони, а не кількість вечорів, показують, що людина працює з
 * чужим кодом, а не переписує приклади.
 */
export function statsOf(list, today) {
  const all = list || [];
  const mins = all.reduce((a, e) => a + e.mins, 0);
  return {
    entries: all.length,
    days: daysOf(all).length,
    streak: streakOf(all, today),
    fixed: all.filter((e) => e.broke).length,
    hours: Math.round((mins / 60) * 10) / 10,
    last: all[0]?.date || '',
    files: [...new Set(all.flatMap((e) => e.where.split(',').map((x) => x.trim()).filter(Boolean)))],
  };
}

/**
 * Що показати замість порожнього списку ідей: беремо ту, з якою людина
 * ще не поралась. Порівнюємо за назвою — грубо, зате без зайвих полів
 * у таблиці, які довелося б заповнювати руками.
 */
export function freshIdeas(list, n = 3) {
  const seen = (list || []).map((e) => `${e.want} ${e.did}`.toLowerCase()).join(' ');
  const rest = IDEAS.filter((i) => !seen.includes(i.t.toLowerCase()));
  return (rest.length ? rest : IDEAS).slice(0, n);
}
