import { withAuth } from '../../lib/auth';
import { SHEET_CONFIGS, readSheet, findColumns, todayStr } from '../../lib/sheets';
import { readStock } from '../../lib/stock';
import {
  AUDIT_SHEET, STATUS, RESULT,
  readAudits, readLines, startAudit, addLines, updateAudit,
} from '../../lib/audit';
import { logChange } from '../../lib/log';

const WAREHOUSE = 'Склад';
const STOCK = 'Майно Рибаківки';

/** Що саме треба перевірити в межах обсягу */
async function expectedFor(scope) {
  if (scope === STOCK) {
    const { items } = await readStock();
    return items.map((it) => ({
      sheet: STOCK, row: it.row, name: it.name, ident: it.id,
      expected: String(it.remainder), kind: 'qty',
      hint: [it.category, it.place].filter(Boolean).join(' · '),
    }));
  }

  if (scope === WAREHOUSE) {
    const values = await readSheet(WAREHOUSE);
    return values.slice(1).map((raw, i) => {
      const r = [...(raw || [])];
      return {
        sheet: WAREHOUSE, row: i + 2,
        name: (r[2] || '').toString(),
        ident: (r[0] || '').toString(),
        expected: '', kind: 'yesno',
        hint: [(r[4] || '').toString(), (r[6] || '').toString()].filter(Boolean).join(' · '),
      };
    }).filter((x) => x.ident || x.name);
  }

  const cfg = SHEET_CONFIGS.find((c) => c.name === scope && c.kind === 'items');
  if (!cfg) return null;

  const values = await readSheet(scope);
  const headers = values[0] || [];
  const cols = findColumns(headers);
  const idIdx = cols.id >= 0 && cols.id !== 0 ? cols.id : -1;
  const snIdx = cols.snCols?.find((i) => i !== 0 && i !== idIdx) ?? -1;
  const cell = (r, i) => (i >= 0 ? (r[i] || '').toString().trim() : '');

  return values.slice(1).map((raw, i) => {
    const r = [...(raw || [])];
    return {
      sheet: scope, row: i + 2,
      name: cell(r, 0),
      ident: [cell(r, idIdx), cell(r, snIdx)].filter(Boolean).join(' · '),
      expected: '', kind: 'yesno',
      hint: [cell(r, cols.status), cell(r, cols.who)].filter(Boolean).join(' → '),
    };
  }).filter((x) => x.name || x.ident);
}

function scopes() {
  return [
    ...SHEET_CONFIGS.filter((c) => c.kind === 'items').map((c) => c.name),
    STOCK,
    WAREHOUSE,
  ];
}

/** Підсумок за позначками: останнє слово за найсвіжішою позначкою рядка */
function summarize(lines) {
  const last = new Map();
  lines.forEach((l) => last.set(`${l.sheet}#${l.row}`, l));
  const vals = [...last.values()];
  return {
    ok: vals.filter((l) => l.result === RESULT.ok).length,
    missing: vals.filter((l) => l.result === RESULT.missing).length,
    diff: vals.filter((l) => l.result === RESULT.diff).length,
    checked: vals.length,
    lines: vals,
  };
}

export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    const audits = await readAudits();

    // Розбір однієї звірки: не лише скільки, а що саме. Разом із позначками
    // віддаємо поточний стан обсягу — щоб було видно, чи річ відтоді знайшлась
    // і що про неї каже база (кому видана, де лежить).
    const wanted = (req.query.id || '').toString().trim();
    if (wanted) {
      const audit = audits.find((a) => a.id === wanted);
      if (!audit) return res.status(404).json({ error: 'Звірку не знайдено' });
      const [expected, lines] = await Promise.all([
        expectedFor(audit.scope),
        readLines(audit.id),
      ]);
      return res.json({ audit, expected: expected || [], lines });
    }

    const open = audits.find((a) => a.status === STATUS.open) || null;
    if (!open) return res.json({ open: null, audits, scopes: scopes() });

    const [expected, lines] = await Promise.all([
      expectedFor(open.scope),
      readLines(open.id),
    ]);
    return res.json({ open, expected: expected || [], lines, audits, scopes: scopes() });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};
  const audits = await readAudits();
  const open = audits.find((a) => a.status === STATUS.open) || null;

  if (action === 'start') {
    if (open) return res.status(400).json({ error: `Звірка ${open.id} ще триває` });
    const scope = (req.body.scope || '').toString();
    const expected = await expectedFor(scope);
    if (!expected) return res.status(400).json({ error: `Невідомий обсяг: ${scope}` });

    const id = await startAudit({ scope, expected: expected.length });
    await logChange({
      sheet: AUDIT_SHEET, action: 'Розпочато звірку', field: id,
      after: `${scope}, позицій: ${expected.length}`,
    });
    return res.json({ id, scope, expected, lines: [] });
  }

  if (!open) return res.status(400).json({ error: 'Немає відкритої звірки' });

  if (action === 'tick') {
    const lines = (req.body.lines || []).filter((l) => l && l.result);
    if (!lines.length) return res.json({ ok: true, added: 0 });
    await addLines(open.id, lines);
    return res.json({ ok: true, added: lines.length });
  }

  if (action === 'finish' || action === 'cancel') {
    const all = await readLines(open.id);
    const s = summarize(all);

    if (action === 'cancel') {
      await updateAudit(open.row, { status: STATUS.cancelled, finished: todayStr() });
      await logChange({ sheet: AUDIT_SHEET, action: 'Скасовано звірку', field: open.id });
      return res.json({ ok: true });
    }

    await updateAudit(open.row, {
      status: STATUS.done,
      ok: s.ok, missing: s.missing, diff: s.diff,
      finished: todayStr(),
      note: (req.body.note || '').toString(),
    });
    await logChange({
      sheet: AUDIT_SHEET, action: 'Завершено звірку', field: open.id,
      before: `очікувано ${open.expected}`,
      after: `підтверджено ${s.ok}, не знайдено ${s.missing}, розбіжностей ${s.diff}`,
    });
    return res.json({ ok: true, summary: { ok: s.ok, missing: s.missing, diff: s.diff } });
  }

  res.status(400).json({ error: 'Невідома дія' });
});
