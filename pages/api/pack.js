import { session, sameSecret, keyFrom } from '../../lib/auth';
import { readSheet, writeRow, appendRow, ensureSheet } from '../../lib/sheets';
import { logChange } from '../../lib/log';
import { readPoints, activeNames } from '../../lib/points';
import {
  DELIVERY_SHEET, DELIVERY_HEADERS, DL, PRIO_FIRST,
  parseDeliveries, deliveryRow, stampKyiv, partsOf,
  splitParts, parseHot, joinHot, stampOf,
} from '../../lib/delivery';

/**
 * Пункт збору — окремий вхід за посиланням.
 *
 * Той, хто складає посилки, не має справи ні з майном, ні зі складом, ні
 * з рештою розділів: його робота — зібрати коробку й записати, що в ній.
 * Заводити йому позивний з PIN заради однієї дії — зайве, тож він
 * заходить за ключем у посиланні.
 *
 * Ключ відкриває рівно одну дію: створити посилку. Кому її віддали — НРК
 * чи комусь із пілотів — відмічає черговий: збирач цього однаково не
 * вирішує, а зайве поле у формі означає зайву можливість помилитись.
 * Правити чуже, видаляти й закривати доставку звідси теж не можна.
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
 * Що видно збирачеві: те, що ще не поїхало, і те, що вже забрали.
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
      tos: activeNames(await readPoints()),
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

  /*
   * Правка щойно зібраної посилки.
   *
   * Помилку в назві чи в переліку мішків знаходять за хвилину після
   * збереження, і просити заради цього чергового — довше, ніж набрати
   * заново. Тому правити можна, але лише доки посилка ще тут: щойно її
   * забрали, картку бачили інші люди й діяли за нею, і мовчки міняти під
   * ними написане не можна.
   *
   * Дата збирання, дата створення й той, хто зібрав, лишаються старі:
   * правка — це виправлення запису, а не нова посилка.
   */
  if (action === 'edit') {
    const { row, what, weight, note, to, parts, partsHot, prio } = req.body;
    if (!row) return res.status(400).json({ error: 'Не вказано посилку' });
    if (!str(what)) return res.status(400).json({ error: 'Не вказано назву' });

    const prev = values[row - 1];
    if (!prev) return res.status(404).json({ error: 'Посилку не знайдено' });
    const cur = parseDeliveries([DELIVERY_HEADERS, prev])[0];

    if (cur.stage !== 'packed') {
      return res.status(400).json({
        error: 'Посилку вже забрали — виправити може лише черговий',
      });
    }

    const hot = joinHot(parseHot(partsHot));
    const next = deliveryRow({
      ...cur,
      what, weight, note, to, parts, prio, partsHot: hot,
      // перелік мішків міг змінитись, а позначки доставленого й
      // списаного стоять на номерах — на цьому етапі їх ще немає, тож
      // чистимо, щоб вони не з'їхали на чужі мішки
      partsDone: '', partsLost: '',
    }, prev);
    await writeRow(DELIVERY_SHEET, row, next);

    await logChange({
      sheet: DELIVERY_SHEET, row, action: 'Виправлено', who: me,
      field: str(what),
      before: [cur.what, cur.parts && `місця: ${cur.parts}`].filter(Boolean).join(' · '),
      after: [str(parts) && `місця: ${str(parts)}`, 'з пункту збору'].filter(Boolean).join(' · '),
    });
    return res.json(await state());
  }

  return res.status(400).json({ error: 'Невідома дія: ' + action });
}
