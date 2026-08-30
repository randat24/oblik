/**
 * Вміст ящиків: скільки на місці, скільки на руках — і розбір старих
 * текстових описів на позиції.
 *
 * «На місці» — це число, за яким людина вирішує, чи їхати по річ.
 * А `parseContents` розбирає те, що роками писали вільним текстом:
 * саме він і має бути під тестами, бо перевірити його очима на сотні
 * ящиків неможливо.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseLines, lineRow, parseContents, LINE_HEADERS, C,
} from '../lib/boxes.js';

function row(fields = {}) {
  const r = new Array(LINE_HEADERS.length).fill('');
  Object.entries(fields).forEach(([key, value]) => {
    if (!(key in C)) throw new Error(`Немає колонки «${key}» — перевірте C`);
    r[C[key]] = value === null || value === undefined ? '' : String(value);
  });
  return r;
}

const sheet = (...rows) => [LINE_HEADERS, ...rows.map(row)];

/* ── скільки на місці ──────────────────────────────────────────────────── */

test('на місці = всього − взято', () => {
  const [l] = parseLines(sheet({ box: 'Я-1', name: 'Рація', total: 3, taken: 1 }));
  assert.equal(l.left, 2);
});

test('на місці рахуємо самі, а не читаємо з клітинки', () => {
  const [l] = parseLines(sheet({ box: 'Я-1', name: 'Рація', total: 3, taken: 1, left: 99 }));
  assert.equal(l.left, 2);
});

test('усе на руках — нуль на місці, і це не помилка', () => {
  const [l] = parseLines(sheet({ box: 'Я-1', name: 'Рація', total: 2, taken: 2 }));
  assert.equal(l.left, 0);
});

test('взято більше, ніж є, — відʼємне на місці видно, а не ховається', () => {
  const [l] = parseLines(sheet({ box: 'Я-1', name: 'Рація', total: 2, taken: 3 }));
  assert.equal(l.left, -1);
});

/* ── розбір листа ──────────────────────────────────────────────────────── */

test('порожні рядки пропускаються, номери решти не зсуваються', () => {
  const lines = parseLines(sheet(
    { box: 'Я-1', name: 'Рація' },
    {},
    { box: 'Я-1', name: 'Кабель' },
  ));
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((l) => l.row), [2, 4]);
});

test('короткий рядок добивається порожніми', () => {
  const [l] = parseLines([LINE_HEADERS, ['Я-1', 'Рація', '3', '1']]);
  assert.equal(l.left, 2);
  assert.equal(l.unit, '');
  assert.equal(l.note, '');
});

test('порожній лист — порожній перелік', () => {
  assert.deepEqual(parseLines([]), []);
  assert.deepEqual(parseLines([LINE_HEADERS]), []);
  assert.deepEqual(parseLines(null), []);
});

test('lineRow і parseLines читають однакові колонки', () => {
  const r = lineRow({
    box: 'Я-1', name: 'Рація Motorola', total: 3, taken: 1, unit: 'шт.',
    accounting: 'Облікове', note: 'одна без антени', date: '20.08.2026',
  });
  const [l] = parseLines([LINE_HEADERS, r]);
  assert.equal(l.box, 'Я-1');
  assert.equal(l.name, 'Рація Motorola');
  assert.equal(l.total, 3);
  assert.equal(l.taken, 1);
  assert.equal(l.left, 2);
  assert.equal(l.unit, 'шт.');
  assert.equal(l.accounting, 'Облікове');
  assert.equal(l.note, 'одна без антени');
});

test('lineRow: ширина рядка збігається із заголовком', () => {
  const r = lineRow({ box: 'Я-1', name: 'Рація', date: '20.08.2026' });
  assert.equal(r.length, LINE_HEADERS.length);
});

/* ── розбір старого текстового вмісту ──────────────────────────────────── */

test('кількість у кінці: «ПНВ 4 шт»', () => {
  assert.deepEqual(parseContents('ПНВ 4 шт'), [{ name: 'ПНВ', total: 4, unit: 'шт.' }]);
});

test('кількість попереду: «4 ПНВ»', () => {
  assert.deepEqual(parseContents('4 ПНВ'), [{ name: 'ПНВ', total: 4, unit: 'шт.' }]);
});

test('без кількості — одна штука', () => {
  assert.deepEqual(parseContents('Рація'), [{ name: 'Рація', total: 1, unit: 'шт.' }]);
});

test('кілька позицій через кому й крапку з комою', () => {
  assert.deepEqual(parseContents('ПНВ 4 шт, кабель 2 шт; рація'), [
    { name: 'ПНВ', total: 4, unit: 'шт.' },
    { name: 'кабель', total: 2, unit: 'шт.' },
    { name: 'рація', total: 1, unit: 'шт.' },
  ]);
});

test('позиції з нового рядка', () => {
  assert.deepEqual(parseContents('ПНВ 4 шт\nкабель 2 шт'), [
    { name: 'ПНВ', total: 4, unit: 'шт.' },
    { name: 'кабель', total: 2, unit: 'шт.' },
  ]);
});

test('«х4» і «x 4» — теж кількість', () => {
  assert.deepEqual(parseContents('ПНВ х4'), [{ name: 'ПНВ', total: 4, unit: 'шт.' }]);
  assert.deepEqual(parseContents('ПНВ x 4'), [{ name: 'ПНВ', total: 4, unit: 'шт.' }]);
});

test('одиниці зводяться до однакового написання', () => {
  assert.equal(parseContents('кабель 2 к-т')[0].unit, 'к-т');
  assert.equal(parseContents('кабель 2 компл.')[0].unit, 'к-т');
  assert.equal(parseContents('рукавиці 2 пари')[0].unit, 'пара');
  assert.equal(parseContents('трос 30 м')[0].unit, 'м');
  assert.equal(parseContents('пальне 20 л')[0].unit, 'л');
});

test('дробова кількість через кому', () => {
  assert.deepEqual(parseContents('трос 2,5 м'), [{ name: 'трос', total: 2.5, unit: 'м' }]);
});

test('нуль і відʼємне не стають кількістю — це одна штука', () => {
  // «0 шт» у старому описі означало «немає позначки», а не «нема речі»:
  // сама згадка в ящику вже означає, що річ туди клали
  assert.equal(parseContents('ПНВ 0 шт')[0].total, 1);
});

test('порожній текст — жодної позиції', () => {
  assert.deepEqual(parseContents(''), []);
  assert.deepEqual(parseContents(null), []);
  assert.deepEqual(parseContents('  ,  ;  '), []);
});

test('назва з числом усередині не втрачає його', () => {
  assert.deepEqual(parseContents('Рація Motorola DP4400 2 шт'), [
    { name: 'Рація Motorola DP4400', total: 2, unit: 'шт.' },
  ]);
});

test('зайві пробіли й тире по краях зрізаються', () => {
  assert.deepEqual(parseContents('  —  ПНВ   4   шт  '), [
    { name: 'ПНВ', total: 4, unit: 'шт.' },
  ]);
});
