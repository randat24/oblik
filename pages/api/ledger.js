import { withAuth } from '../../lib/auth';
import { readSheet, writeCells, appendRow, deleteRow, insertRowAt } from '../../lib/sheets';
import { logChange } from '../../lib/log';

/** Знаходить структуру відомості: рядок заголовків і ключові колонки */
function getMeta(values) {
  let headerRow = -1;
  let headers = [];
  const scan = Math.min(values.length, 5);
  for (let r = 0; r < scan; r++) {
    const found = (values[r] || []).some((v) =>
      (v || '').toString().toLowerCase().includes('найменування')
    );
    if (found) {
      headerRow = r;
      headers = values[r];
      break;
    }
  }
  if (headerRow === -1) throw new Error('Не знайдено рядок заголовків із "Найменування"');

  const find = (kw) => headers.findIndex((h) => (h || '').toString().toLowerCase().includes(kw));
  const nameCol = find('найменування');
  const unitCol = find('виміру');
  const receivedCol = find('отриман');
  const remainderCol = find('залиш');
  if (remainderCol === -1) throw new Error('Не знайдено колонку "Залишок"');

  // Пари «К-сть / Дата» часто не мають заголовків, тож ширину беремо
  // з найдовшого рядка даних, а не з рядка заголовків
  let width = headers.length;
  for (let r = headerRow + 1; r < values.length; r++) {
    const len = (values[r] || []).length;
    if (len > width) width = len;
  }

  return {
    headerRow,
    nameCol,
    unitCol,
    receivedCol,
    remainderCol,
    pairsStart: remainderCol + 1,
    lastCol: width,
    headerCols: headers.length,
  };
}

function parseItems(values, meta) {
  const items = [];
  for (let r = meta.headerRow + 1; r < values.length; r++) {
    const row = values[r] || [];
    const name = meta.nameCol >= 0 ? (row[meta.nameCol] || '').toString().trim() : '';
    if (!name) continue;

    const received = meta.receivedCol >= 0 ? Number(row[meta.receivedCol]) || 0 : 0;
    const unit = meta.unitCol >= 0 ? (row[meta.unitCol] || '').toString() : '';
    const writeOffs = [];
    let total = 0;

    for (let c = meta.pairsStart; c < row.length; c += 2) {
      const qty = row[c];
      if (qty !== '' && qty !== null && qty !== undefined) {
        const q = Number(qty) || 0;
        total += q;
        writeOffs.push({ qty: q, date: (row[c + 1] || '').toString() });
      }
    }

    items.push({
      row: r + 1,
      name,
      unit,
      received,
      writtenOff: total,
      remainder: received - total,
      writeOffs,
    });
  }
  return items;
}

export default withAuth(async (req, res) => {
  const sheet = req.query.sheet || req.body?.sheet || 'Майно роти';
  const values = await readSheet(sheet);
  const meta = getMeta(values);

  if (req.method === 'GET') {
    return res.json({ items: parseItems(values, meta) });
  }

  if (req.method === 'POST') {
    const { action } = req.body;

    if (action === 'writeoff') {
      const { row, date } = req.body;
      const qty = Number(req.body.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Кількість має бути більшою за 0' });
      }

      const rowVals = values[row - 1] || [];
      const isEmpty = (v) => v === null || v === undefined || v.toString().trim() === '';

      // перша вільна пара «К-сть / Дата»; за межами рядка комірки завжди порожні,
      // тож цикл завжди завершується і пари лишаються вирівняними
      let targetCol = meta.pairsStart;
      while (!isEmpty(rowVals[targetCol])) targetCol += 2;

      // новий залишок — по всій ширині рядка, а не лише по заголовках
      let total = 0;
      for (let c = meta.pairsStart; c < rowVals.length; c += 2) {
        if (!isEmpty(rowVals[c])) total += Number(rowVals[c]) || 0;
      }
      const received = meta.receivedCol >= 0 ? Number(rowVals[meta.receivedCol]) || 0 : 0;
      if (total + qty > received) {
        return res.status(400).json({
          error: `Недостатньо залишку: доступно ${received - total}, вказано ${qty}`,
        });
      }

      await writeCells(sheet, [
        { row, col: targetCol + 1, value: qty },
        { row, col: targetCol + 2, value: date },
        { row, col: meta.remainderCol + 1, value: received - total - qty },
      ]);

      const name = meta.nameCol >= 0 ? rowVals[meta.nameCol] : '';
      await logChange({
        sheet, row, action: 'Списано',
        field: name,
        before: `залишок ${received - total}`,
        after: `-${qty}, залишок ${received - total - qty} (${date})`,
      });

      const updated = await readSheet(sheet);
      return res.json({ items: parseItems(updated, getMeta(updated)) });
    }

    if (action === 'restore') {
      const { row, values: rowValues } = req.body;
      await insertRowAt(sheet, row, rowValues);
      await logChange({ sheet, row, action: 'Відновлення', after: (rowValues || []).join(' | ') });
      const updated = await readSheet(sheet);
      return res.json({ items: parseItems(updated, getMeta(updated)) });
    }

    if (action === 'update') {
      const { row, field, value } = req.body;
      const colMap = { name: meta.nameCol, unit: meta.unitCol, received: meta.receivedCol };
      const col = colMap[field];
      if (col === undefined || col < 0) {
        return res.status(400).json({ error: `Невідоме поле: ${field}` });
      }

      const rowVals = values[row - 1] || [];
      const updates = [{ row, col: col + 1, value }];

      // зміна отриманого змінює й залишок
      if (field === 'received') {
        const isEmpty = (v) => v === null || v === undefined || v.toString().trim() === '';
        let total = 0;
        for (let c = meta.pairsStart; c < rowVals.length; c += 2) {
          if (!isEmpty(rowVals[c])) total += Number(rowVals[c]) || 0;
        }
        updates.push({ row, col: meta.remainderCol + 1, value: (Number(value) || 0) - total });
      }

      await writeCells(sheet, updates);
      await logChange({
        sheet, row, action: 'Редагування',
        field: { name: 'Найменування', unit: 'Од. виміру', received: 'Отримано' }[field],
        before: rowVals[col] ?? '',
        after: value,
      });

      const updated = await readSheet(sheet);
      return res.json({ items: parseItems(updated, getMeta(updated)) });
    }

    // нова позиція
    const { name, unit, received } = req.body;
    if (!name) return res.status(400).json({ error: 'Не вказано назву' });

    const row = new Array(meta.headerCols).fill('');
    if (meta.nameCol >= 0) row[meta.nameCol] = name;
    if (meta.unitCol >= 0) row[meta.unitCol] = unit || '';
    if (meta.receivedCol >= 0) row[meta.receivedCol] = Number(received) || 0;
    row[meta.remainderCol] = Number(received) || 0;

    await appendRow(sheet, row);
    await logChange({ sheet, action: 'Додано позицію', field: name, after: `отримано ${Number(received) || 0} ${unit || ''}`.trim() });
    const updated = await readSheet(sheet);
    return res.json({ items: parseItems(updated, getMeta(updated)) });
  }

  if (req.method === 'DELETE') {
    const { row } = req.body;
    if (!row || row <= meta.headerRow + 1) {
      return res.status(400).json({ error: 'Некоректний рядок' });
    }

    // зберігаємо рядок, щоб можна було скасувати видалення
    const deleted = values[row - 1] || [];

    await deleteRow(sheet, row);
    await logChange({ sheet, row, action: 'Видалено позицію', before: deleted.join(' | ') });
    const updated = await readSheet(sheet);
    return res.json({ items: parseItems(updated, getMeta(updated)), deleted });
  }

  res.status(405).json({ error: 'Method not allowed' });
});
