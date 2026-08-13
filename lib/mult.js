/**
 * Таблиця множення й ділення — тренажер.
 *
 * Тут лише правила навчання: які приклади бувають, у якому порядку їх
 * давати, коли вважати вивченим і коли повторити. Жодного читання таблиць
 * і жодного React — щоб порядок кроків можна було міняти, не чіпаючи ні
 * сторінку, ні сховище.
 */

export const MULT_SHEET = 'Здоровʼя — множення';

export const MULT_HEADERS = [
  'Приклад', 'Множення', 'Ділення', 'Вірно', 'Помилок', 'Останній раз', 'Сер. час, с',
];

export const MU = {
  key: 0, mul: 1, div: 2, ok: 3, bad: 4, seen: 5, time: 6,
};

/** Межі таблиці. Одиниця й нуль не тренуються — там нема чого вчити. */
const LO = 2;
const HI = 9;

/**
 * Канонічний ключ. 7×8 і 8×7 — це один факт, а не два: хто знає перший,
 * знає й другий. Тримати їх окремо означало б удвічі довше вчити те саме.
 */
export const keyOf = (a, b) => (a <= b ? `${a}×${b}` : `${b}×${a}`);

/** Усі 36 фактів таблиці */
export const FACTS = (() => {
  const out = [];
  for (let a = LO; a <= HI; a++) for (let b = a; b <= HI; b++) out.push({ a, b, key: keyOf(a, b) });
  return out;
})();

/**
 * Кроки. Порядок не випадковий: спершу те, що спирається на лічбу
 * (подвоєння і п'ятірки), потім трійки й четвірки, далі дев'ятка з її
 * підказкою, і аж наприкінці 6·7·8 — з них до цього моменту більшість
 * прикладів уже трапилась у попередніх таблицях, тож нового лишається
 * шість штук замість двадцяти.
 */
export const STEPS = [
  {
    key: 'm25', mode: 'mul', tables: [2, 5],
    title: 'Множення на 2 і 5',
    lead: 'Найлегше: подвоїти або відрахувати п’ятірками.',
    hint: 'На 2 — це те саме число ще раз: 7×2 = 7+7. На 5 — половина від десятків: 6×5 = 60÷2 = 30.',
  },
  {
    key: 'm34', mode: 'mul', tables: [3, 4],
    title: 'Множення на 3 і 4',
    lead: 'Трійка — це подвоїти й додати ще раз. Четвірка — подвоїти двічі.',
    hint: '7×4 = 7×2×2 = 14×2 = 28. 6×3 = 6×2 + 6 = 12+6 = 18.',
  },
  {
    key: 'm9', mode: 'mul', tables: [9],
    title: 'Множення на 9',
    lead: 'Найпростіша таблиця, якщо знати правило.',
    hint: 'Помножити на 10 і відняти саме число: 7×9 = 70−7 = 63. Перевірка: цифри відповіді завжди дають 9 (6+3).',
  },
  {
    key: 'm678', mode: 'mul', tables: [6, 7, 8],
    title: 'Множення на 6, 7 і 8',
    lead: 'Найважче — але більшість прикладів ви вже вчили в попередніх кроках. Нових лише шість.',
    hint: '6×8 = 6×4×2 = 24×2 = 48. 7×8 = 56 — просто запам’ятайте: 5,6,7,8.',
  },
  {
    key: 'mall', mode: 'mul', tables: [],
    title: 'Усе множення разом',
    lead: 'Приклади йдуть упереміш — саме так їх питають у житті.',
    hint: '',
  },
  {
    key: 'dall', mode: 'div', tables: [],
    title: 'Ділення',
    lead: 'Ділення — це множення навпаки. 56÷7 питає: на скільки помножити 7, щоб вийшло 56.',
    hint: 'Не рахуйте — згадуйте. 42÷6: яке число з шісткою дає 42? Сім.',
  },
  {
    key: 'mix', mode: 'mix', tables: [],
    title: 'Множення й ділення разом',
    lead: 'Останній крок. Дії міняються без попередження.',
    hint: '',
  },
];

/** Приклади кроку: усі факти, де є хоч одне число з його таблиць */
export function stepFacts(step) {
  if (!step.tables.length) return FACTS;
  return FACTS.filter((f) => step.tables.includes(f.a) || step.tables.includes(f.b));
}

/** Скільки прикладів кроку ще не траплялись у попередніх кроках */
export function newInStep(step) {
  const i = STEPS.indexOf(step);
  const before = new Set();
  STEPS.slice(0, i).filter((s) => s.mode === step.mode).forEach((s) => {
    stepFacts(s).forEach((f) => before.add(f.key));
  });
  return stepFacts(step).filter((f) => !before.has(f.key)).length;
}

/* ---------- Рівні ---------- */

/** Рівень, з якого приклад вважається вивченим */
export const LEARNED = 4;
export const MAX_LEVEL = 5;

/**
 * Через скільки днів повторити. Проміжки ростуть, бо свіжовивчене
 * забувається за добу, а те, що правильно згадали вп'яте, протримається
 * два тижні. Рахувати тут нема чого — цифри взяті з практики інтервальних
 * повторень і працюють однаково для будь-якого матеріалу.
 */
const DUE_DAYS = [0, 1, 2, 4, 8, 16];

export const dueIn = (level) => DUE_DAYS[Math.min(level, MAX_LEVEL)] ?? 0;

/**
 * Новий рівень після відповіді. Помилка відкидає на два рівні, а не в
 * нуль: людина, яка сімнадцять разів відповіла правильно й один раз
 * схибила, не почала все спочатку.
 */
export function nextLevel(level, right) {
  if (right) return Math.min(MAX_LEVEL, level + 1);
  return Math.max(0, level - 2);
}

/** Порожній запис про приклад */
export const blank = (key) => ({ key, mul: 0, div: 0, ok: 0, bad: 0, seen: '', time: 0 });

/** Частка вивченого в кроці — 0..1 */
export function stepProgress(step, prog) {
  const facts = stepFacts(step);
  const modes = step.mode === 'mix' ? ['mul', 'div'] : [step.mode];
  let done = 0;
  let total = 0;
  facts.forEach((f) => {
    modes.forEach((m) => {
      total++;
      if ((prog[f.key]?.[m] || 0) >= LEARNED) done++;
    });
  });
  return total ? done / total : 0;
}

/** Крок відкритий, якщо попередній пройдено щонайменше на три чверті */
export function unlockedSteps(prog) {
  const out = [];
  let open = true;
  STEPS.forEach((s) => {
    out.push(open);
    open = open && stepProgress(s, prog) >= 0.75;
  });
  return out;
}

/* ---------- Добір питань ---------- */

const rnd = (n) => Math.floor(Math.random() * n);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Питання з факту. Множення питаємо в обидва боки (7×8 і 8×7) — це той
 * самий факт, але дитина має впізнавати його в будь-якому записі. Ділення
 * теж має два варіанти: 56÷7 і 56÷8.
 */
export function question(fact, mode) {
  const flip = rnd(2) === 1;
  if (mode === 'div') {
    const p = fact.a * fact.b;
    const by = flip ? fact.b : fact.a;
    return { key: fact.key, mode: 'div', text: `${p} ÷ ${by}`, answer: p / by };
  }
  const [x, y] = flip ? [fact.b, fact.a] : [fact.a, fact.b];
  return { key: fact.key, mode: 'mul', text: `${x} × ${y}`, answer: x * y };
}

/**
 * Набір на одне тренування.
 *
 * Спершу — те, що вже пора повторити, і те, що завалилось; нові приклади
 * додаємо по кілька за раз. Дати відразу п'ятнадцять незнайомих означає
 * гарантовану поразку, а поразка з тренажером — це остання зустріч із ним.
 */
export function buildSession(step, prog, size = 12, todayStamp = Date.now()) {
  const modes = step.mode === 'mix' ? ['mul', 'div'] : [step.mode];
  const facts = stepFacts(step);

  const items = [];
  facts.forEach((f) => modes.forEach((m) => {
    const p = prog[f.key] || blank(f.key);
    const level = p[m] || 0;
    const seen = p.seen ? stampOf(p.seen) : 0;
    const days = seen ? Math.floor((todayStamp - seen) / 86400000) : 999;
    items.push({ fact: f, mode: m, level, due: days >= dueIn(level), fresh: level === 0 });
  }));

  const fresh = shuffle(items.filter((i) => i.fresh));
  const due = shuffle(items.filter((i) => !i.fresh && i.due)).sort((a, b) => a.level - b.level);
  const rest = shuffle(items.filter((i) => !i.fresh && !i.due)).sort((a, b) => a.level - b.level);

  // не більше чотирьох нових за підхід — решта місця під повторення
  const pool = [...fresh.slice(0, 4), ...due, ...rest];
  const picked = pool.slice(0, size);

  /*
   * Першого разу повторювати ще нічого: у кроці самі нові приклади, і на
   * підхід їх набирається чотири. Добиваємо тими самими — саме повтор у
   * межах одного підходу й робить приклад знайомим. Питання не будуть
   * однаковими: 7×8 і 8×7 — це один факт, але різний запис.
   */
  for (let n = 0; picked.length < size && pool.length; n++) picked.push(pool[n % pool.length]);

  /*
   * Той самий приклад двічі поспіль — не тренування пам'яті, а списування
   * з попереднього екрана: відповідь ще стоїть перед очима. Розсуваємо
   * повтори, беручи щоразу перший, який не збігається з попереднім.
   */
  const left = shuffle(picked);
  const spread = [];
  while (left.length) {
    const prev = spread.length ? spread[spread.length - 1].fact.key : null;
    const count = new Map();
    left.forEach((x) => count.set(x.fact.key, (count.get(x.fact.key) || 0) + 1));
    // Беремо не перший-ліпший інший, а той, якого лишилось найбільше:
    // інакше під кінець у руках залишаються три однакові приклади, і
    // поставити їх урозбивку вже нікуди.
    let best = -1;
    let most = -1;
    left.forEach((x, n) => {
      if (x.fact.key === prev) return;
      const c = count.get(x.fact.key);
      if (c > most) { most = c; best = n; }
    });
    spread.push(left.splice(best < 0 ? 0 : best, 1)[0]);
  }

  return spread.map((i) => question(i.fact, i.mode));
}

/* ---------- Таблиця ---------- */

function stampOf(d) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((d || '').toString().trim());
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0;
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
};

export function parseMult(values) {
  const out = {};
  (values || []).slice(1).forEach((raw) => {
    const r = [...(raw || [])];
    const key = String(r[MU.key] ?? '').trim();
    if (!key) return;
    out[key] = {
      key,
      mul: Math.max(0, Math.min(MAX_LEVEL, Math.round(num(r[MU.mul])))),
      div: Math.max(0, Math.min(MAX_LEVEL, Math.round(num(r[MU.div])))),
      ok: Math.round(num(r[MU.ok])),
      bad: Math.round(num(r[MU.bad])),
      seen: String(r[MU.seen] ?? '').trim(),
      time: num(r[MU.time]),
    };
  });
  return out;
}

/** Увесь прогрес рядками — лист переписується цілком, це один запит */
export function multRows(prog) {
  return FACTS.map((f) => {
    const p = prog[f.key] || blank(f.key);
    return [
      f.key, p.mul || 0, p.div || 0, p.ok || 0, p.bad || 0, p.seen || '',
      p.time ? Math.round(p.time * 10) / 10 : '',
    ];
  });
}

/**
 * Прогрес після тренування. Середній час рахуємо ковзним: нове значення
 * важить чверть, тож один випадковий довгий роздум не псує картину, а
 * стійке пришвидшення видно вже за кілька підходів.
 */
export function applyResults(prog, results, today) {
  const out = { ...prog };
  results.forEach(({ key, mode, right, ms }) => {
    const p = { ...(out[key] || blank(key)) };
    p[mode] = nextLevel(p[mode] || 0, right);
    if (right) p.ok = (p.ok || 0) + 1; else p.bad = (p.bad || 0) + 1;
    p.seen = today;
    const s = ms / 1000;
    p.time = p.time ? p.time * 0.75 + s * 0.25 : s;
    out[key] = p;
  });
  return out;
}
