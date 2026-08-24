import test from 'node:test';
import assert from 'node:assert/strict';

import {
  keyOf, factOf, FACTS, RUN, MAX_LEVEL, FAST_SEC, NEW_PER_DAY, DAY_SIZE,
  LESSONS, lessonFacts, freshFacts, partsOf, partMultipliers, modesOf,
  blank, runOf, known, auto, stateOf, nextLevel, dueIn,
  problems, slows, due, stats, hardest, nextNew, daily, dayQueue,
  progressOf, lessonProgress, unlockedLessons, practiceDays, dayStreak,
  question, trueFalse, compare, ask, tipFor, hookFor,
} from '../lib/mult.js';

/** Прогрес: ключ факту → часткові поля поверх порожнього запису */
const progOf = (parts = {}) => Object.fromEntries(
  Object.entries(parts).map(([key, v]) => [key, { ...blank(key), ...v }])
);

/** Прогрес, у якому все множення вивчене */
const allMulKnown = (extra = {}) => progOf(Object.fromEntries(
  FACTS.map((f) => [f.key, { runMul: RUN, ...(extra[f.key] || {}) }])
));

const day = (n) => `${String(n).padStart(2, '0')}.07.2026`;
const at = (n) => Date.UTC(2026, 6, n);

/* ── факти таблиці ─────────────────────────────────────────────────────── */

test('keyOf: 7×8 і 8×7 — один факт', () => {
  assert.equal(keyOf(7, 8), '7×8');
  assert.equal(keyOf(8, 7), '7×8');
});

test('factOf: зворотний бік keyOf', () => {
  assert.deepEqual(factOf('7×8'), { a: 7, b: 8 });
  assert.deepEqual(factOf(''), { a: 0, b: 0 });
  assert.deepEqual(factOf('дурня'), { a: 0, b: 0 });
});

test('FACTS: 36 фактів від 2×2 до 9×9, без дзеркальних повторів', () => {
  assert.equal(FACTS.length, 36);
  FACTS.forEach((f) => {
    assert.ok(f.a >= 2 && f.b <= 9, `${f.key} поза межами таблиці`);
    assert.ok(f.a <= f.b, `${f.key} не канонічний`);
    assert.equal(f.key, keyOf(f.a, f.b));
  });
  assert.equal(new Set(FACTS.map((f) => f.key)).size, 36);
});

test('одиниця й нуль не тренуються', () => {
  assert.equal(FACTS.some((f) => f.a < 2 || f.b < 2), false);
});

/* ── уроки ─────────────────────────────────────────────────────────────── */

test('lessonFacts: у таблиці на 7 — вісім прикладів', () => {
  const l7 = LESSONS.find((l) => l.key === 't7');
  const f = lessonFacts(l7);
  assert.equal(f.length, 8);
  f.forEach((x) => assert.ok(x.a === 7 || x.b === 7));
});

test('lessonFacts: ділення й змішаний урок беруть усю таблицю', () => {
  assert.equal(lessonFacts(LESSONS.find((l) => l.key === 'div')).length, 36);
  assert.equal(lessonFacts(LESSONS.find((l) => l.key === 'mix')).length, 36);
});

test('freshFacts: у першому уроці все нове, далі — лише те, чого не було', () => {
  const t2 = LESSONS.find((l) => l.key === 't2');
  const t5 = LESSONS.find((l) => l.key === 't5');
  assert.equal(freshFacts(t2).length, 8);
  // 2×5 уже траплялось у таблиці на 2
  assert.equal(freshFacts(t5).some((f) => f.key === '2×5'), false);
  assert.equal(freshFacts(t5).length, 7);
});

test('freshFacts: остання таблиця не приносить майже нічого нового', () => {
  const t8 = LESSONS.find((l) => l.key === 't8');
  assert.deepEqual(freshFacts(t8).map((f) => f.key), ['8×8']);
});

test('partsOf: урок ділиться на трійки', () => {
  const parts = partsOf(LESSONS.find((l) => l.key === 't7'));
  assert.deepEqual(parts.map((p) => p.length), [3, 3, 2]);
  assert.equal(parts.flat().length, 8);
});

test('partMultipliers: другий множник по порядку', () => {
  const l7 = LESSONS.find((l) => l.key === 't7');
  const [first] = partsOf(l7);
  assert.deepEqual(partMultipliers(l7, first), [2, 3, 4]);
});

test('modesOf: таблиця — множення, ділення — ділення, змішаний — обидва', () => {
  assert.deepEqual(modesOf({ kind: 'table' }), ['mul']);
  assert.deepEqual(modesOf({ kind: 'div' }), ['div']);
  assert.deepEqual(modesOf({ kind: 'mix' }), ['mul', 'div']);
});

test('unlockedLessons: наступний урок чекає, доки закритий попередній', () => {
  assert.deepEqual(unlockedLessons({}).slice(0, 3), [true, false, false]);
  const t2done = progOf(Object.fromEntries(
    lessonFacts(LESSONS[0]).map((f) => [f.key, { runMul: RUN }])
  ));
  const open = unlockedLessons(t2done);
  assert.deepEqual(open.slice(0, 3), [true, true, false]);
});

test('unlockedLessons: усе множення відкриває ділення, але не змішаний урок', () => {
  const open = unlockedLessons(allMulKnown());
  assert.equal(open[LESSONS.findIndex((l) => l.key === 'div')], true);
  assert.equal(open[LESSONS.findIndex((l) => l.key === 'mix')], false);
});

test('progressOf: частка вивченого рахується по режимах уроку', () => {
  const l7 = LESSONS.find((l) => l.key === 't7');
  const half = progOf(Object.fromEntries(
    lessonFacts(l7).slice(0, 4).map((f) => [f.key, { runMul: RUN }])
  ));
  assert.equal(lessonProgress(l7, half), 0.5);
  assert.equal(progressOf([], {}, ['mul']), 0);
});

/* ── рівні та повторення ───────────────────────────────────────────────── */

test('nextLevel: правильна відповідь піднімає на щабель, помилка скидає на два', () => {
  assert.equal(nextLevel(0, true), 1);
  assert.equal(nextLevel(MAX_LEVEL, true), MAX_LEVEL);
  assert.equal(nextLevel(3, false), 1);
  assert.equal(nextLevel(1, false), 0);
});

test('dueIn: проміжки ростуть і впираються в тиждень', () => {
  assert.equal(dueIn(0), 0);
  assert.equal(dueIn(1), 1);
  assert.equal(dueIn(MAX_LEVEL), 7);
  assert.equal(dueIn(99), 7);
  for (let i = 1; i <= MAX_LEVEL; i++) assert.ok(dueIn(i) >= dueIn(i - 1));
});

test('known: чотири правильні поспіль, і рахуються вони окремо для дії', () => {
  const p = progOf({ '7×8': { runMul: RUN, runDiv: RUN - 1 } });
  assert.equal(runOf(p, '7×8', 'mul'), RUN);
  assert.equal(known(p, '7×8', 'mul'), true);
  assert.equal(known(p, '7×8', 'div'), false);
  assert.equal(known({}, '7×8', 'mul'), false);
});

test('auto: вивчено — ще не автоматизм, потрібен час', () => {
  assert.equal(auto(progOf({ '7×8': { runMul: RUN, time: 5 } }), '7×8', 'mul'), false);
  assert.equal(auto(progOf({ '7×8': { runMul: RUN, time: FAST_SEC } }), '7×8', 'mul'), true);
  // без заміру часу автоматизму не буває
  assert.equal(auto(progOf({ '7×8': { runMul: RUN, time: 0 } }), '7×8', 'mul'), false);
});

test('stateOf: чотири щаблі, і кожен означає різну роботу', () => {
  assert.equal(stateOf({}, '7×8', 'mul'), 'new');
  assert.equal(stateOf(progOf({ '7×8': { badMul: 1 } }), '7×8', 'mul'), 'learning');
  assert.equal(stateOf(progOf({ '7×8': { runMul: 1 } }), '7×8', 'mul'), 'learning');
  assert.equal(stateOf(progOf({ '7×8': { runMul: RUN, time: 9 } }), '7×8', 'mul'), 'known');
  assert.equal(stateOf(progOf({ '7×8': { runMul: RUN, time: 1 } }), '7×8', 'mul'), 'auto');
});

test('stateOf: промах у діленні не робить «learning» множення', () => {
  const p = progOf({ '7×8': { badDiv: 3 } });
  assert.equal(stateOf(p, '7×8', 'mul'), 'new');
  assert.equal(stateOf(p, '7×8', 'div'), 'learning');
});

/* ── що тренувати ──────────────────────────────────────────────────────── */

test('problems: незакритий промах лишається в списку, закритий зникає', () => {
  const p = progOf({
    '7×8': { badMul: 2, runMul: 1 },
    '6×7': { badMul: 1, runMul: RUN },     // помилялись, але вже вивчили
  });
  assert.deepEqual(problems(p).map((x) => [x.fact.key, x.mode]), [['7×8', 'mul']]);
});

test('problems: множення й ділення потрапляють окремо', () => {
  const p = progOf({ '7×8': { badMul: 1, badDiv: 1 } });
  assert.deepEqual(problems(p).map((x) => x.mode), ['mul', 'div']);
});

test('slows: вивчене, але повільне', () => {
  const p = progOf({
    '7×8': { runMul: RUN, time: 6 },
    '6×7': { runMul: RUN, time: 1 },      // уже автоматизм
    '5×5': { runMul: 1, time: 9 },        // ще не вивчено
  });
  assert.deepEqual(slows(p).map((x) => x.fact.key), ['7×8']);
});

test('due: приклад спливає, коли минув його проміжок', () => {
  const p = progOf({
    '7×8': { runMul: RUN, mul: 1, seen: day(10) },   // рівень 1 — повтор через добу
    '6×7': { runMul: RUN, mul: 5, seen: day(10) },   // рівень 5 — через тиждень
  });
  assert.deepEqual(due(p, at(12)).map((x) => x.fact.key), ['7×8']);
  assert.deepEqual(due(p, at(20)).map((x) => x.fact.key).sort(), ['6×7', '7×8']);
});

test('due: невивчене й без дати не повторюють', () => {
  assert.deepEqual(due(progOf({ '7×8': { runMul: 1, seen: day(10) } }), at(20)), []);
  assert.deepEqual(due(progOf({ '7×8': { runMul: RUN, seen: '' } }), at(20)), []);
});

test('hardest: найчастіші промахи вгорі', () => {
  const p = progOf({
    '7×8': { badMul: 5 },
    '6×7': { badMul: 2 },
    '9×9': { badDiv: 9 },
    '5×5': { runMul: 1 },        // без помилок — не потрапляє
  });
  assert.deepEqual(hardest(p, 2).map((x) => [x.fact.key, x.bad]), [['9×9', 9], ['7×8', 5]]);
  assert.equal(hardest(p).length, 3);
});

test('nextNew: нове береться в порядку уроків, а не за номером', () => {
  const next = nextNew({}, 3);
  // перший урок — таблиця на 2
  next.forEach((x) => assert.ok(x.fact.a === 2 || x.fact.b === 2));
  assert.equal(next.length, 3);
  next.forEach((x) => assert.equal(x.mode, 'mul'));
});

test('nextNew: вивчене пропускається', () => {
  const twoDone = progOf(Object.fromEntries(
    FACTS.filter((f) => f.a === 2 || f.b === 2).map((f) => [f.key, { runMul: RUN }])
  ));
  // після двійки за порядком уроків іде п'ятірка, а не трійка
  nextNew(twoDone, 3).forEach((x) => assert.ok(x.fact.a === 5 || x.fact.b === 5));
});

test('nextNew: коли множення закрите, беруться за ділення', () => {
  const next = nextNew(allMulKnown(), NEW_PER_DAY);
  assert.equal(next.length, NEW_PER_DAY);
  next.forEach((x) => assert.equal(x.mode, 'div'));
});

test('nextNew: усе закрито — брати нема чого', () => {
  const all = progOf(Object.fromEntries(
    FACTS.map((f) => [f.key, { runMul: RUN, runDiv: RUN }])
  ));
  assert.deepEqual(nextNew(all), []);
});

/* ── підхід дня ────────────────────────────────────────────────────────── */

test('daily: купки не перетинаються, кожен приклад один раз', () => {
  const p = progOf({
    '7×8': { badMul: 2 },
    '6×7': { runMul: RUN, mul: 1, seen: day(1) },
    '5×5': { runMul: RUN, time: 8, seen: day(1) },
  });
  const d = daily(p, at(20));
  const keys = d.all.map((x) => x.fact.key + x.mode);
  assert.equal(new Set(keys).size, keys.length, 'приклад потрапив у дві купки');
});

test('daily: помилки йдуть перед повторенням і розгоном', () => {
  const p = progOf({
    '7×8': { badMul: 2 },
    '6×7': { runMul: RUN, mul: 1, seen: day(1) },              // пора повторити
    '5×5': { runMul: RUN, mul: MAX_LEVEL, time: 8, seen: day(19) },  // не пора, але повільно
  });
  const d = daily(p, at(20));
  assert.deepEqual(d.bad.map((x) => x.fact.key), ['7×8']);
  assert.deepEqual(d.rep.map((x) => x.fact.key), ['6×7']);
  assert.deepEqual(d.slow.map((x) => x.fact.key), ['5×5']);
  const order = d.all.map((x) => x.fact.key);
  assert.ok(order.indexOf('7×8') < order.indexOf('6×7'));
});

test('daily: те, що й пора повторити, і повільне, потрапляє один раз — у повторення', () => {
  const p = progOf({ '5×5': { runMul: RUN, mul: 0, time: 8, seen: day(1) } });
  const d = daily(p, at(20));
  assert.deepEqual(d.rep.map((x) => x.fact.key), ['5×5']);
  assert.deepEqual(d.slow, []);
});

test('daily: у підході завжди є нове, і воно позначене', () => {
  const d = daily({}, at(20));
  assert.equal(d.fresh.length, NEW_PER_DAY);
  d.fresh.forEach((x) => assert.equal(x.fresh, true));
});

test('daily: коли роботи й так багато, вивчене вже не добирається', () => {
  // усе множення вивчене, але повільне — самих лише «розгонів» 36
  const p = allMulKnown(Object.fromEntries(
    FACTS.map((f) => [f.key, { mul: MAX_LEVEL, time: 8, seen: day(19) }])
  ));
  const d = daily(p, at(20));
  assert.ok(d.slow.length > DAY_SIZE);
  assert.deepEqual(d.keep, []);
});

test('daily: у чистий день підхід не порожній — місце займає вивчене', () => {
  const p = allMulKnown(Object.fromEntries(
    FACTS.map((f) => [f.key, { mul: MAX_LEVEL, time: 1, seen: day(19) }])
  ));
  const d = daily(p, at(20));
  assert.deepEqual(d.bad, []);
  assert.deepEqual(d.rep, []);
  assert.deepEqual(d.slow, []);
  // добір доводить підхід до повного розміру
  assert.equal(d.fresh.length + d.keep.length, DAY_SIZE);
});

test('daily: добір починається з того, що не траплялось найдовше', () => {
  const p = allMulKnown(Object.fromEntries(
    // обидві дати в межах проміжку повторення — різниця лише в тому, що давніше
    FACTS.map((f, i) => [f.key, { mul: MAX_LEVEL, time: 1, seen: day(i === 0 ? 15 : 19) }])
  ));
  assert.equal(daily(p, at(20)).keep[0].fact.key, FACTS[0].key);
});

test('dayQueue: рівно стільки питань, скільки просили', () => {
  const items = daily({}, at(20)).all;
  assert.equal(dayQueue(items, 12).length, 12);
  assert.equal(dayQueue(items).length, DAY_SIZE);
  assert.deepEqual(dayQueue([], 10), []);
});

test('dayQueue: короткий список проходиться ще раз, а не добирає чужого', () => {
  const one = [{ fact: FACTS[0], mode: 'mul' }];
  const q = dayQueue(one, 5);
  assert.equal(q.length, 5);
  q.forEach((x) => assert.equal(x.key, FACTS[0].key));
});

test('dayQueue: кожне четверте питання — з пропуском посередині', () => {
  const q = dayQueue(daily({}, at(20)).all, 8);
  assert.deepEqual(q.map((x) => x.hole), ['res', 'res', 'res', 'mid', 'res', 'res', 'res', 'mid']);
});

test('dayQueue: нове повертається наприкінці, а не двічі поспіль', () => {
  const q = dayQueue(daily({}, at(20)).all, DAY_SIZE);
  const fresh = nextNew({}, NEW_PER_DAY).map((x) => x.fact.key);
  const positions = q.map((x, i) => (fresh.includes(x.key) ? i : -1)).filter((i) => i >= 0);
  assert.ok(positions[positions.length - 1] > DAY_SIZE / 2, 'нове не повернулось наприкінці');
});

/* ── серія днів ────────────────────────────────────────────────────────── */

test('practiceDays: дні беруться з дат останнього показу, без повторів', () => {
  const p = progOf({ '7×8': { seen: day(1) }, '6×7': { seen: day(1) }, '5×5': { seen: day(2) } });
  assert.deepEqual(practiceDays(p).sort(), [day(1), day(2)]);
});

test('dayStreak: рахує підряд від сьогодні', () => {
  const p = progOf({ a: { seen: day(18) }, b: { seen: day(19) }, c: { seen: day(20) } });
  assert.equal(dayStreak(p, day(20)), 3);
});

test('dayStreak: вчорашній день теж початок — серія обнулиться лише завтра', () => {
  const p = progOf({ a: { seen: day(18) }, b: { seen: day(19) } });
  assert.equal(dayStreak(p, day(20)), 2);
});

test('dayStreak: пропущений день обриває серію', () => {
  const p = progOf({ a: { seen: day(10) }, b: { seen: day(19) }, c: { seen: day(20) } });
  assert.equal(dayStreak(p, day(20)), 2);
});

test('dayStreak: без тренувань і без дати — нуль', () => {
  assert.equal(dayStreak({}, day(20)), 0);
  assert.equal(dayStreak(progOf({ a: { seen: day(20) } }), ''), 0);
});

/* ── підсумки ──────────────────────────────────────────────────────────── */

test('stats: рахує 72 навички — множення й ділення окремо', () => {
  const s = stats({});
  assert.equal(s.total, 72);
  assert.equal(s.new, 72);
  assert.equal(s.answers, 0);
  assert.equal(s.accuracy, 0);
});

test('stats: точність і середній час', () => {
  const s = stats(progOf({
    '7×8': { ok: 8, bad: 2, time: 2, runMul: RUN },
    '6×7': { ok: 10, bad: 0, time: 6, runMul: RUN },
  }));
  assert.equal(s.answers, 20);
  assert.equal(s.accuracy, 0.9);
  assert.equal(s.avgTime, 4);
  assert.equal(s.timed, 2);
  assert.equal(s.fast, 1);
  assert.equal(s.auto, 1);
  assert.equal(s.known, 1);
});

/* ── питання ───────────────────────────────────────────────────────────── */

test('question: відповідь завжди сходиться з прикладом', () => {
  for (const f of FACTS) {
    for (const mode of ['mul', 'div']) {
      for (const hole of ['res', 'mid']) {
        for (let i = 0; i < 10; i++) {          // напрям вибирається випадково
          const q = question(f, mode, hole);
          const nums = `${q.pre} ${q.answer} ${q.post}`.match(/\d+/g).map(Number);
          const [x, y, z] = nums;
          const ok = mode === 'div' ? x / y === z : x * y === z;
          assert.ok(ok, `${q.pre} ${q.answer} ${q.post} — не сходиться`);
          assert.equal(q.key, f.key);
          assert.equal(q.mode, mode);
        }
      }
    }
  }
});

test('question: приклад стоїть перед «=», а не після', () => {
  const q = question({ a: 3, b: 5, key: '3×5' }, 'mul', 'res');
  assert.match(q.pre, /^\d+ × \d+ =$/);
  assert.equal(q.post, '');
});

test('trueFalse: позначка правди відповідає показаному числу', () => {
  for (const f of FACTS) {
    for (let i = 0; i < 20; i++) {
      const q = trueFalse(f, 'mul');
      const shown = Number(q.text.split('=').pop().trim());
      assert.equal(q.answer, shown === q.real);
      assert.ok(shown > 0, 'показане число має лишатись додатним');
    }
  }
});

test('compare: сторона визначається правильно', () => {
  for (const f of FACTS) {
    for (let i = 0; i < 20; i++) {
      const q = compare(f, 'mul');
      const right = Number(q.right);
      const expected = right === q.real ? 'eq' : q.real > right ? 'left' : 'right';
      assert.equal(q.answer, expected);
    }
  }
});

test('ask: форма визначає вид питання', () => {
  const f = FACTS[0];
  assert.equal(ask(f, 'mul', 'tf').kind, 'tf');
  assert.equal(ask(f, 'mul', 'cmp').kind, 'cmp');
  assert.equal(ask(f, 'mul', 'res').kind, 'pick');
  assert.equal(ask(f, 'mul', 'mid').hole, 'mid');
});

/* ── підказки ──────────────────────────────────────────────────────────── */

test('tipFor: підказка сходиться з відповіддю', () => {
  for (let t = 2; t <= 9; t++) {
    for (let b = 2; b <= 9; b++) {
      const tip = tipFor(t, b);
      assert.ok(tip.includes(String(t * b)), `${t}×${b}: у підказці немає ${t * b} — «${tip}»`);
    }
  }
});

test('hookFor: зачіпка є там, де правило не рятує', () => {
  assert.match(hookFor('7×8'), /56/);
  assert.equal(hookFor('2×3'), '');
});
