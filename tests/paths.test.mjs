/**
 * Шляхи від теми до того місця, де її вчать.
 *
 * Тут найлегше помилитись тихо: посилання на урок, якого немає, виглядає
 * рівно так само, як правильне, — просто нікуди не веде. Людина натискає
 * й нічого не відбувається, а причину видно лише в коді.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { PATHS, pathOf, hasWhere, gaps, coverage, MUST_GAPS } from '../lib/paths.js';
import { ABC } from '../lib/abc.js';
import { CODE_LESSONS } from '../lib/code.js';
import { REF_CARDS } from '../lib/ref.js';
import { TOURS } from '../lib/tour.js';
import { PLAN } from '../lib/plan.js';

/* ── звʼязність ────────────────────────────────────────────────────────── */

test('кожна тема абетки має запис у шляхах', () => {
  const missing = ABC.filter((a) => !PATHS[a.id]).map((a) => a.id);
  assert.deepEqual(missing, []);
});

test('у шляхах немає тем, яких немає в абетці', () => {
  const known = new Set(ABC.map((a) => a.id));
  const stray = Object.keys(PATHS).filter((id) => !known.has(id));
  assert.deepEqual(stray, []);
});

test('усі уроки в шляхах справді існують', () => {
  const ids = new Set(CODE_LESSONS.map((l) => l.id));
  const bad = [];
  Object.entries(PATHS).forEach(([topic, p]) => {
    (p.lessons || []).forEach((l) => { if (!ids.has(l)) bad.push(`${topic} → ${l}`); });
  });
  assert.deepEqual(bad, []);
});

test('усі картки довідника в шляхах справді існують', () => {
  const ids = new Set(REF_CARDS.map((c) => c.id));
  const bad = [];
  Object.entries(PATHS).forEach(([topic, p]) => {
    (p.ref || []).forEach((r) => { if (!ids.has(r)) bad.push(`${topic} → ${r}`); });
  });
  assert.deepEqual(bad, []);
});

test('усі розбори в шляхах справді існують', () => {
  const ids = new Set(TOURS.map((t) => t.id));
  const bad = [];
  Object.entries(PATHS).forEach(([topic, p]) => {
    (p.tour || []).forEach((t) => { if (!ids.has(t)) bad.push(`${topic} → ${t}`); });
  });
  assert.deepEqual(bad, []);
});

test('усі кроки плану в шляхах справді існують', () => {
  const ns = new Set(PLAN.map((s) => s.n));
  const bad = Object.entries(PATHS)
    .filter(([, p]) => p.plan !== undefined && !ns.has(p.plan))
    .map(([topic, p]) => `${topic} → крок ${p.plan}`);
  assert.deepEqual(bad, []);
});

/* ── «знаю» ────────────────────────────────────────────────────────────── */

test('у кожної теми написано, що означає «знаю»', () => {
  // без цього позначка ставиться на віру й нічого не варта
  const mute = Object.entries(PATHS)
    .filter(([, p]) => !p.know || p.know.trim().length < 25)
    .map(([id]) => id);
  assert.deepEqual(mute, []);
});

test('«знаю» — ціле речення, а не переказ назви теми', () => {
  const titles = Object.fromEntries(ABC.map((a) => [a.id, a.t.toLowerCase()]));
  const bad = Object.entries(PATHS).filter(([id, p]) => {
    const know = p.know.trim();
    // речення, а не ярлик
    if (!know.endsWith('.') || know.split(/\s+/).length < 6) return true;
    // і не переказ заголовка іншими словами
    return know.toLowerCase() === titles[id];
  }).map(([id]) => id);
  assert.deepEqual(bad, []);
});

/* ── пробіли ───────────────────────────────────────────────────────────── */

test('пробіли рахуються чесно, а не ховаються', () => {
  const g = gaps();
  const c = coverage();
  assert.equal(c.gaps, g.length);
  assert.equal(c.covered + c.gaps, c.total);
  assert.equal(c.total, ABC.length);
});

test('у пробілу немає жодного шляху, а в решти є хоч один', () => {
  gaps().forEach((id) => assert.equal(hasWhere(id), false, id));
  Object.keys(PATHS).filter((id) => !gaps().includes(id))
    .forEach((id) => assert.equal(hasWhere(id), true, id));
});

test('обовʼязкові теми без шляху названі поіменно', () => {
  /*
   * Не «їх немає», а «ось вони». Поки перелік тут, борг названий:
   * зʼявиться ще одна обовʼязкова тема без уроку — тест упаде й змусить
   * або написати урок, або чесно дописати її до переліку.
   */
  const actual = ABC.filter((a) => a.must && !hasWhere(a.id)).map((a) => a.id);
  assert.deepEqual(actual.sort(), [...MUST_GAPS].sort());
});

test('невідома тема не ламає нічого', () => {
  assert.deepEqual(pathOf('немає такої'), {});
  assert.equal(hasWhere('немає такої'), false);
});
