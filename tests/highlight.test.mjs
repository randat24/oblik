import test from 'node:test';
import assert from 'node:assert/strict';

import { tokenize, modeOf, lineCount } from '../lib/highlight.js';
import { CODE_LESSONS } from '../lib/code.js';

const join = (code, mode) => tokenize(code, mode).map((x) => x.s).join('');
const kinds = (code, mode) => tokenize(code, mode).map((x) => x.t);
const of = (code, mode, type) => tokenize(code, mode).filter((x) => x.t === type).map((x) => x.s);

/* ── головне правило ───────────────────────────────────────────────────── */

/*
 * Розфарбування лежить прозорим шаром рівно під текстом, який набирають.
 * Загублений або дописаний символ зсуває все нижче — і літери роз'їжджаються
 * з кольором. Тому склеєні шматки мають дорівнювати вихідному коду завжди,
 * а не в більшості випадків.
 */

test('склеєні шматки дорівнюють вихідному коду — на всьому курсі', () => {
  CODE_LESSONS.forEach((l) => {
    const mode = modeOf(l.kind);
    [['start', l.start], ['solution', l.solution], ['example', l.example.code]]
      .forEach(([field, code]) => {
        assert.equal(join(code, mode), code, `${l.id}.${field}: текст змінився`);
      });
  });
});

test('склеєні шматки дорівнюють вихідному коду — на поламаному вводі', () => {
  // те, що людина бачить посеред набору: незакриті лапки, дужки, коментарі
  const rubbish = [
    "let a = 'незакрита",
    'let a = "теж незакрита\nlet b = 2;',
    '/* незакритий коментар',
    '<div class="незакрита',
    '<script>let a = 1;',
    '<style>p { color:',
    'const s = `рядок з ${вставкою}`;',
    'a < b > c',
    '',
    '\n\n\n',
    '   ',
    'кирилиця і emoji 🙂 у коді',
    '<!-- незакритий',
  ];
  rubbish.forEach((src) => {
    assert.equal(join(src, 'js'), src, `js: ${JSON.stringify(src)}`);
    assert.equal(join(src, 'html'), src, `html: ${JSON.stringify(src)}`);
  });
});

test('порожнє й відсутнє не падає', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(undefined), []);
});

test('жоден шматок не буває порожнім', () => {
  // порожній шматок — це зайвий вузол у розмітці й нічого більше
  CODE_LESSONS.forEach((l) => {
    tokenize(l.start, modeOf(l.kind)).forEach((x) => {
      assert.ok(x.s.length > 0, `${l.id}: порожній шматок`);
    });
  });
});

/* ── JavaScript ────────────────────────────────────────────────────────── */

test('ключові слова відрізняються від імен', () => {
  const t = tokenize('const kg = 7.7;', 'js');
  assert.equal(t[0].t, 'kw');
  assert.equal(t[0].s, 'const');
  assert.equal(of('const kg = 7.7;', 'js', 'kw').length, 1);
});

test('constanta — не ключове слово', () => {
  // збіг на початку слова не робить його ключовим
  assert.deepEqual(of('let constanta = 1;', 'js', 'kw'), ['let']);
  assert.deepEqual(of('obj.class = 1;', 'js', 'kw'), ['class']);
});

test('рядки в усіх трьох лапках', () => {
  assert.deepEqual(of("'а' + \"б\" + `в`", 'js', 'str'), ["'а'", '"б"', '`в`']);
});

test('екранована лапка не закриває рядок', () => {
  const src = "console.log('це \\'не\\' кінець');";
  assert.deepEqual(of(src, 'js', 'str'), ["'це \\'не\\' кінець'"]);
});

test('звичайний рядок не тягнеться на наступний рядок', () => {
  // інакше одна забута лапка фарбує півуроку
  const src = "let a = 'забув\nlet b = 2;";
  assert.deepEqual(of(src, 'js', 'str'), ["'забув"]);
  assert.deepEqual(of(src, 'js', 'kw'), ['let', 'let']);
});

test('коментарі: рядковий і блоковий', () => {
  assert.deepEqual(of('let a = 1; // хвіст', 'js', 'com'), ['// хвіст']);
  assert.deepEqual(of('/* усе\nразом */ let a;', 'js', 'com'), ['/* усе\nразом */']);
});

test('лапки всередині коментаря не починають рядок', () => {
  const src = "// тут 'лапка' сама по собі\nlet a = 1;";
  assert.deepEqual(of(src, 'js', 'str'), []);
});

test('числа з дробовою частиною — один шматок', () => {
  assert.deepEqual(of('const kg = 7.7 + 12;', 'js', 'num'), ['7.7', '12']);
});

test('теги JSX помітні в js-режимі', () => {
  const src = 'return <Bag name="Вода" />;';
  assert.deepEqual(of(src, 'js', 'tag'), ['<Bag']);
  assert.deepEqual(of(src, 'js', 'str'), ['"Вода"']);
});

test('менше й більше не стають тегами', () => {
  assert.deepEqual(of('if (a < b) {}', 'js', 'tag'), []);
  assert.deepEqual(of('kg > 20', 'js', 'tag'), []);
});

/* ── сторінка ──────────────────────────────────────────────────────────── */

test('тег, атрибут і значення — різні шматки', () => {
  const src = '<p id="stan">текст</p>';
  assert.deepEqual(of(src, 'html', 'tag'), ['<p', '>', '</p', '>']);
  assert.deepEqual(of(src, 'html', 'attr'), ['id']);
  assert.deepEqual(of(src, 'html', 'str'), ['"stan"']);
});

test('js усередині <script> розбирається як js', () => {
  const src = '<script>\n  const kg = 7.7; // тут\n</script>';
  assert.deepEqual(of(src, 'html', 'kw'), ['const']);
  assert.deepEqual(of(src, 'html', 'num'), ['7.7']);
  assert.deepEqual(of(src, 'html', 'com'), ['// тут']);
});

test('css усередині <style> знає властивості', () => {
  const src = '<style>\n  p { color: gray; font-size: 20px; }\n</style>';
  const attrs = of(src, 'html', 'attr');
  assert.ok(attrs.includes('color'), 'немає color');
  assert.ok(attrs.includes('font-size'), 'немає font-size');
  assert.deepEqual(of(src, 'html', 'num'), ['20']);
});

test('коментар сторінки', () => {
  assert.deepEqual(of('<!-- нічого --><p>а</p>', 'html', 'com'), ['<!-- нічого -->']);
});

test('текст між тегами лишається текстом', () => {
  const src = '<h1>Облік майна</h1>';
  const t = tokenize(src, 'html');
  assert.ok(t.some((x) => x.t === 'txt' && x.s.includes('Облік майна')));
});

test('«<» у тексті сторінки нічого не ламає', () => {
  const src = '<p>2 < 3</p>';
  assert.equal(join(src, 'html'), src);
});

/* ── дрібне ────────────────────────────────────────────────────────────── */

test('modeOf: сторінка — html, решта — js', () => {
  assert.equal(modeOf('page'), 'html');
  assert.equal(modeOf('js'), 'js');
  assert.equal(modeOf('react'), 'js');
});

test('lineCount рахує рядки так само, як їх видно', () => {
  assert.equal(lineCount('a'), 1);
  assert.equal(lineCount('a\nb'), 2);
  assert.equal(lineCount('a\n'), 2);   // порожній рядок у кінці теж рядок
  assert.equal(lineCount(''), 1);
  assert.equal(lineCount(null), 1);
});

test('номерів рівно стільки, скільки рядків у кожному уроці', () => {
  CODE_LESSONS.forEach((l) => {
    assert.equal(lineCount(l.start), l.start.split('\n').length, l.id);
  });
});

/* ── шар із кольором має лишатись видимим ──────────────────────────────── */

test('поле коду лишається прозорим і під курсором', async () => {
  /*
   * Спільне правило `textarea:focus` ставить непрозоре тло й важче за
   * клас. Через це кольоровий шар зникав рівно тоді, коли в поле
   * клацали, — тобто завжди, коли ним користуються. Правило нижче має
   * лишитись і стояти після спільного.
   */
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../styles/globals.css', import.meta.url), 'utf8');

  const own = css.indexOf('.cd-ed-in:focus');
  const shared = css.indexOf('textarea:focus');
  assert.ok(own > 0, 'немає правила .cd-ed-in:focus');
  assert.ok(shared > 0 && own > shared, 'правило редактора має стояти після спільного');

  const rule = css.slice(own, css.indexOf('}', own));
  assert.match(rule, /background:\s*transparent/, 'тло під курсором не прозоре');
});
