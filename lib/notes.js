// Розширення в імпортах сусідів стоїть навмисно: файл покритий тестами, а
// вбудований у Node запускач шукає модуль рівно за тим шляхом, який написали.

/**
 * Зошит: власні нотатки.
 *
 * Курс, довідник і абетка — чуже знання, розкладене кимось іншим. Цей
 * розділ — своє. Питання, яке довелось гуглити; помилка, на яку пішов
 * вечір; команда, яку щоразу шукаєш наново; правило, до якого дійшов сам.
 *
 * Навіщо окремо від щоденника практики. Щоденник — хронологія: що робив
 * цього вечора. Його читають підряд і зверху. Зошит — знання: його не
 * читають, у ньому шукають, і запис зі серпня має знайтись у лютому за
 * словом, яке тоді спаде на думку. Тому в записі є тема, мітки й пошук
 * одразу по всьому — включно з кодом.
 *
 * Головне поле — не відповідь, а питання. Через пів року ви шукатимете
 * не «useState», а «чому поле скидається після збереження», і запис,
 * названий «Стан у React», не знайдеться ніколи.
 *
 * Нотатка без відповіді теж має право лежати: незакрите питання —
 * чесний стан, і перелік таких питань цінніший за вдавану повноту.
 *
 * Тут лише правила й розбір рядків. Жодного React і жодного читання
 * таблиць — щоб склад полів можна було міняти, не чіпаючи сторінку.
 */
import { ABC } from './abc.js';

export const NOTES_SHEET = 'Здоровʼя — зошит';

export const NOTE_HEADERS = [
  'Дата', 'Вид', 'Тема', 'Питання', 'Відповідь', 'Код', 'Звідки', 'Перевірено', 'Мітки',
];

export const NO = {
  date: 0, kind: 1, topic: 2, ask: 3, answer: 4, code: 5, src: 6, checked: 7, tags: 8,
};

/*
 * Чотири види, і кожен питає своє.
 *
 * Одне поле «нотатка» на всі випадки дає купу записів, у яких через
 * місяць не розібратись. Вид не прикраса: він міняє питання форми, а
 * питання визначає, чи буде запис придатний до вжитку. «Помилка» просить
 * текст помилки дослівно — саме його ви вставите в пошук наступного разу.
 */
const K = (key, label, about, f) => ({ key, label, about, ...f });

export const KINDS = [
  K('q', 'Питання', 'Те, що довелось шукати. Наступного разу знайдеться тут.', {
    askLab: 'Питання',
    askEx: 'Чому поле форми скидається після збереження',
    answerLab: 'Відповідь своїми словами',
    answerEx: 'Значення поля живе в стані, а збереження перемальовує компонент і ставить початкове.',
  }),
  K('err', 'Помилка', 'Текст помилки, причина й що допомогло. Помилки повторюються.', {
    askLab: 'Текст помилки — дослівно',
    askEx: "TypeError: Cannot read properties of undefined (reading 'map')",
    answerLab: 'Причина й що допомогло',
    answerEx: 'Дані ще не прийшли: список був undefined до відповіді сервера. Поставив `data?.items || []`.',
  }),
  K('snip', 'Шматок', 'Код або команда, яку не хочеться згадувати наново.', {
    askLab: 'Що воно робить',
    askEx: 'Прибрати незакомічені зміни й повернутись до останнього коміта',
    answerLab: 'Коли це потрібно',
    answerEx: 'Коли наекспериментував і хочеться почати з чистого.',
  }),
  K('rule', 'Правило', 'Висновок, до якого дійшли самі. Найцінніше, що тут буває.', {
    askLab: 'Правило',
    askEx: 'Порожнє поле — це не нуль, і різницю треба тримати аж до екрана',
    answerLab: 'Звідки воно взялось',
    answerEx: 'Показувало 0 кг там, де ваги просто не вписали: `Number("")` дає нуль.',
  }),
];

export const KIND_KEYS = KINDS.map((k) => k.key);
export const kindOf = (v) => (KIND_KEYS.includes(String(v || '').trim()) ? String(v).trim() : 'q');
export const kindBy = (key) => KINDS.find((k) => k.key === kindOf(key));

/*
 * Звідки взялось.
 *
 * Не бухгалтерія, а чесність перед собою: відповідь із документації і
 * відповідь із форуму варті різного, а відповідь від AI варта рівно
 * стільки, скільки ви її перевірили.
 */
export const SOURCES = [
  { key: '', label: 'Сам дійшов', short: '' },
  { key: 'doc', label: 'Документація', short: 'з документації' },
  { key: 'web', label: 'Стаття чи форум', short: 'зі статті' },
  { key: 'ai', label: 'Від AI', short: 'від AI' },
];

export const SOURCE_KEYS = SOURCES.map((s) => s.key);
export const srcOf = (v) => (SOURCE_KEYS.includes(String(v || '').trim()) ? String(v || '').trim() : '');
export const sourceBy = (key) => SOURCES.find((s) => s.key === srcOf(key));

/**
 * Перевірка чужого коду — і насамперед написаного AI.
 *
 * Такий код виглядає переконливо завжди: і коли правильний, і коли ні.
 * Це не список для галочки, а те, після чого нотатку можна вважати
 * своєю. Перший пункт головний: «виглядає правильно» — не перевірка.
 */
export const AI_CHECK = [
  'Запустив і побачив значення — не «схоже на правду», а «я бачив вивід».',
  'Спробував край: порожній список, відсутнє поле, нуль, дві однакові назви.',
  'Звірив незнайомі назви з документацією — вигаданих функцій не існує, але виглядають вони як справжні.',
  'Можу пояснити кожен рядок. Те, чого не можу, — прибрав або розібрав.',
];

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const yes = (v) => ['1', 'так', 'true', 'yes', '+'].includes(str(v).toLowerCase());

/** «16.08.2026» → мітка часу; сміття дає 0, а не падіння */
export function stampOf(d) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(str(d));
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0;
}

/** Мітки: через кому, без порожніх і без повторів */
export function tagsOf(v) {
  const seen = new Set();
  return str(v).split(/[,;]+/).map((t) => t.trim()).filter((t) => {
    if (!t || seen.has(t.toLowerCase())) return false;
    seen.add(t.toLowerCase());
    return true;
  });
}

/** Тема абетки, до якої прив'язана нотатка; чужий id не проходить */
const TOPICS = new Set(ABC.map((a) => a.id));
export const topicOf = (v) => (TOPICS.has(str(v)) ? str(v) : '');
export const topicLabel = (id) => ABC.find((a) => a.id === id)?.t || '';

/**
 * Нотатка без відповіді — не помилка заповнення.
 *
 * Незакрите питання варте того, щоб лежати записаним: перелік таких
 * питань показує, де ви зараз, краще за будь-яку позначку «вчу».
 */
export const isOpen = (n) => !str(n?.answer) && !str(n?.code);

/**
 * Що не так із нотаткою. Порожній рядок — усе гаразд.
 *
 * Вимагається рівно одне поле. Зошит, який просить заповнити вісім
 * клітинок, не ведуть — його кидають на третьому записі.
 */
export function noteError(n) {
  if (!str(n?.ask)) return 'Напишіть питання — те, яким ви шукатимете це потім';
  if (str(n?.ask).length < 5) return 'Питання надто коротке, щоб знайтись потім';
  return '';
}

export function parseNotes(values) {
  const out = [];
  (values || []).slice(1).forEach((raw, i) => {
    const r = [...(raw || [])];
    const ask = str(r[NO.ask]);
    if (!ask) return;
    const src = srcOf(r[NO.src]);
    out.push({
      row: i + 2,
      date: str(r[NO.date]),
      kind: kindOf(r[NO.kind]),
      topic: topicOf(r[NO.topic]),
      ask,
      answer: str(r[NO.answer]),
      // код лишаємо як є: у ньому значущі і відступи, і порожні рядки
      code: r[NO.code] === null || r[NO.code] === undefined ? '' : String(r[NO.code]),
      src,
      checked: yes(r[NO.checked]),
      tags: tagsOf(r[NO.tags]),
      t: stampOf(str(r[NO.date])),
    });
  });
  // найновіші згори: до зошита дописують, а не переписують
  return out.sort((a, b) => b.t - a.t || b.row - a.row);
}

export function noteRow(n) {
  const r = new Array(NOTE_HEADERS.length).fill('');
  r[NO.date] = str(n.date);
  r[NO.kind] = kindOf(n.kind);
  r[NO.topic] = topicOf(n.topic);
  r[NO.ask] = str(n.ask);
  r[NO.answer] = str(n.answer);
  r[NO.code] = n.code === null || n.code === undefined ? '' : String(n.code);
  r[NO.src] = srcOf(n.src);
  r[NO.checked] = n.checked ? 'так' : '';
  r[NO.tags] = tagsOf(n.tags).join(', ');
  return r;
}

/**
 * Пошук.
 *
 * Слова шукаються всі разом: «react поле» має знайти нотатку, у якій є і
 * те, і те, а не все, де трапилось хоч одне. У зошиті на дві сотні
 * записів друге — те саме, що нічого не знайти.
 *
 * Шукається й по коду: часто памʼятаєш саме рядок, а не те, як ти його
 * колись назвав.
 */
export function findNotes(list, q, { kind = '', topic = '' } = {}) {
  const words = str(q).toLowerCase().split(/\s+/).filter(Boolean);
  return (list || []).filter((n) => {
    if (kind && n.kind !== kind) return false;
    if (topic && n.topic !== topic) return false;
    if (!words.length) return true;
    const hay = [n.ask, n.answer, n.code, n.tags.join(' '), topicLabel(n.topic)]
      .join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Скільки нотаток у кожної теми — щоб абетка могла вести в зошит */
export function byTopic(list) {
  const out = {};
  (list || []).forEach((n) => {
    if (n.topic) out[n.topic] = (out[n.topic] || 0) + 1;
  });
  return out;
}

/** Мітки з кількістю, найчастіші першими */
export function tagCloud(list) {
  const n = {};
  (list || []).forEach((x) => x.tags.forEach((t) => { n[t] = (n[t] || 0) + 1; }));
  return Object.entries(n)
    .map(([t, count]) => ({ t, count }))
    .sort((a, b) => b.count - a.count || a.t.localeCompare(b.t, 'uk'));
}

/**
 * Підсумок.
 *
 * `open` і `unchecked` — не прикраса. Перше показує, скільки питань
 * висить без відповіді, друге — скільки чужих відповідей ви записали, не
 * перевіривши. Обидва числа мають зменшуватись, і побачити їх треба без
 * того, щоб гортати список.
 */
export function noteStats(list) {
  const all = list || [];
  const byKind = KINDS.map((k) => ({
    ...k, count: all.filter((n) => n.kind === k.key).length,
  }));
  return {
    total: all.length,
    open: all.filter(isOpen).length,
    unchecked: all.filter((n) => n.src === 'ai' && !n.checked).length,
    topics: Object.keys(byTopic(all)).length,
    byKind,
    last: all[0]?.date || '',
  };
}

/**
 * Підказки, коли зошит порожній.
 *
 * Не «запишіть щось», а перші чотири записи, які точно є в кожного, хто
 * писав код бодай тиждень. Порожній розділ із кнопкою «додати» не
 * заповнюється ніколи.
 */
export const STARTERS = [
  { kind: 'err', ask: 'Остання помилка, на яку пішло більше пів години', d: 'Текст дослівно, причина й що допомогло.' },
  { kind: 'q', ask: 'Питання, яке ви шукали більше одного разу', d: 'Якщо шукали двічі — шукатимете й утретє.' },
  { kind: 'snip', ask: 'Команда, яку щоразу згадуєте наново', d: 'Git, термінал, запуск — те, що набираєте раз на тиждень.' },
  { kind: 'rule', ask: 'Те, що ви зрозуміли не з підручника', d: 'Одне речення, за яке заплачено власним вечором.' },
];
