// Розширення в імпортах сусідів стоїть навмисно: файл покритий тестами, а
// вбудований у Node запускач шукає модуль рівно за тим шляхом, який написали.

/**
 * Читання .xlsx без сторонніх бібліотек.
 *
 * Реєстр звʼязку прийшов файлом Excel, а не Google Таблицею. Тягнути заради
 * одного імпорту бібліотеку на сотні кілобайтів, з власними вразливостями,
 * немає сенсу: .xlsx — це zip із кількома XML, і все, що нам треба з нього, —
 * значення клітинок. Формули не обчислюємо: Excel зберігає поряд із формулою
 * її останнє значення, його й беремо.
 *
 * Лише серверний код: `zlib` є тільки в Node.
 */

import zlib from 'node:zlib';

/* ---------- zip ---------- */

const MAX_TOTAL = 60 * 1024 * 1024; // скільки всього можна розпакувати: захист від zip-бомби
const MAX_ENTRIES = 2000;

/** Файли архіву: імʼя → вміст (Buffer). Читаємо центральний каталог, а не локальні заголовки. */
export function unzip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('Це не файл Excel (.xlsx)');
  // кінець центрального каталогу шукаємо з хвоста: після нього може бути коментар
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Це не файл Excel (.xlsx)');
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES) throw new Error('Файл має забагато частин');

  const files = {};
  let total = 0;
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('Файл Excel пошкоджено');
    const method = buf.readUInt16LE(at + 10);
    const compSize = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;

    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('Файл Excel пошкоджено');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + compSize);
    total += size;
    if (total > MAX_TOTAL) throw new Error('Файл завеликий для імпорту');
    if (method === 0) files[name] = Buffer.from(raw);
    else if (method === 8) files[name] = zlib.inflateRawSync(raw, { maxOutputLength: MAX_TOTAL });
    // інші способи стиснення Excel не використовує — такі частини просто пропускаємо
  }
  return files;
}

/* ---------- XML ---------- */

/** Розкодувати сутності XML: &amp; &lt; &#1234; &#x4E2D; */
export function xmlText(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? xmlText(m[1]) : null;
};

/** Текст рядка: прості <t> і «багаті» прогони <r><t>, без фонетичних підказок <rPh> */
function stringOf(xml) {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(clean))) out += xmlText(m[1] || '');
  return out;
}

/** «AB12» → 27 (номер колонки з нуля) */
export function colIndex(ref) {
  const letters = String(ref || '').match(/^[A-Z]+/i);
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters[0].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Чи формат числа означає дату: вбудовані 14–22, 45–47, або власний із д/м/р */
function dateFormats(stylesXml) {
  const custom = {};
  const nf = /<numFmt\b([^>]*)\/?>/g;
  let m;
  while ((m = nf.exec(stylesXml || ''))) {
    const id = Number(attr(m[1], 'numFmtId'));
    const code = (attr(m[1], 'formatCode') || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    custom[id] = /[dmy]/i.test(code) && !/[#0]/.test(code.replace(/[dmy]+/gi, ''));
  }
  const xfs = ((stylesXml || '').match(/<cellXfs\b[\s\S]*?<\/cellXfs>/) || [''])[0];
  const out = [];
  const xf = /<xf\b([^>]*)\/?>/g;
  while ((m = xf.exec(xfs))) {
    const id = Number(attr(m[1], 'numFmtId') || 0);
    out.push((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || !!custom[id]);
  }
  return out;
}

/** Число дати Excel → «YYYY-MM-DD» (система 1900, з її вигаданим 29.02.1900) */
export function excelDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 1) return null;
  const ms = Math.round((n - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Книга Excel → аркуші з двовимірними масивами значень.
 *
 * Значення: рядок, число або дата у вигляді «YYYY-MM-DD». Порожні клітинки —
 * порожній рядок. Приховані аркуші теж повертаються, з позначкою.
 */
export function readXlsx(buf) {
  const files = unzip(buf);
  const text = (name) => (files[name] ? files[name].toString('utf8') : '');
  const wb = text('xl/workbook.xml');
  if (!wb) throw new Error('У файлі немає книги Excel');

  const rels = {};
  const relRe = /<Relationship\b([^>]*)\/?>/g;
  let m;
  while ((m = relRe.exec(text('xl/_rels/workbook.xml.rels')))) {
    const target = attr(m[1], 'Target') || '';
    rels[attr(m[1], 'Id')] = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }

  const shared = [];
  const siRe = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g;
  while ((m = siRe.exec(text('xl/sharedStrings.xml')))) shared.push(stringOf(m[1] || ''));

  const isDate = dateFormats(text('xl/styles.xml'));

  const sheets = [];
  const shRe = /<sheet\b([^>]*)\/?>/g;
  while ((m = shRe.exec(wb))) {
    const name = attr(m[1], 'name') || '';
    const path = rels[attr(m[1], 'r:id')];
    const xml = text(path);
    sheets.push({ name, hidden: /^(hidden|veryHidden)$/.test(attr(m[1], 'state') || ''), rows: xml ? cellsOf(xml, shared, isDate) : [] });
  }
  return { sheets };
}

function cellsOf(xml, shared, isDate) {
  const rows = [];
  // порожній рядок буває записаний як <row …/>: без лінивого збігу він
  // проковтнув би наступний рядок разом із його клітинками
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm;
  let next = 0;
  while ((rm = rowRe.exec(xml))) {
    const r = Number(attr(rm[1], 'r')) - 1;
    const idx = Number.isFinite(r) && r >= 0 ? r : next;
    next = idx + 1;
    const row = [];
    const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    let col = 0;
    while ((cm = cRe.exec(rm[2] || ''))) {
      const a = cm[1];
      const ref = attr(a, 'r');
      const c = ref ? colIndex(ref) : col;
      col = c + 1;
      const body = cm[2] || '';
      const t = attr(a, 't');
      const vm = body.match(/<v>([\s\S]*?)<\/v>/);
      const v = vm ? xmlText(vm[1]) : '';
      let val = '';
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = stringOf(body);
      else if (t === 'str' || t === 'e') val = v;
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== '') {
        const n = Number(v);
        const s = Number(attr(a, 's') || 0);
        val = Number.isFinite(n) ? (isDate[s] ? excelDate(n) || n : n) : v;
      }
      while (row.length < c) row.push('');
      row[c] = val;
    }
    while (rows.length < idx) rows.push([]);
    rows[idx] = row;
  }
  return rows;
}
