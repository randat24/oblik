import { withAuth } from '../../lib/auth';
import { SHEET_CONFIGS, readSheet, findColumns } from '../../lib/sheets';
import { readStock } from '../../lib/stock';
import { readLog } from '../../lib/log';
import { readActs } from '../../lib/acts';
import { readAudits, STATUS } from '../../lib/audit';

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

  await Promise.all(targets.map(async (cfg) => {
    let values;
    try {
      values = await readSheet(cfg.name);
    } catch {
      return;
    }
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

    perSheet.push(s);
    total += rows.length;
    available += s.available;
    issued += s.issued;
    booked += s.booked;
  }));

  perSheet.sort((a, b) => b.count - a.count);
  return {
    total, available, issued, booked,
    perSheet,
    byStatus: [...byStatus.entries()].sort((a, b) => b[1] - a[1]),
    lost,
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

export default withAuth(async (req, res) => {
  const [items, warehouse, stock, log, acts, audits] = await Promise.all([
    itemsSummary(),
    warehouseSummary(),
    readStock().catch(() => ({ items: [] })),
    readLog(12).catch(() => []),
    readActs(6).catch(() => []),
    readAudits().catch(() => []),
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
    audit: { open: openAudit, last: lastAudit, total: audits.length },
  });
});
