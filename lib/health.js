import { getSheetsClient } from './sheets';

/**
 * Особистий розділ здоров'я. Навмисно живе окремо від решти застосунку:
 * власний модуль, власні листи й, за бажанням, власна таблиця. Ці дані
 * ніде більше не з'являються — ні в пошуку, ні на дашборді, ні в журналі.
 *
 * HEALTH_SPREADSHEET_ID — окрема таблиця. Якщо не задано, листи лягають
 * у спільну; тоді їх побачить кожен, хто має доступ до самого файлу
 * Google Таблиць, тож для справжньої приватності змінну варто задати.
 */
const SPREADSHEET_ID = () => process.env.HEALTH_SPREADSHEET_ID || process.env.SPREADSHEET_ID;

/** Чий це розділ. Інші користувачі не побачать ні даних, ні самої вкладки. */
export function healthOwner() {
  return (process.env.HEALTH_OWNER || 'Fantomas').trim();
}

export function isOwner(callsign) {
  return (callsign || '').trim().toLowerCase() === healthOwner().toLowerCase();
}

export const DAYS_SHEET = 'Здоровʼя — дні';
export const FOOD_SHEET = 'Здоровʼя — їжа';
export const BODY_SHEET = 'Здоровʼя — заміри';
export const GOALS_SHEET = 'Здоровʼя — цілі';

export const DAY_HEADERS = [
  'Дата', 'Вага', 'Зʼїдено ккал', 'Спалено ккал', 'Білки', 'Жири', 'Вуглеводи',
  'Вода, мл', 'Кроки', 'Сон, год', 'Тренування, хв', 'Самопочуття',
  'Фото спереду', 'Фото збоку', 'Фото ззаду', 'Примітка',
];

export const D = {
  date: 0, weight: 1, kcal: 2, burned: 3, protein: 4, fat: 5, carbs: 6,
  water: 7, steps: 8, sleep: 9, workout: 10, mood: 11,
  front: 12, side: 13, back: 14, note: 15,
};

export const FOOD_HEADERS = [
  'Дата', 'Час', 'Прийом', 'Страва', 'Кількість', 'Ккал', 'Білки', 'Жири', 'Вуглеводи',
];

export const F = {
  date: 0, time: 1, meal: 2, name: 3, amount: 4, kcal: 5, protein: 6, fat: 7, carbs: 8,
};

export const MEALS = ['Сніданок', 'Обід', 'Вечеря', 'Перекус'];

export const BODY_HEADERS = [
  'Дата', 'Груди', 'Талія', 'Живіт', 'Стегна', 'Біцепс', 'Стегно', 'Шия',
  '% жиру', 'Примітка',
];

export const B = {
  date: 0, chest: 1, waist: 2, belly: 3, hips: 4, biceps: 5, thigh: 6, neck: 7,
  fat: 8, note: 9,
};

export const BODY_FIELDS = [
  { key: 'chest', label: 'Груди', unit: 'см' },
  { key: 'waist', label: 'Талія', unit: 'см' },
  { key: 'belly', label: 'Живіт', unit: 'см' },
  { key: 'hips', label: 'Стегна', unit: 'см' },
  { key: 'biceps', label: 'Біцепс', unit: 'см' },
  { key: 'thigh', label: 'Стегно', unit: 'см' },
  { key: 'neck', label: 'Шия', unit: 'см' },
  { key: 'fat', label: '% жиру', unit: '%' },
];

export const GOAL_HEADERS = ['Ключ', 'Значення'];

export const GOAL_FIELDS = [
  { key: 'weight', label: 'Цільова вага', unit: 'кг' },
  { key: 'startWeight', label: 'Стартова вага', unit: 'кг' },
  { key: 'kcal', label: 'Норма калорій', unit: 'ккал' },
  { key: 'protein', label: 'Білки', unit: 'г' },
  { key: 'fat', label: 'Жири', unit: 'г' },
  { key: 'carbs', label: 'Вуглеводи', unit: 'г' },
  { key: 'water', label: 'Вода', unit: 'мл' },
  { key: 'steps', label: 'Кроки', unit: '' },
];

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
};
const str = (v) => (v === null || v === undefined ? '' : String(v));

/* ---------- Робота з окремою таблицею ---------- */

async function read(sheet) {
  const api = getSheetsClient();
  const res = await api.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID(),
    range: `'${sheet}'`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  return res.data.values || [];
}

async function append(sheet, values) {
  const api = getSheetsClient();
  await api.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID(),
    range: `'${sheet}'`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

async function writeRow(sheet, row, values) {
  const api = getSheetsClient();
  await api.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID(),
    range: `'${sheet}'!A${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

async function removeRow(sheet, row) {
  const api = getSheetsClient();
  const meta = await api.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID() });
  const found = meta.data.sheets.find((s) => s.properties.title === sheet);
  if (!found) return false;
  await api.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId: found.properties.sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row },
        },
      }],
    },
  });
  return true;
}

let ensured = false;
async function ensureSheets() {
  if (ensured) return;
  const api = getSheetsClient();
  const meta = await api.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID() });
  const have = new Set(meta.data.sheets.map((s) => s.properties.title));
  const need = [
    [DAYS_SHEET, DAY_HEADERS],
    [FOOD_SHEET, FOOD_HEADERS],
    [BODY_SHEET, BODY_HEADERS],
    [GOALS_SHEET, GOAL_HEADERS],
  ].filter(([name]) => !have.has(name));

  if (need.length) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID(),
      requestBody: {
        requests: need.map(([title]) => ({ addSheet: { properties: { title } } })),
      },
    });
    await Promise.all(need.map(([title, headers]) => writeRow(title, 1, headers)));
  }
  ensured = true;
}

/* ---------- Дати ---------- */

export function todayKyiv() {
  const fmt = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p = {};
  fmt.formatToParts(new Date()).forEach((x) => (p[x.type] = x.value));
  return `${p.day}.${p.month}.${p.year}`;
}

export function nowKyiv() {
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

/** дд.мм.рррр → мітка часу, щоб сортувати й рахувати різницю днів */
export function stamp(d) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((d || '').toString().trim());
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0;
}

/* ---------- Читання ---------- */

function pad(row, len) {
  const r = [...(row || [])];
  while (r.length < len) r.push('');
  return r;
}

export function parseDays(values) {
  if (!values || values.length < 2) return [];
  return values.slice(1).map((raw, i) => {
    const r = pad(raw, DAY_HEADERS.length);
    return {
      row: i + 2,
      date: str(r[D.date]).trim(),
      weight: str(r[D.weight]).trim() === '' ? null : num(r[D.weight]),
      kcal: num(r[D.kcal]),
      burned: num(r[D.burned]),
      protein: num(r[D.protein]),
      fat: num(r[D.fat]),
      carbs: num(r[D.carbs]),
      water: num(r[D.water]),
      steps: num(r[D.steps]),
      sleep: num(r[D.sleep]),
      workout: num(r[D.workout]),
      mood: str(r[D.mood]).trim(),
      front: str(r[D.front]).trim(),
      side: str(r[D.side]).trim(),
      back: str(r[D.back]).trim(),
      note: str(r[D.note]),
    };
  }).filter((d) => d.date);
}

export function parseFood(values) {
  if (!values || values.length < 2) return [];
  return values.slice(1).map((raw, i) => {
    const r = pad(raw, FOOD_HEADERS.length);
    return {
      row: i + 2,
      date: str(r[F.date]).trim(),
      time: str(r[F.time]).trim(),
      meal: str(r[F.meal]).trim(),
      name: str(r[F.name]),
      amount: str(r[F.amount]).trim(),
      kcal: num(r[F.kcal]),
      protein: num(r[F.protein]),
      fat: num(r[F.fat]),
      carbs: num(r[F.carbs]),
    };
  }).filter((f) => f.date && (f.name || f.kcal));
}

export function parseBody(values) {
  if (!values || values.length < 2) return [];
  return values.slice(1).map((raw, i) => {
    const r = pad(raw, BODY_HEADERS.length);
    const out = { row: i + 2, date: str(r[B.date]).trim(), note: str(r[B.note]) };
    BODY_FIELDS.forEach((f) => {
      const v = str(r[B[f.key]]).trim();
      out[f.key] = v === '' ? null : num(v);
    });
    return out;
  }).filter((b) => b.date);
}

export function parseGoals(values) {
  const out = {};
  (values || []).slice(1).forEach((raw) => {
    const k = str(raw?.[0]).trim();
    if (k) out[k] = str(raw?.[1]).trim();
  });
  return out;
}

export async function readAll() {
  await ensureSheets();
  const [dayV, foodV, bodyV, goalV] = await Promise.all([
    read(DAYS_SHEET), read(FOOD_SHEET), read(BODY_SHEET), read(GOALS_SHEET),
  ]);
  const days = parseDays(dayV).sort((a, b) => stamp(a.date) - stamp(b.date));
  const body = parseBody(bodyV).sort((a, b) => stamp(a.date) - stamp(b.date));
  return {
    days,
    food: parseFood(foodV),
    body,
    goals: parseGoals(goalV),
    owner: healthOwner(),
    separate: !!process.env.HEALTH_SPREADSHEET_ID,
  };
}

/* ---------- Запис ---------- */

function dayRow(d) {
  const r = new Array(DAY_HEADERS.length).fill('');
  r[D.date] = d.date;
  ['weight', 'kcal', 'burned', 'protein', 'fat', 'carbs', 'water', 'steps', 'sleep', 'workout']
    .forEach((k) => { r[D[k]] = d[k] === null || d[k] === undefined || d[k] === '' ? '' : num(d[k]); });
  r[D.mood] = d.mood || '';
  r[D.front] = d.front || '';
  r[D.side] = d.side || '';
  r[D.back] = d.back || '';
  r[D.note] = d.note || '';
  return r;
}

/** Один день — один рядок: той самий день перезаписуємо, а не дублюємо */
export async function saveDay(patch) {
  await ensureSheets();
  const values = await read(DAYS_SHEET);
  const days = parseDays(values);
  const date = patch.date || todayKyiv();
  const found = days.find((d) => d.date === date);

  const merged = { ...(found || {}), ...patch, date };
  const row = dayRow(merged);

  if (found) await writeRow(DAYS_SHEET, found.row, row);
  else await append(DAYS_SHEET, row);
  return merged;
}

export async function addFood(entry) {
  await ensureSheets();
  const r = new Array(FOOD_HEADERS.length).fill('');
  r[F.date] = entry.date || todayKyiv();
  r[F.time] = entry.time || nowKyiv();
  r[F.meal] = entry.meal || '';
  r[F.name] = entry.name || '';
  r[F.amount] = entry.amount || '';
  r[F.kcal] = num(entry.kcal);
  r[F.protein] = num(entry.protein);
  r[F.fat] = num(entry.fat);
  r[F.carbs] = num(entry.carbs);
  await append(FOOD_SHEET, r);
  return r;
}

export async function delFood(row) {
  await ensureSheets();
  return removeRow(FOOD_SHEET, row);
}

/** Підсумок дня зі з'їденого — щоб не рахувати руками */
export async function recalcDay(date) {
  const values = await read(FOOD_SHEET);
  const rows = parseFood(values).filter((f) => f.date === date);
  const sum = (k) => Math.round(rows.reduce((a, f) => a + f[k], 0) * 10) / 10;
  return saveDay({
    date,
    kcal: sum('kcal'), protein: sum('protein'), fat: sum('fat'), carbs: sum('carbs'),
  });
}

export async function saveBody(patch) {
  await ensureSheets();
  const values = await read(BODY_SHEET);
  const rows = parseBody(values);
  const date = patch.date || todayKyiv();
  const found = rows.find((b) => b.date === date);

  const merged = { ...(found || {}), ...patch, date };
  const r = new Array(BODY_HEADERS.length).fill('');
  r[B.date] = date;
  BODY_FIELDS.forEach((f) => {
    const v = merged[f.key];
    r[B[f.key]] = v === null || v === undefined || v === '' ? '' : num(v);
  });
  r[B.note] = merged.note || '';

  if (found) await writeRow(BODY_SHEET, found.row, r);
  else await append(BODY_SHEET, r);
  return merged;
}

export async function saveGoals(goals) {
  await ensureSheets();
  const rows = [GOAL_HEADERS, ...Object.entries(goals).map(([k, v]) => [k, v])];
  const api = getSheetsClient();
  // цілей мало — переписуємо весь лист, це простіше за пошук рядків
  await api.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID(), range: `'${GOALS_SHEET}'`,
  });
  await api.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID(),
    range: `'${GOALS_SHEET}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
  return goals;
}
