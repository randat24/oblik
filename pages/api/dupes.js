import { withAuth, currentActor } from '../../lib/auth';
import {
  SHEET_CONFIGS, readSheet, readSheets, appendRow, ensureSheet, writeCells, findColumns,
} from '../../lib/sheets';
import { crossDupes, dismissedKeys, withoutDismissed, normalizeSn } from '../../lib/dupes';
import { logChange } from '../../lib/log';

/**
 * Повтори між листами: усі групи й дії над ними.
 *
 * Номери рядків тут беремо з позиції в листі, а не з відфільтрованого
 * списку: порожні рядки посеред листа інакше зсунули б номери, а за
 * номером потім видаляють.
 */

export const DISMISS_SHEET = 'Повтори — не повтор';
const DISMISS_HEADERS = ['Ключ', 'Серійник', 'Хто', 'Коли'];

async function readDismissed() {
  try {
    return dismissedKeys(await readSheet(DISMISS_SHEET));
  } catch {
    return new Set();
  }
}

export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    const targets = SHEET_CONFIGS.filter((c) => c.kind === 'items');
    let all;
    try {
      all = await readSheets(targets.map((c) => c.name));
    } catch {
      all = targets.map(() => []);
    }

    const sheets = [];
    const headersOf = {};
    targets.forEach((cfg, i) => {
      const values = all[i] || [];
      if (!values.length) return;
      const headers = (values[0] || []).map((h) => (h ?? '').toString().trim());
      headersOf[cfg.name] = headers;
      sheets.push({
        name: cfg.name,
        cols: findColumns(headers),
        items: values.slice(1).map((r, k) => ({ row: k + 2, values: r || [] })),
      });
    });

    const keys = await readDismissed();
    const found = crossDupes(sheets);
    const groups = withoutDismissed(found, keys).map((g) => ({
      ...g,
      places: g.places.map((p) => {
        const sh = sheets.find((s) => s.name === p.sheet);
        const values = sh?.items.find((it) => it.row === p.row)?.values || [];
        const headers = headersOf[p.sheet] || [];
        // показуємо все, що заповнене: за однією назвою рішення не ухвалиш
        const fields = headers
          .map((h, idx) => ({ h, v: (values[idx] ?? '').toString().trim() }))
          .filter((f) => f.h && f.v);
        return { ...p, fields };
      }),
    }));
    return res.json({ groups, dismissed: found.length - groups.length });
  }

  if (req.method === 'POST') {
    const { action, sn } = req.body || {};
    const key = normalizeSn(sn);
    if (!key) return res.status(400).json({ error: 'Немає серійника' });

    if (action === 'dismiss') {
      await ensureSheet(DISMISS_SHEET, DISMISS_HEADERS);
      const keys = await readDismissed();
      if (!keys.has(key)) {
        await appendRow(DISMISS_SHEET, [key, String(sn), currentActor(), new Date().toISOString()], { raw: true });
        await logChange({ sheet: 'Повтори', action: 'Не повтор', after: String(sn) });
      }
      return res.json({ ok: true });
    }

    if (action === 'restore') {
      // повернути групу в список: стираємо ключ у першій колонці службового листа
      let values;
      try { values = await readSheet(DISMISS_SHEET); } catch { values = []; }
      const at = values.findIndex((r, i) => i > 0 && String((r || [])[0] || '').trim() === key);
      if (at > 0) {
        await writeCells(DISMISS_SHEET, [{ row: at + 1, col: 1, value: '' }], { raw: true });
        await logChange({ sheet: 'Повтори', action: 'Знову повтор', after: String(sn) });
      }
      return res.json({ ok: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
