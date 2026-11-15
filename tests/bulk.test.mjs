import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSerials, nextId, bulkRows, bulkConflicts } from '../lib/bulk.js';

// серійники вигадані: репозиторій відкритий
const ID = 0;
const NAME = 1;
const SN = 2;
const STATUS = 3;

test('вставка: стовпчик ділиться за рядками, комами й табуляцією, порожні рядки зникають', () => {
  const { list } = parseSerials('TST001\n\nTST002, TST003;TST004\tTST005\r\n');
  assert.deepEqual(list, ['TST001', 'TST002', 'TST003', 'TST004', 'TST005']);
});

test('вставка: пробіл усередині не ділить серійник', () => {
  assert.deepEqual(parseSerials('SN 1234\nSN 5678').list, ['SN 1234', 'SN 5678']);
});

test('вставка: повтор того самого серійника відкидається й показується окремо', () => {
  const r = parseSerials('TST001\ntst-001\nTST002');
  assert.deepEqual(r.list, ['TST001', 'TST002']);
  assert.deepEqual(r.repeated, ['tst-001']);
});

test('наступний номер: найбільший числовий у колонці + 1, текстові номери не заважають', () => {
  const rows = [['12'], ['348'], ['А-7'], [''], ['100']];
  assert.equal(nextId(rows, ID), 349);
});

test('наступний номер: без колонки номера — нічого', () => {
  assert.equal(nextId([['1']], -1), null);
});

test('рядки партії: номери підряд від стартового, спільні поля в кожному', () => {
  const base = ['', 'Рація TST', '', 'КСП'];
  const rows = bulkRows({ base, idIdx: ID, snIdx: SN, serials: ['TST001', 'TST002', 'TST003'], startId: 349 });
  assert.deepEqual(rows.map((r) => r[ID]), ['349', '350', '351']);
  assert.deepEqual(rows.map((r) => r[SN]), ['TST001', 'TST002', 'TST003']);
  assert.ok(rows.every((r) => r[NAME] === 'Рація TST' && r[STATUS] === 'КСП'));
});

test('рядки партії: спільні значення не діляться між рядками', () => {
  const rows = bulkRows({ base: ['', 'X', '', ''], idIdx: ID, snIdx: SN, serials: ['A1', 'B2'], startId: 1 });
  rows[0][NAME] = 'змінено';
  assert.equal(rows[1][NAME], 'X');
});

test('конфлікти: серійник, що вже є в листі, знаходиться навіть записаний інакше', () => {
  const existing = [['1', 'Рація', 'TST-001', 'КСП']];
  const rows = bulkRows({ base: ['', 'Рація', '', ''], idIdx: ID, snIdx: SN, serials: ['tst001', 'TST002'], startId: 2 });
  const c = bulkConflicts({ existing, rows, idIdx: ID, snIdx: SN });
  assert.deepEqual(c.snTaken, [{ value: 'tst001', row: 2 }]);
  assert.deepEqual(c.idTaken, []);
});

test('конфлікти: зайнятий номер показується з рядком, де він уже стоїть', () => {
  const existing = [['5', 'Рація', 'OLD1', ''], ['6', 'Рація', 'OLD2', '']];
  const rows = bulkRows({ base: ['', 'Рація', '', ''], idIdx: ID, snIdx: SN, serials: ['N1', 'N2'], startId: 6 });
  assert.deepEqual(bulkConflicts({ existing, rows, idIdx: ID, snIdx: SN }).idTaken, [{ value: '6', row: 3 }]);
});
