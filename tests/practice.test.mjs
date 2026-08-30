import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRACTICE_HEADERS, PR, FIELDS, IDEAS,
  parsePractice, practiceRow, stampOf,
  daysOf, streakOf, statsOf, freshIdeas,
} from '../lib/practice.js';

const day = (n) => `${String(n).padStart(2, '0')}.07.2026`;

/** Запис із людськими іменами полів → рядок листа */
const row = (f = {}) => practiceRow(f);
const sheet = (...entries) => [PRACTICE_HEADERS, ...entries.map(row)];

/* ── питання щоденника ─────────────────────────────────────────────────── */

test('обовʼязкове лише одне поле — інакше щоденник кидають', () => {
  const req = FIELDS.filter((f) => f.required);
  assert.equal(req.length, 1);
  assert.equal(req[0].key, 'want');
});

test('у кожного питання є підказка й приклад', () => {
  FIELDS.forEach((f) => {
    assert.ok(f.label && f.hint && f.example, `${f.key}: неповне питання`);
    assert.ok(f.key in PR, `${f.key}: немає колонки в листі`);
  });
});

test('колонки листа збігаються з іменами полів', () => {
  assert.equal(PRACTICE_HEADERS.length, Object.keys(PR).length);
  assert.equal(PRACTICE_HEADERS[PR.want], 'Що хотів');
  assert.equal(PRACTICE_HEADERS[PR.broke], 'Що зламалось');
});

/* ── читання й запис ───────────────────────────────────────────────────── */

test('parsePractice: найновіші згори', () => {
  const list = parsePractice(sheet(
    { date: day(1), want: 'Перша' },
    { date: day(9), want: 'Третя' },
    { date: day(5), want: 'Друга' },
  ));
  assert.deepEqual(list.map((e) => e.want), ['Третя', 'Друга', 'Перша']);
});

test('parsePractice: за один день порядок лишається як у листі', () => {
  const list = parsePractice(sheet(
    { date: day(1), want: 'Зранку' },
    { date: day(1), want: 'Увечері' },
  ));
  assert.deepEqual(list.map((e) => e.want), ['Увечері', 'Зранку']);
});

test('parsePractice: порожні рядки пропускаються, номери не зсуваються', () => {
  const list = parsePractice([
    PRACTICE_HEADERS,
    row({ date: day(1), want: 'Перша' }),
    row({}),
    row({ date: day(2), want: 'Друга' }),
  ]);
  assert.deepEqual(list.map((e) => [e.want, e.row]), [['Друга', 4], ['Перша', 2]]);
});

test('parsePractice: порожній лист не падає', () => {
  assert.deepEqual(parsePractice([]), []);
  assert.deepEqual(parsePractice(null), []);
  assert.deepEqual(parsePractice([PRACTICE_HEADERS]), []);
});

test('practiceRow: хвилини — число або порожньо, не нуль', () => {
  assert.equal(row({ want: 'а', mins: '45' })[PR.mins], 45);
  assert.equal(row({ want: 'а', mins: '' })[PR.mins], '');
  assert.equal(row({ want: 'а', mins: 'дурня' })[PR.mins], '');
  assert.equal(row({ want: 'а', mins: '-5' })[PR.mins], '');
});

test('practiceRow і parsePractice переживають одне одного', () => {
  const e = {
    date: day(3), want: 'Показати вагу', did: 'reduce у partsOf',
    where: 'lib/delivery.js', broke: 'Number("") дає нуль',
    learned: 'Порожнє — не нуль', mins: '40',
  };
  const back = parsePractice([PRACTICE_HEADERS, row(e)])[0];
  assert.equal(back.want, 'Показати вагу');
  assert.equal(back.where, 'lib/delivery.js');
  assert.equal(back.mins, 40);
});

test('stampOf: лише дата, і лише в тому вигляді, у якому її пишуть', () => {
  assert.equal(stampOf('16.08.2026'), Date.UTC(2026, 7, 16));
  assert.equal(stampOf('16.08.2026 09:00'), 0);
  assert.equal(stampOf(''), 0);
});

/* ── підсумки ──────────────────────────────────────────────────────────── */

test('daysOf: різні дні, без повторів', () => {
  const list = parsePractice(sheet(
    { date: day(1), want: 'а' },
    { date: day(1), want: 'б' },
    { date: day(2), want: 'в' },
  ));
  assert.deepEqual(daysOf(list).sort(), [day(1), day(2)]);
});

test('streakOf: рахує підряд, учорашній день теж початок', () => {
  const three = parsePractice(sheet(
    { date: day(18), want: 'а' }, { date: day(19), want: 'б' }, { date: day(20), want: 'в' },
  ));
  assert.equal(streakOf(three, day(20)), 3);

  const yesterday = parsePractice(sheet({ date: day(18), want: 'а' }, { date: day(19), want: 'б' }));
  assert.equal(streakOf(yesterday, day(20)), 2);
});

test('streakOf: пропущений день обриває серію', () => {
  const list = parsePractice(sheet(
    { date: day(10), want: 'а' }, { date: day(19), want: 'б' }, { date: day(20), want: 'в' },
  ));
  assert.equal(streakOf(list, day(20)), 2);
});

test('streakOf: без записів і без дати — нуль', () => {
  assert.equal(streakOf([], day(20)), 0);
  assert.equal(streakOf(parsePractice(sheet({ date: day(20), want: 'а' })), ''), 0);
});

test('statsOf: окремо рахує записи з розібраною поломкою', () => {
  const list = parsePractice(sheet(
    { date: day(19), want: 'а', broke: 'падало на порожньому', mins: '30' },
    { date: day(20), want: 'б', mins: '90' },
  ));
  const s = statsOf(list, day(20));
  assert.equal(s.entries, 2);
  assert.equal(s.days, 2);
  assert.equal(s.streak, 2);
  assert.equal(s.fixed, 1);
  assert.equal(s.hours, 2);
  assert.equal(s.last, day(20));
});

test('statsOf: файли збираються з усіх записів, через кому й без повторів', () => {
  const list = parsePractice(sheet(
    { date: day(1), want: 'а', where: 'lib/delivery.js, pages/index.js' },
    { date: day(2), want: 'б', where: 'lib/delivery.js' },
  ));
  assert.deepEqual(statsOf(list, day(2)).files.sort(), ['lib/delivery.js', 'pages/index.js']);
});

test('statsOf: порожній щоденник не падає й нічого не вигадує', () => {
  const s = statsOf([], day(20));
  assert.deepEqual(s, { entries: 0, days: 0, streak: 0, fixed: 0, hours: 0, last: '', files: [] });
});

/* ── підказки ──────────────────────────────────────────────────────────── */

test('freshIdeas: пропонує те, чим ще не поралися', () => {
  const list = parsePractice(sheet({ date: day(1), want: 'Показати вагу поруч із назвою' }));
  const ideas = freshIdeas(list);
  assert.equal(ideas.some((i) => i.t === 'Показати вагу поруч із назвою'), false);
  assert.equal(ideas.length, 3);
});

test('freshIdeas: коли все перепробувано — показує з початку, а не порожнечу', () => {
  const list = parsePractice(sheet(...IDEAS.map((i, n) => ({ date: day(n + 1), want: i.t }))));
  assert.equal(freshIdeas(list).length, 3);
});

test('freshIdeas: у кожної ідеї є місце, куди йти', () => {
  IDEAS.forEach((i) => {
    assert.ok(i.t && i.d && i.where, `«${i.t}»: неповна ідея`);
  });
});
