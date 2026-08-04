import { withAuth } from '../../lib/auth';
import { SHEET_CONFIGS, readSheet, findColumns } from '../../lib/sheets';
import { STOCK_SHEET, parseStockItems } from '../../lib/stock';

/** Склад Рибаківки має власну структуру, тож шукаємо в ньому окремо */
async function searchStock(qText) {
  let values;
  try {
    values = await readSheet(STOCK_SHEET);
  } catch {
    // лист ще не створено — просто немає чого шукати
    return [];
  }
  const out = [];
  parseStockItems(values).forEach((it) => {
    const fields = [
      ['номер', it.id], ['назва', it.name], ['опис', it.description],
      ['категорія', it.category], ['місце', it.place], ['примітки', it.notes],
    ];
    const hit = fields.find(([, v]) => (v || '').toString().toLowerCase().includes(qText));
    if (!hit) return;
    out.push({
      kind: 'stock',
      sheet: STOCK_SHEET,
      row: it.row,
      id: it.id,
      name: it.name,
      category: it.category,
      place: it.place,
      unit: it.unit,
      description: it.description,
      received: it.received,
      writtenOff: it.writtenOff,
      remainder: it.remainder,
      matchedField: hit[0],
      matchedValue: hit[1],
    });
  });
  return out;
}

export default withAuth(async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (q.length < 2) return res.json({ serial: [], assigned: [], other: [], stock: [] });

  const qText = q.toLowerCase();
  const qNorm = q.replace(/[\s\-/\\:]/g, '').toLowerCase();

  const serial = [];
  const assigned = [];
  const other = [];

  const targets = SHEET_CONFIGS.filter((c) => c.kind === 'items');

  const stockHits = searchStock(qText);

  await Promise.all(
    targets.map(async (cfg) => {
      let values;
      try {
        values = await readSheet(cfg.name);
      } catch {
        return;
      }
      if (!values || values.length < 2) return;

      const headers = values[0] || [];
      const cols = findColumns(headers);
      const rows = values.slice(1);
      const masked = cfg.maskPasswords ? new Set(cols.maskCols) : new Set();

      rows.forEach((rawRow, i) => {
        const row = [...rawRow];
        while (row.length < headers.length) row.push('');
        if (row.join('').trim() === '') return;

        // колонки з паролями не віддаємо в результати пошуку
        const safeRow = row.map((v, c) => (masked.has(c) && v ? '••••••' : v));

        const entry = {
          sheet: cfg.name,
          row: i + 2,
          headers,
          values: safeRow,
          status: cfg.hideStatus || cols.status < 0 ? '' : row[cols.status] || '',
          who: cols.who >= 0 ? row[cols.who] || '' : '',
          matchedValue: '',
          noIssue: !!cfg.noIssue,
        };

        // 1) серійний номер
        let snMatch = false;
        for (const c of cols.snCols) {
          const rawSn = (row[c] || '').toString();
          const norm = rawSn.replace(/[\s\-/\\:]/g, '').toLowerCase().replace(/^sn#?/, '');
          if (norm && norm.includes(qNorm)) {
            entry.matchedValue = rawSn;
            snMatch = true;
            break;
          }
        }
        if (snMatch) {
          serial.push(entry);
          return;
        }

        // 2) отримувач
        const whoVal = (cols.who >= 0 ? row[cols.who] || '' : '').toString().toLowerCase().trim();
        if (whoVal && whoVal.includes(qText)) {
          entry.matchedValue = row[cols.who];
          assigned.push(entry);
          return;
        }

        // 3) будь-де інде
        for (let c = 0; c < row.length; c++) {
          if (c === cols.who || masked.has(c)) continue;
          const cell = (row[c] || '').toString();
          if (cell && cell.toLowerCase().includes(qText)) {
            entry.matchedValue = cell;
            other.push(entry);
            break;
          }
        }
      });
    })
  );

  res.json({ serial, assigned, other, stock: await stockHits });
});
