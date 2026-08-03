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
export async function writeCell(sheetName, row, col, value) {
  const sheets = getSheetsClient();
  const a1 = `${colToA1(col)}${row}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!${a1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
  return true;
}

/** Записує кілька клітинок одного рядка за один запит */
export async function writeCells(sheetName, updates) {
  const sheets = getSheetsClient();
  const data = updates.map((u) => ({
    range: `'${sheetName}'!${colToA1(u.col)}${u.row}`,
    values: [[u.value]],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
  return true;
}

/** Додає рядок у кінець листа */
export async function appendRow(sheetName, values) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
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
  const cols = { where: -1, status: -1, who: -1, date: -1, returned: -1, type: -1 };
  const snCols = [];
  const maskCols = [];

  headers.forEach((h, i) => {
    const hl = (h || '').toString().toLowerCase().trim();
    if (cols.where === -1 && (hl === 'де' || hl === 'где' || hl === 'назва' || hl === 'де зараз' || hl.includes('розташ')))
      cols.where = i;
    if (cols.status === -1 && hl.includes('статус')) cols.status = i;
    if (cols.who === -1 && (hl.includes('отрим') || hl.includes('получил') || hl === 'у кого'))
      cols.who = i;
    if (cols.date === -1 && hl === 'дата') cols.date = i;
    if (cols.returned === -1 && (hl.includes('здав') || hl.includes('здал') || hl.includes('здали')))
      cols.returned = i;
    if (cols.type === -1 && hl === 'тип') cols.type = i;

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
