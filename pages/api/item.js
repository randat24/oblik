import { withAuth } from '../../lib/auth';
import {
  readSheet,
  writeCell,
  writeCells,
  appendRow,
  deleteRow,
  insertRowAt,
  findColumns,
  todayStr,
  sheetConfig,
} from '../../lib/sheets';
import { logChange } from '../../lib/log';

export default withAuth(async (req, res) => {
  if (!sheetConfig(req.body?.sheet, 'items')) {
    return res.status(404).json({ error: `Немає листа «${req.body?.sheet || ''}»` });
  }

  if (req.method === 'PATCH') {
    const { sheet, row, col, value, prev } = req.body;
    await writeCell(sheet, row, col + 1, value);

    const headers = (await readSheet(sheet))[0] || [];
    await logChange({
      sheet,
      row,
      action: 'Редагування',
      field: headers[col] || `Колонка ${col + 1}`,
      before: prev,
      after: value,
    });
    return res.json({ ok: true });
  }

  if (req.method === 'POST') {
    const { sheet, values, action } = req.body;

    if (action === 'restore') {
      const { row, values: rowValues } = req.body;
      await insertRowAt(sheet, row, rowValues);
      await logChange({ sheet, row, action: 'Відновлення', after: (rowValues || []).join(' | ') });
      return res.json({ ok: true });
    }

    if (action === 'issue' || action === 'return') {
      const data = await readSheet(sheet);
      const headers = data[0] || [];
      const cols = findColumns(headers);
      const { row, who, where, date } = req.body;
      const before = data[row - 1] || [];
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

      await logChange({
        sheet,
        row,
        action: action === 'issue' ? 'Видано' : 'Прийнято на КСП',
        field: cols.who >= 0 ? headers[cols.who] || 'Отримав' : '',
        before: cols.who >= 0 ? before[cols.who] || '' : '',
        after: action === 'issue' ? [who, where].filter(Boolean).join(', ') : 'КСП',
      });
      return res.json({ ok: true });
    }

    await appendRow(sheet, values);
    await logChange({ sheet, action: 'Додано запис', after: (values || []).join(' | ') });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { sheet, row } = req.body;

    // зберігаємо рядок, щоб можна було скасувати видалення
    const data = await readSheet(sheet);
    const deleted = data[row - 1] || [];

    await deleteRow(sheet, row);
    await logChange({ sheet, row, action: 'Видалено запис', before: deleted.join(' | ') });
    return res.json({ ok: true, deleted });
  }

  res.status(405).json({ error: 'Method not allowed' });
});
