import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHIVE } from '../lib/fund-archive-data.js';
import {
  cell, dateIn, assignDates, explain, parseOldTable, typedTotals, reconcile, sumByPerson, toAppBalance,
} from '../lib/fund-archive.js';

/** Рядок старої таблиці: пари колонок (підпис, сума) для семи людей + права таблиця */
const COLS = { denis: 1, alex: 3, fantomas: 5, vanya: 7, fess: 9, petya: 11, walter: 13 };
const LABEL = { denis: 0, alex: 2, fantomas: 4, vanya: 6, fess: 8, petya: 10, walter: 12 };
function line({ by = {}, labels = {}, right = '', listed = '' } = {}) {
  const r = new Array(17).fill('');
  Object.entries(by).forEach(([id, v]) => { r[COLS[id]] = String(v); });
  Object.entries(labels).forEach(([id, v]) => { r[LABEL[id]] = v; });
  r[15] = right; r[16] = String(listed);
  return r;
}
const k = (n) => Math.round(n * 100);

test('клітинка: число з комою, пробілами й мінусом читається в копійки', () => {
  assert.equal(cell('1 367,5'), 136750);
  assert.equal(cell('-2700'), -270000);
  assert.equal(cell('−5,25'), -525);
});

test('клітинка: текст і порожнє — не число', () => {
  assert.equal(cell('свет'), null);
  assert.equal(cell(''), null);
  assert.equal(cell('13/03/24'), null);
});

test('дата: з роком, без року і діапазон днів', () => {
  assert.deepEqual(dateIn('13/03/24'), { d: 13, m: 3, y: 2024 });
  assert.deepEqual(dateIn('06/06/25'), { d: 6, m: 6, y: 2025 });
  assert.deepEqual(dateIn('16.08'), { d: 16, m: 8, y: null });
  assert.deepEqual(dateIn('9-15.10'), { d: 15, m: 10, y: null });
});

test('дата: звичайне число й сума датою не вважаються', () => {
  assert.equal(dateIn('746'), null);
  assert.equal(dateIn('свет'), null);
});

test('дати рядків: коли місяць скаче назад на півроку, почався новий рік', () => {
  const rows = [
    { dates: ['13/03/24'] }, { dates: ['13.08'] }, { dates: [] }, { dates: ['04.01'] },
  ];
  assert.deepEqual(assignDates(rows), ['2024-03-13', '2024-08-13', '2024-08-13', '2025-01-04']);
});

test('дати рядків: рядок без власної дати позначений приблизним', () => {
  const rows = [{ dates: ['13/03/24'] }, { dates: [] }];
  assignDates(rows);
  assert.equal(rows[0].approx, false);
  assert.equal(rows[1].approx, true);
});

test('рядок: платник серед тих, хто їв, — витрата на шістьох з боргом платника', () => {
  const by = { denis: k(746), alex: k(746), fantomas: k(746), vanya: k(746), fess: k(-3728), walter: k(746) };
  const e = explain(by, k(4474));
  assert.equal(e.kind, 'expense');
  assert.equal(e.payer, 'fess');
  assert.equal(e.parts.length, 6);
  assert.equal(e.total, k(4474));
});

test('рядок: платник, який не їв, — витрата лише на тих, у кого плюс', () => {
  const by = { denis: k(100), vanya: k(100), fess: k(-200) };
  const e = explain(by, k(200));
  assert.equal(e.kind, 'expense');
  assert.equal(e.parts.includes('fess'), false);
  assert.equal(e.parts.length, 2);
});

test('рядок: двоє з протилежними сумами — переказ від того, у кого мінус', () => {
  const e = explain({ denis: k(-2000), vanya: k(2000) });
  assert.deepEqual(e, { kind: 'transfer', from: 'denis', to: 'vanya', amount: k(2000) });
});

test('рядок: нерозбірливий набір лишається «змішаним», а не вгадується', () => {
  const e = explain({ denis: k(5000), alex: k(-3000), vanya: k(-2000), fess: k(777) });
  assert.equal(e.kind, 'mixed');
});

test('таблиця: рядки з сумами стають записами, порожні пропускаються', () => {
  const grid = [
    [], [], [], [], // шапка
    line({ by: { denis: -2700, fantomas: -700 }, labels: { denis: '13/03/24' } }),
    line({}),
    line({ by: { denis: 746, vanya: 746, fess: -1492 }, right: 'вода', listed: 1492 }),
  ];
  const rows = parseOldTable(grid, { first: 5, last: 7 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].n, 5);
  assert.equal(rows[0].date, '2024-03-13');
  assert.equal(rows[1].n, 7);
});

test('таблиця: підпис правої таблиці береться, лише коли сума витрати зійшлась', () => {
  const grid = [[], [], [], [],
    line({ by: { denis: 100, vanya: 100, fess: -200 }, right: 'вода', listed: 200 }),
    line({ by: { denis: 50, vanya: 50, fess: -100 }, right: 'чужа витрата', listed: 9999 }),
  ];
  const rows = parseOldTable(grid, { first: 5, last: 6 });
  assert.equal(rows[0].desc, 'вода');
  assert.equal(rows[1].desc, '');
});

test('звірка: сума рядків і ручний підсумок збігаються — різниця нуль', () => {
  const grid = [[], [], [], [],
    line({ by: { denis: -2700, vanya: 2700 } }),
    line({ by: { denis: 5620, vanya: -5620 } }),
  ];
  const rows = parseOldTable(grid, { first: 5, last: 6 });
  const rec = reconcile(rows, { denis: k(2920), vanya: k(-2920) });
  assert.deepEqual(rec.filter((r) => r.diff !== 0), []);
});

test('звірка: розбіжність показується числом, а не ховається', () => {
  const grid = [[], [], [], [], line({ by: { denis: 1000, vanya: -1000 } })];
  const rows = parseOldTable(grid, { first: 5, last: 5 });
  const rec = reconcile(rows, { denis: k(1200), vanya: k(-1000) });
  assert.equal(rec.find((r) => r.id === 'denis').diff, k(200));
});

test('підсумки внизу беруться з колонок підписів, а не сум', () => {
  const grid = Array.from({ length: 491 }, () => []);
  grid[490] = [k(2920) / 100, '', k(13199) / 100, '', '3291', '', '4240', '', '-14320', '', '-11514', '', '2186'];
  const t = typedTotals(grid, 491);
  assert.equal(t.denis, k(2920));
  assert.equal(t.alex, k(13199));
  assert.equal(t.fess, k(-14320));
});

test('суми по людях: зміни різних рядків складаються', () => {
  assert.deepEqual(sumByPerson([{ by: { denis: 100 } }, { by: { denis: -30, vanya: 5 } }]), { denis: 70, vanya: 5 });
});

test('знак: у застосунку баланс людини протилежний старому, каса — той самий', () => {
  assert.equal(toAppBalance('denis', 292000), -292000);
  assert.equal(toAppBalance('fess', -1432000), 1432000);
  assert.equal(toAppBalance('alex', 1319900), 1319900);
});

test('архів: рядки з даних сходяться з підсумками таблиці до копійки', () => {
  const rec = reconcile(ARCHIVE.rows, ARCHIVE.typed);
  assert.deepEqual(rec.filter((r) => r.diff !== 0), []);
});

test('архів: підсумки збігаються з тим, що внесено в застосунок на 15.10', () => {
  // ті самі шість балансів і каса, що в lib/fund-seed.js, зі знаком застосунку
  const app = { denis: -2920, fantomas: -3291, vanya: -4240, walter: -2186, petya: 11514, fess: 14320 };
  Object.entries(app).forEach(([id, v]) => {
    assert.equal(toAppBalance(id, ARCHIVE.typed[id]), v * 100, id);
  });
  assert.equal(ARCHIVE.typed.alex, 1319900);
});

test('архів: дати йдуть за часом і закінчуються на 15.10.2026', () => {
  const dates = ARCHIVE.rows.map((r) => r.date);
  assert.deepEqual([...dates].sort(), dates);
  assert.equal(ARCHIVE.until, '2026-10-15');
});
