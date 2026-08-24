import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_LESSONS, TRACKS, CODE_HEADERS, CD, JS_INFO,
  lessonById, openUpTo, isOpen, nextLesson, courseStats,
  nextLink, parseCode, codeRows,
} from '../lib/code.js';

/**
 * Виконання коду уроку — так само, як у воркері застосунку: `console.log`
 * складається в рядки, а якщо останній вираз повернув обіцянку, її чекають.
 */
const runJS = (code) => new Promise((resolve) => {
  const logs = [];
  const put = (a) => a.map((x) => {
    if (typeof x === 'string') return x;
    try { return JSON.stringify(x); } catch { return String(x); }
  }).join(' ');
  const orig = console.log;
  console.log = (...a) => { logs.push(put(a)); };
  const done = (ok, error) => {
    console.log = orig;
    resolve({ ok, output: logs.join('\n'), error });
  };
  try {
    const r = (0, eval)(code);
    if (r && typeof r.then === 'function') {
      r.then(() => setTimeout(() => done(true), 20), (e) => done(false, String(e?.message || e)));
    } else done(true);
  } catch (e) { done(false, String(e?.message || e)); }
});

const jsLessons = CODE_LESSONS.filter((l) => l.kind === 'js');

/* ── склад курсу ───────────────────────────────────────────────────────── */

test('усі id різні — на них тримається прогрес у таблиці', () => {
  const ids = CODE_LESSONS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('у кожного уроку є все, без чого сторінка не намалюється', () => {
  CODE_LESSONS.forEach((l) => {
    ['id', 'track', 'kind', 'title', 'goal', 'start', 'task', 'hint', 'solution', 'why'].forEach((f) => {
      assert.ok(l[f], `${l.id}: немає поля ${f}`);
    });
    assert.ok(Array.isArray(l.intro) && l.intro.length >= 2, `${l.id}: замало пояснення`);
    assert.equal(typeof l.check, 'function', `${l.id}: немає перевірки`);
    assert.ok(TRACKS.some((t) => t.key === l.track), `${l.id}: невідома доріжка ${l.track}`);
    assert.ok(['js', 'page'].includes(l.kind), `${l.id}: невідомий вид ${l.kind}`);
  });
});

test('рішення відрізняється від початкового коду', () => {
  CODE_LESSONS.forEach((l) => {
    assert.notEqual(l.solution.trim(), l.start.trim(), `${l.id}: рішення збігається зі стартом`);
  });
});

test('доріжки наповнені рівномірно', () => {
  TRACKS.forEach((t) => {
    const n = CODE_LESSONS.filter((l) => l.track === t.key).length;
    assert.ok(n >= 5, `${t.key}: лише ${n} уроків`);
  });
});

test('lessonById знаходить урок і не вигадує неіснуючий', () => {
  assert.equal(lessonById('w1').title, 'Перша сторінка');
  assert.equal(lessonById('нема такого'), null);
});

/* ── що почитати далі ──────────────────────────────────────────────────── */

test('у кожного уроку є посилання на розділ підручника', () => {
  CODE_LESSONS.forEach((l) => {
    const n = nextLink(l);
    assert.ok(n, `${l.id}: немає «далі почитати»`);
    assert.ok(n.t && n.t.length > 2, `${l.id}: порожня назва розділу`);
    assert.match(n.url, /^https:\/\//, `${l.id}: адреса не https — ${n.url}`);
  });
});

test('посилання на підручник збираються з однієї адреси', () => {
  const own = CODE_LESSONS.map(nextLink).filter((n) => n.url.startsWith(JS_INFO));
  // майже все має бути з одного джерела — інакше сенс єдиної змінної зникає
  assert.ok(own.length >= CODE_LESSONS.length - 2, 'забагато сторонніх посилань');
  own.forEach((n) => {
    const path = n.url.split('://')[1];
    assert.ok(!path.includes('//'), `подвійний слеш у ${n.url}`);
  });
});

test('уроки не ведуть двічі в те саме місце', () => {
  const urls = CODE_LESSONS.map((l) => nextLink(l).url);
  assert.equal(new Set(urls).size, urls.length, 'два уроки посилаються на один розділ');
});

test('nextLink нічого не вигадує для невідомого уроку', () => {
  assert.equal(nextLink({ id: 'нема' }), null);
  assert.equal(nextLink(null), null);
});

/* ── рішення справді розвʼязують завдання ──────────────────────────────── */

test('кожне рішення проходить власну перевірку', async () => {
  for (const l of jsLessons) {
    const r = await runJS(l.solution);
    assert.ok(r.ok, `${l.id}: рішення падає — ${r.error}`);
    assert.ok(l.check(r.output, l.solution), `${l.id}: check(solution) = false, вивід:\n${r.output}`);
  }
});

test('початковий код ще не проходить перевірку — інакше робити нічого', async () => {
  for (const l of jsLessons) {
    const r = await runJS(l.start);
    if (!r.ok) continue;                     // урок про помилки — падіння тут навмисне
    assert.equal(l.check(r.output, l.start), false, `${l.id}: завдання виконане наперед`);
  }
});

test('початковий код падає лише там, де це і є урок', async () => {
  for (const l of jsLessons) {
    const r = await runJS(l.start);
    if (l.startBreaks) assert.equal(r.ok, false, `${l.id}: startBreaks стоїть, а код працює`);
    else assert.ok(r.ok, `${l.id}: стартовий код падає — ${r.error}`);
  }
});

/* ── порядок і доступ ──────────────────────────────────────────────────── */

test('openUpTo: відкритий рівно наступний після зробленого', () => {
  assert.equal(openUpTo({}), 0);
  const done = (n) => Object.fromEntries(
    CODE_LESSONS.slice(0, n).map((l) => [l.id, { state: 'done' }])
  );
  assert.equal(openUpTo(done(3)), 3);
  assert.equal(openUpTo(done(CODE_LESSONS.length)), CODE_LESSONS.length);
});

test('openUpTo: пропущений урок зупиняє чергу, навіть якщо далі щось зроблено', () => {
  const prog = {
    [CODE_LESSONS[0].id]: { state: 'done' },
    [CODE_LESSONS[5].id]: { state: 'done' },
  };
  assert.equal(openUpTo(prog), 1);
});

test('isOpen: перший урок відкритий завжди, останній — ні', () => {
  assert.equal(isOpen({}, 0), true);
  assert.equal(isOpen({}, 1), false);
  assert.equal(isOpen({}, CODE_LESSONS.length - 1), false);
});

test('nextLesson: наступний незроблений, а наприкінці — нічого', () => {
  assert.equal(nextLesson({}).id, CODE_LESSONS[0].id);
  const all = Object.fromEntries(CODE_LESSONS.map((l) => [l.id, { state: 'done' }]));
  assert.equal(nextLesson(all), null);
});

test('courseStats: рахує загалом і по доріжках', () => {
  const s = courseStats({});
  assert.equal(s.total, CODE_LESSONS.length);
  assert.equal(s.done, 0);
  assert.equal(s.byTrack.reduce((a, t) => a + t.total, 0), CODE_LESSONS.length);

  const two = { [CODE_LESSONS[0].id]: { state: 'done' }, [CODE_LESSONS[1].id]: { state: 'done' } };
  assert.equal(courseStats(two).done, 2);
});

/* ── збереження прогресу ───────────────────────────────────────────────── */

test('parseCode: читає лист і не вірить чужому «стану»', () => {
  const prog = parseCode([
    CODE_HEADERS,
    ['w1', 'done', '16.08.2026', '3', 'let a = 1;'],
    ['w2', 'майже', '', 'дурня', ''],
    ['', 'done', '', '', ''],
  ]);
  assert.deepEqual(prog.w1, { id: 'w1', state: 'done', date: '16.08.2026', tries: 3, code: 'let a = 1;' });
  assert.equal(prog.w2.state, '');
  assert.equal(prog.w2.tries, 0);
  assert.equal(Object.keys(prog).length, 2);      // рядок без id пропущено
});

test('parseCode: порожній лист не падає', () => {
  assert.deepEqual(parseCode([]), {});
  assert.deepEqual(parseCode(null), {});
  assert.deepEqual(parseCode([CODE_HEADERS]), {});
});

test('codeRows: рядок на кожен урок, у порядку курсу', () => {
  const rows = codeRows({ w1: { state: 'done', date: '16.08.2026', tries: 2, code: 'x' } });
  assert.equal(rows.length, CODE_LESSONS.length);
  assert.equal(rows[0][CD.id], CODE_LESSONS[0].id);
  assert.deepEqual(rows[0], ['w1', 'done', '16.08.2026', 2, 'x']);
  assert.deepEqual(rows[1], [CODE_LESSONS[1].id, '', '', 0, '']);
});

test('codeRows і parseCode переживають одне одного', () => {
  const before = { w1: { state: 'done', date: '16.08.2026', tries: 2, code: 'let a = 1;' } };
  const after = parseCode([CODE_HEADERS, ...codeRows(before)]);
  assert.equal(after.w1.state, 'done');
  assert.equal(after.w1.tries, 2);
  assert.equal(after.w1.code, 'let a = 1;');
});
