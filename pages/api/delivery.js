import { withAuth, currentActor } from '../../lib/auth';
import { readSheet, writeRow, appendRow, deleteRow, ensureSheet } from '../../lib/sheets';
import { logChange } from '../../lib/log';
import {
  DELIVERY_SHEET, DELIVERY_HEADERS, DL, STAGES, DRIVERS, POINTS,
  parseDeliveries, deliveryRow, stampKyiv, suggestions, stageOf,
} from '../../lib/delivery';

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

/*
 * Лист міг бути створений до появи колонки «Кому»: нові колонки дописані
 * в кінець, тож дані не зсунулись, але заголовок лишився коротким. Правимо
 * один раз на запуск і не падаючи — без шапки таблиця читається, а от без
 * сторінки людина лишається геть.
 */
let headersFixed = false;

async function state(extra = {}) {
  const values = await readSheet(DELIVERY_SHEET);
  if ((values[0] || []).length < DELIVERY_HEADERS.length && !headersFixed) {
    headersFixed = true;
    try { await writeRow(DELIVERY_SHEET, 1, DELIVERY_HEADERS); } catch (e) {
      console.error('не вдалося оновити заголовки доставок:', e.message);
    }
  }
  const list = parseDeliveries(values);
  return {
    list,
    stages: STAGES.map(({ key, label, short, action, hint, needs }) => ({ key, label, short, action, hint, needs: needs || [] })),
    drivers: suggestions(list, 'driver', DRIVERS),
    points: suggestions(list, 'point', POINTS),
    tos: suggestions(list, 'to', []),
    ...extra,
  };
}

export default withAuth(async (req, res) => {
  await ensureSheet(DELIVERY_SHEET, DELIVERY_HEADERS);
  const who = currentActor() || '';

  if (req.method === 'GET') {
    return res.json(await state());
  }

  if (req.method === 'POST') {
    const { action } = req.body || {};

    // Нова посилка одразу на першому етапі: складена — значить зібрана,
    // окремої кнопки «підтвердити збирання» тут не треба.
    if (action === 'add') {
      const { what, weight, note, to } = req.body;
      if (!str(what)) return res.status(400).json({ error: 'Не вказано вміст' });
      const now = stampKyiv();
      const row = deliveryRow({
        created: now, what, weight, note, to,
        giver: who, dates: { packed: now },
      });
      await appendRow(DELIVERY_SHEET, row, { raw: true });
      await logChange({
        sheet: DELIVERY_SHEET, action: 'Зібрано', field: str(what),
        after: [`${str(weight) || '?'} кг`, str(to) && `для ${str(to)}`].filter(Boolean).join(' · '),
      });
      return res.json(await state());
    }

    if (action === 'stage') {
      const { row, stage } = req.body;
      if (!row) return res.status(400).json({ error: 'Не вказано рядок' });
      const idx = STAGES.findIndex((s) => s.key === stage);
      if (idx < 0) return res.status(400).json({ error: 'Невідомий етап' });

      const values = await readSheet(DELIVERY_SHEET);
      const prev = values[row - 1];
      if (!prev) return res.status(404).json({ error: 'Рядок не знайдено' });

      const cur = parseDeliveries([DELIVERY_HEADERS, prev])[0];
      const st = STAGES[idx];
      for (const need of st.needs || []) {
        const v = str(req.body[need]) || cur[need];
        if (!v) {
          return res.status(400).json({
            error: need === 'driver' ? 'Вкажіть водія'
              : need === 'point' ? 'Вкажіть точку'
              : 'Вкажіть, хто прийняв',
          });
        }
      }

      const now = stampKyiv();
      const dates = { ...cur.dates, [stage]: now };
      // Проміжні етапи, які пропустили, лишаються порожніми навмисно:
      // домалювати їх заднім числом означало б написати в журнал те,
      // чого не було.
      const next = deliveryRow({
        ...cur,
        driver: str(req.body.driver) || cur.driver,
        point: str(req.body.point) || cur.point,
        taker: str(req.body.taker) || cur.taker,
        giver: cur.giver || who,
        dates,
      }, prev);

      await writeRow(DELIVERY_SHEET, row, next);
      await logChange({
        sheet: DELIVERY_SHEET, row, action: st.action,
        field: cur.what,
        before: STAGES[cur.at]?.label || '',
        after: [st.label, str(req.body.driver) || cur.driver, str(req.body.point) || cur.point]
          .filter(Boolean).join(' · '),
      });
      return res.json(await state());
    }

    if (action === 'update') {
      const { row } = req.body;
      if (!row) return res.status(400).json({ error: 'Не вказано рядок' });
      const values = await readSheet(DELIVERY_SHEET);
      const prev = values[row - 1];
      if (!prev) return res.status(404).json({ error: 'Рядок не знайдено' });
      if (!str(req.body.what)) return res.status(400).json({ error: 'Не вказано вміст' });

      const cur = parseDeliveries([DELIVERY_HEADERS, prev])[0];
      const next = deliveryRow({ ...cur, ...req.body, dates: cur.dates }, prev);
      await writeRow(DELIVERY_SHEET, row, next);
      await logChange({
        sheet: DELIVERY_SHEET, row, action: 'Правка',
        field: str(req.body.what), before: cur.what, after: str(req.body.what),
      });
      return res.json(await state());
    }

    return res.status(400).json({ error: 'Невідома дія: ' + action });
  }

  if (req.method === 'DELETE') {
    const { row } = req.body || {};
    if (!row) return res.status(400).json({ error: 'Не вказано рядок' });
    const values = await readSheet(DELIVERY_SHEET);
    const prev = values[row - 1];
    await deleteRow(DELIVERY_SHEET, row);
    await logChange({
      sheet: DELIVERY_SHEET, row, action: 'Видалено',
      before: prev ? String(prev[DL.what] || '') : '',
    });
    return res.json(await state());
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
