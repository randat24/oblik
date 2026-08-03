import { withAuth } from '../../lib/auth';
import { SHEET_CONFIGS, readSheet, appendRow, findColumns } from '../../lib/sheets';
import { appendAct, readActs, ACT_KINDS, CONDITIONS } from '../../lib/acts';
import { logChange } from '../../lib/log';

/** Розкладає позицію акта по колонках конкретного листа */
function rowForSheet(headers, cols, item, { kind, to, from, date, condition }) {
  const row = new Array(headers.length).fill('');
  if (item.title) row[0] = item.title;
  if (cols.id >= 0 && item.number) row[cols.id] = item.number;

  const snIdx = cols.snCols?.find((i) => i !== 0 && i !== cols.id);
  if (snIdx >= 0 && item.serial) row[snIdx] = item.serial;

  if (cols.status >= 0) row[cols.status] = kind === 'accept' ? 'КСП' : 'Видано';
  // приймаємо — річ лягає на КСП; видаємо — записуємо, кому саме
  if (cols.who >= 0) row[cols.who] = kind === 'accept' ? '' : to;
  if (cols.where >= 0) row[cols.where] = kind === 'accept' ? 'КСП' : (item.where || '');
  if (cols.date >= 0) row[cols.date] = date;

  const noteIdx = headers.findIndex((h) => (h || '').toString().toLowerCase().includes('примітк'));
  if (noteIdx >= 0) {
    const bits = [condition, kind === 'accept' && from ? `від ${from}` : ''].filter(Boolean);
    if (bits.length) row[noteIdx] = bits.join(', ');
  }
  return row;
}

export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    return res.json({
      acts: await readActs(),
      sheets: SHEET_CONFIGS.filter((c) => c.kind === 'items').map((c) => c.name),
      conditions: CONDITIONS,
      kinds: ACT_KINDS,
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { kind, sheet, items, from, to, condition, photo, note, date } = req.body || {};

  if (!ACT_KINDS[kind]) return res.status(400).json({ error: 'Невідома дія' });
  if (!from?.trim()) return res.status(400).json({ error: 'Вкажіть, хто віддав' });
  if (!to?.trim()) return res.status(400).json({ error: 'Вкажіть, хто прийняв' });
  const list = (items || []).filter((it) => (it.title || '').trim());
  if (!list.length) return res.status(400).json({ error: 'Додайте хоча б одну позицію' });

  const cfg = SHEET_CONFIGS.find((c) => c.name === sheet && c.kind === 'items');
  if (!cfg) return res.status(400).json({ error: `Немає такої категорії: ${sheet}` });

  const values = await readSheet(sheet);
  const headers = values[0] || [];
  const cols = findColumns(headers);

  // спершу позиції — акт має описувати те, що вже внесено
  for (const item of list) {
    await appendRow(sheet, rowForSheet(headers, cols, item, { kind, to, from, date, condition }));
  }

  const { titles, count } = await appendAct({
    kind, sheet, items: list, from, to, condition, photo, note, date,
  });

  await logChange({
    sheet,
    action: ACT_KINDS[kind],
    field: `${count} поз.`,
    before: kind === 'accept' ? from : '',
    after: `${titles} → ${kind === 'accept' ? to : to}${condition ? ` (${condition})` : ''}`,
    photo,
  });

  res.json({ ok: true, count, titles });
});
