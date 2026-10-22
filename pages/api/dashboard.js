import { withAuth } from '../../lib/auth';
import { SHEET_CONFIGS, readSheet, readSheets, findColumns } from '../../lib/sheets';
import { crossDupes } from '../../lib/dupes';
import { readStock } from '../../lib/stock';
import { readLog } from '../../lib/log';
import { readActs } from '../../lib/acts';
import { readAudits, STATUS } from '../../lib/audit';
import {
  DELIVERY_SHEET, STAGES, parseDeliveries, partsLeft, partsOf,
  stuck, byPoint, deliveredWithin, weightLeft, placesOf, lostOf, hotOf,
} from '../../lib/delivery';

const WAREHOUSE = 'Склад';

const lower = (v) => (v || '').toString().toLowerCase();
const isLost = (s) => lower(s).includes('втрач') || lower(s).includes('утер');
const isIssued = (s) => lower(s).includes('видан');
// «Склад» і «КСП» — це те, що лежить у нас під рукою
const isAvailable = (s) => lower(s).includes('ксп') || lower(s).includes('склад');
// За документами річ числиться, якщо так каже колонка обліку або тип «Учт.».
// Перевіряємо початок рядка: «не на обліку» теж містить «на облік».
const isBooked = (acc, type) => {
  const a = lower(acc).trim();
  if (a.startsWith('не')) return false;
  return a.startsWith('на облік') || a.startsWith('облікове') || lower(type).trim().startsWith('учт');
};

/** Скільки днів минуло від дати у форматі дд.мм.рррр */
function daysSince(d) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((d || '').toString().trim());
  if (!m) return null;
  const then = Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return Math.floor((Date.now() - then) / 86400000);
}

/** Колонка «Оф облік» — окрема від типу, шукаємо за заголовком */
function accountingCol(headers) {
  return headers.findIndex((h) => {
    const s = lower(h);
    return s.includes('облік') && !s.includes('не облік');
  });
}

async function itemsSummary() {
  const targets = SHEET_CONFIGS.filter((c) => c.kind === 'items');
  const perSheet = [];
  const byStatus = new Map();
  const lost = [];
  let total = 0;
  let available = 0;
  let issued = 0;
  let booked = 0;

  /*
   * Шість листів однією відповіддю, а не шістьма запитами. Квота Google —
   * шістдесят читань на хвилину на користувача, і саме ця функція з'їдала
   * її найшвидше: кілька відкриттів головної поспіль, і сервіс відповідав
   * «Quota exceeded» замість даних.
   */
  let all;
  try {
    all = await readSheets(targets.map((c) => c.name));
  } catch {
    all = targets.map(() => []);
  }

  /*
   * Листи для пошуку повторів між ними. Збираємо тут же, з того самого
   * `batchGet`: окремого читання це не коштує жодного.
   */
  const forCross = [];

  targets.forEach((cfg, ti) => {
    const values = all[ti] || [];
    if (!values.length) return;
    const headers = values[0] || [];
    const cols = findColumns(headers);
    const idIdx = cols.id >= 0 && cols.id !== cols.name ? cols.id : -1;
    const accIdx = accountingCol(headers);
    const rows = values.slice(1).filter((r) => (r || []).join('').trim());

    const s = { name: cfg.name, count: rows.length, available: 0, issued: 0, booked: 0 };
    rows.forEach((r, i) => {
      const status = cols.status >= 0 ? (r[cols.status] || '').toString().trim() : '';
      const type = cols.type >= 0 ? (r[cols.type] || '').toString().trim() : '';
      const acc = accIdx >= 0 ? (r[accIdx] || '').toString().trim() : '';

      if (status && !cfg.hideStatus) byStatus.set(status, (byStatus.get(status) || 0) + 1);
      if (isAvailable(status)) s.available++;
      if (isIssued(status)) s.issued++;
      if (isBooked(acc, type)) s.booked++;
      if (isLost(status)) {
        lost.push({
          sheet: cfg.name, row: i + 2,
          name: (r[cols.name] || '').toString(),
          ident: idIdx >= 0 ? (r[idIdx] || '').toString() : '',
          who: cols.who >= 0 ? (r[cols.who] || '').toString() : '',
        });
      }
    });

    forCross.push({
      name: cfg.name,
      cols,
      items: rows.map((r, i) => ({ row: i + 2, values: r })),
    });

    perSheet.push(s);
    total += rows.length;
    available += s.available;
    issued += s.issued;
    booked += s.booked;
  });

  perSheet.sort((a, b) => b.count - a.count);
  return {
    total, available, issued, booked,
    perSheet,
    byStatus: [...byStatus.entries()].sort((a, b) => b[1] - a[1]),
    lost,
    // той самий серійник у двох різних листах — одна річ на двох обліках
    cross: crossDupes(forCross).slice(0, 20),
  };
}

async function warehouseSummary() {
  let values;
  try {
    values = await readSheet(WAREHOUSE);
  } catch {
    return { total: 0, stale: [] };
  }
  const rows = values.slice(1).filter((r) => (r || []).join('').trim());
  const stale = [];
  rows.forEach((r) => {
    const code = (r[0] || '').toString();
    const name = (r[2] || '').toString();
    // 10 — «Оновлено», 7 — «Перевірено» для листів, де оновлення ще не писалось
    const days = daysSince(r[10]) ?? daysSince(r[7]);
    if (days !== null && days >= 90) stale.push({ code, name, days });
  });
  stale.sort((a, b) => b.days - a.days);
  return { total: rows.length, stale: stale.slice(0, 12) };
}

/**
 * Доставки на головній.
 *
 * Логістику видно не за кількістю посилок, а за тим, скільки ще везти:
 * одна посилка може бути трьома каністрами, з яких дві ще на точці вильоту.
 * Тому поруч із коробками рахуємо й місця.
 */
async function deliverySummary() {
  let values;
  try {
    values = await readSheet(DELIVERY_SHEET);
  } catch {
    // листа ще немає — розділом просто не користувались
    return null;
  }
  const list = parseDeliveries(values);
  if (!list.length) return null;

  const onWay = list.filter((d) => !d.done && !d.isLost);
  const byStage = STAGES.map((s) => ({
    key: s.key, label: s.label,
    n: list.filter((d) => d.stage === s.key && !d.done && !d.isLost).length,
  }));
  const late = stuck(list);

  return {
    onWay: onWay.length,
    // Посилка й місце — різні одиниці. «Вода, 3 шт» їде однією карткою, а
    // прибуває трьома приїздами, і питання «скільки ще везти» рахується
    // саме в місцях: посилками воно завжди «одна», хоч дві третини вже там.
    places: placesOf(onWay),
    lost: lostOf(list),
    // Черговість: те, що чекає найближчого борту, має бути видно з головної,
    // а не всередині розділу серед двох десятків карток. Рахуємо мішками —
    // борт бере не посилку цілком, а скільки підніме.
    hot: hotOf(list),
    urgent: onWay.filter((d) => d.urgent).map((d) => {
      const p = partsOf(d);
      return {
        what: d.what, to: d.to, stage: STAGES[d.at]?.label || 'Нова',
        places: p ? p.hotLeft : 1,
        names: p ? p.hotNames : [],
        kg: p ? Math.round(p.kgHot * 10) / 10 : Math.round(weightLeft([d]) * 10) / 10,
      };
    }),
    // вага того, що ще везти, а не всіх посилок цілком
    kg: Math.round(weightLeft(onWay) * 10) / 10,
    delivered: list.filter((d) => d.done).length,
    // місця, що вже приїхали, — разом із тими, чия посилка ще в дорозі:
    // дві каністри з трьох доставлені, і це доставка, а не нуль
    donePlaces: placesOf(list).done,
    week: deliveredWithin(list, 7).length,
    byStage,
    points: byPoint(list).filter((x) => x.name !== '—').slice(0, 6),
    parts: partsLeft(list),
    late: late.slice(0, 4).map((d) => ({
      what: d.what, to: d.to, days: d.days,
      stage: STAGES[d.at]?.label || '', driver: d.driver,
    })),
    lateTotal: late.length,
    // посилки, від яких лишились окремі місця, — головне питання дня:
    // «що ще везти» стоїть саме тут
    open: onWay
      .map((d) => ({ d, p: partsOf(d) }))
      .filter((x) => x.p && x.p.left.length)
      .slice(0, 6)
      .map(({ d, p }) => ({
        what: d.what, to: d.to,
        done: p.done, total: p.total, left: p.left,
        kgLeft: p.weighed ? Math.round(p.kgLeft * 10) / 10 : null,
      })),
  };
}

export default withAuth(async (req, res) => {
  const [items, warehouse, stock, log, acts, audits, delivery] = await Promise.all([
    itemsSummary(),
    warehouseSummary(),
    readStock().catch(() => ({ items: [] })),
    readLog(12).catch(() => []),
    readActs(6).catch(() => []),
    readAudits().catch(() => []),
    deliverySummary().catch(() => null),
  ]);

  const st = stock.items || [];
  const stockSummary = {
    positions: st.length,
    remainder: st.reduce((a, it) => a + it.remainder, 0),
    booked: st.filter((it) => it.accounting === 'Облікове').reduce((a, it) => a + it.remainder, 0),
    unbooked: st.filter((it) => it.accounting === 'Необлікове').reduce((a, it) => a + it.remainder, 0),
    unmarked: st.filter((it) => !it.accounting).length,
    empty: st.filter((it) => it.remainder <= 0).map((it) => ({ id: it.id, name: it.name })).slice(0, 12),
  };

  const openAudit = audits.find((a) => a.status === STATUS.open) || null;
  const lastAudit = audits.filter((a) => a.status === STATUS.done).slice(-1)[0] || null;

  res.json({
    items,
    warehouse,
    stock: stockSummary,
    log,
    acts,
    delivery,
    audit: { open: openAudit, last: lastAudit, total: audits.length },
  });
});
