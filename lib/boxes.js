import { readSheet, appendRow, appendRows, ensureSheet, writeRow, todayStr, fromSerial } from './sheets.js';

// Вміст ящика окремими позиціями. Досі це був один текстовий рядок у листі
// «Склад» — знайти в ньому «ПНВ» пошуком можна, а взяти звідти одну штуку з
// чотирьох чи побачити, що вона облікова, — ні. Тепер одна річ у ящику — це
// один рядок, а кожне взяття чи повернення лягає рядком у лист руху.
export const LINES_SHEET = 'Вміст ящиків';
export const MOVES_SHEET = 'Рух ящиків';

export const LINE_HEADERS = [
  'Ящик', 'Назва', 'Всього', 'Взято', 'На місці', 'Од.',
  'Облік', 'Примітка', 'Оновлено',
];

export const MOVE_HEADERS = [
  'Дата', 'Час', 'Ящик', 'Назва', 'Дія', 'К-сть', 'На місці після',
  'Хто', 'Кому / куди', 'Примітка',
];

// 0-based індекси колонок листа позицій
export const C = {
  box: 0, name: 1, total: 2, taken: 3, left: 4, unit: 5,
  accounting: 6, note: 7, updated: 8,
};

export const FIELD_LABELS = {
  name: 'Назва', total: 'Всього', unit: 'Од.',
  accounting: 'Облік', note: 'Примітка',
};

export const ACCOUNTING_OPTIONS = ['Облікове', 'Необлікове'];
export const DEFAULT_UNITS = ['шт.', 'к-т', 'пара', 'м', 'кг', 'л'];

// Дії над позицією. «Взяв» і «Повернув» рухають лише кількість на руках,
// «Додав» і «Списав» змінюють саму норму ящика.
export const ACTIONS = {
  take: 'Взяв',
  give: 'Повернув',
  add: 'Додав',
  writeOff: 'Списав',
  replace: 'Замінив',
};

let ensured = false;
async function ensureSheets() {
  if (ensured) return;
  await ensureSheet(LINES_SHEET, LINE_HEADERS);
  await ensureSheet(MOVES_SHEET, MOVE_HEADERS);
  ensured = true;
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
};
const str = (v) => (v === null || v === undefined ? '' : String(v));

export function parseLines(values) {
  if (!values || values.length < 2) return [];
  const out = [];
  values.slice(1).forEach((raw, i) => {
    const row = [...(raw || [])];
    while (row.length < LINE_HEADERS.length) row.push('');
    if (row.join('').trim() === '') return;
    const total = num(row[C.total]);
    const taken = num(row[C.taken]);
    out.push({
      row: i + 2,
      box: str(row[C.box]).trim(),
      name: str(row[C.name]).trim(),
      total,
      taken,
      // «на місці» завжди рахуємо, а не довіряємо клітинці
      left: total - taken,
      unit: str(row[C.unit]).trim(),
      accounting: str(row[C.accounting]).trim(),
      note: str(row[C.note]),
      updated: fromSerial(row[C.updated]),
    });
  });
  return out;
}

function parseMoves(values) {
  if (!values || values.length < 2) return [];
  return values
    .slice(1)
    .map((raw) => {
      const p = [...(raw || [])];
      while (p.length < MOVE_HEADERS.length) p.push('');
      return {
        date: fromSerial(p[0]), time: fromSerial(p[1], 'time'),
        box: str(p[2]).trim(), name: str(p[3]), action: str(p[4]),
        qty: num(p[5]), left: str(p[6]), who: str(p[7]),
        to: str(p[8]), note: str(p[9]),
      };
    })
    .filter((m) => m.box || m.name);
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

export async function readLines() {
  await ensureSheets();
  const [lineValues, moveValues] = await Promise.all([
    readSheet(LINES_SHEET),
    readSheet(MOVES_SHEET),
  ]);

  // лист міг бути створений до появи нових колонок — дописуємо заголовки
  if ((lineValues[0] || []).length < LINE_HEADERS.length) {
    await writeRow(LINES_SHEET, 1, LINE_HEADERS);
    lineValues[0] = [...LINE_HEADERS];
  }

  const lines = parseLines(lineValues);
  const moves = parseMoves(moveValues);
  return {
    lines,
    moves,
    names: options(lines, 'name'),
    units: options(lines, 'unit', DEFAULT_UNITS),
    people: options(moves, 'to'),
  };
}

/** Рядок листа для позиції */
export function lineRow({ box, name, total, taken, unit, accounting, note, date }) {
  const row = new Array(LINE_HEADERS.length).fill('');
  row[C.box] = box || '';
  row[C.name] = name || '';
  row[C.total] = num(total);
  row[C.taken] = num(taken);
  row[C.left] = num(total) - num(taken);
  row[C.unit] = unit || '';
  row[C.accounting] = accounting || '';
  row[C.note] = note || '';
  row[C.updated] = date || todayStr();
  return row;
}

export async function appendMove({ box, name, action, qty, left, who, to, note, date }) {
  await ensureSheets();
  const fmt = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  await appendRow(MOVES_SHEET, [
    date || todayStr(), fmt.format(new Date()), box, name, action,
    num(qty), left, who || '', to || '', note || '',
  ], { raw: true });
}

/**
 * Розбирає старий текстовий вміст ящика на позиції.
 * «ПНВ 4 шт, підсумки порожні 2 шт» → дві позиції з кількостями.
 * Кількість шукаємо і в кінці, і на початку шматка; якщо її немає — одна штука.
 */
export function parseContents(text) {
  const chunks = String(text || '')
    /*
     * Кома тут працює двома різними способами: вона й розділяє позиції
     * («ПНВ 4 шт, кабель 2 шт»), і стоїть усередині числа («трос 2,5 м»)
     * — українська локаль пише дроби саме так. Тому кому між цифрами не
     * чіпаємо: інакше трос перетворювався на дві позиції, «трос 2» і
     * «5 м», і в ящику зʼявлялось те, чого туди ніхто не клав.
     */
    .split(/[\n;•·]+|(?<!\d),(?!\d)|(?:\s+[-–—]\s+)/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const out = [];
  chunks.forEach((chunk) => {
    let name = chunk;
    let total = null;
    let unit = '';

    // «4 шт», «4шт.», «4 к-т», «х4», «x 4» у кінці
    const tail = /(?:^|\s|[xх×])\s*(\d+(?:[.,]\d+)?)\s*(шт\.?|штук[иа]?|к-?т\.?|компл\.?|пар[аи]?|м|кг|л)?\s*$/i.exec(name);
    if (tail) {
      total = Number(tail[1].replace(',', '.'));
      unit = normUnit(tail[2]);
      name = name.slice(0, tail.index).trim();
    } else {
      // «4 ПНВ» — кількість попереду
      const head = /^(\d+(?:[.,]\d+)?)\s*(шт\.?|штук[иа]?|к-?т\.?|компл\.?|пар[аи]?)?\s+(.+)$/i.exec(name);
      if (head) {
        total = Number(head[1].replace(',', '.'));
        unit = normUnit(head[2]);
        name = head[3].trim();
      }
    }

    name = name.replace(/^[-–—\s]+|[-–—\s:]+$/g, '').trim();
    if (!name) return;
    out.push({ name, total: total === null || total <= 0 ? 1 : total, unit: unit || 'шт.' });
  });
  return out;
}

function normUnit(raw) {
  const s = String(raw || '').toLowerCase().replace(/\./g, '').trim();
  if (!s) return '';
  if (s.startsWith('шт')) return 'шт.';
  if (s.startsWith('к-т') || s.startsWith('кт') || s.startsWith('компл')) return 'к-т';
  if (s.startsWith('пар')) return 'пара';
  return s;
}

/** Створює позиції з тексту одним запитом */
export async function importContents(box, text, date = todayStr()) {
  const parsed = parseContents(text);
  if (!parsed.length) return [];
  await ensureSheets();
  await appendRows(
    LINES_SHEET,
    parsed.map((p) => lineRow({ box, name: p.name, total: p.total, taken: 0, unit: p.unit, date })),
    { raw: true }
  );
  return parsed;
}
