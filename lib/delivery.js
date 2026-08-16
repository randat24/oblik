/**
 * Доставки — шлях посилки від збирання до точки призначення.
 *
 * Етапів чотири, і вони йдуть строго по черзі: зібрали, віддали водієві,
 * водій довіз до своєї точки вильоту, звідти доставили адресатові. Кожен
 * етап має свою дату й того, хто його зробив, — саме цього бракує, коли
 * посилка «десь у дорозі», а згадати, у кого вона, вже нікому.
 */

export const DELIVERY_SHEET = 'Доставки';

export const DELIVERY_HEADERS = [
  'Створено', 'Вміст', 'Вага, кг', 'Статус',
  'Водій', 'Точка', 'Хто здав', 'Хто прийняв',
  'Зібрано', 'Передано водію', 'На точці вильоту', 'Доставлено',
  'Примітка', 'Кому',
];

export const DL = {
  created: 0, what: 1, weight: 2, status: 3,
  driver: 4, point: 5, giver: 6, taker: 7,
  packed: 8, handed: 9, atbase: 10, delivered: 11,
  note: 12, to: 13,
};

/**
 * Етапи. Порядок — це і є маршрут; наступний крок завжди один, тож на
 * картці стоїть одна кнопка, а не список із чотирьох станів, серед яких
 * треба обрати правильний.
 */
export const STAGES = [
  {
    key: 'packed', col: DL.packed,
    label: 'Зібрано', action: 'Зібрано',
    hint: 'Посилка складена, вага відома.',
  },
  {
    key: 'handed', col: DL.handed,
    label: 'Передали', action: 'Передати водієві',
    hint: 'Поїхала з нашого боку — далі за неї відповідає водій.',
    needs: ['driver'],
  },
  {
    key: 'atbase', col: DL.atbase,
    label: 'На точці вильоту', action: 'Прийнято на точці',
    hint: 'Водій довіз до своєї точки, звідки йде виліт.',
  },
  {
    key: 'delivered', col: DL.delivered,
    label: 'Доставлено', action: 'Доставлено',
    hint: 'Дійшла до адресата.',
    needs: ['point', 'taker'],
  },
];

export const stageAt = (key) => STAGES.findIndex((s) => s.key === key);

/**
 * Початкові списки. Це саме підказки, а не обмеження: у полі можна
 * написати будь-що, і вже вписане одразу з'явиться в підказках наступного
 * разу. Новий водій чи нова точка не мають вимагати правок у коді.
 */
export const DRIVERS = ['Лотар', 'Джин', 'БПС'];
export const POINTS = ['Тигр', 'Рись', 'Білий'];

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

const num = (v) => {
  const n = Number(str(v).replace(',', '.'));
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
    out.push({
      row: i + 2,
      created: str(r[DL.created]),
      what: str(r[DL.what]),
      weight: num(r[DL.weight]),
      driver: str(r[DL.driver]),
      point: str(r[DL.point]),
      giver: str(r[DL.giver]),
      taker: str(r[DL.taker]),
      note: str(r[DL.note]),
      to: str(r[DL.to]),
      at,
      stage: at >= 0 ? STAGES[at].key : 'new',
      dates: Object.fromEntries(STAGES.map((s) => [s.key, str(r[s.col])])),
      done: at === STAGES.length - 1,
    });
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
  r[DL.note] = str(d.note);
  r[DL.to] = str(d.to);
  STAGES.forEach((s) => { if (d.dates && s.key in d.dates) r[s.col] = str(d.dates[s.key]); });
  r[DL.status] = STAGES[stageOf(r)]?.label || '';
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
  list.forEach((d) => { const v = d[key]; if (v && !seen.includes(v)) seen.push(v); });
  base.forEach((v) => { if (!seen.includes(v)) seen.push(v); });
  return seen;
}

/** Скільки посилок на кожному етапі — для лічильників угорі */
export function byStage(list) {
  const out = STAGES.map((s) => ({ ...s, items: [] }));
  list.forEach((d) => { if (d.at >= 0) out[d.at].items.push(d); });
  return out;
}
