/**
 * Курс програмування — правила й зміст.
 *
 * Мова одна: JavaScript. Не тому, що вона краща за інші, а тому, що це
 * єдина мова, якою можна зробити сторінку в браузері, і та сама, якою
 * написаний цей застосунок. Тобто підручник і робочий приклад — це один
 * і той самий код, у який можна залізти й подивитись, як воно насправді.
 *
 * Тут лише зміст уроків і облік пройденого. Жодного React і жодного
 * читання таблиць — щоб уроки можна було правити, не чіпаючи сторінку.
 */

export const CODE_SHEET = 'Здоровʼя — код';

export const CODE_HEADERS = ['Урок', 'Стан', 'Дата', 'Спроб', 'Код'];

export const CD = { id: 0, state: 1, date: 2, tries: 3, code: 4 };

/**
 * Порядок доріжок.
 *
 * Спершу сторінка — бо її видно. Людина, яка вперше пише код, має за
 * пʼять хвилин побачити на екрані те, що зробила сама; інакше все це
 * лишається розмовами про змінні. Скрипти й основи підмішуються туди, де
 * без них уже не обійтися, а не окремим курсом «спочатку теорія».
 */
export const TRACKS = [
  { key: 'web', label: 'Сторінка', hint: 'Те, що видно очима' },
  { key: 'script', label: 'Скрипти', hint: 'Робота з даними' },
  { key: 'base', label: 'Основи', hint: 'Фундамент під усе' },
];

/*
 * Урок складається з пояснення й одного завдання. Завдання рівно одне,
 * бо урок має закінчуватись: десять вправ поспіль — це вже не урок, а
 * зміна, і кинути її посередині легше, ніж дійти до кінця.
 *
 * `kind` каже, де виконується код:
 *   'page' — сторінка в рамці, видно результат
 *   'js'   — код у пісочниці, видно надруковане
 */

const L = (o) => o;

export const CODE_LESSONS = [
  L({
    id: 'w1', track: 'web', kind: 'page',
    title: 'Перша сторінка',
    goal: 'Побачити на екрані те, що написали самі',
    intro: [
      'Сторінка в браузері — це текст із позначками, що де. Позначки звуться тегами й пишуться в кутових дужках.',
      '`<h1>` — великий заголовок. `<p>` — абзац. Кожен тег відкривається й закривається: `<p>текст</p>`.',
      'Праворуч — справжня сторінка. Змініть текст і натисніть «Запустити».',
    ],
    start: '<h1>Облік майна</h1>\n<p>Мій перший рядок коду.</p>',
    task: 'Додайте ще один абзац із будь-яким своїм текстом.',
    hint: 'Скопіюйте рядок з `<p>` і змініть текст усередині.',
    solution: '<h1>Облік майна</h1>\n<p>Мій перший рядок коду.</p>\n<p>А це другий абзац.</p>',
    check: (html) => (html.match(/<p[\s>]/gi) || []).length >= 2,
    why: 'Не збігається: потрібно два абзаци `<p>`, а зараз менше.',
  }),

  L({
    id: 'w2', track: 'web', kind: 'page',
    title: 'Колір і розмір',
    goal: 'Керувати виглядом, а не лише текстом',
    intro: [
      'Як саме виглядає тег — задає CSS. Він пишеться в `<style>` і каже: «усі `h1` — жовті».',
      'Властивостей багато, але почати вистачить трьох: `color` — колір тексту, `font-size` — розмір, `background` — тло.',
      'Розмір пишеться в пікселях: `24px`. Колір — словом (`gold`) або кодом (`#d9ad25`).',
    ],
    start: '<style>\n  h1 { color: gold; }\n</style>\n\n<h1>Облік майна</h1>\n<p>Абзац поки що звичайний.</p>',
    task: 'Зробіть абзац `p` сірим і розміром 20px.',
    hint: 'Додайте в `<style>` рядок `p { ... }` і всередині дві властивості через крапку з комою.',
    solution: '<style>\n  h1 { color: gold; }\n  p { color: gray; font-size: 20px; }\n</style>\n\n<h1>Облік майна</h1>\n<p>Абзац поки що звичайний.</p>',
    check: (html) => /p\s*\{[^}]*color\s*:/i.test(html) && /p\s*\{[^}]*font-size\s*:\s*20px/i.test(html),
    why: 'Потрібне правило для `p` з кольором і `font-size: 20px`.',
  }),

  L({
    id: 'b1', track: 'base', kind: 'js',
    title: 'Змінна',
    goal: 'Запамʼятати значення й дістати його назад',
    intro: [
      'Комп’ютер виконує команди по черзі, зверху вниз. Кожна команда — окремий рядок.',
      '`let vaha = 92;` означає «запамʼятай число 92 під іменем vaha». Далі слово `vaha` в коді означає 92.',
      '`console.log(...)` друкує значення — це спосіб подивитись, що в змінній насправді.',
    ],
    start: 'let vaha = 92;\nconsole.log(vaha);',
    task: 'Створіть змінну `zrist` зі значенням 178 і надрукуйте її.',
    hint: 'Той самий рядок, але інше імʼя й інше число. Не забудьте `console.log`.',
    solution: 'let zrist = 178;\nconsole.log(zrist);',
    check: (out) => out.trim().split('\n').some((l) => l.trim() === '178'),
    why: 'У виводі має зʼявитись 178.',
  }),

  L({
    id: 'b2', track: 'base', kind: 'js',
    title: 'Числа й текст',
    goal: 'Розрізняти два різні типи значень',
    intro: [
      'Значення бувають різних видів. Число пишеться просто: `92`. Текст — у лапках: `\'Тигр\'`.',
      'Числа можна додавати: `2 + 3` дає `5`. Текст теж «додається», але зліплюється: `\'Ти\' + \'гр\'` дає `\'Тигр\'`.',
      'Тому `\'2\' + 3` дасть `\'23\'`, а не `5` — бо зліва текст. Це найчастіша помилка новачка, і не тільки новачка.',
    ],
    start: 'let kg = 7.7;\nlet nazva = \'Вода\';\nconsole.log(nazva + \' — \' + kg + \' кг\');',
    task: 'Порахуйте суму трьох мішків: 7.7, 7.8 і 12. Надрукуйте лише число.',
    hint: 'Складіть три числа знаком `+` і надрукуйте результат. Лапки тут не потрібні.',
    solution: 'console.log(7.7 + 7.8 + 12);',
    check: (out) => out.replace(/\s/g, '').includes('27.5'),
    why: 'Має надрукуватись 27.5.',
  }),

  L({
    id: 'w3', track: 'web', kind: 'page',
    title: 'Код змінює сторінку',
    goal: 'Звʼязати JavaScript зі сторінкою',
    intro: [
      'Досі текст на сторінці був написаний руками. Тепер його підставить код.',
      '`document.querySelector(\'h1\')` — знайти на сторінці перший `h1`. `.textContent = \'...\'` — замінити його текст.',
      'Код для сторінки пишеться всередині `<script>`.',
    ],
    start: '<h1>Порожньо</h1>\n<p id="stan">—</p>\n\n<script>\n  document.querySelector(\'h1\').textContent = \'Вода\';\n</script>',
    task: 'Зробіть, щоб абзац з `id="stan"` показував текст «3 мішки».',
    hint: 'Шукати за id можна так: `document.querySelector(\'#stan\')`. Далі так само `.textContent = ...`.',
    solution: '<h1>Порожньо</h1>\n<p id="stan">—</p>\n\n<script>\n  document.querySelector(\'h1\').textContent = \'Вода\';\n  document.querySelector(\'#stan\').textContent = \'3 мішки\';\n</script>',
    check: (html, text) => /3\s*мішки/i.test(text),
    why: 'На сторінці має зʼявитись текст «3 мішки».',
  }),

  L({
    id: 'b3', track: 'base', kind: 'js',
    title: 'Умова',
    goal: 'Навчити код вирішувати',
    intro: [
      '`if` виконує команди лише коли умова правдива. `else` — коли ні.',
      'Порівняння: `>` більше, `<` менше, `===` дорівнює. Саме три знаки рівності: один — це присвоєння, а не порівняння.',
      'Те, що всередині фігурних дужок, виконується разом.',
    ],
    start: 'let kg = 25;\n\nif (kg > 20) {\n  console.log(\'Важка\');\n} else {\n  console.log(\'Легка\');\n}',
    task: 'Змініть так, щоб при рівно 20 кг друкувалось «Норма» — а більше й менше як було.',
    hint: 'Потрібна ще одна гілка: `else if (kg === 20) { ... }` між `if` і `else`.',
    solution: 'let kg = 20;\n\nif (kg > 20) {\n  console.log(\'Важка\');\n} else if (kg === 20) {\n  console.log(\'Норма\');\n} else {\n  console.log(\'Легка\');\n}',
    check: (out, code) => /Норма/.test(out) && /else\s+if/.test(code),
    why: 'Потрібна гілка `else if` і щоб у виводі було «Норма».',
  }),

  L({
    id: 's1', track: 'script', kind: 'js',
    title: 'Список',
    goal: 'Тримати багато значень в одному місці',
    intro: [
      'Масив — це список значень у квадратних дужках: `[7.7, 7.8, 12]`.',
      '`.length` каже, скільки їх. Звертання за номером: `bags[0]` — перший, `bags[1]` — другий. Рахунок з нуля, і це не помилка, а домовленість.',
      'Тепер мішків може бути скільки завгодно — код не змінюється.',
    ],
    start: 'let bags = [7.7, 7.8, 12];\n\nconsole.log(bags.length);\nconsole.log(bags[0]);',
    task: 'Надрукуйте останній мішок зі списку — але так, щоб працювало за будь-якої кількості.',
    hint: 'Останній номер — це `bags.length - 1`. Підставте цей вираз у квадратні дужки.',
    solution: 'let bags = [7.7, 7.8, 12];\n\nconsole.log(bags[bags.length - 1]);',
    check: (out, code) => /length\s*-\s*1/.test(code) && out.includes('12'),
    why: 'Потрібно `bags[bags.length - 1]`, а не `bags[2]`: число 2 працює лише для трьох мішків.',
  }),

  L({
    id: 's2', track: 'script', kind: 'js',
    title: 'Цикл',
    goal: 'Зробити одне й те саме з кожним',
    intro: [
      'Цикл повторює команди для кожного значення списку.',
      '`for (let b of bags) { ... }` читається просто: «для кожного b зі списку bags зроби те, що в дужках».',
      'Саме тут код починає економити час: неважливо, три мішки чи триста.',
    ],
    start: 'let bags = [7.7, 7.8, 12];\n\nfor (let b of bags) {\n  console.log(b);\n}',
    task: 'Порахуйте суму всіх мішків циклом і надрукуйте одне число в кінці.',
    hint: 'Заведіть `let sum = 0;` до циклу, всередині робіть `sum = sum + b;`, а `console.log(sum)` — після циклу.',
    solution: 'let bags = [7.7, 7.8, 12];\nlet sum = 0;\n\nfor (let b of bags) {\n  sum = sum + b;\n}\n\nconsole.log(sum);',
    check: (out, code) => /for\s*\(/.test(code) && out.replace(/\s/g, '').includes('27.5'),
    why: 'Потрібен цикл `for` і 27.5 у виводі.',
  }),

  L({
    id: 'b4', track: 'base', kind: 'js',
    title: 'Функція',
    goal: 'Дати шматку коду імʼя й викликати його скільки треба',
    intro: [
      'Функція — це названа послідовність команд. `function vaga(bags) { ... }` створює, `vaga([1, 2])` викликає.',
      'Те, що в дужках при створенні, — це «те, що дадуть». Те, що після `return`, — «те, що поверне».',
      'Після `return` функція закінчується: рядки нижче не виконаються.',
    ],
    start: 'function podviyne(x) {\n  return x * 2;\n}\n\nconsole.log(podviyne(21));',
    task: 'Напишіть функцію `sumaBags(bags)`, яка повертає суму списку. Перевірте на `[7.7, 7.8, 12]`.',
    hint: 'Усередині — той самий цикл, що в минулому уроці, а в кінці замість `console.log` пишіть `return sum;`.',
    solution: 'function sumaBags(bags) {\n  let sum = 0;\n  for (let b of bags) {\n    sum = sum + b;\n  }\n  return sum;\n}\n\nconsole.log(sumaBags([7.7, 7.8, 12]));',
    check: (out, code) => /function\s+sumaBags/.test(code) && /return/.test(code) && out.replace(/\s/g, '').includes('27.5'),
    why: 'Потрібна функція `sumaBags` із `return` і 27.5 у виводі.',
  }),

  L({
    id: 'w4', track: 'web', kind: 'page',
    title: 'Кнопка',
    goal: 'Зробити сторінку, яка відповідає на дію',
    intro: [
      'Досі код виконувався один раз при відкритті. Тепер він чекатиме натискання.',
      '`.addEventListener(\'click\', () => { ... })` означає «коли натиснуть — зроби це».',
      '`() => { ... }` — це теж функція, просто без імені: її нікуди більше не викликати, тож імʼя й не потрібне.',
    ],
    start: '<button id="plus">+250 мл</button>\n<p id="voda">0 мл</p>\n\n<script>\n  let voda = 0;\n  document.querySelector(\'#plus\').addEventListener(\'click\', () => {\n    voda = voda + 250;\n    document.querySelector(\'#voda\').textContent = voda + \' мл\';\n  });\n</script>',
    task: 'Додайте другу кнопку «−250 мл», яка віднімає. Нижче нуля опускатись не має.',
    hint: 'Друга кнопка з іншим id, свій `addEventListener`, а всередині перевірка `if (voda >= 250)`.',
    solution: '<button id="plus">+250 мл</button>\n<button id="minus">−250 мл</button>\n<p id="voda">0 мл</p>\n\n<script>\n  let voda = 0;\n  const show = () => {\n    document.querySelector(\'#voda\').textContent = voda + \' мл\';\n  };\n  document.querySelector(\'#plus\').addEventListener(\'click\', () => {\n    voda = voda + 250;\n    show();\n  });\n  document.querySelector(\'#minus\').addEventListener(\'click\', () => {\n    if (voda >= 250) voda = voda - 250;\n    show();\n  });\n</script>',
    check: (html) => (html.match(/<button/gi) || []).length >= 2
      && (html.match(/addEventListener/g) || []).length >= 2
      && /-\s*250|250\s*\*\s*-1|voda\s*-/.test(html),
    why: 'Потрібні дві кнопки, два `addEventListener` і віднімання.',
  }),
];

export const lessonById = (id) => CODE_LESSONS.find((l) => l.id === id) || null;

/** Уроки йдуть підряд: наступний відкривається, коли зроблено попередній */
export function openUpTo(prog) {
  let i = 0;
  while (i < CODE_LESSONS.length && prog[CODE_LESSONS[i].id]?.state === 'done') i++;
  return i;               // індекс першого незробленого
}

export function isOpen(prog, idx) {
  return idx <= openUpTo(prog);
}

export function nextLesson(prog) {
  const i = openUpTo(prog);
  return i < CODE_LESSONS.length ? CODE_LESSONS[i] : null;
}

export function courseStats(prog) {
  const done = CODE_LESSONS.filter((l) => prog[l.id]?.state === 'done').length;
  const byTrack = TRACKS.map((t) => {
    const all = CODE_LESSONS.filter((l) => l.track === t.key);
    return {
      ...t,
      total: all.length,
      done: all.filter((l) => prog[l.id]?.state === 'done').length,
    };
  });
  return { done, total: CODE_LESSONS.length, byTrack };
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
};

export function parseCode(values) {
  const out = {};
  (values || []).slice(1).forEach((raw) => {
    const r = [...(raw || [])];
    const id = String(r[CD.id] ?? '').trim();
    if (!id) return;
    out[id] = {
      id,
      state: String(r[CD.state] ?? '').trim() === 'done' ? 'done' : '',
      date: String(r[CD.date] ?? '').trim(),
      tries: Math.max(0, Math.round(num(r[CD.tries]))),
      code: String(r[CD.code] ?? ''),
    };
  });
  return out;
}

/** Увесь прогрес рядками — лист переписується цілком, це один запит */
export function codeRows(prog) {
  return CODE_LESSONS.map((l) => {
    const p = prog[l.id] || {};
    return [l.id, p.state || '', p.date || '', p.tries || 0, p.code || ''];
  });
}
