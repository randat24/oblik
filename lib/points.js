// Розширення тут стоїть навмисно, на відміну від решти файлів: цей
// модуль розбирає рядки листа, тож він покритий тестами, а вбудований у
// Node запускач тестів шукає файл рівно за тим шляхом, який написали.
import {
  readSheet, appendRow, appendRows, writeCells, ensureSheet, writeRow, todayStr,
} from './sheets.js';

/**
 * Довідники доставки — те, з чого обирають у формах.
 *
 * Раніше ці списки збиралися з того, що вже вписали руками, і кожна
 * описка ставала новим варіантом: «Тигр», «тигр» і «Тирг» жили поруч, а в
 * підсумках вони троє — три різні напрямки.
 *
 * Тепер їх веде адміністратор. Списки живуть у таблиці, як і все інше:
 * їх видно й правити їх можна навіть тоді, коли до застосунку немає
 * доступу.
 *
 * Три списки — бо це три різні речі на шляху посилки, і плутати їх не
 * можна: куди вона їде, чим її везуть на точку вильоту й хто там її
 * забирає.
 */
export const LISTS = [
  {
    key: 'sp',
    sheet: 'СП',
    title: 'СП',
    hint: 'Куди призначена посилка',
    // Тільки вибір: СП — це адреса, і вписана від руки вона перестає
    // сходитись із тією самою в інших картках.
    strict: true,
    def: ['Тигр', 'Рись', 'Білий'],
  },
  {
    key: 'transport',
    sheet: 'Транспорт',
    title: 'Чим відправляють',
    hint: 'Чим посилка їде на точку вильоту: НРК, машина',
    strict: false,
    def: ['НРК', 'Машина'],
  },
  {
    key: 'takers',
    sheet: 'Приймають на точці',
    title: 'Хто переправляє дронами',
    hint: 'Приймають посилку на точці вильоту й везуть її далі дронами',
    strict: false,
    def: ['Лотар', 'Джин', 'БПС'],
  },
];

export const listByKey = (key) => LISTS.find((l) => l.key === key) || null;

export const SP_SHEET = LISTS[0].sheet;

export const SP_HEADERS = ['Назва', 'Активний', 'Додано'];

export const SPC = { name: 0, active: 1, added: 2 };

/** З чого починається порожній лист — щоб форма працювала одразу */
export const SP_DEFAULT = LISTS[0].def;

const str = (v) => (v ?? '').toString().trim();

// Порожня клітинка вважається «так»: людина, яка допише назву руками
// просто в таблиці, не має ще й згадувати про другу колонку.
const truthy = (v) => {
  const s = str(v).toLowerCase();
  return s === '' || s === 'так' || s === 'yes' || s === 'true' || s === '1' || s === '+';
};

const ensured = new Set();

async function ensureListSheet(sheet) {
  if (ensured.has(sheet)) return;
  await ensureSheet(sheet, SP_HEADERS);
  ensured.add(sheet);
}

export function parsePoints(values) {
  if (!values || !values.length) return [];
  return values.slice(1)
    .map((raw, i) => {
      const row = [...(raw || [])];
      while (row.length < SP_HEADERS.length) row.push('');
      return {
        row: i + 2,
        name: str(row[SPC.name]),
        active: truthy(row[SPC.active]),
        added: str(row[SPC.added]),
      };
    })
    .filter((p) => p.name);
}

/** Тільки назви тих, що зараз у ділі */
export const activeNames = (list) => (list || []).filter((p) => p.active).map((p) => p.name);

const seedRow = (name) => {
  const r = new Array(SP_HEADERS.length).fill('');
  r[SPC.name] = name;
  r[SPC.active] = 'так';
  r[SPC.added] = todayStr();
  return r;
};

/** Один список за ключем; порожній заповнюється тим, що є зараз */
export async function readList(key) {
  const cfg = listByKey(key);
  if (!cfg) return [];
  await ensureListSheet(cfg.sheet);
  const values = await readSheet(cfg.sheet);

  if ((values[0] || []).length < SP_HEADERS.length) {
    await writeRow(cfg.sheet, 1, SP_HEADERS);
    values[0] = [...SP_HEADERS];
  }

  const list = parsePoints(values);
  // Порожній список означав би форму без жодного варіанта — а посилки
  // возять уже сьогодні. Тому лист заповнюється тим, що є зараз, і далі
  // його веде адміністратор.
  if (!list.length && cfg.def.length) {
    await appendRows(cfg.sheet, cfg.def.map(seedRow), { raw: true });
    return cfg.def.map((name, i) => ({ row: i + 2, name, active: true, added: todayStr() }));
  }
  return list;
}

/** Усі три списки одним заходом — стільки ж запитів, скільки й списків */
export async function readAllLists() {
  const got = await Promise.all(LISTS.map((l) => readList(l.key)));
  return Object.fromEntries(LISTS.map((l, i) => [l.key, got[i]]));
}

/** Сумісність із першою версією, де список був один */
export const readPoints = () => readList('sp');

/** Чи є вже така назва — щоб не завести «Тигр» удруге */
export const hasPoint = (list, name) => (list || [])
  .some((p) => p.name.toLowerCase() === str(name).toLowerCase());

export async function addPoint(key, name) {
  const cfg = listByKey(key);
  if (!cfg) return null;
  await ensureListSheet(cfg.sheet);
  await appendRow(cfg.sheet, seedRow(str(name)), { raw: true });
  return { name: str(name), active: true };
}

/**
 * Правка назви або вимикання.
 *
 * Видалення тут немає навмисно: назва стоїть у вже написаних картках, і
 * прибрати її з переліку означало б лишити ті картки з посиланням на те,
 * чого немає. Вимкнене просто перестає пропонуватись у нових посилках, а
 * історія лишається читабельною.
 */
export async function updatePoint(key, row, { name, active }) {
  const cfg = listByKey(key);
  if (!cfg) return false;
  await ensureListSheet(cfg.sheet);
  const ups = [];
  if (name !== undefined && str(name)) ups.push({ row, col: SPC.name + 1, value: str(name) });
  if (active !== undefined) ups.push({ row, col: SPC.active + 1, value: active ? 'так' : 'ні' });
  if (ups.length) await writeCells(cfg.sheet, ups, { raw: true });
  return true;
}
