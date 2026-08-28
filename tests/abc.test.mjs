import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ABC, ABC_GROUPS, ABC_HEADERS, AC, STATES,
  parseAbc, abcRows, byGroup, abcProgress, suggestNext, cycleState, stateOf,
} from '../lib/abc.js';

/* ── сам перелік ───────────────────────────────────────────────────────── */

test('кожна тема описана повністю', () => {
  ABC.forEach((x) => {
    ['id', 'g', 't', 'what', 'why'].forEach((k) => {
      assert.ok(String(x[k] || '').trim(), `${x.id || '?'}: немає «${k}»`);
    });
  });
});

test('номери тем не повторюються', () => {
  const ids = ABC.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('кожна тема лежить у наявній групі', () => {
  const keys = new Set(ABC_GROUPS.map((g) => g.key));
  const bad = ABC.filter((x) => !keys.has(x.g)).map((x) => x.id);
  assert.deepEqual(bad, []);
});

test('у кожній групі щось є', () => {
  const empty = ABC_GROUPS.filter((g) => byGroup(g.key).length === 0).map((g) => g.key);
  assert.deepEqual(empty, []);
});

test('опис теми — один рядок, а не абзац', () => {
  // абетку проглядають очима згори вниз; абзац на кожен рядок робить це
  // неможливим, і список перестає бути списком
  ABC.forEach((x) => {
    assert.ok(x.what.length <= 110, `${x.id}: «що це» задовге (${x.what.length})`);
    assert.ok(x.why.length <= 110, `${x.id}: «навіщо» задовге (${x.why.length})`);
  });
});

test('обовʼязкове є, але його не більшість', () => {
  // якщо позначити обовʼязковим усе, позначка перестає щось означати
  const must = ABC.filter((x) => x.must).length;
  assert.ok(must > 10, 'обовʼязкового підозріло мало');
  // позначка має відсіювати: коли нею відмічено дві третини списку, вона
  // не каже нічого й фільтр «обовʼязкове» перестає мати сенс
  assert.ok(must < ABC.length * 0.5, `обовʼязковим позначено забагато: ${must} із ${ABC.length}`);
});

test('перелік не про цей застосунок', () => {
  /*
   * Абетку носять із собою далі: вона про роботу веброзробником, а не
   * про «Облік». Назва застосунку чи його файлів тут означала б, що
   * список нікуди, крім цього проєкту, не годиться.
   */
  const local = ABC.filter((x) => /Облік|zbir|pack\.js|delivery\.js|посилк|мішк/i.test(x.what + x.why));
  assert.deepEqual(local.map((x) => x.id), []);
});

/* ── стани ─────────────────────────────────────────────────────────────── */

test('три стани, і «ще ні» серед них', () => {
  assert.deepEqual(STATES.map((s) => s.key), ['', 'learning', 'known']);
});

test('stateOf: невідоме значення вважається «ще ні»', () => {
  assert.equal(stateOf({ state: 'known' }), 'known');
  assert.equal(stateOf({ state: 'learning' }), 'learning');
  assert.equal(stateOf({ state: 'казна-що' }), '');
  assert.equal(stateOf({ state: '' }), '');
  assert.equal(stateOf(undefined), '');
  assert.equal(stateOf(null), '');
});

test('cycleState ходить по колу й повертається', () => {
  assert.equal(cycleState(''), 'learning');
  assert.equal(cycleState('learning'), 'known');
  assert.equal(cycleState('known'), '');
  // зіпсоване значення не заклинює перемикач
  assert.equal(cycleState('дурня'), 'learning');
});

/* ── лист ──────────────────────────────────────────────────────────────── */

test('parseAbc читає лист і не вірить чужому стану', () => {
  const marks = parseAbc([
    ABC_HEADERS,
    ['var', 'known', '28.08.2026'],
    ['fn', 'вигадка', ''],
    ['', 'known', ''],
  ]);
  assert.equal(marks.var.state, 'known');
  assert.equal(marks.var.date, '28.08.2026');
  assert.equal(marks.fn.state, '', 'чуже значення мало стати «ще ні»');
  assert.equal(Object.keys(marks).length, 2, 'рядок без теми не рахується');
});

test('parseAbc: порожній лист не падає', () => {
  assert.deepEqual(parseAbc([]), {});
  assert.deepEqual(parseAbc(null), {});
  assert.deepEqual(parseAbc([ABC_HEADERS]), {});
});

test('abcRows: рядок на кожну тему, у порядку переліку', () => {
  const rows = abcRows({ var: { state: 'known', date: '28.08.2026' } });
  assert.equal(rows.length, ABC.length);
  assert.deepEqual(rows[0], ['var', 'known', '28.08.2026']);
  assert.equal(rows[1][1], '', 'непозначене має лишатись порожнім');
});

test('abcRows і parseAbc переживають одне одного', () => {
  const was = { var: { state: 'known', date: '28.08.2026' }, fn: { state: 'learning', date: '' } };
  const back = parseAbc([ABC_HEADERS, ...abcRows(was)]);
  assert.equal(back.var.state, 'known');
  assert.equal(back.fn.state, 'learning');
  assert.equal(back.git.state, '');
});

test('колонки збігаються із заголовками', () => {
  assert.equal(ABC_HEADERS.length, Object.keys(AC).length);
  assert.equal(ABC_HEADERS[AC.id], 'Тема');
});

/* ── підрахунок і порада ───────────────────────────────────────────────── */

test('abcProgress рахує окремо все й окремо обовʼязкове', () => {
  const p = abcProgress({ var: { state: 'known' }, fn: { state: 'learning' } });
  assert.equal(p.all.known, 1);
  assert.equal(p.all.learning, 1);
  assert.equal(p.all.total, ABC.length);
  assert.equal(p.must.known, 1, 'var — обовʼязкова, має потрапити в обидва підрахунки');
  assert.ok(p.must.total < p.all.total);
});

test('abcProgress на порожньому — нулі, а не падіння', () => {
  const p = abcProgress();
  assert.equal(p.all.known, 0);
  assert.equal(p.all.total, ABC.length);
});

test('suggestNext радить обовʼязкове, якого ще не знають', () => {
  const next = suggestNext({});
  assert.equal(next.length, 3);
  assert.ok(next.every((x) => x.must));

  // «вчу» не вважається вивченим і лишається в пораді
  const same = suggestNext({ [next[0].id]: { state: 'learning' } });
  assert.equal(same[0].id, next[0].id);

  // а «знаю» — прибирає
  const after = suggestNext({ [next[0].id]: { state: 'known' } });
  assert.notEqual(after[0].id, next[0].id);
});

test('коли все обовʼязкове знають — порад немає', () => {
  const all = Object.fromEntries(ABC.filter((x) => x.must).map((x) => [x.id, { state: 'known' }]));
  assert.deepEqual(suggestNext(all), []);
});
