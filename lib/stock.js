import { readSheet, appendRow, ensureSheet, todayStr } from './sheets';

// Великий склад: техніка, човни, мотори, ящики. Одна позиція — один рядок,
// а кожне приймання чи списання лягає окремим рядком у лист руху.
export const STOCK_SHEET = 'Майно Рибаківки';
export const MOVES_SHEET = 'Рух Рибаківки';

export const STOCK_HEADERS = [
  'ID', 'Категорія', 'Найменування', 'Опис', 'Од. виміру',
  'Прийнято', 'Списано', 'Залишок', 'Місце',
  'Фото 1', 'Фото 2', 'Примітки', 'Оновлено',
];

export const MOVE_HEADERS = [
  'Дата', 'Час', 'ID', 'Найменування', 'Дія', 'К-сть', 'Залишок після',
  'Хто', 'Примітка', 'Фото',
];

// 0-based індекси колонок листа позицій
export const C = {
  id: 0, category: 1, name: 2, description: 3, unit: 4,
  received: 5, writtenOff: 6, remainder: 7, place: 8,
  photo1: 9, photo2: 10, notes: 11, updated: 12,
};

export const FIELD_LABELS = {
  category: 'Категорія', name: 'Найменування', description: 'Опис',
  unit: 'Од. виміру', place: 'Місце', notes: 'Примітки',
  photo1: 'Фото 1', photo2: 'Фото 2',
};

export const DEFAULT_UNITS = ['шт.', 'к-т', 'пара', 'м', 'кг', 'л', 'ящик'];

let ensured = false;
async function ensureSheets() {
  if (ensured) return;
  await ensureSheet(STOCK_SHEET, STOCK_HEADERS);
  await ensureSheet(MOVES_SHEET, MOVE_HEADERS);
  ensured = true;
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
};
const str = (v) => (v === null || v === undefined ? '' : String(v));

export function parseStockItems(values) {
  if (!values || values.length < 2) return [];
  const out = [];
  values.slice(1).forEach((raw, i) => {
    const row = [...raw];
    while (row.length < STOCK_HEADERS.length) row.push('');
    if (row.join('').trim() === '') return;
    const received = num(row[C.received]);
    const writtenOff = num(row[C.writtenOff]);
    out.push({
      row: i + 2,
      id: str(row[C.id]).trim(),
      category: str(row[C.category]).trim(),
      name: str(row[C.name]),
      description: str(row[C.description]),
      unit: str(row[C.unit]).trim(),
      received,
      writtenOff,
      // залишок завжди рахуємо, а не довіряємо клітинці
      remainder: received - writtenOff,
      place: str(row[C.place]).trim(),
      photo1: str(row[C.photo1]).trim(),
      photo2: str(row[C.photo2]).trim(),
      notes: str(row[C.notes]),
      updated: str(row[C.updated]),
    });
  });
  return out;
}

function parseMoves(values) {
  if (!values || values.length < 2) return [];
  return values
    .slice(1)
    .map((raw) => {
      const p = [...raw];
      while (p.length < MOVE_HEADERS.length) p.push('');
      return {
        date: str(p[0]), time: str(p[1]), id: str(p[2]).trim(), name: str(p[3]),
        action: str(p[4]), qty: num(p[5]), left: str(p[6]),
        who: str(p[7]), note: str(p[8]), photo: str(p[9]).trim(),
      };
    })
    .filter((m) => m.id || m.name);
}

/** Наступний вільний ID у форматі Р-001 */
export function nextId(items) {
  let max = 0;
  items.forEach((it) => {
    const n = parseInt(String(it.id).replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return 'Р-' + String(max + 1).padStart(3, '0');
}

/** Унікальні значення поля — для підказок у формах */
function options(items, key, extra = []) {
  const seen = {};
  [...items.map((it) => it[key]), ...extra].forEach((v) => {
    const raw = String(v || '').replace(/\s+/g, ' ').trim();
    if (!raw) return;
    const k = raw.toLowerCase();
    if (!seen[k]) seen[k] = raw;
  });
  return Object.values(seen).sort((a, b) => a.localeCompare(b, 'uk'));
}

export async function readStock() {
  await ensureSheets();
  const [itemValues, moveValues] = await Promise.all([
    readSheet(STOCK_SHEET),
    readSheet(MOVES_SHEET),
  ]);
  const items = parseStockItems(itemValues);
  const moves = parseMoves(moveValues);
  return {
    items,
    moves,
    values: itemValues,
    categories: options(items, 'category'),
    units: options(items, 'unit', DEFAULT_UNITS),
    places: options(items, 'place'),
    people: options(moves, 'who'),
  };
}

/** Рядок для нової позиції */
export function stockRow({ id, category, name, description, unit, received, writtenOff, place, photo1, photo2, notes, date }) {
  const row = new Array(STOCK_HEADERS.length).fill('');
  row[C.id] = id;
  row[C.category] = category || '';
  row[C.name] = name || '';
  row[C.description] = description || '';
  row[C.unit] = unit || '';
  row[C.received] = num(received);
  row[C.writtenOff] = num(writtenOff);
  row[C.remainder] = num(received) - num(writtenOff);
  row[C.place] = place || '';
  row[C.photo1] = photo1 || '';
  row[C.photo2] = photo2 || '';
  row[C.notes] = notes || '';
  row[C.updated] = date || todayStr();
  return row;
}

export async function appendMove({ id, name, action, qty, left, who, note, photo, date }) {
  await ensureSheets();
  const fmt = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  await appendRow(MOVES_SHEET, [
    date || todayStr(), fmt.format(new Date()), id, name, action,
    num(qty), left, who || '', note || '', photo || '',
  ]);
}
