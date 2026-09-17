import test from 'node:test';
import assert from 'node:assert/strict';

import { dateOf } from '../lib/weight.js';
import {
  weightOn, split, composition, compositionVerdict, oddValue,
  whtr, whtrLabel, whr, whrLabel, ffmi, ffmiLabel, katchBmr, bmiVsFat,
} from '../lib/body.js';

const DAY = 86400000;
const START = Date.UTC(2026, 6, 1);           // 01.07.2026
const day = (i) => dateOf(START + i * DAY);

const series = (weights) => weights.map((w, i) => ({ date: day(i), weight: w }));

const near = (actual, expected, eps, msg) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${msg}: ${actual} ≉ ${expected} (±${eps})`);

/* ── вага на день заміру ───────────────────────────────────────────────── */

test('weightOn бере згладжену вагу, а не число з ваг того ранку', () => {
  // рівні 80 кг і один сплеск від солі — згладжена лінія за ним не йде
  const days = series([80, 80, 80, 80, 80, 80, 82]);
  const w = weightOn(days, day(6));
  assert.equal(w.raw, 82);
  assert.ok(w.kg < 81, `згладжена ${w.kg} мала лишитись нижче за 81`);
});

test('weightOn повертає розрив у днях до останнього зважування', () => {
  const days = series([80, 80, 80]);
  assert.equal(weightOn(days, day(9)).gap, 7);
  assert.equal(weightOn(days, day(2)).gap, 0);
});

test('weightOn: без зважувань або з битою датою — нічого', () => {
  assert.equal(weightOn([], day(0)), null);
  assert.equal(weightOn(series([80]), 'вчора'), null);
  // заміри раніші за перше зважування рахувати нема з чого
  assert.equal(weightOn(series([80]), dateOf(START - 5 * DAY)), null);
});

/* ── склад одного заміру ───────────────────────────────────────────────── */

test('split ділить вагу на жир і решту', () => {
  const s = split(80, 25);
  assert.equal(s.fatKg, 20);
  assert.equal(s.leanKg, 60);
});

test('split не вірить безглуздим числам', () => {
  assert.equal(split(0, 20), null);
  assert.equal(split(80, null), null);
  assert.equal(split(80, 120), null);
  assert.equal(split(80, -5), null);
});

/* ── розклад зміни ваги ────────────────────────────────────────────────── */

/** Два заміри: вага й відсоток жиру на початку й у кінці вікна */
const pair = (w1, f1, w2, f2, days = 42) => [
  { date: day(0), weight: w1, fat: f1 },
  { date: day(days), weight: w2, fat: f2 },
];

test('composition: мінус вага, і майже все з жиру', () => {
  // 90 кг × 25% = 22.5 кг жиру → 86 кг × 21.9% ≈ 18.8 кг
  const c = composition(pair(90, 25, 86, 21.9));
  assert.equal(c.days, 42);
  near(c.dWeight, -4, 0.01, 'вага');
  near(c.dFat, -3.7, 0.1, 'жир');
  near(c.dLean, -0.3, 0.1, 'решта');
  assert.equal(c.kind, 'cut');
  assert.ok(c.share >= 85, `частка жиру ${c.share}% мала бути високою`);
});

test('composition: вага стоїть, а жир міняється на мʼязи — рекомпозиція', () => {
  const c = composition(pair(80, 22, 80, 19));
  near(c.dWeight, 0, 0.01, 'вага');
  assert.ok(c.dFat < -2, 'жир мав піти');
  assert.ok(c.dLean > 2, 'решта мала прийти');
  assert.equal(c.kind, 'recomp');
  assert.equal(c.share, null, 'при незмінній вазі частки немає');
  assert.equal(c.noisy, false);
  assert.match(compositionVerdict(c).text, /не зрушили з місця/);
});

test('composition: зміни менші за похибку стрічки — це шум', () => {
  const c = composition(pair(80, 20, 80.2, 20.1));
  assert.equal(c.noisy, true);
  assert.equal(c.kind, 'flat');
  assert.equal(compositionVerdict(c).tone, 'note');
});

test('composition: менше двох тижнів між замірами — ще не про склад тіла', () => {
  assert.equal(composition(pair(90, 25, 88, 24, 10)), null);
});

test('composition: одного заміру замало, сміття не ламає', () => {
  assert.equal(composition([{ date: day(0), weight: 90, fat: 25 }]), null);
  assert.equal(composition([]), null);
  assert.equal(composition(null), null);
  assert.equal(composition([{ date: 'вчора', weight: 90, fat: 25 }, { date: day(40), weight: 88, fat: 24 }]), null);
});

test('composition: рахує лише те, що в вікні', () => {
  const pts = [
    { date: day(0), weight: 95, fat: 28 },
    { date: day(100), weight: 90, fat: 25 },
    { date: day(140), weight: 88, fat: 23 },
  ];
  const c = composition(pts, 56);
  assert.equal(c.from, day(100), 'старіше за вікно не береться');
  assert.equal(c.n, 2);
});

/* ── висновки словами ──────────────────────────────────────────────────── */

test('висновок хвалить, коли втрата переважно з жиру', () => {
  const v = compositionVerdict(composition(pair(90, 25, 86, 21.9)));
  assert.equal(v.tone, 'ok');
  assert.match(v.text, /жир/);
});

test('жиру пішло більше за вагу — не «112% з них жир», а окремий висновок', () => {
  // 90 × 25% = 22.5 → 86 × 21.0% ≈ 18.1: жиру −4.4 при вазі −4,
  // решта тіла підросла, але менше за похибку — тож це ще не рекомпозиція
  const c = composition(pair(90, 25, 86, 21));
  assert.ok(c.share > 100, 'саме той випадок, де частка втрачає сенс');
  const v = compositionVerdict(c);
  assert.equal(v.tone, 'ok');
  assert.doesNotMatch(v.text, /\d{3}%/, 'відсотка понад сто в тексті бути не може');
  assert.match(v.text, /жиру пішло навіть більше/);
});

test('висновок попереджає, коли вага йде з мʼязів', () => {
  // 90 кг × 25% = 22.5 → 85 кг × 25.9% ≈ 22.0: жиру пішло лише пів кіло
  const v = compositionVerdict(composition(pair(90, 25, 85, 25.9)));
  assert.equal(v.tone, 'warn');
  assert.match(v.text, /мʼяз/);
});

test('висновок окремо ловить втрату ваги з ростом жиру', () => {
  const v = compositionVerdict(composition(pair(90, 25, 87, 27)));
  assert.equal(v.tone, 'warn');
  assert.match(v.text, /жиру стало більше/);
});

test('набір: у жир чи в мʼязи — різні висновки', () => {
  // 80 × 15% = 12 → 83 × 15.7% ≈ 13.0: кілограм жиру з трьох
  const good = compositionVerdict(composition(pair(80, 15, 83, 15.7)));
  assert.equal(good.tone, 'ok');
  // 80 × 15% = 12 → 83 × 18.5% ≈ 15.4: більша частина в жир
  const bad = compositionVerdict(composition(pair(80, 15, 83, 18.5)));
  assert.equal(bad.tone, 'warn');
});

test('без розкладу висновку немає', () => {
  assert.equal(compositionVerdict(null), null);
});

/* ── описки в замірах ──────────────────────────────────────────────────── */

test('число в межах не викликає підозр', () => {
  assert.equal(oddValue(104, 40, 200), null);
  assert.equal(oddValue(40, 40, 200), null, 'сама межа — ще норма');
  assert.equal(oddValue(200, 40, 200), null);
});

test('помилка на порядок — і підказка, що малось на увазі', () => {
  // класика: на рулетці 104, у полі 10.4
  assert.equal(oddValue(10.4, 40, 200).hint, 104);
  assert.equal(oddValue(1040, 40, 200).hint, 104);
  assert.equal(oddValue(9.2, 40, 200).hint, 92);
});

test('просто дивне число лишається без підказки', () => {
  const o = oddValue(3000, 40, 200);
  assert.equal(o.value, 3000);
  assert.equal(o.hint, null, 'ні ×10, ні ÷10 не лягають у межі');
});

test('порожнє поле — не помилка', () => {
  assert.equal(oddValue('', 40, 200), null);
  assert.equal(oddValue(null, 40, 200), null);
  assert.equal(oddValue(undefined, 40, 200), null);
});

/* ── пропорції ─────────────────────────────────────────────────────────── */

test('талія до зросту: межа — половина', () => {
  assert.equal(whtr(90, 180), 0.5);
  assert.equal(whtrLabel(whtr(85, 180)), 'норма');
  assert.equal(whtrLabel(whtr(95, 180)), 'підвищений ризик');
  assert.equal(whtrLabel(whtr(110, 180)), 'високий ризик');
  assert.equal(whtr(0, 180), null);
  assert.equal(whtr(90, null), null);
});

test('талія до стегон: межа різна для чоловіка й жінки', () => {
  const v = whr(88, 100);       // 0.88
  assert.equal(whrLabel(v, 'm'), 'ближче до межі');
  assert.equal(whrLabel(v, 'f'), 'підвищений ризик');
  assert.equal(whr(88, 0), null);
});

test('індекс мʼязів приводиться до зросту 1,80', () => {
  const at180 = ffmi(65, 180);
  near(at180.raw, 20.1, 0.1, 'сирий');
  near(at180.norm, at180.raw, 0.001, 'на 180 см приведення нічого не міняє');
  // та сама маса на нижчому зрості дає більший сирий індекс
  assert.ok(ffmi(65, 165).raw > at180.raw);
  assert.equal(ffmi(0, 180), null);
  assert.equal(ffmi(65, 0), null);
});

test('шкала індексу мʼязів окрема для жінок', () => {
  assert.equal(ffmiLabel(17, 'm'), 'нижче середнього');
  assert.equal(ffmiLabel(17, 'f'), 'добрий');
  assert.equal(ffmiLabel(null, 'm'), '');
});

/* ── витрати у спокої ──────────────────────────────────────────────────── */

test('Кетч-Макардл рахує з безжирової маси', () => {
  assert.equal(katchBmr(65), 370 + 21.6 * 65);
  assert.equal(katchBmr(0), null);
  assert.equal(katchBmr(null), null);
});

/* ── ІМТ проти відсотка жиру ───────────────────────────────────────────── */

test('ІМТ «надлишок» при малому жирі — це мʼязи', () => {
  assert.match(bmiVsFat(26, 12, 'm'), /мʼязи/);
  assert.equal(bmiVsFat(26, 22, 'm'), null, 'надлишок при чималому жирі — без коментаря');
});

test('ІМТ у нормі при великому жирі — мало мʼязів', () => {
  assert.match(bmiVsFat(23, 30, 'm'), /мало мʼязів/);
  assert.equal(bmiVsFat(23, 30, 'f'), null, 'у жінки 30% — ще не той випадок');
  assert.match(bmiVsFat(23, 35, 'f'), /мало мʼязів/);
});

test('без чисел коментаря немає', () => {
  assert.equal(bmiVsFat(null, 20, 'm'), null);
  assert.equal(bmiVsFat(24, null, 'm'), null);
});
