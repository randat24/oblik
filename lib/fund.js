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

/* ---------- Розподіл за днями ---------- */

const DAY_MS = 86400000;
const dayNum = (d) => {
  const [y, m, da] = String(d).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, da) / DAY_MS);
};
const dayStr = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Усі дні від `from` до `to` включно; порожньо, якщо дати хибні */
export function daysOf(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to))) return [];
  const a = dayNum(from);
  const b = dayNum(to);
  if (!(b >= a) || b - a > 400) return [];
  return Array.from({ length: b - a + 1 }, (_, i) => dayStr(a + i));
}

/** Перший і останній день місяця, у якому стоїть дата */
export function monthBounds(day) {
  const [y, m] = String(day).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/**
 * Витрата за період, розкладена по днях.
 *
 * Вартість доби — частка суми, і ділиться вона між тими, хто того дня був
 * у групі (для категорії, що не бере відпустку, — і не у відпустці).
 * Людина, яка прожила лише частину періоду, платить лише за свої дні, а
 * решта за кожен такий день платить менше. Доби, у яких нікого не було, не
 * рахуємо взагалі, щоб сума ніколи не губилась.
 *
 * Список `participants` тут — коло тих, кого взагалі беремо: хто в ньому,
 * але того дня поза групою, просто не платить за цей день.
 */
export function spreadByDays(op, members) {
  const amount = Math.round(op.amount || 0);
  const cat = categoryOf(op.category);
  const order = byOrder(members).map((m) => m.id);
  const pool = (op.participants || []).map((id) => members.find((m) => m.id === id)).filter(Boolean);
  const live = daysOf(op.periodFrom, op.periodTo)
    .map((day) => ({
      day,
      ids: pool.filter((m) => inGroup(m, day) && (cat.vacation || !onVacation(m, day))).map((m) => m.id),
    }))
    .filter((x) => x.ids.length);
  if (!live.length) return { shares: {}, parts: [] };

  // Рахуємо в мільйонних частках копійки, а цілими копійками роздаємо в кінці:
  // якби копійку відкидали щодня, молодшому за списком набігало б до дев'яти
  // зайвих копійок за місяць. Остаток копійок отримують ті, у кого дробова
  // частина найбільша; при рівності — спершу платник, далі за порядком.
  const SCALE = 1e6;
  const dayBase = Math.floor((amount * SCALE) / live.length);
  const acc = {};
  live.forEach((x) => {
    const each = Math.floor(dayBase / x.ids.length);
    x.ids.forEach((id) => { acc[id] = (acc[id] || 0) + each; });
  });
  const ids = order.filter((id) => id in acc);
  const shares = {};
  ids.forEach((id) => { shares[id] = Math.floor(acc[id] / SCALE); });
  let rest = amount - ids.reduce((sum, id) => sum + shares[id], 0);
  const ranked = [...ids].sort((p, q) => (acc[q] % SCALE) - (acc[p] % SCALE)
    || (q === op.payer) - (p === op.payer)
    || order.indexOf(p) - order.indexOf(q));
  for (let i = 0; rest > 0; i++, rest--) shares[ranked[i % ranked.length]] += 1;
  return { shares, parts: order.filter((id) => id in shares) };
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
    if (op.periodFrom && op.periodTo) {
      // витрата за період ділиться по днях: хто скільки днів був, за стільки й платить
      const r = spreadByDays(op, members);
      res.parts = r.parts;
      res.shares = r.shares;
    } else {
      res.parts = participantsOf(op, members);
      if (!res.parts.length) return res;
      res.shares = split(amount, res.parts, op.payer, byOrder(members).map((m) => m.id));
    }
    if (!res.parts.length) return res;
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

/* ---------- Кого не рахуємо, ручна каса ---------- */

/**
 * Склад нової витрати: за правилами категорії мінус ті, кого вимкнено в
 * налаштуванні, а далі — разові перемикання на цю витрату (`flips`).
 *
 * Налаштування діє лише на нові витрати: готова витрата зберігає свій
 * список явно, і його вже ніщо не перераховує.
 */
export function newExpenseParts(members, category, date, excluded = [], flips = []) {
  const base = eligible(members, category, date).filter((id) => !excluded.includes(id));
  const ids = byOrder(members).map((m) => m.id);
  return ids.filter((id) => base.includes(id) !== flips.includes(id));
}

/**
 * Скільки в касі насправді → коригування, яке до цього призводить.
 *
 * Повертає `null`, якщо касу вже не треба рухати, інакше суму без знаку
 * і знак. Саме коригування лишається в журналі з причиною, а не
 * переписує число мовчки.
 */
export function cashAdjustment(current, target) {
  const diff = Math.round(target) - Math.round(current);
  if (!Number.isFinite(diff) || diff === 0) return null;
  return { amount: Math.abs(diff), sign: diff > 0 ? 1 : -1 };
}

/* ---------- Власник каси ---------- */

/**
 * Які витрати треба переписати, щоб у них зʼявився власник каси.
 *
 * Витрати з ручним складом зберігають свій список явно й самі не
 * перераховуються, тож додати власника в уже записане можна тільки
 * скасуванням старого запису й новим із тим самим складом плюс власник.
 * Витрати «за правилами» нічого не потребують: власник у групі, і склад
 * на дату вони вирахують самі.
 */
export function ownerRecalcPlan(ops, ownerId) {
  return livedOps(ops).filter((o) => o.type === 'expense'
    && o.mode === 'manual'
    && (o.participants || []).length
    && !(o.participants || []).includes(ownerId));
}

/** Новий запис замість старого: той самий склад і власник каси в ньому */
export function withOwner(op, ownerId, { id, at, who }) {
  return {
    ...op,
    id,
    participants: [...op.participants, ownerId],
    note: [op.note, 'Перерахунок: додано власника каси'].filter(Boolean).join(' · '),
    status: 'active', createdAt: at, author: who,
    cancelledAt: '', cancelReason: '', row: undefined,
  };
}

/** Новий учасник: імʼя обовʼязкове й не повторюється, початок — дата, з якої він у групі */
export function newMember(members, { name, start, id }) {
  const n = String(name || '').trim().slice(0, 40);
  if (!n) return { error: 'Вкажіть імʼя' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start || ''))) return { error: 'Вкажіть дату, з якої він у групі' };
  if ((members || []).some((m) => m.name.trim().toLowerCase() === n.toLowerCase())) {
    return { error: 'Учасник з таким імʼям уже є' };
  }
  const last = Math.max(0, ...(members || []).map((m) => m.order || 0));
  return {
    member: { id, name: n, order: last + 1, opening: 0, periods: [{ start }], vacations: [] },
  };
}

/* ---------- Правка складу ---------- */

const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

/** Відкритий період — той, що без кінця (людина зараз у групі) */
export const openPeriod = (m) => (m.periods || []).find((p) => !p.end);

/**
 * Вийшов із групи з дати: закриваємо відкритий період.
 *
 * Кінець періоду виключний — це перший день, коли витрати на людину вже
 * не діляться. Баланс при цьому не зникає.
 */
export function leaveGroup(m, date) {
  const open = openPeriod(m);
  if (!isDay(date)) return { error: 'Вкажіть дату' };
  if (!open) return { error: 'Цей учасник уже поза групою' };
  if (date <= open.start) return { error: 'Дата виходу має бути пізніше за вступ' };
  return { periods: m.periods.map((p) => (p === open ? { start: p.start, end: date } : p)) };
}

/** Повернувся з дати: новий відкритий період, не раніше кінця попереднього */
export function rejoinGroup(m, date) {
  if (!isDay(date)) return { error: 'Вкажіть дату' };
  if (openPeriod(m)) return { error: 'Цей учасник уже в групі' };
  const last = [...(m.periods || [])].sort((a, b) => (a.end || '') < (b.end || '') ? -1 : 1).pop();
  if (last && date < last.end) return { error: 'Не раніше дати виходу' };
  return { periods: [...(m.periods || []), { start: date }] };
}

/** Відпустка: обидві дати включно, кінець не раніше початку */
export function addVacation(m, start, end) {
  if (!isDay(start) || !isDay(end)) return { error: 'Вкажіть обидві дати' };
  if (end < start) return { error: 'Кінець не може бути раніше початку' };
  const clash = (m.vacations || []).some((v) => start <= v.end && end >= v.start);
  if (clash) return { error: 'Ця відпустка перетинається з наявною' };
  return {
    vacations: [...(m.vacations || []), { start, end }]
      .sort((a, b) => (a.start < b.start ? -1 : 1)),
  };
}

/* ---------- Короткий звіт ---------- */

/** Сума без поділу на розряди й без зайвих «,00»: так її пишуть у чаті */
export function plain(kopecks) {
  const n = Math.round(Math.abs(kopecks || 0));
  const whole = Math.floor(n / 100);
  const frac = n % 100;
  return frac ? `${whole}.${String(frac).padStart(2, '0')}` : String(whole);
}

/**
 * Короткий звіт для чату.
 *
 * Каса — окрема цифра: вона міняється лише від внесків і виплат, а не від
 * балансів. Плюс у людини — це гроші, які вона вже вклала наперед; з нього
 * й віднімаються її частки наступних витрат.
 */
export function shortReport(state, members, owner = '') {
  // власник каси бере участь у витратах, але в списках боргів не показується
  const ms = byOrder(members).filter((m) => m.id !== owner);
  const owe = ms.filter((m) => (state.bal[m.id] || 0) < 0);
  const saved = ms.filter((m) => (state.bal[m.id] || 0) > 0);
  const lines = ['На сьогодні', `в касі ${plain(state.cash)}`];
  if (owe.length) {
    lines.push('', 'Борг у касу:',
      ...owe.map((m) => `${m.name} - ${plain(state.bal[m.id])}`));
  }
  if (saved.length) {
    lines.push('', 'У плюсі (витратили свої):',
      ...saved.map((m) => `${m.name} + ${plain(state.bal[m.id])}`));
  }
  return lines.join('\n');
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
