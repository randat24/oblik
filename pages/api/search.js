import { withAuth } from '../../lib/auth';
import { SHEET_CONFIGS, readSheet, findColumns } from '../../lib/sheets';
import { STOCK_SHEET, parseStockItems } from '../../lib/stock';
import { LINES_SHEET, parseLines } from '../../lib/boxes';

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
      ['облік', it.accounting],
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
      accounting: it.accounting,
      received: it.received,
      writtenOff: it.writtenOff,
      remainder: it.remainder,
      matchedField: hit[0],
      matchedValue: hit[1],
    });
  });
  return out;
}

/**
 * Вміст ящиків складу. Шукаємо і за назвою речі, і за кодом ящика —
 * «ПНВ» має знаходити ящик, у якому вони лежать, а «012» — усе, що в ньому.
 */
async function searchBoxes(qText) {
  let lineValues;
  let boxValues;
  try {
    [lineValues, boxValues] = await Promise.all([
      readSheet(LINES_SHEET),
      readSheet('Склад').catch(() => []),
    ]);
  } catch {
    // лист ще не створено — немає чого шукати
    return [];
  }

  // код контейнера → його назва й розташування, щоб у результаті було видно,
  // куди йти. Контейнером може бути і ящик складу, і комплект на Рибаківці.
  const boxes = new Map();
  (boxValues || []).slice(1).forEach((r) => {
    const code = (r?.[0] || '').toString().trim();
    if (code) boxes.set(code, { name: (r[2] || '').toString(), location: (r[4] || '').toString(), kind: 'ящик' });
  });
  try {
    parseStockItems(await readSheet(STOCK_SHEET)).forEach((it) => {
      if (it.id) boxes.set(it.id, { name: it.name, location: it.place, kind: 'комплект' });
    });
  } catch { /* Рибаківки може ще не бути */ }

  const out = [];
  parseLines(lineValues).forEach((l) => {
    const fields = [
      ['назва', l.name], ['ящик', l.box], ['примітка', l.note], ['облік', l.accounting],
    ];
    const hit = fields.find(([, v]) => (v || '').toString().toLowerCase().includes(qText));
    if (!hit) return;
    const b = boxes.get(l.box) || {};
    out.push({
      kind: 'box',
      row: l.row,
      box: l.box,
      boxKind: b.kind || 'ящик',
      boxName: b.name || '',
      location: b.location || '',
      name: l.name,
      total: l.total,
      taken: l.taken,
      left: l.left,
      unit: l.unit,
      accounting: l.accounting,
      note: l.note,
      matchedField: hit[0],
      matchedValue: hit[1],
    });
  });
  // спершу те, що є на місці — його можна взяти просто зараз
  out.sort((a, b) => (b.left > 0) - (a.left > 0) || a.name.localeCompare(b.name, 'uk'));
  return out;
}

export default withAuth(async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (q.length < 2) return res.json({ serial: [], assigned: [], other: [], stock: [], boxes: [] });

  const qText = q.toLowerCase();
  const qNorm = q.replace(/[\s\-/\\:]/g, '').toLowerCase();

  const serial = [];
  const assigned = [];
  const other = [];

  const targets = SHEET_CONFIGS.filter((c) => c.kind === 'items');

  const stockHits = searchStock(qText);
  const boxHits = searchBoxes(qText);

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

  res.json({ serial, assigned, other, stock: await stockHits, boxes: await boxHits });
});
