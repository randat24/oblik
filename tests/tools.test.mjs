/**
 * Уроки про інструменти.
 *
 * Їх не можна перевірити запуском: те, чому вони вчать, відбувається в
 * терміналі людини, а не в застосунку. Тому вся вага лягає на текст — і
 * зіпсувати його тихо тут легше, ніж будь-де. Крок без «має статись»
 * виглядає як крок, але лишає людину без відповіді на питання «а чи
 * вийшло»; питання з правильним варіантом не на своєму місці зараховує
 * неправильну відповідь і нічого про це не каже.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { TOOL_LESSONS, toolById, toolStats, nextTool, NODE_DOWNLOAD } from '../lib/tools.js';
import { CODE_LESSONS } from '../lib/code.js';

/* ── склад ─────────────────────────────────────────────────────────────── */

test('усі id різні — на них тримається прогрес у таблиці', () => {
  const ids = TOOL_LESSONS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('id не збігаються з уроками курсу', () => {
  /*
   * Прогрес і тих, і тих лежить в одному листі, у рядку на id. Збіг
   * означав би, що урок про термінал і урок про змінні пишуть в одну
   * клітинку — і зараховуються разом.
   */
  const course = new Set(CODE_LESSONS.map((l) => l.id));
  const clash = TOOL_LESSONS.filter((l) => course.has(l.id)).map((l) => l.id);
  assert.deepEqual(clash, []);
});

test('уроки про інструменти не стоять у курсі', () => {
  // інакше вони зсунули б послідовність і закрили б собою наступний урок
  const ids = new Set(TOOL_LESSONS.map((l) => l.id));
  assert.deepEqual(CODE_LESSONS.filter((l) => ids.has(l.id)), []);
});

test('у кожного уроку є все, без чого сторінка не намалюється', () => {
  TOOL_LESSONS.forEach((l) => {
    ['id', 'kind', 'track', 'title', 'goal', 'task', 'want', 'hint', 'why'].forEach((f) => {
      assert.ok(l[f], `${l.id}: немає поля ${f}`);
    });
    assert.equal(l.kind, 'do', `${l.id}: не той вид`);
    assert.equal(l.track, 'tools', `${l.id}: не та доріжка`);
    assert.ok(Array.isArray(l.intro) && l.intro.length >= 2, `${l.id}: замало пояснення`);
  });
});

test('уроки не перевіряються запуском коду', () => {
  /*
   * Тут немає ні редактора, ні `check`. Якщо поле зʼявиться, кімната
   * уроку почне обіцяти перевірку, якої нема кому зробити.
   */
  TOOL_LESSONS.forEach((l) => {
    assert.equal(l.check, undefined, `${l.id}: узялась перевірка`);
    assert.equal(l.start, undefined, `${l.id}: узявся стартовий код`);
    assert.equal(l.solution, undefined, `${l.id}: узявся розвʼязок`);
  });
});

/* ── кроки ─────────────────────────────────────────────────────────────── */

test('у кожного уроку є кроки, і кожен каже, що має статись', () => {
  TOOL_LESSONS.forEach((l) => {
    assert.ok(Array.isArray(l.steps) && l.steps.length >= 3, `${l.id}: замало кроків`);
    l.steps.forEach((s, i) => {
      assert.ok(s.do && s.do.trim().length > 10, `${l.id}, крок ${i + 1}: немає що робити`);
      assert.ok(s.see && s.see.trim().length > 10, `${l.id}, крок ${i + 1}: немає що має статись`);
    });
  });
});

test('«має статись» — не повтор того, що робити', () => {
  // інакше крок не дає відповіді на єдине потрібне питання: чи вийшло
  const same = [];
  TOOL_LESSONS.forEach((l) => l.steps.forEach((s, i) => {
    if (s.do.trim() === s.see.trim()) same.push(`${l.id}:${i + 1}`);
  }));
  assert.deepEqual(same, []);
});

/* ── питання ───────────────────────────────────────────────────────────── */

test('у кожного уроку є питання, і правильний варіант існує', () => {
  TOOL_LESSONS.forEach((l) => {
    assert.ok(Array.isArray(l.verify) && l.verify.length >= 2, `${l.id}: замало питань`);
    l.verify.forEach((q, i) => {
      const at = `${l.id}, питання ${i + 1}`;
      assert.ok(q.ask && q.ask.trim().endsWith('?'), `${at}: питання без знака питання`);
      assert.ok(Array.isArray(q.options) && q.options.length >= 3, `${at}: замало варіантів`);
      assert.equal(new Set(q.options).size, q.options.length, `${at}: варіанти повторюються`);
      assert.ok(Number.isInteger(q.right), `${at}: правильний варіант не число`);
      assert.ok(q.right >= 0 && q.right < q.options.length, `${at}: правильний варіант поза переліком`);
      assert.ok(q.why && q.why.trim().length >= 40, `${at}: пояснення нічого не пояснює`);
    });
  });
});

test('правильний варіант не завжди перший', () => {
  /*
   * Не причіпка до стилю: людина, яка щоразу тицяє перший варіант, не
   * має проходити перевірку. Питання тут — єдине, що відрізняє «зробив»
   * від «прочитав».
   */
  const all = TOOL_LESSONS.flatMap((l) => l.verify.map((q) => q.right));
  assert.ok(new Set(all).size >= 1);
  assert.ok(all.some((r) => r !== 0), 'усі відповіді — перший варіант');
});

test('пояснення не переказує правильний варіант слово в слово', () => {
  const lazy = [];
  TOOL_LESSONS.forEach((l) => l.verify.forEach((q, i) => {
    if (q.why.trim() === q.options[q.right].trim()) lazy.push(`${l.id}:${i + 1}`);
  }));
  assert.deepEqual(lazy, []);
});

/* ── те, чого вимагає задум ────────────────────────────────────────────── */

test('є урок про перевірку чужого й написаного AI коду', () => {
  /*
   * Окремий тест, бо це не дрібниця тексту, а вимога до самого курсу:
   * код, який написав не ти, виглядає переконливо і коли правильний, і
   * коли ні. Пропаде згадка — пропаде єдине місце, де про це сказано.
   */
  const said = TOOL_LESSONS.some((l) => {
    const text = [...l.intro, ...l.verify.map((q) => `${q.ask} ${q.why}`)].join(' ');
    return /\bAI\b/.test(text) && /запуст/i.test(text);
  });
  assert.ok(said, 'ніде не сказано, як перевіряти код від AI');
});

test('Node радять брати LTS, а не найсвіжіший', () => {
  const text = TOOL_LESSONS.flatMap((l) => l.intro).join(' ');
  assert.ok(/LTS/.test(text));
  assert.ok(NODE_DOWNLOAD.startsWith('https://nodejs.org/'));
});

test('точних версій Node у тексті немає', () => {
  /*
   * Вони застаріють раніше за все інше в цьому файлі, а «беріть LTS»
   * лишиться правдою. Приклад виводу команди — не порада, тому
   * дозволений лише в тому, що «має статись».
   */
  const advice = TOOL_LESSONS.flatMap((l) => [...l.intro, l.task, l.want, l.hint]).join(' ');
  assert.ok(!/\bv?\d+\.\d+\.\d+\b/.test(advice), 'у пораді стоїть точна версія');
});

test('у тексті немає розмітки, якої сторінка не вміє', () => {
  /*
   * Сторінка знає рівно дві речі: `код` у зворотних лапках і **наголос**.
   * Посилання виду [текст](адреса) вона покаже як є — дужками, — і це
   * видно лише очима, бо тест на склад уроку такого не помічає. Саме так
   * і сталось у першому ж уроці про Node.
   */
  const bad = [];
  TOOL_LESSONS.forEach((l) => {
    const texts = [
      ...l.intro, l.task, l.want, l.hint, l.why,
      ...l.steps.flatMap((s) => [s.do, s.see]),
      ...l.verify.flatMap((q) => [q.ask, q.why, ...q.options]),
    ];
    texts.forEach((t) => {
      if (/\]\(/.test(t)) bad.push(`${l.id}: посилання розміткою`);
      // непарні лапки лишили б пів рядка моноширинним
      if ((t.match(/`/g) || []).length % 2) bad.push(`${l.id}: непарні лапки в «${t.slice(0, 40)}…»`);
      if ((t.match(/\*\*/g) || []).length % 2) bad.push(`${l.id}: непарні зірочки в «${t.slice(0, 40)}…»`);
    });
  });
  assert.deepEqual([...new Set(bad)], []);
});

test('зовнішнє посилання веде на першоджерело, а не кудись', () => {
  TOOL_LESSONS.filter((l) => l.next).forEach((l) => {
    assert.ok(l.next.url.startsWith('https://'), `${l.id}: не https`);
    assert.ok(l.next.t && l.next.d, `${l.id}: посилання без підпису`);
  });
});

/* ── стан ──────────────────────────────────────────────────────────────── */

test('toolById знаходить своє й не падає на чужому', () => {
  assert.equal(toolById('t1').id, 't1');
  assert.equal(toolById('b1'), null);
  assert.equal(toolById(''), null);
});

test('toolStats рахує лише зроблене', () => {
  assert.deepEqual(toolStats({}), { done: 0, total: TOOL_LESSONS.length });
  assert.deepEqual(toolStats(null), { done: 0, total: TOOL_LESSONS.length });
  const prog = { t1: { state: 'done' }, t2: { state: '' }, b1: { state: 'done' } };
  // урок курсу в рахунок інструментів не йде
  assert.equal(toolStats(prog).done, 1);
});

test('nextTool веде до першого незробленого', () => {
  assert.equal(nextTool({}).id, TOOL_LESSONS[0].id);
  assert.equal(nextTool({ t1: { state: 'done' } }).id, TOOL_LESSONS[1].id);
  const all = Object.fromEntries(TOOL_LESSONS.map((l) => [l.id, { state: 'done' }]));
  assert.equal(nextTool(all), null);
});
