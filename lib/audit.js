import {
  readSheet, appendRow, appendRows, writeCells, ensureSheet, writeRow, todayStr, fromSerial,
} from './sheets.js';
import { currentActor } from './auth.js';

// Звірка — це фіксація того, що річ бачили на власні очі.
// Сесія лежить в одному листі, а кожна перевірена позиція — в іншому,
// і пишеться одразу: телефон можна закрити й повернутися пізніше.
export const AUDIT_SHEET = 'Звірки';
export const LINES_SHEET = 'Звірка позицій';

export const AUDIT_HEADERS = [
  'ID', 'Розпочато', 'Час', 'Хто', 'Обсяг', 'Статус',
  'Очікувано', 'Підтверджено', 'Не знайдено', 'Розбіжності', 'Завершено', 'Примітка',
];

export const LINE_HEADERS = [
  'ID звірки', 'Лист', 'Рядок', 'Назва', 'Ідентифікатор',
  'Очікувано', 'Факт', 'Результат', 'Хто', 'Час', 'Примітка',
];

export const A = {
  id: 0, date: 1, time: 2, who: 3, scope: 4, status: 5,
  expected: 6, ok: 7, missing: 8, diff: 9, finished: 10, note: 11,
};

export const L = {
  audit: 0, sheet: 1, row: 2, name: 3, ident: 4,
  expected: 5, fact: 6, result: 7, who: 8, time: 9, note: 10,
};

export const STATUS = { open: 'Триває', done: 'Завершено', cancelled: 'Скасовано' };
export const RESULT = { ok: 'Є', missing: 'Немає', diff: 'Розбіжність' };

let ensured = false;
async function ensureSheets() {
  if (ensured) return;
  await ensureSheet(AUDIT_SHEET, AUDIT_HEADERS);
  await ensureSheet(LINES_SHEET, LINE_HEADERS);
  ensured = true;
}

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
};

function pad(values, len) {
  const row = [...(values || [])];
  while (row.length < len) row.push('');
  return row;
}

async function readWithHeaders(sheet, headers) {
  const values = await readSheet(sheet);
  if ((values[0] || []).length < headers.length) {
    await writeRow(sheet, 1, headers);
    values[0] = [...headers];
  }
  return values;
}

/*
 * Розбір рядків стоїть окремо від читання листа навмисно.
 *
 * Поки він жив усередині `readAudits`, перевірити його можна було лише
 * зі справжньою таблицею — тобто ніяк. А ламається саме він: колонки тут
 * позиційні, і зсув на одну перетворює «не знайдено» на «розбіжності».
 */
export function parseAudits(values) {
  return (values || [])
    .slice(1)
    .map((raw, i) => {
      const r = pad(raw, AUDIT_HEADERS.length);
      return {
        row: i + 2,
        id: str(r[A.id]),
        date: fromSerial(r[A.date]),
        time: fromSerial(r[A.time], 'time'),
        who: str(r[A.who]),
        scope: str(r[A.scope]),
        status: str(r[A.status]),
        expected: num(r[A.expected]),
        ok: num(r[A.ok]),
        missing: num(r[A.missing]),
        diff: num(r[A.diff]),
        finished: fromSerial(r[A.finished]),
        note: str(r[A.note]),
      };
    })
    .filter((a) => a.id);
}

/** Позиції звірки; без `auditId` — усі, які є в листі */
export function parseAuditLines(values, auditId) {
  return (values || [])
    .slice(1)
    .map((raw) => {
      const r = pad(raw, LINE_HEADERS.length);
      return {
        audit: str(r[L.audit]),
        sheet: str(r[L.sheet]),
        row: num(r[L.row]),
        name: str(r[L.name]),
        ident: str(r[L.ident]),
        expected: str(r[L.expected]),
        fact: str(r[L.fact]),
        result: str(r[L.result]),
        who: str(r[L.who]),
        time: fromSerial(r[L.time], 'time'),
        note: str(r[L.note]),
      };
    })
    .filter((l) => l.audit && (!auditId || l.audit === auditId));
}

export async function readAudits() {
  await ensureSheets();
  return parseAudits(await readWithHeaders(AUDIT_SHEET, AUDIT_HEADERS));
}

export async function readLines(auditId) {
  await ensureSheets();
  return parseAuditLines(await readWithHeaders(LINES_SHEET, LINE_HEADERS), auditId);
}

export function nextAuditId(audits) {
  let max = 0;
  audits.forEach((a) => {
    const n = parseInt(String(a.id).replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return 'З-' + String(max + 1).padStart(3, '0');
}

function kyivTime() {
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

export async function startAudit({ scope, expected }) {
  await ensureSheets();
  const audits = await readAudits();
  const id = nextAuditId(audits);

  const row = new Array(AUDIT_HEADERS.length).fill('');
  row[A.id] = id;
  row[A.date] = todayStr();
  row[A.time] = kyivTime();
  row[A.who] = currentActor() || 'спільний вхід';
  row[A.scope] = scope;
  row[A.status] = STATUS.open;
  row[A.expected] = expected;
  row[A.ok] = 0;
  row[A.missing] = 0;
  row[A.diff] = 0;

  await appendRow(AUDIT_SHEET, row, { raw: true });
  return id;
}

/** Позначки пишемо пачкою: на обході їх багато, а квота на записи не безмежна */
export async function addLines(auditId, lines) {
  await ensureSheets();
  const who = currentActor() || 'спільний вхід';
  const time = kyivTime();
  const rows = lines.map((l) => {
    const row = new Array(LINE_HEADERS.length).fill('');
    row[L.audit] = auditId;
    row[L.sheet] = l.sheet || '';
    row[L.row] = l.row || '';
    row[L.name] = l.name || '';
    row[L.ident] = l.ident || '';
    row[L.expected] = l.expected ?? '';
    row[L.fact] = l.fact ?? '';
    row[L.result] = l.result || '';
    row[L.who] = who;
    row[L.time] = time;
    row[L.note] = l.note || '';
    return row;
  });
  if (rows.length) await appendRows(LINES_SHEET, rows, { raw: true });
  return rows.length;
}

export async function updateAudit(row, patch) {
  await ensureSheets();
  const ups = [];
  const set = (col, value) => ups.push({ row, col: col + 1, value });
  if (patch.status !== undefined) set(A.status, patch.status);
  if (patch.ok !== undefined) set(A.ok, patch.ok);
  if (patch.missing !== undefined) set(A.missing, patch.missing);
  if (patch.diff !== undefined) set(A.diff, patch.diff);
  if (patch.finished !== undefined) set(A.finished, patch.finished);
  if (patch.note !== undefined) set(A.note, patch.note);
  if (ups.length) await writeCells(AUDIT_SHEET, ups, { raw: true });
  return true;
}
