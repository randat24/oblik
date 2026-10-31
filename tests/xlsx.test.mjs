import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { readXlsx, unzip, colIndex, excelDate, xmlText } from '../lib/xlsx.js';

/*
 * Справжній файл реєстру в тести не кладемо: репозиторій відкритий, а там
 * серійні номери. Збираємо мінімальний .xlsx тут же — zip із кількох XML.
 */
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, comp);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, end]);
}

/** Книга з одним-двома аркушами; `rows` — XML рядків першого аркуша */
function book({ rows, shared = [], second = null }) {
  const sst = `<sst>${shared.map((s) => (s === null ? '<si/>' : `<si><t>${s}</t></si>`)).join('')}</sst>`;
  return zip({
    'xl/workbook.xml': `<workbook xmlns:r="r"><sheets><sheet name="робоча" sheetId="1" r:id="rId1"/>${second ? '<sheet name="Акт &amp; 1" sheetId="2" state="hidden" r:id="rId2"/>' : ''}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': sst,
    'xl/styles.xml': '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="#,##0.00\\ _₴"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows}</sheetData></worksheet>`,
    ...(second ? { 'xl/worksheets/sheet2.xml': `<worksheet><sheetData>${second}</sheetData></worksheet>` } : {}),
  });
}

test('xlsx: спільні рядки, числа й значення формул читаються як є', () => {
  const buf = book({
    shared: ['накладна', 'StarLink'],
    rows: '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>12345.6</v></c><c r="D1"><f>K1-L1</f><v>4</v></c><c r="E1" t="str"><f>A1</f><v>текст</v></c></row>',
  });
  const [s] = readXlsx(buf).sheets;
  assert.deepEqual(s.rows[0], ['накладна', '', 12345.6, 4, 'текст']);
});

test('xlsx: число зі стилем дати стає датою, а грошовий формат — ні', () => {
  const buf = book({ rows: '<row r="1"><c r="A1" s="1"><v>44885</v></c><c r="B1" s="3"><v>45082</v></c><c r="C1" s="2"><v>45082</v></c></row>' });
  const [s] = readXlsx(buf).sheets;
  assert.deepEqual(s.rows[0], ['2022-11-20', '2023-06-05', 45082]);
});

test('xlsx: порожній рядок <row/> не ковтає наступний', () => {
  const buf = book({ shared: ['перший', 'другий'], rows: '<row r="1"/><row r="2"><c r="B2" t="s"><v>0</v></c></row><row r="4"><c r="A4" t="s"><v>1</v></c></row>' });
  const [s] = readXlsx(buf).sheets;
  assert.deepEqual(s.rows[1], ['', 'перший']);
  assert.deepEqual(s.rows[3], ['другий']);
});

test('xlsx: порожній спільний рядок <si/> не зсуває наступні', () => {
  const buf = book({ shared: [null, 'після порожнього'], rows: '<row r="1"><c r="A1" t="s"><v>1</v></c></row>' });
  assert.equal(readXlsx(buf).sheets[0].rows[0][0], 'після порожнього');
});

test('xlsx: вбудований рядок і сутності XML розкодовуються', () => {
  const buf = book({ rows: '<row r="1"><c r="A1" t="inlineStr"><is><t>Виріб &quot;Либідь&quot; &amp; к-т</t></is></c></row>' });
  assert.equal(readXlsx(buf).sheets[0].rows[0][0], 'Виріб "Либідь" & к-т');
});

test('xlsx: другий аркуш з назвою й позначкою прихованого', () => {
  const buf = book({ rows: '<row r="1"><c r="A1"><v>1</v></c></row>', second: '<row r="1"><c r="A1"><v>2</v></c></row>' });
  const { sheets } = readXlsx(buf);
  assert.deepEqual(sheets.map((s) => [s.name, s.hidden]), [['робоча', false], ['Акт & 1', true]]);
  assert.equal(sheets[1].rows[0][0], 2);
});

test('xlsx: не zip — зрозуміла помилка, а не падіння', () => {
  assert.throws(() => readXlsx(Buffer.from('просто текст, а не таблиця')), /не файл Excel/);
});

test('zip: файли архіву розпаковуються з центрального каталогу', () => {
  const files = unzip(zip({ 'a.txt': 'привіт', 'b/c.xml': '<x/>' }));
  assert.equal(files['a.txt'].toString(), 'привіт');
  assert.equal(files['b/c.xml'].toString(), '<x/>');
});

test('колонка: літери в номер з нуля', () => {
  assert.equal(colIndex('A1'), 0);
  assert.equal(colIndex('Z9'), 25);
  assert.equal(colIndex('AB12'), 27);
});

test('дата Excel: число в «YYYY-MM-DD», нуль і текст — порожнє', () => {
  assert.equal(excelDate(44885), '2022-11-20');
  assert.equal(excelDate(0), null);
  assert.equal(excelDate('abc'), null);
});

test('сутності: числові й шістнадцяткові коди', () => {
  assert.equal(xmlText('&#1041;&#x0434; &lt;b&gt;'), 'Бд <b>');
});
