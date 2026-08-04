import { withAuth } from '../../lib/auth';
import { writeCell, writeCells, appendRow, deleteRow, insertRowAt, todayStr } from '../../lib/sheets';
import {
  STOCK_SHEET, C, FIELD_LABELS, ACCOUNTING_OPTIONS,
  readStock, nextId, stockRow, appendMove,
} from '../../lib/stock';
import { logChange } from '../../lib/log';

const qtyOf = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN;
};

function payload(stock) {
  const { items, moves, categories, units, places, people } = stock;
  return { items, moves, categories, units, places, people, accountingOptions: ACCOUNTING_OPTIONS };
}

export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    return res.json(payload(await readStock()));
  }

  if (req.method === 'POST') {
    const { action } = req.body || {};
    const stock = await readStock();

    if (action === 'restore') {
      const { row, values } = req.body;
      await insertRowAt(STOCK_SHEET, row, values);
      await logChange({ sheet: STOCK_SHEET, row, action: 'Відновлення', after: (values || []).join(' | ') });
      return res.json(payload(await readStock()));
    }

    // приймання або списання наявної позиції
    if (action === 'receive' || action === 'writeoff') {
      const { row, who, note, photo } = req.body;
      const date = req.body.date || todayStr();
      const qty = qtyOf(req.body.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Кількість має бути більшою за 0' });
      }

      const item = stock.items.find((it) => it.row === Number(row));
      if (!item) return res.status(404).json({ error: 'Позицію не знайдено' });

      const isIn = action === 'receive';
      if (!isIn && qty > item.remainder) {
        return res.status(400).json({
          error: `Недостатньо залишку: доступно ${item.remainder} ${item.unit || 'шт.'}`,
        });
      }

      const received = isIn ? item.received + qty : item.received;
      const writtenOff = isIn ? item.writtenOff : item.writtenOff + qty;
      const left = received - writtenOff;

      await writeCells(STOCK_SHEET, [
        { row: item.row, col: C.received + 1, value: received },
        { row: item.row, col: C.writtenOff + 1, value: writtenOff },
        { row: item.row, col: C.remainder + 1, value: left },
        { row: item.row, col: C.updated + 1, value: date },
      ]);

      await appendMove({
        id: item.id, name: item.name, action: isIn ? 'Прийнято' : 'Списано',
        qty, left, who, note, photo, date,
      });

      await logChange({
        sheet: STOCK_SHEET, row: item.row,
        action: isIn ? 'Прийнято' : 'Списано',
        field: item.name,
        before: `залишок ${item.remainder}`,
        after: `${isIn ? '+' : '−'}${qty} ${item.unit || 'шт.'}, залишок ${left}${who ? ` (${who})` : ''}`,
        photo,
      });

      return res.json(payload(await readStock()));
    }

    // нова позиція
    const { category, name, description, unit, place, notes, photo1, photo2, who, accounting } = req.body;
    if (!String(name || '').trim()) return res.status(400).json({ error: 'Вкажіть найменування' });
    const received = qtyOf(req.body.received) || 0;
    if (received < 0) return res.status(400).json({ error: 'Кількість не може бути від’ємною' });
    const date = req.body.date || todayStr();

    const id = nextId(stock.items);
    await appendRow(STOCK_SHEET, stockRow({
      id, category, name, description, unit, received, writtenOff: 0,
      place, photo1, photo2, notes, date, accounting,
    }));

    if (received > 0) {
      await appendMove({
        id, name, action: 'Прийнято', qty: received, left: received,
        who, note: 'початковий облік', photo: photo1, date,
      });
    }

    await logChange({
      sheet: STOCK_SHEET, action: 'Додано позицію', field: name,
      after: `${id}${category ? `, ${category}` : ''}${accounting ? `, ${accounting}` : ''}, прийнято ${received} ${unit || 'шт.'}`.trim(),
      photo: photo1,
    });

    return res.json({ ...payload(await readStock()), id });
  }

  if (req.method === 'PATCH') {
    const { row, field, value, prev } = req.body || {};
    const col = C[field];
    if (col === undefined || !FIELD_LABELS[field]) {
      return res.status(400).json({ error: `Невідоме поле: ${field}` });
    }
    await writeCell(STOCK_SHEET, row, col + 1, value);
    await writeCell(STOCK_SHEET, row, C.updated + 1, todayStr());
    await logChange({
      sheet: STOCK_SHEET, row, action: 'Редагування',
      field: FIELD_LABELS[field], before: prev, after: value,
    });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { row } = req.body || {};
    const stock = await readStock();
    const item = stock.items.find((it) => it.row === Number(row));
    if (!item) return res.status(404).json({ error: 'Позицію не знайдено' });

    // зберігаємо рядок, щоб видалення можна було скасувати
    const deleted = stock.values[row - 1] || [];
    await deleteRow(STOCK_SHEET, row);
    await logChange({
      sheet: STOCK_SHEET, row, action: 'Видалено позицію',
      field: item.name, before: deleted.join(' | '),
    });
    return res.json({ ...payload(await readStock()), deleted });
  }

  res.status(405).json({ error: 'Method not allowed' });
});
