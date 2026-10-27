import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kop, money, signed, split, effect, compute, invariantOk, eligible,
  statusOn, byOrder, opTitle, balanceWord, categoryOf, livedOps,
} from '../lib/fund.js';

/* Шестеро зі справжніми початковими балансами */
const MEMBERS = [
  { id: 'vanya', name: 'Ваня', order: 1, opening: kop('-4240'), periods: [{ start: '2000-01-01' }], vacations: [] },
  { id: 'fantomas', name: 'Фантомас', order: 2, opening: kop('-3291'), periods: [{ start: '2000-01-01' }], vacations: [] },
  { id: 'denis', name: 'Денис', order: 3, opening: kop('-2920'), periods: [{ start: '2000-01-01' }], vacations: [] },
  { id: 'walter', name: 'Вальтер', order: 4, opening: kop('-2186'), periods: [{ start: '2000-01-01' }], vacations: [] },
  { id: 'petya', name: 'Петя', order: 5, opening: kop('11514'), periods: [{ start: '2000-01-01' }], vacations: [] },
  { id: 'fess', name: 'Фесс', order: 6, opening: kop('14320'), periods: [{ start: '2000-01-01' }], vacations: [] },
];
const CFG = { openingCash: kop('13199'), openingDiff: kop('2') };
const DAY = '2026-10-15';
const nameOf = (id) => MEMBERS.find((m) => m.id === id)?.name || '?';

const clone = () => MEMBERS.map((m) => ({ ...m, periods: [...m.periods], vacations: [...m.vacations] }));
const ex = (o) => ({ type: 'expense', date: DAY, mode: 'manual', category: 'var', ...o });

/* ---------- Гроші ---------- */

test('гроші читаються цілими копійками', () => {
  assert.equal(kop('4240.00'), 424000);
  assert.equal(kop('-3291'), -329100);
  assert.equal(kop('0,01'), 1);
  assert.equal(kop('1 234,56'), 123456);
  assert.equal(kop(''), 0);
});

test('нечислове дає NaN, а не тихий нуль', () => {
  assert.ok(Number.isNaN(kop('abc')));
  assert.ok(Number.isNaN(kop('12-34')));
});

test('копійки складаються точно — на відміну від дробових', () => {
  assert.equal(kop('0.1') + kop('0.2'), kop('0.3'));
});

test('суми показуються як у касовій книзі', () => {
  assert.equal(money(123456), '1 234,56');
  assert.equal(money(-424000), '-4 240,00');
  assert.equal(money(200), '2,00');
  assert.equal(signed(40000), '+400,00');
  assert.equal(signed(-20000), '-200,00');
});

/* ---------- Поділ ---------- */

test('рівний поділ без залишку', () => {
  assert.deepEqual(split(kop('600'), ['vanya', 'denis', 'petya'], 'vanya'),
    { vanya: 20000, denis: 20000, petya: 20000 });
});

test('залишок копійок іде платнику', () => {
  const s = split(kop('100'), ['vanya', 'denis', 'petya'], 'vanya');
  assert.deepEqual(s, { vanya: 3334, denis: 3333, petya: 3333 });
  assert.equal(s.vanya + s.denis + s.petya, kop('100'));
});

test('платника серед учасників немає — залишок за стажем', () => {
  const order = MEMBERS.map((m) => m.id);
  const s = split(kop('100'), ['denis', 'fantomas', 'vanya'], 'fess', order);
  assert.equal(s.vanya, 3334, 'стаж 1 — йому зайва копійка');
  assert.equal(s.fantomas, 3333);
  assert.equal(s.denis, 3333);
});

test('кілька зайвих копійок роздаються по одній', () => {
  const order = MEMBERS.map((m) => m.id);
  const s = split(kop('10'), ['vanya', 'fantomas', 'denis'], 'cash', order);
  // 1000 / 3 = 333, залишок 1
  assert.equal(s.vanya + s.fantomas + s.denis, 1000);
  const s2 = split(1000 + 1, ['vanya', 'fantomas', 'denis'], 'cash', order);
  assert.equal(s2.vanya + s2.fantomas + s2.denis, 1001);
});

test('частки завжди дають суму витрати', () => {
  const order = MEMBERS.map((m) => m.id);
  for (let i = 0; i < 400; i++) {
    const amount = 1 + Math.floor(Math.random() * 100000);
    const n = 1 + Math.floor(Math.random() * 6);
    const parts = order.slice(0, n);
    const s = split(amount, parts, Math.random() < 0.5 ? parts[0] : 'cash', order);
    assert.equal(Object.values(s).reduce((a, b) => a + b, 0), amount);
  }
});

test('порожній склад учасників не ділить нічого', () => {
  assert.deepEqual(split(kop('100'), [], 'vanya'), {});
});

/* ---------- Початковий стан ---------- */

test('початковий стан збігається зі специфікацією', () => {
  const s = compute(MEMBERS, [], CFG);
  assert.equal(s.sum, kop('13197'));
  assert.equal(s.cash, kop('13199'));
  assert.equal(s.diff, kop('2'));
  assert.ok(invariantOk(s, CFG));
});

/* ---------- Операції ---------- */

test('витрата, сплачена особисто: платнику кредит, готівка не при чому', () => {
  const s = compute(MEMBERS, [ex({ amount: kop('600'), payer: 'vanya', participants: ['vanya', 'denis', 'petya'] })], CFG);
  assert.equal(s.bal.vanya, kop('-4240') + kop('400'));
  assert.equal(s.bal.denis, kop('-2920') - kop('200'));
  assert.equal(s.cash, kop('13199'), 'особиста покупка касу не чіпає');
  assert.ok(invariantOk(s, CFG));
});

test('витрата з каси: кредиту не отримує ніхто', () => {
  const s = compute(MEMBERS, [ex({ amount: kop('300'), payer: 'cash', participants: ['walter', 'petya', 'fess'] })], CFG);
  assert.equal(s.bal.walter, kop('-2186') - kop('100'));
  assert.equal(s.cash, kop('13199') - kop('300'));
  assert.ok(invariantOk(s, CFG));
});

test('внесок у касу піднімає і баланс, і готівку', () => {
  const s = compute(MEMBERS, [{ type: 'deposit', date: DAY, amount: kop('1000'), member: 'vanya' }], CFG);
  assert.equal(s.bal.vanya, kop('-4240') + kop('1000'));
  assert.equal(s.cash, kop('13199') + kop('1000'));
  assert.ok(invariantOk(s, CFG));
});

test('видача з каси опускає і баланс, і готівку', () => {
  const s = compute(MEMBERS, [{ type: 'reimburse', date: DAY, amount: kop('1000'), member: 'fess' }], CFG);
  assert.equal(s.bal.fess, kop('14320') - kop('1000'));
  assert.equal(s.cash, kop('13199') - kop('1000'));
  assert.ok(invariantOk(s, CFG));
});

test('переказ між учасниками касу не чіпає', () => {
  const s = compute(MEMBERS, [{ type: 'transfer', date: DAY, amount: kop('500'), member: 'denis', to: 'fess' }], CFG);
  assert.equal(s.bal.denis, kop('-2920') + kop('500'));
  assert.equal(s.bal.fess, kop('14320') - kop('500'));
  assert.equal(s.cash, kop('13199'));
  assert.ok(invariantOk(s, CFG));
});

test('коригування каси міняє саме розбіжність', () => {
  const s = compute(MEMBERS, [{ type: 'adjust', date: DAY, amount: kop('50'), sign: -1, note: 'перерахунок' }], CFG);
  assert.equal(s.cash, kop('13199') - kop('50'));
  assert.equal(s.sum, kop('13197'), 'балансів не чіпає');
  assert.equal(s.diff, kop('2') - kop('50'));
  assert.ok(invariantOk(s, CFG), 'бо коригування було явним');
});

test('скасована операція не дає нічого', () => {
  const op = ex({ amount: kop('600'), payer: 'vanya', participants: ['vanya', 'denis', 'petya'], status: 'cancelled' });
  const s = compute(MEMBERS, [op], CFG);
  const start = compute(MEMBERS, [], CFG);
  assert.deepEqual(s.bal, start.bal);
  assert.equal(s.cash, start.cash);
});

/* ---------- Участь ---------- */

test('відпустка виключає зі змінних, обидві дати включно', () => {
  const ms = clone();
  ms[2].vacations = [{ start: '2026-10-10', end: '2026-10-20' }];
  for (const d of ['2026-10-10', '2026-10-15', '2026-10-20']) {
    assert.ok(!eligible(ms, 'var', d).includes('denis'), `день ${d}`);
  }
  assert.ok(eligible(ms, 'var', '2026-10-09').includes('denis'));
  assert.ok(eligible(ms, 'var', '2026-10-21').includes('denis'));
});

test('відпустка лишає в постійних', () => {
  const ms = clone();
  ms[2].vacations = [{ start: '2026-10-10', end: '2026-10-20' }];
  assert.ok(eligible(ms, 'fixed', DAY).includes('denis'));
  assert.ok(eligible(ms, 'home', DAY).includes('denis'));
});

test('той, хто вийшов, в автоматичні витрати не потрапляє', () => {
  const ms = clone();
  ms[3].periods = [{ start: '2000-01-01', end: '2026-10-10' }];
  assert.ok(!eligible(ms, 'var', DAY).includes('walter'));
  assert.equal(statusOn(ms[3], DAY), 'out');
  assert.equal(statusOn(ms[3], '2026-10-09'), 'in');
});

test('баланс того, хто вийшов, зберігається', () => {
  const ms = clone();
  ms[3].periods = [{ start: '2000-01-01', end: '2026-10-10' }];
  const s = compute(ms, [ex({ amount: kop('500'), payer: 'vanya', mode: 'auto' })], CFG);
  assert.equal(s.bal.walter, kop('-2186'), 'борг не прощається');
});

test('повернення відновлює участь, баланс переходить без змін', () => {
  const ms = clone();
  ms[3].periods = [{ start: '2000-01-01', end: '2026-10-05' }, { start: '2026-10-20' }];
  assert.equal(statusOn(ms[3], '2026-10-10'), 'out');
  assert.equal(statusOn(ms[3], '2026-10-25'), 'in');
  const s = compute(ms, [ex({ amount: kop('600'), payer: 'vanya', mode: 'auto', date: '2026-10-25' })], CFG);
  assert.equal(s.bal.walter, kop('-2186') - kop('100'));
});

test('ручний список переживає перерахунок', () => {
  const ms = clone();
  ms[2].vacations = [{ start: '2026-10-10', end: '2026-10-20' }];
  const op = ex({ amount: kop('300'), payer: 'vanya', participants: ['vanya', 'denis', 'petya'] });
  const s = compute(ms, [op], CFG);
  assert.equal(s.bal.denis, kop('-2920') - kop('100'), 'відпустка ручний список не чіпає');
});

test('зміна відпустки заднім числом перераховує ту саму книгу', () => {
  const book = [ex({ amount: kop('600'), payer: 'vanya', mode: 'auto' })];
  const before = compute(MEMBERS, book, CFG);
  assert.equal(before.bal.denis, kop('-2920') - kop('100'));

  const ms = clone();
  ms[2].vacations = [{ start: '2026-10-10', end: '2026-10-20' }];
  const after = compute(ms, book, CFG);
  assert.equal(after.bal.denis, kop('-2920'), 'частку знято');
  assert.ok(invariantOk(after, CFG));
});

/* ---------- Порядок і відтворюваність ---------- */

test('порядок у переліку не впливає на результат', () => {
  const book = [
    ex({ amount: kop('600'), payer: 'vanya', participants: ['vanya', 'denis', 'petya'], createdAt: '1' }),
    { type: 'deposit', date: DAY, amount: kop('1000'), member: 'vanya', createdAt: '2' },
    ex({ amount: kop('300'), payer: 'cash', participants: ['walter', 'petya', 'fess'], createdAt: '3' }),
  ];
  const a = compute(MEMBERS, book, CFG);
  const b = compute(MEMBERS, [...book].reverse(), CFG);
  assert.deepEqual(a.bal, b.bal);
  assert.equal(a.cash, b.cash);
});

test('повторне програвання дає те саме', () => {
  const book = [ex({ amount: kop('123.45'), payer: 'petya', mode: 'auto' })];
  const first = compute(MEMBERS, book, CFG);
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(compute(MEMBERS, book, CFG).bal, first.bal);
  }
});

test('стан на дату: до й після', () => {
  const book = [
    ex({ amount: kop('600'), payer: 'vanya', mode: 'auto', date: '2026-09-20' }),
    ex({ amount: kop('600'), payer: 'vanya', mode: 'auto', date: '2026-10-05' }),
  ];
  const start = compute(MEMBERS, book, CFG, { before: '2026-10-01' });
  const end = compute(MEMBERS, book, CFG, { until: '2026-10-31' });
  assert.equal(start.bal.denis, kop('-2920') - kop('100'), 'лише вересневу');
  assert.equal(end.bal.denis, kop('-2920') - kop('200'), 'обидві');
});

/* ---------- Інваріант під випадковими послідовностями ---------- */

test('інваріант тримається після будь-якої послідовності', () => {
  const ids = MEMBERS.map((m) => m.id);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const book = [];
  let adjusted = 0;

  for (let i = 0; i < 120; i++) {
    const amount = 1 + Math.floor(Math.random() * 50000);
    const date = `2026-10-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`;
    const type = pick(['expense', 'expense', 'deposit', 'reimburse', 'transfer', 'adjust']);
    const common = { date, amount, createdAt: String(i).padStart(4, '0') };

    if (type === 'expense') {
      book.push({ ...common, type, mode: 'auto', category: pick(CATEGORIES_IDS), payer: pick([...ids, 'cash']) });
    } else if (type === 'transfer') {
      const a = pick(ids);
      const b = pick(ids.filter((x) => x !== a));
      book.push({ ...common, type, member: a, to: b });
    } else if (type === 'adjust') {
      const sign = Math.random() < 0.5 ? 1 : -1;
      book.push({ ...common, type, sign, note: 'перерахунок' });
      adjusted += amount * sign;
    } else {
      book.push({ ...common, type, member: pick(ids) });
    }

    const s = compute(MEMBERS, book, CFG);
    assert.ok(invariantOk(s, CFG), `зламалось на кроці ${i} (${type})`);
    assert.equal(s.diff, kop('2') + adjusted);
  }
});

const CATEGORIES_IDS = ['var', 'fixed', 'home', 'other'];

/* ---------- Підписи ---------- */

test('операції підписані зрозуміло', () => {
  assert.equal(opTitle({ type: 'expense', desc: 'Продукти в АТБ' }, nameOf), 'Продукти в АТБ');
  assert.equal(opTitle({ type: 'expense', category: 'var' }, nameOf), 'Продукти і їжа');
  assert.equal(opTitle({ type: 'deposit', member: 'vanya' }, nameOf), 'Ваня вніс у касу');
  assert.equal(opTitle({ type: 'transfer', member: 'denis', to: 'fess' }, nameOf), 'Денис → Фесс');
  assert.equal(opTitle({ type: 'adjust' }, nameOf), 'Коригування каси');
});

test('знак балансу читається словами, а не лише кольором', () => {
  assert.equal(balanceWord(-1), 'винен фондові');
  assert.equal(balanceWord(1), 'фонд винен йому');
  assert.equal(balanceWord(0), 'у розрахунку');
});

test('невідома категорія не валить розрахунок', () => {
  assert.equal(categoryOf('немає такої').id, 'other');
});

test('учасники впорядковані за стажем', () => {
  const mixed = [...MEMBERS].reverse();
  assert.deepEqual(byOrder(mixed).map((m) => m.id),
    ['vanya', 'fantomas', 'denis', 'walter', 'petya', 'fess']);
});

test('скасовані не потрапляють у програвання', () => {
  const book = [ex({ amount: 100, status: 'cancelled' }), ex({ amount: 200 })];
  assert.equal(livedOps(book).length, 1);
});
