import { withAuth } from '../../lib/auth';
import {
  SHEET_CONFIGS,
  DEFAULT_STATUS_OPTIONS,
  DEFAULT_TYPE_OPTIONS,
  readSheet,
  findColumns,
  distinctValues,
  mergeWithDefaults,
} from '../../lib/sheets';

export default withAuth(async (req, res) => {
  const { name } = req.query;

  // Без параметра — віддаємо список листів
  if (!name) {
    return res.json({
      sheets: SHEET_CONFIGS.map((c) => ({
        name: c.name,
        kind: c.kind,
        noIssue: !!c.noIssue,
      })),
    });
  }

  const cfg = SHEET_CONFIGS.find((c) => c.name === name);
  if (!cfg) return res.status(404).json({ error: `Немає конфігурації для листа "${name}"` });

  const values = await readSheet(name);
  if (values.length === 0) {
    return res.json({ headers: [], items: [], cols: {}, statusOptions: [], typeOptions: [] });
  }

  const headers = values[0] || [];
  const dataRows = values.slice(1);
  const cols = findColumns(headers);

  const items = [];
  dataRows.forEach((row, i) => {
    const padded = [...row];
    while (padded.length < headers.length) padded.push('');
    if (padded.join('').trim() === '') return;
    items.push({ row: i + 2, values: padded });
  });

  const statusOptions = mergeWithDefaults(
    distinctValues(dataRows, cols.status),
    DEFAULT_STATUS_OPTIONS
  );
  const typeOptions = mergeWithDefaults(
    distinctValues(dataRows, cols.type),
    DEFAULT_TYPE_OPTIONS
  );
  const whereOptions = distinctValues(dataRows, cols.where);
  const whoOptions = distinctValues(dataRows, cols.who);

  res.json({
    name,
    kind: cfg.kind,
    noIssue: !!cfg.noIssue,
    maskCols: cfg.maskPasswords ? cols.maskCols : [],
    headers,
    items,
    cols,
    statusOptions,
    typeOptions,
    whereOptions,
    whoOptions,
  });
});
