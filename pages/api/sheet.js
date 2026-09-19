import { withAuth } from '../../lib/auth';
import { readAudits, STATUS as AUDIT_STATUS } from '../../lib/audit';
import {
  SHEET_CONFIGS,
  DEFAULT_STATUS_OPTIONS,
  DEFAULT_TYPE_OPTIONS,
  readSheet,
  findColumns,
  distinctValues,
  mergeWithDefaults,
  ensureColumn,
} from '../../lib/sheets';

// Куди писати те, чого не вміщає жодна колонка. Назва звична для таблиці:
// саме так примітка зветься в «Складі» й у «Рибаківці».
const NOTE_HEADER = 'Примітка';

/** Коли цей лист звіряли востаннє — щоб було видно на самій сторінці */
async function auditInfo(name) {
  try {
    const audits = await readAudits();
    const mine = audits.filter((a) => a.scope === name);
    return {
      open: mine.find((a) => a.status === AUDIT_STATUS.open) || null,
      last: mine.filter((a) => a.status === AUDIT_STATUS.done).slice(-1)[0] || null,
    };
  } catch {
    return { open: null, last: null };
  }
}

export default withAuth(async (req, res) => {
  const { name } = req.query;

  // Без параметра — віддаємо список листів
  if (!name) {
    return res.json({
      sheets: SHEET_CONFIGS.map((c) => ({
        name: c.name,
        kind: c.kind,
        noIssue: !!c.noIssue,
        hideStatus: !!c.hideStatus,
      })),
      // вкладку «Здоровʼя» бачить лише її власник; решті її просто немає
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

  /*
   * Лист із картками завжди має куди написати словами.
   *
   * «Кропива» такої колонки не мала взагалі, тож сказати «антена на скотчі»
   * було ніде: картка показує рівно ті поля, які є в таблиці. Дописуємо
   * заголовок у кінець — так само, як лікуються заголовки в інших листах.
   */
  if (cfg.kind === 'items' && cols.note === -1) {
    const added = await ensureColumn(name, headers, NOTE_HEADER);
    if (added >= 0) {
      headers[added] = NOTE_HEADER;
      cols.note = added;
    }
  }

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

  // Колонки, де значення повторюються (підрозділ, місце, тип пристрою), — це
  // насправді довідники. Підказуємо вже вжите, щоб не вигадувати написання щоразу.
  const masked = new Set(cfg.maskPasswords ? cols.maskCols : []);
  const suggestions = {};
  headers.forEach((_, i) => {
    // примітка — не довідник: підказувати чужий текст тут нема сенсу
    if (i === 0 || masked.has(i) || i === cols.status || i === cols.type ||
        i === cols.date || i === cols.note) return;
    const vals = distinctValues(dataRows, i);
    const filled = dataRows.filter((r) => (r[i] || '').toString().trim()).length;
    if (vals.length >= 1 && vals.length <= 40 && vals.length * 2 <= filled) suggestions[i] = vals;
  });

  res.json({
    name,
    kind: cfg.kind,
    noIssue: !!cfg.noIssue,
    hideStatus: !!cfg.hideStatus,
    maskCols: cfg.maskPasswords ? cols.maskCols : [],
    headers,
    items,
    cols,
    statusOptions,
    typeOptions,
    whereOptions,
    whoOptions,
    suggestions,
    audit: await auditInfo(name),
  });
});
