/**
 * Повторення пройденого.
 *
 * Половина тут — розклад, друга половина — самі питання. Розклад
 * перевіряємо на поведінку, питання — на цілість: неправильний номер
 * правильної відповіді нічого не ламає, він просто мовчки вчить
 * неправильного, і помітити це в сорока питаннях нема як.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LADDER, MAX_LEVEL, dueIn, nextLevel, stampOf, pick, forLesson, COVERED,
  QUESTIONS, dueLessons, buildQueue, dueCount, recallStats, DAY_SIZE,
} from '../lib/recall.js';
import { CODE_LESSONS } from '../lib/code.js';

const DAY = 86400000;
const TODAY = Date.UTC(2026, 8, 13);           // 13.09.2026
const daysAgo = (n) => {
  const d = new Date(TODAY - n * DAY);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
};

const done = (extra = {}) => ({ state: 'done', ...extra });

/* ── розклад ───────────────────────────────────────────────────────────── */

test('проміжки ростуть', () => {
  const gaps = LADDER.map((_, i) => dueIn(i));
  assert.deepEqual(gaps, [...gaps].sort((a, b) => a - b));
  assert.equal(dueIn(0), 0);
});

test('проміжки ширші за ті, що в множенні', () => {
  // таблиця має відповідатись не думаючи, поняття досить упізнавати
  assert.ok(dueIn(MAX_LEVEL) >= 30);
});

test('рівень вище за максимум не ламає розклад', () => {
  assert.equal(dueIn(99), dueIn(MAX_LEVEL));
  assert.equal(dueIn(-5), dueIn(0));
});

test('правильна відповідь піднімає на щабель, помилка опускає на один', () => {
  // не в нуль: хто пʼять разів згадав і раз забув, не починає спочатку
  assert.equal(nextLevel(2, true), 3);
  assert.equal(nextLevel(2, false), 1);
  assert.equal(nextLevel(0, false), 0);
  assert.equal(nextLevel(MAX_LEVEL, true), MAX_LEVEL);
});

test('дата перетворюється на число, сміття дає нуль', () => {
  assert.ok(stampOf('13.09.2026') > 0);
  assert.equal(stampOf(''), 0);
  assert.equal(stampOf('невідомо'), 0);
  assert.equal(stampOf(null), 0);
});

/* ── черга ─────────────────────────────────────────────────────────────── */

test('непройдений урок у чергу не потрапляє', () => {
  assert.deepEqual(dueLessons({ b1: { state: '' } }, TODAY), []);
  assert.deepEqual(dueLessons({}, TODAY), []);
});

test('пройдений, якого ще жодного разу не питали, чекає одразу', () => {
  const due = dueLessons({ b1: done() }, TODAY);
  assert.equal(due.length, 1);
  assert.equal(due[0].id, 'b1');
});

test('щойно повторене не повертається наступного дня', () => {
  // рівень 2 — це три дні; минув один
  const prog = { b1: done({ level: 2, asked: daysAgo(1) }) };
  assert.deepEqual(dueLessons(prog, TODAY), []);
});

test('коли проміжок минув — повертається', () => {
  const prog = { b1: done({ level: 2, asked: daysAgo(3) }) };
  assert.equal(dueLessons(prog, TODAY).length, 1);
});

test('найзабутіше йде першим', () => {
  const prog = {
    b1: done({ level: 1, asked: daysAgo(2) }),
    b2: done({ level: 1, asked: daysAgo(30) }),
    b3: done({ level: 1, asked: daysAgo(10) }),
  };
  assert.deepEqual(dueLessons(prog, TODAY).map((x) => x.id), ['b2', 'b3', 'b1']);
});

test('черга обмежена розміром дня', () => {
  const prog = {};
  COVERED.forEach((id) => { prog[id] = done(); });
  assert.ok(dueCount(prog, TODAY) > DAY_SIZE);
  assert.equal(buildQueue(prog, TODAY).length, DAY_SIZE);
  assert.equal(buildQueue(prog, TODAY, 2).length, 2);
});

test('до кожного уроку в черзі додається питання', () => {
  const [first] = buildQueue({ b3: done() }, TODAY);
  assert.equal(first.id, 'b3');
  assert.ok(first.question);
  assert.equal(first.question.lesson, 'b3');
});

/* ── вибір питання ─────────────────────────────────────────────────────── */

test('із кожним поверненням приходить інше питання', () => {
  const qs = forLesson('b11');
  assert.ok(qs.length > 1, 'для перевірки потрібен урок із кількома питаннями');
  const seen = qs.map((_, i) => pick('b11', i).ask);
  assert.equal(new Set(seen).size, qs.length);
});

test('питання повторюються по колу, а не закінчуються', () => {
  const n = forLesson('b11').length;
  assert.equal(pick('b11', n).ask, pick('b11', 0).ask);
});

test('урок без питань не дає питання й не падає', () => {
  assert.equal(pick('немає такого уроку'), null);
  assert.deepEqual(forLesson('немає такого уроку'), []);
});

/* ── підсумок ──────────────────────────────────────────────────────────── */

test('підсумок розрізняє свіже, те, що вчиться, і те, що тримається', () => {
  const prog = {
    b1: done(),                                        // жодного разу
    b2: done({ level: 2, asked: daysAgo(1) }),         // вчиться
    b3: done({ level: MAX_LEVEL, asked: daysAgo(1) }), // тримається
    b4: { state: '' },                                 // не пройдено
  };
  const s = recallStats(prog, TODAY);
  assert.equal(s.fresh, 1);
  assert.equal(s.learning, 1);
  assert.equal(s.held, 1);
  assert.equal(s.total, 3);
  assert.equal(s.due, 1);
});

/* ── цілість питань ────────────────────────────────────────────────────── */

test('кожне питання прив’язане до справжнього уроку', () => {
  const ids = new Set(CODE_LESSONS.map((l) => l.id));
  const stray = QUESTIONS.filter((q) => !ids.has(q.lesson)).map((q) => q.lesson);
  assert.deepEqual([...new Set(stray)], []);
});

test('номер правильної відповіді вказує на наявний варіант', () => {
  // мовчазна помилка: питання виглядає нормально, а вчить неправильного
  const bad = QUESTIONS.filter((q) => !(q.right >= 0 && q.right < q.options.length));
  assert.deepEqual(bad.map((q) => q.ask), []);
});

test('варіантів щонайменше три й вони різні', () => {
  const few = QUESTIONS.filter((q) => q.options.length < 3);
  assert.deepEqual(few.map((q) => q.ask), []);
  const dup = QUESTIONS.filter((q) => new Set(q.options).size !== q.options.length);
  assert.deepEqual(dup.map((q) => q.ask), []);
});

test('у кожного питання є пояснення', () => {
  // без нього помилка нічого не вчить: людина бачить «невірно» й іде далі
  const mute = QUESTIONS.filter((q) => !q.why || q.why.trim().length < 20);
  assert.deepEqual(mute.map((q) => q.ask), []);
});

test('питання не повторюються слово в слово всередині уроку', () => {
  const clash = [];
  COVERED.forEach((id) => {
    const asks = forLesson(id).map((q) => q.ask + '|' + q.options.join('|'));
    if (new Set(asks).size !== asks.length) clash.push(id);
  });
  assert.deepEqual(clash, []);
});

test('питання покривають основи — на них стоїть решта курсу', () => {
  const base = CODE_LESSONS.filter((l) => l.track === 'base').map((l) => l.id);
  const missing = base.filter((id) => !COVERED.includes(id));
  assert.deepEqual(missing, []);
});
