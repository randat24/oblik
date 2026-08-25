import { withAuth, currentActor, isChief } from '../../lib/auth';
import { readSheet, writeRow, appendRow, deleteRow, ensureSheet } from '../../lib/sheets';
import { logChange } from '../../lib/log';
import { readAllLists, activeNames } from '../../lib/points';
import {
  DELIVERY_SHEET, DELIVERY_HEADERS, DL, STAGES, DRIVERS, POINTS, LOST_WHY, PRIO_FIRST,
  parseDeliveries, deliveryRow, stampKyiv, suggestions, stageOf,
  splitParts, parseDone, joinDone, partsOf, parseHot, joinHot,
} from '../../lib/delivery';

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Дати етапів із форми. Порожній рядок дозволений — це і є спосіб
 * відкотити етап. Усе, що не схоже на дату, лишається як було: краще
 * проігнорувати описку, ніж записати в картку «пʼятниця».
 */
const DATE_RE = /^\d{2}\.\d{2}\.\d{4}( \d{2}:\d{2})?$/;

function cleanDates(was, got) {
  const out = { ...was };
  STAGES.forEach((st) => {
    if (!(st.key in got)) return;
    const v = str(got[st.key]);
    if (v === '' || DATE_RE.test(v)) out[st.key] = v;
  });
  return out;
}

/*
 * Лист міг бути створений до появи колонки «Кому»: нові колонки дописані
 * в кінець, тож дані не зсунулись, але заголовок лишився коротким. Правимо
 * один раз на запуск і не падаючи — без шапки таблиця читається, а от без
 * сторінки людина лишається геть.
 */
let headersFixed = false;

/**
 * Позначки місць після правки переліку — за назвами, не за номерами.
 * Дописана на початку каністра зсуває всі номери, і галочка з третього
 * місця опинилась би на четвертому.
 */
function remapMarks(wasLabels, marks, parts) {
  const kept = new Map();
  wasLabels.forEach((label, i) => { if (marks.has(i + 1)) kept.set(label, marks.get(i + 1)); });
  const next = new Map();
  splitParts(parts).forEach((label, i) => { if (kept.has(label)) next.set(i + 1, kept.get(label)); });
  return next;
}

function remapDone(cur, parts) {
  return joinDone(remapMarks(splitParts(cur.parts), parseDone(cur.partsDone), parts));
}

/** Те саме для першочергових: у них замість дати просто позначка */
function remapHot(cur, parts) {
  const asMap = new Map([...parseHot(cur.partsHot)].map((n) => [n, '1']));
  return joinHot(new Set(remapMarks(splitParts(cur.parts), asMap, parts).keys()));
}

/**
 * Останній етап іде слідом за місцями.
 *
 * Посилка «прибула» тоді, коли прибуло все, що в ній їхало, — тож коли
 * відмічено останнє місце, дата доставки ставиться сама, а коли позначку
 * знімають, вона так само сама зникає. Інакше на картці стоїть «Прибула»,
 * а дві каністри з трьох ще на точці вильоту.
 */
function syncDelivered(d, stamp) {
  const labels = splitParts(d.parts);
  if (!labels.length) return d.dates;
  const done = parseDone(d.partsDone);
  const lost = parseDone(d.partsLost);
  // по кожному місцю має бути відповідь: приїхало або списане. Списані теж
  // закривають посилку — інакше вона висітиме «в дорозі» вічно, чекаючи
  // ящик, якого більше немає.
  const all = labels.every((_, i) => done.has(i + 1) || lost.has(i + 1));
  const any = labels.some((_, i) => done.has(i + 1));
  // усе списане — це не доставка: штамп «прибула» тут був би неправдою
  if (all && any && !d.dates.delivered) return { ...d.dates, delivered: stamp };
  if ((!all || !any) && d.dates.delivered) return { ...d.dates, delivered: '' };
  return d.dates;
}

async function state(extra = {}) {
  const [values, lists] = await Promise.all([
    readSheet(DELIVERY_SHEET),
    readAllLists(),
  ]);
  extra = { ...extra, lists };
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
    points: suggestions(list, 'point', POINTS),
    // Не з того, що вже вписали, а з переліків, які веде адміністратор:
    // інакше кожна описка ставала новим напрямком.
    ...(() => {
      const l = extra.lists || {};
      return {
        tos: activeNames(l.sp),
        // «Чим відправляють» — це транспорт: НРК, машина. Не позивний.
        transport: activeNames(l.transport),
        // Хто забирає посилку на точці вильоту
        takers: activeNames(l.takers),
      };
    })(),
    whys: LOST_WHY,
    ...extra,
    lists: undefined,
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
      const { what, weight, note, to, parts, prio, partsHot } = req.body;
      if (!str(what)) return res.status(400).json({ error: 'Не вказано назву' });
      const now = stampKyiv();
      const hot = joinHot(parseHot(partsHot));
      const row = deliveryRow({
        created: now, what, weight, note, to, parts, prio, partsHot: hot,
        giver: who, dates: { packed: now },
      });
      await appendRow(DELIVERY_SHEET, row, { raw: true });
      const n = splitParts(parts).length;
      const hotN = parseHot(hot).size;
      await logChange({
        sheet: DELIVERY_SHEET, action: 'Зібрано', field: str(what),
        after: [
          `${str(weight) || '?'} кг`,
          n > 1 && `${n} місць`,
          str(to) && `для ${str(to)}`,
          hotN > 0 ? `${PRIO_FIRST}: ${hotN} з ${n}` : (str(prio) && PRIO_FIRST),
        ].filter(Boolean).join(' · '),
      });
      return res.json(await state());
    }

    /*
     * Одне місце з відправки. «Вода, 3 шт» їде трьома каністрами, і на
     * точку вони потрапляють нарізно, тож позначка стоїть не на посилці,
     * а на конкретному місці. Дія перемикає: помилково натиснуте
     * знімається тим самим дотиком.
     */
    if (action === 'part') {
      const { row, n } = req.body;
      if (!row) return res.status(400).json({ error: 'Не вказано рядок' });
      const values = await readSheet(DELIVERY_SHEET);
      const prev = values[row - 1];
      if (!prev) return res.status(404).json({ error: 'Рядок не знайдено' });

      const cur = parseDeliveries([DELIVERY_HEADERS, prev])[0];
      const labels = splitParts(cur.parts);
      const i = Number(n);
      if (!(i >= 1 && i <= labels.length)) {
        return res.status(400).json({ error: 'Немає такого місця' });
      }

      const now = stampKyiv();
      const done = parseDone(cur.partsDone);
      const was = done.has(i);
      if (was) done.delete(i); else done.set(i, now);

      // у кожного місця своя дата: решту відвезли через день — це має бути
      // видно, а не сховатись за спільною датою всієї посилки
      // позначка «доставлено» знімає списання: місце знайшлось і приїхало
      const lost = parseDone(cur.partsLost);
      if (!was && lost.has(i)) lost.delete(i);

      const upd = { ...cur, partsDone: joinDone(done), partsLost: joinDone(lost) };
      const next = deliveryRow({ ...upd, dates: syncDelivered(upd, now) }, prev);
      await writeRow(DELIVERY_SHEET, row, next);
      // у журналі має бути видно саме місце, а не «щось із трьох»:
      // назва, вага й скільки лишилось після цього руху
      const p = partsOf(upd);
      const it = p.items[i - 1];
      await logChange({
        sheet: DELIVERY_SHEET, row,
        action: was ? 'Місце знято' : 'Місце доставлено',
        field: cur.what,
        after: [
          it.name,
          it.kg !== null && `${it.kg} кг`,
          `${done.size} з ${labels.length}`,
          p.left.length ? `лишилось: ${p.left.join(', ')}` : 'посилка закрита',
        ].filter(Boolean).join(' · '),
      });
      return res.json(await state());
    }

    /*
     * Списання. Ящик розбили при завантаженні, виліт скасували назовсім,
     * вантаж забрали на іншу точку — таке місце не їде і не приїхало, і
     * тримати його у «лишилось» означає щодня згадувати те, чого немає.
     *
     * Списують або окремі місця, або посилку цілком — і те, й те знімається
     * повторним викликом, бо помилитись тут легко, а сліди в журналі
     * лишаються в обох випадках.
     */
    if (action === 'lose') {
      const { row, parts: pick, why, undo } = req.body;
      if (!row) return res.status(400).json({ error: 'Не вказано рядок' });
      const values = await readSheet(DELIVERY_SHEET);
      const prev = values[row - 1];
      if (!prev) return res.status(404).json({ error: 'Рядок не знайдено' });

      const cur = parseDeliveries([DELIVERY_HEADERS, prev])[0];
      const labels = splitParts(cur.parts);
      const now = stampKyiv();
      const nums = Array.isArray(pick) ? pick.map(Number).filter((n) => n >= 1 && n <= labels.length) : [];

      if (labels.length && !nums.length && !undo) {
        return res.status(400).json({ error: 'Оберіть, які місця списати' });
      }

      const lost = parseDone(cur.partsLost);
      const done = parseDone(cur.partsDone);
      let upd;

      // причина живе поруч зі штампом: через півроку «17.08 списано» без
      // пояснення — це не облік, а загадка
      const mark = str(why) ? `${now} · ${str(why)}` : now;

      if (!labels.length) {
        // посилка без переліку — списується цілком, одним штампом
        upd = { ...cur, lost: undo ? '' : mark };
      } else if (undo) {
        // повернення: якщо вказані місця — знімаємо їх, інакше все списання
        if (nums.length) nums.forEach((n) => lost.delete(n));
        else lost.clear();
        upd = { ...cur, lost: '', partsLost: joinDone(lost) };
      } else {
        // списане місце не може лишатись доставленим: це взаємовиключні стани
        nums.forEach((n) => { lost.set(n, mark); done.delete(n); });
        upd = { ...cur, partsLost: joinDone(lost), partsDone: joinDone(done) };
      }

      const next = deliveryRow({ ...upd, dates: syncDelivered(upd, now) }, prev);
      await writeRow(DELIVERY_SHEET, row, next);

      const p = partsOf(upd);
      const names = labels.length
        ? nums.map((n) => partsOf(cur).items[n - 1].name).join(', ')
        : cur.what;
      await logChange({
        sheet: DELIVERY_SHEET, row,
        action: undo ? 'Списання скасовано' : 'Втрачено',
        field: cur.what,
        after: [
          names,
          !undo && str(why),
          p && `списано ${p.lost} з ${p.total}`,
          p && p.left.length ? `лишилось: ${p.left.join(', ')}` : null,
        ].filter(Boolean).join(' · '),
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
            error: need === 'driver' ? 'Вкажіть, хто відправляє'
              : need === 'point' ? 'Вкажіть точку'
              : 'Вкажіть, хто прийняв',
          });
        }
      }

      const now = stampKyiv();
      const dates = { ...cur.dates, [stage]: now };

      /*
       * «Доставлено» означає, що доставлено все. Якщо в посилки є перелік
       * місць, кнопка закриває їх усі — на картці не може стояти «прибула»
       * поруч із двома невідміченими каністрами. Ті, що вже мають свою
       * дату, її й зберігають: воду відвезли вчора, і це не сьогоднішня
       * подія.
       */
      const labels = splitParts(cur.parts);
      const done = parseDone(cur.partsDone);
      const lostMap = parseDone(cur.partsLost);
      let closed = 0;
      if (stage === 'delivered') {
        // списані місця кнопка не чіпає: вони не приїхали й не приїдуть,
        // і підмінити списання доставкою означало б сховати втрату
        labels.forEach((_, i) => {
          if (!done.has(i + 1) && !lostMap.has(i + 1)) { done.set(i + 1, now); closed++; }
        });
      }

      // Проміжні етапи, які пропустили, лишаються порожніми навмисно:
      // домалювати їх заднім числом означало б написати в журнал те,
      // чого не було.
      const next = deliveryRow({
        ...cur,
        driver: str(req.body.driver) || cur.driver,
        point: str(req.body.point) || cur.point,
        // Хто прийняв — це адресат, а не той, хто натиснув кнопку. Запис
        // у застосунку часто робить черговий зі свого телефона, і його
        // позивний у цьому полі означав би, що посилку прийняв він.
        taker: str(req.body.taker) || cur.taker || (stage === 'delivered' ? cur.to : ''),
        giver: cur.giver || who,
        partsDone: joinDone(done),
        dates,
      }, prev);

      await writeRow(DELIVERY_SHEET, row, next);
      await logChange({
        sheet: DELIVERY_SHEET, row, action: st.action,
        field: cur.what,
        before: STAGES[cur.at]?.label || '',
        after: [
          st.label,
          str(req.body.driver) || cur.driver,
          str(req.body.point) || cur.point,
          closed > 0 && `закрито місць: ${closed}`,
        ].filter(Boolean).join(' · '),
      });
      return res.json(await state());
    }

    if (action === 'update') {
      const { row } = req.body;
      if (!row) return res.status(400).json({ error: 'Не вказано рядок' });
      const values = await readSheet(DELIVERY_SHEET);
      const prev = values[row - 1];
      if (!prev) return res.status(404).json({ error: 'Рядок не знайдено' });
      if (!str(req.body.what)) return res.status(400).json({ error: 'Не вказано назву' });

      const cur = parseDeliveries([DELIVERY_HEADERS, prev])[0];
      // Перелік місць правлять і після відправки — дописують забуту
      // каністру. Позначки прив'язані до номерів, тож переносимо їх за
      // назвами: інакше дописане на початку зсуває всі галочки.
      const edited = 'parts' in req.body;
      const partsDone = edited ? remapDone(cur, str(req.body.parts)) : cur.partsDone;
      // Позначки черговості переносяться так само за назвами. Якщо форма
      // прислала свій список — беремо його, він уже про новий перелік.
      const partsHot = 'partsHot' in req.body
        ? joinHot(parseHot(req.body.partsHot))
        : (edited ? remapHot(cur, str(req.body.parts)) : cur.partsHot);

      /*
       * Дати етапів переписує лише головний.
       *
       * Це не звичайна правка описки: прибрана дата відкочує посилку на
       * етап назад, а дописана каже, що подія була тоді, коли її не було.
       * Решті лишається рухати посилку кнопками — так у картці лишається
       * те, що справді сталося.
       */
      const mayDates = isChief(who) && req.body.dates && typeof req.body.dates === 'object';
      const dates = mayDates ? cleanDates(cur.dates, req.body.dates) : cur.dates;
      const movedDates = mayDates
        ? STAGES.filter((st) => str(dates[st.key]) !== str(cur.dates[st.key]))
          .map((st) => `${st.label}: ${str(cur.dates[st.key]) || '—'} → ${str(dates[st.key]) || '—'}`)
        : [];

      const next = deliveryRow({ ...cur, ...req.body, partsDone, partsHot, dates }, prev);
      await writeRow(DELIVERY_SHEET, row, next);

      // зміну черговості видно окремо: це рішення, а не описка в назві
      const hotWas = parseHot(cur.partsHot).size + (cur.prio ? 1 : 0);
      const hotNow = parseHot(partsHot).size + (str(next[DL.prio]) ? 1 : 0);

      /*
       * Зміну людей теж видно окремо. «Хто здав» і «хто прийняв» — це
       * відповідальність: якщо їх поправили, у журналі має лишитись, що
       * саме стояло раніше, інакше правка нічим не відрізняється від
       * описки в назві.
       */
      const PEOPLE = [['driver', 'відправляє'], ['giver', 'здав'], ['taker', 'прийняв']];
      const moved = [
        ...PEOPLE
          .filter(([k]) => k in req.body && str(req.body[k]) !== str(cur[k]))
          .map(([k, label]) => `${label}: ${str(cur[k]) || '—'} → ${str(req.body[k]) || '—'}`),
        ...movedDates,
      ];

      await logChange({
        sheet: DELIVERY_SHEET, row,
        action: movedDates.length ? 'Правка дат'
          : moved.length ? 'Правка людей'
          : hotNow !== hotWas
            ? (hotNow > hotWas ? 'Перша черга' : 'Звичайна черга')
            : 'Правка',
        field: str(req.body.what),
        before: cur.what,
        after: moved.length
          ? moved.join(' · ')
          : hotNow !== hotWas
            ? `${str(req.body.what)} · першочергових місць: ${hotNow}`
            : str(req.body.what),
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
