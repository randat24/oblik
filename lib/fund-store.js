// Розширення в імпортах сусідів стоїть навмисно: файл покритий тестами, а
// вбудований у Node запускач шукає модуль рівно за тим шляхом, який написали.

/**
 * Спільний фонд у таблиці: читання й запис.
 *
 * Правила грошей лежать окремо, у `lib/fund.js`, і про таблиці не знають
 * нічого. Тут навпаки — тільки три листи й перетворення рядків на
 * структури.
 *
 * Листи створюються самі, разом із заголовками: у цьому застосунку немає
 * міграцій, і лист, якого бракує, має з'явитися при першому ж зверненні,
 * а не стати помилкою.
 *
 * Книга **дописується**. Рядок операції не переписується й не
 * видаляється — міняється хіба що статус. Виправлення це скасування плюс
 * новий запис.
 */

import { readSheets, appendRow, appendRows, ensureSheet, writeCells, writeRow } from './sheets.js';
import { kop } from './fund.js';
import { OPENING_MEMBERS, openingConfigRows } from './fund-seed.js';

export const MEMBERS_SHEET = 'Фонд — учасники';
export const OPS_SHEET = 'Фонд — операції';
export const CONFIG_SHEET = 'Фонд — налаштування';

/*
 * Колонки позиційні, тож нові дописуються **тільки в кінець**: лист міг
 * бути створений раніше, і наявні рядки не мають зсуватися.
 */
export const MEMBER_HEADERS = [
  'Ід', 'Імʼя', 'Порядок', 'Початковий баланс', 'Періоди', 'Відпустки',
];
export const OP_HEADERS = [
  'Ід', 'Тип', 'Дата', 'Сума', 'Опис', 'Категорія', 'Платник', 'Режим',
  'Учасники', 'Хто', 'Кому', 'Знак', 'Примітка', 'Статус',
  'Створено', 'Автор', 'Скасовано', 'Причина скасування',
];
export const CONFIG_HEADERS = ['Ключ', 'Значення'];

const MC = { id: 0, name: 1, order: 2, opening: 3, periods: 4, vacations: 5 };
const OC = {
  id: 0, type: 1, date: 2, amount: 3, desc: 4, category: 5, payer: 6, mode: 7,
  participants: 8, member: 9, to: 10, sign: 11, note: 12, status: 13,
  createdAt: 14, author: 15, cancelledAt: 16, cancelReason: 17,
};

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
};

/**
 * Періоди й відпустки лежать одним рядком: «2000-01-01..» або
 * «2026-10-10..2026-10-20», кілька через кому.
 *
 * Окремими листами це було б чистіше, але троє листів уже є, а п'ять
 * читань на сторінку — це хвилинна квота Google, яку ми щойно лагодили.
 */
export function parseRanges(text) {
  return str(text).split(',').map((part) => {
    const [start, end] = part.split('..').map((x) => str(x));
    if (!start) return null;
    return end ? { start, end } : { start };
  }).filter(Boolean);
}

export const rangesText = (list) => (list || [])
  .map((r) => (r.end ? `${r.start}..${r.end}` : `${r.start}..`))
  .join(', ');

export function parseMembers(values) {
  return (values || []).slice(1).map((raw) => {
    const r = [...(raw || [])];
    const id = str(r[MC.id]);
    if (!id) return null;
    return {
      id,
      name: str(r[MC.name]) || id,
      order: num(r[MC.order]),
      opening: kop(r[MC.opening]),
      periods: parseRanges(r[MC.periods]),
      vacations: parseRanges(r[MC.vacations]).filter((v) => v.end),
    };
  }).filter(Boolean);
}

export function parseOps(values) {
  return (values || []).slice(1).map((raw) => {
    const r = [...(raw || [])];
    const id = str(r[OC.id]);
    if (!id) return null;
    return {
      id,
      type: str(r[OC.type]),
      date: str(r[OC.date]),
      amount: kop(r[OC.amount]),
      desc: str(r[OC.desc]),
      category: str(r[OC.category]),
      payer: str(r[OC.payer]),
      mode: str(r[OC.mode]) || 'auto',
      participants: str(r[OC.participants]).split(',').map(str).filter(Boolean),
      member: str(r[OC.member]),
      to: str(r[OC.to]),
      sign: num(r[OC.sign]) < 0 ? -1 : 1,
      note: str(r[OC.note]),
      status: str(r[OC.status]) || 'active',
      createdAt: str(r[OC.createdAt]),
      author: str(r[OC.author]),
      cancelledAt: str(r[OC.cancelledAt]),
      cancelReason: str(r[OC.cancelReason]),
      row: 0,
    };
  }).filter(Boolean).map((o, i) => ({ ...o, row: i + 2 }));
}

export function parseConfig(values) {
  const out = {};
  (values || []).slice(1).forEach((r) => {
    const key = str((r || [])[0]);
    if (key) out[key] = str((r || [])[1]);
  });
  return {
    openingCash: kop(out.openingCash || '0'),
    openingDiff: kop(out.openingDiff || '0'),
    openingDate: out.openingDate || '',
  };
}

/** Рядок операції для запису — у тому самому порядку, що й заголовки */
export function opRow(op) {
  const r = new Array(OP_HEADERS.length).fill('');
  r[OC.id] = op.id;
  r[OC.type] = op.type;
  r[OC.date] = op.date;
  r[OC.amount] = (op.amount / 100).toFixed(2);
  r[OC.desc] = op.desc || '';
  r[OC.category] = op.category || '';
  r[OC.payer] = op.payer || '';
  r[OC.mode] = op.mode || 'auto';
  r[OC.participants] = (op.participants || []).join(',');
  r[OC.member] = op.member || '';
  r[OC.to] = op.to || '';
  r[OC.sign] = op.sign === -1 ? '-1' : '';
  r[OC.note] = op.note || '';
  r[OC.status] = op.status || 'active';
  r[OC.createdAt] = op.createdAt || '';
  r[OC.author] = op.author || '';
  return r;
}

export const memberRow = (m) => {
  const r = new Array(MEMBER_HEADERS.length).fill('');
  r[MC.id] = m.id;
  r[MC.name] = m.name;
  r[MC.order] = String(m.order || 0);
  r[MC.opening] = (m.opening / 100).toFixed(2);
  r[MC.periods] = rangesText(m.periods);
  r[MC.vacations] = rangesText(m.vacations);
  return r;
};

async function ensureAll() {
  await Promise.all([
    ensureSheet(MEMBERS_SHEET, MEMBER_HEADERS),
    ensureSheet(OPS_SHEET, OP_HEADERS),
    ensureSheet(CONFIG_SHEET, CONFIG_HEADERS),
  ]);
}

/** Усе, що потрібно сторінці, — трьома листами в одній відповіді */
export async function readFund() {
  await ensureAll();
  const [mv, ov, cv] = await readSheets([MEMBERS_SHEET, OPS_SHEET, CONFIG_SHEET]);
  return {
    members: parseMembers(mv),
    ops: parseOps(ov),
    config: parseConfig(cv),
  };
}

/** Нова операція — завжди дописуванням у кінець */
export async function addOp(op) {
  await ensureSheet(OPS_SHEET, OP_HEADERS);
  await appendRow(OPS_SHEET, opRow(op), { raw: true });
  return op;
}

/**
 * Скасування: міняємо статус і дописуємо причину.
 *
 * Самого рядка не чіпаємо — у ньому лишається все, що було проведено.
 */
export async function cancelOp(row, { reason, at, who }) {
  await writeCells(OPS_SHEET, [
    { row, col: OC.status + 1, value: 'cancelled' },
    { row, col: OC.cancelledAt + 1, value: at },
    { row, col: OC.cancelReason + 1, value: `${reason}${who ? ` (${who})` : ''}` },
  ], { raw: true });
}

/** Учасник: періоди членства й відпустки правляться на місці */
export async function saveMember(row, member) {
  await writeRow(MEMBERS_SHEET, row, memberRow(member));
}


/**
 * Записати початковий стан.
 *
 * Робиться один раз і тільки в порожній фонд: якщо учасники вже є,
 * відмовляємось і нічого не чіпаємо. Другий запуск інакше подвоїв би
 * усім початкові баланси, і помітили б це не одразу.
 */
export async function seedFund() {
  await ensureAll();
  const [mv, , cv] = await readSheets([MEMBERS_SHEET, OPS_SHEET, CONFIG_SHEET]);

  const have = parseMembers(mv);
  if (have.length) {
    const err = new Error(`Фонд уже заповнено: учасників ${have.length}`);
    err.already = true;
    throw err;
  }

  await appendRows(MEMBERS_SHEET, OPENING_MEMBERS.map(memberRow), { raw: true });
  // налаштування дописуємо лише ті, яких ще немає
  const known = new Set(Object.keys(parseConfig(cv)).length ? (cv || []).slice(1).map((r) => String((r || [])[0] || '').trim()) : []);
  const rows = openingConfigRows().filter(([k]) => !known.has(k));
  if (rows.length) await appendRows(CONFIG_SHEET, rows, { raw: true });

  return { members: OPENING_MEMBERS.length, config: rows.length };
}
