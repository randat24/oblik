/**
 * Зошит.
 *
 * Тут ламається тихо: нотатка, яка не знаходиться пошуком, виглядає як
 * відсутня, а зіпсований під час запису код виглядає як код — просто не
 * той. Обидва випадки помічають через місяці, коли згадати, як воно було
 * насправді, вже ніхто не може.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NOTE_HEADERS, NO, KINDS, KIND_KEYS, SOURCES, AI_CHECK, STARTERS,
  kindOf, kindBy, srcOf, sourceBy, topicOf, topicLabel, tagsOf, stampOf,
  isOpen, noteError, parseNotes, noteRow, findNotes, byTopic, tagCloud, noteStats,
} from '../lib/notes.js';
import { ABC } from '../lib/abc.js';

const note = (o = {}) => ({
  date: '13.09.2026', kind: 'q', topic: '', ask: 'Чому поле скидається',
  answer: '', code: '', src: '', checked: false, tags: '', ...o,
});

/* ── склад ─────────────────────────────────────────────────────────────── */

test('у кожного виду є свої питання до форми', () => {
  /*
   * Вид не прикраса: він міняє питання, а питання визначає, чи буде
   * запис придатний до вжитку через пів року. Вид без підпису поля
   * перетворює форму на «нотатка» — і зошит на купу.
   */
  KINDS.forEach((k) => {
    ['key', 'label', 'about', 'askLab', 'askEx', 'answerLab', 'answerEx'].forEach((f) => {
      assert.ok(k[f], `${k.key}: немає ${f}`);
    });
    assert.ok(k.askEx.length > 15, `${k.key}: приклад питання ні про що`);
  });
  assert.equal(new Set(KIND_KEYS).size, KINDS.length);
});

test('перелік джерел має «сам дійшов» і «від AI»', () => {
  const keys = SOURCES.map((s) => s.key);
  assert.ok(keys.includes(''));
  assert.ok(keys.includes('ai'));
  assert.equal(new Set(keys).size, keys.length);
});

test('перевірка чужого коду починається із запуску', () => {
  // «виглядає правильно» — не перевірка, і це має бути сказано першим
  assert.ok(AI_CHECK.length >= 3);
  assert.match(AI_CHECK[0], /[Зз]апуст/);
});

test('підказки для порожнього зошита названі видами, які існують', () => {
  assert.ok(STARTERS.length >= 3);
  STARTERS.forEach((s) => {
    assert.ok(KIND_KEYS.includes(s.kind), `невідомий вид ${s.kind}`);
    assert.ok(s.ask && s.d);
  });
});

/* ── розбір значень ────────────────────────────────────────────────────── */

test('невідомий вид стає питанням, а не ламає сторінку', () => {
  assert.equal(kindOf('err'), 'err');
  assert.equal(kindOf('казна-що'), 'q');
  assert.equal(kindOf(''), 'q');
  assert.equal(kindOf(null), 'q');
  assert.equal(kindBy('казна-що').key, 'q');
});

test('невідоме джерело стає порожнім', () => {
  assert.equal(srcOf('ai'), 'ai');
  assert.equal(srcOf('звідкись'), '');
  assert.equal(sourceBy('ai').label, 'Від AI');
});

test('тема мусить бути з абетки', () => {
  assert.equal(topicOf('state'), 'state');
  assert.equal(topicOf('такої-теми-немає'), '');
  assert.equal(topicLabel('state'), ABC.find((a) => a.id === 'state').t);
  assert.equal(topicLabel('немає'), '');
});

test('мітки: без порожніх і без повторів', () => {
  assert.deepEqual(tagsOf('react, форма'), ['react', 'форма']);
  assert.deepEqual(tagsOf(' react ,, React , форма;git '), ['react', 'форма', 'git']);
  assert.deepEqual(tagsOf(''), []);
  assert.deepEqual(tagsOf(null), []);
});

test('сміття замість дати дає нуль, а не падіння', () => {
  assert.equal(stampOf('13.09.2026'), Date.UTC(2026, 8, 13));
  assert.equal(stampOf('позавчора'), 0);
  assert.equal(stampOf(''), 0);
});

/* ── правила запису ────────────────────────────────────────────────────── */

test('вимагається рівно одне поле — питання', () => {
  // зошит, який просить заповнити вісім клітинок, кидають на третьому записі
  assert.equal(noteError(note()), '');
  assert.match(noteError(note({ ask: '' })), /[Нн]апишіть питання/);
  assert.match(noteError(note({ ask: '  ' })), /[Нн]апишіть питання/);
  assert.match(noteError(note({ ask: 'ага' })), /коротке/);
  assert.equal(noteError(note({ answer: '', code: '', topic: '', tags: '' })), '');
});

test('нотатка без відповіді — чесний стан, а не помилка', () => {
  assert.equal(isOpen(note()), true);
  assert.equal(isOpen(note({ answer: 'бо стан' })), false);
  // сам лише код теж закриває питання: інколи відповідь — це рядок
  assert.equal(isOpen(note({ code: 'git restore .' })), false);
});

/* ── таблиця ───────────────────────────────────────────────────────────── */

test('рядок і розбір переживають одне одного', () => {
  const before = note({
    kind: 'err', topic: 'state', answer: 'Стан перемальовує компонент',
    code: 'const [v, setV] = useState(0);', src: 'ai', checked: true, tags: 'react, форма',
  });
  const [back] = parseNotes([NOTE_HEADERS, noteRow(before)]);
  assert.equal(back.kind, 'err');
  assert.equal(back.topic, 'state');
  assert.equal(back.ask, before.ask);
  assert.equal(back.answer, before.answer);
  assert.equal(back.code, before.code);
  assert.equal(back.src, 'ai');
  assert.equal(back.checked, true);
  assert.deepEqual(back.tags, ['react', 'форма']);
  assert.equal(back.row, 2);
});

test('у коді зберігаються відступи й порожні рядки', () => {
  /*
   * Код — єдине поле, яке не можна обрізати. Нотатка зі збитими
   * відступами гірша за відсутню: її скопіюють і не зрозуміють, чому не
   * працює.
   */
  const code = 'function a() {\n\n  return 1;\n}\n';
  const [back] = parseNotes([NOTE_HEADERS, noteRow(note({ code }))]);
  assert.equal(back.code, code);
});

test('порожні рядки таблиці не стають нотатками', () => {
  const rows = [NOTE_HEADERS, [], ['13.09.2026', 'q', '', ''], noteRow(note())];
  const list = parseNotes(rows);
  assert.equal(list.length, 1);
  assert.deepEqual(parseNotes([]), []);
  assert.deepEqual(parseNotes(null), []);
  assert.deepEqual(parseNotes([NOTE_HEADERS]), []);
});

test('найновіші згори', () => {
  const list = parseNotes([
    NOTE_HEADERS,
    noteRow(note({ date: '01.08.2026', ask: 'старіша нотатка' })),
    noteRow(note({ date: '13.09.2026', ask: 'новіша нотатка' })),
  ]);
  assert.equal(list[0].ask, 'новіша нотатка');
});

test('номер рядка вказує на справжній рядок таблиці', () => {
  // на ньому тримається і виправлення, і прибирання: помилишся — зітреш чуже
  const rows = [NOTE_HEADERS,
    noteRow(note({ ask: 'перша нотатка' })),
    noteRow(note({ ask: 'друга нотатка' }))];
  const list = parseNotes(rows);
  const second = list.find((n) => n.ask === 'друга нотатка');
  assert.equal(second.row, 3);
  assert.deepEqual(rows[second.row - 1], noteRow(note({ ask: 'друга нотатка' })));
});

test('чужий вид і чужа тема з таблиці не проходять далі', () => {
  const raw = new Array(NOTE_HEADERS.length).fill('');
  raw[NO.ask] = 'щось записане руками в таблиці';
  raw[NO.kind] = 'вигадка';
  raw[NO.topic] = 'вигадка';
  const [back] = parseNotes([NOTE_HEADERS, raw]);
  assert.equal(back.kind, 'q');
  assert.equal(back.topic, '');
});

/* ── пошук ─────────────────────────────────────────────────────────────── */

const many = parseNotes([NOTE_HEADERS,
  noteRow(note({ ask: 'Чому поле форми скидається', answer: 'Стан живе в React', topic: 'state', tags: 'форма' })),
  noteRow(note({ kind: 'snip', ask: 'Прибрати зміни', code: 'git restore .', topic: 'git' })),
  noteRow(note({ kind: 'err', ask: 'Cannot read properties of undefined', answer: 'Дані ще не прийшли' })),
]);

test('шукаються всі слова разом, а не будь-яке', () => {
  /*
   * «react поле» має знайти нотатку, у якій є і те, і те. Пошук «будь-яке
   * зі слів» у зошиті на дві сотні записів — те саме, що не знайти нічого.
   */
  assert.equal(findNotes(many, 'react поле').length, 1);
  assert.equal(findNotes(many, 'react жодного').length, 0);
});

test('пошук іде й по коду', () => {
  // памʼятають саме рядок, а не те, як його колись назвали
  const found = findNotes(many, 'git restore');
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'snip');
});

test('пошук не зважає на регістр і знаходить за назвою теми', () => {
  assert.equal(findNotes(many, 'CANNOT READ').length, 1);
  assert.equal(findNotes(many, topicLabel('git').toLowerCase()).length, 1);
});

test('порожній запит повертає все, а не нічого', () => {
  assert.equal(findNotes(many, '').length, many.length);
  assert.equal(findNotes(many, '   ').length, many.length);
  assert.deepEqual(findNotes(null, 'щось'), []);
});

test('відбір за видом і темою складається з пошуком', () => {
  assert.equal(findNotes(many, '', { kind: 'err' }).length, 1);
  assert.equal(findNotes(many, '', { topic: 'state' }).length, 1);
  assert.equal(findNotes(many, 'зміни', { kind: 'snip' }).length, 1);
  assert.equal(findNotes(many, 'зміни', { kind: 'err' }).length, 0);
});

/* ── підсумки ──────────────────────────────────────────────────────────── */

test('нотатки рахуються по темах — звідси абетка знає, куди вести', () => {
  assert.deepEqual(byTopic(many), { state: 1, git: 1 });
  assert.deepEqual(byTopic([]), {});
});

test('мітки складаються в перелік, найчастіші першими', () => {
  const list = parseNotes([NOTE_HEADERS,
    noteRow(note({ ask: 'перше питання', tags: 'react, форма' })),
    noteRow(note({ ask: 'друге питання', tags: 'react' }))]);
  assert.deepEqual(tagCloud(list), [{ t: 'react', count: 2 }, { t: 'форма', count: 1 }]);
});

test('підсумок бачить незакриті питання й неперевірене від AI', () => {
  /*
   * Обидва числа мають зменшуватись, і побачити їх треба без гортання
   * списку. Перше — скільки питань висить без відповіді, друге — скільки
   * чужих відповідей записано, не перевіривши.
   */
  const list = parseNotes([NOTE_HEADERS,
    noteRow(note({ ask: 'питання без відповіді' })),
    noteRow(note({ ask: 'відповідь від AI, перевірена', answer: 'так', src: 'ai', checked: true })),
    noteRow(note({ ask: 'відповідь від AI, не перевірена', answer: 'наче так', src: 'ai' }))]);
  const s = noteStats(list);
  assert.equal(s.total, 3);
  assert.equal(s.open, 1);
  assert.equal(s.unchecked, 1);
  assert.equal(s.byKind.find((k) => k.key === 'q').count, 3);
});

test('порожній зошит рахується без падінь', () => {
  const s = noteStats([]);
  assert.equal(s.total, 0);
  assert.equal(s.open, 0);
  assert.equal(s.unchecked, 0);
  assert.equal(s.topics, 0);
  assert.equal(s.last, '');
  assert.equal(noteStats(null).total, 0);
});
