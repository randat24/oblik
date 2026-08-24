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

  L({
    id: 'b5', track: 'base', kind: 'js',
    title: 'Обʼєкт',
    goal: 'Тримати різні відомості про одну річ разом',
    intro: [
      'Список добре тримає числа. Але мішок — це не лише вага: у нього є назва, вага й позначка «в першу чергу».',
      'Обʼєкт тримає їх разом: `let bag = { name: ʼВодаʼ, kg: 7.7 };`. Поля через кому, значення після двокрапки.',
      'Дістати поле — `bag.name`. Змінити — `bag.kg = 8;`. Додати нове поле — так само, як змінити.',
    ],
    start: 'let bag = { name: \'Вода\', kg: 7.7 };\n\nconsole.log(bag.name);\nconsole.log(bag.kg);',
    task: 'Додайте мішку поле `hot` зі значенням `true`, і якщо воно правдиве — надрукуйте «Вода — в першу чергу».',
    hint: 'Спершу `bag.hot = true;`, далі `if (bag.hot) { ... }` і всередині друк.',
    solution: 'let bag = { name: \'Вода\', kg: 7.7 };\nbag.hot = true;\n\nif (bag.hot) {\n  console.log(bag.name + \' — в першу чергу\');\n}',
    check: (out, code) => /\.hot\s*=/.test(code) && /в\s+першу\s+чергу/i.test(out),
    why: 'Потрібне поле `hot` і рядок «в першу чергу» у виводі.',
  }),

  L({
    id: 's3', track: 'script', kind: 'js',
    title: 'Список обʼєктів',
    goal: 'Тримати багато однакових записів — так, як лежать справжні дані',
    intro: [
      'Масив обʼєктів — це і є таблиця в коді. Саме так у застосунку лежать посилки, ящики й люди.',
      'Цикл проходить список, а всередині доступні всі поля: `for (let b of bags) { console.log(b.name); }`.',
      'Такий масив замінює десяток окремих змінних, і код перестає залежати від того, скільки там записів.',
    ],
    start: 'let bags = [\n  { name: \'Вода\', kg: 7.7 },\n  { name: \'Їжа\', kg: 3 },\n  { name: \'Батареї\', kg: 1.3 },\n];\n\nfor (let b of bags) {\n  console.log(b.name);\n}',
    task: 'Надрукуйте кожен мішок у вигляді «Вода — 7.7 кг».',
    hint: 'Усередині циклу зліпіть текст: `b.name + ʼ — ʼ + b.kg + ʼ кгʼ`.',
    solution: 'let bags = [\n  { name: \'Вода\', kg: 7.7 },\n  { name: \'Їжа\', kg: 3 },\n  { name: \'Батареї\', kg: 1.3 },\n];\n\nfor (let b of bags) {\n  console.log(b.name + \' — \' + b.kg + \' кг\');\n}',
    check: (out) => /Вода\s*—\s*7\.7\s*кг/.test(out) && /Батареї\s*—\s*1\.3\s*кг/.test(out),
    why: 'У виводі мають бути рядки на кшталт «Вода — 7.7 кг» для кожного мішка.',
  }),

  L({
    id: 'w5', track: 'web', kind: 'page',
    title: 'Список на сторінці',
    goal: 'Показати дані з масиву, а не вписані руками',
    intro: [
      'Дані вже є в коді — лишилось показати їх, і не руками, а з масиву.',
      '`innerHTML` замінює весь вміст елемента розміткою: `box.innerHTML = ʼ<p>Привіт</p>ʼ;`.',
      'Розмітку в циклі накопичують у рядок, а записують один раз наприкінці: кожен запис у сторінку коштує браузеру роботи.',
    ],
    start: '<ul id="spysok"></ul>\n\n<script>\n  const bags = [\n    { name: \'Вода\', kg: 7.7 },\n    { name: \'Їжа\', kg: 3 },\n  ];\n\n  let html = \'\';\n  for (let b of bags) {\n    html = html + \'<li>\' + b.name + \'</li>\';\n  }\n  document.querySelector(\'#spysok\').innerHTML = html;\n</script>',
    task: 'Додайте до кожного рядка вагу — «Вода — 7.7 кг» — і третій мішок «Батареї» вагою 1.3.',
    hint: 'У масив додайте ще один обʼєкт, а в рядку `<li>` допишіть `+ ʼ — ʼ + b.kg + ʼ кгʼ`.',
    solution: '<ul id="spysok"></ul>\n\n<script>\n  const bags = [\n    { name: \'Вода\', kg: 7.7 },\n    { name: \'Їжа\', kg: 3 },\n    { name: \'Батареї\', kg: 1.3 },\n  ];\n\n  let html = \'\';\n  for (let b of bags) {\n    html = html + \'<li>\' + b.name + \' — \' + b.kg + \' кг</li>\';\n  }\n  document.querySelector(\'#spysok\').innerHTML = html;\n</script>',
    check: (html, text) => /Вода\s*—\s*7\.7\s*кг/.test(text) && /Батареї/.test(text),
    why: 'На сторінці має бути «Вода — 7.7 кг» і рядок про батареї.',
  }),

  L({
    id: 'b6', track: 'base', kind: 'js',
    title: 'Шаблонний рядок',
    goal: 'Складати текст без плюсів і загублених пробілів',
    intro: [
      'Зліплювати текст плюсами незручно: легко загубити пробіл або лапку, і помилку видно вже на екрані.',
      'Шаблонний рядок пишеться у зворотних лапках, а значення підставляються так: `` `${b.name} — ${b.kg} кг` ``.',
      'Усередині `${...}` можна писати будь-який вираз, навіть обчислення: `${kg * 2}`.',
    ],
    start: 'let name = \'Вода\';\nlet kg = 7.7;\n\nconsole.log(name + \' — \' + kg + \' кг\');',
    task: 'Перепишіть цей рядок шаблонним і допишіть подвоєну вагу: «Вода — 7.7 кг (двічі це 15.4)».',
    hint: 'Зворотні лапки замість звичайних, а замість плюсів — `${name}`, `${kg}` і `${kg * 2}`.',
    solution: 'let name = \'Вода\';\nlet kg = 7.7;\n\nconsole.log(`${name} — ${kg} кг (двічі це ${kg * 2})`);',
    check: (out, code) => /`/.test(code) && /\$\{/.test(code) && out.includes('15.4'),
    why: 'Потрібні зворотні лапки з `${...}` і число 15.4 у виводі.',
  }),

  L({
    id: 's4', track: 'script', kind: 'js',
    title: 'Відбір',
    goal: 'Лишити зі списку тільки потрібне',
    intro: [
      '`filter` лишає те, що підходить: `bags.filter((b) => b.hot)` дає список самих першочергових.',
      'У дужках — функція, яка про кожен мішок каже «так» або «ні». Новий список повертається окремо, старий лишається цілим.',
      'Саме так у застосунку рахується, скільки мішків чекає найближчого борту.',
    ],
    start: 'let bags = [\n  { name: \'Вода\', kg: 7.7, hot: true },\n  { name: \'Їжа\', kg: 3, hot: false },\n  { name: \'Батареї\', kg: 1.3, hot: true },\n  { name: \'Пальне\', kg: 12, hot: false },\n];\n\nconsole.log(bags.filter((b) => b.hot)[0].name);',
    task: 'Порахуйте, скільки мішків важчі за 5 кг, і надрукуйте це число.',
    hint: '`bags.filter((b) => b.kg > 5)` — а далі `.length`.',
    solution: 'let bags = [\n  { name: \'Вода\', kg: 7.7, hot: true },\n  { name: \'Їжа\', kg: 3, hot: false },\n  { name: \'Батареї\', kg: 1.3, hot: true },\n  { name: \'Пальне\', kg: 12, hot: false },\n];\n\nconsole.log(bags.filter((b) => b.kg > 5).length);',
    check: (out, code) => /filter/.test(code)
      && out.trim().split('\n').some((l) => l.trim() === '2'),
    why: 'Потрібен `filter` за вагою, і у виводі має бути 2.',
  }),

  L({
    id: 's5', track: 'script', kind: 'js',
    title: 'Перетворення',
    goal: 'Зробити з одного списку інший',
    intro: [
      '`map` робить із кожного елемента новий: `bags.map((b) => b.name)` дає список самих назв.',
      'Довжина не змінюється — на відміну від `filter`, тут нічого не викидається, лише перетворюється.',
      '`.join(ʼ; ʼ)` зліплює список в один рядок. Саме так місця посилки пишуться в одну клітинку таблиці.',
    ],
    start: 'let bags = [\n  { name: \'Вода\', kg: 7.7 },\n  { name: \'Їжа\', kg: 3 },\n  { name: \'Батареї\', kg: 1.3 },\n];\n\nconsole.log(bags.map((b) => b.name));',
    task: 'Зробіть із мішків один рядок: «Вода; Їжа; Батареї».',
    hint: 'До `map` допишіть `.join(ʼ; ʼ)` і надрукуйте результат.',
    solution: 'let bags = [\n  { name: \'Вода\', kg: 7.7 },\n  { name: \'Їжа\', kg: 3 },\n  { name: \'Батареї\', kg: 1.3 },\n];\n\nconsole.log(bags.map((b) => b.name).join(\'; \'));',
    check: (out, code) => /map/.test(code) && /join/.test(code)
      && /Вода;\s*Їжа;\s*Батареї/.test(out),
    why: 'Потрібні `map` і `join`, а у виводі — «Вода; Їжа; Батареї».',
  }),

  L({
    id: 's6', track: 'script', kind: 'js',
    title: 'Підсумок',
    goal: 'Згорнути список в одне число',
    intro: [
      '`reduce` перетворює список на одне значення: суму, максимум, підрахунок.',
      '`bags.reduce((a, b) => a + b.kg, 0)` читається так: почни з нуля і до накопиченого `a` додавай `b.kg`.',
      'Це той самий цикл із `sum`, лише в один рядок — і без змінної, яку можна забути обнулити.',
    ],
    start: 'let bags = [\n  { name: \'Вода\', kg: 7.7, hot: true },\n  { name: \'Їжа\', kg: 3, hot: false },\n  { name: \'Батареї\', kg: 1.3, hot: true },\n];\n\nconsole.log(bags.reduce((a, b) => a + b.kg, 0));',
    task: 'Порахуйте сумарну вагу лише першочергових мішків.',
    hint: 'Спершу `filter`, потім `reduce` — їх пишуть підряд через крапку.',
    solution: 'let bags = [\n  { name: \'Вода\', kg: 7.7, hot: true },\n  { name: \'Їжа\', kg: 3, hot: false },\n  { name: \'Батареї\', kg: 1.3, hot: true },\n];\n\nconsole.log(bags.filter((b) => b.hot).reduce((a, b) => a + b.kg, 0));',
    check: (out, code) => /reduce/.test(code) && /filter/.test(code)
      && out.trim().split('\n').some((l) => l.trim() === '9'),
    why: 'Потрібні `filter` і `reduce`, а у виводі — 9.',
  }),

  L({
    id: 's7', track: 'script', kind: 'js',
    title: 'Порядок',
    goal: 'Сортувати числа, а не текст',
    intro: [
      '`sort` без пояснень сортує як текст: `[10, 9, 100].sort()` дає `[10, 100, 9]`. Це не помилка, так домовились.',
      'Щоб сортувати числа, треба сказати як: `bags.sort((a, b) => a.kg - b.kg)` — від легшого до важчого. Навпаки — `b.kg - a.kg`.',
      '`sort` міняє сам список, а не повертає новий. Якщо старий порядок ще потрібен — спершу копія: `[...bags]`.',
    ],
    start: 'console.log([10, 9, 100].sort());\n\nlet bags = [\n  { name: \'Вода\', kg: 7.7 },\n  { name: \'Їжа\', kg: 3 },\n  { name: \'Пальне\', kg: 12 },\n];',
    task: 'Надрукуйте назви мішків від найважчого до найлегшого, кожну з нового рядка.',
    hint: '`bags.sort((a, b) => b.kg - a.kg)`, далі цикл або `map` із друком назв.',
    solution: 'let bags = [\n  { name: \'Вода\', kg: 7.7 },\n  { name: \'Їжа\', kg: 3 },\n  { name: \'Пальне\', kg: 12 },\n];\n\nfor (let b of bags.sort((a, c) => c.kg - a.kg)) {\n  console.log(b.name);\n}',
    check: (out, code) => {
      if (!/sort\s*\(\s*\(/.test(code)) return false;
      const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
      const i = (n) => lines.findIndex((l) => l.includes(n));
      return i('Пальне') > -1 && i('Пальне') < i('Вода') && i('Вода') < i('Їжа');
    },
    why: 'Потрібен `sort` із порівнянням, а порядок у виводі — Пальне, Вода, Їжа.',
  }),

  L({
    id: 'w6', track: 'web', kind: 'page',
    title: 'Поле вводу',
    goal: 'Прийняти те, що написала людина',
    intro: [
      '`<input>` — поле, куди пише людина. Прочитати написане: `input.value`.',
      'Значення завжди текст, навіть коли там цифри: `ʼ7ʼ + 1` дасть `ʼ71ʼ`. Число дістають через `Number(input.value)`.',
      'Далі — те, що вже вміємо: додати в масив і перемалювати список.',
    ],
    start: '<input id="nazva" placeholder="Назва мішка">\n<button id="dodaty">Додати</button>\n<ul id="spysok"></ul>\n\n<script>\n  const bags = [];\n\n  const malyuy = () => {\n    document.querySelector(\'#spysok\').innerHTML =\n      bags.map((b) => \'<li>\' + b + \'</li>\').join(\'\');\n  };\n\n  document.querySelector(\'#dodaty\').addEventListener(\'click\', () => {\n    const el = document.querySelector(\'#nazva\');\n    bags.push(el.value);\n    malyuy();\n  });\n</script>',
    task: 'Зробіть, щоб порожнє поле нічого не додавало, а після додавання поле очищалось.',
    hint: 'Перед `push` перевірте `if (!el.value.trim()) return;`, а після `malyuy()` поставте `el.value = ʼʼ;`.',
    solution: '<input id="nazva" placeholder="Назва мішка">\n<button id="dodaty">Додати</button>\n<ul id="spysok"></ul>\n\n<script>\n  const bags = [];\n\n  const malyuy = () => {\n    document.querySelector(\'#spysok\').innerHTML =\n      bags.map((b) => \'<li>\' + b + \'</li>\').join(\'\');\n  };\n\n  document.querySelector(\'#dodaty\').addEventListener(\'click\', () => {\n    const el = document.querySelector(\'#nazva\');\n    if (!el.value.trim()) return;\n    bags.push(el.value.trim());\n    malyuy();\n    el.value = \'\';\n  });\n</script>',
    check: (html) => /\.value/.test(html)
      && /addEventListener/.test(html)
      && /if\s*\(\s*!/.test(html)
      && /\.value\s*=\s*(\'\'|"")/.test(html),
    why: 'Потрібна перевірка на порожнє поле і очищення `el.value = ʼʼ` після додавання.',
  }),

  L({
    id: 'b7', track: 'base', kind: 'js',
    title: 'Коли нічого немає',
    goal: 'Пережити відсутнє поле, а не впасти на ньому',
    intro: [
      'Поля може не бути. `bag.note` для мішка без примітки дасть `undefined` — «такого поля немає».',
      'Найчастіше падіння в JS звучить так: `Cannot read properties of undefined`. Це означає, що ви взяли поле в того, кого немає.',
      '`bag?.note` не падає, а дає `undefined`. `bag.note ?? ʼ—ʼ` підставляє запасне значення, коли порожньо.',
    ],
    start: 'let bags = [\n  { name: \'Вода\', note: \'обережно\' },\n  { name: \'Їжа\' },\n  { name: \'Батареї\', note: \'\' },\n];\n\nfor (let b of bags) {\n  console.log(b.name + \': \' + b.note);\n}',
    task: 'Зробіть, щоб замість `undefined` і порожнечі друкувався прочерк «—».',
    hint: 'Порожній рядок теж треба замінити, тож `??` тут замало: спробуйте `b.note || ʼ—ʼ`.',
    solution: 'let bags = [\n  { name: \'Вода\', note: \'обережно\' },\n  { name: \'Їжа\' },\n  { name: \'Батареї\', note: \'\' },\n];\n\nfor (let b of bags) {\n  console.log(b.name + \': \' + (b.note || \'—\'));\n}',
    check: (out) => !/undefined/.test(out)
      && (out.match(/—/g) || []).length >= 2
      && /обережно/.test(out),
    why: 'У виводі не має бути `undefined`, а замість порожніх приміток — два прочерки.',
  }),

  L({
    id: 'b8', track: 'base', kind: 'js',
    title: 'Коли ламається',
    goal: 'Перехопити помилку й прочитати, що саме не так',
    // єдиний урок, де стартовий код навмисно падає: побачити справжнє
    // повідомлення помилки — це половина завдання
    startBreaks: true,
    intro: [
      'Помилка зупиняє все, що нижче. `try { ... } catch (e) { ... }` дає перехопити її й вирішити, що робити далі.',
      '`e.message` — сам текст помилки. Читати його варто буквально: там написано, що саме не так, а не «щось пішло не так».',
      'Ловити не означає ховати. У застосунку журнал пише «не вдалося записати» і працює далі — але мовчки не ковтає нічого.',
    ],
    start: 'let ryadok = \'{ "kg": 7.7 }\';\nlet zipsovanyi = \'це не json\';\n\nconsole.log(JSON.parse(ryadok).kg);\nconsole.log(JSON.parse(zipsovanyi));',
    task: 'Зробіть так, щоб замість падіння друкувалось «Не вдалося прочитати: » з текстом помилки, а код дійшов до кінця.',
    hint: 'Оберніть другий розбір у `try { ... } catch (e) { console.log(ʼНе вдалося прочитати: ʼ + e.message); }`.',
    solution: 'let ryadok = \'{ "kg": 7.7 }\';\nlet zipsovanyi = \'це не json\';\n\nconsole.log(JSON.parse(ryadok).kg);\n\ntry {\n  console.log(JSON.parse(zipsovanyi));\n} catch (e) {\n  console.log(\'Не вдалося прочитати: \' + e.message);\n}\n\nconsole.log(\'а код працює далі\');',
    check: (out, code) => /try/.test(code) && /catch/.test(code)
      && /Не вдалося прочитати/.test(out)
      && /7\.7/.test(out),
    why: 'Потрібні `try`/`catch`, рядок «Не вдалося прочитати» у виводі — і щоб перше число теж надрукувалось.',
  }),

  L({
    id: 's8', track: 'script', kind: 'js',
    title: 'Дати',
    goal: 'Порахувати, скільки минуло діб',
    intro: [
      'Дата в таблиці — це рядок «16.08.2026». Порівнювати такі рядки не можна: як текст «02.09» менше за «16.08».',
      '`Date.UTC(рік, місяць - 1, день)` дає число — мілісекунди. Місяці рахуються з нуля, і це джерело половини помилок із датами.',
      'Різниця двох таких чисел, поділена на 86400000, — це доба. Саме так у застосунку рахується, скільки посилка стоїть на етапі.',
    ],
    start: 'function vChyslo(d) {\n  const [den, misyats, rik] = d.split(\'.\');\n  return Date.UTC(Number(rik), Number(misyats) - 1, Number(den));\n}\n\nconsole.log(vChyslo(\'16.08.2026\'));',
    task: 'Напишіть функцію `dniMizh(a, b)`, яка повертає різницю двох дат у добах. Перевірте на «16.08.2026» і «20.08.2026».',
    hint: 'Відніміть одне число від іншого й поділіть на 86400000. Округліть через `Math.round`.',
    solution: 'function vChyslo(d) {\n  const [den, misyats, rik] = d.split(\'.\');\n  return Date.UTC(Number(rik), Number(misyats) - 1, Number(den));\n}\n\nfunction dniMizh(a, b) {\n  return Math.round((vChyslo(b) - vChyslo(a)) / 86400000);\n}\n\nconsole.log(dniMizh(\'16.08.2026\', \'20.08.2026\'));',
    check: (out, code) => /Date\.UTC/.test(code) && /dniMizh/.test(code)
      && out.trim().split('\n').some((l) => l.trim() === '4'),
    why: 'Потрібна функція `dniMizh` на `Date.UTC`, а у виводі — 4.',
  }),

  L({
    id: 'b9', track: 'base', kind: 'js',
    title: 'Функція як значення',
    goal: 'Передавати не результат, а саму дію',
    intro: [
      'Функцію можна не лише викликати, а й передати — як число чи рядок. Саме це відбувається в `filter((b) => b.hot)`.',
      '`bags.filter(vazhki)` — без дужок після імені. Дужки означали б «виклич зараз», а треба «ось тобі функція, викличеш сама».',
      'На цьому тримається все: `addEventListener` бере функцію, щоб викликати її потім, `sort` — щоб питати про кожну пару.',
    ],
    start: 'let bags = [\n  { name: \'Вода\', kg: 7.7 },\n  { name: \'Їжа\', kg: 3 },\n  { name: \'Пальне\', kg: 12 },\n];\n\nfunction vazhki(b) {\n  return b.kg > 5;\n}\n\nconsole.log(bags.filter(vazhki).length);',
    task: 'Напишіть функцію `kozhen(list, fn)`, яка сама викликає `fn` для кожного елемента. Скористайтесь нею, щоб надрукувати назви.',
    hint: 'Усередині — звичайний цикл, а в тілі `fn(b);`. Викликати: `kozhen(bags, (b) => console.log(b.name));`.',
    solution: 'let bags = [\n  { name: \'Вода\', kg: 7.7 },\n  { name: \'Їжа\', kg: 3 },\n  { name: \'Пальне\', kg: 12 },\n];\n\nfunction kozhen(list, fn) {\n  for (let x of list) {\n    fn(x);\n  }\n}\n\nkozhen(bags, (b) => console.log(b.name));',
    check: (out, code) => /kozhen/.test(code) && /fn\s*\(/.test(code)
      && /Вода/.test(out) && /Пальне/.test(out),
    why: 'Потрібна функція `kozhen`, яка викликає передану `fn`, і назви мішків у виводі.',
  }),

  L({
    id: 's9', track: 'script', kind: 'js',
    title: 'Очікування',
    goal: 'Дочекатись того, що приходить не одразу',
    intro: [
      'Деякі дії не миттєві: запит на сервер, читання файлу. Код їх не чекає — він іде далі, а відповідь приходить згодом.',
      '`await` каже «зупинись тут, доки не прийде». Працює лише всередині функції, позначеної `async`.',
      'Без нього ви отримаєте не дані, а `Promise` — обіцянку, що дані колись будуть. Надрукувати обіцянку можна, користі з неї немає.',
    ],
    start: 'const zachekay = (ms) => new Promise((r) => setTimeout(r, ms));\n\nasync function main() {\n  console.log(\'почали\');\n  await zachekay(300);\n  console.log(\'минуло 0.3 с\');\n}\n\nmain();',
    task: 'Додайте `async`-функцію `dayVagu()`, яка чекає 200 мс і повертає 27.5. Надрукуйте отримане число в `main`.',
    hint: '`async function dayVagu() { await zachekay(200); return 27.5; }`, а в `main` — `const kg = await dayVagu();`.',
    solution: 'const zachekay = (ms) => new Promise((r) => setTimeout(r, ms));\n\nasync function dayVagu() {\n  await zachekay(200);\n  return 27.5;\n}\n\nasync function main() {\n  console.log(\'почали\');\n  const kg = await dayVagu();\n  console.log(kg);\n}\n\nmain();',
    check: (out, code) => /async/.test(code) && /await\s+dayVagu/.test(code)
      && out.includes('27.5'),
    why: 'Потрібні `async` і `await dayVagu()`, а у виводі — 27.5.',
  }),

  L({
    id: 's10', track: 'script', kind: 'js',
    title: 'Запит на сервер',
    goal: 'Попросити дані й перевірити, чи вони прийшли',
    intro: [
      'Сторінка не читає таблицю сама — вона просить сервер. Це і є `fetch`: «дай дані за цією адресою».',
      'Головна пастка: `fetch` не вважає помилкою ані 404, ані 500. Запит же дійшов, відповідь є. Перевіряти доводиться руками — `res.ok`.',
      'Тут сервер несправжній, щоб урок працював без мережі, але поводиться так само. Справжній виклик — у `pages/zbir.js`, функція `api`.',
    ],
    start: 'const server = async (adresa) => {\n  if (adresa === \'/api/bags\') {\n    return { ok: true, status: 200, json: async () => ({ kg: 27.5 }) };\n  }\n  return { ok: false, status: 404, json: async () => ({}) };\n};\n\nasync function main() {\n  const res = await server(\'/api/bags\');\n  const data = await res.json();\n  console.log(data.kg);\n}\n\nmain();',
    task: 'Допишіть перевірку `res.ok`: коли відповідь погана — друкувати «Помилка 404». Викличте `main` для обох адрес.',
    hint: 'Винесіть адресу в аргумент: `async function main(adresa)`. Усередині — `if (!res.ok) { console.log(ʼПомилка ʼ + res.status); return; }`.',
    solution: 'const server = async (adresa) => {\n  if (adresa === \'/api/bags\') {\n    return { ok: true, status: 200, json: async () => ({ kg: 27.5 }) };\n  }\n  return { ok: false, status: 404, json: async () => ({}) };\n};\n\nasync function main(adresa) {\n  const res = await server(adresa);\n  if (!res.ok) {\n    console.log(\'Помилка \' + res.status);\n    return;\n  }\n  const data = await res.json();\n  console.log(data.kg);\n}\n\nmain(\'/api/bags\');\nmain(\'/api/nemaye\');',
    check: (out, code) => /res\.ok|!\s*res\.ok/.test(code)
      && /Помилка\s*404/.test(out)
      && out.includes('27.5'),
    why: 'Потрібна перевірка `res.ok`, а у виводі — і 27.5, і «Помилка 404».',
  }),

  L({
    id: 'w7', track: 'web', kind: 'page',
    title: 'Три стани екрана',
    goal: 'Не лишати людину перед порожнечею',
    intro: [
      'Поки дані йдуть, екран не має бути порожнім — інакше здається, що зламалось.',
      'Станів завжди чотири: чекаємо, вийшла помилка, порожньо, і аж потім самі дані.',
      'Найчастіша недоробка початківця — намалювати лише останній. У полі це виглядає як «застосунок не працює».',
    ],
    start: '<div id="ekran">Завантаження…</div>\n\n<script>\n  const ekran = document.querySelector(\'#ekran\');\n\n  const zavantazhyty = async () => {\n    await new Promise((r) => setTimeout(r, 300));\n    return [];          // сервер відповів, але даних немає\n  };\n\n  zavantazhyty().then((bags) => {\n    ekran.innerHTML = bags.map((b) => \'<p>\' + b + \'</p>\').join(\'\');\n  });\n</script>',
    task: 'Додайте стан «порожньо»: якщо список порожній — показати «Поки нічого немає», а не порожній екран.',
    hint: 'Перед малюванням списку перевірте `if (bags.length === 0) { ekran.textContent = ʼПоки нічого немаєʼ; return; }`.',
    solution: '<div id="ekran">Завантаження…</div>\n\n<script>\n  const ekran = document.querySelector(\'#ekran\');\n\n  const zavantazhyty = async () => {\n    await new Promise((r) => setTimeout(r, 300));\n    return [];\n  };\n\n  zavantazhyty().then((bags) => {\n    if (bags.length === 0) {\n      ekran.textContent = \'Поки нічого немає\';\n      return;\n    }\n    ekran.innerHTML = bags.map((b) => \'<p>\' + b + \'</p>\').join(\'\');\n  });\n</script>',
    check: (html, text) => /length\s*===\s*0|length\s*==\s*0|length\s*<\s*1|!\s*\w+\.length/.test(html)
      && /Поки нічого немає/.test(text),
    why: 'Потрібна перевірка порожнього списку, а на сторінці — напис «Поки нічого немає».',
  }),

  L({
    id: 'b10', track: 'base', kind: 'js',
    title: 'Копія замість зміни',
    goal: 'Не псувати те, що комусь ще знадобиться',
    intro: [
      '`const { name, kg } = bag;` дістає два поля одразу — далі пишеться просто `name`, без `bag.`.',
      '`[...bags]` робить копію списку, `{ ...bag, kg: 8 }` — копію обʼєкта зі зміненим полем.',
      'Копія важлива: змінивши обʼєкт на місці, ви змінюєте його всюди, де на нього посилаються, — і потім довго шукаєте, хто це зробив.',
    ],
    start: 'let bags = [\n  { name: \'Вода\', kg: 7.7 },\n  { name: \'Пальне\', kg: 12 },\n];\n\nconst { name, kg } = bags[0];\nconsole.log(name, kg);',
    task: 'Зробіть новий список, де у мішків, важчих за 5 кг, вага менша на 1. Старий список має лишитись недоторканим — надрукуйте обидва.',
    hint: '`bags.map((b) => b.kg > 5 ? { ...b, kg: b.kg - 1 } : b)`. Потім надрукуйте новий і старий.',
    solution: 'let bags = [\n  { name: \'Вода\', kg: 7.7 },\n  { name: \'Пальне\', kg: 12 },\n];\n\nconst legshi = bags.map((b) => (b.kg > 5 ? { ...b, kg: b.kg - 1 } : b));\n\nconsole.log(legshi.map((b) => b.kg).join(\', \'));\nconsole.log(bags.map((b) => b.kg).join(\', \'));',
    check: (out, code) => /\.\.\./.test(code) && /map/.test(code)
      && /11/.test(out) && /12/.test(out),
    why: 'У новому списку має бути 11, а в старому — 12: копія змінилась, оригінал ні.',
  }),

  L({
    id: 'w8', track: 'web', kind: 'page',
    title: 'Класи замість кольорів у коді',
    goal: 'Лишити вигляд у CSS, а коду дати говорити про суть',
    intro: [
      'Вигляд не міняють по одній властивості з коду. Для цього є класи: `.hot { ... }` у CSS, `el.classList.add(ʼhotʼ)` у коді.',
      '`classList.toggle(ʼhotʼ)` вмикає й вимикає, `contains` питає, чи є.',
      'Так вигляд лишається в CSS, а код каже лише «цей мішок першочерговий», не знаючи, якого він кольору.',
    ],
    start: '<style>\n  li { padding: 4px; cursor: pointer; }\n</style>\n\n<ul id="spysok">\n  <li>Вода</li>\n  <li>Їжа</li>\n  <li>Батареї</li>\n</ul>\n\n<script>\n  document.querySelectorAll(\'li\').forEach((el) => {\n    el.addEventListener(\'click\', () => {\n      console.log(el.textContent);\n    });\n  });\n</script>',
    task: 'Зробіть, щоб натискання вмикало й вимикало клас `hot`, а сам клас робив рядок жовтим.',
    hint: 'У `<style>` додайте `.hot { background: gold; }`, а в обробнику — `el.classList.toggle(ʼhotʼ)`.',
    solution: '<style>\n  li { padding: 4px; cursor: pointer; }\n  .hot { background: gold; }\n</style>\n\n<ul id="spysok">\n  <li>Вода</li>\n  <li>Їжа</li>\n  <li>Батареї</li>\n</ul>\n\n<script>\n  document.querySelectorAll(\'li\').forEach((el) => {\n    el.addEventListener(\'click\', () => {\n      el.classList.toggle(\'hot\');\n    });\n  });\n</script>',
    check: (html) => /classList\s*\.\s*(toggle|add)/.test(html)
      && /\.hot\s*\{/.test(html)
      && /addEventListener/.test(html),
    why: 'Потрібні правило `.hot` у `<style>` і `classList.toggle` в обробнику.',
  }),

  L({
    id: 'w9', track: 'web', kind: 'page',
    title: 'Своя частина сторінки',
    goal: 'Зібрати розмітку функцією — крок до компонента',
    intro: [
      'Коли розмітки стає багато, її ліплять функціями: одна функція — один шматок екрана.',
      '`const bagRow = (b) => `<li>${b.name}</li>`;` — і далі `bags.map(bagRow).join(ʼʼ)`.',
      'Це вже майже компонент. У React те саме, тільки функція повертає не рядок, а розмітку — і саме тому React читається легко, коли цей крок зрозумілий.',
    ],
    start: '<ul id="spysok"></ul>\n\n<script>\n  const bags = [\n    { name: \'Вода\', kg: 7.7, hot: true },\n    { name: \'Їжа\', kg: 3, hot: false },\n    { name: \'Батареї\', kg: 1.3, hot: true },\n  ];\n\n  document.querySelector(\'#spysok\').innerHTML =\n    bags.map((b) => \'<li>\' + b.name + \'</li>\').join(\'\');\n</script>',
    task: 'Винесіть малювання рядка в окрему функцію `bagRow` і додайте в неї вагу та знак «!» для першочергових.',
    hint: 'Оголосіть `const bagRow = (b) => ...` над малюванням, а тоді `bags.map(bagRow).join(ʼʼ)`. Знак додайте через `b.hot ? ʼ !ʼ : ʼʼ`.',
    solution: '<ul id="spysok"></ul>\n\n<script>\n  const bags = [\n    { name: \'Вода\', kg: 7.7, hot: true },\n    { name: \'Їжа\', kg: 3, hot: false },\n    { name: \'Батареї\', kg: 1.3, hot: true },\n  ];\n\n  const bagRow = (b) => `<li>${b.name} — ${b.kg} кг${b.hot ? \' !\' : \'\'}</li>`;\n\n  document.querySelector(\'#spysok\').innerHTML = bags.map(bagRow).join(\'\');\n</script>',
    check: (html, text) => /bagRow/.test(html)
      && /map\s*\(\s*bagRow\s*\)/.test(html)
      && /7\.7/.test(text) && /!/.test(text),
    why: 'Потрібна функція `bagRow`, передана в `map` без дужок, а на сторінці — вага й знак «!».',
  }),

  L({
    id: 'w10', track: 'web', kind: 'page',
    title: 'Свій застосунок',
    goal: 'Скласти все разом і довести до робочого стану',
    intro: [
      'Останній урок — не нове, а все разом: дані, малювання, ввід, підрахунок.',
      'Так само влаштований пункт збору: масив посилок, функція, що малює список, кнопка, що додає, і підсумок унизу.',
      'Далі буде та сама будова, тільки дані приходитимуть із сервера, а не лежатимуть у файлі. Усе інше ви вже вмієте.',
    ],
    start: '<style>\n  li { padding: 4px; }\n  .hot { background: gold; }\n  #pidsumok { margin-top: 12px; font-weight: bold; }\n</style>\n\n<input id="nazva" placeholder="Назва">\n<input id="kg" placeholder="Вага" size="5">\n<button id="dodaty">Додати</button>\n\n<ul id="spysok"></ul>\n<div id="pidsumok"></div>\n\n<script>\n  const bags = [\n    { name: \'Вода\', kg: 7.7, hot: true },\n  ];\n\n  const bagRow = (b) => `<li class="${b.hot ? \'hot\' : \'\'}">${b.name} — ${b.kg} кг</li>`;\n\n  const malyuy = () => {\n    document.querySelector(\'#spysok\').innerHTML = bags.map(bagRow).join(\'\');\n    // тут має зʼявитись підсумок\n  };\n\n  malyuy();\n</script>',
    task: 'Доробіть: кнопка додає мішок із полів, а внизу показується «Мішків: N, разом M кг». Порожня назва не додається.',
    hint: 'Вагу беріть через `Number(el.value)`, суму рахуйте `reduce`, а підсумок пишіть у `#pidsumok` усередині `malyuy`.',
    solution: '<style>\n  li { padding: 4px; }\n  .hot { background: gold; }\n  #pidsumok { margin-top: 12px; font-weight: bold; }\n</style>\n\n<input id="nazva" placeholder="Назва">\n<input id="kg" placeholder="Вага" size="5">\n<button id="dodaty">Додати</button>\n\n<ul id="spysok"></ul>\n<div id="pidsumok"></div>\n\n<script>\n  const bags = [\n    { name: \'Вода\', kg: 7.7, hot: true },\n  ];\n\n  const bagRow = (b) => `<li class="${b.hot ? \'hot\' : \'\'}">${b.name} — ${b.kg} кг</li>`;\n\n  const malyuy = () => {\n    document.querySelector(\'#spysok\').innerHTML = bags.map(bagRow).join(\'\');\n    const razom = bags.reduce((a, b) => a + b.kg, 0);\n    document.querySelector(\'#pidsumok\').textContent =\n      `Мішків: ${bags.length}, разом ${Math.round(razom * 10) / 10} кг`;\n  };\n\n  document.querySelector(\'#dodaty\').addEventListener(\'click\', () => {\n    const nazva = document.querySelector(\'#nazva\');\n    const kg = document.querySelector(\'#kg\');\n    if (!nazva.value.trim()) return;\n    bags.push({ name: nazva.value.trim(), kg: Number(kg.value) || 0, hot: false });\n    nazva.value = \'\';\n    kg.value = \'\';\n    malyuy();\n  });\n\n  malyuy();\n</script>',
    check: (html, text) => /addEventListener/.test(html)
      && /\.value/.test(html)
      && /reduce|for\s*\(/.test(html)
      && /Мішків:\s*1/.test(text)
      && /7\.7/.test(text),
    why: 'Потрібні кнопка з `addEventListener`, читання полів і підсумок «Мішків: 1, разом 7.7 кг» на сторінці.',
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
