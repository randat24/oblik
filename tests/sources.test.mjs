/**
 * Джерела, версії й те, що застаріло.
 *
 * Два тихі способи збрехати тут.
 *
 * Перший — написати «перевірено» там, де нічого не відкривали. Людина
 * повірить і не перевірить сама, а помітить це хіба що через рік, коли
 * посилання виявиться мертвим.
 *
 * Другий — числа версій. Вони протухають першими: бібліотеку оновлюють
 * однією командою, а сторінка ще рік каже старе число з упевненим
 * виглядом. Тому вони звіряються з `package.json` тут, а не на віру.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SOURCES, VERSIONS, NODE, OLD_WAYS, HOW_TO_READ, CHECK_DAY,
  sourceById, sourceOf, sourceStats,
} from '../lib/sources.js';
import { ABC } from '../lib/abc.js';
import { CODE_LESSONS, nextLink } from '../lib/code.js';
import { TOOL_LESSONS } from '../lib/tools.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/* ── версії ────────────────────────────────────────────────────────────── */

test('версії на сторінці збігаються з тими, що в package.json', () => {
  /*
   * Головний тест цього файла. Оновили Next однією командою, а сторінка
   * ще рік каже старе число — і каже впевнено, бо звідки їй знати.
   */
  const bad = [];
  VERSIONS.forEach((v) => {
    const want = String(pkg.dependencies[v.dep] || '').replace(/^[\^~]/, '');
    if (!want) bad.push(`${v.name}: у package.json немає «${v.dep}»`);
    else if (want !== v.have) bad.push(`${v.name}: на сторінці ${v.have}, у package.json ${want}`);
  });
  assert.deepEqual(bad, []);
});

test('кожна версія пояснена словами, а не лише числом', () => {
  // саме число нічого не каже тому, хто вчиться: потрібно, що це таке
  VERSIONS.forEach((v) => {
    assert.ok(v.note && v.note.length > 40, `${v.name}: немає пояснення`);
  });
});

test('версія Node стоїть із датою перевірки', () => {
  /*
   * Єдине число, звірене з першоджерелом, — і єдине, яке застаріє саме
   * собою. Без дати воно перетворюється на «LTS — це 24», що стане
   * неправдою за кілька місяців.
   */
  assert.match(NODE.lts, /^\d+\.\d+\.\d+$/);
  assert.match(NODE.checked, /^\d{2}\.\d{2}\.\d{4}$/);
  assert.equal(sourceById(NODE.source).state, 'ok');
});

/* ── чесність позначок ─────────────────────────────────────────────────── */

test('«перевірено» стоїть лише там, де є дата перевірки', () => {
  SOURCES.forEach((s) => {
    if (s.state === 'ok') {
      assert.match(s.checked || '', /^\d{2}\.\d{2}\.\d{4}$/, `${s.id}: «ok» без дати`);
    } else {
      assert.equal(s.checked, undefined, `${s.id}: не «ok», а дата перевірки стоїть`);
      assert.match(s.tried || '', /^\d{2}\.\d{2}\.\d{4}$/, `${s.id}: немає дати спроби`);
    }
  });
});

test('перевіреним названо саме те, що справді відкривали', () => {
  /*
   * З цього оточення назовні відкритий лише nodejs.org — решту ріже
   * проксі. Якщо в переліку «перевірених» колись зʼявиться щось іще, це
   * має бути свідомим рішенням, а не опискою.
   */
  const ok = SOURCES.filter((s) => s.state === 'ok').map((s) => s.id);
  assert.deepEqual(ok, ['node']);
  assert.equal(sourceStats().checked, 1);
  assert.equal(sourceStats().checked + sourceStats().blocked, sourceStats().total);
});

test('у кожного джерела сказано, чого від нього не чекати', () => {
  /*
   * `watch` — не причіпка. «MDN українською» звучить добре, доки не
   * виявиться, що перекладена третина; «підручник» звучить як
   * першоджерело, доки не розійдеться з ним.
   */
  SOURCES.forEach((s) => {
    ['id', 'title', 'host', 'url', 'who', 'kind', 'good', 'watch'].forEach((f) => {
      assert.ok(s[f], `${s.id}: немає поля ${f}`);
    });
    assert.ok(s.watch.length > 40, `${s.id}: «зважайте» ні про що`);
    assert.ok(s.url.startsWith('https://'), `${s.id}: не https`);
    assert.ok(s.url.includes(s.host), `${s.id}: адреса не з того вузла`);
  });
});

test('усі id джерел різні', () => {
  const ids = SOURCES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

/* ── звʼязок із рештою застосунку ──────────────────────────────────────── */

test('кожне зовнішнє посилання уроку належить відомому джерелу', () => {
  /*
   * Посилання на сайт, якого немає в переліку, — це саме те, від чого цей
   * розділ мав би берегти: людина йде за ним, не знаючи ні чиє воно, ні
   * наскільки свіже.
   */
  const stray = [];
  CODE_LESSONS.forEach((l) => {
    const n = nextLink(l);
    if (n && !sourceOf(n.url)) stray.push(`${l.id} → ${n.url}`);
  });
  TOOL_LESSONS.filter((l) => l.next).forEach((l) => {
    if (!sourceOf(l.next.url)) stray.push(`${l.id} → ${l.next.url}`);
  });
  assert.deepEqual(stray, []);
});

test('sourceOf упізнає адресу й не вигадує на чужій', () => {
  assert.equal(sourceOf('https://react.dev/learn/state').id, 'react');
  assert.equal(sourceOf('https://uk.javascript.info/variables').id, 'jsinfo');
  assert.equal(sourceOf('https://chuzhyi-sait.com/stattia'), null);
  assert.equal(sourceOf(''), null);
  assert.equal(sourceOf(null), null);
});

test('sourceById знаходить своє й не падає на чужому', () => {
  assert.equal(sourceById('mdn').host, 'developer.mozilla.org');
  assert.equal(sourceById('немає такого'), null);
});

/* ── що застаріло ──────────────────────────────────────────────────────── */

test('у кожного застарілого способу є теперішній, причина й прикмета', () => {
  /*
   * «Як упізнати» — найкорисніший рядок: людина не шукає застаріле, вона
   * просто знаходить статтю. Без цього рядка запис перетворюється на
   * перелік, який ніхто не памʼятає.
   */
  const topics = new Set(ABC.map((a) => a.id));
  OLD_WAYS.forEach((o) => {
    ['id', 'old', 'now', 'why', 'spot', 'topic'].forEach((f) => {
      assert.ok(o[f], `${o.id}: немає поля ${f}`);
    });
    assert.notEqual(o.old.trim(), o.now.trim(), `${o.id}: спосіб той самий`);
    assert.ok(o.why.length > 60, `${o.id}: причина ні про що`);
    assert.ok(o.spot.length > 30, `${o.id}: за чим упізнавати — не сказано`);
    assert.ok(topics.has(o.topic), `${o.id}: невідома тема ${o.topic}`);
  });
  const ids = OLD_WAYS.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('застаріле не оголошено мертвим, коли воно просто старе', () => {
  /*
   * Класові компоненти й ланцюжки `.then` працюють і нікуди не зникли.
   * Сказати новачкові «це не працює» — збрехати, і він це виявить у
   * першому ж чужому проєкті.
   */
  const cls = OLD_WAYS.find((o) => o.id === 'class');
  assert.match(cls.why, /працюють|нікуди не зникли/);
  const then = OLD_WAYS.find((o) => o.id === 'then');
  assert.match(then.why, /не помилка|робочий/);
});

/* ── як читати знайдене ────────────────────────────────────────────────── */

test('останнє правило читання — запустити й подивитись', () => {
  /*
   * Те саме, що й для коду від AI, і навмисно те саме: стаття, форум і
   * відповідь від AI перевіряються однаково.
   */
  assert.ok(HOW_TO_READ.length >= 4);
  assert.match(HOW_TO_READ[HOW_TO_READ.length - 1].d, /[Зз]апуст|бачив вивід/);
  HOW_TO_READ.forEach((r) => {
    assert.ok(r.t && r.d && r.d.length > 40, `«${r.t}»: пояснення ні про що`);
  });
});

test('день останньої звірки записаний одним місцем', () => {
  // інакше дати розʼїжджаються, і жодній із них уже не віриш
  assert.match(CHECK_DAY, /^\d{2}\.\d{2}\.\d{4}$/);
  assert.equal(NODE.checked, CHECK_DAY);
  SOURCES.filter((s) => s.state === 'blocked').forEach((s) => {
    assert.equal(s.tried, CHECK_DAY, `${s.id}: інша дата спроби`);
  });
});
