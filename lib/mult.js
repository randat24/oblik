/**
 * Таблиця множення й ділення — тренажер.
 *
 * Тут лише правила навчання: із чого складається урок, у якому порядку
 * давати приклади, коли вважати вивченим і коли повторити. Жодного читання
 * таблиць і жодного React — щоб порядок уроків можна було міняти, не
 * чіпаючи ні сторінку, ні сховище.
 */

export const MULT_SHEET = 'Здоровʼя — множення';

/*
 * «Поспіль» дописані в кінець навмисно: лист міг бути створений раніше,
 * а індекси колонок позиційні — наявні рядки не мають зсуватися.
 */
export const MULT_HEADERS = [
  'Приклад', 'Множення', 'Ділення', 'Вірно', 'Помилок', 'Останній раз', 'Сер. час, с',
  'Поспіль ×', 'Поспіль ÷', 'Помилок ×', 'Помилок ÷',
];

export const MU = {
  key: 0, mul: 1, div: 2, ok: 3, bad: 4, seen: 5, time: 6,
  runMul: 7, runDiv: 8, badMul: 9, badDiv: 10,
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
 * Скільки правильних відповідей поспіль роблять приклад вивченим.
 * Три — бо одна може бути вгаданою, дві — щасливим збігом, а три поспіль
 * при виборі з двох дають один шанс з восьми. І це та умова, яку дитина
 * розуміє без пояснень, на відміну від «рівня 4 з 5».
 */
export const RUN = 3;

/* ---------- Уроки ---------- */

/**
 * Один урок — одна таблиця. Порядок не за зростанням, а за складністю:
 * спершу те, що спирається на лічбу (двійка й п'ятірка), потім трійка з
 * четвіркою, далі дев'ятка з її правилом, і аж наприкінці 6, 7, 8.
 *
 * Через цей порядок кожен наступний урок легший за попередній: у таблиці
 * на 2 нових прикладів вісім, у таблиці на 8 — рівно один, 8×8. Решта
 * сім уже траплялись раніше й ідуть як повторення.
 */
const TABLES = [2, 5, 3, 4, 9, 6, 7, 8];

const RULES = {
  2: 'Це те саме число ще раз: 7 × 2 = 7 + 7 = 14.',
  3: 'Подвоїти й додати ще раз: 6 × 3 = 12 + 6 = 18.',
  4: 'Подвоїти двічі: 7 × 4 = 14 × 2 = 28.',
  5: 'Половина від десятків: 6 × 5 = 60 ÷ 2 = 30. Відповідь завжди на 0 або 5.',
  6: 'Помножити на 5 і додати ще одне число: 7 × 6 = 35 + 7 = 42.',
  7: 'Помножити на 5, потім на 2 — і скласти: 8 × 7 = 40 + 16 = 56.',
  8: 'Подвоїти тричі: 6 × 8 → 12 → 24 → 48.',
  9: 'Помножити на 10 і відняти саме число: 7 × 9 = 70 − 7 = 63. Перевірка: цифри відповіді разом дають 9.',
};

/** Коротка підказка під конкретний приклад — та, що з'являється при помилці */
export function tipFor(t, b) {
  const p = t * b;
  switch (t) {
    case 2: return `${b} + ${b} = ${p}`;
    case 3: return `${b * 2} + ${b} = ${p}`;
    case 4: return `${b * 2} × 2 = ${p}`;
    case 5: return `${b} десятків — це ${b * 10}, половина — ${p}`;
    case 6: return `${b * 5} + ${b} = ${p}`;
    case 7: return `${b * 5} + ${b * 2} = ${p}`;
    case 8: return `${b * 2} → ${b * 4} → ${p}`;
    case 9: return `${b * 10} − ${b} = ${p}`;
    default: return `${t} × ${b} = ${p}`;
  }
}

export const LESSONS = [
  ...TABLES.map((t) => ({
    key: 't' + t, kind: 'table', table: t,
    title: `Таблиця на ${t}`,
    rule: RULES[t],
  })),
  {
    key: 'div', kind: 'div',
    title: 'Ділення',
    rule: 'Ділення — це множення навпаки. 56 ÷ 7 питає: на скільки помножити 7, щоб вийшло 56. Не рахуйте — згадуйте.',
  },
  {
    key: 'mix', kind: 'mix',
    title: 'Множення й ділення разом',
    rule: 'Останній урок. Дії міняються без попередження — саме так їх питають у житті.',
  },
];

/** Усі приклади уроку */
export function lessonFacts(lesson) {
  if (lesson.kind !== 'table') return FACTS;
  return FACTS.filter((f) => f.a === lesson.table || f.b === lesson.table);
}

/** Приклади, які в цьому уроці трапляються вперше */
export function freshFacts(lesson) {
  if (lesson.kind !== 'table') return lesson.kind === 'div' ? FACTS : [];
  const before = new Set();
  for (const l of LESSONS) {
    if (l.key === lesson.key) break;
    if (l.kind === 'table') lessonFacts(l).forEach((f) => before.add(f.key));
  }
  return lessonFacts(lesson).filter((f) => !before.has(f.key));
}

/**
 * Частини уроку. Вісім прикладів за раз — це багато; три закриваються за
 * хвилину, і між ними видно, що справа рухається.
 */
export function partsOf(lesson) {
  const f = lessonFacts(lesson);
  if (lesson.kind !== 'table') return [f];
  const out = [];
  for (let i = 0; i < f.length; i += 3) out.push(f.slice(i, i + 3));
  return out;
}

/** Множники уроку по порядку — для показу «Додавай по 5» */
export function partMultipliers(lesson, part) {
  return part.map((f) => (f.a === lesson.table ? f.b : f.a));
}

/* ---------- Рівні й повторення ---------- */

export const MAX_LEVEL = 5;

/**
 * Через скільки днів повторити. Проміжки ростуть, бо свіжовивчене
 * забувається за добу, а те, що правильно згадали вп'яте, протримається
 * два тижні. Цифри взяті з практики інтервальних повторень.
 */
const DUE_DAYS = [0, 1, 2, 4, 8, 16];

export const dueIn = (level) => DUE_DAYS[Math.min(level, MAX_LEVEL)] ?? 0;

/**
 * Новий рівень після відповіді. Помилка відкидає на два рівні, а не в
 * нуль: хто сімнадцять разів відповів правильно й один раз схибив, не
 * починає все спочатку.
 */
export function nextLevel(level, right) {
  if (right) return Math.min(MAX_LEVEL, level + 1);
  return Math.max(0, level - 2);
}

export const blank = (key) => ({
  key, mul: 0, div: 0, ok: 0, bad: 0, seen: '', time: 0,
  runMul: 0, runDiv: 0, badMul: 0, badDiv: 0,
});

const runKey = (mode) => (mode === 'div' ? 'runDiv' : 'runMul');
const badKey = (mode) => (mode === 'div' ? 'badDiv' : 'badMul');

/** Скільки правильних поспіль зараз на цьому прикладі */
export const runOf = (prog, key, mode) => (prog[key]?.[runKey(mode)] || 0);

/** Приклад вивчено, якщо він дався три рази поспіль */
export const known = (prog, key, mode) => runOf(prog, key, mode) >= RUN;

/**
 * Скільки секунд на відповідь відділяють пам'ять від рахунку.
 *
 * Знати й пам'ятати — різні речі. Хто відповідає «сім на вісім» за пʼять
 * секунд, той не згадує, а рахує: 7×4=28, ще раз по стільки — 56. Відповідь
 * правильна, і в контрольній цього вистачить, але в наступній дії, де це
 * лише крок, часу на такий рахунок уже не буде.
 *
 * Три секунди — з запасом на дотик до екрана; те, що справді лежить у
 * памʼяті, спливає за секунду-півтори.
 */
export const FAST_SEC = 3;

/** Приклад доведено до автоматизму: і без помилок, і швидко */
export const auto = (prog, key, mode) => {
  const t = prog[key]?.time || 0;
  return known(prog, key, mode) && t > 0 && t <= FAST_SEC;
};

/**
 * Приклади, на яких помилялись і які досі не закрили. Список сам
 * порожніє: щойно приклад дався три рази поспіль, він звідси зникає.
 */
export function problems(prog) {
  const out = [];
  FACTS.forEach((f) => ['mul', 'div'].forEach((m) => {
    const p = prog[f.key];
    // Помилки рахуються окремо для множення й ділення: спільний лічильник
    // не сказав би, у якій саме дії схибили, і в список потрапляло б те,
    // чого людина ще й не бачила.
    if (p && (p[badKey(m)] || 0) > 0 && !known(prog, f.key, m)) out.push({ fact: f, mode: m });
  }));
  return out;
}

/** Вивчене, але повільне — те, що лишилось довести до автоматизму */
export function slows(prog) {
  const out = [];
  FACTS.forEach((f) => ['mul', 'div'].forEach((m) => {
    if (known(prog, f.key, m) && !auto(prog, f.key, m)) out.push({ fact: f, mode: m });
  }));
  return out;
}

/**
 * Що просить повторення саме сьогодні. Приклад спливає, коли минув його
 * проміжок: вивчене вчора — через день, вивчене міцно — через два тижні.
 */
export function due(prog, todayStamp = Date.now()) {
  const out = [];
  FACTS.forEach((f) => ['mul', 'div'].forEach((m) => {
    if (!known(prog, f.key, m)) return;
    const p = prog[f.key];
    const seen = p?.seen ? stampOf(p.seen) : 0;
    if (!seen) return;
    const days = Math.floor((todayStamp - seen) / 86400000);
    if (days >= dueIn(p[m] || 0)) out.push({ fact: f, mode: m });
  }));
  return out;
}

/**
 * Робота на сьогодні — три купки в порядку важливості.
 *
 * Спершу помилки: незакритий промах закріплюється сам собою. Потім те, що
 * пора освіжити, доки не забулось. І аж наприкінці розгін — приклади, які
 * знають, але думають над ними надто довго.
 */
export function daily(prog, todayStamp = Date.now()) {
  const bad = problems(prog);
  const badKeys = new Set(bad.map((x) => x.fact.key + x.mode));
  const rep = due(prog, todayStamp).filter((x) => !badKeys.has(x.fact.key + x.mode));
  const repKeys = new Set(rep.map((x) => x.fact.key + x.mode));
  const sl = slows(prog).filter((x) => !badKeys.has(x.fact.key + x.mode) && !repKeys.has(x.fact.key + x.mode));
  return { bad, rep, slow: sl, all: [...bad, ...rep, ...sl] };
}

/** Дні, коли справді тренувались — беремо з дат останнього показу */
export function practiceDays(prog) {
  const set = new Set();
  Object.values(prog || {}).forEach((p) => { if (p?.seen) set.add(p.seen); });
  return [...set];
}

/**
 * Скільки днів поспіль тренувались, рахуючи від сьогодні. Учорашній день
 * теж рахується початком: людина, яка ще не заходила сьогодні, не має
 * бачити обнулену серію — вона обнулиться лише завтра.
 */
export function dayStreak(prog, today) {
  const days = new Set(practiceDays(prog));
  const t0 = stampOf(today);
  if (!t0) return 0;
  const fmt = (ms) => {
    const d = new Date(ms);
    const q = (x) => String(x).padStart(2, '0');
    return `${q(d.getUTCDate())}.${q(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  };
  let start = days.has(fmt(t0)) ? t0 : (days.has(fmt(t0 - 86400000)) ? t0 - 86400000 : 0);
  if (!start) return 0;
  let n = 0;
  for (let t = start; days.has(fmt(t)); t -= 86400000) n++;
  return n;
}

/** Черга з готового списку пар «факт + дія» */
export function listQueue(items, size = 12) {
  if (!items.length) return [];
  const picked = [];
  const src = shuffle(items);
  for (let n = 0; picked.length < Math.max(size, src.length) && picked.length < size; n++) {
    picked.push(src[n % src.length]);
  }
  return spread(picked).map((i) => question(i.fact, i.mode));
}

/** Частка вивченого — 0..1 */
export function progressOf(facts, prog, modes) {
  let done = 0;
  let total = 0;
  facts.forEach((f) => modes.forEach((m) => {
    total++;
    if (known(prog, f.key, m)) done++;
  }));
  return total ? done / total : 0;
}

export const modesOf = (lesson) => (lesson.kind === 'mix' ? ['mul', 'div'] : lesson.kind === 'div' ? ['div'] : ['mul']);

export const lessonProgress = (lesson, prog) => progressOf(lessonFacts(lesson), prog, modesOf(lesson));
export const partProgress = (lesson, part, prog) => progressOf(part, prog, modesOf(lesson));

/**
 * Урок відкритий, якщо попередній пройдено повністю. Пускати далі з
 * половиною невивченого — значить гарантувати провал на наступному:
 * таблиця на 6 стоїть на п'ятірці, а ділення — на всьому множенні.
 */
export function unlockedLessons(prog) {
  const out = [];
  let open = true;
  LESSONS.forEach((l) => {
    out.push(open);
    open = open && lessonProgress(l, prog) >= 1;
  });
  return out;
}

/* ---------- Питання ---------- */

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
 * самий факт, але запис має впізнаватись будь-який. Ділення теж має два
 * варіанти: 56÷7 і 56÷8.
 */
export function question(fact, mode, fix) {
  const flip = fix === undefined ? rnd(2) === 1 : fix;
  if (mode === 'div') {
    const p = fact.a * fact.b;
    const by = flip ? fact.b : fact.a;
    return { key: fact.key, mode: 'div', a: p, b: by, text: `${p} ÷ ${by}`, answer: p / by };
  }
  const [x, y] = flip ? [fact.b, fact.a] : [fact.a, fact.b];
  return { key: fact.key, mode: 'mul', a: x, b: y, text: `${x} × ${y}`, answer: x * y };
}

/**
 * Три варіанти відповіді: правильний і два сусідні значення тієї ж
 * таблиці. Помилитись між 16, 24 і 32 можна по-справжньому — це 2×8, 3×8
 * і 4×8; а між 16 і 7 не можна, і такий вибір нічого не тренує.
 */
export function options(q, table) {
  // Крок — таблиця, яку зараз вчать: в уроці «×8» приклад «2 × 8» має
  // давати 8, 16, 24, а не 14, 16, 18. Питання не знає про урок, тож
  // таблицю передає той, хто питає; без неї беремо менший множник.
  const step = q.mode === 'div' ? 1 : (table || Math.min(q.a, q.b));
  const near = [q.answer - step, q.answer + step, q.answer - 2 * step, q.answer + 2 * step]
    .filter((n) => n > 0 && n !== q.answer);
  const out = [q.answer];
  for (const n of near) {
    if (out.length >= 3) break;
    if (!out.includes(n)) out.push(n);
  }
  let extra = q.answer + 1;
  while (out.length < 3) { if (!out.includes(extra)) out.push(extra); extra++; }
  return shuffle(out);
}

/**
 * Набір на тренування частини: питаємо, доки кожен приклад не дасться
 * тричі поспіль. Список живий — його переставляє сам екран за відповідями,
 * тут лише початковий порядок.
 */
export function partQueue(lesson, part) {
  const modes = modesOf(lesson);
  const out = [];
  part.forEach((f) => modes.forEach((m) => out.push({ fact: f, mode: m })));
  return shuffle(out);
}

/**
 * Набір на повторення — для уроків без частин (ділення, все разом) і для
 * кнопки «Повторити». Спершу те, що пора освіжити, потім решта; нових не
 * більше чотирьох за підхід, бо п'ятнадцять незнайомих за раз — це
 * гарантований провал, а провал з тренажером зазвичай останній.
 */
export function buildSession(lesson, prog, size = 12, todayStamp = Date.now()) {
  const modes = modesOf(lesson);
  const items = [];
  lessonFacts(lesson).forEach((f) => modes.forEach((m) => {
    const p = prog[f.key] || blank(f.key);
    const level = p[m] || 0;
    const seen = p.seen ? stampOf(p.seen) : 0;
    const days = seen ? Math.floor((todayStamp - seen) / 86400000) : 999;
    items.push({ fact: f, mode: m, level, due: days >= dueIn(level), fresh: !known(prog, f.key, m) });
  }));

  const fresh = shuffle(items.filter((i) => i.fresh));
  const due = shuffle(items.filter((i) => !i.fresh && i.due)).sort((a, b) => a.level - b.level);
  const rest = shuffle(items.filter((i) => !i.fresh && !i.due)).sort((a, b) => a.level - b.level);

  const pool = [...fresh.slice(0, 4), ...due, ...rest];
  const picked = pool.slice(0, size);

  // Першого разу повторювати ще нічого — добиваємо тими самими: саме
  // повтор у межах підходу й робить приклад знайомим.
  for (let n = 0; picked.length < size && pool.length; n++) picked.push(pool[n % pool.length]);

  return spread(picked).map((i) => question(i.fact, i.mode));
}

/**
 * Той самий приклад двічі поспіль — не тренування пам'яті, а списування
 * з попереднього екрана. Беремо щоразу той, якого лишилось найбільше:
 * інакше під кінець у руках залишаються три однакові, і розсунути їх уже
 * нікуди.
 */
export function spread(items) {
  const left = shuffle(items);
  const out = [];
  while (left.length) {
    const prev = out.length ? out[out.length - 1].fact.key : null;
    const count = new Map();
    left.forEach((x) => count.set(x.fact.key, (count.get(x.fact.key) || 0) + 1));
    let best = -1;
    let most = -1;
    left.forEach((x, n) => {
      if (x.fact.key === prev) return;
      const c = count.get(x.fact.key);
      if (c > most) { most = c; best = n; }
    });
    out.push(left.splice(best < 0 ? 0 : best, 1)[0]);
  }
  return out;
}

/** Вікторина: приклади лише з вивченого, вперемішку, без нових */
export function quizQueue(prog, size = 60) {
  const pool = [];
  FACTS.forEach((f) => ['mul', 'div'].forEach((m) => {
    if (known(prog, f.key, m)) pool.push({ fact: f, mode: m });
  }));
  if (!pool.length) return [];
  const picked = [];
  for (let n = 0; picked.length < size; n++) picked.push(pool[n % pool.length]);
  return spread(picked).map((i) => question(i.fact, i.mode));
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
    const lvl = (i) => Math.max(0, Math.min(MAX_LEVEL, Math.round(num(r[i]))));
    out[key] = {
      key,
      mul: lvl(MU.mul),
      div: lvl(MU.div),
      ok: Math.round(num(r[MU.ok])),
      bad: Math.round(num(r[MU.bad])),
      seen: String(r[MU.seen] ?? '').trim(),
      time: num(r[MU.time]),
      runMul: Math.max(0, Math.round(num(r[MU.runMul]))),
      runDiv: Math.max(0, Math.round(num(r[MU.runDiv]))),
      badMul: Math.max(0, Math.round(num(r[MU.badMul]))),
      badDiv: Math.max(0, Math.round(num(r[MU.badDiv]))),
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
      p.runMul || 0, p.runDiv || 0, p.badMul || 0, p.badDiv || 0,
    ];
  });
}

/**
 * Прогрес після підходу. Серію рахуємо саме поспіль: помилка обнуляє її
 * повністю, бо «знаю» — це коли не помиляєшся, а не коли вгадав більше
 * разів, ніж не вгадав. Середній час ковзний: нове значення важить чверть,
 * тож один довгий роздум не псує картину.
 */
export function applyResults(prog, results, today) {
  const out = { ...prog };
  results.forEach(({ key, mode, right, ms }) => {
    const p = { ...(out[key] || blank(key)) };
    const rk = runKey(mode);
    p[mode] = nextLevel(p[mode] || 0, right);
    p[rk] = right ? (p[rk] || 0) + 1 : 0;
    if (right) {
      p.ok = (p.ok || 0) + 1;
    } else {
      p.bad = (p.bad || 0) + 1;
      p[badKey(mode)] = (p[badKey(mode)] || 0) + 1;
    }
    p.seen = today;
    const s = ms / 1000;
    p.time = p.time ? p.time * 0.75 + s * 0.25 : s;
    out[key] = p;
  });
  return out;
}
