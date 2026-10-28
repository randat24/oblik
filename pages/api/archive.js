import { withAuth } from '../../lib/auth';
import { readSheet, writeCell, findColumns, todayStr, assertSheet } from '../../lib/sheets';

export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sheet, row, action } = req.body || {};
  if (!sheet || !row) return res.status(400).json({ error: 'Missing sheet or row' });
  assertSheet(sheet, 'items');

  const values = await readSheet(sheet);
  const headers = values[0] || [];
  const cols = findColumns(headers);
  const date = todayStr();

  if (action === 'restore') {
    const updates = [];
    if (cols.status >= 0) updates.push({ row, col: cols.status + 1, value: 'Склад' });
    if (cols.where >= 0) updates.push({ row, col: cols.where + 1, value: '' });
    if (cols.who >= 0) updates.push({ row, col: cols.who + 1, value: '' });
    if (cols.date >= 0) updates.push({ row, col: cols.date + 1, value: '' });
    if (updates.length) {
      await Promise.all(updates.map((u) => writeCell(sheet, u.row, u.col, u.value)));
    }
    return res.json({ ok: true });
  }

  const updates = [];
  if (cols.status >= 0) updates.push({ row, col: cols.status + 1, value: 'Списано' });
  if (cols.where >= 0) updates.push({ row, col: cols.where + 1, value: 'Архів' });
  if (cols.who >= 0) updates.push({ row, col: cols.who + 1, value: '' });
  if (cols.date >= 0) updates.push({ row, col: cols.date + 1, value: date });
  if (updates.length) {
    await Promise.all(updates.map((u) => writeCell(sheet, u.row, u.col, u.value)));
  }
  return res.json({ ok: true });
});
