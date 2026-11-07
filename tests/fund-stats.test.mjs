import test from 'node:test';
import assert from 'node:assert/strict';
import { guessCategory, spendingOf, spendStats, monthRange, NONE } from '../lib/fund-stats.js';

const members = [
  { id: 'denis', name: 'Денис', order: 1, opening: 0, periods: [{ start: '2000-01-01' }], vacations: [] },
  { id: 'fess', name: 'Фесс', order: 2, opening: 0, periods: [{ start: '2000-01-01' }], vacations: [] },
];
const op = (f) => ({
  type: 'expense', status: '', category: 'var', payer: 'denis', mode: 'auto', amount: 10000, ...f,
});
const archExpense = (f) => ({ kind: 'expense', payer: 'fess', total: 5000, desc: '', ...f });

test('підпис архіву розкладається за першим словом', () => {
  assert.equal(guessCategory('старлинк, мясо, магаз'), 'fixed');
  assert.equal(guessCategory('Мясо, старлинк'), 'var');
  assert.equal(guessCategory('соляра форд'), 'other');
  assert.equal(guessCategory('посуда'), 'home');
});

test('ім’я замість опису не вгадується, а лишається без категорії', () => {
  assert.equal(guessCategory('петя'), NONE);
  assert.equal(guessCategory(''), NONE);
});

test('змішані рядки архіву не стають витратами, а лише рахуються', () => {
  const rows = [archExpense({ date: '2025-01-05' }), { kind: 'mixed', date: '2025-01-06', by: {} }];
  const items = spendingOf(members, [], rows);
  assert.equal(items.length, 1);
  assert.equal(spendStats(items, rows).mixed, 1);
});

test('власник каси в архіві рахується як каса', () => {
  const [x] = spendingOf(members, [], [archExpense({ date: '2025-01-05', payer: 'alex' })]);
  assert.equal(x.payer, 'cash');
});

test('скасована витрата книги в статистику не потрапляє', () => {
  const items = spendingOf(members, [op({ date: '2026-10-20', status: 'cancelled' })], []);
  assert.equal(items.length, 0);
});

test('книга й архів сходяться в одну суму по категоріях', () => {
  const items = spendingOf(members, [op({ date: '2026-10-20' })], [archExpense({ date: '2025-01-05', desc: 'магаз' })]);
  const s = spendStats(items, []);
  assert.equal(s.total, 15000);
  assert.equal(s.cats.var.sum, 15000);
  assert.equal(Object.values(s.cats).reduce((a, c) => a + c.sum, 0), s.total);
});

test('місяць без витрат лишається на осі нулем', () => {
  const items = spendingOf(members, [], [
    archExpense({ date: '2025-01-05' }), archExpense({ date: '2025-03-05' }),
  ]);
  assert.deepEqual(spendStats(items).months.map((m) => [m.ym, m.sum]),
    [['2025-01', 5000], ['2025-02', 0], ['2025-03', 5000]]);
});

test('вибраний місяць звужує суми, а вісь лишає за весь рік', () => {
  const items = spendingOf(members, [], [
    archExpense({ date: '2025-01-05' }), archExpense({ date: '2025-03-05', total: 7000 }),
  ]);
  const s = spendStats(items, [], '2025-03');
  assert.equal(s.total, 7000);
  assert.equal(s.months.length, 3);
});

test('рахунок місяців переходить через новий рік', () => {
  assert.deepEqual(monthRange('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
});
