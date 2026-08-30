/**
 * Звірка: розбір листа звірок і позицій.
 *
 * Колонки тут позиційні, а поруч стоять три числа з однаковим виглядом —
 * «підтверджено», «не знайдено», «розбіжності». Зсув на одну колонку не
 * ламає нічого видимого: звірка просто починає казати неправду про те,
 * скільки речей на місці.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAudits, parseAuditLines, nextAuditId,
  AUDIT_HEADERS, LINE_HEADERS, A, L, STATUS, RESULT,
} from '../lib/audit.js';

const mk = (headers, idx) => (fields = {}) => {
  const r = new Array(headers.length).fill('');
  Object.entries(fields).forEach(([key, value]) => {
    if (!(key in idx)) throw new Error(`Немає колонки «${key}»`);
    r[idx[key]] = value === null || value === undefined ? '' : String(value);
  });
  return r;
};

const auditRow = mk(AUDIT_HEADERS, A);
const lineRow = mk(LINE_HEADERS, L);
const audits = (...rows) => [AUDIT_HEADERS, ...rows.map(auditRow)];
const lines = (...rows) => [LINE_HEADERS, ...rows.map(lineRow)];

/* ── лист звірок ───────────────────────────────────────────────────────── */

test('числа звірки лягають у свої колонки, а не сусідні', () => {
  const [a] = parseAudits(audits({
    id: 'З-001', scope: 'Майно роти', status: STATUS.done,
    expected: 40, ok: 37, missing: 2, diff: 1,
  }));
  assert.equal(a.expected, 40);
  assert.equal(a.ok, 37);
  assert.equal(a.missing, 2);
  assert.equal(a.diff, 1);
});

test('рядки без ID — не звірки: у листі це залишки й порожнеча', () => {
  const list = parseAudits(audits(
    { id: 'З-001', scope: 'Майно роти' },
    { scope: 'щось без ID' },
    { id: 'З-002', scope: 'Склад' },
  ));
  assert.deepEqual(list.map((a) => a.id), ['З-001', 'З-002']);
});

test('номер рядка вказує на справжній рядок таблиці', () => {
  const list = parseAudits(audits({ id: 'З-001' }, { id: 'З-002' }));
  assert.deepEqual(list.map((a) => a.row), [2, 3]);
});

test('порожні числа — нулі, а не порожні рядки', () => {
  const [a] = parseAudits(audits({ id: 'З-001' }));
  assert.equal(a.expected, 0);
  assert.equal(a.ok, 0);
  assert.equal(a.missing, 0);
});

test('порожній лист і сам заголовок дають порожній перелік', () => {
  assert.deepEqual(parseAudits([]), []);
  assert.deepEqual(parseAudits([AUDIT_HEADERS]), []);
  assert.deepEqual(parseAudits(null), []);
});

/* ── позиції звірки ────────────────────────────────────────────────────── */

test('позиції фільтруються за звіркою, до якої належать', () => {
  const all = lines(
    { audit: 'З-001', name: 'Рація', result: RESULT.ok },
    { audit: 'З-002', name: 'Кабель', result: RESULT.missing },
    { audit: 'З-001', name: 'Ліхтар', result: RESULT.missing },
  );
  assert.deepEqual(parseAuditLines(all, 'З-001').map((l) => l.name), ['Рація', 'Ліхтар']);
  assert.deepEqual(parseAuditLines(all, 'З-002').map((l) => l.name), ['Кабель']);
});

test('без ID звірки віддаються всі позиції, які є', () => {
  const all = lines({ audit: 'З-001', name: 'Рація' }, { audit: 'З-002', name: 'Кабель' });
  assert.equal(parseAuditLines(all).length, 2);
});

test('позиція без ID звірки не належить нікому', () => {
  const all = lines({ name: 'Загублений рядок' }, { audit: 'З-001', name: 'Рація' });
  assert.deepEqual(parseAuditLines(all).map((l) => l.name), ['Рація']);
});

test('рядок листа — число: за ним потім знаходять саму позицію', () => {
  const [l] = parseAuditLines(lines({ audit: 'З-001', sheet: 'Майно роти', row: '17' }));
  assert.equal(l.row, 17);
  assert.equal(l.sheet, 'Майно роти');
});

test('причину «немає» зберігаємо як написали', () => {
  const [l] = parseAuditLines(lines({
    audit: 'З-001', name: 'Рація', result: RESULT.missing, note: 'видано на руки, Тигр',
  }));
  assert.equal(l.result, RESULT.missing);
  assert.equal(l.note, 'видано на руки, Тигр');
});

test('короткий рядок добивається порожніми', () => {
  const [l] = parseAuditLines([LINE_HEADERS, ['З-001', 'Майно роти', '2', 'Рація']]);
  assert.equal(l.name, 'Рація');
  assert.equal(l.result, '');
  assert.equal(l.note, '');
});

/* ── наступний номер звірки ────────────────────────────────────────────── */

test('nextAuditId бере максимум, а не кількість', () => {
  assert.equal(nextAuditId([{ id: 'З-001' }, { id: 'З-005' }]), 'З-006');
});

test('nextAuditId на порожньому переліку — перший номер', () => {
  assert.equal(nextAuditId([]), 'З-001');
});

test('nextAuditId не спотикається об ID без цифр', () => {
  assert.equal(nextAuditId([{ id: 'чернетка' }, { id: 'З-002' }]), 'З-003');
});
