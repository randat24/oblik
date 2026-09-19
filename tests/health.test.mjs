import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * Особистий розділ і головна таблиця — різні бази.
 *
 * За HEALTH_SPREADSHEET_ID листи «Особистого» лежать в окремому файлі, і
 * помічники з lib/sheets.js туди не дивляться: вони жорстко ходять у
 * SPREADSHEET_ID. Тому lib/health.js має власні `read`, `append`,
 * `writeRow` — і бере зі спільного модуля лише клієнта.
 *
 * Перевірка не теоретична. Відкат чужої правки лишив у savePatch виклик
 * `readSheet`, якого в модулі немає: кожне збереження прогресу — множення,
 * абетка, уроки — падало з «readSheet is not defined». Дописати імпорт
 * було б ще гірше: прогрес пішов би в головну таблицю замість особистої,
 * і то вже мовчки.
 */

const SRC = readFileSync(new URL('../lib/health.js', import.meta.url), 'utf8');

/** Помічники lib/sheets.js, які ходять у головну таблицю */
const MAIN_TABLE_HELPERS = [
  'readSheet', 'appendRow', 'appendRows', 'writeCells', 'writeRow_',
  'ensureSheet', 'deleteRow', 'todayStr', 'fromSerial', 'findColumns',
];

test('особистий розділ бере зі спільного модуля лише клієнта', () => {
  const imports = [...SRC.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/sheets\.js'/g)]
    .flatMap((m) => m[1].split(',').map((x) => x.trim()));
  assert.deepEqual(imports, ['getSheetsClient'],
    'усе інше має бути своє — інакше запис піде в чужу таблицю');
});

test('у lib/health.js немає викликів помічників головної таблиці', () => {
  MAIN_TABLE_HELPERS.forEach((name) => {
    const used = new RegExp(`(?<![.\\w$])${name}\\s*\\(`).test(SRC);
    assert.equal(used, false, `${name}() тут не працює: модуль читає свою таблицю`);
  });
});

test('кожен помічник, який розділ викликає, у ньому ж і оголошений', () => {
  const declared = new Set();
  for (const m of SRC.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)) {
    declared.add(m[1]);
  }
  for (const m of SRC.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:const|let)\s+(\w+)/g)) {
    declared.add(m[1]);
  }
  for (const m of SRC.matchAll(/import\s*\{([^}]+)\}/g)) {
    m[1].split(',').forEach((x) => declared.add(x.trim().split(/\s+as\s+/).pop().trim()));
  }

  // своя робота з таблицею — те, що ламається найтихіше
  ['read', 'readMany', 'append', 'writeRow', 'removeRow', 'ensureSheets']
    .forEach((name) => assert.ok(declared.has(name), `${name} має бути оголошений у модулі`));

  // і жодного виклику імені, якого модуль не знає
  const known = new Set([...declared,
    'Object', 'Array', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Date', 'Promise',
    'Error', 'Set', 'Map', 'RegExp', 'parseInt', 'parseFloat', 'isNaN', 'Intl', 'console',
    'fetch', 'AbortController', 'setTimeout', 'clearTimeout', 'structuredClone',
    'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'await', 'new',
  ]);
  // параметри й деструктуризація — щоб не ловити хибні тривоги
  for (const m of SRC.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=/g)) {
    m[1].split(',').forEach((x) => known.add(x.trim().split(':').pop().trim().split('=')[0].trim()));
  }
  for (const m of SRC.matchAll(/\(([^)]*)\)\s*(?:=>|\{)/g)) {
    m[1].split(',').forEach((x) => {
      const n = x.trim().split(/[:=\s]/)[0].replace(/[{}[\].]/g, '');
      if (n) known.add(n);
    });
  }

  const unknown = new Set();
  for (const m of SRC.matchAll(/(?<![.\w$])(\w+)\s*\(/g)) {
    if (!known.has(m[1])) unknown.add(m[1]);
  }
  assert.deepEqual([...unknown], [], 'виклик імені, якого немає, — це падіння на першому ж записі');
});
