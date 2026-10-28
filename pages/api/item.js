import { withAuth } from '../../lib/auth';
import {
  SHEET_CONFIGS,
  readSheet,
  writeCell,
  writeCells,
  appendRow,
  deleteRow,
  findColumns,
  todayStr,
  assertSheet,
} from '../../lib/sheets';

export default withAuth(async (req, res) => {
  assertSheet(req.body?.sheet, 'items');

  if (req.method === 'PATCH') {
    const { sheet, row, col, value } = req.body;
    await writeCell(sheet, row, col + 1, value);
    return res.json({ ok: true });
  }

  if (req.method === 'POST') {
    const { sheet, values, action } = req.body;

    if (action === 'issue' || action === 'return') {
      const data = await readSheet(sheet);
      const headers = data[0] || [];
      const cols = findColumns(headers);
      const { row, who, where, date } = req.body;
      const updates = [];
      const d = date || todayStr();

      if (action === 'issue') {
        if (cols.who >= 0 && who) updates.push({ row, col: cols.who + 1, value: who });
        if (cols.where >= 0 && where) updates.push({ row, col: cols.where + 1, value: where });
        if (cols.status >= 0) updates.push({ row, col: cols.status + 1, value: 'Видано' });
        if (cols.date >= 0) updates.push({ row, col: cols.date + 1, value: d });
        if (cols.returned >= 0) updates.push({ row, col: cols.returned + 1, value: '' });
      } else {
        if (cols.returned >= 0) updates.push({ row, col: cols.returned + 1, value: d });
        if (cols.status >= 0) updates.push({ row, col: cols.status + 1, value: 'КСП' });
        if (cols.where >= 0) updates.push({ row, col: cols.where + 1, value: 'КСП' });
        if (cols.who >= 0) updates.push({ row, col: cols.who + 1, value: '' });
        if (cols.date >= 0) updates.push({ row, col: cols.date + 1, value: '' });
      }

      if (updates.length) await writeCells(sheet, updates);
      return res.json({ ok: true });
    }

    await appendRow(sheet, values);
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { sheet, row } = req.body;
    await deleteRow(sheet, row);
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
});
