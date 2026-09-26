import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'сіль для тестів';

const { hashPin, findPerson, verifyPin, C, PEOPLE_HEADERS } = await import('../lib/people.js');

/**
 * Вхід у застосунок.
 *
 * У листі «Люди» лежить не PIN, а його відбиток — саме щоб доступ до
 * таблиці не давав змоги зайти чужим позивним. Тестів на це не було
 * жодного, хоча ламається тут не функція, а довіра до всього обліку:
 * у журналі стоїть позивний, і він має означати ту саму людину.
 */

const person = (callsign, pin, extra = {}) => ({
  row: 2,
  callsign,
  hash: hashPin(callsign, pin),
  role: 'user',
  active: true,
  ...extra,
});

/* ── відбиток ──────────────────────────────────────────────────────────── */

test('відбиток не містить самого PIN', () => {
  const h = hashPin('Сокіл', '1234');
  assert.match(h, /^[0-9a-f]{64}$/, 'це шістдесят чотири шістнадцяткові знаки');
  assert.ok(!h.includes('1234'));
});

test('однаковий PIN у двох людей дає різні відбитки', () => {
  // позивний у солі — інакше по одному відбитку видно всіх із таким PIN
  assert.notEqual(hashPin('Сокіл', '1234'), hashPin('Тінь', '1234'));
});

test('регістр і пробіли в позивному не міняють відбитка', () => {
  const h = hashPin('Сокіл', '1234');
  assert.equal(hashPin('сокіл', '1234'), h);
  assert.equal(hashPin('  СОКІЛ  ', '1234'), h);
});

test('різний PIN — різний відбиток', () => {
  assert.notEqual(hashPin('Сокіл', '1234'), hashPin('Сокіл', '1235'));
});

/* ── пошук людини ──────────────────────────────────────────────────────── */

test('позивний шукається без огляду на регістр і пробіли', () => {
  const people = [person('Сокіл', '1111'), person('Тінь', '2222')];
  assert.equal(findPerson(people, 'сокіл').callsign, 'Сокіл');
  assert.equal(findPerson(people, '  ТІНЬ ').callsign, 'Тінь');
  assert.equal(findPerson(people, 'Граф'), null);
  assert.equal(findPerson(people, ''), null);
  assert.equal(findPerson(people, null), null);
});

/* ── перевірка PIN ─────────────────────────────────────────────────────── */

test('вірний PIN пускає', () => {
  const people = [person('Сокіл', '1234')];
  assert.equal(verifyPin(people, 'Сокіл', '1234').callsign, 'Сокіл');
  assert.equal(verifyPin(people, 'сокіл', '1234').callsign, 'Сокіл', 'регістр не заважає');
});

test('невірний PIN не пускає', () => {
  const people = [person('Сокіл', '1234')];
  assert.equal(verifyPin(people, 'Сокіл', '1235'), null);
  assert.equal(verifyPin(people, 'Сокіл', ''), null);
  assert.equal(verifyPin(people, 'Сокіл', null), null);
  assert.equal(verifyPin(people, 'Сокіл', '1234 '), null, 'пробіл у PIN — це інший PIN');
});

test('вимкнену людину не пускає навіть з вірним PIN', () => {
  const people = [person('Сокіл', '1234', { active: false })];
  assert.equal(verifyPin(people, 'Сокіл', '1234'), null);
});

test('людину без відбитка не пускає взагалі', () => {
  // порожня клітинка «Відбиток PIN» не має означати «заходь без PIN»
  const people = [{ ...person('Сокіл', '1234'), hash: '' }];
  assert.equal(verifyPin(people, 'Сокіл', ''), null);
  assert.equal(verifyPin(people, 'Сокіл', '1234'), null);
});

test('невідомий позивний не пускає', () => {
  assert.equal(verifyPin([person('Сокіл', '1234')], 'Граф', '1234'), null);
  assert.equal(verifyPin([], 'Сокіл', '1234'), null);
});

test('зіпсований відбиток у таблиці не валить вхід', () => {
  // хтось правив лист руками й лишив півхеша: порівняння має сказати
  // «ні», а не впасти на різній довжині
  const people = [{ ...person('Сокіл', '1234'), hash: 'abc' }];
  assert.equal(verifyPin(people, 'Сокіл', '1234'), null);
});

/* ── розкладка листа ───────────────────────────────────────────────────── */

test('колонки листа стоять там, де їх шукають', () => {
  assert.deepEqual(PEOPLE_HEADERS, ['Позивний', 'Відбиток PIN', 'Роль', 'Активний', 'Додано']);
  assert.equal(PEOPLE_HEADERS[C.callsign], 'Позивний');
  assert.equal(PEOPLE_HEADERS[C.hash], 'Відбиток PIN');
  assert.equal(PEOPLE_HEADERS[C.role], 'Роль');
  assert.equal(PEOPLE_HEADERS[C.active], 'Активний');
});
