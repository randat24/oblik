/**
 * Числа, що приходять із годинника.
 *
 * Найтихіше місце застосунку: помилка тут нічого не ламає — вона просто
 * не пише число. Людина дізнається про це через місяць, коли відкриває
 * графік і бачить порожньо. Саме так і сталося з «Розминкою».
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  num, fixUnits, dropInsane, dayFromBody, hasNumbers, SANE, FROM_WATCH,
} from '../lib/vitals.js';

const TODAY = '10.09.2026';

/* ── розбір числа ──────────────────────────────────────────────────────── */

test('порожнє — це «не надсилали», а не нуль', () => {
  // інакше поле, якого в запиті не було, затирало б збережене
  assert.equal(num(''), null);
  assert.equal(num(null), null);
  assert.equal(num(undefined), null);
  assert.equal(num('   '), null);
});

test('нуль лишається нулем', () => {
  assert.equal(num(0), 0);
  assert.equal(num('0'), 0);
});

test('«Команди» віддають число текстом із пробілами', () => {
  assert.equal(num('7 470'), 7470);
  assert.equal(num('7 470'), 7470);   // нерозривний пробіл
});

test('кома сама по собі — дробова частина', () => {
  assert.equal(num('72,5'), 72.5);
});

test('кома разом із крапкою — роздільник тисяч', () => {
  assert.equal(num('7,470.5'), 7470.5);
});

test('не число — null, а не NaN', () => {
  assert.equal(num('невідомо'), null);
});

/* ── одиниці ───────────────────────────────────────────────────────────── */

test('розминка приходить у хвилинах і стає годинами', () => {
  /*
   * Кільце стояння Apple віддає хвилини, колонка чекає години. Раніше
   * перетворення не було: 480 хвилин відсіювались за межею 0–24, і
   * «Розминка» лишалась порожньою день за днем.
   */
  assert.equal(fixUnits({ stand: 480 }).stand, 8);
  assert.equal(fixUnits({ stand: 280 }).stand, 4.7);
});

test('розминка, уже поділена на 60, лишається як є', () => {
  // у добі 24 години, тож менше — це вже години, і чіпати їх не можна
  assert.equal(fixUnits({ stand: 8 }).stand, 8);
  assert.equal(fixUnits({ stand: 24 }).stand, 24);
  assert.equal(fixUnits({ stand: 0 }).stand, 0);
});

test('частка жиру стає відсотками', () => {
  assert.equal(fixUnits({ bodyFat: 0.184 }).bodyFat, 18.4);
  assert.equal(fixUnits({ bodyFat: 18.4 }).bodyFat, 18.4);
});

test('літри води стають мілілітрами', () => {
  assert.equal(fixUnits({ water: 2.5 }).water, 2500);
  assert.equal(fixUnits({ water: 2500 }).water, 2500);
});

test('одиниці чіпають лише свої поля', () => {
  const out = fixUnits({ steps: 8000, burned: 700, sleep: 7 });
  assert.deepEqual(out, { steps: 8000, burned: 700, sleep: 7 });
});

/* ── межі здорового глузду ─────────────────────────────────────────────── */

test('кроки, що прилетіли у вагу, не записуються', () => {
  const { day, ignored } = dropInsane({ weight: 11000 });
  assert.equal(day.weight, undefined);
  assert.equal(ignored.length, 1);
  assert.match(ignored[0], /weight=11000/);
});

test('справжні числа проходять', () => {
  const { day, ignored } = dropInsane({ weight: 82.4, steps: 9000, pulse: 58 });
  assert.deepEqual(day, { weight: 82.4, steps: 9000, pulse: 58 });
  assert.deepEqual(ignored, []);
});

test('межі стоять на всіх полях, які приходять із годинника', () => {
  // поле без межі — це поле, куди одного дня тихо ляже чуже число
  const noBound = FROM_WATCH.filter((k) => !(k in SANE));
  assert.deepEqual(noBound, []);
});

/* ── увесь запит ───────────────────────────────────────────────────────── */

test('розминка в хвилинах тепер доходить до дня', () => {
  const { day, ignored } = dayFromBody({ stand: 480 }, TODAY);
  assert.equal(day.stand, 8);
  assert.deepEqual(ignored, []);
});

test('розминка більша за добу навіть у хвилинах — не запис', () => {
  // 2000 хвилин це 33 години; такого дня не буває
  const { day, ignored } = dayFromBody({ stand: 2000 }, TODAY);
  assert.equal(day.stand, undefined);
  assert.equal(ignored.length, 1);
});

test('без дати береться сьогодні', () => {
  assert.equal(dayFromBody({ steps: 100 }, TODAY).day.date, TODAY);
});

test('дата з запиту головніша', () => {
  assert.equal(dayFromBody({ date: '01.09.2026', steps: 100 }, TODAY).day.date, '01.09.2026');
});

test('нуль у пульсі, вазі й жирі — порожня дія, а не замір', () => {
  const { day } = dayFromBody({ pulse: 0, weight: 0, bodyFat: 0, hrv: 0, steps: 0 }, TODAY);
  assert.equal(day.pulse, undefined);
  assert.equal(day.weight, undefined);
  assert.equal(day.bodyFat, undefined);
  assert.equal(day.hrv, undefined);
  // а нуль кроків чесний: не ходив
  assert.equal(day.steps, 0);
});

test('поля, яких не надсилали, у дні не зʼявляються', () => {
  const { day } = dayFromBody({ steps: 9000 }, TODAY);
  assert.deepEqual(Object.keys(day).sort(), ['date', 'steps']);
});

test('чужі поля в тілі запиту ігноруються', () => {
  const { day } = dayFromBody({ steps: 9000, пароль: 'секрет', role: 'admin' }, TODAY);
  assert.deepEqual(Object.keys(day).sort(), ['date', 'steps']);
});

test('день без жодного числа видно окремо', () => {
  const { day } = dayFromBody({}, TODAY);
  assert.equal(hasNumbers(day), false);
  assert.equal(hasNumbers(dayFromBody({ steps: 1 }, TODAY).day), true);
});

test('повний день із годинника доходить цілим', () => {
  const { day, ignored } = dayFromBody({
    steps: '9 431', burned: '712', water: 2.4, workout: 45, sleep: '7,2',
    weight: '82,4', pulse: 56, hrv: 68, distance: '6,8', stand: 540,
    restEnergy: 1780, bodyFat: 0.183,
  }, TODAY);
  assert.deepEqual(ignored, []);
  assert.deepEqual(day, {
    date: TODAY, steps: 9431, burned: 712, water: 2400, workout: 45, sleep: 7.2,
    weight: 82.4, pulse: 56, hrv: 68, distance: 6.8, stand: 9,
    restEnergy: 1780, bodyFat: 18.3,
  });
});
