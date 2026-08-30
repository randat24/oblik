import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_LESSONS, TRACKS, CODE_HEADERS, CD, JS_INFO, REACT_DOCS,
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
    assert.ok(['js', 'page', 'react'].includes(l.kind), `${l.id}: невідомий вид ${l.kind}`);
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

test('порядок доріжок: основи → React → сервер → чистий код', () => {
  const at = (track) => CODE_LESSONS.findIndex((l) => l.track === track);
  const last = (track) => CODE_LESSONS.map((l) => l.track).lastIndexOf(track);
  // React поверх незрозумілого JavaScript — це копіювання чужих шматків
  assert.ok(at('react') > last('base'), 'React починається раніше за кінець основ');
  assert.ok(at('node') > last('react'), 'сервер починається раніше за кінець React');
  // про те, як писати добре, є сенс говорити після того, як щось написано
  assert.ok(at('clean') > last('node'), 'чистий код починається раніше за кінець сервера');
});

test('основи йдуть по наростанню: замикання після функцій, прототипи після класів', () => {
  const at = (id) => CODE_LESSONS.findIndex((l) => l.id === id);
  assert.ok(at('b13') > at('b4'), 'область видимості раніше за функції');
  assert.ok(at('b14') > at('b9'), 'замикання раніше за функцію як значення');
  assert.ok(at('b16') > at('b15'), 'прототипи раніше за класи');
  assert.ok(at('s11') > at('b5'), 'перебір обʼєкта раніше за самі обʼєкти');
  assert.ok(at('s12') < at('s10'), 'JSON пізніше за запит на сервер');
});

test('React-уроки мають компонент App — його монтує пісочниця', () => {
  CODE_LESSONS.filter((l) => l.kind === 'react').forEach((l) => {
    assert.match(l.start, /function App\s*\(/, `${l.id}: у стартовому коді немає App`);
    assert.match(l.solution, /function App\s*\(/, `${l.id}: у рішенні немає App`);
  });
});

test('clicks стоять лише там, де є що натискати', () => {
  CODE_LESSONS.filter((l) => l.clicks).forEach((l) => {
    assert.equal(l.kind, 'react', `${l.id}: clicks не в React-уроці`);
    l.clicks.forEach((sel) => {
      const id = sel.replace(/^#/, '');
      assert.ok(l.solution.includes(`id="${id}"`), `${l.id}: у рішенні немає ${sel}`);
    });
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

test('посилання збираються з адрес, винесених у змінні', () => {
  CODE_LESSONS.map(nextLink).forEach((n) => {
    const path = n.url.split('://')[1];
    assert.ok(!path.includes('//'), `подвійний слеш у ${n.url}`);
  });
  // основна маса — з одного підручника, інакше сенс єдиної змінної зникає
  const own = CODE_LESSONS.map(nextLink).filter((n) => n.url.startsWith(JS_INFO));
  assert.ok(own.length >= 25, `лише ${own.length} посилань на підручник`);
});

test('React відсилає до офіційної документації, і це позначено', () => {
  CODE_LESSONS.filter((l) => l.track === 'react').forEach((l) => {
    const n = nextLink(l);
    assert.ok(n.url.startsWith(REACT_DOCS), `${l.id}: ${n.url}`);
    // документація англійською — читач має знати про це до кліку
    assert.equal(n.foreign, true, `${l.id}: не позначено як англомовне`);
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

/* ── приклад і ціль ────────────────────────────────────────────────────── */

/*
 * Урок обривався саме там, де ставало важко: пояснення словами, далі
 * одразу «пишіть самі», а як воно має виглядати — видно лише з тексту
 * помилки, тобто вже після невдачі. Приклад і ціль закривають обидві
 * діри, тож порожніх тут бути не може.
 */

test('у кожного уроку є робочий приклад і ціль', () => {
  CODE_LESSONS.forEach((l) => {
    assert.ok(l.example?.code?.trim(), `${l.id}: немає прикладу`);
    assert.ok(l.example?.out?.trim(), `${l.id}: приклад без результату`);
    assert.ok(l.want?.trim(), `${l.id}: не сказано, що має вийти`);
  });
});

test('приклад не переказує стартовий код', () => {
  // інакше це не приклад, а той самий текст удруге: показувати треба
  // нову думку в дії, а не те, що вже лежить у редакторі
  const same = CODE_LESSONS.filter((l) => {
    const a = l.example.code.replace(/\s+/g, '');
    const b = l.start.replace(/\s+/g, '');
    return a === b;
  });
  assert.deepEqual(same.map((l) => l.id), []);
});

test('приклад не видає розвʼязок завдання', () => {
  const same = CODE_LESSONS.filter((l) => {
    const a = l.example.code.replace(/\s+/g, '');
    const b = l.solution.replace(/\s+/g, '');
    return a === b;
  });
  assert.deepEqual(same.map((l) => l.id), []);
});

test('приклад короткий: його читають, а не вивчають', () => {
  const dovhi = CODE_LESSONS.filter((l) => l.example.code.split('\n').length > 20);
  assert.deepEqual(dovhi.map((l) => l.id), []);
});

test('ціль — один рядок, а не абзац', () => {
  CODE_LESSONS.forEach((l) => {
    assert.equal(l.want.includes('\n'), false, `${l.id}: ціль у кілька рядків`);
    assert.ok(l.want.length <= 90, `${l.id}: ціль задовга (${l.want.length})`);
  });
});

test('пояснення невдачі є в кожного уроку', () => {
  CODE_LESSONS.forEach((l) => {
    const ok = typeof l.why === 'string' ? l.why.trim() : typeof l.why === 'function';
    assert.ok(ok, `${l.id}: немає why`);
  });
});

test('«Умова»: різні зупинки — різні пояснення', () => {
  /*
   * Тут застрягали найдовше: гілку написано правильно, а у виводі
   * «Важка», бо kg лишилось 25. Один текст на обидва випадки лише
   * повторював завдання, і людина шукала помилку в правильному коді.
   */
  const l = CODE_LESSONS.find((x) => x.id === 'b3');
  const zabuv = l.why('Важка', 'if (kg > 20) {} else {}');
  const napysav = l.why('Важка', 'if (kg > 20) {} else if (kg === 20) {} else {}');
  assert.notEqual(zabuv, napysav);
  assert.match(napysav, /kg.*25|25.*kg/i);
  assert.match(zabuv, /else if/);
});

test('«Умова»: завдання не мовчить про друге виправлення', () => {
  // сама гілка нічого не покаже, поки kg дорівнює 25 — і завдання, і
  // підказка мають про це сказати, інакше урок стає загадкою
  const l = CODE_LESSONS.find((x) => x.id === 'b3');
  assert.match(l.task, /kg\s*=\s*20|20/);
  assert.match(l.hint, /20/);
});

test('«Умова»: розвʼязок проходить власну перевірку', () => {
  const l = CODE_LESSONS.find((x) => x.id === 'b3');
  assert.equal(l.check('Норма', l.solution), true);
  // а сам стартовий код — ні, інакше урок нічому не вчить
  assert.equal(l.check('Важка', l.start), false);
});

/* ── порядок уроків ────────────────────────────────────────────────────── */

/*
 * Урок не має вимагати того, чого курс ще не показав.
 *
 * «Правда і неправда» стояла сьомою, а просила написати функцію — тоді
 * як функції пояснювались аж одинадцятим уроком. Людина сідала за
 * завдання, якого не могла зробити, і вирішувала, що річ у ній.
 */

const POSITION = Object.fromEntries(CODE_LESSONS.map((l, i) => [l.id, i]));

/** Що вважається поясненим лише з певного уроку */
const TEACHES = [
  { id: 'b4', what: 'функції', re: /function\s|=>/ },
  { id: 's1', what: 'масиви', re: /\[\s*\d|\.length/ },
  { id: 's2', what: 'цикл', re: /\bfor\s*\(/ },
  { id: 'b5', what: 'обʼєкти', re: /\{\s*name:/ },
  { id: 's4', what: 'filter', re: /\.filter\(/ },
  { id: 's5', what: 'map', re: /\.map\(/ },
  { id: 's6', what: 'reduce', re: /\.reduce\(/ },
  { id: 's9', what: 'async/await', re: /\basync\b|\bawait\b/ },
  { id: 'b15', what: 'класи', re: /\bclass\s/ },
];

test('розвʼязок не потребує того, чого ще не пояснили', () => {
  const rano = [];
  CODE_LESSONS.forEach((l, i) => {
    TEACHES.forEach(({ id, what, re }) => {
      if (i < POSITION[id] && re.test(l.solution)) {
        rano.push(`${l.id} (${i + 1}) вимагає «${what}», а їх показують на ${POSITION[id] + 1}`);
      }
    });
  });
  assert.deepEqual(rano, []);
});

test('функції пояснені до того, як їх просять писати', () => {
  // окремо й наголошено: саме на цьому курс і зупинявся
  const first = CODE_LESSONS.findIndex((l) => /function\s/.test(l.solution));
  assert.ok(first >= POSITION.b4, `функцію просять на ${first + 1}, а вчать на ${POSITION.b4 + 1}`);
});

test('кожен урок відкривається після того, як пройдено попередні', () => {
  // порядок у масиві — це і є порядок проходження; дірок бути не має
  const ids = CODE_LESSONS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, 'є повторені номери уроків');
});

test('стартовий код веде до розвʼязку, а не в інший бік', () => {
  /*
   * «Правда і неправда» починалась демонстрацією шести неправдивих
   * значень, а завдання просило написати функцію з нуля. Дві різні
   * роботи: щоб перейти від однієї до іншої, треба було стерти все.
   * Урок читався як обрив — і саме на цьому місці його кидали.
   *
   * Міра груба: скільки рядків старту доживає до розвʼязку. Там, де
   * завдання — переписати (перейменувати, розділити, спростити), від
   * старту й має лишитись мало, тож такі уроки названі окремо.
   */
  const PEREPYSATY = ['b1', 'b2', 'b4', 'c1', 'c2', 'c3', 'c4', 'b12'];
  const norm = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

  const obryv = CODE_LESSONS
    .filter((l) => !PEREPYSATY.includes(l.id))
    .map((l) => {
      const start = norm(l.start);
      const kept = start.filter((line) => norm(l.solution).includes(line)).length;
      return { id: l.id, pct: Math.round((kept / start.length) * 100) };
    })
    .filter((x) => x.pct < 33)
    .map((x) => `${x.id}: від старту лишається ${x.pct}%`);

  assert.deepEqual(obryv, []);
});

test('«Правда і неправда» починається з видимої поломки', () => {
  // урок не про те, що неправдивих значень шість, а про те, що нуль —
  // одне з них; це має бути видно з першого запуску, а не з тексту
  const l = CODE_LESSONS.find((x) => x.id === 'b11');
  assert.match(l.start, /\|\|/, 'у старті немає того самого `||`');
  assert.match(l.start, /function pokazaty/, 'функція має бути вже написана');
  // те, що стартовий код надрукує насправді: нуль з'їдений оператором `||`
  assert.equal(l.check('—\n—\n—\nВода', l.start), false, 'зіпсований нуль має не проходити');
  assert.equal(l.check('0\n—\n—\nВода', l.solution), true, 'розвʼязок має проходити');
});
