/**
 * Розмітка в навчальних текстах.
 *
 * Сторінка знає рівно дві речі: `код` у зворотних лапках і **наголос**.
 * Усе інше вона покаже як є — і це найтихіший вид поломки в застосунку:
 * тести на склад уроку проходять, збірка чиста, а людина читає «через це
 * `||` тихо зʼїдає вагу» разом із паличками.
 *
 * Так уже траплялось тричі: у варіантах відповіді повторення, у
 * поясненнях довідника й у кроках плану. Щоразу це бачили очима на
 * знімку екрана, а не тестом. Тепер — тестом.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CODE_LESSONS } from '../lib/code.js';
import { REF_CARDS } from '../lib/ref.js';
import { ABC } from '../lib/abc.js';
import { PLAN } from '../lib/plan.js';
import { TOURS } from '../lib/tour.js';
import { QUESTIONS } from '../lib/recall.js';
import { PATHS } from '../lib/paths.js';
import { KINDS, AI_CHECK, STARTERS } from '../lib/notes.js';
import { TOOL_LESSONS } from '../lib/tools.js';

/** Усе, що сторінка показує людині як текст, — з адресою, де шукати */
const texts = [];
const put = (where, ...vals) => vals.forEach((v) => {
  if (typeof v === 'string' && v.trim()) texts.push({ where, t: v });
});

CODE_LESSONS.forEach((l) => {
  put(`урок ${l.id}`, ...l.intro, l.task, l.want, l.hint);
  if (typeof l.why === 'string') put(`урок ${l.id}`, l.why);
});
TOOL_LESSONS.forEach((l) => {
  put(`інструменти ${l.id}`, ...l.intro, l.task, l.want, l.hint, l.why);
  l.steps.forEach((s) => put(`інструменти ${l.id}`, s.do, s.see));
  l.verify.forEach((q) => put(`інструменти ${l.id}`, q.ask, q.why, ...q.options));
});
REF_CARDS.forEach((c) => put(`картка ${c.id}`, c.t, c.q, c.note, c.note2, c.here));
ABC.forEach((a) => put(`абетка ${a.id}`, a.t, a.what, a.why));
PLAN.forEach((s) => put(`план ${s.n}`, s.topic, s.read, s.why, s.find, s.task));
TOURS.forEach((x) => {
  put(`розбір ${x.id}`, x.title, x.goal, x.intro, x.why, x.try);
  (x.steps || []).forEach((s) => put(`розбір ${x.id}`, s.t, s.d));
});
QUESTIONS.forEach((q) => put(`повторення ${q.lesson}`, q.ask, q.why, ...q.options));
Object.entries(PATHS).forEach(([id, p]) => put(`шлях ${id}`, p.know));
KINDS.forEach((k) => put(`зошит ${k.key}`, k.label, k.about, k.askLab, k.askEx, k.answerLab, k.answerEx));
put('зошит', ...AI_CHECK);
STARTERS.forEach((s) => put('зошит', s.ask, s.d));

test('текстів для перевірки набралось стільки, скільки їх є', () => {
  // якщо перелік раптом спорожніє, решта тестів пройде, нічого не перевіривши
  assert.ok(texts.length > 800, `знайдено лише ${texts.length}`);
});

test('зворотні лапки парні', () => {
  /*
   * Непарна лапка — це не дрібниця: вона робить моноширинним усе до
   * кінця абзацу або, навпаки, не робить нічого й лишається на екрані
   * паличкою.
   */
  const bad = texts
    .filter((x) => (x.t.match(/`/g) || []).length % 2)
    .map((x) => `${x.where}: ${x.t.slice(0, 50)}…`);
  assert.deepEqual(bad, []);
});

test('зірочки наголосу парні й подвійні', () => {
  // одинарна `*так*` не розмітка: сторінка покаже зірочки
  const bad = texts.filter((x) => {
    const clean = x.t.replace(/`[^`]*`/g, '');     // у коді зірочка — це множення
    if ((clean.match(/\*\*/g) || []).length % 2) return true;
    return /(^|[^*])\*[^*\s][^*]*\*($|[^*])/.test(clean);
  }).map((x) => `${x.where}: ${x.t.slice(0, 50)}…`);
  assert.deepEqual(bad, []);
});

test('посилань розміткою немає — їх нема кому показати', () => {
  /*
   * `[текст](адреса)` сторінка покаже дужками. Зовнішнє посилання в
   * уроці робиться полем `next`, яке стає справжнім `<a>`.
   */
  const bad = texts
    .filter((x) => /\]\(/.test(x.t))
    .map((x) => `${x.where}: ${x.t.slice(0, 50)}…`);
  assert.deepEqual(bad, []);
});

test('заголовків розміткою теж немає', () => {
  // рядок, що починається з решітки, — не заголовок, а рядок із решіткою
  const bad = texts
    .filter((x) => /^#{1,6}\s/.test(x.t.trim()))
    .map((x) => `${x.where}: ${x.t.slice(0, 50)}…`);
  assert.deepEqual(bad, []);
});
