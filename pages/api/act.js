import { withAuth } from '../../lib/auth';
import { SHEET_CONFIGS, readSheet, appendRow, writeCells, findColumns } from '../../lib/sheets';
import { appendAct, readActs, ACT_KINDS, CONDITIONS } from '../../lib/acts';
import { logChange } from '../../lib/log';

/** Індекси колонок, що описують саму річ, — однакові для читання й для запису */
function itemCols(headers, cols) {
  const id = cols.id >= 0 && cols.id !== 0 ? cols.id : -1;
  const sn = cols.snCols?.find((i) => i !== 0 && i !== id) ?? -1;
  // «Назва» теж підпадає під пошук колонки «де», а туди писати місце не можна
  const where = cols.where > 0 ? cols.where : -1;
  const note = headers.findIndex((h) => (h || '').toString().toLowerCase().includes('примітк'));
  return { id, sn, where, note };
}

/** Список речей листа — для підказок у формі акта */
function catalogOf(values) {
  const headers = values[0] || [];
  const cols = findColumns(headers);
  const ic = itemCols(headers, cols);
  const cell = (row, i) => (i >= 0 ? (row[i] || '').toString().trim() : '');

  return values
    .slice(1)
    .map((row, i) => ({
      row: i + 2,
      title: cell(row, 0),
      number: cell(row, ic.id),
      serial: cell(row, ic.sn),
      status: cols.status >= 0 ? cell(row, cols.status) : '',
      who: cols.who >= 0 ? cell(row, cols.who) : '',
      where: cell(row, ic.where),
    }))
    .filter((c) => c.title || c.number || c.serial);
}

/** Що дописуємо в «Примітки»: дата, стан і від кого / кому */
function noteBits({ kind, from, to, condition, date }) {
  const who = kind === 'accept' ? (from ? `від ${from}` : '') : (to ? `видано ${to}` : '');
  return [date, condition, who].filter(Boolean).join(', ');
}

/** Нової речі ще немає в листі — розкладаємо позицію по його колонках */
function rowForSheet(headers, cols, item, ctx) {
  const ic = itemCols(headers, cols);
  const row = new Array(headers.length).fill('');
  const { kind, to, date } = ctx;

  if (item.title) row[0] = item.title;
  if (ic.id >= 0 && item.number) row[ic.id] = item.number;
  if (ic.sn >= 0 && item.serial) row[ic.sn] = item.serial;

  if (cols.status >= 0) row[cols.status] = kind === 'accept' ? 'КСП' : 'Видано';
  // приймаємо — річ лягає на КСП; видаємо — записуємо, кому саме
  if (cols.who >= 0) row[cols.who] = kind === 'accept' ? '' : to;
  if (ic.where >= 0) row[ic.where] = kind === 'accept' ? 'КСП' : (item.where || '');
  if (cols.date >= 0) row[cols.date] = date;
  if (ic.note >= 0) row[ic.note] = noteBits(ctx);
  return row;
}

/** Річ уже є в листі — міняємо тільки те, що змінює приймання чи видача */
function updatesForRow(headers, cols, item, ctx, current) {
  const ic = itemCols(headers, cols);
  const { kind, to, date } = ctx;
  const ups = [];
  const at = (i) => (i >= 0 ? (current[i] || '').toString().trim() : '');
  const set = (i, value) => { if (i >= 0) ups.push({ col: i + 1, value }); };
  // ідентифікатори не перезаписуємо — тільки дозаповнюємо порожні
  const fill = (i, value) => { if (i >= 0 && value && !at(i)) ups.push({ col: i + 1, value }); };

  fill(ic.id, item.number);
  fill(ic.sn, item.serial);

  if (cols.status >= 0) set(cols.status, kind === 'accept' ? 'КСП' : 'Видано');
  if (cols.who >= 0) set(cols.who, kind === 'accept' ? '' : to);
  if (ic.where >= 0 && kind === 'accept') set(ic.where, 'КСП');
  if (cols.date >= 0) set(cols.date, date);

  if (ic.note >= 0) {
    const bits = noteBits(ctx);
    if (bits) {
      const merged = [at(ic.note), bits].filter(Boolean).join('; ');
      // клітинка не має розростатися нескінченно — лишаємо свіже
      set(ic.note, merged.length > 500 ? '…' + merged.slice(-499) : merged);
    }
  }

  const before = [at(cols.status), at(cols.who)].filter(Boolean).join(' → ');
  return { ups, before };
}

export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    const sheet = (req.query.sheet || '').toString();
    if (sheet) {
      const cfg = SHEET_CONFIGS.find((c) => c.name === sheet && c.kind === 'items');
      if (!cfg) return res.status(404).json({ error: `Немає такої категорії: ${sheet}` });
      return res.json({ sheet, catalog: catalogOf(await readSheet(sheet)) });
    }
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
  const ctx = { kind, to, from, date, condition };

  // спершу позиції — акт має описувати те, що вже внесено
  let added = 0;
  let updated = 0;
  for (const item of list) {
    const target = Number(item.row);
    const current = target > 1 ? values[target - 1] : null;
    if (current) {
      const { ups, before } = updatesForRow(headers, cols, item, ctx, current);
      if (ups.length) await writeCells(sheet, ups.map((u) => ({ ...u, row: target })));
      updated++;
      await logChange({
        sheet,
        row: target,
        action: ACT_KINDS[kind],
        field: item.title,
        before,
        after: kind === 'accept' ? `КСП (від ${from})` : `Видано → ${to}`,
        photo,
      });
    } else {
      await appendRow(sheet, rowForSheet(headers, cols, item, ctx));
      added++;
    }
  }

  const { titles, count } = await appendAct({
    kind, sheet, items: list, from, to, condition, photo, note, date,
  });

  const how = [updated ? `оновлено ${updated}` : '', added ? `додано ${added}` : '']
    .filter(Boolean).join(', ');

  await logChange({
    sheet,
    action: ACT_KINDS[kind],
    field: `${count} поз.`,
    before: kind === 'accept' ? from : '',
    after: `${titles} → ${to}${condition ? ` (${condition})` : ''}${how ? ` [${how}]` : ''}`,
    photo,
  });

  res.json({ ok: true, count, titles, added, updated });
});
