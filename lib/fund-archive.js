// Розширення в імпортах сусідів стоїть навмисно: файл покритий тестами, а
// вбудований у Node запускач шукає модуль рівно за тим шляхом, який написали.

/**
 * Архів фонду: стара таблиця «каса ВУ», яку вели до 15.10.2026.
 *
 * Це лише розбір і звірка, жодних записів у таблицю. Старий облік перенесено
 * як архів, а не як операції книги: баланси від нього не рахуються, бо
 * актуальний стан тримається на знімку на 15.10 (його підтвердили люди).
 * Архів потрібен, щоб бачити, звідки взялись ці числа, і щоб перевірити, що
 * вони сходяться.
 *
 * Як влаштована стара таблиця. Кожній людині відповідає пара колонок:
 * підпис і сума. Додатне число в сумі — людина винна в касу, відʼємне —
 * каса винна їй. Кожен рядок, окрім заокруглень, дає в сумі нуль: гроші лише
 * перерозподіляються. Колонка «Александр» — це власник каси, і її підсумок
 * дорівнює готівці. Підсумки внизу (рядок з числами в колонках підписів)
 * набрані руками, а не порахованi формулою — звідси й розбіжності, які
 * показує `reconcile`.
 */

import { kop } from './fund.js';

/** Люди старої таблиці: `at` — колонка суми (0-based), `label` — колонка підпису */
export const OLD_PEOPLE = [
  { id: 'denis', name: 'Денис', label: 0, at: 1 },
  { id: 'alex', name: 'Алекс', label: 2, at: 3 },
  { id: 'fantomas', name: 'Фантомас', label: 4, at: 5 },
  { id: 'vanya', name: 'Ваня', label: 6, at: 7 },
  { id: 'fess', name: 'Фесс', label: 8, at: 9 },
  { id: 'petya', name: 'Петя', label: 10, at: 11 },
  { id: 'walter', name: 'Вальтер', label: 12, at: 13 },
];

/** Права таблиця витрат: підпис, сума, частка */
const RIGHT = { label: 15, total: 16 };

const pad = (n) => String(n).padStart(2, '0');

/** Число з клітинки: «-1 234,5» → копійки; не число → null */
export function cell(value) {
  const s = String(value ?? '').trim();
  if (!s || !/^[-−]?[\d\s ]+([.,]\d+)?$/.test(s)) return null;
  const k = kop(s.replace('−', '-'));
  return Number.isFinite(k) ? k : null;
}

/* ---------- Дати ---------- */

/**
 * Дата з підпису: «13/03/24», «17/06/25», «13.08», «9-15.10», «16.08 …».
 * Повертає { d, m, y|null } — день береться останній, якщо діапазон.
 */
export function dateIn(text) {
  const s = String(text ?? '');
  let m = s.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return { d: Number(m[1]), m: Number(m[2]), y };
  }
  // діапазон днів: «9-15.10», «22-25.09», «12-16.10»
  m = s.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\.(\d{1,2})(?!\d)/);
  if (m) return { d: Number(m[2]), m: Number(m[3]), y: null };
  m = s.match(/(?:^|[^\d])(\d{1,2})[./](\d{1,2})(?![\d/.])/);
  if (m && Number(m[1]) <= 31 && Number(m[2]) <= 12) return { d: Number(m[1]), m: Number(m[2]), y: null };
  return null;
}

/**
 * Дати рядків. Року в більшості підписів немає, тож він виводиться з порядку:
 * таблиця йде за часом, і коли місяць «перескакує» назад, почався новий рік.
 * Точкою відліку служать дати з роком.
 */
export function assignDates(rows, start = { y: 2024, m: 3 }) {
  let y = start.y;
  let m = start.m;
  let d = 13;
  return rows.map((r) => {
    const hit = r.dates.map(dateIn).filter(Boolean).pop();
    // `approx`: у рядка своєї дати немає, береться остання відома
    r.approx = !hit;
    if (hit && hit.m >= 1 && hit.m <= 12) {
      if (hit.y) { y = hit.y; } else if (hit.m <= m - 4) { y += 1; }
      m = hit.m;
      d = hit.d;
    }
    return `${y}-${pad(m)}-${pad(Math.min(d, new Date(Date.UTC(y, m, 0)).getUTCDate()))}`;
  });
}

/* ---------- Розбір рядка ---------- */

const near = (a, b, tol) => Math.abs(a - b) <= tol;

/**
 * Що означає рядок: витрата, переказ чи суміш. Лише для показу, баланси
 * від цього не залежать — вони беруться з сирих змін по людях.
 *
 * Частка всіх, хто «просто бере участь», однакова (в гривнях, з точністю до
 * заокруглення); платник — єдиний з відʼємним числом. Що лишилось після
 * витрати, має складатись у перекази. Якщо ні — рядок «змішаний».
 */
export function explain(by, total = null) {
  const tol = 150; // 1,50 грн: таблиця округлює частки до гривні
  const ids = Object.keys(by).filter((id) => Math.abs(by[id]) > tol);
  if (!ids.length) return { kind: 'empty' };

  const pos = ids.filter((id) => by[id] > 0);
  const neg = ids.filter((id) => by[id] < 0);

  // переказ: двоє, суми рівні й протилежні
  if (ids.length === 2 && pos.length === 1 && neg.length === 1 && near(by[pos[0]], -by[neg[0]], tol * 2)) {
    return { kind: 'transfer', from: neg[0], to: pos[0], amount: by[pos[0]] };
  }

  // витрата: частка — та, що найчастіше повторюється серед додатних
  const counts = new Map();
  pos.forEach((id) => {
    const key = [...counts.keys()].find((k) => near(k, by[id], tol));
    counts.set(key ?? by[id], (counts.get(key ?? by[id]) || 0) + 1);
  });
  let share = 0;
  let k = 0;
  counts.forEach((n, v) => { if (n > k || (n === k && v > share)) { k = n; share = v; } });
  if (k >= 2 && neg.length >= 1) {
    const eaters = pos.filter((id) => near(by[id], share, tol));
    const payer = [...neg].sort((a, b) => by[a] - by[b])[0];
    // платник їсть теж, якщо суми сходяться: його число = частка − уся витрата
    const eating = [...eaters];
    let spent = -by[payer];
    const t = total && total > 0 ? total : null;
    const withPayer = (eaters.length + 1) * share;
    const without = eaters.length * share;
    let payerEats = true;
    if (t) payerEats = Math.abs(t - withPayer) <= Math.abs(t - without);
    if (payerEats) { eating.push(payer); spent += share; }
    const rest = {};
    ids.forEach((id) => { rest[id] = by[id]; });
    eating.forEach((id) => { if (id !== payer) rest[id] = (rest[id] || 0) - share; });
    rest[payer] = (rest[payer] || 0) + spent - (payerEats ? share : 0);
    const left = Object.entries(rest).filter(([, v]) => Math.abs(v) > tol);
    const out = { kind: 'expense', payer, parts: eating, share, total: spent };
    if (!left.length) return out;
    // залишок — перекази, якщо складається в пари
    const transfers = pairUp(Object.fromEntries(left), tol * 2);
    if (transfers) return { ...out, transfers };
  }
  return { kind: 'mixed' };
}

/** Розкласти набір змін у перекази між парами; null, якщо не виходить */
function pairUp(vals, tol) {
  const give = Object.entries(vals).filter(([, v]) => v < 0).map(([id, v]) => [id, -v]);
  const take = Object.entries(vals).filter(([, v]) => v > 0);
  const out = [];
  while (give.length && take.length) {
    give.sort((a, b) => b[1] - a[1]);
    take.sort((a, b) => b[1] - a[1]);
    const x = Math.min(give[0][1], take[0][1]);
    out.push({ from: give[0][0], to: take[0][0], amount: x });
    give[0][1] -= x; take[0][1] -= x;
    if (give[0][1] <= tol) give.shift();
    if (take[0][1] <= tol) take.shift();
  }
  const left = [...give, ...take].reduce((a, [, v]) => a + Math.abs(v), 0);
  return left <= tol * 2 && out.length ? out : null;
}

/**
 * Усі рядки старої таблиці з даними → записи архіву.
 *
 * `grid` — двовимірний масив комірок як у CSV. Рядки без жодної суми
 * пропускаються. Номер — рядок аркуша (з 1), щоб будь-яку цифру можна було
 * знайти в оригіналі.
 */
export function parseOldTable(grid, { first = 5, last = 485 } = {}) {
  const raw = [];
  for (let i = first - 1; i < Math.min(last, grid.length); i += 1) {
    const r = grid[i] || [];
    const by = {};
    let any = false;
    OLD_PEOPLE.forEach((p) => {
      const v = cell(r[p.at]);
      if (v) { by[p.id] = v; any = true; }
    });
    if (!any) continue;
    const labels = OLD_PEOPLE.map((p) => String(r[p.label] ?? '').trim()).filter(Boolean);
    const right = String(r[RIGHT.label] ?? '').trim();
    const listed = cell(r[RIGHT.total]);
    raw.push({ n: i + 1, by, labels, right, listed, ...explain(by, listed) });
  }

  /*
   * Права таблиця — перелік витрат, і вона йде не рядок у рядок з лівою:
   * у лівій між витратами стоять перекази. Тому її підпис і дату беремо,
   * лише коли сума витрати зійшлась із лівим рядком; у решти — те, що
   * написано в лівій частині.
   */
  const aligned = (r) => r.kind === 'expense' && r.listed && Math.abs(r.listed - r.total) <= 300;
  raw.forEach((r) => { r.useRight = aligned(r) && r.right; });
  raw.forEach((r) => { r.dates = r.useRight ? [...r.labels, r.right] : r.labels; });
  const dates = assignDates(raw);

  const isDate = (l) => /^\d{1,2}[./]\d{1,2}([./]\d{2,4})?$/.test(l);
  return raw.map((r, i) => {
    const note = r.labels.filter((l) => !isDate(l)).join(' · ');
    const rightText = r.useRight && !/^[\d\s./-]+$/.test(r.right) ? r.right : '';
    const desc = rightText || note;
    const out = {
      n: r.n,
      date: dates[i],
      approx: r.approx,
      desc: desc.slice(0, 120),
      note: rightText && note ? note.slice(0, 160) : '',
      by: r.by,
      kind: r.kind,
    };
    ['payer', 'parts', 'share', 'total', 'transfers', 'from', 'to', 'amount'].forEach((k) => {
      if (r[k] !== undefined) out[k] = r[k];
    });
    return out;
  });
}

/* ---------- Звірка ---------- */

/** Підсумки, набрані руками внизу старої таблиці: перша колонка кожної пари */
export function typedTotals(grid, row = 491) {
  const r = grid[row - 1] || [];
  const out = {};
  OLD_PEOPLE.forEach((p) => {
    const v = cell(r[p.label]);
    if (v !== null) out[p.id] = v;
  });
  return out;
}

/** Сума змін по кожній людині за всіма рядками */
export function sumByPerson(rows) {
  const out = {};
  rows.forEach((r) => Object.entries(r.by).forEach(([id, v]) => { out[id] = (out[id] || 0) + v; }));
  return out;
}

/**
 * Звірка: що дають рядки таблиці й що записано в підсумку.
 *
 * `typed` — підсумки як їх набрали руками, `sums` — арифметика по рядках.
 * Різниця `typed − sums` — те, чого рядки не пояснюють. У нуля все гаразд.
 */
export function reconcile(rows, typed) {
  const sums = sumByPerson(rows);
  return OLD_PEOPLE.map((p) => {
    const sum = sums[p.id] || 0;
    const t = typed[p.id] ?? 0;
    return { id: p.id, name: p.name, sum, typed: t, diff: t - sum };
  });
}

/**
 * Старі знаки — у знаки застосунку. У таблиці плюс означає «винен у касу»,
 * у застосунку баланс додатний, коли винен фонд. Каса (колонка власника) —
 * готівка, а не борг, тому її знак лишається.
 */
export const toAppBalance = (id, v) => (id === 'alex' ? v : -v);
