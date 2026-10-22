import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE, HARD_MULT, TIERS, tierOf, nextTier, comboMult, speedStep, pointsFor,
  step, heatOf, isRecord, recallSpeed, roundSummary,
} from '../lib/arcade.js';

/* ---------- Швидкість ---------- */

test('швидкість рахується в частках годинника, а не в секундах', () => {
  // третина годинника, що лишилась, — це «згадав одразу» на будь-якому рівні
  assert.equal(speedStep(7, 9), 2);
  assert.equal(speedStep(3, 4), 2);
  // середина
  assert.equal(speedStep(4, 9), 1);
  // на межі
  assert.equal(speedStep(1, 9), 0);
});

test('годинник без часу не ділимо на нуль', () => {
  assert.equal(speedStep(5, 0), 0);
  assert.equal(speedStep(0, 0), 0);
});

test('залишок більший за годинник не дає зайвого', () => {
  assert.equal(speedStep(99, 9), 2);
});

/* ---------- Пороги серії ---------- */

test('доки серія коротка — множника немає', () => {
  assert.equal(tierOf(0), null);
  assert.equal(tierOf(2), null);
  assert.equal(comboMult(2), 1);
});

test('пороги беруться саме на обіцяному числі', () => {
  assert.equal(tierOf(3).name, 'Розгін');
  assert.equal(tierOf(6).name, 'Чудово');
  assert.equal(tierOf(10).name, 'Супер');
});

test('між порогами тримається попередній', () => {
  assert.equal(tierOf(5).name, 'Розгін');
  assert.equal(tierOf(9).name, 'Чудово');
  assert.equal(tierOf(40).name, 'Супер');
});

test('наступний поріг видно, щоб показати, скільки лишилось', () => {
  assert.equal(nextTier(0).at, 3);
  assert.equal(nextTier(3).at, 6);
  assert.equal(nextTier(10), null);
});

/* ---------- Ціна відповіді ---------- */

test('помилка не коштує нічого', () => {
  assert.equal(pointsFor({ right: false, secondsLeft: 8, seconds: 9, combo: 20 }), 0);
});

test('числа на екрані круглі — від десяти до ста двадцяти', () => {
  assert.equal(pointsFor({ right: true, secondsLeft: 0.5, seconds: 9, combo: 0 }), 10);
  assert.equal(pointsFor({ right: true, secondsLeft: 8, seconds: 9, combo: 0 }), 30);
  assert.equal(pointsFor({ right: true, secondsLeft: 8, seconds: 9, combo: 2 }), 60);
  assert.equal(pointsFor({ right: true, secondsLeft: 8, seconds: 9, combo: 5 }), 90);
  assert.equal(pointsFor({ right: true, secondsLeft: 8, seconds: 9, combo: 9 }), 120);
});

test('поріг платить уже тією відповіддю, якою його взяли', () => {
  // третя правильна поспіль — це і є «Розгін», множник має бути вже на ній
  const third = pointsFor({ right: true, secondsLeft: 8, seconds: 9, combo: 2 });
  const second = pointsFor({ right: true, secondsLeft: 8, seconds: 9, combo: 1 });
  assert.equal(second, 30);
  assert.equal(third, 60);
});

test('вищий рівень платить сам: часу менше, поріг швидкості ближчий', () => {
  // 3 секунди на відповідь: на дев'ятисекундному рівні це найдорожчий поріг
  assert.equal(pointsFor({ right: true, secondsLeft: 6, seconds: 9, combo: 0 }), 30);
  // ті самі 3 секунди на чотирисекундному рівні — вже найдешевший
  assert.equal(pointsFor({ right: true, secondsLeft: 1, seconds: 4, combo: 0 }), 10);
});

/* ---------- Хід гри ---------- */

test('правильна відповідь додає очки й подовжує серію', () => {
  const s = step({ score: 100, combo: 1, bestCombo: 4 }, { right: true, secondsLeft: 8, seconds: 9 });
  assert.equal(s.gained, 30);
  assert.equal(s.score, 130);
  assert.equal(s.combo, 2);
  assert.equal(s.bestCombo, 4);
});

test('серія рветься на помилці, а очки лишаються', () => {
  const s = step({ score: 250, combo: 7, bestCombo: 7 }, { right: false });
  assert.equal(s.score, 250);
  assert.equal(s.combo, 0);
  assert.equal(s.gained, 0);
  assert.equal(s.bestCombo, 7, 'найдовша серія за раунд не стирається');
});

test('вичерпаний годинник — така сама втрата серії, як помилка', () => {
  // інакше найдешевший спосіб тримати множник — перечекати важкий приклад
  const s = step({ score: 90, combo: 5 }, { right: false, secondsLeft: 0, seconds: 9 });
  assert.equal(s.combo, 0);
});

test('найдовша серія запам\'ятовується, навіть якщо потім зірвалась', () => {
  let s = { score: 0, combo: 0, bestCombo: 0 };
  for (let i = 0; i < 7; i++) s = step(s, { right: true, secondsLeft: 8, seconds: 9 });
  assert.equal(s.bestCombo, 7);
  s = step(s, { right: false });
  assert.equal(s.bestCombo, 7);
  assert.equal(s.combo, 0);
});

test('плашку порога показуємо раз — у мить переходу', () => {
  let s = { score: 0, combo: 1, bestCombo: 1 };
  s = step(s, { right: true, secondsLeft: 8, seconds: 9 });   // серія 2 — ще нічого
  assert.equal(s.tier, null);
  s = step(s, { right: true, secondsLeft: 8, seconds: 9 });   // серія 3 — «Розгін»
  assert.equal(s.tier.name, 'Розгін');
  s = step(s, { right: true, secondsLeft: 8, seconds: 9 });   // серія 4 — той самий поріг
  assert.equal(s.tier, null, 'на кожній наступній відповіді плашку не повторюємо');
});

test('порожній стан не ламає перший хід', () => {
  const s = step(undefined, { right: true, secondsLeft: 8, seconds: 9 });
  assert.equal(s.score, 30);
  assert.equal(s.combo, 1);
});

/* ---------- Розжарення ---------- */

test('розжарення росте по одному за взятий поріг', () => {
  assert.equal(heatOf(0), 0);
  assert.equal(heatOf(2), 0);
  assert.equal(heatOf(3), 1);
  assert.equal(heatOf(6), 2);
  assert.equal(heatOf(10), 3);
  assert.equal(heatOf(99), TIERS.length, 'вище за кількість порогів не піднімається');
});

/* ---------- Рекорд і підсумок ---------- */

test('рівний рахунок рекордом не вважаємо — його вже бачили', () => {
  assert.equal(isRecord(1200, 1200), false);
  assert.equal(isRecord(1201, 1200), true);
  assert.equal(isRecord(10, 0), true);
  assert.equal(isRecord(10, undefined), true);
});

test('швидкість пригадування — середнє лише по правильних', () => {
  const res = [
    { right: true, ms: 2000 },
    { right: false, ms: 9000 },   // час помилки каже не про пам'ять
    { right: true, ms: 3000 },
  ];
  assert.equal(recallSpeed(res), 2.5);
});

test('без правильних відповідей швидкості немає, а не нуль', () => {
  assert.equal(recallSpeed([{ right: false, ms: 9000 }]), null);
  assert.equal(recallSpeed([]), null);
  assert.equal(recallSpeed(undefined), null);
});

test('підсумок раунду рахує точність і рекорд', () => {
  const s = roundSummary({
    score: 750, best: 1200, bestCombo: 9, level: 5,
    results: [
      { right: true, ms: 2000 }, { right: true, ms: 3000 },
      { right: false, ms: 9000 }, { right: true, ms: 1000 },
    ],
  });
  assert.equal(s.total, 4);
  assert.equal(s.right, 3);
  assert.equal(s.accuracy, 75);
  assert.equal(s.recall, 2);
  assert.equal(s.record, false);
  assert.equal(s.best, 1200);
});

test('підсумок без жодної відповіді не дає NaN на екрані', () => {
  const s = roundSummary({ score: 0, best: 0 });
  assert.equal(s.accuracy, null);
  assert.equal(s.recall, null);
  assert.equal(s.total, 0);
  assert.equal(Number.isNaN(s.accuracy), false);
});

test('новий рекорд видно в підсумку', () => {
  const s = roundSummary({ score: 1300, best: 1200, results: [{ right: true, ms: 1000 }] });
  assert.equal(s.record, true);
  assert.equal(s.best, 1300);
});

test('базова ціна лишається круглою — на неї спирається вся таблиця', () => {
  assert.equal(BASE, 10);
});

/* ---------- Недороблене коштує вдвічі ---------- */

test('приклад, не доведений до автоматизму, коштує вдвічі', () => {
  const easy = pointsFor({ right: true, secondsLeft: 8, seconds: 9, combo: 0 });
  const hard = pointsFor({ right: true, secondsLeft: 8, seconds: 9, combo: 0, hard: true });
  assert.equal(easy, 30);
  assert.equal(hard, 60);
});

test('подвоєння множиться на серію, а не замість неї', () => {
  // найдорожча відповідь у грі: швидко, у «Супері», на недоробленому
  assert.equal(pointsFor({ right: true, secondsLeft: 9, seconds: 9, combo: 9, hard: true }), 240);
});

test('повільна відповідь на складному дорожча за швидку на легкому', () => {
  // саме цього ми й хочемо: доробляти недороблене вигідніше, ніж
  // ганяти вже відполіроване
  const slowHard = pointsFor({ right: true, secondsLeft: 0.5, seconds: 9, combo: 0, hard: true });
  const fastEasy = pointsFor({ right: true, secondsLeft: 8, seconds: 9, combo: 0 });
  assert.equal(slowHard, 20);
  assert.equal(fastEasy, 30);
  assert.ok(slowHard < fastEasy, 'швидкість усе одно важить більше за позначку складності');
});

test('помилка на складному теж не коштує нічого', () => {
  assert.equal(pointsFor({ right: false, secondsLeft: 9, seconds: 9, combo: 9, hard: true }), 0);
});

test('хід гри пропускає позначку складності до ціни', () => {
  const s = step({ score: 0, combo: 0 }, { right: true, secondsLeft: 8, seconds: 9, hard: true });
  assert.equal(s.gained, 60);
  assert.equal(s.score, 60);
});

test('подвоєння лишається подвоєнням — на нього спирається пояснення в грі', () => {
  assert.equal(HARD_MULT, 2);
});
