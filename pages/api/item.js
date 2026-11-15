import { withAuth } from '../../lib/auth';
import {
  readSheet,
  writeCell,
  writeCells,
  appendRow,
  appendRows,
  deleteRow,
  insertRowAt,
  findColumns,
  todayStr,
  sheetConfig,
} from '../../lib/sheets';
import { logChange } from '../../lib/log';
import { snOf } from '../../lib/dupes';
import { parseSerials, bulkRows, bulkConflicts, BULK_MAX } from '../../lib/bulk';

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

    /*
     * Партія однакових речей: спільні поля + стовпчик серійників.
     *
     * Повтори перевіряємо тут, а не лише у формі: між відкриттям форми й
     * натисканням «Додати» хтось міг внести ту саму рацію руками в таблицю.
     * Тоді не пишемо нічого — половина партії гірша за жодну, бо її довелось
     * би шукати й дописувати.
     */
    if (action === 'bulk') {
      const data = await readSheet(sheet);
      const headers = data[0] || [];
      const cols = findColumns(headers);
      const nameIdx = cols.name >= 0 ? cols.name : 0;
      const idIdx = cols.id >= 0 && cols.id !== nameIdx ? cols.id : -1;
      const snIdx = snOf(cols);
      if (snIdx < 0) return res.status(400).json({ error: 'У цьому листі немає колонки серійного номера' });

      const { list } = parseSerials(req.body.serials);
      if (!list.length) return res.status(400).json({ error: 'Вставте хоча б один серійний номер' });
      if (list.length > BULK_MAX) return res.status(400).json({ error: `За раз — не більше ${BULK_MAX}` });

      const base = headers.map((_, i) => String((req.body.base || [])[i] ?? '').slice(0, 500));
      if (!base[nameIdx].trim()) return res.status(400).json({ error: `Вкажіть «${headers[nameIdx] || 'назву'}»` });
      const startId = idIdx >= 0 ? Number(req.body.startId) : null;
      if (idIdx >= 0 && !(Number.isInteger(startId) && startId > 0)) {
        return res.status(400).json({ error: 'Стартовий номер — ціле число' });
      }

      const rows = bulkRows({ base, idIdx, snIdx, serials: list, startId });
      const { snTaken, idTaken } = bulkConflicts({ existing: data.slice(1), rows, idIdx, snIdx });
      if (snTaken.length || idTaken.length) {
        return res.status(409).json({
          error: [
            snTaken.length ? `Уже є в листі: ${snTaken.map((x) => `${x.value} (рядок ${x.row})`).join(', ')}` : '',
            idTaken.length ? `Номер зайнятий: ${idTaken.map((x) => `${x.value} (рядок ${x.row})`).join(', ')}` : '',
          ].filter(Boolean).join('. '),
          snTaken, idTaken,
        });
      }

      // RAW: «00123» не має втратити нулі, а «1E5» — стати числом 100000
      await appendRows(sheet, rows, { raw: true });
      // номери спершу: журнал обрізає довгий текст, і діапазон має вціліти
      const ids = idIdx >= 0 ? `номери ${rows[0][idIdx]}–${rows[rows.length - 1][idIdx]}: ` : '';
      await logChange({
        sheet, action: `Додано записів: ${rows.length}`, field: base[nameIdx],
        after: ids + list.join(', '),
      });
      return res.json({ ok: true, added: rows.length });
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
