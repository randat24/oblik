// Розширення в імпортах сусідів стоїть навмисно: файл покритий тестами, а
// вбудований у Node запускач шукає модуль рівно за тим шляхом, який написали.

/**
 * Звіти фонду: за місяць і по кожному учаснику.
 *
 * Нічого не зберігають і не лічать наново свої гроші: усе береться з тих
 * самих `compute` і `effect`, що й головний екран. Інакше звіт і зведення
 * могли б розійтися, а перевірити, котрий із них правий, нікому.
 */

import { compute, effect, livedOps, CATEGORIES, byOrder, plain } from './fund.js';

/** Перший день наступного місяця для «YYYY-MM» */
export function nextMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

/** Місяці, у яких є чинні операції, нові зверху; поточний є завжди */
export function monthsOf(ops, today) {
  const set = new Set([String(today).slice(0, 7)]);
  livedOps(ops).forEach((o) => { if (/^\d{4}-\d{2}/.test(o.date)) set.add(o.date.slice(0, 7)); });
  return [...set].sort().reverse();
}

/**
 * Звіт за місяць.
 *
 * Початок — стан до першого числа, кінець — стан після останнього дня,
 * тож `початок + рух = кінець` для каси й для кожної людини.
 */
export function monthReport(members, ops, cfg, ym) {
  const from = `${ym}-01`;
  const to = nextMonth(ym);
  const start = compute(members, ops, cfg, { before: from });
  const end = compute(members, ops, cfg, { before: to });
  const inMonth = livedOps(ops).filter((o) => o.date >= from && o.date < to);

  const cats = Object.fromEntries(CATEGORIES.map((c) => [c.id, { sum: 0, count: 0 }]));
  const each = Object.fromEntries(members.map((m) => [m.id, {
    share: 0, paid: 0, deposited: 0, received: 0,
    start: start.bal[m.id] || 0, end: end.bal[m.id] || 0,
  }]));
  const total = { spent: 0, count: 0, fromCash: 0, deposits: 0, reimbursed: 0, adjusted: 0 };

  for (const op of inMonth) {
    const amount = Math.round(op.amount || 0);
    if (op.type === 'expense') {
      const e = effect(op, members);
      if (!e.parts.length) continue;
      const c = cats[op.category] || cats.other;
      c.sum += amount; c.count += 1;
      total.spent += amount; total.count += 1;
      if (op.payer === 'cash') total.fromCash += amount;
      else if (each[op.payer]) each[op.payer].paid += amount;
      Object.entries(e.shares).forEach(([id, v]) => { if (each[id]) each[id].share += v; });
    } else if (op.type === 'deposit') {
      total.deposits += amount;
      if (each[op.member]) each[op.member].deposited += amount;
    } else if (op.type === 'reimburse') {
      total.reimbursed += amount;
      if (each[op.member]) each[op.member].received += amount;
    } else if (op.type === 'adjust') {
      total.adjusted += amount * (op.sign < 0 ? -1 : 1);
    }
  }

  return {
    ym, total, cats, each,
    cash: { start: start.cash, end: end.cash },
    ops: inMonth.length,
  };
}

/** Чи було в людини цього місяця хоч щось: частка, покупка, внесок чи виплата */
export const activeInMonth = (e) => !!(e && (e.share || e.paid || e.deposited || e.received));

/**
 * Скільки людина вклала за місяць власних грошей: заплатила своїми за
 * спільне плюс внесла в касу, мінус те, що їй повернули з каси.
 *
 * Поруч із часткою це й відповідає на «скільки я віддав на взвод»: частка —
 * скільки взвод коштував людині, вкладене — скільки вона за цей час дала.
 * Різниця між ними — те, на скільки змінився її баланс.
 */
export const putIn = (e) => e.paid + e.deposited - e.received;

/** Сума зі знаком мінус, коли потрібно: plain() пише без знака */
const sgn = (k) => `${k < 0 ? '-' : k > 0 ? '+' : ''}${plain(k)}`;

/**
 * Звіт за місяць по кожному — текстом для чату.
 *
 * Людей без жодного руху за місяць не показуємо: інакше той, хто вийшов
 * пів року тому, щомісяця висить у звіті нулями.
 */
export function monthText(r, members, title) {
  const lines = [`Звіт за ${title}`, `Витрати взводу: ${plain(r.total.spent)} (${r.total.count} шт.)`];
  for (const m of byOrder(members)) {
    const e = r.each[m.id];
    if (!activeInMonth(e)) continue;
    const how = [
      e.paid && `своїми ${plain(e.paid)}`,
      e.deposited && `у касу ${plain(e.deposited)}`,
      e.received && `з каси отримав ${plain(e.received)}`,
    ].filter(Boolean).join(', ');
    lines.push('', m.name,
      `Витратив на взвод: ${plain(e.share)}`,
      `Вклав: ${sgn(putIn(e))}${how ? ` (${how})` : ''}`,
      `Баланс: ${sgn(e.start)} → ${sgn(e.end)}`);
  }
  return lines.join('\n');
}

/**
 * Виписка по людині: кожна операція, що зачепила її баланс, і баланс після.
 *
 * Останній рядок завжди збігається з балансом на головному екрані — це
 * перевіряється тестом, бо виписка, яка не сходиться, гірша за відсутню.
 */
export function memberStatement(members, ops, id) {
  const m = members.find((x) => x.id === id);
  const opening = Math.round(m?.opening || 0);
  let running = opening;
  const rows = [];
  for (const op of livedOps(ops)) {
    const delta = effect(op, members).bal[id] || 0;
    if (!delta) continue;
    running += delta;
    rows.push({ op, delta, balance: running });
  }
  return { opening, rows, closing: running };
}
