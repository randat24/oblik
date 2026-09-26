import test from 'node:test';
import assert from 'node:assert/strict';

import { LOG_HEADERS, cut, logRow, parseLog } from '../lib/log.js';

/**
 * Журнал змін — те, заради чого застосунок узагалі писали замість
 * Apps Script: хто, коли і що саме змінив. Доти тут не було тестів,
 * при тому що порядок колонок у ньому позиційний.
 *
 * Зсунути його можна однією комою, і журнал після цього не падає —
 * він просто пише час у колонку «Лист», а хто саме змінив, опиняється
 * у «Фото». У роботі таке помічають через місяці, коли по журналу вже
 * щось з'ясовують.
 */

const stamp = { date: '20.09.2026', time: '14:30:05', actor: 'Сокіл' };

/* ── рядок журналу ─────────────────────────────────────────────────────── */

test('рядок лягає рівно під заголовки', () => {
  const r = logRow({
    sheet: 'ПНВ', row: 12, action: 'Видано', field: 'У кого',
    before: 'КСП', after: 'Тінь', photo: 'photo-id',
  }, stamp);

  assert.equal(r.length, LOG_HEADERS.length, 'колонок стільки ж, скільки заголовків');
  const named = Object.fromEntries(LOG_HEADERS.map((h, i) => [h, r[i]]));
  assert.deepEqual(named, {
    'Дата': '20.09.2026',
    'Час': '14:30:05',
    'Лист': 'ПНВ',
    'Рядок': 12,
    'Дія': 'Видано',
    'Поле': 'У кого',
    'Було': 'КСП',
    'Стало': 'Тінь',
    'Фото': 'photo-id',
    'Хто': 'Сокіл',
  });
});

test('хто саме: позивний із сесії, потім названий, і аж тоді спільний вхід', () => {
  const who = (entry, s) => logRow(entry, s)[LOG_HEADERS.indexOf('Хто')];
  assert.equal(who({ who: 'Граф' }, stamp), 'Сокіл', 'сесія важливіша за назване');
  assert.equal(who({ who: 'Граф' }, { ...stamp, actor: '' }), 'Граф');
  assert.equal(who({}, { ...stamp, actor: '' }), 'спільний вхід');
});

test('порожні поля не стають «undefined» у таблиці', () => {
  const r = logRow({ action: 'Вхід' }, stamp);
  assert.equal(r[LOG_HEADERS.indexOf('Лист')], '');
  assert.equal(r[LOG_HEADERS.indexOf('Рядок')], '');
  assert.ok(r.every((v) => v !== undefined && v !== null));
});

/* ── довгі значення ────────────────────────────────────────────────────── */

test('довге ріжеться так, щоб було видно, що різали', () => {
  const s = cut('я'.repeat(500));
  assert.ok(s.length <= 200, `лишилось ${s.length} — клітинка має межу`);
  assert.ok(s.endsWith('…'), 'крапки кажуть, що це не все');
  assert.ok(s.startsWith('яяя'), 'початок зберігається — саме його й читають');
});

test('коротке лишається недоторканим', () => {
  assert.equal(cut('КСП'), 'КСП');
  assert.equal(cut('я'.repeat(200)).length, 200, 'рівно межа ще не ріжеться');
  assert.equal(cut(''), '');
  assert.equal(cut(null), '');
  assert.equal(cut(undefined), '');
  assert.equal(cut(0), '0', 'нуль — це значення, а не порожнеча');
});

test('довге в журналі ріжеться саме — і «було», і «стало»', () => {
  const r = logRow({ before: 'a'.repeat(300), after: 'b'.repeat(300) }, stamp);
  assert.ok(r[LOG_HEADERS.indexOf('Було')].endsWith('…'));
  assert.ok(r[LOG_HEADERS.indexOf('Стало')].endsWith('…'));
  assert.ok(r[LOG_HEADERS.indexOf('Було')].length <= 200);
});

/* ── читання журналу ───────────────────────────────────────────────────── */

const sheet = (...rows) => [LOG_HEADERS, ...rows];

test('найновіші зверху — журнал читають з кінця', () => {
  const got = parseLog(sheet(
    ['01.09.2026', '10:00:00', 'ПНВ', 1, 'Видано'],
    ['02.09.2026', '11:00:00', 'ПНВ', 2, 'Прийнято'],
    ['03.09.2026', '12:00:00', 'ПНВ', 3, 'Списано'],
  ));
  assert.deepEqual(got.map((e) => e.action), ['Списано', 'Прийнято', 'Видано']);
});

test('номер рядка вказує на справжній рядок таблиці', () => {
  const got = parseLog(sheet(
    ['01.09.2026', '10:00:00', 'ПНВ', 1, 'Видано'],
    ['02.09.2026', '11:00:00', 'ПНВ', 2, 'Прийнято'],
  ));
  // найновіший — другий рядок даних, тобто третій у листі
  assert.equal(got[0].row, 3);
  assert.equal(got[1].row, 2);
});

test('обмеження лишає найсвіжіші, а не перші-ліпші', () => {
  const rows = Array.from({ length: 10 }, (_, i) =>
    [`0${i + 1}.09.2026`, '10:00:00', 'ПНВ', i, `Дія ${i}`]);
  const got = parseLog(sheet(...rows), 3);
  assert.equal(got.length, 3);
  assert.deepEqual(got.map((e) => e.action), ['Дія 9', 'Дія 8', 'Дія 7']);
});

test('старий рядок без колонки «Хто» читається, а не ламає розбір', () => {
  // лист, створений до появи десятої колонки
  const got = parseLog(sheet(['01.09.2026', '10:00:00', 'ПНВ', 1, 'Видано']));
  assert.equal(got.length, 1);
  assert.equal(got[0].by, '', 'хто саме — невідомо, і це видно');
  assert.equal(got[0].photo, '');
});

test('порожні рядки не потрапляють у журнал', () => {
  const got = parseLog(sheet(
    ['01.09.2026', '10:00:00', 'ПНВ', 1, 'Видано'],
    ['', '', '', '', ''],
    [],
  ));
  assert.equal(got.length, 1);
});

test('лист без записів і сміття замість листа', () => {
  assert.deepEqual(parseLog(sheet()), []);
  assert.deepEqual(parseLog([]), []);
  assert.deepEqual(parseLog(null), []);
});

test('дата з таблиці числом стає датою, а не числом', () => {
  // 46254 — те, як Google Таблиці віддають 20.08.2026
  const got = parseLog(sheet([46254, 0.5, 'ПНВ', 1, 'Видано']));
  assert.match(got[0].date, /^\d{2}\.\d{2}\.\d{4}$/);
  assert.match(got[0].time, /^\d{2}:\d{2}/);
});
