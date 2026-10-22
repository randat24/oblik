import test from 'node:test';
import assert from 'node:assert/strict';
import { headTags, accountingCol } from '../lib/cards.js';

/* Лист, схожий на справжній: номер, назва, серійник, облік, тип, місце, статус */
const HEADERS = ['№', 'Найменування', 'S/N', 'Оф облік', 'Тип', 'Де', 'Наявність'];
const COLS = { id: 0, name: 1, type: 4, where: 5, status: 6 };
const ACC = 3;

const row = (acc, type, where, status) =>
  ['84', 'DP4400e', '807LYH4536', acc, type, where, status];

test('колонку обліку знаходимо за назвою, а не за номером', () => {
  assert.equal(accountingCol(HEADERS), 3);
  assert.equal(accountingCol(['А', 'Б']), -1);
});

test('«не облік» — це інша колонка, її не плутаємо з обліком', () => {
  assert.equal(accountingCol(['Назва', 'майно не облік', 'Оф облік']), 2);
});

test('три заповнені теги показуємо всі три', () => {
  const { shown, hidden } = headTags(row('пбд', 'Списан', 'Нема!', 'Втрачено'), COLS, ACC);
  assert.deepEqual(shown.map((t) => t.v), ['пбд', 'Списан', 'Нема!']);
  assert.deepEqual(shown.map((t) => t.ci), [3, 4, 5]);
  assert.deepEqual(hidden, []);
});

test('порожній тег — теж тег: інакше незаповнене поле не вписати взагалі', () => {
  // саме через це тип, якого ще немає, неможливо було додати з картки:
  // рядка в тілі вже немає, а чипа ще немає
  const { shown } = headTags(row('', '', '', 'КСП'), COLS, ACC);
  assert.equal(shown.length, 3);
  assert.deepEqual(shown.map((t) => t.v), ['', '', '']);
  assert.deepEqual(shown.map((t) => t.ci), [3, 4, 5]);
});

test('значення, що повторює статус, ховаємо — але повертаємо як прихований', () => {
  const { shown, hidden } = headTags(row('облік', 'Учт.', 'КСП', 'КСП'), COLS, ACC);
  assert.deepEqual(shown.map((t) => t.v), ['облік', 'Учт.']);
  assert.deepEqual(hidden, [5], 'колонка «Де» має лишитись у тілі картки');
});

test('прихована колонка не може просто зникнути з екрана', () => {
  // це й була друга половина помилки: тег сховали, а колонку з тіла
  // викинули — значення не видно ніде й виправити його ніде
  const { shown, hidden } = headTags(row('КСП', '', '', 'КСП'), COLS, ACC);
  assert.ok(!shown.some((t) => t.ci === 3));
  assert.deepEqual(hidden, [3]);
});

test('регістр при порівнянні зі статусом не важить', () => {
  const { hidden } = headTags(row('', '', 'ксп', 'КСП'), COLS, ACC);
  assert.deepEqual(hidden, [5]);
});

test('пробіли навколо значення не роблять із нього інший тег', () => {
  const { shown, hidden } = headTags(row('  пбд  ', '', '', 'КСП'), COLS, ACC);
  assert.equal(shown[0].v, 'пбд');
  assert.deepEqual(hidden, []);
});

test('два однакові теги між собою теж не дублюємо', () => {
  const { shown, hidden } = headTags(row('склад', 'склад', '', 'КСП'), COLS, ACC);
  assert.deepEqual(shown.map((t) => t.v), ['склад', '']);
  assert.deepEqual(hidden, [4]);
});

test('лист без колонки типу не вигадує тег', () => {
  const cols = { ...COLS, type: -1 };
  const { shown } = headTags(row('пбд', '', 'Нема!', 'КСП'), cols, ACC);
  assert.deepEqual(shown.map((t) => t.ci), [3, 5]);
});

test('колонка «Де» під номером нуль — це не «Де», а перша колонка листа', () => {
  // нульова позиція означає «такої колонки немає»: перша колонка листа
  // це номер, і місцем вона бути не може
  const cols = { ...COLS, where: 0 };
  const { shown } = headTags(row('пбд', 'Списан', 'Нема!', 'КСП'), cols, ACC);
  assert.deepEqual(shown.map((t) => t.ci), [3, 4]);
});

test('листа без колонки обліку теж вистачає', () => {
  const { shown } = headTags(row('', 'Списан', 'Нема!', 'КСП'), COLS, -1);
  assert.deepEqual(shown.map((t) => t.ci), [4, 5]);
});

test('клас тега прив\'язаний до змісту колонки, а не до її номера', () => {
  const { shown } = headTags(row('пбд', 'Списан', 'Нема!', 'Втрачено'), COLS, ACC);
  assert.deepEqual(shown.map((t) => t.cls), ['tag-acc', 'tag-type', 'tag-where']);
});

test('порожній статус нічого не ховає', () => {
  const { shown, hidden } = headTags(row('пбд', 'Списан', 'Нема!', ''), COLS, ACC);
  assert.equal(shown.length, 3);
  assert.deepEqual(hidden, []);
});
