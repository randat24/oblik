import test from 'node:test';
import assert from 'node:assert/strict';
import {
  messageFrom, inboxRow, parseInbox, isDone, visibleInbox, INBOX_HEADERS, IC, MAX_TEXT,
} from '../lib/inbox.js';

test('межа списку не ховає старе неопрацьоване за новим опрацьованим', () => {
  const done = [{ id: 'd1', doneAt: 'x' }, { id: 'd2', doneAt: 'x' }];
  const list = visibleInbox([...done, { id: 'old' }], 1);
  assert.deepEqual(list.map((x) => x.id), ['old', 'd1']);
});

const m = { id: 'a', date: '02.11.2026', time: '10:00', text: 'привіт', from: 'Тест' };

test('порожнє повідомлення не приймається', () => {
  assert.ok(messageFrom({ text: '   ' }).error);
  assert.ok(messageFrom(undefined).error);
});

test('задовге повідомлення — відмова, а не обрізка', () => {
  assert.ok(messageFrom({ text: 'x'.repeat(MAX_TEXT + 1) }).error);
  assert.equal(messageFrom({ text: 'x'.repeat(MAX_TEXT) }).text.length, MAX_TEXT);
});

test('рядок листа читається назад без втрат', () => {
  const [got] = parseInbox([INBOX_HEADERS, inboxRow(m)]);
  assert.deepEqual({ ...got, row: undefined, doneBy: undefined, doneAt: undefined },
    { ...m, row: undefined, doneBy: undefined, doneAt: undefined });
});

test('порожній рядок у листі не зсуває номер наступного', () => {
  const [got] = parseInbox([INBOX_HEADERS, [], inboxRow(m)]);
  assert.equal(got.row, 3);
});

test('новіші повідомлення стоять зверху', () => {
  const list = parseInbox([INBOX_HEADERS, inboxRow(m), inboxRow({ ...m, id: 'b' })]);
  assert.deepEqual(list.map((x) => x.id), ['b', 'a']);
});

test('повідомлення зі спільного входу без імені теж вважається опрацьованим', () => {
  const r = inboxRow(m);
  r[IC.doneAt] = '02.11.2026 11:00';
  assert.equal(isDone(parseInbox([INBOX_HEADERS, r])[0]), true);
  assert.equal(isDone(parseInbox([INBOX_HEADERS, inboxRow(m)])[0]), false);
});
