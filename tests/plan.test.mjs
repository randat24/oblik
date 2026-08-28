import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PLAN, COURSE, CHUNK, lessonOf, nextSteps, planProgress } from '../lib/plan.js';
import { CODE_LESSONS } from '../lib/code.js';

/*
 * План відсилає до справжніх файлів цього застосунку — у цьому вся його
 * цінність. Файл, який перейменували чи прибрали, перетворює крок на
 * тупик: людина відкриває вказане місце й не знаходить нічого. Тому
 * посилання перевіряються, а не просто написані.
 */

test('кожен крок посилається на файл, який справді існує', async () => {
  const missing = [];
  for (const s of PLAN) {
    try {
      await readFile(new URL('../' + s.file, import.meta.url), 'utf8');
    } catch {
      missing.push(`${s.n}. ${s.topic} → ${s.file}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('кожен крок описаний повністю', () => {
  PLAN.forEach((s) => {
    ['topic', 'read', 'why', 'file', 'find', 'task'].forEach((k) => {
      assert.ok(String(s[k] || '').trim(), `крок ${s.n}: немає «${k}»`);
    });
  });
});

test('кроки пронумеровані підряд', () => {
  assert.deepEqual(PLAN.map((s) => s.n), PLAN.map((_, i) => i + 1));
});

test('кожен крок звʼязаний з наявним уроком', () => {
  const bad = PLAN.filter((s) => !lessonOf(s)).map((s) => `${s.n}: немає уроку ${s.lesson}`);
  assert.deepEqual(bad, []);
});

test('план іде тим самим порядком, що й уроки', () => {
  // інакше він відсилав би до уроку, який ще закритий
  const at = (id) => CODE_LESSONS.findIndex((l) => l.id === id);
  const pos = PLAN.map((s) => at(s.lesson));
  const sorted = [...pos].sort((a, b) => a - b);
  assert.deepEqual(pos, sorted, 'кроки плану випереджають порядок уроків');
});

test('завдання кроку — дія, а не читання', () => {
  // «прочитайте розділ» уже сказано в read; тут має бути що зробити руками
  PLAN.forEach((s) => {
    assert.ok(s.task.length > 25, `крок ${s.n}: завдання надто коротке`);
  });
});

test('nextSteps показує тільки те, чим зайнятись зараз', () => {
  const nic = nextSteps({});
  assert.equal(nic.length, CHUNK);
  assert.equal(nic[0].n, 1);

  const troshky = nextSteps({ b1: { state: 'done' }, b2: { state: 'done' } });
  assert.equal(troshky[0].n, 3, 'пройдене має зникати з початку');
});

test('nextSteps не падає на порожньому й неповному стані', () => {
  assert.equal(nextSteps().length, CHUNK);
  assert.equal(nextSteps({ b1: null }).length, CHUNK);
  assert.equal(nextSteps({ b1: { state: '' } })[0].n, 1);
});

test('коли все пройдено — показувати нічого', () => {
  const use = Object.fromEntries(PLAN.map((s) => [s.lesson, { state: 'done' }]));
  assert.deepEqual(nextSteps(use), []);
  assert.deepEqual(planProgress(use), { ready: PLAN.length, total: PLAN.length });
});

test('planProgress рахує лише пройдене', () => {
  assert.deepEqual(planProgress({}), { ready: 0, total: PLAN.length });
  assert.deepEqual(planProgress({ b1: { state: 'done' } }), { ready: 1, total: PLAN.length });
});

test('джерело назване, а не мається на увазі', () => {
  // «візьміть якийсь курс» — це не відповідь тому, хто на нулі
  assert.ok(COURSE.name.trim());
  assert.ok(COURSE.what.length > 30);
});

test('план не переказує розбори, а відсилає до них', async () => {
  /*
   * Розбори власного коду зʼявились раніше за план і роблять те саме,
   * тільки докладніше. Дві інструкції про той самий файл поруч — це
   * роздвоєння, а не подвійна користь.
   */
  const { tourOf } = await import('../lib/plan.js');
  const { TOURS } = await import('../lib/tour.js');

  const broken = PLAN.filter((s) => s.tour && !tourOf(s)).map((s) => `${s.n}: немає розбору ${s.tour}`);
  assert.deepEqual(broken, []);

  // якщо розбір указаний — він має бути про той самий файл
  const mismatch = PLAN
    .filter((s) => s.tour)
    .filter((s) => tourOf(s).file !== s.file)
    .map((s) => `${s.n}: крок про ${s.file}, а розбір про ${tourOf(s).file}`);
  assert.deepEqual(mismatch, []);

  assert.ok(TOURS.length > 0);
});
