import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Конфігурація листів — точні назви вкладок у таблиці
export const SHEET_CONFIGS = [
  { name: 'Радейки', kind: 'items' },
  { name: 'ПНВ', kind: 'items' },
  { name: 'Тепловізори', kind: 'items' },
  { name: 'Автомобільні', kind: 'items' },
  { name: 'Дрони', kind: 'items', noIssue: true, hideStatus: true },
  { name: 'Майно роти', kind: 'ledger' },
  { name: 'Майно Рибаківки', kind: 'stock' },
  { name: 'майно не облік', kind: 'items', maskPasswords: true },
  { name: 'Кропива', kind: 'items' },
  { name: 'Склад', kind: 'warehouse' },
];

export const DEFAULT_STATUS_OPTIONS = [
  'Видано', 'КСП', 'Склад', 'Втрачено', 'Списано', 'Невідомо',
];
export const DEFAULT_TYPE_OPTIONS = ['Списан', 'не-у', 'Учт.'];

export const WAREHOUSE_PRIORITIES = [
  { value: '1', label: '1 — критично / завжди під рукою' },
  { value: '2', label: '2 — важливо, потрібно періодично' },
  { value: '3', label: '3 — рідко використовується' },
];
export const WAREHOUSE_STATUS_OPTIONS = ['На складі', 'Видано', 'Втрачено', 'Списано'];

let cachedClient = null;

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY || '';
  // У змінних оточення Vercel переноси рядків зберігаються як \n
  key = key.replace(/\\n/g, '\n');

  if (!email || !key) {
    throw new Error(
      'Не задані GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY у змінних оточення'
    );
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export function getSheetsClient() {
  if (!cachedClient) {
    cachedClient = google.sheets({ version: 'v4', auth: getAuth() });
  }
  return cachedClient;
}

/** Читає весь діапазон листа */
export async function readSheet(sheetName) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  return res.data.values || [];
}

/** Записує одну клітинку (rowIndex/colIndex — 1-based) */
export async function writeCell(sheetName, row, col, value, { raw = false } = {}) {
  const sheets = getSheetsClient();
  const a1 = `${colToA1(col)}${row}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!${a1}`,
    valueInputOption: raw ? 'RAW' : 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
  return true;
}

/** Записує кілька клітинок одного рядка за один запит */
export async function writeCells(sheetName, updates, { raw = false } = {}) {
  const sheets = getSheetsClient();
  const data = updates.map((u) => ({
    range: `'${sheetName}'!${colToA1(u.col)}${u.row}`,
    values: [[u.value]],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: raw ? 'RAW' : 'USER_ENTERED', data },
  });
  return true;
}

/**
 * Додає рядок у кінець листа.
 * raw — не давати таблиці тлумачити значення. Дата «04.08.2026» інакше стає
 * числом 46238, і в листі без формату дати саме воно й показується.
 */
export async function appendRow(sheetName, values, { raw = false } = {}) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'`,
    valueInputOption: raw ? 'RAW' : 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
  return true;
}

/** Дата чи час, збережені як число, — повертаємо до читабельного вигляду */
export function fromSerial(value, kind = 'date') {
  const s = (value ?? '').toString().trim();
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return s;
  const n = Number(s);
  const p = (x) => String(x).padStart(2, '0');

  if (kind === 'time') {
    const frac = n - Math.floor(n);
    const mins = Math.round(frac * 24 * 60);
    return `${p(Math.floor(mins / 60) % 24)}:${p(mins % 60)}`;
  }
  // у таблиць Google відлік від 30.12.1899
  if (n < 1 || n > 100000) return s;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** Перезаписує цілий рядок, починаючи з колонки A */
export async function writeRow(sheetName, row, values) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!A${row}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
  return true;
}

/** Числовий sheetId вкладки (потрібен для операцій із рядками) */
async function getSheetId(sheetName) {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets.find((s) => s.properties.title === sheetName);
  if (!sheet) throw new Error(`Лист "${sheetName}" не знайдено`);
  return sheet.properties.sheetId;
}

/** Видаляє рядок (потрібен числовий sheetId) */
export async function deleteRow(sheetName, row) {
  const sheets = getSheetsClient();
  const sheetId = await getSheetId(sheetName);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row },
          },
        },
      ],
    },
  });
  return true;
}

/** Вставляє рядок на те саме місце — для скасування видалення */
export async function insertRowAt(sheetName, row, values) {
  const sheets = getSheetsClient();
  const sheetId = await getSheetId(sheetName);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row },
            inheritFromBefore: false,
          },
        },
      ],
    },
  });

  if (values && values.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A${row}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] },
    });
  }
  return true;
}

/** Створює вкладку із заголовками, якщо її ще немає */
export async function ensureSheet(sheetName, headers) {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  if (meta.data.sheets.some((s) => s.properties.title === sheetName)) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
  });
  if (headers && headers.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    });
  }
  return true;
}

export function colToA1(col) {
  let s = '';
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Знаходить індекси службових колонок за заголовками */
export function findColumns(headers) {
  const cols = { where: -1, status: -1, who: -1, date: -1, returned: -1, type: -1, id: -1 };
  const snCols = [];
  const maskCols = [];

  headers.forEach((h, i) => {
    const hl = (h || '').toString().toLowerCase().trim();

    // Перша колонка — це завжди назва самої речі, а не місце. Раніше вона
    // підпадала під пошук колонки «де», і видача записувала «КСП» поверх назви.
    if (i > 0 && cols.where === -1 &&
        (hl === 'де' || hl === 'где' || hl === 'назва' || hl === 'де зараз' || hl.includes('розташ')))
      cols.where = i;
    // «Стан» — той самий статус; інакше він дублювався б полем «Стан» у формі акта
    if (cols.status === -1 && (hl.includes('статус') || hl === 'стан')) cols.status = i;
    if (cols.who === -1 &&
        (hl.includes('отрим') || hl.includes('получил') || hl === 'у кого' || hl === 'кому'))
      cols.who = i;
    if (cols.date === -1 && hl === 'дата') cols.date = i;
    // «Здав», «Здали», «Дата здачі» — усе це про повернення речі
    if (cols.returned === -1 && (hl.includes('здав') || hl.includes('здал') || hl.includes('здач')))
      cols.returned = i;
    if (cols.type === -1 && hl === 'тип') cols.type = i;

    // власний номер речі — його показуємо як помітний бейдж на картці.
    // Серійник виробника (S/N) — це інше, він іде окремим рядком під назвою.
    // «№ з/п» і «№ п/п» теж номери, тому дивимось не лише на точний збіг
    const idHeader = hl === '№' || hl === 'id' || hl === 'ід' || hl === 'номер' ||
      hl === 'но' || hl === 'no' || hl === 'код' ||
      hl.startsWith('№') || hl.includes('з/п') || hl.includes('п/п');
    if (cols.id === -1 && idHeader && !hl.includes('серій') && !hl.includes('s/n'))
      cols.id = i;

    if (hl.includes('s/n') || hl.includes('серій') || hl === 'номер' || hl === 'id' || hl === 'no' || hl === '№')
      snCols.push(i);
    if (hl.includes('парол') || hl.includes('password') || hl.includes('логін') || hl.includes('логин'))
      maskCols.push(i);
  });

  return { ...cols, snCols, maskCols };
}

/** Унікальні значення колонки (з нормалізацією регістру) */
export function distinctValues(rows, colIdx) {
  if (colIdx < 0) return [];
  const seen = {};
  rows.forEach((r) => {
    const raw = (r[colIdx] || '').toString().replace(/\s+/g, ' ').trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (!seen[key]) seen[key] = raw;
  });
  return Object.values(seen).sort();
}

export function mergeWithDefaults(existing, defaults) {
  const seen = {};
  existing.forEach((e) => (seen[e.toLowerCase()] = true));
  const out = [...existing];
  defaults.forEach((d) => {
    if (!seen[d.toLowerCase()]) {
      out.push(d);
      seen[d.toLowerCase()] = true;
    }
  });
  return out;
}

export function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}
