/**
 * Доставки — шлях посилки від збирання до точки призначення.
 *
 * Етапів чотири, і вони йдуть строго по черзі: зібрали, віддали на відправку,
 * відправник довіз до своєї точки вильоту, звідти доставили адресатові. Кожен
 * етап має свою дату й того, хто його зробив, — саме цього бракує, коли
 * посилка «десь у дорозі», а згадати, у кого вона, вже нікому.
 */

export const DELIVERY_SHEET = 'Доставки';

export const DELIVERY_HEADERS = [
  'Створено', 'Вміст', 'Вага, кг', 'Статус',
  'Водій', 'Точка', 'Хто здав', 'Хто прийняв',
  'Зібрано', 'Передано водію', 'На точці вильоту', 'Доставлено',
  'Примітка', 'Кому', 'Місця', 'Доставлені місця',
  'Втрачено', 'Втрачені місця', 'Пріоритет', 'Першочергові місця',
  'Кому на точці',
];

export const DL = {
  created: 0, what: 1, weight: 2, status: 3,
  driver: 4, point: 5, giver: 6, taker: 7,
  packed: 8, handed: 9, atbase: 10, delivered: 11,
  note: 12, to: 13, parts: 14, partsDone: 15,
  lost: 16, partsLost: 17, prio: 18, partsHot: 19,
  pilot: 20,
};

/**
 * «Кому на точці» й «Хто прийняв» — це не одне й те саме, хоч люди там
 * ті самі.
 *
 * Перше пише збирач: він знає, кому саме везуть коробку — Лотару чи БПС,
 * бо саме вони переправляють її далі дронами. Це намір, і відомий він ще
 * до того, як посилка рушила.
 *
 * Друге пише черговий, коли посилка вже на точці: це факт. Збіглися вони
 * чи ні — видно одразу, і саме тому вони живуть в різних колонках. Коли
 * коробку віддали не тому, кому збирали, це варте одного погляду, а не
 * мовчазного перезапису.
 */

/**
 * Черговість.
 *
 * Рівнів рівно два, і це навмисно. Там, де їх п'ять, через місяць усе
 * стає «високим», і сортування перестає щось означати. «В першу чергу» —
 * це заявка на місце в найближчому борті, а не оцінка важливості вантажу.
 *
 * Стоїть вона на мішку, а не на посилці. Партія «Для Тигра» — це чотири
 * мішки на один борт, і першочерговими бувають два з них: борт бере не
 * посилку цілком, а стільки, скільки підніме. Посилка без переліку — це
 * один мішок, і тоді позначка живе просто на ній.
 */
export const PRIO_FIRST = 'В першу чергу';

/** «1; 3» — номери місць, які летять найближчим бортом */
export const parseHot = (v) => new Set(
  String(v || '').split(/[;,]/).map((x) => parseInt(x, 10)).filter((n) => n > 0)
);

export const joinHot = (set) => [...set].sort((a, b) => a - b).join('; ');

/**
 * Етапи. Порядок — це і є маршрут; наступний крок завжди один, тож на
 * картці стоїть одна кнопка, а не список із чотирьох станів, серед яких
 * треба обрати правильний.
 */
export const STAGES = [
  {
    key: 'packed', col: DL.packed,
    label: 'Зібрано', short: 'Зібрано', action: 'Зібрано',
    hint: 'Посилка складена, вага відома.',
    sla: 1,
  },
  {
    key: 'handed', col: DL.handed,
    label: 'Передали', short: 'Передали', action: 'Передати на відправку',
    hint: 'Поїхала з нашого боку — далі за неї відповідає той, хто відправляє.',
    needs: ['driver'], sla: 2,
  },
  {
    key: 'atbase', col: DL.atbase,
    label: 'На точці вильоту', short: 'На точці', action: 'Прийнято на точці',
    hint: 'Водій довіз до своєї точки, звідки йде виліт.',
    sla: 2,
  },
  {
    key: 'delivered', col: DL.delivered,
    label: 'Доставлено', short: 'Прибула', action: 'Доставлено',
    hint: 'Дійшла до адресата.',
    // питаємо лише точку: хто прийняв підставляється з «Кому» — посилку
    // приймає той, кому її й везли, а не той, хто вносить запис
    needs: ['point'],
  },
];

export const stageAt = (key) => STAGES.findIndex((s) => s.key === key);

/**
 * Точок може бути кілька: один виліт часто закриває дві позиції одразу —
 * і на Тигр, і на Рись. Зберігаємо їх в одній клітинці через кому, бо для
 * таблиці, яку читають очима, «Тигр, Рись» зрозуміліше за дві колонки, з
 * яких друга майже завжди порожня.
 */
export const splitPoints = (v) => String(v || '')
  .split(',').map((x) => x.trim()).filter(Boolean);

export const joinPoints = (arr) => (arr || []).map((x) => String(x).trim()).filter(Boolean).join(', ');

/**
 * Місця однієї відправки.
 *
 * «Вода, 3 шт» — це не одна коробка, а три каністри по 7,7, 7,8 і 8,5
 * літра, і на точку вони йдуть не разом. Без переліку відповідь на питання
 * «що вже поставили» звучить як «частину», а це не відповідь.
 *
 * Розділювач — крапка з комою, бо в самих назвах трапляються коми: «7,7 л».
 */
export const splitParts = (v) => String(v || '')
  .split(';').map((x) => x.trim()).filter(Boolean);

export const joinParts = (arr) => (arr || []).map((x) => String(x).trim()).filter(Boolean).join('; ');

/**
 * Доставлені місця: «1=16.08.2026 09:12; 3=17.08.2026 10:40».
 *
 * У кожного місця своя дата, бо в цьому вся суть: воду відвезли сьогодні,
 * решту — через день, і «доставлено 1 з 3» без дат не каже, коли саме що
 * поїхало. Старий запис «1; 3» читається як і раніше — просто без дат.
 */
export const parseDone = (v) => {
  const m = new Map();
  String(v || '').split(';').forEach((chunk) => {
    const [num, ...rest] = chunk.split('=');
    const n = parseInt(num, 10);
    if (n > 0) m.set(n, rest.join('=').trim());
  });
  return m;
};

export const joinDone = (map) => [...map.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([n, at]) => (at ? `${n}=${at}` : String(n)))
  .join('; ');

/**
 * Вага окремого місця: «Вода 7,7 л = 7.7».
 *
 * Борт має межу підйому, і рахувати її треба по тому, що справді полетить.
 * Коли посилка їде частинами, спільна вага на всю посилку нічого не
 * означає: половину відвезли, і скільки лишилось — невідомо.
 *
 * Вага не обовʼязкова: «Їжа» без числа лишається просто місцем.
 */
export function parsePart(label) {
  const s = String(label || '').trim();
  const at = s.lastIndexOf('=');
  if (at < 0) return { name: s, kg: null };
  const kg = num(s.slice(at + 1));
  // «=» без числа після нього — частина назви, а не вага
  if (kg === null) return { name: s, kg: null };
  return { name: s.slice(0, at).trim() || s, kg };
}

export const partLabel = (name, kg) =>
  (kg === null || kg === undefined || kg === '' ? String(name).trim() : `${String(name).trim()} = ${kg}`);

/**
 * Підсумок по місцях. Коли переліку немає, посилка вважається одним
 * місцем — так само, як було до появи цього поля: старі записи не мають
 * раптом стати «нуль із нуля».
 */
export function partsOf(d) {
  const labels = splitParts(d.parts);
  if (!labels.length) return null;
  const done = parseDone(d.partsDone);
  const lost = parseDone(d.partsLost);
  const hot = parseHot(d.partsHot);
  const items = labels.map((label, i) => {
    const { name, kg } = parsePart(label);
    const n = i + 1;
    // втрачене не буває доставленим: якщо позначки стоять обидві, вагоміша
    // втрата — саме вона пояснює, чому місце не приїде
    const isLost = lost.has(n);
    return {
      n, label, name, kg,
      done: !isLost && done.has(n),
      lost: isLost,
      hot: hot.has(n),
      at: (isLost ? lost.get(n) : done.get(n)) || '',
    };
  });
  const sum = (arr) => arr.reduce((a, x) => a + (x.kg || 0), 0);
  // «лишилось» — те, що ще поїде: ані доставлене, ані списане
  const left = items.filter((x) => !x.done && !x.lost);
  const lostItems = items.filter((x) => x.lost);
  // першочергове рахуємо тільки серед того, що ще їде: мішок, який уже
  // прилетів, черги не займає
  const hotLeft = left.filter((x) => x.hot);
  return {
    items,
    total: items.length,
    done: items.filter((x) => x.done).length,
    lost: lostItems.length,
    lostItems,
    lostNames: lostItems.map((x) => x.name),
    hot: items.filter((x) => x.hot).length,
    hotLeft: hotLeft.length,
    hotNames: hotLeft.map((x) => x.name),
    kgHot: hotLeft.reduce((a, x) => a + (x.kg || 0), 0),
    left: left.map((x) => x.name),
    leftItems: left,
    kg: sum(items),
    kgLeft: sum(left),
    kgDone: sum(items.filter((x) => x.done)),
    kgLost: sum(lostItems),
    // вага стоїть хоч у одного місця — інакше немає що показувати
    weighed: items.some((x) => x.kg !== null),
  };
}

/**
 * Вага посилки. Коли місця зважені, вага — це їх сума: вписувати її ще й
 * окремо означало б тримати два числа, які рано чи пізно розійдуться.
 */
export function weightOf(d) {
  const p = partsOf(d);
  if (p && p.weighed) return p.kg;
  return d.weight ?? null;
}

/** Скільки ще везти: неприбулі місця зважених посилок плюс незважені цілком */
export function weightLeft(list) {
  return list.filter((d) => !d.done && !d.isLost).reduce((a, d) => {
    const p = partsOf(d);
    if (p && p.weighed) return a + p.kgLeft;
    return a + (d.weight || 0);
  }, 0);
}

/**
 * Посилка з переліком закривається тоді й лише тоді, коли по кожному місцю
 * є відповідь: або приїхало, або списане. Інакше виходить те, чого не
 * буває: «прибула» стоїть, а дві каністри з трьох ще на точці вильоту.
 */
export function allPartsDone(d) {
  const p = partsOf(d);
  return !p || p.left.length === 0;
}

/**
 * Втрати.
 *
 * Не все, що не приїхало, ще їде. Ящик розбили при завантаженні, воду
 * забрали на іншу точку, виліт скасували назовсім — такі місця не мають
 * ані висіти в «лишилось», ані вдавати доставку. Вони списуються окремо, і
 * з них рахується те, чого ми не довезли, — цифра, заради якої все й
 * ведеться.
 */
export const LOST_WHY = ['Знищено', 'Не відправлять', 'Загублено', 'Забрали інші'];

/** Списана посилка цілком або всі її місця списані */
export function isLost(d) {
  if (str(d.lost)) return true;
  const p = partsOf(d);
  return !!(p && p.total > 0 && p.lost === p.total);
}

/** Скільки й чого не доїхало — по місцях, а не по посилках */
export function lostOf(list) {
  let places = 0;
  let kg = 0;
  let parcels = 0;
  list.forEach((d) => {
    const p = partsOf(d);
    if (p) {
      places += p.lost;
      kg += p.kgLost;
      if (p.lost === p.total && p.total > 0) parcels += 1;
    } else if (str(d.lost)) {
      places += 1;
      kg += d.weight || 0;
      parcels += 1;
    }
  });
  return { places, kg: Math.round(kg * 10) / 10, parcels };
}

/**
 * Початкові списки. Це саме підказки, а не обмеження: у полі можна
 * написати будь-що, і вже вписане одразу з'явиться в підказках наступного
 * разу. Новий водій чи нова точка не мають вимагати правок у коді.
 */
export const DRIVERS = ['Лотар', 'Джин', 'БПС'];
export const POINTS = ['Тигр', 'Рись', 'Білий'];

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

// порожня вага — це «не зважили», а не «нуль кілограмів»: Number('') дає 0,
// і на картці з'являлося «0 кг» там, де ваги просто не вписали
const num = (v) => {
  const s = str(v);
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function pad(row, len) {
  const r = [...(row || [])];
  while (r.length < len) r.push('');
  return r;
}

/** На якому етапі посилка: останній, у якого проставлена дата */
export function stageOf(r) {
  let cur = -1;
  STAGES.forEach((s, i) => { if (str(r[s.col])) cur = i; });
  return cur;
}

export function parseDeliveries(values) {
  if (!values || values.length < 2) return [];
  const out = [];
  values.slice(1).forEach((raw, i) => {
    const r = pad(raw, DELIVERY_HEADERS.length);
    if (r.join('').trim() === '') return;
    const at = stageOf(r);
    const d = {
      row: i + 2,
      created: str(r[DL.created]),
      what: str(r[DL.what]),
      weight: num(r[DL.weight]),
      driver: str(r[DL.driver]),
      point: str(r[DL.point]),
      giver: str(r[DL.giver]),
      taker: str(r[DL.taker]),
      pilot: str(r[DL.pilot]),
      note: str(r[DL.note]),
      to: str(r[DL.to]),
      parts: str(r[DL.parts]),
      partsDone: str(r[DL.partsDone]),
      lost: str(r[DL.lost]),
      partsLost: str(r[DL.partsLost]),
      prio: str(r[DL.prio]),
      partsHot: str(r[DL.partsHot]),
      at,
      stage: at >= 0 ? STAGES[at].key : 'new',
      dates: Object.fromEntries(STAGES.map((s) => [s.key, str(r[s.col])])),
      done: at === STAGES.length - 1,
    };
    d.isLost = isLost(d);
    // Посилка першочергова, доки в ній лишається хоч один першочерговий
    // мішок. Коли їх немає в переліку взагалі — це один мішок, і позначка
    // стоїть просто на посилці.
    const p = partsOf(d);
    d.urgent = p ? p.hotLeft > 0 : !!d.prio;
    d.hotLeft = p ? p.hotLeft : (d.prio && !d.done && !d.isLost ? 1 : 0);
    out.push(d);
  });
  return out;
}

/** Рядок листа з даних посилки */
export function deliveryRow(d, prev = []) {
  const r = pad(prev, DELIVERY_HEADERS.length);
  r[DL.created] = str(d.created) || str(r[DL.created]);
  r[DL.what] = str(d.what);
  r[DL.weight] = d.weight === '' || d.weight === null || d.weight === undefined
    ? '' : (num(d.weight) ?? '');
  r[DL.driver] = str(d.driver);
  r[DL.point] = str(d.point);
  r[DL.giver] = str(d.giver);
  r[DL.taker] = str(d.taker);
  r[DL.pilot] = str(d.pilot);
  r[DL.note] = str(d.note);
  r[DL.to] = str(d.to);
  r[DL.parts] = str(d.parts);
  r[DL.partsDone] = str(d.partsDone);
  r[DL.lost] = str(d.lost);
  r[DL.partsLost] = str(d.partsLost);
  // у листі пишемо словами, а не одиницею: таблицю читають очима
  r[DL.prio] = str(d.prio) ? PRIO_FIRST : '';
  r[DL.partsHot] = str(d.partsHot);
  STAGES.forEach((s) => { if (d.dates && s.key in d.dates) r[s.col] = str(d.dates[s.key]); });
  // списана посилка не «на етапі», вона знята з дороги — у таблиці, яку
  // читають очима, це має стояти в статусі, а не ховатись у крайній колонці
  r[DL.status] = isLost({ ...d, lost: r[DL.lost], partsLost: r[DL.partsLost] })
    ? 'Втрачено'
    : (STAGES[stageOf(r)]?.label || '');
  return r;
}

/** Київські дата й час — журнал і картки читають люди, не сервер */
export function stampKyiv() {
  const fmt = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = {};
  fmt.formatToParts(new Date()).forEach((x) => (p[x.type] = x.value));
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

/** Підказки для полів: спершу вписане раніше, потім початковий список */
export function suggestions(list, key, base) {
  const seen = [];
  // у полі могло стояти «Тигр, Рись» — у підказки йдуть окремі назви
  list.forEach((d) => splitPoints(d[key]).forEach((v) => { if (!seen.includes(v)) seen.push(v); }));
  base.forEach((v) => { if (!seen.includes(v)) seen.push(v); });
  return seen;
}

/** «16.08.2026 09:38» → мітка часу; лише дата теж годиться */
export function stampOf(v) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(str(v));
  if (!m) return 0;
  return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
}

/** Скільки діб посилка стоїть на своєму етапі */
export function daysAt(d, now = Date.now()) {
  if (d.at < 0) return 0;
  const t = stampOf(d.dates[STAGES[d.at].key]);
  if (!t) return 0;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

/**
 * Що застрягло.
 *
 * Логістику цікавить не список посилок, а список зупинок: доки коробка
 * рухається, до неї немає питань. Норматив у кожного етапу свій — зібране
 * має поїхати наступного дня, а дорога до точки й виліт можуть узяти двоє
 * діб.
 */
export function stuck(list, now = Date.now()) {
  return list
    .filter((d) => !d.done && !d.isLost && d.at >= 0)
    .map((d) => ({ ...d, days: daysAt(d, now), sla: STAGES[d.at].sla || 99 }))
    .filter((d) => d.days > d.sla)
    .sort((a, b) => b.days - a.days);
}

/** У кого зараз посилки: водій відповідає, доки не здав на точці призначення */
export function byDriver(list) {
  const m = new Map();
  list.filter((d) => !d.done && !d.isLost && d.driver).forEach((d) => {
    const cur = m.get(d.driver) || { name: d.driver, n: 0, kg: 0 };
    cur.n += 1;
    // у водія лишається те, що ще не поставлене, а не вся посилка
    cur.kg += weightLeft([d]);
    m.set(d.driver, cur);
  });
  return [...m.values()].sort((a, b) => b.n - a.n);
}

/**
 * Куди їдуть. Групуємо за отримувачем, а не за точкою: точка проставляється
 * аж при доставці, тож для всього, що зараз у дорозі, вона порожня — а саме
 * дорога й цікавить. Точка лишається запасним варіантом.
 */
export function byPoint(list) {
  const m = new Map();
  list.filter((d) => !d.done && !d.isLost).forEach((d) => {
    // посилка на дві точки рахується в обидві: питання «скільки їде на
    // Рись» не має відповіді «половина коробки»
    const keys = splitPoints(d.to).length ? splitPoints(d.to)
      : splitPoints(d.point).length ? splitPoints(d.point) : ['—'];
    const p = partsOf(d);
    keys.forEach((k) => {
      const cur = m.get(k) || { name: k, n: 0, kg: 0, places: 0 };
      cur.n += 1;
      // місць у дорозі більше, ніж посилок: одна «Вода, 3 шт» — це три
      // окремі приїзди, і саме їх рахує той, хто планує борт
      cur.places += p ? p.left.length : 1;
      cur.kg += weightLeft([d]);
      m.set(k, cur);
    });
  });
  return [...m.values()].sort((a, b) => b.places - a.places || b.n - a.n);
}

/** Доставлено за останні N діб */
export function deliveredWithin(list, days = 7, now = Date.now()) {
  const from = now - days * 86400000;
  return list.filter((d) => d.done && stampOf(d.dates.delivered) >= from);
}

/**
 * Скільки місць ще не доставлено. Рахуємо по самих місцях, а не по етапу
 * посилки: якщо в закритій колись посилці лишилось невідмічене місце, воно
 * має бути видно, а не зникнути разом зі штампом «доставлено».
 */
export function partsLeft(list) {
  let total = 0;
  let left = 0;
  list.forEach((d) => {
    const p = partsOf(d);
    if (!p || !p.left.length) return;
    total += p.total;
    left += p.left.length;
  });
  return { total, left };
}

/**
 * Місця, а не посилки.
 *
 * У дашборді «Вода позачергово» — одна картка, а на точці вильоту вона
 * розпадається на три каністри, і поїхати може одна. Питання «скільки ще
 * везти» має відповідь у місцях: посилками воно завжди «одна», хоч дві
 * третини вже там.
 *
 * Посилка без переліку рахується одним місцем — так само, як її і возять.
 */
export function placesOf(list) {
  let total = 0;
  let done = 0;
  let left = 0;
  let lost = 0;
  let split = 0;          // скільки посилок реально їдуть частинами
  list.forEach((d) => {
    const p = partsOf(d);
    if (p) {
      total += p.total;
      done += p.done;
      left += p.left.length;
      lost += p.lost;
      if (p.total > 1) split += 1;
    } else {
      total += 1;
      if (d.isLost) lost += 1;
      else if (d.done) done += 1;
      else left += 1;
    }
  });
  return { total, done, left, lost, split };
}

/**
 * Порядок у списку: спершу першочергове, далі те, що довше стоїть.
 *
 * Сортувати за датою створення сенсу мало — посилка, зібрана вчора, може
 * бути важливішою за тижневу. А от у межах однієї черговості довше
 * простояле має бути вище: саме воно ризикує загубитись.
 */
export function orderForRoad(list, now = Date.now()) {
  return [...list].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    // серед першочергових вище та, де таких мішків більше: борт бере
    // стільки, скільки підніме, і збирати його зручніше з однієї посилки
    if (a.urgent && a.hotLeft !== b.hotLeft) return b.hotLeft - a.hotLeft;
    return daysAt(b, now) - daysAt(a, now);
  });
}

/** Скільки мішків чекає найближчого борту — і скільки це кілограмів */
export function hotOf(list) {
  let places = 0;
  let kg = 0;
  list.filter((d) => !d.done && !d.isLost).forEach((d) => {
    const p = partsOf(d);
    if (p) { places += p.hotLeft; kg += p.kgHot; }
    else if (d.prio) { places += 1; kg += d.weight || 0; }
  });
  return { places, kg: Math.round(kg * 10) / 10 };
}

/**
 * Позначки місць після правки переліку — за назвами, не за номерами.
 *
 * Дописана на початку каністра зсуває всі номери, і галочка з третього
 * місця опинилась би на четвертому. Тому переносимо за назвою: те, що
 * лишилось у переліку, зберігає свою позначку, а зникле її втрачає.
 *
 * Саме це й дозволяє правити перелік уже після відправки — дописати
 * забутий мішок, не збивши те, що вже приїхало.
 */
export function remapMarks(wasLabels, marks, parts) {
  const kept = new Map();
  wasLabels.forEach((label, i) => { if (marks.has(i + 1)) kept.set(label, marks.get(i + 1)); });
  const next = new Map();
  splitParts(parts).forEach((label, i) => { if (kept.has(label)) next.set(i + 1, kept.get(label)); });
  return next;
}

/** Доставлені місця після правки переліку */
export function remapDone(cur, parts) {
  return joinDone(remapMarks(splitParts(cur.parts), parseDone(cur.partsDone), parts));
}

/** Списані місця — так само за назвами */
export function remapLost(cur, parts) {
  return joinDone(remapMarks(splitParts(cur.parts), parseDone(cur.partsLost), parts));
}

/** Першочергові: замість дати проста позначка */
export function remapHot(cur, parts) {
  const asMap = new Map([...parseHot(cur.partsHot)].map((n) => [n, '1']));
  return joinHot(new Set(remapMarks(splitParts(cur.parts), asMap, parts).keys()));
}

/** Скільки посилок на кожному етапі — для лічильників угорі */
export function byStage(list) {
  const out = STAGES.map((s) => ({ ...s, items: [] }));
  list.forEach((d) => { if (d.at >= 0) out[d.at].items.push(d); });
  return out;
}
