// Розширення тут стоїть навмисно, на відміну від решти файлів: цей
// модуль розбирає рядки листа, тож він покритий тестами, а вбудований у
// Node запускач тестів шукає файл рівно за тим шляхом, який написали.
import {
  readSheet, appendRow, appendRows, writeCells, ensureSheet, writeRow, todayStr,
} from './sheets.js';

/**
 * СП — куди їдуть посилки.
 *
 * Раніше цей список збирався з того, що вже вписували руками: поле було
 * текстовим, і кожна описка ставала новим варіантом. «Тигр», «тигр» і
 * «Тирг» жили поруч, а в підсумках вони троє — три різні напрямки.
 *
 * Тепер список веде адміністратор, а в формах його лише обирають. Той,
 * хто збирає посилку, не вирішує, як називається СП, — він показує
 * пальцем на готове. Це і швидше, і дає ті самі назви в кожній картці.
 *
 * Список живе в таблиці, як і все інше: його видно й правити його можна
 * навіть тоді, коли до застосунку немає доступу.
 */
export const SP_SHEET = 'СП';

export const SP_HEADERS = ['Назва', 'Активний', 'Додано'];

export const SPC = { name: 0, active: 1, added: 2 };

/** З чого починається порожній лист — щоб форма працювала одразу */
export const SP_DEFAULT = ['Тигр', 'Рись', 'Білий'];

const str = (v) => (v ?? '').toString().trim();

// Порожня клітинка вважається «так»: людина, яка допише назву руками
// просто в таблиці, не має ще й згадувати про другу колонку.
const truthy = (v) => {
  const s = str(v).toLowerCase();
  return s === '' || s === 'так' || s === 'yes' || s === 'true' || s === '1' || s === '+';
};

let ensured = false;

async function ensureSpSheet() {
  if (ensured) return;
  await ensureSheet(SP_SHEET, SP_HEADERS);
  ensured = true;
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

/** Тільки назви тих СП, куди зараз возять */
export const activeNames = (list) => (list || []).filter((p) => p.active).map((p) => p.name);

export async function readPoints() {
  await ensureSpSheet();
  const values = await readSheet(SP_SHEET);

  if ((values[0] || []).length < SP_HEADERS.length) {
    await writeRow(SP_SHEET, 1, SP_HEADERS);
    values[0] = [...SP_HEADERS];
  }

  const list = parsePoints(values);
  // Порожній список означав би форму без жодного варіанта — а посилки
  // возять уже сьогодні. Тому лист заповнюється тим, що є зараз, і далі
  // його веде адміністратор.
  if (!list.length) {
    await appendRows(
      SP_SHEET,
      SP_DEFAULT.map((name) => {
        const r = new Array(SP_HEADERS.length).fill('');
        r[SPC.name] = name;
        r[SPC.active] = 'так';
        r[SPC.added] = todayStr();
        return r;
      }),
      { raw: true }
    );
    return SP_DEFAULT.map((name, i) => ({
      row: i + 2, name, active: true, added: todayStr(),
    }));
  }
  return list;
}

/** Чи є вже така назва — щоб не завести «Тигр» удруге */
export const hasPoint = (list, name) => (list || [])
  .some((p) => p.name.toLowerCase() === str(name).toLowerCase());

export async function addPoint(name) {
  await ensureSpSheet();
  const row = new Array(SP_HEADERS.length).fill('');
  row[SPC.name] = str(name);
  row[SPC.active] = 'так';
  row[SPC.added] = todayStr();
  await appendRow(SP_SHEET, row, { raw: true });
  return { name: str(name), active: true };
}

/**
 * Правка назви або вимикання.
 *
 * Видалення тут немає навмисно: назва СП стоїть у вже написаних картках,
 * і прибрати її з переліку означало б лишити ті картки з посиланням на
 * те, чого немає. Вимкнений СП просто перестає пропонуватись у нових
 * посилках, а історія лишається читабельною.
 */
export async function updatePoint(row, { name, active }) {
  await ensureSpSheet();
  const ups = [];
  if (name !== undefined && str(name)) ups.push({ row, col: SPC.name + 1, value: str(name) });
  if (active !== undefined) ups.push({ row, col: SPC.active + 1, value: active ? 'так' : 'ні' });
  if (ups.length) await writeCells(SP_SHEET, ups, { raw: true });
  return true;
}
