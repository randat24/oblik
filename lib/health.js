import { getSheetsClient } from './sheets';
import { MULT_SHEET, MULT_HEADERS, parseMult, multRows } from './mult';
import { CODE_SHEET, CODE_HEADERS, parseCode, codeRows } from './code';

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
export const PRODUCTS_SHEET = 'Здоровʼя — продукти';
export const DISHES_SHEET = 'Здоровʼя — страви';
export const MEDS_SHEET = 'Здоровʼя — ліки';

// Нові показники дописані в кінець навмисно: індекси колонок позиційні,
// тож наявні рядки не зсуваються й лишаються правильними.
export const DAY_HEADERS = [
  'Дата', 'Вага', 'Зʼїдено ккал', 'Спалено ккал', 'Білки', 'Жири', 'Вуглеводи',
  'Вода, мл', 'Кроки', 'Сон, год', 'Тренування, хв', 'Самопочуття',
  'Фото спереду', 'Фото збоку', 'Фото ззаду', 'Примітка',
  'Пульс спокою', 'ВСР, мс', 'Дистанція, км', 'Години стоячи',
  'Енергія спокою', '% жиру',
  'Клітковина', 'Цукор', 'Натрій, мг',
];

export const D = {
  date: 0, weight: 1, kcal: 2, burned: 3, protein: 4, fat: 5, carbs: 6,
  water: 7, steps: 8, sleep: 9, workout: 10, mood: 11,
  front: 12, side: 13, back: 14, note: 15,
  pulse: 16, hrv: 17, distance: 18, stand: 19, restEnergy: 20, bodyFat: 21,
  fiber: 22, sugar: 23, sodium: 24,
};

// Числові поля дня — щоб не перелічувати їх у кожному місці окремо
export const DAY_NUMS = [
  'weight', 'kcal', 'burned', 'protein', 'fat', 'carbs', 'water', 'steps',
  'sleep', 'workout', 'pulse', 'hrv', 'distance', 'stand', 'restEnergy', 'bodyFat',
  'fiber', 'sugar', 'sodium',
];

export const FOOD_HEADERS = [
  'Дата', 'Час', 'Прийом', 'Страва', 'Кількість', 'Ккал', 'Білки', 'Жири', 'Вуглеводи',
  'Клітковина', 'Цукор', 'Натрій, мг',
];

export const F = {
  date: 0, time: 1, meal: 2, name: 3, amount: 4, kcal: 5, protein: 6, fat: 7, carbs: 8,
  fiber: 9, sugar: 10, sodium: 11,
};

// Що рахуємо як поживні числа скрізь: у записі їжі, у продукті, у страві.
// Список один, щоб нове поле не довелося дописувати в десяти місцях.
export const NUTRIENTS = ['kcal', 'protein', 'fat', 'carbs', 'fiber', 'sugar', 'sodium'];

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

// Особиста база продуктів: раз відсканував — далі працює і без мережі
export const PRODUCT_HEADERS = [
  'Штрихкод', 'Назва', 'Бренд', 'Ккал/100', 'Білки/100', 'Жири/100',
  'Вуглеводи/100', 'Порція, г', 'Джерело', 'Оновлено',
  'Клітковина/100', 'Цукор/100', 'Натрій/100, мг',
];

export const P = {
  code: 0, name: 1, brand: 2, kcal: 3, protein: 4, fat: 5, carbs: 6,
  serving: 7, source: 8, updated: 9,
  fiber: 10, sugar: 11, sodium: 12,
};

// Своя страва — це набір складників. Один рядок = один складник,
// а сама страва — це всі рядки з однаковою назвою.
export const DISH_HEADERS = [
  'Страва', 'Складник', 'Грамів', 'Ккал', 'Білки', 'Жири', 'Вуглеводи',
  'Клітковина', 'Цукор', 'Натрій, мг',
];

export const DI = {
  dish: 0, name: 1, grams: 2, kcal: 3, protein: 4, fat: 5, carbs: 6,
  fiber: 7, sugar: 8, sodium: 9,
};

// Ліки. Колонки «Позивний» тут немає навмисно: розділ особистий, власник
// один, і зайве поле лише збивало б із пантелику.
export const MED_HEADERS = [
  'Препарат', 'Дозування', 'Прийоми', 'Початок', 'Днів', 'Залишок', 'Нотатки', 'Журнал',
];

export const M = {
  drug: 0, dose: 1, slots: 2, start: 3, days: 4, stock: 5, note: 6, log: 7,
};

/** Час прийому. Порядок канонічний — за ним сортуються відмітки в журналі. */
export const SLOTS = [
  { key: 'Ранок', time: '08:00', icon: '☀️' },
  { key: 'Обід', time: '13:00', icon: '🍽️' },
  { key: 'Вечір', time: '19:00', icon: '🌆' },
  { key: 'Ніч', time: '22:00', icon: '🌙' },
];

const SLOT_KEYS = SLOTS.map((s) => s.key);

/** Скільки днів журналу тримаємо в клітинці, щоб вона не розросталась */
const LOG_DAYS_KEPT = 60;

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
  { key: 'fiber', label: 'Клітковина', unit: 'г' },
  { key: 'sugar', label: 'Цукор, не більше', unit: 'г' },
  { key: 'sodium', label: 'Натрій, не більше', unit: 'мг' },
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

/**
 * Усі листи розділу — одним запитом. Шість окремих читань на кожне
 * відкриття сторінки з'їдають хвилинну квоту Google утричі швидше, а коли
 * вона скінчилась, відповідь не приходить довго — сторінка просто висить.
 */
async function readMany(sheets) {
  const api = getSheetsClient();
  const res = await api.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID(),
    ranges: sheets.map((s) => `'${s}'`),
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const got = res.data.valueRanges || [];
  return sheets.map((_, i) => got[i]?.values || []);
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
let headersFixed = false;
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
    [PRODUCTS_SHEET, PRODUCT_HEADERS],
    [DISHES_SHEET, DISH_HEADERS],
    [MEDS_SHEET, MED_HEADERS],
    [MULT_SHEET, MULT_HEADERS],
    [CODE_SHEET, CODE_HEADERS],
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
      pulse: num(r[D.pulse]),
      hrv: num(r[D.hrv]),
      distance: num(r[D.distance]),
      stand: num(r[D.stand]),
      restEnergy: num(r[D.restEnergy]),
      bodyFat: num(r[D.bodyFat]),
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
      ...Object.fromEntries(NUTRIENTS.map((k) => [k, num(r[F[k]])])),
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

export function parseProducts(values) {
  if (!values || values.length < 2) return [];
  return values.slice(1).map((raw, i) => {
    const r = pad(raw, PRODUCT_HEADERS.length);
    return {
      row: i + 2,
      code: str(r[P.code]).trim(),
      name: str(r[P.name]),
      brand: str(r[P.brand]).trim(),
      ...Object.fromEntries(NUTRIENTS.map((k) => [k, num(r[P[k]])])),
      serving: num(r[P.serving]),
      source: str(r[P.source]).trim(),
      updated: str(r[P.updated]).trim(),
    };
  }).filter((p) => p.code || p.name);
}

/** Рядки складників → страви з підсумками */
export function parseDishes(values) {
  if (!values || values.length < 2) return [];
  const map = new Map();
  values.slice(1).forEach((raw) => {
    const r = pad(raw, DISH_HEADERS.length);
    const dish = str(r[DI.dish]).trim();
    if (!dish) return;
    if (!map.has(dish)) {
      map.set(dish, {
        name: dish, items: [], grams: 0,
        ...Object.fromEntries(NUTRIENTS.map((k) => [k, 0])),
      });
    }
    const d = map.get(dish);
    const item = {
      name: str(r[DI.name]),
      grams: num(r[DI.grams]),
      ...Object.fromEntries(NUTRIENTS.map((k) => [k, num(r[DI[k]])])),
    };
    d.items.push(item);
    ['grams', ...NUTRIENTS].forEach((k) => { d[k] += item[k]; });
  });
  const round = (v) => Math.round(v * 10) / 10;
  return [...map.values()].map((d) => ({
    ...d,
    grams: round(d.grams),
    ...Object.fromEntries(NUTRIENTS.map((k) => [k, round(d[k])])),
  })).sort((a, b) => a.name.localeCompare(b.name, 'uk'));
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
  const [dayV, foodV, bodyV, goalV, prodV, dishV, medV, multV, codeV] = await readMany([
    DAYS_SHEET, FOOD_SHEET, BODY_SHEET, GOALS_SHEET, PRODUCTS_SHEET, DISHES_SHEET,
    MEDS_SHEET, MULT_SHEET, CODE_SHEET,
  ]);
  // Лист міг бути створений до появи нових колонок — дописуємо заголовки.
  // Один раз на запуск і не падаючи: якщо заголовок не вдалося оновити,
  // читати дані це не заважає, а без сторінки людина лишається геть.
  if ((dayV[0] || []).length < DAY_HEADERS.length) {
    if (!headersFixed) {
      headersFixed = true;
      try {
        await writeRow(DAYS_SHEET, 1, DAY_HEADERS);
      } catch (e) {
        console.error('не вдалося оновити заголовки днів:', e.message);
      }
    }
    dayV[0] = [...DAY_HEADERS];
  }

  const days = parseDays(dayV).sort((a, b) => stamp(a.date) - stamp(b.date));
  const body = parseBody(bodyV).sort((a, b) => stamp(a.date) - stamp(b.date));
  return {
    days,
    food: parseFood(foodV),
    body,
    goals: parseGoals(goalV),
    products: parseProducts(prodV),
    dishes: parseDishes(dishV),
    meds: parseMeds(medV),
    slots: SLOTS,
    mult: parseMult(multV),
    code: parseCode(codeV),
    owner: healthOwner(),
    separate: !!process.env.HEALTH_SPREADSHEET_ID,
  };
}

/* ---------- Запис ---------- */

function dayRow(d) {
  const r = new Array(DAY_HEADERS.length).fill('');
  r[D.date] = d.date;
  DAY_NUMS.forEach((k) => {
    r[D[k]] = d[k] === null || d[k] === undefined || d[k] === '' ? '' : num(d[k]);
  });
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
  NUTRIENTS.forEach((k) => { r[F[k]] = num(entry[k]); });
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
  return saveDay({ date, ...Object.fromEntries(NUTRIENTS.map((k) => [k, sum(k)])) });
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

/** Зберігає продукт у власну базу; той самий штрихкод оновлюється, а не дублюється */
export async function saveProduct(prod) {
  await ensureSheets();
  const values = await read(PRODUCTS_SHEET);
  const rows = parseProducts(values);
  const code = str(prod.code).trim();
  const found = code ? rows.find((r) => r.code === code) : null;

  const r = new Array(PRODUCT_HEADERS.length).fill('');
  r[P.code] = code;
  r[P.name] = prod.name || '';
  r[P.brand] = prod.brand || '';
  NUTRIENTS.forEach((k) => { r[P[k]] = num(prod[k]); });
  r[P.serving] = num(prod.serving);
  r[P.source] = prod.source || '';
  r[P.updated] = todayKyiv();

  if (found) await writeRow(PRODUCTS_SHEET, found.row, r);
  else await append(PRODUCTS_SHEET, r);
  return prod;
}

/**
 * Пошук продукту за штрихкодом.
 * Спершу власна база — вона працює миттєво й без мережі. Якщо там порожньо,
 * питаємо Open Food Facts: відкритий каталог, ключів не треба. Назовні йде
 * тільки сам штрихкод — жодних особистих даних.
 */
export async function lookupBarcode(code) {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length < 6) return { error: 'Схоже, це не штрихкод' };

  const mine = parseProducts(await read(PRODUCTS_SHEET)).find((p) => p.code === clean);
  if (mine) return { product: mine, from: 'база' };

  let json;
  try {
    // каталог іноді відповідає довго — краще здатися, ніж тримати запит
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 7000);
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${clean}.json` +
      '?fields=product_name,product_name_uk,product_name_ru,brands,nutriments,serving_quantity',
      { headers: { 'User-Agent': 'Oblik-Health/1.0' }, signal: ctl.signal }
    ).finally(() => clearTimeout(t));
    if (res.status === 404) return { error: 'Такого штрихкоду в каталозі немає', code: clean };
    if (!res.ok) return { error: 'Каталог не відповів', code: clean };
    json = await res.json();
  } catch {
    return { error: 'Немає звʼязку з каталогом', code: clean };
  }

  // орієнтуємось на наявність самого продукту, а не лише на поле status:
  // так відповідь лишається зрозумілою, навіть якщо каталог змінить формат
  if (!json || !json.product) {
    return { error: 'Такого штрихкоду в каталозі немає', code: clean };
  }

  const p = json.product;
  const n = p.nutriments || {};
  // каталог іноді дає кілокалорії, іноді лише кілоджоулі
  const kcal = num(n['energy-kcal_100g']) || (num(n.energy_100g) ? num(n.energy_100g) / 4.184 : 0);

  const product = {
    code: clean,
    name: (p.product_name_uk || p.product_name || p.product_name_ru || '').trim(),
    brand: (p.brands || '').split(',')[0].trim(),
    kcal: Math.round(kcal * 10) / 10,
    protein: Math.round(num(n.proteins_100g) * 10) / 10,
    fat: Math.round(num(n.fat_100g) * 10) / 10,
    carbs: Math.round(num(n.carbohydrates_100g) * 10) / 10,
    fiber: Math.round(num(n.fiber_100g) * 10) / 10,
    sugar: Math.round(num(n.sugars_100g) * 10) / 10,
    // натрій каталог дає в грамах, а частіше є лише сіль: у ній натрію
    // приблизно 40 % за масою
    sodium: Math.round(
      (num(n.sodium_100g) || num(n.salt_100g) * 0.4) * 1000
    ),
    serving: num(p.serving_quantity),
    source: 'Open Food Facts',
  };
  if (!product.name && !product.kcal) {
    return { error: 'У каталозі немає даних про склад', code: clean };
  }
  // одразу кладемо в базу: наступного разу знайдеться без мережі
  await saveProduct(product);
  return { product, from: 'каталог' };
}

/** Переписує лист страв цілком — їх мало, а так простіше не наплутати */
async function writeDishes(dishes) {
  const rows = [DISH_HEADERS];
  dishes.forEach((d) => {
    d.items.forEach((it) => {
      rows.push([
        d.name, it.name || '', num(it.grams),
        ...NUTRIENTS.map((k) => num(it[k])),
      ]);
    });
  });
  const api = getSheetsClient();
  await api.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID(), range: `'${DISHES_SHEET}'`,
  });
  await api.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID(),
    range: `'${DISHES_SHEET}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

export async function saveDish({ name, items, rename }) {
  await ensureSheets();
  const clean = str(name).trim();
  if (!clean) return { error: 'Не вказано назву страви' };

  const all = parseDishes(await read(DISHES_SHEET));
  const was = str(rename).trim() || clean;
  const rest = all.filter((d) => d.name !== was && d.name !== clean);
  const kept = (items || []).filter((it) => str(it.name).trim() || num(it.kcal));
  if (!kept.length) return { error: 'Додайте хоча б один складник' };

  await writeDishes([...rest, { name: clean, items: kept }]);
  return { ok: true };
}

export async function delDish(name) {
  await ensureSheets();
  const all = parseDishes(await read(DISHES_SHEET));
  await writeDishes(all.filter((d) => d.name !== str(name).trim()));
  return { ok: true };
}

/**
 * Переносить їжу з одного дня в інший. Зручно, коли їси однаково:
 * не переписувати ж усе заново.
 */
export async function copyDay({ from, to, meals }) {
  await ensureSheets();
  const rows = parseFood(await read(FOOD_SHEET))
    .filter((f) => f.date === from)
    .filter((f) => !meals || !meals.length || meals.includes(f.meal));
  if (!rows.length) return { copied: 0 };

  const values = rows.map((f) => {
    const r = new Array(FOOD_HEADERS.length).fill('');
    r[F.date] = to;
    r[F.time] = f.time || nowKyiv();
    r[F.meal] = f.meal;
    r[F.name] = f.name;
    r[F.amount] = f.amount;
    NUTRIENTS.forEach((k) => { r[F[k]] = num(f[k]); });
    return r;
  });

  const api = getSheetsClient();
  await api.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID(),
    range: `'${FOOD_SHEET}'`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
  await recalcDay(to);
  return { copied: values.length };
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

/* ---------- Ліки ---------- */

/** «Ранок, Вечір» → ['Ранок','Вечір'] у канонічному порядку */
function parseSlots(v) {
  const raw = str(v).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return SLOT_KEYS.filter((k) => raw.includes(k.toLowerCase()));
}

/** «10.08.2026=Ранок,Вечір; 09.08.2026=Ранок» → { '10.08.2026': ['Ранок','Вечір'] } */
function parseLog(v) {
  const out = {};
  str(v).split(';').forEach((part) => {
    const [date, list] = part.split('=');
    const d = str(date).trim();
    if (!d) return;
    const slots = parseSlots(list);
    if (slots.length) out[d] = slots;
  });
  return out;
}

function serializeLog(log) {
  return Object.keys(log)
    .filter((d) => log[d] && log[d].length)
    .sort((a, b) => stamp(b) - stamp(a))
    .slice(0, LOG_DAYS_KEPT)
    .map((d) => `${d}=${log[d].join(',')}`)
    .join('; ');
}

export function parseMeds(values) {
  if (!values || values.length < 2) return [];
  const out = [];
  values.slice(1).forEach((raw, i) => {
    const r = pad(raw, MED_HEADERS.length);
    if (r.join('').trim() === '') return;
    out.push({
      row: i + 2,
      drug: str(r[M.drug]).trim(),
      dose: str(r[M.dose]).trim(),
      slots: parseSlots(r[M.slots]),
      start: str(r[M.start]).trim(),
      days: num(r[M.days]),
      stock: str(r[M.stock]).trim() === '' ? null : num(r[M.stock]),
      note: str(r[M.note]).trim(),
      log: parseLog(r[M.log]),
    });
  });
  return out;
}

/** Рядок листа з тіла запиту. Журнал не чіпаємо — його веде лише «прийнято». */
function medRow(m, log = '') {
  const r = new Array(MED_HEADERS.length).fill('');
  r[M.drug] = str(m.drug).trim();
  r[M.dose] = str(m.dose).trim();
  r[M.slots] = parseSlots(Array.isArray(m.slots) ? m.slots.join(',') : m.slots).join(', ');
  r[M.start] = str(m.start).trim();
  r[M.days] = m.days === '' || m.days === null || m.days === undefined ? '' : Number(m.days) || '';
  r[M.stock] = m.stock === '' || m.stock === null || m.stock === undefined ? '' : Number(m.stock) || 0;
  r[M.note] = str(m.note).trim();
  r[M.log] = log;
  return r;
}

/** Новий курс або редагування наявного (коли передано row) */
export async function saveMed(m) {
  await ensureSheets();
  if (!str(m.drug).trim()) throw new Error('Не вказано препарат');
  if (m.row) {
    const rows = await read(MEDS_SHEET);
    const cur = pad(rows[m.row - 1], MED_HEADERS.length);
    if (!rows[m.row - 1]) throw new Error('Рядок не знайдено');
    await writeRow(MEDS_SHEET, m.row, medRow(m, str(cur[M.log])));
  } else {
    await append(MEDS_SHEET, medRow(m));
  }
}

/**
 * Відмітка прийому — перемикач: друге натискання знімає її й повертає
 * таблетку в запас. Так виправляється випадковий дотик, а не додається
 * ще одна кнопка «скасувати».
 */
export async function takeMed({ row, slot, date }) {
  await ensureSheets();
  if (!row || !SLOT_KEYS.includes(slot)) throw new Error('Невірний рядок або час прийому');
  const rows = await read(MEDS_SHEET);
  if (!rows[row - 1]) throw new Error('Рядок не знайдено');
  const r = pad(rows[row - 1], MED_HEADERS.length);

  const d = str(date).trim() || todayKyiv();
  const log = parseLog(r[M.log]);
  const taken = log[d] || [];
  const already = taken.includes(slot);
  const next = already ? taken.filter((s) => s !== slot) : [...taken, slot];
  log[d] = SLOT_KEYS.filter((k) => next.includes(k));
  r[M.log] = serializeLog(log);

  const stock = str(r[M.stock]).trim() === '' ? null : num(r[M.stock]);
  if (stock !== null) r[M.stock] = Math.max(0, stock + (already ? 1 : -1));

  await writeRow(MEDS_SHEET, row, r);
}

/** Поповнення запасу */
export async function restockMed({ row, qty }) {
  await ensureSheets();
  if (!row) throw new Error('Не вказано рядок');
  const rows = await read(MEDS_SHEET);
  if (!rows[row - 1]) throw new Error('Рядок не знайдено');
  const r = pad(rows[row - 1], MED_HEADERS.length);
  const stock = num(r[M.stock]) || 0;
  r[M.stock] = Math.max(0, stock + (Number(qty) || 0));
  await writeRow(MEDS_SHEET, row, r);
}

export async function delMed(row) {
  await ensureSheets();
  if (!row) throw new Error('Не вказано рядок');
  return removeRow(MEDS_SHEET, row);
}

/**
 * Прогрес таблиці множення. Лист переписується цілком: рядків тридцять
 * шість, це один запит замість пошуку змінених клітинок — а тренування
 * закінчується раз на кілька хвилин, не частіше.
 */
export async function saveCode(prog) {
  await ensureSheets();
  const api = getSheetsClient();
  await api.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID(),
    range: `'${CODE_SHEET}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [CODE_HEADERS, ...codeRows(prog)] },
  });
}

export async function saveMult(prog) {
  await ensureSheets();
  const api = getSheetsClient();
  await api.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID(),
    range: `'${MULT_SHEET}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [MULT_HEADERS, ...multRows(prog)] },
  });
}
