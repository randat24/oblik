/**
 * Єдиний код, що говорить із листом «Вхідні — Signal».
 *
 * Текст пишемо в режимі RAW: чуже повідомлення, що починається з «=», не має
 * стати формулою. Лист навмисно не входить у SHEET_CONFIGS: звичайні маршрути
 * таблиць його не бачать.
 */

import { readSheet, appendRow, ensureSheet, writeCells } from './sheets.js';
import { INBOX_SHEET, INBOX_HEADERS, IC, inboxRow, parseInbox } from './inbox.js';
import { kyivParts } from './log.js';

/* Перевірка смикає метадані таблиці, а квота на читання мала */
let ready = false;
async function ensureAll() {
  if (ready) return;
  await ensureSheet(INBOX_SHEET, INBOX_HEADERS);
  ready = true;
}

export const newId = () => `in${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function readInbox() {
  await ensureAll();
  return parseInbox(await readSheet(INBOX_SHEET));
}

export async function addMessage({ text, from }) {
  await ensureAll();
  const { date, time } = kyivParts();
  const m = { id: newId(), date, time, text, from };
  await appendRow(INBOX_SHEET, inboxRow(m), { raw: true });
  return m;
}

export async function markDone(row, who) {
  const { date, time } = kyivParts();
  await writeCells(INBOX_SHEET, [
    { row, col: IC.doneBy + 1, value: who || '' },
    { row, col: IC.doneAt + 1, value: `${date} ${time}` },
  ], { raw: true });
}
