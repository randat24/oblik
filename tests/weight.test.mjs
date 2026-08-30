import test from 'node:test';
import assert from 'node:assert/strict';

import {
  stampOf, dateOf, smooth, rate, forecast, pace,
  explainJump, deficit, plateau, waistTrend, verdicts,
} from '../lib/weight.js';

const DAY = 86400000;
const START = Date.UTC(2026, 6, 1);           // 01.07.2026
const day = (i) => dateOf(START + i * DAY);

/** Ряд зважувань: вага за днями, extra — додаткові поля окремих днів */
const series = (weights, extra = {}) =>
  weights.map((w, i) => ({ date: day(i), weight: w, ...(extra[i] || {}) }));

/** Рівне зниження на `step` кг щодня */
const falling = (n, from, step) =>
  series(Array.from({ length: n }, (_, i) => Math.round((from - i * step) * 100) / 100));

const flatLine = (n, w) => series(Array.from({ length: n }, () => w));

const near = (actual, expected, eps, msg) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${msg}: ${actual} ≉ ${expected} (±${eps})`);

/* ── дати ──────────────────────────────────────────────────────────────── */

test('stampOf і dateOf — взаємно зворотні', () => {
  assert.equal(stampOf('16.08.2026'), Date.UTC(2026, 7, 16));
  assert.equal(dateOf(Date.UTC(2026, 7, 16)), '16.08.2026');
  assert.equal(dateOf(stampOf('01.01.2026')), '01.01.2026');
});

test('stampOf не приймає дату з часом і сміття', () => {
  assert.equal(stampOf('16.08.2026 09:00'), 0);
  assert.equal(stampOf('вчора'), 0);
  assert.equal(stampOf(''), 0);
});

/* ── згладжування ──────────────────────────────────────────────────────── */

test('smooth: перша точка дорівнює самому зважуванню', () => {
  const s = smooth(series([80, 81, 79]));
  assert.equal(s[0].v, 80);
  assert.equal(s[0].raw, 80);
});

test('smooth: разовий стрибок майже не рухає лінію', () => {
  const s = smooth([...flatLine(10, 80), { date: day(10), weight: 81 }]);
  const last = s[s.length - 1];
  assert.equal(last.raw, 81);
  near(last.v, 80.25, 0.01, 'кілограм за ніч зсуває згладжену на чверть');
});

test('smooth: записи без ваги пропускаються', () => {
  const s = smooth([
    { date: day(0), weight: 80 },
    { date: day(1), weight: null },
    { date: day(2) },
    { date: day(3), weight: 79 },
  ]);
  assert.equal(s.length, 2);
});

test('smooth: порядок відновлюється за датами, а не за масивом', () => {
  const s = smooth([
    { date: day(3), weight: 79 },
    { date: day(0), weight: 80 },
  ]);
  assert.deepEqual(s.map((x) => x.d), [day(0), day(3)]);
});

test('smooth: порожній вхід не падає', () => {
  assert.deepEqual(smooth([]), []);
  assert.deepEqual(smooth(null), []);
});

/* ── швидкість ─────────────────────────────────────────────────────────── */

test('rate: рівна вага — нульова швидкість', () => {
  const r = rate(flatLine(20, 80));
  assert.equal(r.kgWeek, 0);
  assert.equal(r.days, 14);
});

test('rate: на сталому зниженні швидкість дорівнює нахилу', () => {
  const r = rate(falling(40, 90, 0.1));
  near(r.kgWeek, -0.7, 0.05, '0,1 кг на добу — це 0,7 на тиждень');
});

test('rate: двох зважувань поспіль замало — це ще не швидкість', () => {
  assert.equal(rate(series([80])), null);
  assert.equal(rate(series([80, 79])), null);                       // одна доба
  assert.equal(rate([{ date: day(0), weight: 80 }, { date: day(2), weight: 79 }]), null);
});

test('rate: три доби вже рахуються', () => {
  const r = rate([{ date: day(0), weight: 80 }, { date: day(3), weight: 79 }]);
  assert.equal(r.days, 3);
  assert.equal(r.from, day(0));
  assert.equal(r.to, day(3));
});

test('rate: вікно обрізає старе', () => {
  const r = rate(falling(60, 100, 0.1), 14);
  assert.equal(r.days, 14);
});

/* ── темп ──────────────────────────────────────────────────────────────── */

test('pace: понад відсоток маси на тиждень — забагато', () => {
  const p = pace(falling(40, 80, 0.15), 80);
  assert.equal(p.dir, 'down');
  assert.equal(p.level, 'fast');
  assert.ok(p.pctWeek > 1);
});

test('pace: чверть відсотка й менше — рух є, але його не відрізнити від похибки', () => {
  const p = pace(falling(40, 100, 0.02), 100);
  assert.equal(p.dir, 'down');
  assert.equal(p.level, 'slow');
});

test('pace: між ними — здоровий темп', () => {
  const p = pace(falling(40, 90, 0.08), 90);
  assert.equal(p.level, 'good');
});

test('pace: рівна вага — flat, а не «повільно»', () => {
  const p = pace(flatLine(20, 80), 80);
  assert.equal(p.dir, 'flat');
  assert.equal(p.level, 'flat');
});

test('pace: без ваги нема з чим порівнювати відсоток', () => {
  assert.equal(pace(falling(20, 80, 0.1), null), null);
  assert.equal(pace(series([80]), 80), null);
});

/* ── прогноз ───────────────────────────────────────────────────────────── */

test('forecast: ціль поруч — вважається досягнутою', () => {
  const f = forecast(flatLine(20, 80), 80.1);
  assert.deepEqual(f, { done: true });
});

test('forecast: рух не в бік цілі — дати немає', () => {
  const f = forecast(flatLine(20, 85), 80);
  assert.equal(f.stalled, true);
  // ростемо, а ціль нижча
  const up = forecast(falling(40, 80, -0.1), 75);
  assert.equal(up.stalled, true);
});

test('forecast: рахує тижні, залишок і дату', () => {
  const days = falling(40, 90, 0.1);        // ≈ −0,7 кг/тиждень
  const f = forecast(days, 85);
  assert.ok(f.weeks > 0);
  near(f.left, 90 - 39 * 0.1 - 85, 0.4, 'лишилось рахується від згладженої ваги');
  near(f.weeks, f.left / Math.abs(f.kgWeek), 0.01, 'тижні = залишок ÷ швидкість');
  assert.match(f.date, /^\d{2}\.\d{2}\.\d{4}$/);
});

test('forecast: без цілі або без швидкості прогнозу немає', () => {
  assert.equal(forecast(falling(20, 90, 0.1), null), null);
  assert.equal(forecast(series([90]), 85), null);
});

/* ── застій ────────────────────────────────────────────────────────────── */

test('plateau: вага стоїть довше за два тижні', () => {
  const p = plateau(flatLine(20, 80));
  assert.equal(p.days, 14);
  assert.equal(p.kgWeek, 0);
});

test('plateau: помітний рух — це не застій', () => {
  assert.equal(plateau(falling(40, 90, 0.1)), null);
});

test('plateau: коротка історія застоєм не рахується', () => {
  assert.equal(plateau(flatLine(5, 80)), null);
});

/* ── стрибок за добу ───────────────────────────────────────────────────── */

test('explainJump: кілограм за ніч — і межа того, скільки з нього жиру', () => {
  const days = [...flatLine(5, 80), { date: day(5), weight: 81.2 }];
  const j = explainJump(days, null);
  assert.equal(j.delta, 1.2);
  assert.equal(j.gap, 1);
  // стеля без записаного раціону — 0,15 кг на добу, але показується вона
  // з одним знаком, тож у тексті це «0,2»
  assert.equal(j.maxFat, 0.2);
  assert.equal(j.date, day(5));
});

test('explainJump: без раціону стеля росте разом із розривом', () => {
  const two = explainJump([...flatLine(4, 80), { date: day(5), weight: 81 }], null);
  assert.equal(two.gap, 2);
  assert.equal(two.maxFat, 0.3);
});

test('explainJump: з записаним раціоном межа рахується з перебору', () => {
  const days = [
    ...flatLine(4, 80),
    { date: day(4), weight: 80, kcal: 3540 },       // напередодні: +1540 понад норму
    { date: day(5), weight: 81 },
  ];
  const j = explainJump(days, 2000);
  assert.equal(j.over, 1540);
  assert.equal(j.maxFat, 0.2);                      // 1540 / 7700
  assert.ok(j.causes.some((c) => c.includes('3540')));
});

test('explainJump: причини беруться з дня перед зважуванням', () => {
  const days = [
    ...flatLine(4, 80),
    { date: day(4), weight: 80, water: 900, steps: 1200, sleep: 4 },
    { date: day(5), weight: 80.9 },
  ];
  const j = explainJump(days, null);
  assert.deepEqual(j.causes, ['мало води — 900 мл', 'мало руху — 1200 кроків', 'сон 4 год']);
});

test('explainJump: дрібні коливання поясненню не підлягають', () => {
  const days = [...flatLine(5, 80), { date: day(5), weight: 80.3 }];
  assert.equal(explainJump(days, null), null);
});

test('explainJump: розрив у тиждень — це вже не стрибок', () => {
  const days = [{ date: day(0), weight: 80 }, { date: day(9), weight: 82 }];
  assert.equal(explainJump(days, null), null);
});

/* ── чи сходиться раціон ───────────────────────────────────────────────── */

test('deficit: ваги стоять, а записи обіцяють дефіцит — розбіжність видно', () => {
  const days = flatLine(20, 80).map((d) => ({ ...d, kcal: 1500 }));
  const d = deficit(days, 2000);
  assert.equal(d.avgKcal, 1500);
  assert.equal(d.realDaily, 0);          // ваги не рухаються
  assert.equal(d.planDaily, -500);       // записи кажуть −500
  assert.equal(d.gap, -500);             // саме стільки не записано
});

test('deficit: реальний дефіцит рахується з 7700 ккал на кілограм', () => {
  const days = falling(40, 90, 0.1).map((d) => ({ ...d, kcal: 2000 }));
  const d = deficit(days, 2000);
  near(d.realDaily, (-0.7 * 7700) / 7, 60, 'мінус 0,7 кг на тиждень ≈ 770 ккал на добу');
  assert.equal(d.planDaily, 0);
});

test('deficit: без записаного раціону висновку немає', () => {
  assert.equal(deficit(flatLine(20, 80), 2000), null);
  const few = flatLine(20, 80).map((d, i) => (i > 17 ? { ...d, kcal: 2000 } : d));
  assert.equal(deficit(few, 2000), null);   // менш як пʼять днів записів
});

test('deficit: без норми лишаються самі факти, без порівняння', () => {
  const days = flatLine(20, 80).map((d) => ({ ...d, kcal: 2200 }));
  const d = deficit(days, null);
  assert.equal(d.avgKcal, 2200);
  assert.equal(d.planDaily, null);
  assert.equal(d.gap, null);
});

/* ── талія ─────────────────────────────────────────────────────────────── */

test('waistTrend: різниця за вікно, найновіше проти найстарішого', () => {
  const body = [
    { date: day(0), waist: 92 },
    { date: day(14), waist: 90.5 },
    { date: day(27), waist: 89 },
  ];
  assert.deepEqual(waistTrend(body), { cm: -3, from: day(0), to: day(27) });
});

test('waistTrend: одного заміру замало', () => {
  assert.equal(waistTrend([{ date: day(0), waist: 92 }]), null);
  assert.equal(waistTrend([]), null);
  assert.equal(waistTrend(null), null);
});

test('waistTrend: старіше за вікно не рахується', () => {
  const body = [{ date: day(0), waist: 100 }, { date: day(60), waist: 90 }];
  assert.equal(waistTrend(body, 28), null);
});

/* ── висновки ──────────────────────────────────────────────────────────── */

test('verdicts: надто швидке зниження попереджає про мʼязи', () => {
  const out = verdicts({ days: falling(40, 80, 0.15), goal: 70, weight: 80 });
  assert.equal(out[0].tone, 'warn');
  assert.match(out[0].text, /мʼязів/);
});

test('verdicts: здоровий темп — це похвала з числом', () => {
  const out = verdicts({ days: falling(40, 90, 0.08), goal: 80, weight: 90 });
  assert.equal(out[0].tone, 'ok');
  assert.match(out[0].text, /Мінус 0,?\.?\d+ кг на тиждень/);
});

test('verdicts: застій плюс талія, що йде, — не привід нічого міняти', () => {
  const out = verdicts({
    days: flatLine(20, 80),
    body: [{ date: day(0), waist: 92 }, { date: day(19), waist: 89.5 }],
    weight: 80,
  });
  const flat = out.find((v) => v.text.includes('стоїть'));
  assert.equal(flat.tone, 'ok');
  assert.match(flat.text, /Нічого не міняйте/);
});

test('verdicts: застій без сантиметра — привід перевірити записи', () => {
  const out = verdicts({ days: flatLine(20, 80), weight: 80 });
  const flat = out.find((v) => v.text.includes('стоїть'));
  assert.equal(flat.tone, 'warn');
  assert.match(flat.text, /незаписаних/);
});

test('verdicts: незаписане видно як розбіжність у ккал', () => {
  const days = flatLine(20, 80).map((d) => ({ ...d, kcal: 1400 }));
  const out = verdicts({ days, kcalGoal: 2000, weight: 80 });
  assert.ok(out.some((v) => v.text.includes('не записано')));
});

test('verdicts: досягнута ціль міняє задачу, а не хвалить темп', () => {
  const out = verdicts({ days: flatLine(20, 80), goal: 80, weight: 80 });
  assert.ok(out.some((v) => v.text.includes('утримати')));
});

test('verdicts: без даних мовчить, а не вигадує', () => {
  assert.deepEqual(verdicts({ days: [], weight: 80, goal: 75 }), []);
  assert.deepEqual(verdicts({ days: series([80]), weight: 80, goal: 75 }), []);
});

test('verdicts: кожен висновок має тон і текст', () => {
  const out = verdicts({ days: falling(40, 80, 0.15), goal: 70, weight: 80, kcalGoal: 2000 });
  out.forEach((v) => {
    assert.ok(['ok', 'warn', 'note'].includes(v.tone), `невідомий тон: ${v.tone}`);
    assert.ok(v.text.length > 20);
  });
});
