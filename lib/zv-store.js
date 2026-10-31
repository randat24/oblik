/**
 * Єдиний код, що говорить із листами «Зв'язок — …».
 *
 * Правила ті самі, що в усьому застосунку: колонки позиційні й дописуються
 * лише в кінець, текст пишемо в режимі RAW (назва «=…» не має стати
 * формулою, а 16-значний серійник — числом із втраченими цифрами), рядки
 * реєстру не видаляються — позиція, якої вже немає, просто має нуль на
 * обліку й лишається в історії.
 */

import {
  readSheets, appendRow, appendRows, ensureSheet, ensureColumn, writeRow,
} from './sheets.js';
import {
  ZV_SHEET, ZV_MOVES_SHEET, ZV_ACTS_SHEET, ZV_ACT_HEADS_SHEET, ZV_NORMS_SHEET,
  ZV_HEADERS, MOVE_HEADERS, ACT_HEADERS, ACT_HEAD_HEADERS, NORM_HEADERS,
  parsePositions, parseMoves, parseActs, parseNorms, posRow, moveRow, actRow,
} from './zv.js';
import { kyivParts } from './log.js';

const SHEETS = [
  [ZV_SHEET, ZV_HEADERS],
  [ZV_MOVES_SHEET, MOVE_HEADERS],
  [ZV_ACTS_SHEET, ACT_HEADERS],
  [ZV_ACT_HEADS_SHEET, ACT_HEAD_HEADERS],
  [ZV_NORMS_SHEET, NORM_HEADERS],
];

/*
 * Листи створюються за першим зверненням. Перевірка смикає метадані таблиці,
 * а квота на читання мала, тож після першої вдалої перевірки процес її вже
 * не повторює.
 */
let ready = false;
async function ensureAll() {
  if (ready) return;
  for (const [name, headers] of SHEETS) await ensureSheet(name, headers);
  ready = true;
}

export const newId = (prefix = 'zv') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function stamp() {
  const { date, time } = kyivParts();
  return { date, time, at: `${date} ${time}` };
}

/** Усе, що потрібно розділу, — одним запитом до таблиці */
export async function readZv() {
  await ensureAll();
  const [pv, mv, av, hv, nv] = await readSheets(SHEETS.map(([n]) => n));
  // лист міг бути створений до нових колонок — дописуємо заголовки в кінець
  for (const [values, [name, headers]] of [[pv, SHEETS[0]], [mv, SHEETS[1]]]) {
    const have = ((values && values[0]) || []).length;
    for (let i = have; i < headers.length && have > 0; i += 1) await ensureColumn(name, headers.slice(0, i), headers[i]);
  }
  return {
    positions: parsePositions(pv),
    moves: parseMoves(mv).reverse(),
    acts: parseActs(av, hv),
    norms: parseNorms(nv),
  };
}

export async function addPositions(list) {
  await ensureAll();
  if (list.length) await appendRows(ZV_SHEET, list.map(posRow), { raw: true });
}

export async function savePosition(p) {
  await writeRow(ZV_SHEET, p.row, posRow(p), { raw: true });
}

export async function addMoves(list) {
  await ensureAll();
  if (list.length) await appendRows(ZV_MOVES_SHEET, list.map(moveRow), { raw: true });
}

export async function addAct(head, items) {
  await ensureAll();
  // спершу рядки, потім шапка: акт без шапки на екрані не з'явиться,
  // а шапка без рядків показала б порожній документ
  await appendRows(ZV_ACTS_SHEET, items.map((a) => actRow(head.key, a)), { raw: true });
  await appendRow(ZV_ACT_HEADS_SHEET,
    [head.key, head.date, head.created, head.who, head.head, head.title, head.footer], { raw: true });
}

export async function addNorms(list) {
  await ensureAll();
  if (list.length) await appendRows(ZV_NORMS_SHEET, list.map((n) => [n.name, String(n.qty || 0), n.keys, n.note || '']), { raw: true });
}

export async function saveNorm(n) {
  await writeRow(ZV_NORMS_SHEET, n.row, [n.name, String(n.qty || 0), n.keys, n.note || ''], { raw: true });
}
