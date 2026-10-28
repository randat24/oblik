import { withAuth } from '../../lib/auth';
import { SHEET_CONFIGS, readSheet, findColumns } from '../../lib/sheets';

export default withAuth(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { sheet } = req.query;
  if (!sheet) return res.status(400).json({ error: 'Missing sheet' });

  const cfg = SHEET_CONFIGS.find((c) => c.name === sheet);
  if (!cfg) return res.status(404).json({ error: `Немає конфігурації для листа "${sheet}"` });

  const rows = await readSheet(sheet);
  // Колонки з паролями не віддаємо — так само, як їх ховає інтерфейс
  const maskCols = cfg.maskPasswords ? findColumns(rows[0] || []).maskCols : [];
  const out = rows.map((r, i) => (i === 0 ? r : r.map((cell, ci) => (maskCols.includes(ci) ? '' : cell))));

  const csv = out.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(sheet)}.csv`);
  return res.send(csv);
});
