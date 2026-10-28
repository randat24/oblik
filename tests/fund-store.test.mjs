import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRanges, rangesText, parseMembers, parseOps, parseConfig,
  opRow, memberRow, MEMBER_HEADERS, OP_HEADERS,
} from '../lib/fund-store.js';
import { kop, compute, invariantOk } from '../lib/fund.js';
import {
  OPENING_MEMBERS, OPENING_CASH, OPENING_DIFF, OPENING_DATE, openingConfigRows,
} from '../lib/fund-seed.js';

/* ---------- Періоди одним рядком ---------- */

test('відкритий період — без кінця', () => {
  assert.deepEqual(parseRanges('2000-01-01..'), [{ start: '2000-01-01' }]);
});

test('закритий період читається з обома датами', () => {
  assert.deepEqual(parseRanges('2026-10-10..2026-10-20'),
    [{ start: '2026-10-10', end: '2026-10-20' }]);
});

test('кілька періодів через кому', () => {
  assert.deepEqual(parseRanges('2000-01-01..2026-10-05, 2026-10-20..'),
    [{ start: '2000-01-01', end: '2026-10-05' }, { start: '2026-10-20' }]);
});

test('порожній рядок не дає сміттєвих періодів', () => {
  assert.deepEqual(parseRanges(''), []);
  assert.deepEqual(parseRanges('  ,  '), []);
  assert.deepEqual(parseRanges(null), []);
});

test('запис і читання періодів — туди й назад без втрат', () => {
  const list = [{ start: '2000-01-01', end: '2026-10-05' }, { start: '2026-10-20' }];
  assert.deepEqual(parseRanges(rangesText(list)), list);
});

/* ---------- Учасники ---------- */

const MROW = ['vanya', 'Ваня', '1', '-4240.00', '2000-01-01..', '2026-10-10..2026-10-20'];

test('учасник читається з рядка таблиці', () => {
  const [m] = parseMembers([MEMBER_HEADERS, MROW]);
  assert.equal(m.id, 'vanya');
  assert.equal(m.name, 'Ваня');
  assert.equal(m.order, 1);
  assert.equal(m.opening, kop('-4240'));
  assert.deepEqual(m.periods, [{ start: '2000-01-01' }]);
  assert.deepEqual(m.vacations, [{ start: '2026-10-10', end: '2026-10-20' }]);
});

test('відпустка без кінця відкидається — вона не має сенсу', () => {
  const [m] = parseMembers([MEMBER_HEADERS, ['x', 'X', '1', '0', '2000-01-01..', '2026-10-10..']]);
  assert.deepEqual(m.vacations, []);
});

test('рядок без ідентифікатора пропускаємо', () => {
  assert.deepEqual(parseMembers([MEMBER_HEADERS, ['', 'Нічий', '1', '0', '', '']]), []);
});

test('учасник без імені показується хоча б ідентифікатором', () => {
  const [m] = parseMembers([MEMBER_HEADERS, ['fess', '', '6', '0', '', '']]);
  assert.equal(m.name, 'fess');
});

test('запис і читання учасника — туди й назад', () => {
  const [m] = parseMembers([MEMBER_HEADERS, MROW]);
  const [again] = parseMembers([MEMBER_HEADERS, memberRow(m)]);
  assert.deepEqual(again, m);
});

/* ---------- Операції ---------- */

test('витрата читається з рядка', () => {
  const row = ['op1', 'expense', '2026-10-15', '600.00', 'Продукти', 'var',
    'vanya', 'manual', 'vanya,denis,petya', '', '', '', '', 'active',
    '2026-10-15T10:00:00Z', 'Fantomas', '', ''];
  const [o] = parseOps([OP_HEADERS, row]);
  assert.equal(o.type, 'expense');
  assert.equal(o.amount, kop('600'));
  assert.deepEqual(o.participants, ['vanya', 'denis', 'petya']);
  assert.equal(o.mode, 'manual');
  assert.equal(o.status, 'active');
  assert.equal(o.row, 2, 'номер рядка потрібен, щоб операцію можна було скасувати');
});

test('порожній статус означає чинну операцію', () => {
  const [o] = parseOps([OP_HEADERS, ['op1', 'deposit', '2026-10-15', '100', '', '', '', '', '', 'vanya']]);
  assert.equal(o.status, 'active');
  assert.equal(o.mode, 'auto', 'режим за замовчуванням — за правилами');
});

test('знак коригування читається лише як −1 або 1', () => {
  const [a] = parseOps([OP_HEADERS, ['o', 'adjust', '2026-10-15', '50', '', '', '', '', '', '', '', '-1']]);
  const [b] = parseOps([OP_HEADERS, ['o', 'adjust', '2026-10-15', '50', '', '', '', '', '', '', '', '']]);
  assert.equal(a.sign, -1);
  assert.equal(b.sign, 1);
});

test('номери рядків ідуть підряд від другого', () => {
  const ops = parseOps([OP_HEADERS,
    ['a', 'deposit', '2026-10-01', '1', '', '', '', '', '', 'vanya'],
    ['b', 'deposit', '2026-10-02', '1', '', '', '', '', '', 'denis'],
  ]);
  assert.deepEqual(ops.map((o) => o.row), [2, 3]);
});

test('запис і читання операції — туди й назад', () => {
  const op = {
    id: 'op1', type: 'expense', date: '2026-10-15', amount: kop('123.45'),
    desc: 'Продукти', category: 'var', payer: 'cash', mode: 'manual',
    participants: ['vanya', 'denis'], member: '', to: '', sign: 1,
    note: 'через касу', status: 'active', createdAt: '2026-10-15T10:00:00Z',
    author: 'Fantomas',
  };
  const [back] = parseOps([OP_HEADERS, opRow(op)]);
  assert.equal(back.amount, op.amount);
  assert.equal(back.payer, 'cash');
  assert.deepEqual(back.participants, op.participants);
  assert.equal(back.note, op.note);
  assert.equal(back.author, 'Fantomas');
});

test('суми пишемо з двома знаками — у таблиці їх читають очима', () => {
  const r = opRow({ id: 'x', type: 'deposit', amount: kop('1000'), date: '2026-10-15' });
  assert.equal(r[3], '1000.00');
});

/* ---------- Налаштування ---------- */

test('налаштування читаються парами ключ-значення', () => {
  const c = parseConfig([
    ['Ключ', 'Значення'],
    ['openingCash', '13199.00'],
    ['openingDiff', '2.00'],
    ['openingDate', '2026-10-01'],
  ]);
  assert.equal(c.openingCash, kop('13199'));
  assert.equal(c.openingDiff, kop('2'));
  assert.equal(c.openingDate, '2026-10-01');
});

test('порожній лист налаштувань не валить сторінку', () => {
  const c = parseConfig([]);
  assert.equal(c.openingCash, 0);
  assert.equal(c.openingDiff, 0);
});

/* ---------- Початковий стан ---------- */

test('початковий стан збігається зі специфікацією', () => {
  const sum = OPENING_MEMBERS.reduce((a, m) => a + m.opening, 0);
  assert.equal(sum, kop('13197'), 'сума балансів');
  assert.equal(OPENING_CASH, kop('13199'), 'готівка');
  assert.equal(OPENING_DIFF, kop('2'), 'розбіжність');
});

test('стаж — шість різних номерів підряд', () => {
  const ranks = OPENING_MEMBERS.map((m) => m.order).sort((a, b) => a - b);
  assert.deepEqual(ranks, [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(OPENING_MEMBERS.map((m) => m.id)).size, 6, 'ідентифікатори різні');
});

test('усі в складі з дня відкриття, без відпусток; Денис — до 20.10', () => {
  OPENING_MEMBERS.forEach((m) => {
    const want = m.id === 'denis' ? [{ start: OPENING_DATE, end: '2026-10-20' }] : [{ start: OPENING_DATE }];
    assert.deepEqual(m.periods, want, m.name);
    assert.deepEqual(m.vacations, [], m.name);
  });
});

test('після 20.10 витрати на Дениса не діляться, його борг лишається 2920', () => {
  const ops = [
    { id: 'a', type: 'expense', date: '2026-10-19', amount: kop('600'), category: 'var', payer: 'petya', mode: 'auto', status: 'active' },
    { id: 'b', type: 'expense', date: '2026-10-20', amount: kop('500'), category: 'var', payer: 'petya', mode: 'auto', status: 'active' },
    { id: 'c', type: 'expense', date: '2026-10-27', amount: kop('500'), category: 'home', payer: 'fess', mode: 'auto', status: 'active' },
  ];
  const cfg = { openingCash: OPENING_CASH, openingDiff: OPENING_DIFF };
  const s19 = compute(OPENING_MEMBERS, ops, cfg, { until: '2026-10-19' });
  const s27 = compute(OPENING_MEMBERS, ops, cfg);
  assert.equal(s19.bal.denis, kop('-2920') - kop('100'), '19.10 ще ділиться на шістьох');
  assert.equal(s27.bal.denis, s19.bal.denis, 'з 20.10 нічого не додається');
  assert.ok(invariantOk(s27, cfg));
});

test('початкові рядки читаються назад без втрат', () => {
  const back = parseMembers([MEMBER_HEADERS, ...OPENING_MEMBERS.map(memberRow)]);
  assert.equal(back.length, 6);
  assert.deepEqual(back.map((m) => m.opening), OPENING_MEMBERS.map((m) => m.opening));
  assert.deepEqual(back.map((m) => m.name), OPENING_MEMBERS.map((m) => m.name));
});

test('налаштування початкового стану — три пари', () => {
  const c = parseConfig([['Ключ', 'Значення'], ...openingConfigRows()]);
  assert.equal(c.openingCash, kop('13199'));
  assert.equal(c.openingDiff, kop('2'));
  assert.equal(c.openingDate, OPENING_DATE);
});

test('порожній фонд дає рівно той стан, що в специфікації', () => {
  const state = compute(OPENING_MEMBERS, [], { openingCash: OPENING_CASH, openingDiff: OPENING_DIFF });
  assert.equal(state.sum, kop('13197'));
  assert.equal(state.cash, kop('13199'));
  assert.equal(state.diff, kop('2'));
  assert.ok(invariantOk(state, { openingDiff: OPENING_DIFF }));
});

/* ---------- Період витрати ---------- */
test('період витрати читається з рядка й пишеться назад без втрат', () => {
  const op = { id: 'p1', type: 'expense', date: '2026-10-31', amount: kop('100'), category: 'fixed',
    payer: 'cash', mode: 'manual', participants: ['a'], periodFrom: '2026-10-01', periodTo: '2026-10-31',
    status: 'active', createdAt: 'T', author: 'F' };
  const [back] = parseOps([OP_HEADERS, opRow(op)]);
  assert.equal(back.periodFrom, '2026-10-01');
  assert.equal(back.periodTo, '2026-10-31');
});

test('старий рядок без колонок періоду читається як звичайна витрата', () => {
  const old = ['o', 'expense', '2026-10-15', '100.00', '', 'var', 'a', 'manual', 'a', '', '', '', '', 'active', 'T', 'F', '', ''];
  const [o] = parseOps([OP_HEADERS.slice(0, 18), old]);
  assert.equal(o.periodFrom, '');
  assert.equal(o.periodTo, '');
});

test('нові колонки листа операцій — лише в кінці', () => {
  assert.deepEqual(OP_HEADERS.slice(-2), ['Період з', 'Період по']);
  assert.equal(OP_HEADERS[17], 'Причина скасування');
});
