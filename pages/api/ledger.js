import { withAuth } from '../../lib/auth';
import { readSheet, writeCells, appendRow, colToA1, assertSheet } from '../../lib/sheets';

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
    }
  }
  if (headerRow === -1) throw new Error('Не знайдено рядок заголовків із "Найменування"');

  const find = (kw) => headers.findIndex((h) => (h || '').toString().toLowerCase().includes(kw));
  const nameCol = find('найменування');
  const unitCol = find('виміру');
  const receivedCol = find('отриман');
  const remainderCol = find('залиш');
  if (remainderCol === -1) throw new Error('Не знайдено колонку "Залишок"');

  return {
    headerRow,
    nameCol,
    unitCol,
    receivedCol,
    remainderCol,
    pairsStart: remainderCol + 1,
    lastCol: headers.length,
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
  assertSheet(sheet, 'ledger');
  const values = await readSheet(sheet);
  const meta = getMeta(values);

  if (req.method === 'GET') {
    return res.json({ items: parseItems(values, meta) });
  }

  if (req.method === 'POST') {
    const { action } = req.body;

    if (action === 'writeoff') {
      const { row, qty, date } = req.body;
      const rowVals = values[row - 1] || [];

      // шукаємо першу вільну пару "К-сть / Дата"
      let targetCol = -1;
      for (let c = meta.pairsStart; c < meta.lastCol; c += 2) {
        const v = rowVals[c];
        if (v === '' || v === null || v === undefined) {
          targetCol = c;
          break;
        }
      }
      if (targetCol === -1) targetCol = meta.lastCol; // додаємо в кінець

      // рахуємо новий залишок
      let total = 0;
      for (let c = meta.pairsStart; c < meta.lastCol; c += 2) {
        const v = rowVals[c];
        if (v !== '' && v !== null && v !== undefined) total += Number(v) || 0;
      }
      total += Number(qty) || 0;
      const received = meta.receivedCol >= 0 ? Number(rowVals[meta.receivedCol]) || 0 : 0;

      await writeCells(sheet, [
        { row, col: targetCol + 1, value: qty },
        { row, col: targetCol + 2, value: date },
        { row, col: meta.remainderCol + 1, value: received - total },
      ]);

      const updated = await readSheet(sheet);
      return res.json({ items: parseItems(updated, getMeta(updated)) });
    }

    // нова позиція
    const { name, unit, received } = req.body;
    if (!name) return res.status(400).json({ error: 'Не вказано назву' });

    const row = new Array(meta.lastCol).fill('');
    if (meta.nameCol >= 0) row[meta.nameCol] = name;
    if (meta.unitCol >= 0) row[meta.unitCol] = unit || '';
    if (meta.receivedCol >= 0) row[meta.receivedCol] = Number(received) || 0;
    row[meta.remainderCol] = Number(received) || 0;

    await appendRow(sheet, row);
    const updated = await readSheet(sheet);
    return res.json({ items: parseItems(updated, getMeta(updated)) });
  }

  res.status(405).json({ error: 'Method not allowed' });
});
