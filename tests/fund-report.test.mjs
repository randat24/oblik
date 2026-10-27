import test from 'node:test';
import assert from 'node:assert/strict';
import { kop, compute } from '../lib/fund.js';
import { nextMonth, monthsOf, monthReport, memberStatement } from '../lib/fund-report.js';
import { OPENING_MEMBERS, OPENING_CASH, OPENING_DIFF } from '../lib/fund-seed.js';

const cfg = { openingCash: OPENING_CASH, openingDiff: OPENING_DIFF };
const op = (o) => ({ status: 'active', mode: 'auto', category: 'var', ...o });
const OPS = [
  op({ id: 'a', type: 'expense', date: '2026-09-28', amount: kop('300'), payer: 'petya' }),
  op({ id: 'b', type: 'expense', date: '2026-10-05', amount: kop('600'), payer: 'cash', desc: 'Каса' }),
  op({ id: 'c', type: 'expense', date: '2026-10-10', amount: kop('1000'), payer: 'fess', category: 'fixed' }),
  op({ id: 'd', type: 'deposit', date: '2026-10-12', amount: kop('500'), member: 'vanya' }),
  op({ id: 'e', type: 'reimburse', date: '2026-10-15', amount: kop('200'), member: 'fess' }),
  op({ id: 'f', type: 'expense', date: '2026-10-16', amount: kop('90'), payer: 'petya', status: 'cancelled' }),
  op({ id: 'g', type: 'expense', date: '2026-11-02', amount: kop('120'), payer: 'fess' }),
];

test('наступний місяць, у тому числі через кінець року', () => {
  assert.equal(nextMonth('2026-10'), '2026-11-01');
  assert.equal(nextMonth('2026-12'), '2027-01-01');
});

test('місяці зі скасованими не рахуються, поточний є завжди', () => {
  assert.deepEqual(monthsOf(OPS, '2026-12-03'), ['2026-12', '2026-11', '2026-10', '2026-09']);
  assert.deepEqual(monthsOf([], '2026-10-27'), ['2026-10']);
});

test('початок плюс рух дорівнює кінцю — для каси й для кожного', () => {
  const r = monthReport(OPENING_MEMBERS, OPS, cfg, '2026-10');
  assert.equal(r.cash.start + r.total.deposits - r.total.reimbursed - r.total.fromCash + r.total.adjusted, r.cash.end);
  for (const m of OPENING_MEMBERS) {
    const e = r.each[m.id];
    assert.equal(e.start + e.paid + e.deposited - e.share - e.received, e.end, m.name);
  }
});

test('підсумки місяця: тільки його чинні витрати', () => {
  const r = monthReport(OPENING_MEMBERS, OPS, cfg, '2026-10');
  assert.equal(r.total.spent, kop('1600'));
  assert.equal(r.total.count, 2);
  assert.equal(r.total.fromCash, kop('600'));
  assert.equal(r.cats.fixed.sum, kop('1000'));
  assert.equal(r.cats.var.sum, kop('600'));
  assert.equal(r.total.deposits, kop('500'));
  assert.equal(r.ops, 4);
});

test('частки в звіті складаються в суму витрат', () => {
  const r = monthReport(OPENING_MEMBERS, OPS, cfg, '2026-10');
  const shares = Object.values(r.each).reduce((a, e) => a + e.share, 0);
  assert.equal(shares, r.total.spent);
});

test('кінець місяця збігається з головним екраном на цю дату', () => {
  const r = monthReport(OPENING_MEMBERS, OPS, cfg, '2026-10');
  const s = compute(OPENING_MEMBERS, OPS, cfg, { until: '2026-10-31' });
  assert.equal(r.cash.end, s.cash);
  OPENING_MEMBERS.forEach((m) => assert.equal(r.each[m.id].end, s.bal[m.id]));
});

test('порожній місяць — нулі, початок дорівнює кінцю', () => {
  const r = monthReport(OPENING_MEMBERS, OPS, cfg, '2026-08');
  assert.equal(r.total.spent, 0);
  assert.equal(r.cash.start, r.cash.end);
});

test('виписка закінчується балансом головного екрана', () => {
  const s = compute(OPENING_MEMBERS, OPS, cfg);
  for (const m of OPENING_MEMBERS) {
    assert.equal(memberStatement(OPENING_MEMBERS, OPS, m.id).closing, s.bal[m.id], m.name);
  }
});

test('виписка: лише операції, що зачепили людину, скасовані пропущено', () => {
  const st = memberStatement(OPENING_MEMBERS, OPS, 'denis');
  assert.ok(st.rows.every((r) => r.op.status !== 'cancelled'));
  // Денис вийшов 20.10 — його стосується лише те, що до цієї дати
  assert.ok(st.rows.every((r) => r.op.date < '2026-10-20' || r.op.type !== 'expense' || r.op.mode === 'manual'));
  assert.equal(st.opening, kop('-2920'));
});
