import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePart, partLabel, splitParts, joinParts, splitPoints,
  parseDone, joinDone, parseHot, joinHot,
  partsOf, weightOf, weightLeft, allPartsDone, isLost,
  lostOf, placesOf, hotOf, partsLeft,
  stampOf, daysAt, stuck, orderForRoad,
  byDriver, byPoint, deliveredWithin, byStage,
  parseDeliveries, deliveryRow, stageOf, suggestions,
  remapMarks, remapDone, remapLost, remapHot,
  DELIVERY_HEADERS, DL, STAGES, PRIO_FIRST, DRIVERS,
} from '../lib/delivery.js';
import { row, sheet, NOW } from './helpers.mjs';

/* ── розбір окремого місця ─────────────────────────────────────────────── */

test('parsePart: вага після «=», кома як роздільник дробу', () => {
  assert.deepEqual(parsePart('Вода 7,7 л = 7.7'), { name: 'Вода 7,7 л', kg: 7.7 });
  assert.deepEqual(parsePart('Їжа = 3,5'), { name: 'Їжа', kg: 3.5 });
});

test('parsePart: без ваги — просто назва', () => {
  assert.deepEqual(parsePart('Їжа'), { name: 'Їжа', kg: null });
  assert.deepEqual(parsePart(''), { name: '', kg: null });
  assert.deepEqual(parsePart(null), { name: '', kg: null });
});

test('parsePart: «=» без числа лишається частиною назви', () => {
  assert.deepEqual(parsePart('Набір = великий'), { name: 'Набір = великий', kg: null });
});

test('parsePart: рахує останнє «=», а не перше', () => {
  assert.deepEqual(parsePart('А = Б = 5'), { name: 'А = Б', kg: 5 });
});

test('partLabel: зворотний бік parsePart', () => {
  assert.equal(partLabel('Вода', 7.7), 'Вода = 7.7');
  assert.equal(partLabel('Їжа', null), 'Їжа');
  assert.equal(partLabel('Їжа', ''), 'Їжа');
  assert.deepEqual(parsePart(partLabel('Вода 7,7 л', 7.7)), { name: 'Вода 7,7 л', kg: 7.7 });
});

/* ── списки в одній клітинці ───────────────────────────────────────────── */

test('splitParts: крапка з комою, бо в назвах бувають коми', () => {
  assert.deepEqual(splitParts('Вода 7,7 л; Їжа; Батареї'), ['Вода 7,7 л', 'Їжа', 'Батареї']);
  assert.deepEqual(splitParts('  Вода ;; Їжа  '), ['Вода', 'Їжа']);
  assert.deepEqual(splitParts(''), []);
});

test('splitPoints: точки через кому', () => {
  assert.deepEqual(splitPoints('Тигр, Рись'), ['Тигр', 'Рись']);
  assert.deepEqual(splitPoints(''), []);
});

test('joinParts прибирає порожнє й пробіли', () => {
  assert.equal(joinParts([' Вода ', '', 'Їжа']), 'Вода; Їжа');
});

test('parseDone: номер із датою і без неї', () => {
  const m = parseDone('1=16.08.2026 09:12; 3');
  assert.equal(m.get(1), '16.08.2026 09:12');
  assert.equal(m.get(3), '');
  assert.equal(m.has(2), false);
});

test('parseDone: сміття не стає номером місця', () => {
  const m = parseDone('0; -2; абв; 2=вчора');
  assert.deepEqual([...m.keys()], [2]);
});

test('joinDone: сортує за номером і зберігає дати', () => {
  assert.equal(joinDone(new Map([[3, ''], [1, '16.08.2026']])), '1=16.08.2026; 3');
});

test('parseHot приймає і крапку з комою, і кому', () => {
  assert.deepEqual([...parseHot('1; 3')], [1, 3]);
  assert.deepEqual([...parseHot('2,4')], [2, 4]);
  assert.equal(joinHot(new Set([3, 1])), '1; 3');
});

/* ── підсумок по місцях ────────────────────────────────────────────────── */

const parcel = (f) => parseDeliveries(sheet(f))[0];

test('partsOf: без переліку — null, посилка рахується цілим', () => {
  assert.equal(partsOf({ parts: '' }), null);
});

test('partsOf: рахує всього, доставлено, лишилось', () => {
  const p = partsOf({ parts: 'Вода = 7.7; Їжа = 3; Батареї = 1.3', partsDone: '1=16.08.2026' });
  assert.equal(p.total, 3);
  assert.equal(p.done, 1);
  assert.deepEqual(p.left, ['Їжа', 'Батареї']);
  assert.equal(p.kg, 12);
  assert.equal(p.kgDone, 7.7);
  assert.equal(p.kgLeft, 4.3);
  assert.equal(p.weighed, true);
});

test('partsOf: втрата важливіша за доставку, якщо стоять обидві позначки', () => {
  const p = partsOf({ parts: 'А; Б', partsDone: '1=16.08.2026', partsLost: '1=17.08.2026 · Знищено' });
  assert.equal(p.items[0].lost, true);
  assert.equal(p.items[0].done, false);
  assert.equal(p.items[0].at, '17.08.2026 · Знищено');
  assert.equal(p.done, 0);
  assert.equal(p.lost, 1);
  // втрачене не висить у «лишилось»: воно вже не поїде
  assert.deepEqual(p.left, ['Б']);
});

test('partsOf: першочерговість рахується лише серед того, що ще їде', () => {
  const p = partsOf({ parts: 'А; Б; В', partsHot: '1; 2', partsDone: '1' });
  assert.equal(p.hot, 2);        // позначено два
  assert.equal(p.hotLeft, 1);    // але один уже прилетів
  assert.deepEqual(p.hotNames, ['Б']);
});

test('partsOf: kgHot — вага саме тих мішків, що чекають борту', () => {
  const p = partsOf({ parts: 'А = 10; Б = 2.5; В = 1', partsHot: '2; 3' });
  assert.equal(p.kgHot, 3.5);
});

test('partsOf: жодної ваги — weighed false', () => {
  const p = partsOf({ parts: 'Вода; Їжа' });
  assert.equal(p.weighed, false);
  assert.equal(p.kg, 0);
});

test('allPartsDone: закривається лише коли по кожному місцю є відповідь', () => {
  assert.equal(allPartsDone({ parts: 'А; Б', partsDone: '1' }), false);
  assert.equal(allPartsDone({ parts: 'А; Б', partsDone: '1; 2' }), true);
  // списане теж є відповіддю
  assert.equal(allPartsDone({ parts: 'А; Б', partsDone: '1', partsLost: '2' }), true);
  // посилка без переліку закрита завжди
  assert.equal(allPartsDone({ parts: '' }), true);
});

/* ── втрати ────────────────────────────────────────────────────────────── */

test('isLost: позначка на всій посилці', () => {
  assert.equal(isLost({ lost: '17.08.2026 · Знищено' }), true);
  assert.equal(isLost({ lost: '' }), false);
});

test('isLost: усі місця списані — списана й посилка', () => {
  assert.equal(isLost({ parts: 'А; Б', partsLost: '1; 2' }), true);
  assert.equal(isLost({ parts: 'А; Б', partsLost: '1' }), false);
});

test('lostOf: рахує місця, кілограми й посилки окремо', () => {
  const list = parseDeliveries(sheet(
    { what: 'Партія', parts: 'А = 5; Б = 3; В = 2', partsLost: '2' },
    { what: 'Ящик', weight: '12', lost: '17.08.2026 · Знищено' },
    { what: 'Ціла', parts: 'Г = 1; Д = 1', partsLost: '1; 2' },
  ));
  const l = lostOf(list);
  assert.equal(l.places, 4);    // 1 + 1 + 2
  assert.equal(l.kg, 17);       // 3 + 12 + 2
  assert.equal(l.parcels, 2);   // ящик і «Ціла»
});

/* ── місця замість посилок ─────────────────────────────────────────────── */

test('placesOf: посилка з трьох місць — це три місця, а не одне', () => {
  const list = parseDeliveries(sheet(
    { what: 'Вода', parts: 'А; Б; В', partsDone: '1; 2', packed: '16.08.2026' },
    { what: 'Ящик', packed: '16.08.2026' },
  ));
  const p = placesOf(list);
  assert.equal(p.total, 4);
  assert.equal(p.done, 2);
  assert.equal(p.left, 2);
  assert.equal(p.split, 1);
});

test('placesOf: доставлена посилка без переліку рахується доставленим місцем', () => {
  const list = parseDeliveries(sheet(
    { what: 'Ящик', packed: '16.08.2026', handed: '16.08.2026', atbase: '17.08.2026', delivered: '18.08.2026' },
  ));
  assert.deepEqual(placesOf(list), { total: 1, done: 1, left: 0, lost: 0, split: 0 });
});

test('placesOf: списане не потрапляє ні в доставлене, ні в те, що їде', () => {
  const list = parseDeliveries(sheet({ what: 'Ящик', weight: '5', lost: '17.08.2026 · Знищено' }));
  assert.deepEqual(placesOf(list), { total: 1, done: 0, left: 0, lost: 1, split: 0 });
});

test('partsLeft: рахує тільки посилки, у яких щось лишилось', () => {
  const list = parseDeliveries(sheet(
    { parts: 'А; Б; В', partsDone: '1' },
    { parts: 'Г; Д', partsDone: '1; 2' },   // закрита — не рахується
  ));
  assert.deepEqual(partsLeft(list), { total: 3, left: 2 });
});

/* ── ваги ──────────────────────────────────────────────────────────────── */

test('weightOf: сума місць важливіша за окреме поле ваги', () => {
  assert.equal(weightOf({ parts: 'А = 2; Б = 3', weight: 99 }), 5);
});

test('weightOf: без зважених місць лишається поле ваги', () => {
  assert.equal(weightOf({ parts: 'А; Б', weight: 12 }), 12);
  assert.equal(weightOf({ parts: '', weight: 12 }), 12);
  assert.equal(weightOf({ parts: '', weight: null }), null);
});

test('weightLeft: у дорозі лишається неприбуле, а не вся посилка', () => {
  const list = parseDeliveries(sheet(
    { parts: 'А = 10; Б = 5', partsDone: '1', packed: '16.08.2026' },
    { weight: '7', packed: '16.08.2026' },
    { weight: '100', lost: '17.08.2026 · Знищено' },  // списане не везуть
  ));
  assert.equal(weightLeft(list), 12);
});

test('порожня вага — це «не зважили», а не нуль', () => {
  const d = parcel({ what: 'Ящик', weight: '' });
  assert.equal(d.weight, null);
  assert.equal(parcel({ what: 'Ящик', weight: '0' }).weight, 0);
});

test('вага з комою читається як число', () => {
  assert.equal(parcel({ weight: '7,7' }).weight, 7.7);
});

/* ── черга на борт ─────────────────────────────────────────────────────── */

test('hotOf: скільки мішків чекає найближчого борту', () => {
  const list = parseDeliveries(sheet(
    { parts: 'А = 2; Б = 3; В = 1', partsHot: '1; 2', partsDone: '1', packed: '16.08.2026' },
    { weight: '4', prio: PRIO_FIRST, packed: '16.08.2026' },
    { weight: '9', prio: PRIO_FIRST, lost: '17.08.2026 · Знищено' },  // списане черги не займає
  ));
  assert.deepEqual(hotOf(list), { places: 2, kg: 7 });
});

test('urgent: посилка без переліку — це один мішок', () => {
  const d = parcel({ what: 'Ящик', prio: PRIO_FIRST, packed: '16.08.2026' });
  assert.equal(d.urgent, true);
  assert.equal(d.hotLeft, 1);
});

test('urgent згасає, коли всі першочергові мішки прилетіли', () => {
  const d = parcel({ parts: 'А; Б', partsHot: '1', partsDone: '1', packed: '16.08.2026' });
  assert.equal(d.urgent, false);
  assert.equal(d.hotLeft, 0);
});

test('orderForRoad: спершу першочергове, далі те, що довше стоїть', () => {
  const list = parseDeliveries(sheet(
    { what: 'Стара', packed: '10.08.2026' },
    { what: 'Свіжа', packed: '19.08.2026' },
    { what: 'Термінова', prio: PRIO_FIRST, packed: '19.08.2026' },
    { what: 'Дуже термінова', parts: 'А; Б', partsHot: '1; 2', packed: '19.08.2026' },
  ));
  assert.deepEqual(
    orderForRoad(list, NOW).map((d) => d.what),
    ['Дуже термінова', 'Термінова', 'Стара', 'Свіжа'],
  );
});

/* ── час і застрягле ───────────────────────────────────────────────────── */

test('stampOf: дата з часом і без нього', () => {
  assert.equal(stampOf('16.08.2026 09:38'), Date.UTC(2026, 7, 16, 9, 38));
  assert.equal(stampOf('16.08.2026'), Date.UTC(2026, 7, 16));
  assert.equal(stampOf('позавчора'), 0);
  assert.equal(stampOf(''), 0);
});

test('daysAt: доби на поточному етапі', () => {
  const d = parcel({ packed: '16.08.2026 12:00' });
  assert.equal(daysAt(d, NOW), 4);
});

test('stuck: у кожного етапу свій норматив', () => {
  const list = parseDeliveries(sheet(
    { what: 'Зібрана давно', packed: '17.08.2026 12:00' },                       // 3 доби, норма 1
    { what: 'Зібрана вчора', packed: '19.08.2026 12:00' },                       // 1 доба, норма 1
    { what: 'У водія', packed: '10.08.2026', handed: '19.08.2026 12:00' },       // 1 доба, норма 2
    { what: 'Списана', packed: '10.08.2026 12:00', lost: '17.08.2026 · Знищено' },
  ));
  assert.deepEqual(stuck(list, NOW).map((d) => d.what), ['Зібрана давно']);
});

test('stuck: доставлене питань не викликає', () => {
  const list = parseDeliveries(sheet(
    { packed: '01.08.2026', handed: '01.08.2026', atbase: '02.08.2026', delivered: '03.08.2026' },
  ));
  assert.deepEqual(stuck(list, NOW), []);
});

test('deliveredWithin: вікно рахується від дати доставки', () => {
  const list = parseDeliveries(sheet(
    { what: 'Свіжа', packed: '01.08.2026', handed: '01.08.2026', atbase: '01.08.2026', delivered: '18.08.2026' },
    { what: 'Давня', packed: '01.07.2026', handed: '01.07.2026', atbase: '01.07.2026', delivered: '01.07.2026' },
  ));
  assert.deepEqual(deliveredWithin(list, 7, NOW).map((d) => d.what), ['Свіжа']);
});

/* ── групування ────────────────────────────────────────────────────────── */

test('byDriver: у водія рахується те, що ще не поставлене', () => {
  const list = parseDeliveries(sheet(
    { driver: 'Лотар', parts: 'А = 10; Б = 5', partsDone: '1', packed: '16.08.2026', handed: '16.08.2026' },
    { driver: 'Лотар', weight: '3', packed: '16.08.2026', handed: '16.08.2026' },
    { driver: 'Джин', weight: '8', packed: '16.08.2026', handed: '16.08.2026' },
  ));
  assert.deepEqual(byDriver(list), [
    { name: 'Лотар', n: 2, kg: 8 },
    { name: 'Джин', n: 1, kg: 8 },
  ]);
});

test('byPoint: посилка на дві точки рахується в обидві', () => {
  const list = parseDeliveries(sheet(
    { to: 'Тигр, Рись', parts: 'А; Б', packed: '16.08.2026' },
  ));
  assert.deepEqual(byPoint(list).map((x) => [x.name, x.n, x.places]), [
    ['Тигр', 1, 2],
    ['Рись', 1, 2],
  ]);
});

test('byPoint: без отримувача — запасний варіант «точка», далі прочерк', () => {
  const list = parseDeliveries(sheet({ packed: '16.08.2026' }));
  assert.equal(byPoint(list)[0].name, '—');
});

test('byStage: кожна посилка потрапляє рівно на один етап', () => {
  const list = parseDeliveries(sheet(
    { packed: '16.08.2026' },
    { packed: '16.08.2026', handed: '17.08.2026' },
  ));
  const stages = byStage(list);
  assert.equal(stages[0].items.length, 1);
  assert.equal(stages[1].items.length, 1);
  assert.equal(stages[2].items.length, 0);
});

test('suggestions: спершу вписане раніше, потім початковий список', () => {
  const list = [{ driver: 'Тінь' }, { driver: 'Лотар' }];
  assert.deepEqual(suggestions(list, 'driver', DRIVERS), ['Тінь', 'Лотар', 'Джин', 'БПС']);
});

/* ── читання й запис рядка ─────────────────────────────────────────────── */

test('stageOf: етап — останній, у якого проставлена дата', () => {
  assert.equal(stageOf(row({})), -1);
  assert.equal(stageOf(row({ packed: '16.08.2026' })), 0);
  assert.equal(stageOf(row({ packed: '16.08.2026', handed: '17.08.2026' })), 1);
  // пропуск етапу не ламає розрахунок: рахує найдальший
  assert.equal(stageOf(row({ packed: '16.08.2026', delivered: '18.08.2026' })), 3);
});

test('parseDeliveries: порожні рядки пропускаються, номери рядків не зсуваються', () => {
  const values = [DELIVERY_HEADERS, row({ what: 'Перша' }), row({}), row({ what: 'Третя' })];
  const list = parseDeliveries(values);
  assert.deepEqual(list.map((d) => [d.what, d.row]), [['Перша', 2], ['Третя', 4]]);
});

test('parseDeliveries: порожній лист і лист без рядків', () => {
  assert.deepEqual(parseDeliveries([]), []);
  assert.deepEqual(parseDeliveries([DELIVERY_HEADERS]), []);
  assert.deepEqual(parseDeliveries(null), []);
});

test('parseDeliveries: короткий рядок доповнюється, а не падає', () => {
  const list = parseDeliveries([DELIVERY_HEADERS, ['16.08.2026', 'Вода']]);
  assert.equal(list[0].what, 'Вода');
  assert.equal(list[0].parts, '');
  assert.equal(list[0].stage, 'new');
});

test('deliveryRow: статус пишеться словами з етапу', () => {
  const r = deliveryRow({ what: 'Вода', dates: { packed: '16.08.2026', handed: '17.08.2026' } });
  assert.equal(r[DL.status], 'Передали');
});

test('deliveryRow: списана посилка має статус «Втрачено», а не етап', () => {
  const r = deliveryRow({
    what: 'Вода',
    lost: '17.08.2026 · Знищено',
    dates: { packed: '16.08.2026', handed: '17.08.2026' },
  });
  assert.equal(r[DL.status], 'Втрачено');
});

test('deliveryRow: усі місця списані — теж «Втрачено»', () => {
  const r = deliveryRow({ parts: 'А; Б', partsLost: '1; 2', dates: { packed: '16.08.2026' } });
  assert.equal(r[DL.status], 'Втрачено');
});

test('deliveryRow: черговість у листі пишеться словами', () => {
  assert.equal(deliveryRow({ prio: '1' })[DL.prio], PRIO_FIRST);
  assert.equal(deliveryRow({ prio: '' })[DL.prio], '');
});

test('deliveryRow: порожня вага лишається порожньою, нуль — нулем', () => {
  assert.equal(deliveryRow({ weight: '' })[DL.weight], '');
  assert.equal(deliveryRow({ weight: null })[DL.weight], '');
  assert.equal(deliveryRow({ weight: '0' })[DL.weight], 0);
  assert.equal(deliveryRow({ weight: '7,7' })[DL.weight], 7.7);
});

test('deliveryRow: дата створення не затирається порожнім значенням', () => {
  const prev = row({ created: '16.08.2026 09:00', what: 'Вода' });
  const r = deliveryRow({ what: 'Вода' }, prev);
  assert.equal(r[DL.created], '16.08.2026 09:00');
});

test('deliveryRow: рядок читається назад тим самим parseDeliveries', () => {
  const r = deliveryRow({
    created: '16.08.2026 09:00', what: 'Вода', to: 'Тигр',
    parts: 'А = 2; Б = 3', partsDone: '1=17.08.2026', partsHot: '2',
    dates: { packed: '16.08.2026' },
  });
  const d = parseDeliveries([DELIVERY_HEADERS, r])[0];
  assert.equal(d.what, 'Вода');
  assert.equal(d.stage, 'packed');
  assert.equal(d.urgent, true);
  assert.equal(weightOf(d), 5);
});

/* ── правка переліку місць ─────────────────────────────────────────────── */

/*
 * Збирач править свою посилку й тоді, коли вона вже поїхала: забутий
 * мішок згадують не одразу. Позначки чергового стоять на номерах, а
 * номери після правки зсуваються — тож вони переносяться за назвами.
 */

test('remapDone: дописаний на початку мішок не зсуває чужу відмітку', () => {
  const cur = { parts: 'А; Б', partsDone: '2=18.08.2026' };
  assert.equal(remapDone(cur, 'Новий; А; Б'), '3=18.08.2026');
});

test('remapDone: прибране місце забирає свою відмітку із собою', () => {
  const cur = { parts: 'А; Б; В', partsDone: '1=17.08.2026; 3=18.08.2026' };
  assert.equal(remapDone(cur, 'А; В'), '1=17.08.2026; 2=18.08.2026');
});

test('remapDone: перейменоване місце вважається новим', () => {
  // назва — це все, за чим тут можна впізнати мішок; перепишеш її —
  // і це вже інший мішок, який ще ніхто не приймав
  const cur = { parts: 'А; Б', partsDone: '1=17.08.2026' };
  assert.equal(remapDone({ ...cur }, 'Аа; Б'), '');
});

test('remapDone: без відміток лишається порожньо', () => {
  assert.equal(remapDone({ parts: 'А; Б', partsDone: '' }, 'А; Б; В'), '');
});

test('remapLost: списане місце теж їде за назвою', () => {
  const cur = { parts: 'А; Б', partsLost: '2=18.08.2026' };
  assert.equal(remapLost(cur, 'Новий; А; Б'), '3=18.08.2026');
});

test('remapHot: першочерговість переїжджає без дати', () => {
  const cur = { parts: 'А; Б; В', partsHot: '1; 3' };
  assert.equal(remapHot(cur, 'Новий; А; Б; В'), '2; 4');
});

test('remapHot: зникле першочергове місце просто зникає', () => {
  const cur = { parts: 'А; Б', partsHot: '1; 2' };
  assert.equal(remapHot(cur, 'Б'), '1');
});

test('перелік без змін лишає позначки на місці', () => {
  const cur = { parts: 'А; Б; В', partsDone: '2=18.08.2026', partsHot: '1; 3' };
  assert.equal(remapDone(cur, 'А; Б; В'), '2=18.08.2026');
  assert.equal(remapHot(cur, 'А; Б; В'), '1; 3');
});

test('remapMarks: однакові назви не задвоюють позначку', () => {
  // два «Мішок» у переліку — позначка сяде на перший; це краще, ніж
  // втратити її зовсім
  const marks = new Map([[2, '18.08.2026']]);
  assert.deepEqual([...remapMarks(['Мішок', 'Мішок'], marks, 'Мішок; Мішок')],
    [[1, '18.08.2026'], [2, '18.08.2026']]);
});

/* ── схема листа ───────────────────────────────────────────────────────── */

test('DL вказує на ті самі колонки, що й заголовки', () => {
  assert.equal(DELIVERY_HEADERS[DL.what], 'Вміст');
  assert.equal(DELIVERY_HEADERS[DL.parts], 'Місця');
  assert.equal(DELIVERY_HEADERS[DL.partsHot], 'Першочергові місця');
  assert.equal(DELIVERY_HEADERS.length, Object.keys(DL).length);
});

test('«кому на точці» й «хто прийняв» — різні колонки', () => {
  // намір збирача й факт чергового; зливши їх в одну клітинку, ми б
  // мовчки затирали те, що коробку віддали не тому, кому збирали
  assert.notEqual(DL.pilot, DL.taker);
  assert.equal(DELIVERY_HEADERS[DL.pilot], 'Кому на точці');
  assert.equal(DELIVERY_HEADERS[DL.taker], 'Хто прийняв');
});

test('deliveryRow і parseDeliveries знають про «кому на точці»', () => {
  const r = deliveryRow({ what: 'Вода', pilot: 'Лотар', taker: 'БПС' });
  assert.equal(r[DL.pilot], 'Лотар');
  const d = parseDeliveries([DELIVERY_HEADERS, r])[0];
  assert.equal(d.pilot, 'Лотар');
  assert.equal(d.taker, 'БПС');
});

test('старий рядок без нової колонки читається без падіння', () => {
  // колонка дописана в кінець уже після того, як лист жив своїм життям:
  // рядки, записані до неї, просто коротші
  const short = deliveryRow({ what: 'Вода' }).slice(0, DL.pilot);
  const d = parseDeliveries([DELIVERY_HEADERS, short])[0];
  assert.equal(d.pilot, '');
  assert.equal(d.what, 'Вода');
});

test('нова колонка дописана в кінець, старі індекси не зсунулись', () => {
  // зсув на одну позицію перечитав би весь лист навскіс: дати стали б
  // примітками, а ваги — датами
  assert.equal(DL.pilot, DELIVERY_HEADERS.length - 1);
  assert.equal(DELIVERY_HEADERS[DL.created], 'Створено');
  assert.equal(DELIVERY_HEADERS[DL.partsHot], 'Першочергові місця');
});

test('колонки етапів не перетинаються між собою', () => {
  const cols = STAGES.map((s) => s.col);
  assert.equal(new Set(cols).size, cols.length);
});
