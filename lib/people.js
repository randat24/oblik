import crypto from 'crypto';
import { readSheet, appendRow, writeCells, ensureSheet, writeRow, todayStr } from './sheets.js';

// Хто працює із застосунком. У таблиці лежить не PIN, а його відбиток:
// доступ до самої таблиці не має давати змоги зайти чужим позивним.
export const PEOPLE_SHEET = 'Люди';
export const PEOPLE_HEADERS = ['Позивний', 'Відбиток PIN', 'Роль', 'Активний', 'Додано'];

export const C = { callsign: 0, hash: 1, role: 2, active: 3, added: 4 };

export const ROLES = {
  admin: 'Адміністратор',
  user: 'Користувач',
};

let ensured = false;
async function ensurePeopleSheet() {
  if (ensured) return;
  await ensureSheet(PEOPLE_SHEET, PEOPLE_HEADERS);
  ensured = true;
}

function secret() {
  return process.env.SESSION_SECRET || 'change-me-in-env';
}

/** Відбиток PIN. Позивний у солі — однаковий PIN у двох людей дає різні відбитки */
export function hashPin(callsign, pin) {
  return crypto
    .createHmac('sha256', secret())
    .update(`${callsign.toLowerCase().trim()}:${pin}`)
    .digest('hex');
}

const truthy = (v) => {
  const s = (v ?? '').toString().trim().toLowerCase();
  return s === '' || s === 'так' || s === 'yes' || s === 'true' || s === '1' || s === '+';
};

export async function readPeople() {
  await ensurePeopleSheet();
  const values = await readSheet(PEOPLE_SHEET);

  if ((values[0] || []).length < PEOPLE_HEADERS.length) {
    await writeRow(PEOPLE_SHEET, 1, PEOPLE_HEADERS);
    values[0] = [...PEOPLE_HEADERS];
  }

  return (values.slice(1) || [])
    .map((raw, i) => {
      const row = [...(raw || [])];
      while (row.length < PEOPLE_HEADERS.length) row.push('');
      return {
        row: i + 2,
        callsign: (row[C.callsign] || '').toString().trim(),
        hash: (row[C.hash] || '').toString().trim(),
        role: (row[C.role] || '').toString().trim() === ROLES.admin ? 'admin' : 'user',
        active: truthy(row[C.active]),
        added: (row[C.added] || '').toString().trim(),
      };
    })
    .filter((p) => p.callsign);
}

export function findPerson(people, callsign) {
  const c = (callsign || '').toString().trim().toLowerCase();
  return people.find((p) => p.callsign.toLowerCase() === c) || null;
}

/** Перевіряє PIN. Повертає людину або null */
export function verifyPin(people, callsign, pin) {
  const person = findPerson(people, callsign);
  if (!person || !person.active || !person.hash) return null;
  const expected = hashPin(person.callsign, String(pin ?? ''));
  const a = Buffer.from(person.hash);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return person;
}

export async function addPerson({ callsign, pin, role = 'user' }) {
  await ensurePeopleSheet();
  const row = new Array(PEOPLE_HEADERS.length).fill('');
  row[C.callsign] = callsign;
  row[C.hash] = hashPin(callsign, pin);
  row[C.role] = ROLES[role] || ROLES.user;
  row[C.active] = 'так';
  row[C.added] = todayStr();
  await appendRow(PEOPLE_SHEET, row, { raw: true });
  return { callsign, role };
}

export async function updatePerson(row, { pin, role, active, callsign }) {
  await ensurePeopleSheet();
  const ups = [];
  if (pin) ups.push({ row, col: C.hash + 1, value: hashPin(callsign, pin) });
  if (role) ups.push({ row, col: C.role + 1, value: ROLES[role] || ROLES.user });
  if (active !== undefined) ups.push({ row, col: C.active + 1, value: active ? 'так' : 'ні' });
  if (ups.length) await writeCells(PEOPLE_SHEET, ups, { raw: true });
  return true;
}
