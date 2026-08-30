/**
 * Склад Рибаківки: залишок, ID, рядок нової позиції.
 *
 * Тут рахуються цифри, за якими потім їдуть по речі. Помилка на одиницю
 * тут — це не негарний екран, а поїздка по те, чого немає.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseStockItems, nextId, stockRow, STOCK_HEADERS, C,
} from '../lib/stock.js';

/** { name: 'Вода', received: 100 } → рядок листа складу */
function row(fields = {}) {
  const r = new Array(STOCK_HEADERS.length).fill('');
  Object.entries(fields).forEach(([key, value]) => {
    if (!(key in C)) throw new Error(`Немає колонки «${key}» — перевірте C`);
    r[C[key]] = value === null || value === undefined ? '' : String(value);
  });
  return r;
}

const sheet = (...rows) => [STOCK_HEADERS, ...rows.map(row)];

/* ── залишок ───────────────────────────────────────────────────────────── */

test('залишок = прийнято − списано', () => {
  const [it] = parseStockItems(sheet({ id: 'Р-001', name: 'Вода', received: 100, writtenOff: 40 }));
  assert.equal(it.remainder, 60);
});

test('залишок рахуємо самі, навіть коли в клітинці стоїть інше', () => {
  // саме заради цього залишок і не читається з таблиці: там його міг
  // виправити руками хто завгодно, а прийнято/списано ведуться записами
  const [it] = parseStockItems(sheet({
    id: 'Р-001', name: 'Вода', received: 100, writtenOff: 40, remainder: 999,
  }));
  assert.equal(it.remainder, 60);
});

test('кома як десятковий роздільник — українська локаль таблиці', () => {
  const [it] = parseStockItems(sheet({ id: 'Р-001', name: 'Пальне', received: '7,5', writtenOff: '2,5' }));
  assert.equal(it.received, 7.5);
  assert.equal(it.remainder, 5);
});

test('сміття в числовій клітинці — нуль, а не падіння', () => {
  const [it] = parseStockItems(sheet({ id: 'Р-001', name: 'Вода', received: 'десять', writtenOff: '' }));
  assert.equal(it.received, 0);
  assert.equal(it.remainder, 0);
});

test('списали більше, ніж прийняли, — залишок відʼємний, а не нуль', () => {
  // ховати це за нулем не можна: відʼємний залишок означає помилку в
  // записах, і побачити її має людина, а не застосунок
  const [it] = parseStockItems(sheet({ id: 'Р-001', name: 'Вода', received: 10, writtenOff: 15 }));
  assert.equal(it.remainder, -5);
});

/* ── розбір листа ──────────────────────────────────────────────────────── */

test('номер рядка вказує на справжній рядок таблиці', () => {
  const items = parseStockItems(sheet(
    { id: 'Р-001', name: 'Вода' },
    { id: 'Р-002', name: 'Крупа' },
  ));
  assert.deepEqual(items.map((x) => x.row), [2, 3]);
});

test('порожні рядки пропускаються, але не зсувають номери наступних', () => {
  const items = parseStockItems(sheet(
    { id: 'Р-001', name: 'Вода' },
    {},
    { id: 'Р-002', name: 'Крупа' },
  ));
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((x) => x.row), [2, 4]);
});

test('короткий рядок добивається порожніми — старий лист без нових колонок', () => {
  const short = ['Р-001', 'Вода', 'Вода питна'];
  const [it] = parseStockItems([STOCK_HEADERS, short]);
  assert.equal(it.accounting, '');
  assert.equal(it.notes, '');
  assert.equal(it.remainder, 0);
});

test('порожній лист і сам заголовок дають порожній перелік', () => {
  assert.deepEqual(parseStockItems([]), []);
  assert.deepEqual(parseStockItems([STOCK_HEADERS]), []);
  assert.deepEqual(parseStockItems(null), []);
});

test('пробіли по краях зрізаються, назва лишається як є', () => {
  const [it] = parseStockItems(sheet({ id: ' Р-001 ', place: ' Ангар ', name: '  Вода  ' }));
  assert.equal(it.id, 'Р-001');
  assert.equal(it.place, 'Ангар');
  assert.equal(it.name, '  Вода  ');
});

/* ── наступний ID ──────────────────────────────────────────────────────── */

test('nextId бере максимум, а не кількість рядків', () => {
  // після видалення позицій кількість менша за найбільший номер, і
  // рахунок від кількості видав би вже зайнятий ID
  assert.equal(nextId([{ id: 'Р-001' }, { id: 'Р-007' }]), 'Р-008');
});

test('nextId на порожньому складі — перший номер', () => {
  assert.equal(nextId([]), 'Р-001');
});

test('nextId не спотикається об ID без цифр', () => {
  assert.equal(nextId([{ id: 'без номера' }, { id: 'Р-003' }]), 'Р-004');
});

test('nextId доповнює до трьох знаків, але не ріже більші', () => {
  assert.equal(nextId([{ id: 'Р-999' }]), 'Р-1000');
});

/* ── рядок для запису ──────────────────────────────────────────────────── */

test('stockRow: залишок рахується, а не переписується з поля', () => {
  const r = stockRow({ id: 'Р-001', name: 'Вода', received: 100, writtenOff: 40, date: '20.08.2026' });
  assert.equal(r[C.remainder], 60);
  assert.equal(r[C.updated], '20.08.2026');
});

test('stockRow: рядок завширшки з заголовком — інакше колонки зсунуться', () => {
  const r = stockRow({ id: 'Р-001', name: 'Вода', date: '20.08.2026' });
  assert.equal(r.length, STOCK_HEADERS.length);
  assert.ok(r.every((v) => v !== undefined));
});

test('stockRow і parseStockItems читають однакові колонки', () => {
  // найдешевший спосіб зловити зсув: записати й одразу прочитати
  const r = stockRow({
    id: 'Р-004', category: 'Вода', name: 'Вода питна', description: 'каністри',
    unit: 'л', received: 100, writtenOff: 40, place: 'Ангар',
    notes: 'тримати сухим', accounting: 'Облікове', date: '20.08.2026',
  });
  const [it] = parseStockItems([STOCK_HEADERS, r]);
  assert.equal(it.id, 'Р-004');
  assert.equal(it.category, 'Вода');
  assert.equal(it.name, 'Вода питна');
  assert.equal(it.unit, 'л');
  assert.equal(it.received, 100);
  assert.equal(it.writtenOff, 40);
  assert.equal(it.remainder, 60);
  assert.equal(it.place, 'Ангар');
  assert.equal(it.notes, 'тримати сухим');
  assert.equal(it.accounting, 'Облікове');
});
