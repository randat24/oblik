import test from 'node:test';
import assert from 'node:assert/strict';

import { changedOnly, mergeMarks, isEmptyPatch } from '../lib/patch.js';

/*
 * Той самий випадок, заради якого це написано: два пристрої й один лист.
 * Перевіряємо не функції окремо, а що з них разом виходить правильна
 * поведінка — бо кожна поодинці нічого не рятує.
 */

test('changedOnly лишає тільки те, що справді змінилось', () => {
  const was = { var: { state: 'known' }, fn: { state: '' } };
  const next = { var: { state: 'known' }, fn: { state: 'learning' } };
  assert.deepEqual(changedOnly(was, next), { fn: { state: 'learning' } });
});

test('changedOnly бачить новий запис', () => {
  assert.deepEqual(changedOnly({}, { git: { state: 'learning' } }), { git: { state: 'learning' } });
});

test('changedOnly не рахує зміною те, що не мінялось', () => {
  const same = { var: { state: 'known', date: '28.08.2026' } };
  assert.deepEqual(changedOnly(same, { ...same }), {});
});

test('changedOnly не вигадує видалень', () => {
  // листи тут нічого не стирають: зникле означає «не знаю про нього»
  assert.deepEqual(changedOnly({ var: { state: 'known' } }, {}), {});
});

test('changedOnly не падає на порожньому й відсутньому', () => {
  assert.deepEqual(changedOnly(null, null), {});
  assert.deepEqual(changedOnly(undefined, { a: 1 }), { a: 1 });
  assert.deepEqual(changedOnly({ a: 1 }, undefined), {});
});

test('mergeMarks накладає прислане на наявне', () => {
  const cur = { var: { state: 'known' }, fn: { state: '' } };
  const got = mergeMarks(cur, { fn: { state: 'learning' } });
  assert.deepEqual(got, { var: { state: 'known' }, fn: { state: 'learning' } });
});

test('mergeMarks не чіпає того, чого немає в посилці', () => {
  const cur = { a: 1, b: 2, c: 3 };
  assert.deepEqual(mergeMarks(cur, { b: 20 }), { a: 1, b: 20, c: 3 });
});

test('mergeMarks не падає на порожньому', () => {
  assert.deepEqual(mergeMarks(null, null), {});
  assert.deepEqual(mergeMarks({ a: 1 }, null), { a: 1 });
  assert.deepEqual(mergeMarks(null, { a: 1 }), { a: 1 });
});

test('isEmptyPatch: порожню посилку не варто писати', () => {
  assert.equal(isEmptyPatch({}), true);
  assert.equal(isEmptyPatch(null), true);
  assert.equal(isEmptyPatch(undefined), true);
  assert.equal(isEmptyPatch({ a: 1 }), false);
});

/* ── те, заради чого все ─────────────────────────────────────────────── */

test('відмітки з другого пристрою не зникають', () => {
  /*
   * Телефон завантажив стан уранці, компʼютер увечері відмітив своє.
   * Потім телефон зберігає. Раніше це стирало вечірнє; тепер має вижити
   * і те, і те.
   */
  const вранці = { var: { state: 'known' } };

  // на компʼютері зʼявилось своє, телефон про це не знає
  const уЛисті = { var: { state: 'known' }, git: { state: 'learning' } };

  // телефон відмічає ще одне, спираючись на свій ранковий стан
  const наТелефоні = { ...вранці, fn: { state: 'learning' } };
  const посилка = changedOnly(вранці, наТелефоні);
  assert.deepEqual(посилка, { fn: { state: 'learning' } }, 'у посилку йде лише нове');

  const стало = mergeMarks(уЛисті, посилка);
  assert.equal(стало.git.state, 'learning', 'відмітка з компʼютера мала вціліти');
  assert.equal(стало.fn.state, 'learning', 'відмітка з телефона мала записатись');
  assert.equal(стало.var.state, 'known', 'старе лишилось на місці');
});

test('без відсіювання змінених накладання не рятує', () => {
  // саме тому лікується з двох боків: якби браузер слав увесь свій стан,
  // застаріле перекрило б свіже навіть із накладанням
  const уЛисті = { var: { state: 'known' }, git: { state: 'learning' } };
  const весьСтанТелефона = { var: { state: 'known' }, git: { state: '' } };
  const наївно = mergeMarks(уЛисті, весьСтанТелефона);
  assert.equal(наївно.git.state, '', 'показує саме ту втрату, від якої лікуємось');
});
