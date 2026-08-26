import { session, sameSecret, keyFrom } from '../../lib/auth';
import { readSheet, writeRow, appendRow, ensureSheet } from '../../lib/sheets';
import { logChange } from '../../lib/log';
import { readList, activeNames } from '../../lib/points';
import {
  DELIVERY_SHEET, DELIVERY_HEADERS, DL, PRIO_FIRST,
  parseDeliveries, deliveryRow, stampKyiv, partsOf,
  splitParts, parseHot, joinHot, stampOf, remapDone, remapLost, remapHot,
} from '../../lib/delivery';

/**
 * Пункт збору — окремий вхід за посиланням.
 *
 * Той, хто складає посилки, не має справи ні з майном, ні зі складом, ні
 * з рештою розділів: його робота — зібрати коробку й записати, що в ній.
 * Заводити йому позивний з PIN заради однієї дії — зайве, тож він
 * заходить за ключем у посиланні.
 *
 * Ключ відкриває дві дії: створити посилку й виправити її, доки вона не
 * доїхала. Збирач пише те, що знає сам: що в коробці, на яке СП вона й
 * кому на точці її везуть. Чим її відправили, хто справді прийняв і коли
 * вона дійшла — відмічає черговий: цього збирач не вирішує, а зайве поле
 * у формі означає зайву можливість помилитись. Видаляти, губити й
 * закривати доставку звідси теж не можна.
 *
 * Без PACK_TOKEN маршрут не існує: поки змінної немає, посилання просто
 * нікуди не веде.
 */

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

let headersFixed = false;

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
 * Що видно збирачеві: рівно те, що ще в дорозі.
 *
 * Доставлені звідси прибрані навмисно. Вони не додавали роботи — правити
 * їх однаково не можна, — зате додавали карток, і в списку починало
 * рябіти: доставлене плуталося з тим, що ще чекає. Тут має лишатись
 * тільки те, за що збирач ще відповідає.
 *
 * Куди посилка врешті дійшла, видно черговому — у нього для цього є вся
 * історія.
 */
function visible(list) {
  return list
    .filter((d) => !d.isLost && !d.done)
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
        taker: d.taker,
        pilot: d.pilot,
        stage: d.stage,
        created: d.created,
        handed: d.dates.handed,
        atbase: d.dates.atbase,
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
    const [fresh, sp, pilots] = await Promise.all([
      readSheet(DELIVERY_SHEET).then(parseDeliveries),
      readList('sp'),
      readList('takers'),
    ]);
    return {
      ok: true,
      list: visible(fresh),
      // Обидва переліки веде адміністратор: додав нового — і він того ж
      // дня стоїть у формі збирача, без жодної правки коду.
      tos: activeNames(sp),
      pilots: activeNames(pilots),
    };
  };

  if (req.method === 'GET') return res.json(await state());
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};
  // позивний збирача приходить із самої сторінки: сесії тут немає, а
  // «хто здав» має бути записане — інакше через тиждень нема кого спитати
  const me = str(req.body.me) || gate.who;

  if (action === 'add') {
    const { what, weight, note, to, parts, partsHot, prio, pilot } = req.body;
    if (!str(what)) return res.status(400).json({ error: 'Не вказано назву' });

    const now = stampKyiv();
    const hot = joinHot(parseHot(partsHot));
    const row = deliveryRow({
      created: now, what, weight, note, to, parts, prio, partsHot: hot, pilot,
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
        str(pilot) && `дроном: ${str(pilot)}`,
        hotN > 0 ? `${PRIO_FIRST}: ${hotN} з ${n}` : (str(prio) && PRIO_FIRST),
        'з пункту збору',
      ].filter(Boolean).join(' · '),
    });
    return res.json(await state());
  }

  /*
   * Правка своєї збірки.
   *
   * Забутий мішок згадують не за хвилину після збереження, а тоді, коли
   * коробка вже поїхала. Тому правити можна доти, доки посилка не
   * доїхала: етап значення не має.
   *
   * Позначки місць при цьому не губляться — вони переносяться за
   * назвами. Дописаний на початку мішок не зсуває галочку з того, що вже
   * приїхало, а зникле місце просто втрачає свою позначку.
   *
   * Доставлену вже не чіпаємо: її бачили на тому кінці, і переписувати
   * заднім числом те, що вже отримали, — не виправлення, а підміна.
   *
   * Дата збирання, дата створення й той, хто зібрав, лишаються старі:
   * правка — це виправлення запису, а не нова посилка.
   */
  if (action === 'edit') {
    const { row, what, weight, note, to, parts, partsHot, prio, pilot } = req.body;
    if (!row) return res.status(400).json({ error: 'Не вказано посилку' });
    if (!str(what)) return res.status(400).json({ error: 'Не вказано назву' });

    const prev = values[row - 1];
    if (!prev) return res.status(404).json({ error: 'Посилку не знайдено' });
    const cur = parseDeliveries([DELIVERY_HEADERS, prev])[0];

    if (cur.done) {
      return res.status(400).json({
        error: 'Посилку вже доставили — виправити може лише черговий',
      });
    }

    // Перелік мішків міг змінитись, а позначки стоять на номерах. Тому
    // переносимо їх за назвами: те, що вже приїхало, лишається
    // відміченим, дописане стає новим місцем.
    const nextParts = str(parts);
    const next = deliveryRow({
      ...cur,
      what, weight, note, to, prio, pilot,
      parts: nextParts,
      partsHot: joinHot(parseHot(partsHot)),
      partsDone: remapDone(cur, nextParts),
      partsLost: remapLost(cur, nextParts),
    }, prev);
    await writeRow(DELIVERY_SHEET, row, next);

    await logChange({
      sheet: DELIVERY_SHEET, row, action: 'Виправлено', who: me,
      field: str(what),
      before: [
        cur.what,
        cur.parts && `місця: ${cur.parts}`,
        cur.pilot && `дроном: ${cur.pilot}`,
      ].filter(Boolean).join(' · '),
      after: [
        nextParts && `місця: ${nextParts}`,
        str(pilot) && `дроном: ${str(pilot)}`,
        'з пункту збору',
      ].filter(Boolean).join(' · '),
    });
    return res.json(await state());
  }

  return res.status(400).json({ error: 'Невідома дія: ' + action });
}
