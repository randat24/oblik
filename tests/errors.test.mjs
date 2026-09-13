/**
 * Каталог помилок.
 *
 * Він вартий рівно стільки, скільки знаходиться. Запис, який не
 * впізнається за вставленим червоним рядком, не існує: людина подивиться
 * й піде шукати деінде. Тому головне тут — не склад записів, а те, що
 * справжній текст помилки веде до потрібного.
 *
 * Рядки нижче — те, що справді друкують браузери, Node і Git, разом зі
 * стеком і власними іменами змінних. Саме в такому вигляді їх і
 * вставлятимуть.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ERRORS, ERR_GROUPS, matchError, findErrors, errorById, errorStats,
  errorsOfTopic, norm,
} from '../lib/errors.js';
import { ABC } from '../lib/abc.js';
import { CODE_LESSONS } from '../lib/code.js';
import { REF_CARDS } from '../lib/ref.js';

/* ── склад ─────────────────────────────────────────────────────────────── */

test('усі id різні', () => {
  const ids = ERRORS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('у кожного запису є все, без чого картка не намалюється', () => {
  ERRORS.forEach((e) => {
    ['id', 'g', 'msg', 'means', 'find', 'bad', 'good', 'topic'].forEach((f) => {
      assert.ok(e[f], `${e.id}: немає поля ${f}`);
    });
    assert.ok(ERR_GROUPS.some((g) => g.key === e.g), `${e.id}: невідома група ${e.g}`);
    assert.ok(['throw', 'quiet', 'case'].includes(e.kind), `${e.id}: невідомий вид ${e.kind}`);
  });
});

test('у кожної помилки названо причини, і в кожної причини — лік', () => {
  /*
   * Запис без ліку — це співчуття, а не допомога. «Так буває, коли дані
   * ще не прийшли» лишає людину рівно там, де вона стояла.
   */
  ERRORS.forEach((e) => {
    assert.ok(e.causes.length >= 2, `${e.id}: менше двох причин`);
    e.causes.forEach((c, i) => {
      assert.ok(c.c && c.c.length > 15, `${e.id}, причина ${i + 1}: надто коротка`);
      assert.ok(c.fix && c.fix.length > 15, `${e.id}, причина ${i + 1}: немає ліку`);
      assert.notEqual(c.c.trim(), c.fix.trim(), `${e.id}: лік переказує причину`);
    });
  });
});

test('зламаний і полагоджений приклади різні', () => {
  ERRORS.forEach((e) => {
    assert.notEqual(e.bad.trim(), e.good.trim(), `${e.id}: приклади збігаються`);
  });
});

test('теми, уроки й картки в записах справді існують', () => {
  // посилання в нікуди виглядає так само, як робоче, — просто нічого не робить
  const topics = new Set(ABC.map((a) => a.id));
  const lessons = new Set(CODE_LESSONS.map((l) => l.id));
  const cards = new Set(REF_CARDS.map((c) => c.id));
  const bad = [];
  ERRORS.forEach((e) => {
    if (!topics.has(e.topic)) bad.push(`${e.id} → тема ${e.topic}`);
    if (e.lesson && !lessons.has(e.lesson)) bad.push(`${e.id} → урок ${e.lesson}`);
    if (e.ref && !cards.has(e.ref)) bad.push(`${e.id} → картка ${e.ref}`);
  });
  assert.deepEqual(bad, []);
});

test('мовчазні помилки лежать у своїй групі', () => {
  // вони не падають, і плутати їх із червоними не можна
  ERRORS.filter((e) => e.kind === 'quiet').forEach((e) => {
    assert.equal(e.g, 'quiet', `${e.id}: мовчазна, а група інша`);
  });
  assert.ok(errorStats().quiet >= 3);
});

test('у кожній групі щось є', () => {
  errorStats().byGroup.forEach((g) => {
    assert.ok(g.count > 0, `група «${g.label}» порожня`);
  });
});

/* ── упізнавання ───────────────────────────────────────────────────────── */

/** Те, що справді друкують браузери, Node і Git */
const REAL = [
  ['undef-read', "Uncaught TypeError: Cannot read properties of undefined (reading 'map')\n    at ZbirCard (zbir.js:214:23)"],
  ['undef-read', 'TypeError: kropyvy is undefined'],
  ['undef-read', "TypeError: undefined is not an object (evaluating 'data.items.map')"],
  ['null-read', "Uncaught TypeError: Cannot read properties of null (reading 'value')"],
  ['not-a-function', 'Uncaught TypeError: rows.map is not a function'],
  ['not-defined', 'Uncaught ReferenceError: vaha is not defined'],
  ['const-assign', 'Uncaught TypeError: Assignment to constant variable.'],
  ['tdz', "ReferenceError: Cannot access 'total' before initialization"],
  ['syntax', "Uncaught SyntaxError: Unexpected token '}'"],
  ['stack', 'Uncaught RangeError: Maximum call stack size exceeded'],
  ['json-html', `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`],
  ['json-parse', 'SyntaxError: Unexpected end of JSON input'],
  ['react-key', 'Warning: Each child in a list should have a unique "key" prop. Check the render method of `List`.'],
  ['react-child', 'Objects are not valid as a React child (found: object with keys {name, kg})'],
  ['react-rerender', 'Too many re-renders. React limits the number of renders to prevent an infinite loop.'],
  ['react-hooks', 'Rendered more hooks than during the previous render.'],
  ['hydration', "Hydration failed because the server rendered HTML didn't match the client."],
  ['failed-fetch', 'Uncaught (in promise) TypeError: Failed to fetch'],
  ['failed-fetch', 'NetworkError when attempting to fetch resource.'],
  ['cors', "Access to fetch at 'https://x.com/api' from origin 'http://localhost:3000' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource."],
  ['http-404', 'GET http://localhost:3000/api/helth 404 (Not Found)'],
  ['http-500', 'POST http://localhost:3000/api/health 500 (Internal Server Error)'],
  ['http-401', 'GET http://localhost:3000/api/health 401 (Unauthorized)'],
  ['no-module', "Error: Cannot find module 'react'"],
  ['no-module', "Module not found: Can't resolve './lib/code'"],
  ['port-busy', 'Error: listen EADDRINUSE: address already in use :::3000'],
  ['cmd-not-found', 'zsh: command not found: npm'],
  ['cmd-not-found', "'npm' is not recognized as an internal or external command"],
  ['not-a-repo', 'fatal: not a git repository (or any of the parent directories): .git'],
  ['push-rejected', 'Updates were rejected because the remote contains work that you do not have locally.'],
  ['merge-conflict', 'CONFLICT (content): Merge conflict in lib/code.js'],
];

REAL.forEach(([id, text]) => {
  test(`впізнає: ${text.split('\n')[0].slice(0, 60)}`, () => {
    const found = matchError(text);
    assert.ok(found.length, 'не знайшлось нічого');
    assert.equal(found[0].id, id, `знайшлось «${found[0].id}» замість «${id}»`);
  });
});

test('кожен запис упізнається хоч за одним справжнім рядком', () => {
  /*
   * Не формальність: запис, доданий без перевірки на справжньому тексті,
   * знайде хіба що той, хто вже знає, що він тут є.
   */
  const covered = new Set(REAL.map(([id]) => id));
  const lonely = ERRORS
    .filter((e) => e.kind === 'throw' && !covered.has(e.id))
    .map((e) => e.id);
  // мовчазні й «випадки» шукають словами: вставляти там нема чого
  assert.deepEqual(lonely, []);
});

test('мовчазні знаходяться словами', () => {
  assert.ok(findErrors('nan').some((e) => e.id === 'nan'));
  assert.ok(findErrors('дата').some((e) => e.id === 'invalid-date'));
  assert.ok(findErrors('нуль').some((e) => e.id === 'zero-empty'));
  assert.ok(matchError('На екрані [object Object]').some((e) => e.id === 'object-object'));
});

test('стек із номерами рядків не збиває пошук', () => {
  /*
   * `zbir.js:401:12` — це рядок і стовпець, а не код відповіді. Доти,
   * доки вони лишались у тексті, стек із 401-го рядка знаходив запис про
   * доступ.
   */
  const found = matchError('TypeError: rows.map is not a function\n    at Card (zbir.js:401:12)');
  assert.equal(found[0].id, 'not-a-function');
  assert.ok(!found.some((e) => e.id === 'http-401'), 'номер рядка спрацював як код відповіді');
});

test('чужий текст не знаходить нічого — і це чесніше за здогад', () => {
  assert.deepEqual(matchError('сьогодні гарна погода'), []);
  assert.deepEqual(matchError(''), []);
  assert.deepEqual(matchError(null), []);
});

test('порожній запит показує весь каталог, а не порожнечу', () => {
  assert.equal(findErrors('').length, ERRORS.length);
  assert.equal(findErrors('   ').length, ERRORS.length);
});

test('пошук словами шукає всі слова разом', () => {
  assert.ok(findErrors('порожнє поле').length > 0);
  assert.equal(findErrors('порожнє жодногослова').length, 0);
});

test('точніша ознака стоїть вище за коротшу', () => {
  // «cannot read propert» + «undefined» — два збіги, «is undefined» — один
  const found = matchError("Cannot read properties of undefined (reading 'x')");
  assert.equal(found[0].id, 'undef-read');
});

/* ── дрібниці ──────────────────────────────────────────────────────────── */

test('norm прибирає регістр, зайві пробіли й номери рядків', () => {
  assert.equal(norm('  Foo   BAR '), 'foo bar');
  assert.equal(norm('at x (a.js:12:34)'), 'at x (a.js )');
  assert.equal(norm(null), '');
});

test('errorById знаходить своє й не падає на чужому', () => {
  assert.equal(errorById('undef-read').id, 'undef-read');
  assert.equal(errorById('немає такого'), null);
});

test('помилки теми знаходяться за темою — звідси абетка веде в каталог', () => {
  assert.ok(errorsOfTopic('err').length > 0);
  assert.deepEqual(errorsOfTopic('немає такої теми'), []);
});
