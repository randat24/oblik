// Розширення в імпортах сусідів стоїть навмисно: файл покритий тестами, а
// вбудований у Node запускач шукає модуль рівно за тим шляхом, який написали.

/**
 * Статистика витрат фонду: книга застосунку разом зі старим архівом.
 *
 * У книзі категорія є в кожної витрати. В архіві («каса ВУ» до 15.10.2026)
 * категорій не було, лише підпис рядка, і то не завжди. Тому архів
 * розкладаємо за словами в підписі, а все, що не впізнали, чесно лишаємо
 * «Без категорії», а не дописуємо в «Інше»: інакше «Інше» роздулося б
 * рядками, про які ніхто не знає, що в них було.
 *
 * Рядки архіву, де витрата змішана з переказом, суми витрати не мають —
 * їх не вгадуємо, а лише рахуємо, щоб було видно, скільки лишилось за кадром.
 *
 * Тут лише правила — ні React, ні читання таблиць.
 */

import { CATEGORIES, effect, livedOps } from './fund.js';

export const NONE = 'none';

/*
 * Слова з підписів архіву. Порядок категорій не важить: перемагає слово,
 * що стоїть у підписі першим, — «старлинк, мясо, магаз» люди писали, з
 * головного починаючи.
 */
const WORDS = {
  var: ['мясо', 'м\'ясо', 'магаз', 'кофе', 'кава', 'пицц', 'піц', 'пельмен', 'пельмин', 'хлеб', 'хліб',
    'мука', 'борошн', 'продукт', 'еда', 'їжа', 'пиво'],
  fixed: ['хата', 'комунал', 'свет', 'світло', 'вода', 'трафик', 'трафік', 'интернет', 'інтернет',
    'старлинк', 'старлінк', 'водафон', 'аренд', 'оренд', 'квартир'],
  home: ['посуд', 'мясорубк', 'котел', 'душ', 'сантехник', 'гидрофор', 'гідрофор', 'скотч', 'пакет',
    'отрав', 'сетк', 'сітк', 'криша', 'дах', 'труба', 'генератор'],
  other: ['топлив', 'паливо', 'соляр', 'саляр', 'заправк', 'дизель', 'топляк', 'бензин', 'рено',
    'новар', 'форд', 'фольц', 'теранно', 'стартер', 'развал', 'колес', 'запчаст', 'антен', 'аккум',
    'батарей', 'машин', 'моторч', 'преобразоват', 'масло', 'резин', 'др ', 'почт', 'офис', 'флешк', 'транзит'],
};

/** Категорія за підписом: перше впізнане слово або NONE */
export function guessCategory(text) {
  const s = ` ${String(text ?? '').toLowerCase()} `;
  let best = null;
  for (const [id, words] of Object.entries(WORDS)) {
    for (const w of words) {
      const at = s.indexOf(w);
      if (at >= 0 && (!best || at < best.at)) best = { id, at };
    }
  }
  return best ? best.id : NONE;
}

/**
 * Витрати з обох джерел одним списком: `{ date, amount, category, payer, source }`.
 * Власник каси в архіві («alex») — це каса: так само його читає й книга.
 */
export function spendingOf(members, ops, archiveRows = [], owner = 'alex') {
  const book = livedOps(ops)
    .filter((o) => o.type === 'expense' && effect(o, members).parts.length)
    .map((o) => ({
      date: o.date, amount: Math.round(o.amount || 0),
      category: CATEGORIES.some((c) => c.id === o.category) ? o.category : 'other',
      payer: o.payer === owner ? 'cash' : o.payer, source: 'book',
    }));
  const arch = archiveRows
    .filter((r) => r.kind === 'expense' && r.total > 0)
    .map((r) => ({
      date: r.date, amount: Math.round(r.total), category: guessCategory(r.desc),
      payer: r.payer === owner ? 'cash' : r.payer, source: 'arch',
    }));
  return [...arch, ...book].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** «2024-03» … «2024-06»: усі місяці підряд, щоб порожній місяць не зникав з осі */
export function monthRange(first, last) {
  const out = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * Підсумки за вибраний час: `range` — «2025» (рік), «2025-03» (місяць) або
 * порожньо (увесь час). Місяці на осі — завжди всі в межах вибраного року
 * чи всього часу, навіть коли вибрано один місяць: так стовпчик не стрибає.
 */
export function spendStats(items, archiveRows = [], range = '') {
  const inRange = (d) => !range || String(d).startsWith(range);
  const axisKey = range.length === 7 ? range.slice(0, 4) : range;
  const axisItems = items.filter((x) => !axisKey || x.date.startsWith(axisKey));

  const sums = {};
  axisItems.forEach((x) => { const k = x.date.slice(0, 7); sums[k] = (sums[k] || 0) + x.amount; });
  const keys = Object.keys(sums).sort();
  const months = keys.length
    ? monthRange(keys[0], keys[keys.length - 1]).map((ym) => ({ ym, sum: sums[ym] || 0 }))
    : [];

  const picked = items.filter((x) => inRange(x.date));
  const cats = Object.fromEntries([...CATEGORIES.map((c) => c.id), NONE].map((id) => [id, { sum: 0, count: 0 }]));
  const payers = {};
  let total = 0;
  for (const x of picked) {
    cats[x.category].sum += x.amount; cats[x.category].count += 1;
    payers[x.payer] = (payers[x.payer] || 0) + x.amount;
    total += x.amount;
  }
  const active = months.filter((m) => !range || m.ym.startsWith(range)).length;
  const mixed = archiveRows.filter((r) => r.kind === 'mixed' && inRange(r.date)).length;

  return {
    total, count: picked.length, months, cats, mixed,
    perMonth: active ? Math.round(total / active) : 0,
    payers: Object.entries(payers).map(([id, sum]) => ({ id, sum })).sort((a, b) => b.sum - a.sum),
    years: [...new Set(items.map((x) => x.date.slice(0, 4)))].sort(),
  };
}
