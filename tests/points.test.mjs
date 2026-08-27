import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SP_HEADERS, SPC, SP_DEFAULT, LISTS, listByKey,
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

test('три довідники, у кожного свій лист і свої початкові значення', () => {
  assert.deepEqual(LISTS.map((l) => l.key), ['sp', 'transport', 'takers']);
  assert.equal(new Set(LISTS.map((l) => l.sheet)).size, LISTS.length);
  LISTS.forEach((l) => {
    assert.ok(l.title && l.hint, `${l.key}: неповний опис`);
    assert.ok(l.def.length > 0, `${l.key}: немає з чого почати`);
  });
});

test('лише СП обирають без права вписати', () => {
  // СП — це адреса: вписана від руки, вона перестає сходитись із тією
  // самою в інших картках. Транспорт і той, хто взяв на точці, бувають
  // разові — там потрібна свобода.
  assert.equal(listByKey('sp').strict, true);
  assert.equal(listByKey('transport').strict, false);
  assert.equal(listByKey('takers').strict, false);
  assert.equal(listByKey('нема такого'), null);
});

test('пілоти названі пілотами, транспорт — транспортом', () => {
  // «Хто приймає на точці» нічого не пояснювало новенькому, а в підсумках
  // на місці пілотів стояли НРК і машина — вони лише довозять до пілота
  const takers = listByKey('takers');
  assert.equal(takers.title, 'Пілоти');
  assert.match(takers.hint, /дрон/i);
  assert.match(listByKey('transport').title, /пілот/i);
});

test('транспорт — це не позивні', () => {
  // «Чим відправляють» плутали з тим, хто приймає на точці: у списку
  // стояли Лотар і БПС, хоч посилку везе НРК або машина
  const transport = listByKey('transport').def;
  const takers = listByKey('takers').def;
  assert.equal(transport.some((v) => takers.includes(v)), false);
  assert.ok(transport.includes('НРК'));
  assert.ok(takers.includes('БПС'));
});

test('колонки збігаються із заголовками', () => {
  assert.equal(SP_HEADERS.length, Object.keys(SPC).length);
  assert.equal(SP_HEADERS[SPC.name], 'Назва');
  assert.equal(SP_HEADERS[SPC.active], 'Активний');
});
