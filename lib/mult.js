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
 *
 * Чотири. Три теж давали пристойну впевненість, але «вивчив» і «не забуду
 * через тиждень» — різні речі: на четвертому повторі приклад перестає
 * вгадуватись і починає згадуватись. Ціна — три зайві питання на частину.
 */
export const RUN = 4;

/**
 * Скільки питань у підході на повторення.
 *
 * Тридцять, а не двадцять: тренування дня — це не перевірка, а повторення,
 * і його сенс саме в кількості. Приклад, побачений один раз за підхід, до
 * завтра не доживе.
 */
export const DAY_SIZE = 30;

/**
 * Як побудований підхід дня: приклади йдуть блоками, і кожен блок
 * проходять двічі підряд.
 *
 * Суцільна перетасовка з тридцяти різних прикладів — це не повторення, а
 * іспит: жоден не встигає закріпитись, зате всі встигають переплутатись.
 * П'ять прикладів, пройдені двічі, лишають по собі слід; наступна п'ятірка
 * починається тоді, коли попередня вже сіла.
 */
const DAY_BLOCK = 5;
const DAY_REPEATS = 2;

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

/**
 * Зачіпки для тих прикладів, де правило громіздке або його немає.
 *
 * Правило — це спосіб порахувати; зачіпка — спосіб згадати. Для
 * автоматизму потрібне друге: поки дитина рахує «тридцять пʼять плюс сім»,
 * вона не памʼятає сорок два, а виводить його щоразу наново.
 */
export const HOOKS = {
  '5×5': 'Пʼять на пʼять — двадцять пʼять.',
  '6×6': 'Шість на шість — тридцять шість.',
  '6×8': 'Шість на вісім — сорок вісім.',
  '4×6': 'Шість на чотири — двадцять чотири.',
  '7×8': 'Цифри підряд: 5, 6, 7, 8 — тобто 56 = 7 × 8.',
  '8×8': 'Вісім на вісім — 64. Стільки клітинок на шахівниці.',
  '9×9': 'Девʼять на девʼять — 81. Цифри разом дають 9.',
  '7×7': 'Сім на сім — 49. На одиницю менше за половину сотні.',
  '6×7': 'Крок шість: 6×6 = 36, 6×7 = 42, 6×8 = 48.',
};

export const hookFor = (key) => HOOKS[key] || '';

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
 * забувається за добу, а те, що згадали вп'яте, тримається довше.
 *
 * Взяті щільніші за класичні: шістнадцять днів між показами — це для
 * матеріалу, який просто має не забутись, а таблиця має відповідатись
 * не думаючи. Максимум тиждень, і приклад повертається.
 */
const DUE_DAYS = [0, 1, 2, 3, 5, 7];

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

/** Приклад вивчено, якщо він дався RUN разів поспіль без жодного промаху */
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
 * порожніє: щойно приклад дається потрібну кількість разів поспіль, він
 * звідси зникає.
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
  const taken = new Set(bad.map((x) => x.fact.key + x.mode));
  const rep = due(prog, todayStamp).filter((x) => !taken.has(x.fact.key + x.mode));
  rep.forEach((x) => taken.add(x.fact.key + x.mode));
  const sl = slows(prog).filter((x) => !taken.has(x.fact.key + x.mode));
  sl.forEach((x) => taken.add(x.fact.key + x.mode));

  /*
   * Добір із вивченого. Без нього підхід у гарний день виходив із трьох
   * прикладів, а то й зникав зовсім — «сьогодні чисто, приходьте завтра».
   * Але таблиця не той матеріал, який учать до галочки: вона має
   * відповідатись у будь-якій ситуації, а це дається лише повторами.
   * Тому підхід завжди повний, а місце, що лишилось, займає вивчене —
   * спершу те, що не траплялось найдовше.
   */
  const keep = [];
  if (taken.size < DAY_SIZE) {
    const rest = [];
    FACTS.forEach((f) => ['mul', 'div'].forEach((m) => {
      if (!known(prog, f.key, m) || taken.has(f.key + m)) return;
      const seen = prog[f.key]?.seen ? stampOf(prog[f.key].seen) : 0;
      rest.push({ fact: f, mode: m, seen });
    }));
    rest.sort((a, b) => a.seen - b.seen);
    keep.push(...rest.slice(0, DAY_SIZE - taken.size));
  }

  return { bad, rep, slow: sl, keep, all: [...bad, ...rep, ...sl, ...keep] };
}

/**
 * Найважчі приклади — ті, на яких промахувались найчастіше. Список
 * особистий: у кожного він свій, і саме він робить тренування адресним.
 */
export function hardest(prog, n = 5) {
  const out = [];
  FACTS.forEach((f) => ['mul', 'div'].forEach((m) => {
    const bad = prog[f.key]?.[badKey(m)] || 0;
    if (bad > 0) out.push({ fact: f, mode: m, bad, done: known(prog, f.key, m) });
  }));
  return out.sort((a, b) => b.bad - a.bad).slice(0, n);
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

/**
 * Вигляд питання в підході дня. Майже все — звичайні приклади, кожне
 * четверте з пропуском посередині.
 *
 * Правда-неправда й порівняння звідси прибрані навмисно: це вправи на
 * кмітливість, і серед них повторення губиться. Тренування дня має
 * відповідатись напівавтоматично, у будь-яку вільну хвилину, а не
 * вимагати щоразу зрозуміти, про що взагалі питають.
 */
const dayForm = (i) => (i % 4 === 3 ? 'mid' : 'res');

/**
 * Підхід дня: сталий порядок і повтори блоками.
 *
 * Порядок не випадковий, а той самий, у якому таблицю вчили, — від меншого
 * множника до більшого. Так наступний приклад передбачуваний, і голова
 * витрачається на відповідь, а не на те, щоб зорієнтуватись у питанні.
 */
export function dayQueue(items, size = DAY_SIZE) {
  if (!items.length) return [];

  const lo = (x) => Math.min(x.fact.a, x.fact.b);
  const hi = (x) => Math.max(x.fact.a, x.fact.b);
  const sorted = [...items].sort((a, b) =>
    lo(a) - lo(b) || hi(a) - hi(b) || (a.mode === b.mode ? 0 : a.mode === 'mul' ? -1 : 1));

  // блоки по п'ять; хвіст з одного прикладу приєднуємо до попереднього —
  // інакше він повторився б сам за собою, а це вже списування з екрана
  const blocks = [];
  for (let i = 0; i < sorted.length; i += DAY_BLOCK) blocks.push(sorted.slice(i, i + DAY_BLOCK));
  if (blocks.length > 1 && blocks[blocks.length - 1].length === 1) {
    blocks[blocks.length - 2].push(blocks.pop()[0]);
  }

  const out = [];
  blocks.forEach((block) => {
    for (let r = 0; r < DAY_REPEATS; r++) {
      if (out.length >= size) return;
      block.forEach((it) => { if (out.length < size) out.push(it); });
    }
  });
  // список коротший за підхід — проходимо його ще раз, а не добираємо чужого
  for (let n = 0; out.length < size && sorted.length; n++) out.push(sorted[n % sorted.length]);

  return out.map((it, i) => ask(it.fact, it.mode, dayForm(i)));
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
export function question(fact, mode, hole = 'res') {
  const flip = rnd(2) === 1;
  const p = fact.a * fact.b;

  if (mode === 'div') {
    const by = flip ? fact.b : fact.a;
    const res = p / by;
    return hole === 'mid'
      // «42 ÷ ▢ = 7» — питає дільник, а не частку
      ? { key: fact.key, mode: 'div', hole, answer: by, text: `${p} ÷ ? = ${res}`, pre: `${p} ÷`, post: `= ${res}`, small: true }
      : { key: fact.key, mode: 'div', hole, answer: res, text: `${p} ÷ ${by}`, pre: '', post: `= ${p} ÷ ${by}` };
  }

  const [x, y] = flip ? [fact.b, fact.a] : [fact.a, fact.b];
  return hole === 'mid'
    // «6 × ▢ = 42» — це вже не рахунок, а добір: інша дія й інша памʼять
    ? { key: fact.key, mode: 'mul', hole, answer: y, text: `${x} × ? = ${p}`, pre: `${x} ×`, post: `= ${p}`, small: true }
    : { key: fact.key, mode: 'mul', hole, answer: p, text: `${x} × ${y}`, pre: '', post: `= ${x} × ${y}` };
}

/**
 * Види питань. Один і той самий факт можна спитати чотирма способами, і
 * кожен важчий за попередній: упізнати відповідь, дібрати множник,
 * перевірити чуже твердження, порівняти два вирази. Останні два вимагають
 * порахувати й ще щось із результатом зробити — саме там знання
 * перетворюється на робочий інструмент.
 */
export function trueFalse(fact, mode) {
  const q = question(fact, mode, 'res');
  const lie = rnd(2) === 0;
  const step = mode === 'div' ? 1 : Math.min(fact.a, fact.b);
  const shownAnswer = lie ? Math.max(1, q.answer + (rnd(2) ? step : -step)) : q.answer;
  const body = q.post.replace(/^=\s*/, '');
  return {
    kind: 'tf', key: fact.key, mode, answer: !lie,
    text: `${body} = ${shownAnswer}`,
    shown: `${body} = ${shownAnswer}`,
    real: q.answer,
  };
}

export function compare(fact, mode) {
  const q = question(fact, mode, 'res');
  const left = q.post.replace(/^=\s*/, '');
  const step = mode === 'div' ? 1 : Math.min(fact.a, fact.b);
  const r = rnd(3);
  const right = r === 0 ? q.answer : Math.max(1, q.answer + (r === 1 ? step : -step));
  return {
    kind: 'cmp', key: fact.key, mode,
    left, right: String(right),
    answer: right === q.answer ? 'eq' : q.answer > right ? 'left' : 'right',
    real: q.answer,
  };
}

/**
 * Який вигляд матиме питання. Частки підібрані так, щоб більшість
 * лишалась звичайними прикладами: нові види мають розбавляти повторення,
 * а не підміняти його вправами на кмітливість.
 */
export function formFor(level = 1) {
  const r = Math.random();
  if (level >= 4 && r < 0.12) return 'cmp';
  if (level >= 2 && r < 0.26) return 'tf';
  if (level >= 2 && r < 0.55) return 'mid';
  return 'res';   // перший рівень — самі лише звичайні приклади
}

export function ask(fact, mode, form) {
  if (form === 'tf') return trueFalse(fact, mode);
  if (form === 'cmp') return compare(fact, mode);
  return { ...question(fact, mode, form), kind: 'pick' };
}

/** Кожне третє питання на повторенні — з пропуском посередині */
const holeFor = () => (rnd(3) === 0 ? 'mid' : 'res');

/**
 * Три варіанти відповіді: правильний і два сусідні значення тієї ж
 * таблиці. Помилитись між 16, 24 і 32 можна по-справжньому — це 2×8, 3×8
 * і 4×8; а між 16 і 7 не можна, і такий вибір нічого не тренує.
 */
export function options(q, table) {
  // Коли пропуск посередині, відповідь — множник, тобто число від 2 до 9:
  // сусіди тут через одиницю, а не через крок таблиці.
  if (q.small) {
    const near = [q.answer - 1, q.answer + 1, q.answer - 2, q.answer + 2].filter((n) => n >= LO && n <= HI);
    const out = [q.answer];
    for (const n of near) { if (out.length >= 3) break; if (!out.includes(n)) out.push(n); }
    let e = LO;
    while (out.length < 3) { if (!out.includes(e)) out.push(e); e++; }
    return shuffle(out);
  }
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
 * потрібну кількість разів поспіль. Список живий — його переставляє сам
 * екран за відповідями,
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

  return spread(picked).map((i) => ask(i.fact, i.mode, formFor(4)));
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

/* ---------- Аркада ---------- */

export const ARCADE_LIVES = 3;
export const ARCADE_PER_LEVEL = 10;

/**
 * Складність рівня.
 *
 * Росте не одним важелем, а трьома: часу дають менше, вибір із трьох
 * змінюється набором цифр, а до множення додається ділення й приклади з
 * пропуском посередині. Так рівень сьомий відрізняється від третього не
 * тим, що «швидше», а тим, що це вже інша вправа.
 *
 * Часу дають з запасом: дев'ять секунд на початку, і падає по чверті
 * секунди за рівень до чотирьох. Аркада тут не для того, щоб ловити межу
 * реакції, — вона для того, щоб довести до блиску вже знайоме, а поспіх
 * цьому лише заважає: під секундоміром згадують гірше, ніж уміють.
 */
export function arcadeLevel(n) {
  return {
    n,
    seconds: Math.max(4, 9 - (n - 1) * 0.25),
    typed: n >= 7,
    withDiv: n >= 4,
    holeChance: n >= 8 ? 0.3 : n >= 5 ? 0.15 : 0,
    freshEvery: 4,
  };
}

/**
 * Наступне питання аркади.
 *
 * За звичайних умов трапляється лише вивчене — те, що вже знаєш і чого
 * тут доводиш до блиску. Невивчене з'являється тільки після рівня,
 * пройденого без жодного промаху: ідеально закритий рівень — це і є
 * заявка на складніше. Схибив — наступний рівень знову зі знайомого,
 * доки не вийде чисто.
 *
 * І навіть тоді підкидаємо не будь-що, а з відкритих уроків: кидати 8×8
 * тому, хто дійшов до п'ятірки, — це не складність, а нечесність.
 */
export function arcadeNext(prog, lvl, idx, perfect = false) {
  const cfg = arcadeLevel(lvl);
  const modes = cfg.withDiv ? ['mul', 'div'] : ['mul'];

  const openTables = new Set();
  const opened = unlockedLessons(prog);
  LESSONS.forEach((l, i) => { if (opened[i] && l.kind === 'table') openTables.add(l.table); });

  const learned = [];
  const fresh = [];
  FACTS.forEach((f) => modes.forEach((m) => {
    if (known(prog, f.key, m)) learned.push({ fact: f, mode: m });
    else if (openTables.has(f.a) || openTables.has(f.b)) fresh.push({ fact: f, mode: m });
  }));

  const wantFresh = perfect && fresh.length && idx % cfg.freshEvery === cfg.freshEvery - 1;
  const pool = wantFresh ? fresh : (learned.length ? learned : fresh);
  if (!pool.length) return null;

  const pick = pool[rnd(pool.length)];
  // нове питання завжди звичайне: перше знайомство не місце для головоломок
  const form = wantFresh ? 'res' : formFor(lvl);
  return { ...ask(pick.fact, pick.mode, form), fresh: wantFresh, typed: cfg.typed, seconds: cfg.seconds };
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
