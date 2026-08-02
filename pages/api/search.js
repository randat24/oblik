import { withAuth } from '../../lib/auth';
import { SHEET_CONFIGS, readSheet, findColumns } from '../../lib/sheets';

export default withAuth(async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (q.length < 2) return res.json({ serial: [], assigned: [], other: [] });

  const qText = q.toLowerCase();
  const qNorm = q.replace(/[\s\-/\\:]/g, '').toLowerCase();

  const serial = [];
  const assigned = [];
  const other = [];

  const targets = SHEET_CONFIGS.filter((c) => c.kind === 'items');

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

      rows.forEach((rawRow, i) => {
        const row = [...rawRow];
        while (row.length < headers.length) row.push('');
        if (row.join('').trim() === '') return;

        const entry = {
          sheet: cfg.name,
          row: i + 2,
          headers,
          values: row,
          status: cols.status >= 0 ? row[cols.status] || '' : '',
          who: cols.who >= 0 ? row[cols.who] || '' : '',
          matchedValue: '',
          noIssue: !!cfg.noIssue,
        };

        // 1) серійний номер
        let snMatch = false;
        for (const c of cols.snCols) {
          const rawSn = (row[c] || '').toString();
          const norm = rawSn.replace(/[\s\-/\\:]/g, '').toLowerCase().replace(/^sn#?/, '');
          if (norm && qNorm.length >= 3 && norm.includes(qNorm)) {
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
          if (c === cols.who) continue;
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

  res.json({ serial, assigned, other });
});
