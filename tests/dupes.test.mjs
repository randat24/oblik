import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSn, findDupes, dupeCount, sameSn, sameId, snOf, dupeLabel, crossDupes,
} from '../lib/dupes.js';

/* Лист, схожий на справжній: №, назва, S/N, статус, у кого, дата, примітка */
const COLS = { id: 0, name: 1, snCols: [0, 2], status: 3, who: 4, date: 5, note: 6 };
const it = (row, values) => ({ row, values });

/* ---------- Серійник ---------- */

test('серійник порівнюємо без пробілів, дефісів і регістру', () => {
  assert.equal(normalizeSn('  807-lyh 4536 '), '807LYH4536');
  assert.equal(normalizeSn('807LYH4536'), '807LYH4536');
});

test('підпис «S/N» усередині клітинки лишається частиною значення', () => {
  // прибирати його було б здогадкою: серійник, що справді починається з
  // «SN», став би тоді тим самим, що й просто цифри
  assert.equal(normalizeSn('S/N 807LYH4536'), 'SN807LYH4536');
  assert.notEqual(normalizeSn('S/N 807LYH4536'), normalizeSn('807LYH4536'));
});

test('кирилиця, що виглядає як латиниця, зводиться до латиниці', () => {
  // саме так повтор і ховається: очі бачать однакове, програма — ні
  assert.equal(normalizeSn('807LУН4536'), normalizeSn('807LYH4536'));
  assert.equal(normalizeSn('МТ-0099'), 'MT0099');
  assert.equal(normalizeSn('ВОС'), 'BOC');
});

test('літеру «О» до нуля не зводимо — це склеїло б різні речі', () => {
  assert.notEqual(normalizeSn('O100'), normalizeSn('0100'));
});

test('порожній серійник дає порожній ключ, а не збіг', () => {
  assert.equal(normalizeSn(''), '');
  assert.equal(normalizeSn(null), '');
  assert.equal(normalizeSn('   '), '');
});

/* ---------- Пошук повторів ---------- */

test('однакових рядків немає — немає й груп', () => {
  const groups = findDupes([
    it(2, ['84', 'DP4400e', 'LT-0042', 'КСП', '', '', '']),
    it(3, ['85', 'DP4400e', 'LT-0043', 'КСП', '', '', '']),
  ], COLS);
  assert.deepEqual(groups, []);
  assert.equal(dupeCount(groups), 0);
});

test('дубль із черги офлайну — увесь рядок однаковий', () => {
  const row = ['84', 'DP4400e', 'LT-0042', 'КСП', '', '18.09.2026', ''];
  const groups = findDupes([it(2, [...row]), it(3, [...row])], COLS);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'all');
  assert.deepEqual(groups[0].rows, [2, 3]);
});

test('примітка не робить рядок іншим', () => {
  // той самий запис, до якого хтось дописав «антена на скотчі»,
  // лишається тим самим записом
  const groups = findDupes([
    it(2, ['84', 'DP4400e', 'LT-0042', 'КСП', '', '18.09.2026', '']),
    it(3, ['84', 'DP4400e', 'LT-0042', 'КСП', '', '18.09.2026', 'антена на скотчі']),
  ], COLS);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'all');
});

test('різна дата чи отримувач — це історія речі, а не дубль рядка', () => {
  const groups = findDupes([
    it(2, ['84', 'DP4400e', 'LT-0042', 'Видано', 'Максим Д.', '18.09.2026', '']),
    it(3, ['85', 'DP4400e', 'LT-0043', 'КСП', '', '19.09.2026', '']),
  ], COLS);
  assert.deepEqual(groups, []);
});

test('однаковий серійник — повтор навіть за різних статусів', () => {
  const groups = findDupes([
    it(2, ['84', 'DP4400e', 'LT-0042', 'Видано', 'Максим Д.', '18.09.2026', '']),
    it(3, ['91', 'Motorola', 'lt 0042', 'КСП', '', '20.09.2026', '']),
  ], COLS);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'sn');
  assert.equal(groups[0].value, 'LT-0042', 'показуємо як написано в таблиці');
  assert.deepEqual(groups[0].rows, [2, 3]);
});

test('однаковий власний номер — теж повтор', () => {
  const groups = findDupes([
    it(2, ['84', 'DP4400e', 'LT-0042', 'КСП', '', '', '']),
    it(3, ['84', 'Motorola', 'MT-0099', 'КСП', '', '', '']),
  ], COLS);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'id');
  assert.equal(groups[0].value, '84');
});

test('однакова назва повтором не вважається', () => {
  // десять однакових радейок — це десять рядків з однією назвою
  const groups = findDupes([
    it(2, ['84', 'DP4400e', 'LT-0042', 'КСП', '', '', '']),
    it(3, ['85', 'DP4400e', 'LT-0043', 'КСП', '', '', '']),
    it(4, ['86', 'DP4400e', 'LT-0044', 'КСП', '', '', '']),
  ], COLS);
  assert.deepEqual(groups, []);
});

test('порожній серійник не збирає всі безномерні речі в одну купу', () => {
  const groups = findDupes([
    it(2, ['84', 'Ліхтар', '', 'КСП', '', '', '']),
    it(3, ['85', 'Ніж', '', 'КСП', '', '', '']),
  ], COLS);
  assert.deepEqual(groups, []);
});

test('порожні рядки повторами не вважаємо', () => {
  const groups = findDupes([
    it(2, ['', '', '', '', '', '', '']),
    it(3, ['', '', '', '', '', '', '']),
  ], COLS);
  assert.deepEqual(groups, []);
});

test('рядок потрапляє щонайбільше в одну групу', () => {
  // цілком однакові рядки мають і однаковий серійник, і однаковий номер;
  // казати про них тричі — те саме трьома словами
  const row = ['84', 'DP4400e', 'LT-0042', 'КСП', '', '', ''];
  const groups = findDupes([it(2, [...row]), it(3, [...row])], COLS);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'all');
});

test('три однакові дають одну групу й два зайві рядки', () => {
  const row = ['84', 'DP4400e', 'LT-0042', 'КСП', '', '', ''];
  const groups = findDupes([it(2, [...row]), it(3, [...row]), it(4, [...row])], COLS);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rows.length, 3);
  assert.equal(dupeCount(groups), 2, 'рахуємо зайві рядки, а не групи');
});

test('кілька різних повторів у листі — кілька груп', () => {
  const groups = findDupes([
    it(2, ['84', 'DP4400e', 'LT-0042', 'КСП', '', '', '']),
    it(3, ['91', 'Motorola', 'LT-0042', 'Видано', 'Максим Д.', '', '']),
    it(4, ['77', 'EcoFlow', 'PW-0018', 'КСП', '', '', '']),
    it(5, ['77', 'Ліхтар', 'FL-0001', 'КСП', '', '', '']),
  ], COLS);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.kind), ['sn', 'id']);
  assert.equal(dupeCount(groups), 2);
});

/* ---------- Колонка серійника ---------- */

test('серійник — це не власний номер, хоч обидва схожі на номер', () => {
  assert.equal(snOf(COLS), 2);
});

test('листа без серійника теж вистачає', () => {
  const cols = { id: 0, name: 1, snCols: [0] };
  assert.equal(snOf(cols), -1);
  const groups = findDupes([
    it(2, ['84', 'DP4400e']),
    it(3, ['84', 'Motorola']),
  ], cols);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'id');
});

/* ---------- Попередження в мить вводу ---------- */

test('той самий серійник в іншому рядку — знаходимо', () => {
  const items = [
    it(2, ['84', 'DP4400e', 'LT-0042', 'КСП', '', '', '']),
    it(3, ['85', 'Motorola', 'MT-0099', 'КСП', '', '', '']),
  ];
  assert.deepEqual(sameSn(items, COLS, 'lt 0042').map((x) => x.row), [2]);
});

test('поле не лається саме на себе', () => {
  const items = [it(2, ['84', 'DP4400e', 'LT-0042', 'КСП', '', '', ''])];
  assert.deepEqual(sameSn(items, COLS, 'LT-0042', 2), []);
});

test('порожнє значення нічого не знаходить', () => {
  const items = [it(2, ['84', 'DP4400e', '', 'КСП', '', '', ''])];
  assert.deepEqual(sameSn(items, COLS, ''), []);
  assert.deepEqual(sameId(items, COLS, '  '), []);
});

test('власний номер перевіряється так само', () => {
  const items = [
    it(2, ['84', 'DP4400e', 'LT-0042', 'КСП', '', '', '']),
    it(3, ['85', 'Motorola', 'MT-0099', 'КСП', '', '', '']),
  ];
  assert.deepEqual(sameId(items, COLS, ' 85 ').map((x) => x.row), [3]);
  assert.deepEqual(sameId(items, COLS, '85', 3), []);
});

/* ---------- Підпис ---------- */

test('підпис групи зрозумілий без коду', () => {
  assert.equal(dupeLabel({ kind: 'all' }), 'однаковий рядок');
  assert.equal(dupeLabel({ kind: 'sn', value: 'LT-0042' }), 'S/N LT-0042');
  assert.equal(dupeLabel({ kind: 'id', value: '84' }), '№ 84');
  assert.equal(dupeLabel(null), '');
});

/* ---------- Повтори між листами ---------- */

const sheet = (name, rows) => ({
  name, cols: COLS,
  items: rows.map((values, i) => ({ row: i + 2, values })),
});

test('той самий серійник у двох листах — повтор між листами', () => {
  const out = crossDupes([
    sheet('Радейки', [['1', 'DP4400e', 'LT-0042', 'КСП', '', '', '']]),
    sheet('Кропива', [['1', 'DP4400e', 'lt 0042', 'Видано', 'Максим Д.', '', '']]),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].sn, 'LT-0042');
  assert.deepEqual(out[0].sheets, ['Радейки', 'Кропива']);
  assert.deepEqual(out[0].places.map((p) => p.row), [2, 2]);
});

test('власний номер між листами повтором не вважаємо', () => {
  // нумерація в кожному листі своя: «№ 1» у радейках і «№ 1» у ПНВ —
  // це різні речі
  const out = crossDupes([
    sheet('Радейки', [['1', 'DP4400e', 'LT-0042', 'КСП', '', '', '']]),
    sheet('ПНВ', [['1', 'PVS-14', 'NV-0007', 'КСП', '', '', '']]),
  ]);
  assert.deepEqual(out, []);
});

test('два рядки в одному листі сюди не потрапляють', () => {
  // це звичайний повтор, і його видно на сторінці самого листа
  const out = crossDupes([
    sheet('Радейки', [
      ['1', 'DP4400e', 'LT-0042', 'КСП', '', '', ''],
      ['2', 'DP4400e', 'LT-0042', 'КСП', '', '', ''],
    ]),
  ]);
  assert.deepEqual(out, []);
});

test('кирилиця-двійник ловиться й між листами', () => {
  const out = crossDupes([
    sheet('Радейки', [['1', 'Motorola', 'MT-0099', 'КСП', '', '', '']]),
    sheet('Кропива', [['1', 'Моторола', 'МТ-0099', 'КСП', '', '', '']]),
  ]);
  assert.equal(out.length, 1);
});

test('що розповзлося ширше — показуємо першим', () => {
  const out = crossDupes([
    sheet('А', [['1', 'X', 'AA-1', '', '', '', ''], ['2', 'Y', 'BB-2', '', '', '', '']]),
    sheet('Б', [['1', 'X', 'AA-1', '', '', '', ''], ['2', 'Y', 'BB-2', '', '', '', '']]),
    sheet('В', [['1', 'X', 'AA-1', '', '', '', '']]),
  ]);
  assert.equal(out[0].sn, 'AA-1');
  assert.equal(out[0].sheets.length, 3);
  assert.equal(out[1].sheets.length, 2);
});

test('порожній серійник не зводить різні листи докупи', () => {
  const out = crossDupes([
    sheet('Радейки', [['1', 'Ліхтар', '', 'КСП', '', '', '']]),
    sheet('Кропива', [['1', 'Ніж', '', 'КСП', '', '', '']]),
  ]);
  assert.deepEqual(out, []);
});

test('лист без колонки серійника просто пропускаємо', () => {
  const out = crossDupes([
    { name: 'Без номерів', cols: { id: 0, name: 1, snCols: [0] }, items: [{ row: 2, values: ['1', 'X'] }] },
    sheet('Радейки', [['1', 'X', 'LT-0042', '', '', '', '']]),
  ]);
  assert.deepEqual(out, []);
});

test('порожній перелік листів не ламає пошук', () => {
  assert.deepEqual(crossDupes([]), []);
  assert.deepEqual(crossDupes(undefined), []);
});

/* ---------- Рішення «це різні речі» ---------- */
import { dismissedKeys, withoutDismissed } from '../lib/dupes.js';

test('розглянуті ключі читаються з першої колонки, заголовок пропускається', () => {
  const keys = dismissedKeys([['Ключ', 'Серійник'], ['ABC123', 'abc-123'], [''], ['XYZ9', 'x']]);
  assert.deepEqual([...keys].sort(), ['ABC123', 'XYZ9']);
  assert.equal(dismissedKeys([]).size, 0);
  assert.equal(dismissedKeys(null).size, 0);
});

test('розглянута група зникає зі списку, решта лишається', () => {
  const groups = [{ key: 'A1' }, { key: 'B2' }];
  assert.deepEqual(withoutDismissed(groups, new Set(['A1'])), [{ key: 'B2' }]);
  assert.equal(withoutDismissed(groups, new Set()).length, 2);
  assert.equal(withoutDismissed(groups, null).length, 2);
});

test('порожній рядок посеред листа не зсуває номери в повторах між листами', () => {
  const mk = (name, rows) => ({
    name, cols: { name: 0, snCols: [1] },
    items: rows.map((r, i) => ({ row: i + 2, values: r })),
  });
  const g = crossDupes([
    mk('А', [['a', 'S1'], ['', ''], ['c', 'S2']]),
    mk('Б', [['x', 'S2']]),
  ]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].places.map((p) => [p.sheet, p.row]), [['А', 4], ['Б', 2]]);
});
