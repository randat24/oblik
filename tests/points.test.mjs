import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SP_HEADERS, SPC, SP_DEFAULT,
  parsePoints, activeNames, hasPoint,
} from '../lib/points.js';

/** Рядок листа з людських полів */
const row = ({ name = '', active = 'так', added = '' } = {}) => {
  const r = new Array(SP_HEADERS.length).fill('');
  r[SPC.name] = name;
  r[SPC.active] = active;
  r[SPC.added] = added;
  return r;
};

const sheet = (...rows) => [SP_HEADERS, ...rows];

test('parsePoints: читає назву, стан і дату', () => {
  const list = parsePoints(sheet(row({ name: 'Тигр', added: '25.08.2026' })));
  assert.deepEqual(list, [{ row: 2, name: 'Тигр', active: true, added: '25.08.2026' }]);
});

test('parsePoints: порожня клітинка стану означає «так»', () => {
  // назву дописують просто в таблиці й про другу колонку не згадують
  const list = parsePoints(sheet(row({ name: 'Рись', active: '' })));
  assert.equal(list[0].active, true);
});

test('parsePoints: вимкнений СП лишається в переліку', () => {
  const list = parsePoints(sheet(row({ name: 'Білий', active: 'ні' })));
  assert.equal(list.length, 1);
  assert.equal(list[0].active, false);
});

test('parsePoints: рядки без назви пропускаються, номери не зсуваються', () => {
  const list = parsePoints(sheet(row({ name: 'Тигр' }), row({}), row({ name: 'Рись' })));
  assert.deepEqual(list.map((p) => [p.name, p.row]), [['Тигр', 2], ['Рись', 4]]);
});

test('parsePoints: порожній лист не падає', () => {
  assert.deepEqual(parsePoints([]), []);
  assert.deepEqual(parsePoints(null), []);
  assert.deepEqual(parsePoints([SP_HEADERS]), []);
});

test('parsePoints: короткий рядок доповнюється', () => {
  assert.deepEqual(parsePoints([SP_HEADERS, ['Тигр']]), [
    { row: 2, name: 'Тигр', active: true, added: '' },
  ]);
});

test('activeNames: у форму йдуть лише ті, куди зараз возять', () => {
  const list = parsePoints(sheet(
    row({ name: 'Тигр' }),
    row({ name: 'Рись', active: 'ні' }),
    row({ name: 'Білий' }),
  ));
  assert.deepEqual(activeNames(list), ['Тигр', 'Білий']);
});

test('activeNames: порядок такий самий, як у таблиці', () => {
  const list = parsePoints(sheet(row({ name: 'Білий' }), row({ name: 'Тигр' })));
  assert.deepEqual(activeNames(list), ['Білий', 'Тигр']);
});

test('activeNames: без переліку — порожньо, а не падіння', () => {
  assert.deepEqual(activeNames([]), []);
  assert.deepEqual(activeNames(null), []);
});

test('hasPoint: не зважає на регістр і пробіли', () => {
  const list = parsePoints(sheet(row({ name: 'Тигр' })));
  assert.equal(hasPoint(list, 'тигр'), true);
  assert.equal(hasPoint(list, '  ТИГР  '), true);
  assert.equal(hasPoint(list, 'Тирг'), false);
  assert.equal(hasPoint([], 'Тигр'), false);
});

test('SP_DEFAULT: те, з чого починається порожній лист', () => {
  assert.deepEqual(SP_DEFAULT, ['Тигр', 'Рись', 'Білий']);
  assert.equal(new Set(SP_DEFAULT).size, SP_DEFAULT.length);
});

test('колонки збігаються із заголовками', () => {
  assert.equal(SP_HEADERS.length, Object.keys(SPC).length);
  assert.equal(SP_HEADERS[SPC.name], 'Назва');
  assert.equal(SP_HEADERS[SPC.active], 'Активний');
});
