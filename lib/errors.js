// Розширення в імпортах сусідів стоїть навмисно: файл покритий тестами, а
// вбудований у Node запускач шукає модуль рівно за тим шляхом, який написали.

/**
 * «Чому я отримую цю помилку».
 *
 * Новачок бачить червоний рядок і читає його як вирок: щось зламалось,
 * і незрозуміло навіть, де шукати. Насправді майже кожна помилка —
 * коротке речення про конкретну річ, і речень цих небагато. Тих, що
 * трапляються в перший рік, — десятки два.
 *
 * Тому тут не «поради щодо налагодження», а каталог: текст помилки,
 * що вона буквально означає, звідки береться (кілька звичних причин, у
 * кожної свій лік), де дивитись і як виглядає той самий код зламаним і
 * полагодженим.
 *
 * Головне — знайти запис за тим, що видно на екрані. Тому кожен має
 * ознаки для пошуку: вставив червоний рядок цілком, разом зі стеком і
 * назвами своїх змінних, — і запис знайшовся. Формулювання в браузерів
 * різні («Cannot read properties of undefined» у Chrome, «x is
 * undefined» у Firefox, «undefined is not an object» у Safari), і в
 * різних версіях вони теж мінялись, тож збігу цілого рядка ніхто не
 * обіцяє — шукається за шматками.
 *
 * Окремий розділ — помилки, які нічого не кажуть. `NaN`, `Invalid Date`,
 * `[object Object]`, нуль замість порожнього поля: програма не падає,
 * просто на екрані неправда. Такі шукають найдовше, бо шукати нема за
 * чим — саме тому вони тут поруч із червоними.
 */

export const ERR_GROUPS = [
  { key: 'js', label: 'Мова', hint: 'Те, на чому спотикається сам JavaScript' },
  { key: 'data', label: 'Дані', hint: 'Прийшло не те, що чекали' },
  { key: 'react', label: 'React', hint: 'Компоненти, стан, списки' },
  { key: 'net', label: 'Запити', hint: 'Сервер, адреси, доступи' },
  { key: 'tool', label: 'Інструменти', hint: 'Термінал, npm, Git' },
  { key: 'quiet', label: 'Мовчазні', hint: 'Не падає, але на екрані неправда' },
];

/*
 * `sig` — ознаки для пошуку.
 *
 * Кожна ознака — перелік шматків, які мають бути в тексті всі разом.
 * Ознак кілька, бо те саме браузери пишуть по-різному, а Safari ще й
 * інакше, ніж обидва. Збігся будь-який перелік — запис підходить.
 */
/*
 * Три види, і третій не помилка зовсім.
 *
 *   throw — червоний рядок, який видно в консолі;
 *   quiet — нічого не падає, просто на екрані неправда;
 *   case  — становище, а не повідомлення: «працює локально, а на
 *           сервері ні». Тексту, який можна вставити, тут немає — такі
 *           знаходять словами.
 */
const E = (o) => ({ kind: 'throw', also: [], sig: [], tags: [], ...o });
const Q = (o) => ({ ...E(o), kind: 'quiet', g: 'quiet' });
const C = (o) => ({ ...E(o), kind: 'case' });

export const ERRORS = [

  /* ── Мова ─────────────────────────────────────────────────────────── */

  E({
    id: 'undef-read',
    g: 'js',
    msg: "TypeError: Cannot read properties of undefined (reading 'map')",
    also: [
      "Cannot read property 'map' of undefined — старіші версії Chrome",
      'x is undefined — Firefox',
      "undefined is not an object (evaluating 'x.map') — Safari",
    ],
    sig: [
      ['cannot read propert', 'undefined'],
      ['is undefined'],
      ['undefined is not an object'],
    ],
    means: 'Ви звернулись до поля або методу того, чого немає. Зліва від крапки — `undefined`, а в порожнечі немає нічого, навіть імені.',
    causes: [
      { c: 'Дані ще не прийшли: запит у дорозі, а малювати вже треба.', fix: 'Дайте початкове значення: `const list = data?.items || []`. Порожній список малюється нормально, `undefined` — ні.' },
      { c: 'Помилка в назві поля: у відповіді `items`, а написано `item`.', fix: 'Надрукуйте весь обʼєкт: `console.log(data)` — і подивіться, як поле зветься насправді.' },
      { c: '`find` нічого не знайшов — він повертає `undefined`, а не порожній обʼєкт.', fix: 'Перевірте результат до звертання: `const l = list.find(...); if (!l) return null;`' },
      { c: 'Функція нічого не повернула: забули `return`.', fix: 'Перевірте, що з функції справді щось виходить.' },
    ],
    find: 'У дужках написано, яке поле читали. Рядок і файл — у самій помилці; клацніть по ньому в консолі. Далі дивіться не на це поле, а на те, що **зліва від крапки**: воно й є порожнім.',
    bad: `const first = data.items[0].name;`,
    good: `const items = data?.items || [];
if (!items.length) return null;
const first = items[0].name;`,
    topic: 'err',
    lesson: 'b8',
    ref: 't-err',
    tags: ['undefined', 'дані'],
  }),

  E({
    id: 'null-read',
    g: 'js',
    msg: "TypeError: Cannot read properties of null (reading 'value')",
    also: ['x is null — Firefox', "null is not an object — Safari"],
    sig: [['cannot read propert', 'null'], ['is null'], ['null is not an object']],
    means: '`null` — це «тут навмисно порожньо», на відміну від `undefined` («тут нічого не клали»). Найчастіше так відповідає браузер, коли елемента на сторінці немає.',
    causes: [
      { c: '`document.querySelector` нічого не знайшов: не той селектор або друкарська помилка в назві класу.', fix: 'Перевірте селектор у консолі: `document.querySelector(\'.z-btn\')` — має повернути елемент, а не `null`.' },
      { c: 'Код виконався раніше, ніж елемент зʼявився на сторінці.', fix: 'Скрипт має стояти після розмітки або чекати на завантаження.' },
      { c: 'У відповіді сервера поле справді `null` — так позначили «значення немає».', fix: 'Перевіряйте: `if (v === null) …`, або `v ?? 0` — воно реагує саме на `null` і `undefined`.' },
    ],
    find: 'Якщо це `querySelector` — перевірте селектор у консолі окремим рядком. Якщо дані з сервера — надрукуйте відповідь і подивіться, де саме `null`.',
    bad: `const input = document.querySelector('#vaha');
console.log(input.value);`,
    good: `const input = document.querySelector('#vaha');
if (!input) return;          // елемента немає — далі йти нема куди
console.log(input.value);`,
    topic: 'dom',
    lesson: 'w3',
    tags: ['null', 'dom'],
  }),

  E({
    id: 'not-a-function',
    g: 'js',
    msg: 'TypeError: x.map is not a function',
    also: ['x.map is not a function — те саме в усіх браузерах', 'x is not a function'],
    sig: [['is not a function']],
    means: 'Ви викликаєте як функцію те, що функцією не є. Ім’я існує — просто в ньому лежить не те.',
    causes: [
      { c: '`map` кличуть на тому, що не масив: обʼєкт, `undefined`, рядок, одна річ замість списку.', fix: 'Надрукуйте значення: `console.log(list)`. Обʼєкт перебирають через `Object.entries(obj).map(...)`.' },
      { c: 'Сервер повернув один обʼєкт, а код чекав масив.', fix: 'Подивіться відповідь у вкладці Network — там видно, що прийшло насправді.' },
      { c: 'Друкарська помилка в назві: `lenght`, `fliter`, `pusn`.', fix: 'Перечитайте назву по буквах. Редактор зазвичай підсвічує такі.' },
      { c: 'З `import` прийшло не те: імпортували за замовчуванням те, що експортоване з іменем.', fix: 'Звірте `export` у тому файлі з `import` у цьому.' },
    ],
    find: 'Зліва від крапки — те, що треба надрукувати. `Array.isArray(list)` відповідає на головне питання одним рядком.',
    bad: `const rows = data.items;   // насправді обʼєкт
rows.map((r) => r.name);`,
    good: `const rows = Array.isArray(data.items) ? data.items : [];
rows.map((r) => r.name);`,
    topic: 'arrm',
    lesson: 's4',
    tags: ['масив', 'map'],
  }),

  E({
    id: 'not-defined',
    g: 'js',
    msg: 'ReferenceError: vaha is not defined',
    also: ["can't access lexical declaration", "Can't find variable: vaha — Safari"],
    sig: [['is not defined'], ["can't find variable"]],
    means: 'Такого імені тут не існує взагалі. Не «порожнє» — його ніхто не оголошував у місці, звідки ви його кличете.',
    causes: [
      { c: 'Друкарська помилка в імені: оголосили `vaha`, написали `waha`.', fix: 'Звірте написання. Однакові на вигляд літери з різних абеток теж бувають причиною.' },
      { c: 'Змінна оголошена в іншій області: усередині `{ }` або в іншій функції.', fix: 'Оголосіть її вище — там, звідки її видно обом місцям.' },
      { c: 'Забули `import`.', fix: 'Додайте імпорт угорі файла.' },
      { c: 'Звертаєтесь до речей браузера на сервері: `window`, `document`, `localStorage`.', fix: 'На сервері їх немає. Робіть це всередині `useEffect` — він виконується вже в браузері.' },
    ],
    find: 'Пошук по файлу за цим іменем: якщо єдина згадка — та, що падає, значить оголошення немає зовсім.',
    bad: `function total() {
  return kg * 2;    // kg тут не існує
}`,
    good: `function total(kg) {
  return kg * 2;
}`,
    topic: 'scope',
    lesson: 'b13',
    tags: ['змінні'],
  }),

  E({
    id: 'const-assign',
    g: 'js',
    msg: 'TypeError: Assignment to constant variable.',
    also: ['invalid assignment to const — Firefox'],
    sig: [['assignment to constant'], ['assignment to const']],
    means: '`const` прибиває імʼя до значення. Перевказати його на щось інше не можна — і це не обмеження, а обіцянка, яку ви самі дали, коли писали `const`.',
    causes: [
      { c: 'Значення справді має мінятись.', fix: 'Замініть на `let`. Саме для цього `let` і є.' },
      { c: 'Хотіли змінити поле обʼєкта, а написали присвоєння самому імені.', fix: '`const o = {}; o.kg = 5;` — так можна: обʼєкт той самий, змінилось його поле.' },
    ],
    find: 'Помилка показує рядок присвоєння. Оголошення шукайте вище — там і стоїть `const`.',
    bad: `const kg = 7.7;
kg = 9;`,
    good: `let kg = 7.7;
kg = 9;`,
    topic: 'var',
    lesson: 'b19',
    tags: ['const'],
  }),

  E({
    id: 'tdz',
    g: 'js',
    msg: "ReferenceError: Cannot access 'total' before initialization",
    also: ["can't access lexical declaration 'total' before initialization — Firefox"],
    sig: [['before initialization']],
    means: 'Імʼя вже зайняте, але значення в ньому ще немає: ви звернулись до змінної вище того рядка, де вона оголошена.',
    causes: [
      { c: 'Використали змінну раніше, ніж написали `const` чи `let`.', fix: 'Перенесіть оголошення вище — до першого використання.' },
      { c: 'Дві змінні з однаковим імʼям: зовнішня й та, що нижче в цьому ж блоці.', fix: 'Перейменуйте внутрішню — інакше зовнішня тут просто недосяжна.' },
    ],
    find: 'Помилка називає імʼя. Знайдіть його оголошення у файлі — воно нижче за рядок, який упав.',
    bad: `console.log(total);
const total = 5;`,
    good: `const total = 5;
console.log(total);`,
    topic: 'scope',
    lesson: 'b14',
    tags: ['змінні'],
  }),

  E({
    id: 'syntax',
    g: 'js',
    msg: "SyntaxError: Unexpected token '}'",
    also: ['SyntaxError: Unexpected end of input', 'missing ) after argument list', 'Unexpected identifier'],
    sig: [['syntaxerror'], ['unexpected token'], ['unexpected end of input'], ['unexpected identifier']],
    means: 'Код не вдалося навіть прочитати — не те що виконати. Десь не закрита дужка, лапка або фігурні дужки.',
    causes: [
      { c: 'Не закрита дужка чи лапка.', fix: 'Поставте курсор на дужку — редактор підсвітить пару. Якщо пари немає, ви її знайшли.' },
      { c: 'Пропущена кома між полями обʼєкта або елементами масиву.', fix: 'Перечитайте перелік згори вниз.' },
      { c: 'Зайва кома там, де вже нічого не йде (у старих середовищах).', fix: 'Приберіть останню кому.' },
    ],
    find: 'Помилка показує **рядок, де все зламалось**, а не де причина: дужку не закрили раніше. Дивіться вище цього рядка. Однаковий відступ у всьому файлі знаходить таке швидше за очі.',
    bad: `function kgOf(n) {
  return Math.round(n * 10) / 10;
`,
    good: `function kgOf(n) {
  return Math.round(n * 10) / 10;
}`,
    topic: 'err',
    lesson: 'b18',
    tags: ['синтаксис'],
  }),

  E({
    id: 'stack',
    g: 'js',
    msg: 'RangeError: Maximum call stack size exceeded',
    also: ['too much recursion — Firefox'],
    sig: [['maximum call stack'], ['too much recursion']],
    means: 'Функція кличе сама себе без кінця. Місце, де браузер тримає перелік викликів, закінчилось.',
    causes: [
      { c: 'Рекурсія без умови зупинки.', fix: 'Додайте умову виходу першим рядком функції.' },
      { c: 'Функція випадково кличе себе через інше імʼя.', fix: 'Пройдіть ланцюжок: хто кого кличе.' },
      { c: 'У React: зміна стану просто в тілі компонента, а не в обробнику.', fix: 'Дивіться запис «Too many re-renders» — це той самий випадок іншими словами.' },
    ],
    find: 'У консолі буде довжелезний стек з одного й того самого імені. Це імʼя й шукайте.',
    bad: `function kgOf(n) {
  return kgOf(n);
}`,
    good: `function kgOf(n) {
  if (n <= 0) return 0;        // умова зупинки
  return Math.round(n * 10) / 10;
}`,
    topic: 'fn',
    tags: ['рекурсія'],
  }),

  /* ── Дані ─────────────────────────────────────────────────────────── */

  E({
    id: 'json-html',
    g: 'data',
    msg: `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`,
    also: ['Unexpected token < in JSON at position 0 — старіші версії'],
    sig: [['is not valid json'], ['unexpected token <'], ['in json at position']],
    means: 'Ви попросили JSON, а прийшла сторінка HTML. Майже завжди це сторінка помилки — 404 або 500, — яку сервер віддав замість даних.',
    causes: [
      { c: 'Адреса запиту неправильна: маршруту за нею немає, і сервер віддав сторінку «не знайдено».', fix: 'Відкрийте цю адресу просто в браузері. Побачите, що насправді за нею лежить.' },
      { c: 'Маршрут упав з помилкою — прийшла сторінка 500.', fix: 'Подивіться в термінал, де запущено сервер: справжня помилка надрукована там.' },
      { c: 'Файл маршруту лежить не там: у Next адресу задає шлях до файла в `pages/api`.', fix: 'Звірте шлях файла з адресою запиту.' },
    ],
    find: 'Вкладка Network, ваш запит, вкладка Response — там видно відповідь цілком. Перший же рядок `<!DOCTYPE html>` пояснює все.',
    bad: `const data = await res.json();`,
    good: `if (!res.ok) {
  // текст помилки корисніший за падіння на розборі JSON
  throw new Error(await res.text());
}
const data = await res.json();`,
    topic: 'json',
    lesson: 's12',
    ref: 'n-fetch',
    tags: ['json', 'fetch'],
  }),

  E({
    id: 'json-parse',
    g: 'data',
    msg: 'SyntaxError: Unexpected end of JSON input',
    also: ['JSON.parse: unexpected end of data — Firefox'],
    sig: [['unexpected end of json'], ['json.parse'], ['unexpected end of data']],
    means: 'Розібрати текст як JSON не вдалось: він порожній або обірваний.',
    causes: [
      { c: 'Відповідь порожня: сервер відповів без тіла (наприклад, 204 або помилка без тексту).', fix: 'Перевіряйте `res.ok` і читайте `res.text()`, коли не вийшло.' },
      { c: 'Читаєте `localStorage`, куди нічого не клали: `JSON.parse(null)`.', fix: 'Дайте запасне значення: `JSON.parse(localStorage.getItem(k) || \'[]\')`, і оберніть у `try`.' },
      { c: 'Тіло вже прочитали раніше: відповідь читається один раз.', fix: 'Збережіть результат у змінну замість двох викликів `res.json()`.' },
    ],
    find: 'Надрукуйте те, що розбираєте, **до** розбору: `console.log(text)`. Порожній рядок видно одразу.',
    bad: `const saved = JSON.parse(localStorage.getItem('mine'));`,
    good: `let saved = [];
try { saved = JSON.parse(localStorage.getItem('mine') || '[]'); } catch { saved = []; }`,
    topic: 'json',
    lesson: 's12',
    tags: ['json'],
  }),

  Q({
    id: 'nan',
    msg: 'На екрані NaN',
    sig: [['nan']],
    means: '`NaN` означає «не число». Воно зʼявляється, коли з текстом або порожнечею зробили арифметику, і далі отруює все: будь-який приклад із `NaN` теж `NaN`.',
    causes: [
      { c: 'Значення з поля вводу — завжди текст, навіть коли там цифри.', fix: '`Number(e.target.value)` — і одразу перевірка: `Number.isFinite(n)`.' },
      { c: 'У таблиці кома замість крапки: `Number(\'7,7\')` дає `NaN`.', fix: '`Number(String(v).replace(\',\', \'.\'))`.' },
      { c: 'Поле порожнє або його немає: `undefined * 2`.', fix: 'Запасне значення до множення, а не після.' },
    ],
    find: 'Надрукуйте те, що складаєте, разом із типом: `console.log(v, typeof v)`. Найчастіше там `\'\'` або `undefined`.',
    bad: `const total = kg * 2;   // kg — текст із поля`,
    good: `const kg = Number(String(raw).replace(',', '.'));
const total = Number.isFinite(kg) ? kg * 2 : 0;`,
    topic: 'types',
    lesson: 'b2',
    ref: 'd-num',
    tags: ['число', 'nan'],
  }),

  Q({
    id: 'object-object',
    msg: 'На екрані [object Object]',
    sig: [['object object'], ['[object']],
    means: 'Обʼєкт перетворили на текст. У тексті обʼєкт виглядає саме так — це його чесна, але некорисна назва.',
    causes: [
      { c: 'Обʼєкт вставили в рядок замість конкретного поля.', fix: 'Беріть поле: `${item.name}`, а не `${item}`.' },
      { c: 'У `console.log` склеїли рядок плюсом.', fix: 'Передавайте другим аргументом: `console.log(\'item:\', item)` — тоді видно вміст.' },
    ],
    find: 'Знайдіть, де цей текст складається. Якщо не знаєте, що всередині, — `console.log(item)` без склеювання або `JSON.stringify(item, null, 2)`.',
    bad: `const label = 'Позиція: ' + item;`,
    good: `const label = \`Позиція: \${item.name}\`;`,
    topic: 'obj',
    lesson: 'b5',
    tags: ['обʼєкт'],
  }),

  Q({
    id: 'invalid-date',
    msg: 'На екрані Invalid Date',
    sig: [['invalid date']],
    means: 'Рядок не вдалося прочитати як дату. `new Date()` не повідомляє про це помилкою — просто дає дату, якої не існує.',
    causes: [
      { c: 'Формат «день.місяць.рік» — `new Date(\'13.09.2026\')` розбирати не вміє.', fix: 'Розберіть самі: витягніть три числа й складіть `new Date(рік, місяць - 1, день)`.' },
      { c: 'Місяці в JavaScript рахуються з нуля: вересень — це 8.', fix: 'Завжди `- 1` при складанні й `+ 1` при показі.' },
      { c: 'Значення порожнє або `undefined`.', fix: 'Перевіряйте до того, як складати дату.' },
    ],
    find: '`Number.isNaN(d.getTime())` відповідає, чи дата справжня. Так само й перевіряйте — на вигляд вона не відрізняється.',
    bad: `const d = new Date('13.09.2026');`,
    good: `const [dd, mm, yy] = '13.09.2026'.split('.').map(Number);
const d = new Date(yy, mm - 1, dd);`,
    topic: 'types',
    tags: ['дата'],
  }),

  Q({
    id: 'zero-empty',
    msg: 'Нуль там, де нічого не вписували',
    sig: [['нуль замість'], ['0 замість']],
    means: 'Порожнє поле перетворилось на нуль по дорозі. `Number(\'\')` дає `0`, і далі відрізнити «важить нуль» від «вагу не вписали» вже неможливо.',
    causes: [
      { c: '`Number(\'\')` або `parseInt(\'\')` на порожньому полі.', fix: 'Перевіряйте порожнечу до перетворення й лишайте `null`.' },
      { c: '`||` спрацьовує на нулі: `weight || 0` не відрізняє нуль від відсутності.', fix: '`??` реагує лише на `null` і `undefined`: `weight ?? null`.' },
    ],
    find: 'Пройдіть значення від поля вводу до екрана й подивіться, де воно перестало бути порожнім. Саме там і стоїть перетворення.',
    bad: `const kg = Number(raw) || 0;`,
    good: `const kg = String(raw).trim() === '' ? null : Number(raw);`,
    topic: 'truthy',
    lesson: 'b11',
    ref: 'a-short',
    tags: ['порожнє', 'нуль'],
  }),

  /* ── React ────────────────────────────────────────────────────────── */

  E({
    id: 'react-key',
    g: 'react',
    msg: 'Each child in a list should have a unique "key" prop',
    sig: [['unique "key" prop'], ['unique key prop'], ['key" prop']],
    means: 'Ви намалювали список, не сказавши React, як розрізняти рядки. Поки нічого не міняється, це просто попередження; щойно рядки додаються чи зникають — React плутає їх місцями.',
    causes: [
      { c: 'У `map` немає `key`.', fix: 'Додайте `key` з того, що в цього рядка своє: `key={item.id}`.' },
      { c: 'Як `key` узятий номер у масиві.', fix: 'Працює, доки список не сортують і нічого з нього не прибирають. Після сортування React ставить старі значення в нові рядки — краще шукати справжній ідентифікатор.' },
      { c: 'Два рядки з однаковим `key`.', fix: 'Складіть із двох полів: `key={item.id + item.date}`.' },
    ],
    find: 'React друкує в консоль назву компонента, у якому це сталось. Шукайте в ньому `map`.',
    bad: `{list.map((x) => <Row item={x} />)}`,
    good: `{list.map((x) => <Row key={x.id} item={x} />)}`,
    topic: 'lists',
    lesson: 'r3',
    ref: 'a-list',
    tags: ['react', 'список'],
  }),

  E({
    id: 'react-child',
    g: 'react',
    msg: 'Objects are not valid as a React child (found: object with keys {name, kg})',
    sig: [['objects are not valid as a react child'], ['not valid as a react child']],
    means: 'У розмітку поставили цілий обʼєкт. React уміє малювати текст і числа, а що показати замість обʼєкта — не знає й не вгадує.',
    causes: [
      { c: 'Забули взяти поле: `{item}` замість `{item.name}`.', fix: 'У дужках назвіть, що саме показувати.' },
      { c: 'Показують результат функції, яка повертає обʼєкт.', fix: 'Подивіться, що вона повертає, — `console.log` перед `return`.' },
      { c: 'У дужки потрапила обіцянка: `{loadAll()}` без `await`.', fix: 'Дані вантажать у `useEffect` і кладуть у стан, а не кличуть просто в розмітці.' },
    ],
    find: 'React перелічує ключі знайденого обʼєкта просто в тексті помилки — за ними видно, що це.',
    bad: `<b>{item}</b>`,
    good: `<b>{item.name}</b>`,
    topic: 'comp',
    lesson: 'r1',
    tags: ['react'],
  }),

  E({
    id: 'react-rerender',
    g: 'react',
    msg: 'Too many re-renders. React limits the number of renders to prevent an infinite loop.',
    sig: [['too many re-renders'], ['prevent an infinite loop']],
    means: 'Малювання міняє стан, зміна стану викликає малювання — і так без кінця. React зупинив коло сам.',
    causes: [
      { c: 'Стан міняють просто в тілі компонента, а не в обробнику.', fix: 'Переносьте в обробник або в `useEffect`.' },
      { c: 'Функцію викликали замість того, щоб передати: `onClick={save()}`.', fix: 'Без дужок: `onClick={save}`. Або обгорнути: `onClick={() => save(id)}`.' },
      { c: '`useEffect` міняє те, від чого сам залежить.', fix: 'Приберіть це значення з переліку залежностей або не міняйте його там.' },
    ],
    find: 'Шукайте `setЩось` без обгортки: у тілі компонента або в `{}` просто на кнопці.',
    bad: `<button onClick={save()}>Зберегти</button>`,
    good: `<button onClick={() => save(id)}>Зберегти</button>`,
    topic: 'state',
    lesson: 'r4',
    ref: 'a-click',
    tags: ['react', 'стан'],
  }),

  E({
    id: 'react-hooks',
    g: 'react',
    msg: 'Rendered more hooks than during the previous render',
    also: ['React has detected a change in the order of Hooks', 'React Hook is called conditionally'],
    sig: [['more hooks than'], ['order of hooks'], ['called conditionally'], ['rules of hooks']],
    means: 'React упізнає гачки за порядком виклику, а не за іменами. Якщо цього разу їх викликали не стільки або не в тому порядку, він більше не знає, який стан чий.',
    causes: [
      { c: '`useState` чи `useEffect` стоїть усередині `if` або циклу.', fix: 'Виносьте всі гачки нагору, до будь-яких умов.' },
      { c: 'Ранній `return` стоїть вище за частину гачків.', fix: 'Спершу всі гачки, потім `if (!data) return null`.' },
    ],
    find: 'Пройдіть компонент згори вниз: усе, що починається з `use`, має стояти до першого `if` і до першого `return`.',
    bad: `if (!data) return null;
const [open, setOpen] = useState(false);`,
    good: `const [open, setOpen] = useState(false);
if (!data) return null;`,
    topic: 'eff',
    lesson: 'r9',
    tags: ['react', 'гачки'],
  }),

  E({
    id: 'hydration',
    g: 'react',
    msg: "Hydration failed because the server rendered HTML didn't match the client",
    also: ['Text content does not match server-rendered HTML'],
    sig: [['hydration failed'], ['did not match'], ["didn't match the client"], ['text content does not match']],
    means: 'Сторінку спершу склали на сервері, потім те саме склали в браузері — і вийшло різне. React не знає, кому вірити.',
    causes: [
      { c: 'У розмітці щось, що на сервері й у браузері різне: час, випадкове число, `localStorage`.', fix: 'Показуйте таке після першого малювання — у `useEffect`.' },
      { c: 'Звертання до `window` чи `document` під час малювання.', fix: 'На сервері їх немає. Переносьте в `useEffect`.' },
      { c: 'Неправильна вкладеність тегів: `<div>` усередині `<p>`.', fix: 'Браузер сам виправляє таку розмітку, і вона перестає збігатись із серверною.' },
    ],
    find: 'React друкує в консоль, який саме шматок не збігся. Починайте з нього.',
    bad: `<span>{new Date().toLocaleTimeString()}</span>`,
    good: `const [time, setTime] = useState('');
useEffect(() => setTime(new Date().toLocaleTimeString()), []);
return <span>{time}</span>;`,
    topic: 'comp',
    tags: ['react', 'next'],
  }),

  /* ── Запити ───────────────────────────────────────────────────────── */

  E({
    id: 'failed-fetch',
    g: 'net',
    msg: 'TypeError: Failed to fetch',
    also: ['NetworkError when attempting to fetch resource — Firefox', 'Load failed — Safari'],
    sig: [['failed to fetch'], ['networkerror when attempting'], ['load failed']],
    means: 'Запит не дійшов. Це не відповідь із помилкою — відповіді немає взагалі.',
    causes: [
      { c: 'Сервер не запущено або він уже впав.', fix: 'Подивіться в термінал, де стоїть `npm run dev`.' },
      { c: 'Адреса неправильна: інший порт, інший хост, друкарська помилка.', fix: 'Відкрийте адресу в браузері окремо.' },
      { c: 'Запит на чужий сайт заблокував CORS — тоді поруч у консолі буде окремий рядок про це.', fix: 'Дивіться запис про CORS.' },
      { c: 'Немає мережі — на телефоні чи у вагоні це буває частіше, ніж здається.', fix: 'Відкрийте будь-який інший сайт. Найпростіше пояснення теж треба перевіряти, і перевіряється воно швидше за решту.' },
    ],
    find: 'Вкладка Network: запит буде червоним і без коду відповіді. Саме «без коду» відрізняє це від 404 і 500.',
    bad: `const res = await fetch('/api/health');
const data = await res.json();`,
    good: `try {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error('Сервер відповів ' + res.status);
  const data = await res.json();
} catch (e) {
  // сюди потрапляє і «не дійшло», і кинуте вище
  setError(e.message);
}`,
    topic: 'fetch',
    lesson: 's10',
    ref: 'n-fetch',
    tags: ['fetch', 'мережа'],
  }),

  E({
    id: 'http-404',
    g: 'net',
    msg: '404 — маршруту за цією адресою немає',
    sig: [['404']],
    means: 'Сервер відповів, але за цією адресою в нього нічого немає.',
    causes: [
      { c: 'Друкарська помилка в адресі або зайвий чи забутий `/`.', fix: 'Звірте рядок запиту з тим, що у вкладці Network.' },
      { c: 'Файл маршруту лежить не там: у Next адресу задає шлях до файла в `pages/api`.', fix: '`pages/api/health.js` відповідає на `/api/health` — і ніяк інакше.' },
      { c: 'Сервер не перезапустився після створення файла.', fix: 'Зупиніть і запустіть `npm run dev` ще раз.' },
    ],
    find: 'Відкрийте адресу просто в браузері. Якщо й там 404 — справа не в коді сторінки.',
    bad: `await fetch('/api/helth');`,
    good: `await fetch('/api/health');`,
    topic: 'codes',
    lesson: 'n7',
    tags: ['http'],
  }),

  E({
    id: 'http-401',
    g: 'net',
    msg: '401 або 403 — не пустило',
    sig: [['401'], ['403'], ['unauthorized'], ['forbidden']],
    means: 'Два різні «ні». **401** — я не знаю, хто ви: входу немає або він протух. **403** — я знаю, хто ви, і саме вам цього не можна.',
    causes: [
      { c: '401: немає печива сесії — не входили або строк вийшов.', fix: 'Увійдіть ще раз. Перевірте, що запит іде з тієї самої адреси, звідки заходили.' },
      { c: '401: запит із коду не передає печиво.', fix: 'Для чужого домену потрібне `credentials: \'include\'`; для свого воно йде саме.' },
      { c: '403: маршрут лише для власника чи адміністратора.', fix: 'Це не поломка, а замок. Подивіться, хто саме допускається, у самому маршруті.' },
    ],
    find: 'Вкладка Network, ваш запит, Response — там зазвичай написано словами, чого бракує.',
    bad: `await fetch(url);`,
    good: `const res = await fetch(url);
if (res.status === 401) return goToLogin();
if (res.status === 403) return setError('Цей розділ не для вас');`,
    topic: 'auth',
    lesson: 'n6',
    tags: ['http', 'доступ'],
  }),

  E({
    id: 'http-500',
    g: 'net',
    msg: '500 — упало на сервері',
    sig: [['500'], ['internal server error']],
    means: 'Ваш запит дійшов, і на тому боці щось кинуло помилку. У браузері причини немає — там лише наслідок.',
    causes: [
      { c: 'Помилка в коді маршруту.', fix: 'Справжній текст помилки — у терміналі, де запущено сервер. Не в консолі браузера.' },
      { c: 'Немає змінної оточення: ключа, адреси таблиці.', fix: 'Перевірте `.env.local` і **перезапустіть** сервер: оточення читається на старті.' },
      { c: 'Зовнішня служба відповіла помилкою — квота, доступ, мережа.', fix: 'Подивіться, що саме надрукував сервер: там буде чуже повідомлення.' },
    ],
    find: 'Термінал із `npm run dev`. Це найчастіша причина, чому «нічого не зрозуміло»: дивляться не в те вікно.',
    bad: `const rows = data.values.slice(1);   // values може не бути`,
    good: `const rows = (data.values || []).slice(1);`,
    topic: 'codes',
    lesson: 'n7',
    tags: ['http', 'сервер'],
  }),

  E({
    id: 'cors',
    g: 'net',
    msg: "Access to fetch has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present",
    sig: [['cors policy'], ['access-control-allow-origin'], ['cors']],
    means: 'Браузер не дав вашій сторінці прочитати відповідь чужого сайту. Дозвіл на це дає той сайт, а не ваш код.',
    causes: [
      { c: 'Запит на чужий домен, який не дозволяє звертань зі сторінок.', fix: 'Ходіть туди зі свого сервера: зробіть свій маршрут у `pages/api`, який сходить і поверне вам. Обмеження стосується браузера, не сервера.' },
      { c: 'Свій сервер на іншому порту.', fix: 'Звертайтесь відносним шляхом `/api/…` — тоді це той самий домен.' },
    ],
    find: 'Повідомлення довге, але в ньому прямо названо і адресу, і чого бракує. Вкладка Network покаже сам запит як заблокований.',
    bad: `await fetch('https://chuzhyi-sait.com/api/data');`,
    good: `// свій маршрут ходить туди сам, а сторінка звертається до нього
await fetch('/api/data');`,
    topic: 'fetch',
    tags: ['cors', 'мережа'],
  }),

  /* ── Інструменти ──────────────────────────────────────────────────── */

  E({
    id: 'no-module',
    g: 'tool',
    msg: "Error: Cannot find module 'react'",
    also: ['ERR_MODULE_NOT_FOUND', "Module not found: Can't resolve './lib/code'"],
    sig: [['cannot find module'], ['err_module_not_found'], ["can't resolve"], ['module not found']],
    means: 'Файл або бібліотеку, яку просить `import`, знайти не вдалося.',
    causes: [
      { c: 'Не робили `npm install` — теки `node_modules` просто немає.', fix: 'Наберіть `npm install` у теці проєкту.' },
      { c: 'Друкарська помилка в шляху або не той рівень: `./` замість `../`.', fix: 'Звірте шлях із деревом файлів.' },
      { c: 'Регістр літер: на вашому компʼютері `Code.js` і `code.js` — те саме, на сервері — різне.', fix: 'Пишіть точно так, як зветься файл. Саме через це буває «у мене працює».' },
      { c: 'Бібліотеку не встановлено.', fix: '`npm install назва` — і вона зʼявиться в `package.json`.' },
    ],
    find: 'У лапках написано, чого саме бракує. Якщо шлях починається з крапки — це ваш файл; якщо ні — бібліотека.',
    bad: `import { CODE_LESSONS } from './lib/code';   // а файл на рівень вище`,
    good: `import { CODE_LESSONS } from '../lib/code';`,
    topic: 'mod',
    lesson: 'n1',
    tags: ['npm', 'import'],
  }),

  E({
    id: 'port-busy',
    g: 'tool',
    msg: 'Error: listen EADDRINUSE: address already in use :::3000',
    also: ['Port 3000 is already in use'],
    sig: [['eaddrinuse'], ['address already in use'], ['port', 'already in use']],
    means: 'Порт уже зайнятий: на ньому слухає інша програма. Найчастіше — ваш же сервер, запущений у сусідньому вікні.',
    causes: [
      { c: 'Сервер уже працює в іншому вікні терміналу.', fix: 'Знайдіть те вікно й натисніть Ctrl+C. Сторінка, до речі, уже відкривається — за тією самою адресою.' },
      { c: 'Попередній запуск не зупинився як слід.', fix: 'Next сам запропонує інший порт. Або закрийте старий процес і запустіть наново.' },
    ],
    find: 'Відкрийте `http://localhost:3000` у браузері: якщо там ваш застосунок — усе на місці, просто запущений він не тут.',
    bad: `npm run dev   # у другому вікні, коли перше ще працює`,
    good: `# у першому вікні: Ctrl+C, потім
npm run dev`,
    topic: 'term',
    tags: ['термінал', 'порт'],
  }),

  E({
    id: 'cmd-not-found',
    g: 'tool',
    msg: 'command not found: npm',
    also: ['bash: npm: command not found', "'npm' is not recognized as an internal or external command"],
    sig: [['command not found'], ['is not recognized as an internal']],
    means: 'Термінал не знає такої команди: програми немає або він про неї ще не чув.',
    causes: [
      { c: 'Node не встановлено.', fix: 'Поставте LTS із nodejs.org — `npm` іде разом із ним.' },
      { c: 'Встановили, але термінал відкрито з того часу.', fix: 'Закрийте вікно терміналу й відкрийте нове: перелік програм читається на старті.' },
      { c: 'Друкарська помилка: `nmp`, `nom`.', fix: 'Перечитайте команду.' },
    ],
    find: '`node -v` і `npm -v` відповідають одразу: або дві версії, або та сама помилка.',
    bad: `nmp install`,
    good: `npm install`,
    topic: 'term',
    tags: ['термінал', 'npm'],
  }),

  E({
    id: 'not-a-repo',
    g: 'tool',
    msg: 'fatal: not a git repository (or any of the parent directories): .git',
    sig: [['not a git repository']],
    means: 'У цій теці Git не заведено — і в жодній над нею теж.',
    causes: [
      { c: 'Ви не в тій теці.', fix: '`pwd` і `ls`. Найчастіша причина взагалі всього, що не працює в терміналі.' },
      { c: 'Проєкт ще не під Git.', fix: '`git init` — один раз для проєкту.' },
    ],
    find: '`ls -a` покаже приховану теку `.git`, якщо вона тут є.',
    bad: `git status   # у домашній теці`,
    good: `cd шлях/до/проєкту
git status`,
    topic: 'git',
    tags: ['git'],
  }),

  E({
    id: 'push-rejected',
    g: 'tool',
    msg: 'Updates were rejected because the remote contains work that you do not have locally',
    also: ['! [rejected] main -> main (fetch first)', 'Updates were rejected because the tip of your current branch is behind'],
    sig: [['updates were rejected'], ['rejected', 'fetch first'], ['non-fast-forward']],
    means: 'На сервері є коміти, яких у вас немає. Надіслати свої зверху означало б стерти чужі — Git на це не погоджується.',
    causes: [
      { c: 'Хтось інший (або ви з іншого компʼютера) уже надіслав туди зміни.', fix: '`git pull` — забрати чуже, потім `git push`.' },
      { c: 'Гілку правили через сайт GitHub.', fix: 'Те саме: спершу забрати.' },
    ],
    find: '`git log --oneline origin/main -3` покаже, що там зверху, і чи ваш коміт — справді наступний.',
    bad: `git push`,
    good: `git pull
# розібратись із конфліктами, якщо будуть
git push`,
    topic: 'gitweb',
    tags: ['git'],
  }),

  E({
    id: 'merge-conflict',
    g: 'tool',
    msg: 'CONFLICT (content): Merge conflict in lib/code.js',
    also: ['<<<<<<< HEAD', 'Automatic merge failed; fix conflicts and then commit the result'],
    sig: [['merge conflict'], ['<<<<<<<'], ['automatic merge failed']],
    means: 'Два коміти правили ті самі рядки по-різному. Git не вгадує, чия правда, — він показує обидві й чекає.',
    causes: [
      { c: 'Той самий рядок змінено у вас і на сервері.', fix: 'Відкрийте файл: ваше між `<<<<<<<` і `=======`, чуже — між `=======` і `>>>>>>>`. Лишіть потрібне, приберіть усі три позначки, потім `git add` і `git commit`.' },
      { c: 'Позначки лишились у файлі й код перестав працювати.', fix: 'Пошук по проєкту за `<<<<<<<` знаходить усі забуті місця.' },
    ],
    find: '`git status` перелічує файли з конфліктом. `git diff` показує самі місця.',
    bad: `<<<<<<< HEAD
const kg = 7.7;
=======
const kg = 9;
>>>>>>> main`,
    good: `const kg = 9;`,
    topic: 'git',
    tags: ['git'],
  }),

  C({
    id: 'env-missing',
    g: 'tool',
    msg: 'Працює локально, а на сервері ні',
    also: ['undefined замість ключа', 'process.env.МОЯ_ЗМІННА порожня'],
    sig: [['process.env'], ['.env.local'], ['environment variable'], ['змінна оточення']],
    means: 'Код однаковий, а оточення різне. Значення, які лежать поруч із кодом, а не в ньому, на кожному компʼютері свої.',
    causes: [
      { c: 'Змінної немає в налаштуваннях сервера.', fix: 'Додайте її там само, де інші.' },
      { c: 'Додали, але не зібрали заново.', fix: 'Більшість платформ підставляють значення **під час збірки**. Саме на цьому й губиться година.' },
      { c: 'Локально немає `.env.local`.', fix: 'Зробіть із `.env.example`. У Git його немає навмисно.' },
      { c: 'Змінну читає браузер, а вона серверна.', fix: 'У Next до браузера доходять лише ті, що починаються з `NEXT_PUBLIC_`. І класти в них таємне не можна — їх видно всім.' },
    ],
    find: 'Надрукуйте на сервері `Boolean(process.env.КЛЮЧ)` — саме так, а не сам ключ: у журнали таємне не пишуть.',
    bad: `const key = process.env.API_KEY;   // порожньо, і нічого про це не сказано`,
    good: `const key = process.env.API_KEY;
if (!key) throw new Error('Немає API_KEY — перевірте оточення');`,
    topic: 'env',
    tags: ['оточення', 'deploy'],
  }),
];

/* ── пошук ────────────────────────────────────────────────────────────── */

const str = (v) => (v === null || v === undefined ? '' : String(v));

/**
 * Текст помилки до порівнянного вигляду.
 *
 * Крім регістру й пробілів, прибираються номери рядків і стовпців —
 * `zbir.js:401:12`. Інакше стек із рядка 401 знаходив би запис про
 * помилку доступу: числа в ознаках короткі, а стек довгий.
 */
export const norm = (s) => str(s)
  .toLowerCase()
  .replace(/:\d+:\d+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const errorById = (id) => ERRORS.find((e) => e.id === id) || null;

/**
 * Знайти запис за текстом помилки.
 *
 * Сюди вставляють червоний рядок як є — зі стеком, шляхами до файлів і
 * власними іменами змінних. Тому збігатись має не рядок, а ознаки:
 * кожна ознака — кілька шматків, які мають трапитись усі разом.
 *
 * Точніші ознаки стоять вище: «cannot read propert» + «undefined» — це
 * два збіги, а сам «404» — один, і він має поступитись.
 */
export function matchError(text) {
  const t = norm(text);
  if (!t) return [];
  const hits = [];
  ERRORS.forEach((e) => {
    let best = 0;
    e.sig.forEach((group) => {
      if (group.every((part) => t.includes(part))) {
        // довша ознака точніша: три збіги переважають один
        best = Math.max(best, group.length + group.join('').length / 100);
      }
    });
    if (best > 0) hits.push({ e, best });
  });
  return hits.sort((a, b) => b.best - a.best).map((x) => x.e);
}

/** Пошук по всьому тексту запису — коли шукають словами, а не рядком */
export function findErrors(q) {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return ERRORS;
  return ERRORS.filter((e) => {
    const hay = norm([
      e.msg, ...e.also, e.means, e.find, e.bad, e.good, e.tags.join(' '),
      ...e.causes.flatMap((c) => [c.c, c.fix]),
    ].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** Скільки записів у групі — для підпису розділу */
export function errorStats() {
  return {
    total: ERRORS.length,
    quiet: ERRORS.filter((e) => e.kind === 'quiet').length,
    byGroup: ERR_GROUPS.map((g) => ({
      ...g, count: ERRORS.filter((e) => e.g === g.key).length,
    })),
  };
}

/** Записи, привʼязані до теми абетки — звідси абетка веде в каталог */
export const errorsOfTopic = (id) => ERRORS.filter((e) => e.topic === id);
