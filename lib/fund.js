// Розширення в імпортах сусідів стоїть навмисно: файл покритий тестами, а
// вбудований у Node запускач шукає модуль рівно за тим шляхом, який написали.

/**
 * Спільний фонд: баланси, каса, поділ витрат.
 *
 * Тут лише правила — ні React, ні читання таблиць. Усе, що видно на
 * екрані, виводиться програванням книги операцій від початкового стану;
 * збережених підсумків, які можна відредагувати, не існує.
 *
 * Дві величини, які не плутаємо.
 *
 * **Баланс учасника** — від'ємний означає, що він винен фондові,
 * додатний — що фонд винен йому.
 *
 * **Готівка** — гроші, які фізично лежать у коробці. Вона не виводиться
 * з балансів і міняється лише явними готівковими операціями. Особиста
 * покупка готівку не чіпає взагалі: людина витратила свої гроші.
 *
 * Після кожної операції тримається рівність:
 *
 *     Готівка − Σ Баланси = Розбіжність звірки
 *
 * Розбіжність міняється тільки явним коригуванням із причиною. Якщо вона
 * зрушила сама — це помилка в коді, а не особливість даних.
 */

/* ---------- Гроші ---------- */

/**
 * Гроші — цілі копійки.
 *
 * Жодних дробових: `0.1 + 0.2 !== 0.3`, і на сотій операції ця дрібниця
 * стає розбіжністю, якої ніхто не замовляв. Рядок, а не число, бо саме
 * рядком суму вводить людина, і він не втрачає точності.
 */
export function kop(value) {
  const raw = String(value ?? '').trim()
    .replace(/[\s ]/g, '')
    .replace(',', '.');
  if (!raw) return 0;
  const neg = raw.startsWith('-');
  const body = neg ? raw.slice(1) : raw;
  if (!/^\d*(\.\d*)?$/.test(body)) return NaN;
  const [whole = '', frac = ''] = body.split('.');
  const n = (Number(whole || 0) * 100) + Number((frac + '00').slice(0, 2));
  return neg ? -n : n;
}

/** Копійки у вигляді «1 234,56» — з нерозривним пробілом між тисячами */
export function money(kopecks) {
  const n = Math.round(kopecks || 0);
  const sign = n < 0 ? '-' : '';
  const whole = Math.floor(Math.abs(n) / 100);
  const frac = Math.abs(n) % 100;
  const groups = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${groups},${String(frac).padStart(2, '0')}`;
}

/** Те саме, але зі знаком плюс — там, де показуємо зміну, а не величину */
export const signed = (k) => (k > 0 ? '+' : '') + money(k);

/* ---------- Категорії ---------- */

/**
 * Правило категорії відповідає на одне питання: чи бере участь той, хто
 * у відпустці. Той, хто вийшов, в автоматичні витрати не потрапляє
 * ніколи — лише вручну й з підтвердженням.
 */
export const CATEGORIES = [
  { id: 'var', name: 'Продукти і їжа', vacation: false,
    hint: 'Ділиться на всіх, хто в групі й не у відпустці на дату витрати.' },
  { id: 'fixed', name: 'Постійні: житло, інтернет, комуналка', vacation: true,
    hint: 'Ділиться на всіх, хто в групі на дату, включно з відпускниками. Повна частка, без поділу за днями.' },
  { id: 'home', name: 'Покупки для дому', vacation: true,
    hint: 'Ділиться на всіх, хто в групі на дату, включно з відпускниками.' },
  { id: 'other', name: 'Інше', vacation: true,
    hint: 'Ділиться на всіх, хто в групі на дату. Потрібно інакше — оберіть учасників вручну.' },
];

export const categoryOf = (id) =>
  CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

/* ---------- Учасники ---------- */

/** Чи був учасник у складі цього дня. Кінець періоду — не включно. */
export const inGroup = (m, day) =>
  (m.periods || []).some((p) => p.start <= day && (!p.end || day < p.end));

/** Чи був у відпустці. Обидві дати включно — так просить специфікація. */
export const onVacation = (m, day) =>
  (m.vacations || []).some((v) => v.start <= day && day <= v.end);

/** Ким учасник був цього дня */
export function statusOn(m, day) {
  if (!inGroup(m, day)) return 'out';
  return onVacation(m, day) ? 'vac' : 'in';
}

/**
 * Учасники за стажем.
 *
 * Саме цей порядок вирішує, кому дістанеться зайва копійка, коли платник
 * не бере участі. Тримаємо його полем `order`, а не порядком рядків у
 * таблиці: інакше перше ж сортування тихо змінить відповідь.
 */
export const byOrder = (members) =>
  [...(members || [])].sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id)));

/** Хто бере участь у витраті за правилом категорії й станом на дату */
export function eligible(members, categoryId, day) {
  const cat = categoryOf(categoryId);
  return byOrder(members)
    .filter((m) => inGroup(m, day) && (cat.vacation || !onVacation(m, day)))
    .map((m) => m.id);
}

/** Склад учасників операції: ручний список головний і не перераховується */
export const participantsOf = (op, members) =>
  (op.mode === 'manual' ? (op.participants || []) : eligible(members, op.category, op.date));

/* ---------- Поділ ---------- */

/**
 * Частка кожного в копійках.
 *
 *     частка  = floor(сума / кількість)
 *     залишок = сума − частка × кількість
 *
 * Залишок іде платнику, якщо він серед учасників: він уже витратив свої
 * гроші, зайва копійка лишається на ньому. Інакше роздається за стажем,
 * по одній копійці.
 */
export function split(amount, parts, payer, order = []) {
  const people = [...new Set(parts || [])];
  const out = {};
  if (!people.length) return out;

  const base = Math.floor(amount / people.length);
  let rest = amount - base * people.length;
  people.forEach((p) => { out[p] = base; });

  if (rest > 0) {
    if (people.includes(payer)) {
      out[payer] += rest;
    } else {
      const queue = order.filter((id) => people.includes(id));
      const line = queue.length ? queue : people;
      for (let i = 0; rest > 0; i++, rest--) out[line[i % line.length]] += 1;
    }
  }
  return out;
}

/* ---------- Вплив операції ---------- */

/**
 * Що операція робить із балансами й готівкою.
 *
 * Повертає ще й склад учасників і частки — вони потрібні і для
 * попереднього перегляду, і для журналу, і рахувати їх двічі різними
 * шляхами означало б дати їм розійтися.
 */
export function effect(op, members) {
  const bal = {};
  const add = (id, v) => { bal[id] = (bal[id] || 0) + v; };
  const amount = Math.round(op.amount || 0);
  const res = { bal, cash: 0, parts: [], shares: {} };

  if (op.type === 'expense') {
    res.parts = participantsOf(op, members);
    if (!res.parts.length) return res;
    res.shares = split(amount, res.parts, op.payer, byOrder(members).map((m) => m.id));
    // з каси фонду кредиту не отримує ніхто, навіть той, хто ходив
    if (op.payer === 'cash') res.cash -= amount;
    else add(op.payer, amount);
    Object.entries(res.shares).forEach(([id, v]) => add(id, -v));
  } else if (op.type === 'deposit') {
    add(op.member, amount); res.cash += amount;
  } else if (op.type === 'reimburse') {
    add(op.member, -amount); res.cash -= amount;
  } else if (op.type === 'transfer') {
    add(op.member, amount); add(op.to, -amount);
  } else if (op.type === 'adjust') {
    res.cash += amount * (op.sign < 0 ? -1 : 1);
  }
  return res;
}

/* ---------- Програвання книги ---------- */

/**
 * Операції, які дають внесок, у порядку програвання.
 *
 * Скасовані не дають нічого. Порядок — за датою, далі за часом
 * створення: гроші від нього не залежать, але відтворюваність залежить.
 */
export const livedOps = (ops) => (ops || [])
  .filter((o) => o.status !== 'cancelled')
  .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1
    : String(a.createdAt || '') < String(b.createdAt || '') ? -1 : 1));

/**
 * Стан фонду після програвання книги.
 *
 * `until` — включно, `before` — виключно: перший потрібен для «на кінець
 * місяця», другий для «на початок».
 */
export function compute(members, ops, cfg = {}, opts = {}) {
  const bal = {};
  (members || []).forEach((m) => { bal[m.id] = Math.round(m.opening || 0); });
  let cash = Math.round(cfg.openingCash || 0);
  let adjusted = 0;

  for (const op of livedOps(ops)) {
    if (opts.until && op.date > opts.until) continue;
    if (opts.before && op.date >= opts.before) continue;
    const e = effect(op, members);
    Object.entries(e.bal).forEach(([id, v]) => { bal[id] = (bal[id] || 0) + v; });
    cash += e.cash;
    if (op.type === 'adjust') adjusted += e.cash;
  }

  const sum = Object.values(bal).reduce((a, b) => a + b, 0);
  return { bal, cash, sum, diff: cash - sum, adjusted };
}

/**
 * Чи тримається інваріант.
 *
 * Розбіжність має дорівнювати початковій плюс усі коригування. Якщо ні —
 * показувати баланси не можна: неправильна цифра, прикрита працюючим
 * екраном, знаходиться вже на реальних грошах.
 */
export function invariantOk(state, cfg = {}) {
  const base = Math.round(cfg.openingDiff || 0);
  return state.diff === base + state.adjusted;
}

/* ---------- Підписи ---------- */

export function opTitle(op, nameOf) {
  const who = (id) => (id === 'cash' ? 'Каса' : nameOf(id));
  if (op.type === 'expense') return op.desc || categoryOf(op.category).name;
  if (op.type === 'deposit') return `${who(op.member)} вніс у касу`;
  if (op.type === 'reimburse') return `Каса видала: ${who(op.member)}`;
  if (op.type === 'transfer') return `${who(op.member)} → ${who(op.to)}`;
  if (op.type === 'adjust') return 'Коригування каси';
  return op.type;
}

/** Короткий опис стану балансу словами, а не лише знаком */
export const balanceWord = (k) =>
  (k < 0 ? 'винен фондові' : k > 0 ? 'фонд винен йому' : 'у розрахунку');
