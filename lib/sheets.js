import { google } from 'googleapis';
import { withRetry } from './quota.js';

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

/**
 * Лист із SHEET_CONFIGS потрібного виду; null — такого листа застосунок не веде.
 *
 * Маршрути запису беруть назву листа з тіла запиту. Без цієї перевірки
 * будь-хто після входу міг писати в будь-яку вкладку таблиці — зокрема в
 * «Люди», де лежить роль: черговий вписував собі «Адміністратор» і після
 * наступного входу ним ставав. А ще — у журнал і в особисті листи.
 */
export function sheetConfig(name, kind) {
  return SHEET_CONFIGS.find((c) => c.name === name && (!kind || c.kind === kind)) || null;
}

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

/*
 * Квота Google — шістдесят читань на хвилину на користувача, і вичерпати
 * її легко: одне відкриття головної робило близько дюжини окремих
 * запитів. Тому читання тут захищене з трьох боків.
 *
 * `withRetry` переживає сплеск: перевищена квота — це «зараз зайнято», і
 * друга спроба за пів секунди здебільшого проходить.
 *
 * `inFlight` склеює однакові читання, що йдуть одночасно. Сторінка
 * нерідко просить той самий лист із двох місць в одну мить — хай це буде
 * один запит, а не два. Склеюються лише ті, що перетинаються в часі, тож
 * читання після запису завжди піде в таблицю наново й поверне свіже.
 *
 * `readSheets` бере кілька листів однією відповіддю.
 */
const inFlight = new Map();

/** Читає весь діапазон листа */
export function readSheet(sheetName) {
  const had = inFlight.get(sheetName);
  if (had) return had;

  const p = withRetry(async () => {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'`,
      valueRenderOption: 'FORMATTED_VALUE',
    });
    return res.data.values || [];
  }).finally(() => {
    if (inFlight.get(sheetName) === p) inFlight.delete(sheetName);
  });

  inFlight.set(sheetName, p);
  return p;
}

/**
 * Кілька листів — одним запитом.
 *
 * Повертає масив у тому самому порядку, що й назви. Лист, якого немає,
 * дає порожній масив, а не падіння: на головній бракує однієї категорії,
 * а не всієї сторінки.
 */
export async function readSheets(names) {
  if (!names || !names.length) return [];
  if (names.length === 1) return [await readSheet(names[0])];

  return withRetry(async () => {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SPREADSHEET_ID,
      ranges: names.map((n) => `'${n}'`),
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const got = res.data.valueRanges || [];
    return names.map((_, i) => got[i]?.values || []);
  });
}

/** Записує одну клітинку (rowIndex/colIndex — 1-based) */
export async function writeCell(sheetName, row, col, value, { raw = false } = {}) {
  const sheets = getSheetsClient();
  const a1 = `${colToA1(col)}${row}`;
  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!${a1}`,
    valueInputOption: raw ? 'RAW' : 'USER_ENTERED',
    requestBody: { values: [[value]] },
  }));
  return true;
}

/** Записує кілька клітинок одного рядка за один запит */
export async function writeCells(sheetName, updates, { raw = false } = {}) {
  const sheets = getSheetsClient();
  const data = updates.map((u) => ({
    range: `'${sheetName}'!${colToA1(u.col)}${u.row}`,
    values: [[u.value]],
  }));
  await withRetry(() => sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: raw ? 'RAW' : 'USER_ENTERED', data },
  }));
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

/** Додає кілька рядків одним запитом — на обході звірки їх багато */
export async function appendRows(sheetName, rows, { raw = false } = {}) {
  if (!rows || !rows.length) return true;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'`,
    valueInputOption: raw ? 'RAW' : 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
  return true;
}

/** Дата чи час, збережені як число, — повертаємо до читабельного вигляду */
export function fromSerial(value, kind = 'date') {
  const raw = (value ?? '').toString().trim();
  if (!raw) return raw;
  // українська локаль таблиці віддає «0,6979166667» через кому,
  // а тисячі може розділяти пробілом чи нерозривним пробілом
  const s = raw.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return raw;
  const n = Number(s);
  const p = (x) => String(x).padStart(2, '0');

  if (kind === 'time') {
    const frac = n - Math.floor(n);
    const mins = Math.round(frac * 24 * 60);
    return `${p(Math.floor(mins / 60) % 24)}:${p(mins % 60)}`;
  }
  // у таблиць Google відлік від 30.12.1899
  if (n < 1 || n > 100000) return raw;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** Перезаписує цілий рядок, починаючи з колонки A */
export async function writeRow(sheetName, row, values, { raw = false } = {}) {
  const sheets = getSheetsClient();
  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'!A${row}`,
    valueInputOption: raw ? 'RAW' : 'USER_ENTERED',
    requestBody: { values: [values] },
  }));
  return true;
}

/** Числовий sheetId вкладки (потрібен для операцій із рядками) */
async function getSheetId(sheetName) {
  const sheets = getSheetsClient();
  const meta = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }));
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

/*
 * Які листи вже перевіряли на потрібну колонку — щоб не смикати таблицю
 * на кожне відкриття сторінки. Живе, доки живий процес; після перезапуску
 * перевірка повториться, і це нікому не заважає.
 */
const columnChecked = new Set();

/**
 * Дописує колонку в кінець рядка заголовків, якщо такої ще немає.
 *
 * Той самий підхід, що й із заголовками в інших листах: міграцій у проєкті
 * немає — їх нікому запускати, — тож лист доводить себе до ладу сам, за
 * першим читанням. Дописуємо строго в кінець: індекси колонок позиційні,
 * і нова назва посеред рядка зсунула б усе, що вже лежить у таблиці.
 *
 * Помилка тут не має валити сторінку: не вдалося дописати заголовок —
 * розділ просто лишиться без цього поля до наступного разу.
 */
export async function ensureColumn(sheetName, headers, title) {
  const key = `${sheetName}\u0000${title}`;
  if (columnChecked.has(key)) return -1;
  columnChecked.add(key);

  const col = headers.length + 1;
  try {
    await writeCell(sheetName, 1, col, title, { raw: true });
    return col - 1;
  } catch (e) {
    console.error(`не вдалося дописати «${title}» до «${sheetName}»:`, e.message);
    columnChecked.delete(key);
    return -1;
  }
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

/**
 * Заголовки, під якими в листах ховається назва самої речі, і заголовки
 * порядкових номерів. Потрібні, щоб відрізнити «№ з/п» від назви: перше —
 * лічильник рядків, друге — те, за чим річ упізнають.
 */
const NAME_HEADERS = [
  'назва', 'наймен', 'наимен', 'майно', 'обладнан', 'пристр', 'прилад',
  'модель', 'предмет', 'річ', 'товар', 'номенклат',
];

const isOrdinalHeader = (h) => {
  const hl = (h || '').toString().toLowerCase().trim();
  return hl === '№' || hl === '#' || hl === '№№' || hl === 'id' || hl === 'ід' ||
    hl === 'no' || hl === 'но' || hl.includes('з/п') || hl.includes('п/п') ||
    hl === 'п.п' || hl === '№ п.п';
};

/** Знаходить індекси службових колонок за заголовками */
export function findColumns(headers) {
  const cols = {
    where: -1, status: -1, who: -1, date: -1, returned: -1, type: -1, id: -1, note: -1, name: 0,
  };
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

    /*
     * Куди дописати словами те, чого не вміщає жодна колонка: «антена
     * тримається на скотчі», «віддали до ремонту, обіцяли в пʼятницю».
     * Назви різні по листах — хтось пише «Примітка», хтось «Коментар», —
     * тому шукаємо за коренем, як і решту службових колонок.
     */
    if (cols.note === -1 &&
        (hl.includes('приміт') || hl.includes('примеч') ||
         hl.includes('коментар') || hl.includes('комментар') || hl.includes('нотат')))
      cols.note = i;

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

  /*
   * Де назва речі.
   *
   * Майже в усіх листах вона стоїть першою, і так і лишається. Але не скрізь:
   * у «майно не облік» перша колонка — «№ з/п», а сама річ записана в «Майно».
   * Через це картка показувала два числа — порядковий номер і номер рядка — і
   * жодної назви, а форма першим полем вимагала вписати «№ з/п».
   *
   * Тож коли перша колонка — порядковий номер, шукаємо справжню назву далі.
   */
  if (isOrdinalHeader(headers[0])) {
    const found = headers.findIndex((h, i) => {
      if (i === 0) return false;
      const hl = (h || '').toString().toLowerCase().trim();
      return NAME_HEADERS.some((w) => hl.includes(w));
    });
    if (found > 0) cols.name = found;
  }

  // «Назва» вважається колонкою місця (є листи, де так і є), але коли це
  // назва самої речі, видача записала б «КСП» поверх неї
  if (cols.where === cols.name) cols.where = -1;

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
