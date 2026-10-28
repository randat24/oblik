import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIso, toIso, showDate, shiftMonth, monthGrid, kyivToday, MONTH_NAMES, WEEKDAY_NAMES,
} from '../lib/calendar.js';

test('дата розбирається, неіснуюча чи хибна дає null', () => {
  assert.deepEqual(parseIso('2026-10-28'), { y: 2026, m: 10, d: 28 });
  assert.equal(parseIso('2026-02-31'), null, '31 лютого не існує');
  assert.equal(parseIso('2026-13-01'), null);
  assert.equal(parseIso('28.10.2026'), null);
  assert.equal(parseIso(''), null);
  assert.equal(parseIso(null), null);
  assert.deepEqual(parseIso('2028-02-29'), { y: 2028, m: 2, d: 29 }, 'високосний рік');
  assert.equal(parseIso('2027-02-29'), null);
});

test('на екрані дата виглядає як дд.мм.рррр, порожня лишається порожньою', () => {
  assert.equal(showDate('2026-10-08'), '08.10.2026');
  assert.equal(showDate(''), '');
  assert.equal(showDate('сміття'), '');
});

test('запис дати доповнює нулями', () => {
  assert.equal(toIso(2026, 3, 5), '2026-03-05');
});

test('перехід між місяцями через кінець року й назад', () => {
  assert.deepEqual(shiftMonth({ y: 2026, m: 12 }, 1), { y: 2027, m: 1 });
  assert.deepEqual(shiftMonth({ y: 2026, m: 1 }, -1), { y: 2025, m: 12 });
  assert.deepEqual(shiftMonth({ y: 2026, m: 10 }, 14), { y: 2027, m: 12 });
  assert.deepEqual(shiftMonth({ y: 2026, m: 10 }, -10), { y: 2025, m: 12 });
});

test('сітка місяця — шість тижнів по сім днів, перший рядок починається з понеділка', () => {
  const g = monthGrid(2026, 10);
  assert.equal(g.length, 6);
  assert.ok(g.every((w) => w.length === 7));
  // 1 жовтня 2026 — четвер: перед ним три дні вересня (пн, вт, ср)
  assert.deepEqual(g[0].map((c) => c.iso).slice(0, 4), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']);
  assert.equal(g[0][0].out, true);
  assert.equal(g[0][3].out, false);
});

test('місяць, що починається з понеділка, не має зайвих днів попереду', () => {
  // 1 вересня 2025 — понеділок
  const g = monthGrid(2025, 9);
  assert.equal(g[0][0].iso, '2025-09-01');
  assert.equal(g[0][0].out, false);
});

test('сітка містить усі дні місяця рівно по разу', () => {
  const days = monthGrid(2028, 2).flat().filter((c) => !c.out).map((c) => c.day);
  assert.deepEqual(days, Array.from({ length: 29 }, (_, i) => i + 1));
});

test('сьогоднішній день у сітці позначений, лише один', () => {
  const marked = monthGrid(2026, 10, '2026-10-28').flat().filter((c) => c.today);
  assert.equal(marked.length, 1);
  assert.equal(marked[0].iso, '2026-10-28');
});

test('назви місяців і днів — дванадцять і сім, тиждень з понеділка', () => {
  assert.equal(MONTH_NAMES.length, 12);
  assert.equal(WEEKDAY_NAMES.length, 7);
  assert.equal(WEEKDAY_NAMES[0], 'Пн');
});

test('сьогодні — за київським часом, а не за годинником користувача', () => {
  // 21:30 UTC 28 жовтня — в Києві (UTC+3 восени 2026 уже зимовий час, +2) вже 29-те
  assert.equal(kyivToday(new Date('2026-10-28T22:30:00Z')), '2026-10-29');
  assert.equal(kyivToday(new Date('2026-10-28T10:00:00Z')), '2026-10-28');
});
