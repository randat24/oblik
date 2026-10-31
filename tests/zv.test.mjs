import test from 'node:test';
import assert from 'node:assert/strict';
import {
  int, dmy, normCat, parseCountCat, serialsOf, withoutSerials, posOf, posRow, withCounts, fold, matches,
  stateOf, placesOf, totals, applyMove, makeAct, mergeSame, retitle, parseNorm, suggestKeys, keyMatches,
  normStatus, importRegister, importAct, importNorms, importWorkbook, countCat, ZV_HEADERS, sheetCsv, actTable,
} from '../lib/zv.js';

/*
 * Дані тут вигадані: справжній реєстр має серійні номери військового майна,
 * а репозиторій відкритий.
 */
const pos = (over = {}) => withCounts({
  row: 2, id: 'zv1', no: '1', invoice: '2024/со/1', invoiceDate: '02.04.2024', price: 100000,
  name: 'Радіостанція Тест R1', post: '', unit: 'шт', cat: 'ІІ',
  received: 5, writtenOff: 0, submitted: 0, wrongCat: 0,
  serials: 'AA1001 / AA1002 / AA1003 / AA1004 / AA1005', serialsOnHand: 'AA1001 / AA1002 / AA1003 / AA1004 / AA1005',
  place: 'КСП', note: '', added: '', updated: '',
  ...over,
});

/* ---------- Числа й категорії ---------- */

test('рахується = отримано − списано, наявність = рахується − подано, нестача = подано', () => {
  const p = pos({ received: 5, writtenOff: 1, submitted: 3 });
  assert.equal(p.counted, 4);
  assert.equal(p.onHand, 1);
  assert.equal(p.shortage, 3);
});

test('вартість на обліку — ціна за одиницю на кількість, що рахується', () => {
  assert.equal(pos({ price: 150000, received: 4, writtenOff: 1 }).value, 450000);
});

test('ціле число з клітинки: «5.0», «5,0» і сміття', () => {
  assert.equal(int('5.0'), 5);
  assert.equal(int('5,0'), 5);
  assert.equal(int(''), 0);
  assert.equal(int('abc'), 0);
});

test('дата: ISO стає звичною, решта тексту — як є', () => {
  assert.equal(dmy('2024-04-02'), '02.04.2024');
  assert.equal(dmy('12.09.2023 / 13.10.2023'), '12.09.2023 / 13.10.2023');
});

test('категорія: латинські й кириличні «II» — одне й те саме', () => {
  assert.equal(normCat('II'), 'ІІ');
  assert.equal(normCat('ІІ'), 'ІІ');
  assert.equal(normCat('I'), 'І');
  assert.equal(normCat('прид'), 'прид');
});

test('«рахується / кат.» розбирається на число й категорію', () => {
  assert.deepEqual(parseCountCat('5/II'), { qty: 5, cat: 'ІІ' });
  assert.deepEqual(parseCountCat('1/прид'), { qty: 1, cat: 'прид' });
  assert.deepEqual(parseCountCat('4/'), { qty: 4, cat: '' });
});

test('«рахується / кат.» для документа збирається з чисел позиції', () => {
  assert.equal(countCat(pos({ received: 5, writtenOff: 1 })), '4/ІІ');
});

/* ---------- Серійники ---------- */

test('серійники: кома, крапка з комою, « / », перенос і пробіл — розділювачі', () => {
  assert.deepEqual(serialsOf('AB1234, CD5678; EF9012 / GH3456\nJK7890 LM1234'),
    ['AB1234', 'CD5678', 'EF9012', 'GH3456', 'JK7890', 'LM1234']);
});

test('серійники: похила риска всередині номера його не розриває', () => {
  assert.deepEqual(serialsOf('F00B0F00CC00/217/r2'), ['F00B0F00CC00/217/r2']);
});

test('серійники: шматки без цифри («+ sim-карта») номером не вважаються', () => {
  assert.deepEqual(serialsOf('HGS0000 /  + sim-карта'), ['HGS0000']);
});

test('прибрати серійники: решта лишається через « / »', () => {
  assert.equal(withoutSerials('AA1001 / AA1002 / AA1003', ['AA1002']), 'AA1001 / AA1003');
});

/* ---------- Рядок листа ---------- */

test('позиція → рядок → позиція не губить жодного поля', () => {
  const p = pos({ writtenOff: 1, submitted: 2, note: 'AA1001 - наказ №1' });
  const back = posOf(posRow(p), 2);
  ['id', 'invoice', 'price', 'name', 'cat', 'received', 'writtenOff', 'submitted', 'serials', 'serialsOnHand', 'place', 'note']
    .forEach((k) => assert.deepEqual(back[k], p[k], k));
  assert.equal(posRow(p).length, ZV_HEADERS.length);
});

/* ---------- Пошук і фільтри ---------- */

test('пошук: кирилична «А» в серійнику знаходиться латинською', () => {
  const p = pos({ serials: 'А14438' }); // кирилична А
  assert.equal(matches(p, 'a14438'), true);
  assert.equal(fold('Кабель'), fold('Kaбeль'));
});

test('пошук: кілька слів — усі мають бути, в будь-яких полях', () => {
  const p = pos({ place: 'РЕР' });
  assert.equal(matches(p, 'тест рер'), true);
  assert.equal(matches(p, 'тест бпла'), false);
});

test('стан: усе є, частина втрачена, усе втрачено, списано повністю', () => {
  assert.equal(stateOf(pos()), 'ok');
  assert.equal(stateOf(pos({ submitted: 2 })), 'partial');
  assert.equal(stateOf(pos({ submitted: 5 })), 'lost');
  assert.equal(stateOf(pos({ writtenOff: 5 })), 'gone');
});

test('підрозділи: «РЕР, КСП(віраж)» — це два місця, дужки не рахуються', () => {
  assert.deepEqual(placesOf([pos({ place: 'РЕР, КСП(віраж)' }), pos({ place: 'КСП' })]), ['КСП', 'РЕР']);
});

test('підсумки: від’ємні числа (помилка в таблиці) не зменшують загальне', () => {
  const t = totals([pos(), pos({ received: 0, writtenOff: 1 })]);
  assert.equal(t.positions, 2);
  assert.equal(t.counted, 5);
});

/* ---------- Рух ---------- */

test('списання: лічильник росте, серійник іде з наявних, у примітці — наказ', () => {
  const { pos: p } = applyMove(pos(), { kind: 'writeoff', qty: 1, doc: 'наказ №10', serials: ['AA1002'] });
  assert.equal(p.writtenOff, 1);
  assert.equal(p.counted, 4);
  assert.equal(p.onHand, 4);
  assert.equal(p.serialsOnHand.includes('AA1002'), false);
  assert.match(p.note, /AA1002 - наказ №10/);
});

test('ПБД: подано росте, тож наявність падає, а рахується — ні', () => {
  const { pos: p } = applyMove(pos(), { kind: 'pbd', qty: 2, doc: 'ПБД №5 01.01.26' });
  assert.equal(p.submitted, 2);
  assert.equal(p.counted, 5);
  assert.equal(p.onHand, 3);
  assert.match(p.note, /2 од\. - ПБД №5/);
});

test('списати більше, ніж є в наявності, не можна', () => {
  const { error } = applyMove(pos({ submitted: 4 }), { kind: 'writeoff', qty: 2, doc: 'наказ №1' });
  assert.match(error, /лише 1/);
});

test('без номера наказу чи ПБД запис не проходить', () => {
  assert.match(applyMove(pos(), { kind: 'pbd', qty: 1, doc: '' }).error, /ПБД/);
  assert.match(applyMove(pos(), { kind: 'writeoff', qty: 1, doc: ' ' }).error, /наказу/);
});

test('серійник, якого немає в наявності, не списується', () => {
  const { error } = applyMove(pos(), { kind: 'writeoff', qty: 1, doc: 'наказ №1', serials: ['ZZ9999'] });
  assert.match(error, /ZZ9999/);
});

test('серійників більше, ніж кількість, — помилка, а не мовчазне ігнорування', () => {
  const { error } = applyMove(pos(), { kind: 'writeoff', qty: 1, doc: 'наказ №1', serials: ['AA1001', 'AA1002'] });
  assert.match(error, /більше/);
});

test('надходження: отримано росте, нові серійники додаються в обидва списки', () => {
  const { pos: p } = applyMove(pos(), { kind: 'receive', qty: 1, serials: ['AA1006'] });
  assert.equal(p.received, 6);
  assert.match(p.serials, /AA1006$/);
  assert.match(p.serialsOnHand, /AA1006$/);
});

test('переміщення міняє лише підрозділ', () => {
  const { pos: p } = applyMove(pos(), { kind: 'relocate', place: 'РЕР' });
  assert.equal(p.place, 'РЕР');
  assert.equal(p.onHand, 5);
});

test('невідома дія — помилка', () => {
  assert.match(applyMove(pos(), { kind: 'steal' }).error, /Невідома/);
});

/* ---------- Акти ---------- */

test('акт: лише те, що рахується, з наскрізною нумерацією', () => {
  const act = makeAct([pos(), pos({ name: 'Списане', writtenOff: 5 }), pos({ name: 'Третє' })]);
  assert.deepEqual(act.map((a) => [a.no, a.name]), [[1, 'Радіостанція Тест R1'], [2, 'Третє']]);
});

test('акт: при нестачі примітка починається з «Втрачено:»', () => {
  const [a] = makeAct([pos({ submitted: 1, note: 'AA1001 - ПБД №1' })]);
  assert.equal(a.note, 'Втрачено:\nAA1001 - ПБД №1');
  assert.equal(a.shortage, 1);
});

test('акт з обʼєднанням: однакова назва, одиниця й категорія — один рядок із сумою', () => {
  const rows = mergeSame([pos({ received: 2 }), pos({ received: 3, submitted: 1 }), pos({ received: 1, cat: 'прид' })]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].counted, 5);
  assert.equal(rows[0].shortage, 1);
});

test('заголовок нового акта: дата міняється на нову', () => {
  assert.equal(retitle('Наявність … станом на 07.08.2026', '2026-11-01'), 'Наявність … станом на 01.11.2026');
});

/* ---------- Штат ---------- */

test('штат: «… - 10 шт» розбирається на назву й кількість', () => {
  assert.deepEqual(parseNorm('Портативні радіостанції DP4800 - 10 шт '), { name: 'Портативні радіостанції DP4800', qty: 10 });
});

test('ключ штату: перший код моделі, а не коди складових з опису', () => {
  assert.equal(suggestKeys('ЛИБІДЬ К-2РБ (радіостанції DM4600 на броньований об’єкт)'), 'К-2РБ');
  assert.equal(suggestKeys('Переносні станції супутникового зв’язку, вироби ПССЗ'), 'ПССЗ');
});

test('ключі: будь-який ключ через «;», а всі слова ключа мають бути в назві', () => {
  assert.equal(keyMatches(pos({ name: 'Рація Motorola DP4400e' }), 'dp4800; motorola dp4400'), true);
  assert.equal(keyMatches(pos({ name: 'Рація Motorola DP4400e' }), 'motorola r7'), false);
});

test('штат: скільки бракує рахується від наявності, а не від обліку', () => {
  const st = normStatus({ qty: 10, keys: 'R1' }, [pos({ submitted: 2 })]);
  assert.equal(st.onHand, 3);
  assert.equal(st.counted, 5);
  assert.equal(st.lack, 7);
});

/* ---------- Імпорт ---------- */

/* Шапка як у справжньому файлі: два рядки, «№» повторюється */
const HEAD = [
  ['накладна', '', '', '', '', '', '', '', '', '', '', '', '', 'Наявність'],
  ['№', 'дата', 'вартість\nза од.', '№', 'Найменування', 'Посада', 'Од. вим.', 'Рахується / кат.', 'рахується', '№',
    'отримано', 'списано', 'подано', 'к-сть', '№', 'Нестача', 'Не відп. кат.', 'Примітка', 'підрозділ'],
];
const line = (o) => [o.inv, o.date, o.price, o.no, o.name, '', o.unit, o.cc, o.counted, o.ser,
  o.rec, o.off ?? '', o.sub ?? '', o.have, o.serHave ?? '', o.sub ?? '', 0, o.note ?? '', o.place ?? ''];

test('імпорт реєстру: колонки знаходяться за назвами, «№» розрізняються за сусідами', () => {
  const rows = [...HEAD,
    line({ inv: '2024/со/7', date: '2024-04-02', price: 3758.21, no: 1, name: 'Планшет Тест', unit: 'шт', cc: '2/прид', counted: 2, ser: 'XX01; XX02', rec: 2, have: 2, serHave: 'XX01 / XX02', place: 'РЕР' }),
    ['', '', '', 2, '', '', '', '', 0, '', '', '', '', 0], // порожній шаблонний рядок
  ];
  const { positions, issues } = importRegister(rows);
  assert.equal(positions.length, 1);
  const [p] = positions;
  assert.equal(p.invoice, '2024/со/7');
  assert.equal(p.invoiceDate, '02.04.2024');
  assert.equal(p.price, 375821);
  assert.equal(p.serials, 'XX01; XX02');
  assert.equal(p.serialsOnHand, 'XX01 / XX02');
  assert.equal(p.cat, 'прид');
  assert.equal(p.place, 'РЕР');
  assert.deepEqual(issues, []);
});

test('імпорт реєстру: якщо формули файлу кажуть інше, це видно в зауваженнях', () => {
  const rows = [...HEAD, line({ inv: 'x', date: '', price: 1, no: 1, name: 'Річ', unit: 'шт', cc: '3/', counted: 3, ser: '', rec: 3, sub: 1, have: 1 })];
  const { issues } = importRegister(rows);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /наявність 1, а виходить 2/);
});

test('імпорт акта: шапка, заголовок із датою, рядки й підписи окремо', () => {
  const rows = [
    ['', '', '', '', '', '', '', '', '', 'Командиру військової частини'],
    ['', '', '', '', '', '', '', '', '', 'Додаток №1'],
    ['Наявність та якісний стан засобів звʼязку станом на 07.08.2026'],
    ['№', 'Найменування', 'Посада', 'Од. вим.', 'Рахується / кат.', 'з/с №', 'Наявність', 'Нестача', 'Не відп. кат.', 'Примітка'],
    [1, 'Річ перша', '', 'шт', '1/прид', 'S1', 1, 0, 0, ''],
    [2, 'Річ друга', '', 'к-т', '2/ІІ', '', 1, 1, 0, 'Втрачено'],
    [],
    ['Голова комісії: Тест'],
  ];
  const a = importAct('Акт 07.08.2026', rows);
  assert.equal(a.date, '07.08.2026');
  assert.match(a.head, /Командиру/);
  assert.match(a.title, /станом на 07\.08\.2026/);
  assert.equal(a.items.length, 2);
  assert.equal(a.items[1].shortage, 1);
  assert.match(a.footer, /Голова комісії/);
});

test('імпорт штату: рядки «… - N шт» з підказаними ключами', () => {
  const norms = importNorms([['', 'Портативні радіостанції “MOTOROLA” DP4800 - 10 шт'], ['', 'щось без кількості']]);
  assert.deepEqual(norms, [{ name: 'Портативні радіостанції “MOTOROLA” DP4800', qty: 10, keys: 'DP4800', note: '' }]);
});

test('імпорт книги: реєстр, акти й штат знаходяться за назвами аркушів', () => {
  const sheets = [
    { name: 'по штату', rows: [['', 'Контейнери КТ-5.1 - 1 шт']] },
    { name: 'робоча', rows: [...HEAD, line({ inv: 'i', date: '', price: 1, no: 1, name: 'Річ', unit: 'шт', cc: '1/', counted: 1, ser: '', rec: 1, have: 1 })] },
    { name: 'Акт 01.01.2026', rows: [['№', 'Найменування', 'Наявність'], [1, 'Річ', 1]] },
  ];
  const r = importWorkbook(sheets);
  assert.equal(r.positions.length, 1);
  assert.equal(r.acts.length, 1);
  assert.equal(r.norms.length, 1);
  assert.equal(r.sheet, 'робоча');
});

test('CSV: крапка з комою, BOM, лапки навколо тексту з роздільником', () => {
  const s = sheetCsv([['a;b', 'він сказав "так"', 5]]);
  assert.equal(s, '﻿"a;b";"він сказав ""так""";5');
});

test('CSV: клітинка з «=» не стає формулою в Excel', () => {
  assert.equal(sheetCsv([['=HYPERLINK("x")', '-5', '@a']]), `\uFEFF"'=HYPERLINK(""x"")";'-5;'@a`);
});

test('акт у таблицю: шапка, заголовок, рядки й підписи в порядку документа', () => {
  const t = actTable({ head: 'ЗАТВЕРДЖУЮ', title: 'станом на 01.01.2026', footer: 'Підпис', items: [{ no: 1, name: 'Рація', post: '', unit: 'шт', countCat: '2/ІІ', serials: 'SN1001', onHand: 2, shortage: 0, wrongCat: 0, note: '' }] });
  assert.deepEqual(t.map((r) => r[0]), ['ЗАТВЕРДЖУЮ', 'станом на 01.01.2026', '№', 1, 'Підпис']);
  assert.equal(t[3][6], 2);
});

test('CSV: відʼємне число лишається числом, без апострофа', () => {
  assert.equal(sheetCsv([[-5, '5']]), '\uFEFF-5;5');
});
