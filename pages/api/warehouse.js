import { withAuth } from '../../lib/auth';
import {
  readSheet,
  writeCell,
  appendRow,
  deleteRow,
  insertRowAt,
  todayStr,
  WAREHOUSE_PRIORITIES,
  WAREHOUSE_STATUS_OPTIONS,
} from '../../lib/sheets';
import { logChange } from '../../lib/log';

const FIELD_LABELS = {
  code: 'Код', priority: 'Пріоритет', name: 'Назва', contents: 'Вміст',
  location: 'Розташування', photoUrl: 'Фото', status: 'Статус',
  checkedDate: 'Перевірено', notes: 'Примітки',
};

const SHEET = 'Склад';

// 0-based індекси колонок листа "Склад"
const COLS = {
  code: 0,
  priority: 1,
  name: 2,
  contents: 3,
  location: 4,
  photoUrl: 5,
  status: 6,
  checkedDate: 7,
  notes: 8,
};
const FIELD_ORDER = ['code', 'priority', 'name', 'contents', 'location', 'photoUrl', 'status', 'checkedDate', 'notes'];

function parseItems(values) {
  if (!values || values.length < 2) return [];
  const rows = values.slice(1);
  const items = [];
  rows.forEach((rawRow, i) => {
    const row = [...rawRow];
    while (row.length < 9) row.push('');
    if (row.join('').trim() === '') return;
    items.push({
      row: i + 2,
      code: (row[COLS.code] || '').toString(),
      priority: (row[COLS.priority] || '').toString().trim(),
      name: (row[COLS.name] || '').toString(),
      contents: (row[COLS.contents] || '').toString(),
      location: (row[COLS.location] || '').toString(),
      photoUrl: (row[COLS.photoUrl] || '').toString(),
      status: (row[COLS.status] || '').toString(),
      checkedDate: (row[COLS.checkedDate] || '').toString(),
      notes: (row[COLS.notes] || '').toString(),
    });
  });
  return items;
}

function nextCode(items) {
  const taken = new Set(items.map((it) => it.code));
  let max = 0;
  items.forEach((it) => {
    const n = parseInt(String(it.code).replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  let n = max + 1;
  let candidate;
  do {
    candidate = String(n).padStart(3, '0');
    n++;
  } while (taken.has(candidate) && n < 10000);
  return candidate;
}

export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    const values = await readSheet(SHEET);
    return res.json({
      items: parseItems(values),
      priorities: WAREHOUSE_PRIORITIES,
      statusOptions: WAREHOUSE_STATUS_OPTIONS,
    });
  }

  if (req.method === 'POST') {
    if (req.body.action === 'restore') {
      const { row, values: rowValues } = req.body;
      await insertRowAt(SHEET, row, rowValues);
      await logChange({ sheet: SHEET, row, action: 'Відновлення', after: (rowValues || []).join(' | ') });
      const restored = await readSheet(SHEET);
      return res.json({ items: parseItems(restored) });
    }

    const { priority, name, contents, location, notes, photoUrl } = req.body;
    if (!name) return res.status(400).json({ error: 'Не вказано назву' });

    const values = await readSheet(SHEET);
    const items = parseItems(values);
    const code = nextCode(items);

    const row = new Array(9).fill('');
    row[COLS.code] = code;
    row[COLS.priority] = priority || '3';
    row[COLS.name] = name;
    row[COLS.contents] = contents || '';
    row[COLS.location] = location || '';
    row[COLS.photoUrl] = photoUrl || '';
    row[COLS.status] = 'На складі';
    row[COLS.checkedDate] = todayStr();
    row[COLS.notes] = notes || '';

    await appendRow(SHEET, row);
    await logChange({ sheet: SHEET, action: 'Додано ящик', field: 'Код', after: `${code} — ${name}` });
    const updated = await readSheet(SHEET);
    return res.json({ items: parseItems(updated), code });
  }

  if (req.method === 'PATCH') {
    const { row, field, value, prev } = req.body;
    const idx = COLS[field];
    if (idx === undefined) return res.status(400).json({ error: `Невідоме поле: ${field}` });
    await writeCell(SHEET, row, idx + 1, value);
    await logChange({
      sheet: SHEET, row, action: 'Редагування',
      field: FIELD_LABELS[field] || field, before: prev, after: value,
    });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { row } = req.body;

    // зберігаємо рядок, щоб можна було скасувати видалення
    const before = await readSheet(SHEET);
    const deleted = before[row - 1] || [];

    await deleteRow(SHEET, row);
    await logChange({ sheet: SHEET, row, action: 'Видалено ящик', before: deleted.join(' | ') });
    const updated = await readSheet(SHEET);
    return res.json({ items: parseItems(updated), deleted });
  }

  res.status(405).json({ error: 'Method not allowed' });
});
