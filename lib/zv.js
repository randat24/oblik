// Розширення в імпортах сусідів стоїть навмисно: файл покритий тестами, а
// вбудований у Node запускач шукає модуль рівно за тим шляхом, який написали.

/**
 * Майно служби звʼязку: реєстр, рух, акти наявності, штат.
 *
 * Тут лише правила — ні React, ні читання таблиць. Раніше реєстр жив у
 * файлі Excel «майно служби зв'язку», де кожна позиція — це рядок прихідної
 * накладної. Три лічильники ведуться руками, решта виводиться формулами:
 *
 *     рахується = отримано − списано        (за наказом)
 *     наявність = рахується − подано        (за ПБД: втрачене в бою)
 *     нестача   = подано
 *
 * На всіх 109 позиціях файлу ці рівності трималися без жодного винятку, тож
 * зберігаємо лише отримано, списано й подано, а решту рахуємо: розійтись
 * двом записам одного числа нема як.
 *
 * Дані реєстру — військові, із серійними номерами. Вони живуть тільки в
 * таблиці застосунку; у репозиторії (він відкритий) і в тестах їх немає.
 */

import { kop, money } from './fund.js';
import { csvRow, BOM } from './csv.js';

/* ---------- Листи ---------- */

export const ZV_SHEET = "Зв'язок — майно";
export const ZV_MOVES_SHEET = "Зв'язок — рух";
export const ZV_ACTS_SHEET = "Зв'язок — акти";
export const ZV_ACT_HEADS_SHEET = "Зв'язок — шапки актів";
export const ZV_NORMS_SHEET = "Зв'язок — штат";

/* Нові колонки — лише в кінець: читання позиційне */
export const ZV_HEADERS = [
  'ID', '№', 'Накладна', 'Дата накладної', 'Ціна за од.', 'Найменування', 'Посада', 'Од. вим.',
  'Категорія', 'Отримано', 'Списано', 'Подано (ПБД)', 'Не відп. кат.', 'Серійні номери',
  'Серійні в наявності', 'Підрозділ', 'Примітка', 'Додано', 'Оновлено',
];
export const ZC = {
  id: 0, no: 1, invoice: 2, invoiceDate: 3, price: 4, name: 5, post: 6, unit: 7, cat: 8,
  received: 9, writtenOff: 10, submitted: 11, wrongCat: 12, serials: 13, serialsOnHand: 14,
  place: 15, note: 16, added: 17, updated: 18,
};

export const MOVE_HEADERS = [
  'ID', 'Дата', 'Час', 'Позиція', 'Найменування', 'Дія', 'К-сть', 'Документ', 'Серійні',
  'Підрозділ', 'Примітка', 'Хто',
];
export const MC = {
  id: 0, date: 1, time: 2, pos: 3, name: 4, kind: 5, qty: 6, doc: 7, serials: 8, place: 9, note: 10, who: 11,
};

export const ACT_HEADERS = [
  'Акт', '№', 'Найменування', 'Посада', 'Од. вим.', 'Рахується / кат.', 'з/с №', 'Наявність',
  'Нестача', 'Не відп. кат.', 'Примітка',
];
export const ACT_HEAD_HEADERS = ['Акт', 'Станом на', 'Створено', 'Хто', 'Шапка', 'Заголовок', 'Підписи'];

export const NORM_HEADERS = ['Найменування', 'За штатом', 'Ключі пошуку', 'Примітка'];

/** Що сталося з позицією — словами, як у журналі */
export const MOVE_KINDS = {
  receive: 'Надійшло',
  writeoff: 'Списано',
  pbd: 'Подано (ПБД)',
  relocate: 'Переміщено',
  edit: 'Виправлено',
  add: 'Нова позиція',
  import: 'Імпорт',
};

/* ---------- Дрібниці ---------- */

const str = (v) => (v === null || v === undefined ? '' : String(v)).trim();

/** Ціле число з клітинки: «5», 5, «5.0» → 5; порожнє й сміття → 0 */
export function int(v) {
  const n = Number(str(v).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** «YYYY-MM-DD» → «DD.MM.YYYY»; решта тексту — як є */
export function dmy(v) {
  const s = str(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}

/**
 * Категорія: «II» латиницею й «ІІ» кирилицею — одне й те саме, але пошук і
 * фільтр бачили б дві різні. Пишемо кирилицею, як у більшості рядків.
 */
export function normCat(v) {
  const s = str(v).replace(/\s+/g, '');
  if (/^(I|І)$/i.test(s)) return 'І';
  if (/^(II|ІІ)$/i.test(s)) return 'ІІ';
  if (/^(III|ІІІ)$/i.test(s)) return 'ІІІ';
  return s;
}

/** «5/II» → { qty: 5, cat: 'ІІ' }; «1/прид» → { 1, 'прид' } */
export function parseCountCat(v) {
  const m = str(v).match(/^(\d+(?:[.,]\d+)?)\s*\/?\s*(.*)$/);
  if (!m) return { qty: null, cat: normCat(v) };
  return { qty: int(m[1]), cat: normCat(m[2]) };
}

/* ---------- Серійні номери ---------- */

/**
 * Серійники з клітинки. Пишуть їх як завгодно: через кому, крапку з комою,
 * « / », перенос рядка чи просто пробіл. Сама похила риска розділювачем
 * не є: «F11B0F93CC44/217/r2» — це один номер. Номером вважаємо шматок із
 * цифрою, довший за три знаки: «+ sim-карта» номером не є.
 */
export function serialsOf(text) {
  return str(text)
    .split(/\s+\/\s+|[\n;,]+|\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3 && /\d/.test(s));
}

const sameSerial = (a, b) => fold(a) === fold(b);

/** Прибрати вибрані номери зі списку, решту зібрати через « / » */
export function withoutSerials(text, picked) {
  const drop = (picked || []).map(fold);
  return serialsOf(text).filter((s) => !drop.includes(fold(s))).join(' / ');
}

/* ---------- Позиція ---------- */

/** Рядок листа → позиція з виведеними числами */
export function posOf(r, row) {
  const p = {
    row,
    id: str(r[ZC.id]),
    no: str(r[ZC.no]),
    invoice: str(r[ZC.invoice]),
    invoiceDate: str(r[ZC.invoiceDate]),
    price: kop(str(r[ZC.price])) || 0,
    name: str(r[ZC.name]),
    post: str(r[ZC.post]),
    unit: str(r[ZC.unit]),
    cat: normCat(r[ZC.cat]),
    received: int(r[ZC.received]),
    writtenOff: int(r[ZC.writtenOff]),
    submitted: int(r[ZC.submitted]),
    wrongCat: int(r[ZC.wrongCat]),
    serials: str(r[ZC.serials]),
    serialsOnHand: str(r[ZC.serialsOnHand]),
    place: str(r[ZC.place]),
    note: str(r[ZC.note]),
    added: str(r[ZC.added]),
    updated: str(r[ZC.updated]),
  };
  return withCounts(p);
}

/** Виведені числа: рахується, наявність, нестача й вартість на обліку */
export function withCounts(p) {
  const counted = p.received - p.writtenOff;
  return {
    ...p,
    counted,
    onHand: counted - p.submitted,
    shortage: p.submitted,
    value: (p.price || 0) * counted,
  };
}

/** Позиція → рядок листа в порядку ZV_HEADERS */
export function posRow(p) {
  const r = new Array(ZV_HEADERS.length).fill('');
  r[ZC.id] = p.id;
  r[ZC.no] = p.no;
  r[ZC.invoice] = p.invoice;
  r[ZC.invoiceDate] = p.invoiceDate;
  r[ZC.price] = p.price ? (p.price / 100).toFixed(2) : '';
  r[ZC.name] = p.name;
  r[ZC.post] = p.post;
  r[ZC.unit] = p.unit;
  r[ZC.cat] = p.cat;
  r[ZC.received] = String(p.received || 0);
  r[ZC.writtenOff] = p.writtenOff ? String(p.writtenOff) : '';
  r[ZC.submitted] = p.submitted ? String(p.submitted) : '';
  r[ZC.wrongCat] = p.wrongCat ? String(p.wrongCat) : '';
  r[ZC.serials] = p.serials;
  r[ZC.serialsOnHand] = p.serialsOnHand;
  r[ZC.place] = p.place;
  r[ZC.note] = p.note;
  r[ZC.added] = p.added;
  r[ZC.updated] = p.updated;
  return r;
}

export function parsePositions(values) {
  return (values || []).slice(1)
    .map((r, i) => (str((r || [])[ZC.name]) || str((r || [])[ZC.id]) ? posOf(r || [], i + 2) : null))
    .filter(Boolean);
}

/** «Рахується / кат.» як у документах: «5/ІІ», «1/прид», «4/» */
export const countCat = (p) => `${p.counted}/${p.cat || ''}`;

/* ---------- Пошук і фільтри ---------- */

/*
 * Серійники й моделі пишуть то латиницею, то кирилицею: «А14438» і «A14438»
 * виглядають однаково, але це різні символи, і пошук одного не знаходив би
 * другого. Перед порівнянням зводимо схожі літери до латиниці.
 */
const LOOKALIKE = {
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', х: 'x', у: 'y', і: 'i',
};
export function fold(s) {
  return str(s).toLowerCase().replace(/[авекмнорстхуі]/g, (c) => LOOKALIKE[c]).replace(/\s+/g, ' ');
}

/** Чи підходить позиція під пошук: назва, серійник, накладна, підрозділ, примітка, посада */
export function matches(p, query) {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = fold([p.name, p.serials, p.serialsOnHand, p.invoice, p.place, p.note, p.post, p.no, p.cat].join(' '));
  return words.every((w) => hay.includes(w));
}

/** Стан позиції для фільтра */
export function stateOf(p) {
  if (p.counted <= 0) return 'gone'; // списана повністю
  if (p.shortage > 0 && p.onHand <= 0) return 'lost';
  if (p.shortage > 0) return 'partial';
  return 'ok';
}

// короткі: пігулка стоїть поруч із назвою, і довгий напис обрізався до «ЧАСТКОВО НЕСТ…»
export const STATE_LABELS = {
  ok: 'В наявності', partial: 'Є нестача', lost: 'Нестача', gone: 'Списано',
};

/** Підрозділи — окремими словами: «РЕР, КСП(віраж)» — це два місця */
export function placesOf(positions) {
  const set = new Map();
  (positions || []).forEach((p) => {
    str(p.place).split(/[,;/\n]+/).map((x) => x.replace(/\(.*?\)/g, '').trim()).filter(Boolean)
      .forEach((x) => set.set(fold(x), set.get(fold(x)) || x));
  });
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'uk'));
}

export const inPlace = (p, place) => !place || fold(p.place).includes(fold(place));

/** Підсумки по набору позицій */
export function totals(positions) {
  return (positions || []).reduce((t, p) => ({
    positions: t.positions + 1,
    counted: t.counted + Math.max(0, p.counted),
    onHand: t.onHand + Math.max(0, p.onHand),
    shortage: t.shortage + Math.max(0, p.shortage),
    value: t.value + Math.max(0, p.value),
  }), { positions: 0, counted: 0, onHand: 0, shortage: 0, value: 0 });
}

/* ---------- Рух ---------- */

const appendNote = (note, line) => [str(note), line].filter(Boolean).join('\n');

/**
 * Застосувати дію до позиції.
 *
 * Повертає `{ pos }` з новою позицією або `{ error }` словами. Перевірки ті
 * самі, що зробила б людина з паперами: списати чи подати можна не більше,
 * ніж є в наявності; серійник має бути серед тих, що є; документ обовʼязковий,
 * бо без наказу чи ПБД запис нічого не доводить.
 */
export function applyMove(pos, move) {
  const kind = move.kind;
  const qty = int(move.qty);
  const doc = str(move.doc);
  const picked = (move.serials || []).map(str).filter(Boolean);
  const p = { ...pos };

  if (kind === 'writeoff' || kind === 'pbd') {
    if (qty <= 0) return { error: 'Вкажіть кількість' };
    if (qty > pos.onHand) return { error: `У наявності лише ${pos.onHand}` };
    if (!doc) return { error: kind === 'pbd' ? 'Вкажіть номер ПБД' : 'Вкажіть номер наказу' };
    if (picked.length > qty) return { error: 'Серійних номерів більше, ніж кількість' };
    const have = serialsOf(pos.serialsOnHand);
    const missing = picked.filter((s) => !have.some((h) => sameSerial(h, s)));
    if (missing.length) return { error: `Немає в наявності: ${missing.join(', ')}` };
    if (kind === 'writeoff') p.writtenOff = pos.writtenOff + qty;
    else p.submitted = pos.submitted + qty;
    if (picked.length) p.serialsOnHand = withoutSerials(pos.serialsOnHand, picked);
    const what = picked.length ? picked.join(', ') : `${qty} од.`;
    p.note = appendNote(pos.note, `${what} - ${doc}`);
  } else if (kind === 'receive') {
    if (qty <= 0) return { error: 'Вкажіть кількість' };
    p.received = pos.received + qty;
    if (picked.length) {
      p.serials = [pos.serials, picked.join(' / ')].filter(Boolean).join(' / ');
      p.serialsOnHand = [pos.serialsOnHand, picked.join(' / ')].filter(Boolean).join(' / ');
    }
    if (doc) p.note = appendNote(pos.note, `+${qty} од. - ${doc}`);
  } else if (kind === 'relocate') {
    const place = str(move.place);
    if (place === pos.place) return { error: 'Підрозділ не змінився' };
    p.place = place;
  } else {
    return { error: 'Невідома дія' };
  }
  return { pos: withCounts(p) };
}

/** Рядок листа руху */
export function moveRow(m) {
  const r = new Array(MOVE_HEADERS.length).fill('');
  r[MC.id] = m.id; r[MC.date] = m.date; r[MC.time] = m.time; r[MC.pos] = m.pos; r[MC.name] = m.name;
  r[MC.kind] = MOVE_KINDS[m.kind] || m.kind; r[MC.qty] = m.qty ? String(m.qty) : '';
  r[MC.doc] = m.doc || ''; r[MC.serials] = m.serials || ''; r[MC.place] = m.place || '';
  r[MC.note] = m.note || ''; r[MC.who] = m.who || '';
  return r;
}

export function parseMoves(values) {
  return (values || []).slice(1).filter((r) => str((r || [])[MC.pos])).map((r, i) => ({
    row: i + 2,
    id: str(r[MC.id]), date: str(r[MC.date]), time: str(r[MC.time]), pos: str(r[MC.pos]),
    name: str(r[MC.name]), kind: str(r[MC.kind]), qty: int(r[MC.qty]), doc: str(r[MC.doc]),
    serials: str(r[MC.serials]), place: str(r[MC.place]), note: str(r[MC.note]), who: str(r[MC.who]),
  }));
}

/* ---------- Акти наявності ---------- */

/**
 * Акт зі стану реєстру.
 *
 * Беремо те, що рахується (є хоч одна одиниця на обліку), у порядку
 * реєстру — так само, як складали акти руками. У примітку йде історія
 * позиції; якщо є нестача, вона починається словом «Втрачено:», як у
 * паперових актах.
 */
export function makeAct(positions, { merge = false } = {}) {
  const lines = (positions || []).filter((p) => p.counted > 0);
  const rows = merge ? mergeSame(lines) : lines;
  return rows.map((p, i) => ({
    no: i + 1,
    name: p.name,
    post: p.post,
    unit: p.unit,
    countCat: countCat(p),
    serials: serialsOf(p.serials).join(' '),
    onHand: p.onHand,
    shortage: p.shortage,
    wrongCat: p.wrongCat,
    note: p.shortage > 0 && !/^втрачено/i.test(p.note) ? ['Втрачено:', p.note].filter(Boolean).join('\n') : p.note,
  }));
}

/**
 * Однакове майно з різних накладних — одним рядком, як в акті 10.08.2026:
 * антени, що прийшли трьома партіями, там стоять одним рядком із сумою.
 * Однаковим вважаємо збіг назви, одиниці й категорії.
 */
export function mergeSame(positions) {
  const groups = new Map();
  (positions || []).forEach((p) => {
    const key = [fold(p.name), fold(p.unit), p.cat].join('|');
    const g = groups.get(key);
    if (!g) { groups.set(key, { ...p }); return; }
    g.received += p.received; g.writtenOff += p.writtenOff; g.submitted += p.submitted;
    g.wrongCat += p.wrongCat;
    g.serials = [g.serials, p.serials].filter(Boolean).join(' / ');
    g.note = [g.note, p.note].filter(Boolean).join('\n');
    g.post = g.post || p.post;
  });
  return [...groups.values()].map(withCounts);
}

export function actRow(key, a) {
  return [key, String(a.no), a.name, a.post, a.unit, a.countCat, a.serials,
    String(a.onHand), String(a.shortage), String(a.wrongCat || 0), a.note];
}

export function parseActs(values, headValues) {
  const heads = (headValues || []).slice(1).filter((r) => str((r || [])[0])).map((r) => ({
    key: str(r[0]), date: str(r[1]), created: str(r[2]), who: str(r[3]),
    head: str(r[4]), title: str(r[5]), footer: str(r[6]),
  }));
  const items = {};
  (values || []).slice(1).forEach((r) => {
    const key = str((r || [])[0]);
    if (!key) return;
    (items[key] = items[key] || []).push({
      no: int(r[1]), name: str(r[2]), post: str(r[3]), unit: str(r[4]), countCat: str(r[5]),
      serials: str(r[6]), onHand: int(r[7]), shortage: int(r[8]), wrongCat: int(r[9]), note: str(r[10]),
    });
  });
  return heads.map((h) => ({ ...h, items: items[h.key] || [] }))
    .sort((a, b) => (isoOf(b.date) < isoOf(a.date) ? -1 : 1));
}

/** «10.08.2026» → «2026-08-10» для сортування */
export function isoOf(d) {
  const m = str(d).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : str(d);
}

/** Заголовок нового акта: беремо з останнього й міняємо дату */
export function retitle(title, date) {
  const d = dmy(date);
  const t = str(title);
  if (!t) return `Наявність та якісний стан матеріальних засобів служби звʼязку станом на ${d}`;
  return /станом на\s*\d{2}\.\d{2}\.\d{4}/.test(t) ? t.replace(/станом на\s*\d{2}\.\d{2}\.\d{4}/, `станом на ${d}`) : `${t}, станом на ${d}`;
}

/* ---------- Штат ---------- */

/** «Портативні … DP4800 - 10 шт» → { name, qty } */
export function parseNorm(text) {
  const s = str(text);
  const m = s.match(/^(.*?)[\s\-–—]+(\d+)\s*шт\.?\s*$/i);
  return m ? { name: m[1].trim(), qty: Number(m[2]) } : { name: s, qty: 0 };
}

/**
 * Ключі пошуку для рядка штату: коди моделей («DP4800», «К-2РТД»), бо саме
 * за ними позицію реєстру й упізнають. Якщо коду немає — перше змістовне
 * слово. Ключі людина потім виправляє сама.
 */
export function suggestKeys(name) {
  // перший код — сама річ; далі в описі бувають коди того, з чого вона складається
  // («Либідь К-2РБ … на базі DM4600»), і вони притягували б чужі позиції
  const code = (str(name).match(/[A-Za-zА-ЯІЇЄҐа-яіїєґ]{1,4}-?\d[\w.\-А-ЯІЇЄҐа-яіїєґ]*/g) || [])
    .find((c) => /\d/.test(c) && c.length >= 3);
  if (code) return code;
  // інакше — абревіатура великими літерами: «ПССЗ», «ЕОМ»
  const abbr = (str(name).match(/[A-ZА-ЯІЇЄҐ]{3,}/g) || [])[0];
  return abbr || '';
}

/** Чи підходить позиція під ключі: будь-який ключ, усі його слова */
export function keyMatches(p, keys) {
  return str(keys).split(';').map((k) => k.trim()).filter(Boolean)
    .some((k) => fold(k).split(' ').filter(Boolean).every((w) => fold(p.name).includes(w)));
}

/** Скільки є з того, що належить за штатом */
export function normStatus(norm, positions) {
  const hit = (positions || []).filter((p) => keyMatches(p, norm.keys));
  const onHand = hit.reduce((a, p) => a + Math.max(0, p.onHand), 0);
  const counted = hit.reduce((a, p) => a + Math.max(0, p.counted), 0);
  return { positions: hit, onHand, counted, lack: Math.max(0, (norm.qty || 0) - onHand) };
}

export function parseNorms(values) {
  return (values || []).slice(1).filter((r) => str((r || [])[0])).map((r, i) => ({
    row: i + 2, name: str(r[0]), qty: int(r[1]), keys: str(r[2]), note: str(r[3]),
  }));
}

/* ---------- Імпорт із файлу Excel ---------- */

const findCol = (headers, test, from = 0) => {
  for (let i = from; i < headers.length; i += 1) if (test(str(headers[i]).toLowerCase())) return i;
  return -1;
};

/**
 * Аркуш «робоча» → позиції.
 *
 * Колонки шукаємо за назвами, бо їх переставляють руками. Назва «№» стоїть
 * тричі: номер накладної, порядковий номер і двічі серійники — розрізняємо
 * за сусідами.
 */
export function importRegister(rows) {
  const hi = (rows || []).findIndex((r) => (r || []).some((c) => str(c).toLowerCase() === 'найменування'));
  if (hi < 0) return { positions: [], issues: ['На аркуші немає рядка з назвами колонок («Найменування»)'] };
  const h = rows[hi];
  const C = {};
  C.name = findCol(h, (s) => s === 'найменування');
  C.invoice = 0;
  C.date = findCol(h, (s) => s === 'дата');
  C.price = findCol(h, (s) => s.startsWith('вартість'));
  C.no = findCol(h, (s) => s === '№', C.price + 1);
  C.post = findCol(h, (s) => s === 'посада');
  C.unit = findCol(h, (s) => s.startsWith('од'));
  C.countCat = findCol(h, (s) => s.startsWith('рахується /') || s.startsWith('рахується/'));
  C.counted = findCol(h, (s) => s === 'рахується');
  C.serials = findCol(h, (s) => s === '№', C.counted + 1);
  C.received = findCol(h, (s) => s === 'отримано');
  C.writtenOff = findCol(h, (s) => s === 'списано');
  C.submitted = findCol(h, (s) => s === 'подано');
  C.onHand = findCol(h, (s) => s === 'к-сть');
  C.serialsOnHand = findCol(h, (s) => s === '№', C.onHand + 1);
  C.wrongCat = findCol(h, (s) => s.startsWith('не відп'));
  C.note = findCol(h, (s) => s === 'примітка');
  C.place = findCol(h, (s) => s === 'підрозділ');
  const at = (r, k) => (C[k] >= 0 ? (r || [])[C[k]] : '');

  const issues = [];
  const positions = [];
  rows.slice(hi + 1).forEach((r, i) => {
    const name = str(at(r, 'name'));
    if (!name) return;
    const sheetRow = hi + 2 + i;
    const cc = parseCountCat(at(r, 'countCat'));
    const p = withCounts({
      id: '', no: String(int(at(r, 'no')) || positions.length + 1),
      invoice: str(at(r, 'invoice')),
      invoiceDate: dmy(at(r, 'date')),
      price: kop(String(at(r, 'price') ?? '').replace(/\s/g, '')) || 0,
      name, post: str(at(r, 'post')), unit: str(at(r, 'unit')), cat: cc.cat,
      received: int(at(r, 'received')), writtenOff: int(at(r, 'writtenOff')), submitted: int(at(r, 'submitted')),
      wrongCat: int(at(r, 'wrongCat')),
      serials: str(at(r, 'serials')), serialsOnHand: str(at(r, 'serialsOnHand')),
      place: str(at(r, 'place')), note: str(at(r, 'note')), added: '', updated: '',
    });
    // звіряємо з тим, що порахували формули самого файлу
    const fileCounted = int(at(r, 'counted'));
    const fileOnHand = int(at(r, 'onHand'));
    if (C.counted >= 0 && fileCounted !== p.counted) issues.push(`Рядок ${sheetRow} «${name.slice(0, 40)}»: у файлі рахується ${fileCounted}, а отримано − списано = ${p.counted}`);
    if (C.onHand >= 0 && fileOnHand !== p.onHand) issues.push(`Рядок ${sheetRow} «${name.slice(0, 40)}»: у файлі наявність ${fileOnHand}, а виходить ${p.onHand}`);
    if (cc.qty !== null && cc.qty !== p.counted) issues.push(`Рядок ${sheetRow} «${name.slice(0, 40)}»: «рахується / кат.» = ${cc.qty}, а виходить ${p.counted}`);
    positions.push(p);
  });
  return { positions, issues };
}

/** Аркуш акта → { date, head, title, footer, items } */
export function importAct(name, rows) {
  const hi = (rows || []).findIndex((r) => {
    const t = (r || []).map((c) => str(c).toLowerCase());
    return t.includes('найменування') && t.includes('наявність');
  });
  if (hi < 0) return null;
  const h = rows[hi].map((c) => str(c).toLowerCase());
  const col = (t) => h.findIndex((x) => x.startsWith(t));
  const C = {
    no: h.indexOf('№'), name: col('найменування'), post: col('посада'), unit: col('од'),
    countCat: col('рахується'), serials: col('з/с'), onHand: col('наявність'), shortage: col('нестача'),
    wrongCat: col('не відп'), note: col('примітка'),
  };
  const text = (r) => (r || []).map(str).filter(Boolean);
  const before = rows.slice(0, hi).map(text).filter((t) => t.length);
  const title = (before.find((t) => t.some((x) => /станом на/i.test(x))) || []).find((x) => /станом на/i.test(x)) || '';
  const head = before.filter((t) => !t.some((x) => /станом на/i.test(x))).map((t) => t.join(' ')).join('\n');
  const items = [];
  let i = hi + 1;
  for (; i < rows.length; i += 1) {
    const r = rows[i] || [];
    if (!str(r[C.name])) { if (text(r).length) break; continue; }
    if (!Number.isFinite(Number(r[C.no])) || str(r[C.no]) === '') break;
    const g = (k) => (C[k] >= 0 ? r[C[k]] : '');
    items.push({
      no: int(g('no')), name: str(g('name')), post: str(g('post')), unit: str(g('unit')),
      countCat: str(g('countCat')), serials: str(g('serials')), onHand: int(g('onHand')),
      shortage: int(g('shortage')), wrongCat: int(g('wrongCat')), note: str(g('note')),
    });
  }
  const footer = rows.slice(i).map(text).filter((t) => t.length).map((t) => t.join(' ')).join('\n');
  const dm = `${name} ${title}`.match(/(\d{2}\.\d{2}\.\d{4})/);
  return { date: dm ? dm[1] : '', head, title, footer, items };
}

/** Аркуш «по штату» → рядки штату з підказаними ключами */
export function importNorms(rows) {
  const out = [];
  (rows || []).forEach((r) => {
    const t = (r || []).map(str).find((x) => /шт\.?\s*$/i.test(x) && x.length > 6);
    if (!t) return;
    const n = parseNorm(t);
    out.push({ name: n.name, qty: n.qty, keys: suggestKeys(n.name), note: '' });
  });
  return out;
}

/**
 * Уся книга → що імпортувати. Аркуш реєстру — «робоча» або перший, де є
 * «Найменування» й «отримано»; акти — аркуші з «Акт» у назві; штат — «по штату».
 */
export function importWorkbook(sheets) {
  const list = sheets || [];
  const reg = list.find((s) => /робоч/i.test(s.name))
    || list.find((s) => s.rows.some((r) => (r || []).some((c) => str(c).toLowerCase() === 'отримано')));
  const { positions, issues } = reg ? importRegister(reg.rows) : { positions: [], issues: ['У файлі не знайдено аркуш реєстру («робоча»)'] };
  const acts = list.filter((s) => /^акт/i.test(s.name.trim()))
    .map((s) => ({ sheet: s.name, ...importAct(s.name, s.rows) }))
    .filter((a) => a.items && a.items.length);
  const normSheet = list.find((s) => /штат/i.test(s.name));
  const norms = normSheet ? importNorms(normSheet.rows) : [];
  return { positions, acts, norms, issues, sheet: reg ? reg.name : '' };
}

/** Короткий підсумок імпорту — для екрана перед записом */
export function importSummary(parsed) {
  const t = totals(parsed.positions);
  return {
    positions: t.positions,
    counted: t.counted,
    onHand: t.onHand,
    shortage: t.shortage,
    value: money(t.value),
    acts: parsed.acts.map((a) => ({ sheet: a.sheet, date: a.date, items: a.items.length })),
    norms: parsed.norms.length,
    issues: parsed.issues,
  };
}

/* ---------- Вивантаження ---------- */

/*
 * CSV — тим самим `lib/csv`, що й решта застосунку (крапка з комою, BOM,
 * лапки). Зверху лише одне: текст, що починається з «=», «+», «-» чи «@»,
 * отримує апостроф, щоб назва чи примітка, відкрита в Excel, не виконалась
 * як формула. Числа не чіпаємо — «-5» має лишатись числом.
 */
export function sheetCsv(rows) {
  const safe = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
  return BOM + (rows || []).map((r) => csvRow(r.map(safe))).join('\r\n');
}

/** Реєстр у таблицю для вивантаження */
export function registerTable(positions) {
  return [
    ['№', 'Найменування', 'Посада', 'Од. вим.', 'Категорія', 'Отримано', 'Списано', 'Рахується',
      'Подано (ПБД)', 'Наявність', 'Серійні номери', 'Серійні в наявності', 'Підрозділ', 'Накладна',
      'Дата накладної', 'Ціна за од.', 'Вартість', 'Примітка'],
    ...(positions || []).map((p) => [
      p.no, p.name, p.post, p.unit, p.cat, p.received, p.writtenOff, p.counted, p.submitted, p.onHand,
      p.serials, p.serialsOnHand, p.place, p.invoice, p.invoiceDate,
      p.price ? money(p.price) : '', p.value ? money(p.value) : '', p.note,
    ]),
  ];
}

/** Акт у таблицю для вивантаження — колонки як у паперовому акті */
export function actTable(act) {
  return [
    ...(act.head ? act.head.split('\n').map((l) => [l]) : []),
    [act.title || ''],
    ['№', 'Найменування', 'Посада', 'Од. вим.', 'Рахується / кат.', 'з/с №', 'Наявність', 'Нестача', 'Не відп. кат.', 'Примітка'],
    ...(act.items || []).map((a) => [a.no, a.name, a.post, a.unit, a.countCat, a.serials, a.onHand, a.shortage || '', a.wrongCat || '', a.note]),
    ...(act.footer ? act.footer.split('\n').map((l) => [l]) : []),
  ];
}
