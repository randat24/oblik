// Розширення в імпортах сусідів стоїть навмисно: файл покритий тестами, а
// вбудований у Node запускач шукає модуль рівно за тим шляхом, який написали.

/**
 * Повтори в листі.
 *
 * Звідки вони беруться. Найчастіше — з відкладеного запису: коли мережі
 * немає, запис лягає в чергу й іде, щойно звʼязок зʼявиться. Якщо
 * зʼєднання обірвалось уже після того, як таблиця рядок прийняла, але
 * до того, як відповідь дійшла назад, черга надішле його ще раз. Це
 * свідомий розмін — дубль видно й можна прибрати, а втрачений запис не
 * повернеш, — але прибирати його треба руками, і спершу побачити.
 *
 * Решта — звичайне життя: двоє вносять ту саму річ з різних телефонів,
 * одну позицію заводять двічі з інтервалом у тиждень, серійник
 * передруковують із паперу.
 *
 * Що вважаємо повтором. Тільки те, що не може повторюватись за змістом:
 *
 *   увесь рядок      — однакові геть усі значущі колонки;
 *   серійник         — у двох речей не буває одного S/N;
 *   власний номер    — «№ 84» у листі має бути один.
 *
 * Назва повтором не вважається навмисно. Десять однакових радейок — це
 * десять рядків з однією назвою, і так і має бути; якби ми сварились на
 * назву, попередження швидко навчились би не помічати.
 *
 * Тут лише правила — без React і без читання таблиць.
 */

/*
 * Кирилиця, що виглядає як латиниця.
 *
 * «807LYH4536», набране з українською Н замість латинської H, на екрані
 * не відрізнити від оригіналу, а для порівняння це різні рядки. Саме так
 * повтор і ховається: очі бачать однакове, програма — ні.
 */
const LOOKALIKE = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P',
  С: 'C', Т: 'T', У: 'Y', Х: 'X', І: 'I', Ѕ: 'S', Ј: 'J',
};

/**
 * Серійник у вигляді, придатному для порівняння.
 *
 * Великі літери, геть усе, крім літер і цифр, прибрано, кирилиця-двійник
 * зведена до латиниці. «sn 807-lyh 4536» і «807LYH4536» — це один
 * серійник, і записані вони по-різному лише тому, що набирали в різні дні.
 *
 * Літеру «О» до нуля НЕ зводимо. Спокуса є: плутають їх постійно. Але
 * тоді «O100» і «0100» стали б одним записом, а це вже не виправлення
 * описки, а склеювання двох різних речей — і зробила б його програма
 * мовчки.
 */
export function normalizeSn(v) {
  const raw = (v ?? '').toString().toUpperCase();
  let out = '';
  for (const ch of raw) {
    const c = LOOKALIKE[ch] || ch;
    if (/[0-9A-Z]/.test(c)) out += c;
  }
  return out;
}

/** Звичайне значення: без крайніх пробілів і без різниці в регістрі */
const norm = (v) => (v ?? '').toString().trim().replace(/\s+/g, ' ').toLowerCase();

/** Чи рядок порожній: у ньому немає жодного значення */
const blank = (values) => !(values || []).some((v) => (v ?? '').toString().trim());

/**
 * Відбиток усього рядка.
 *
 * Примітку в нього не беремо: той самий запис, до якого одна людина
 * дописала «антена на скотчі», лишається тим самим записом. А от дату й
 * отримувача беремо — якщо вони різні, це вже історія речі, а не дубль.
 */
function rowPrint(values, cols) {
  return (values || [])
    .map((v, i) => (i === cols?.note ? '' : norm(v)))
    .join('\u0001');
}

/**
 * Усі повтори листа.
 *
 * Повертає групи, у кожній — рядки, які між собою однакові. Один рядок
 * потрапляє щонайбільше в одну групу: якщо він дубль цілком, казати про
 * нього ще й «однаковий серійник» нема сенсу — це те саме одним словом.
 *
 * Групи йдуть від найочевиднішої до найтоншої: цілий рядок, тоді
 * серійник, тоді власний номер.
 */
export function findDupes(items, cols = {}) {
  const groups = [];
  const taken = new Set();

  const collect = (kind, keyOf) => {
    const by = new Map();
    (items || []).forEach((it) => {
      if (taken.has(it.row) || blank(it.values)) return;
      const key = keyOf(it);
      if (!key) return;
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(it);
    });
    for (const [key, list] of by) {
      if (list.length < 2) continue;
      list.forEach((it) => taken.add(it.row));
      groups.push({
        kind,
        key,
        // показуємо так, як написано в таблиці, а не як порівнювали
        value: kind === 'all' ? '' : (list[0].values[kindCol(kind, cols)] ?? '').toString().trim(),
        rows: list.map((it) => it.row),
        items: list,
      });
    }
  };

  const snIdx = snOf(cols);

  collect('all', (it) => rowPrint(it.values, cols));
  if (snIdx >= 0) collect('sn', (it) => normalizeSn(it.values[snIdx]));
  if (cols.id >= 0 && cols.id !== snIdx) collect('id', (it) => norm(it.values[cols.id]));

  return groups;
}

/** Колонка, за якою зібрана група — потрібна, щоб показати значення як є */
function kindCol(kind, cols) {
  return kind === 'sn' ? snOf(cols) : cols.id;
}

/**
 * Колонка серійника.
 *
 * `snCols` збирає всі колонки, схожі на номер, і власний номер речі теж
 * туди потрапляє. Для пошуку повторів беремо саме серійник виробника —
 * власний номер перевіряється окремо, своєю групою.
 */
export function snOf(cols = {}) {
  const name = cols.name ?? 0;
  return (cols.snCols || []).find((i) => i !== name && i !== cols.id) ?? -1;
}

/**
 * Скільки рядків у листі — повтори.
 *
 * Не кількість груп: три однакові радейки це одна група, але зайвих
 * рядків у ній два. Саме зайві й цікавлять того, хто наводить лад.
 */
export function dupeCount(groups) {
  return (groups || []).reduce((a, g) => a + g.rows.length - 1, 0);
}

/**
 * Чи такий серійник уже є в листі.
 *
 * Для попередження в мить вводу: `skipRow` — рядок, який саме правлять,
 * щоб поле не лаялось саме на себе.
 */
export function sameSn(items, cols, value, skipRow = null) {
  const key = normalizeSn(value);
  if (!key) return [];
  const idx = snOf(cols);
  if (idx < 0) return [];
  return (items || [])
    .filter((it) => it.row !== skipRow && normalizeSn(it.values[idx]) === key);
}

/** Те саме для власного номера речі */
export function sameId(items, cols, value, skipRow = null) {
  const key = norm(value);
  if (!key || !(cols?.id >= 0)) return [];
  return (items || [])
    .filter((it) => it.row !== skipRow && norm(it.values[cols.id]) === key);
}

/** Коротка назва групи для людини */
export function dupeLabel(group) {
  if (!group) return '';
  if (group.kind === 'all') return 'однаковий рядок';
  if (group.kind === 'sn') return `S/N ${group.value}`;
  return `№ ${group.value}`;
}

/**
 * Повтори між листами.
 *
 * Одна рація, заведена і в «Радейки», і в «Кропиву», — це той самий
 * предмет у двох місцях обліку. Усередині листа такого не видно: кожен
 * лист про себе в порядку.
 *
 * Шукаємо тільки за серійником. Власний номер тут не годиться навмисно:
 * нумерація в кожному листі своя, і «№ 1» у радейках та «№ 1» у ПНВ —
 * це різні речі, а не повтор. Так само відпадає порівняння рядка
 * цілком: у листів різні колонки, і однакових рядків там не буває.
 *
 * `sheets` — `[{ name, headers, cols, items }]`, рівно те, що вже
 * прочитано для головної. Повертає тільки ті серійники, які трапились
 * щонайменше у двох РІЗНИХ листах: два рядки в одному листі — це
 * звичайний повтор, і його видно на сторінці самого листа.
 */
export function crossDupes(sheets) {
  const by = new Map();

  (sheets || []).forEach((sh) => {
    const idx = snOf(sh.cols || {});
    if (idx < 0) return;
    const nameIdx = sh.cols?.name ?? 0;
    (sh.items || []).forEach((it) => {
      if (blank(it.values)) return;
      const key = normalizeSn(it.values[idx]);
      if (!key) return;
      if (!by.has(key)) by.set(key, []);
      by.get(key).push({
        sheet: sh.name,
        row: it.row,
        sn: (it.values[idx] ?? '').toString().trim(),
        name: (it.values[nameIdx] ?? '').toString().trim(),
      });
    });
  });

  const out = [];
  for (const [key, places] of by) {
    const sheetNames = new Set(places.map((p) => p.sheet));
    if (sheetNames.size < 2) continue;
    out.push({ key, sn: places[0].sn, places, sheets: [...sheetNames] });
  }
  // найперше показуємо те, що розповзлося найширше
  out.sort((a, b) => b.sheets.length - a.sheets.length || a.sn.localeCompare(b.sn));
  return out;
}
