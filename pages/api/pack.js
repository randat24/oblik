import { session, sameSecret, keyFrom } from '../../lib/auth';
import { readSheet, writeRow, appendRow, ensureSheet } from '../../lib/sheets';
import { logChange } from '../../lib/log';
import {
  DELIVERY_SHEET, DELIVERY_HEADERS, DL, STAGES, DRIVERS, PRIO_FIRST,
  parseDeliveries, deliveryRow, stampKyiv, suggestions, partsOf,
  splitParts, parseHot, joinHot, stampOf,
} from '../../lib/delivery';

/**
 * Пункт збору — окремий вхід за посиланням.
 *
 * Той, хто складає посилки й віддає їх на відправку, не має справи ні з
 * майном, ні зі складом, ні з рештою розділів: його робота — зібрати
 * коробку й записати, кому передав. Заводити йому позивний з PIN заради
 * двох дій — зайве, тож він заходить за ключем у посиланні.
 *
 * Ключ відкриває рівно дві дії: створити посилку й позначити передачу.
 * Ані правити чуже, ані видаляти, ані закривати доставку звідси не можна —
 * це вже робота чергового, і вона лишається за входом.
 *
 * Без PACK_TOKEN маршрут не існує: поки змінної немає, посилання просто
 * нікуди не веде.
 */

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

let headersFixed = false;

/** Скільки діб передані посилки лишаються на очах у збирача */
const SEEN_DAYS = 2;

function allowed(req) {
  const secret = process.env.PACK_TOKEN;
  if (!secret || secret.length < 16) return { ok: false, missing: true };
  // свій вхід теж годиться: черговий має бачити той самий екран, не
  // розшукуючи ключ, коли треба показати новенькому, як це працює
  if (session(req)) return { ok: true, who: session(req).callsign || '' };
  if (sameSecret(String(keyFrom(req)), secret)) return { ok: true, who: '' };
  return { ok: false };
}

/**
 * Що видно збирачеві: те, що ще не поїхало, і те, що він щойно віддав.
 * Уся історія доставок йому ні до чого — вона тільки заважає знайти
 * коробку, яка стоїть поруч і чекає водія.
 */
function visible(list, now = Date.now()) {
  const from = now - SEEN_DAYS * 86400000;
  return list
    .filter((d) => !d.isLost && (
      d.stage === 'packed' || (d.stage === 'handed' && stampOf(d.dates.handed) >= from)
    ))
    .map((d) => {
      const p = partsOf(d);
      return {
        row: d.row,
        what: d.what,
        to: d.to,
        weight: d.weight,
        note: d.note,
        giver: d.giver,
        driver: d.driver,
        stage: d.stage,
        created: d.created,
        handed: d.dates.handed,
        parts: p && {
          total: p.total, hot: p.hot, kg: p.kg,
          names: p.items.map((x) => ({ name: x.name, kg: x.kg, hot: x.hot })),
        },
      };
    })
    .sort((a, b) => stampOf(b.created) - stampOf(a.created));
}

export default async function handler(req, res) {
  const gate = allowed(req);
  if (gate.missing) return res.status(404).json({ error: 'Not found' });
  if (!gate.ok) return res.status(401).json({ error: 'Не той ключ' });

  await ensureSheet(DELIVERY_SHEET, DELIVERY_HEADERS);

  const values = await readSheet(DELIVERY_SHEET);
  if ((values[0] || []).length < DELIVERY_HEADERS.length && !headersFixed) {
    headersFixed = true;
    try { await writeRow(DELIVERY_SHEET, 1, DELIVERY_HEADERS); } catch (e) {
      console.error('не вдалося оновити заголовки доставок:', e.message);
    }
  }
  const list = parseDeliveries(values);

  /*
   * Читаємо лист заново, а не віддаємо той, що прочитали на початку: інакше
   * щойно створена посилка не з'явиться у відповіді, і людина натисне
   * «зберегти» вдруге, вирішивши, що не спрацювало.
   */
  const state = async () => {
    const fresh = parseDeliveries(await readSheet(DELIVERY_SHEET));
    return {
      ok: true,
      list: visible(fresh),
      drivers: suggestions(fresh, 'driver', DRIVERS),
      tos: suggestions(fresh, 'to', []),
    };
  };

  if (req.method === 'GET') return res.json(await state());
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};
  // позивний збирача приходить із самої сторінки: сесії тут немає, а
  // «хто здав» має бути записане — інакше через тиждень нема кого спитати
  const me = str(req.body.me) || gate.who;

  if (action === 'add') {
    const { what, weight, note, to, parts, partsHot, prio } = req.body;
    if (!str(what)) return res.status(400).json({ error: 'Не вказано назву' });
    if (!me) return res.status(400).json({ error: 'Вкажіть свій позивний' });

    const now = stampKyiv();
    const hot = joinHot(parseHot(partsHot));
    const row = deliveryRow({
      created: now, what, weight, note, to, parts, prio, partsHot: hot,
      giver: me, dates: { packed: now },
    });
    await appendRow(DELIVERY_SHEET, row, { raw: true });

    const n = splitParts(parts).length;
    const hotN = parseHot(hot).size;
    await logChange({
      sheet: DELIVERY_SHEET, action: 'Зібрано', who: me, field: str(what),
      after: [
        `${str(weight) || '?'} кг`,
        n > 1 && `${n} місць`,
        str(to) && `для ${str(to)}`,
        hotN > 0 ? `${PRIO_FIRST}: ${hotN} з ${n}` : (str(prio) && PRIO_FIRST),
        'з пункту збору',
      ].filter(Boolean).join(' · '),
    });
    return res.json(await state());
  }

  if (action === 'handed') {
    const { row, driver } = req.body;
    if (!row) return res.status(400).json({ error: 'Не вказано посилку' });
    if (!str(driver)) return res.status(400).json({ error: 'Вкажіть, кому передали' });
    if (!me) return res.status(400).json({ error: 'Вкажіть свій позивний' });

    const prev = values[row - 1];
    if (!prev) return res.status(404).json({ error: 'Посилку не знайдено' });
    const cur = parseDeliveries([DELIVERY_HEADERS, prev])[0];

    // Звідси рухають лише на крок «передано»: закривати доставку має той,
    // хто бачить точку, а не той, хто віддав коробку водієві.
    if (cur.stage !== 'packed') {
      return res.status(400).json({ error: 'Цю посилку вже передали' });
    }

    const now = stampKyiv();
    const next = deliveryRow({
      ...cur,
      driver: str(driver),
      giver: cur.giver || me,
      dates: { ...cur.dates, handed: now },
    }, prev);
    await writeRow(DELIVERY_SHEET, row, next);
    await logChange({
      sheet: DELIVERY_SHEET, row, action: 'Передати на відправку', who: me,
      field: cur.what,
      before: STAGES[cur.at]?.label || '',
      after: `Передали · ${str(driver)} · з пункту збору`,
    });
    return res.json(await state());
  }

  return res.status(400).json({ error: 'Невідома дія: ' + action });
}
