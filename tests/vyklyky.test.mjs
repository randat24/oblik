/**
 * Чуже імʼя без імпорту.
 *
 * `savePatch` у `lib/health.js` два тижні кликав `readSheet` — функцію,
 * яку віддає сусідній `lib/sheets.js` і якої в цьому файлі немає. Поруч
 * лежала своя `read`. Збірка мовчала: у JavaScript невідоме імʼя стає
 * помилкою лише тоді, коли рядок справді виконають.
 *
 * А виконували його рідко — лише при збереженні прогресу. Тести туди не
 * дістають (там Google), перевірки в браузері теж (вони підмінюють
 * відповідь сервера). Тож усе зелене, а кожне збереження уроку падало з
 * «readSheet is not defined».
 *
 * Перевірка навмисно вузька: дивимось не на всі імена, а лише на ті, що
 * їх **віддає назовні інший модуль цієї ж теки**. Саме так і виглядає ця
 * помилка — рука потягнулась до сусіда, а імпорт лишився. Ширша
 * перевірка вимагала б розбирати JavaScript по-справжньому, а в уроках
 * усередині лапок лежить чужий код, і кожен приклад ставав би підозрою.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const LIB = new URL('../lib/', import.meta.url);
const files = readdirSync(LIB).filter((f) => f.endsWith('.js'));

/**
 * Код без рядків і коментарів.
 *
 * Половина цієї теки — тексти уроків, а в них усередині лапок лежить
 * чужий код: `splitParts()`, `session()`, навіть `Ctrl+P (`. Без цього
 * кроку кожен приклад із підручника ставав би підозрою.
 *
 * Скидач навмисно простий і не знає про регулярні вирази: скісна риска
 * для нього — звичайний символ. Через це він може збитись і чогось не
 * помітити — але не може нафантазувати зайвого, а саме зайве й убиває
 * довіру до перевірки.
 */
function bare(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    const two = code.slice(i, i + 2);
    if (two === '//') { while (i < code.length && code[i] !== '\n') i++; continue; }
    if (two === '/*') { i = code.indexOf('*/', i + 2); i = i < 0 ? code.length : i + 2; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      i++;
      while (i < code.length && code[i] !== c) i += code[i] === '\\' ? 2 : 1;
      i++;
      out += ' ';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const src = Object.fromEntries(files.map((f) => [f, bare(readFileSync(new URL(f, LIB), 'utf8'))]));

/** Що модуль віддає назовні */
function exportsOf(code) {
  const out = new Set();
  for (const m of code.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (const m of code.matchAll(/export\s+(?:const|let|class)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    String(m[1]).split(',').forEach((x) => {
      const n = x.trim().split(/\s+as\s+/).pop().trim();
      if (n) out.add(n);
    });
  }
  return out;
}

/** Що модуль знає в себе: імпортував або оголосив сам */
function knownIn(code) {
  const known = new Set();
  for (const m of code.matchAll(/import\s*\{([^}]*)\}/g)) {
    String(m[1]).split(',').forEach((x) => known.add(x.trim().split(/\s+as\s+/).pop().trim()));
  }
  for (const m of code.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) known.add(m[1]);
  for (const m of code.matchAll(/(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) known.add(m[1]);
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) known.add(m[1]);
  return known;
}

/**
 * Імена, які кличуть як функції: `foo(`, але не `.foo(`.
 *
 * Короткі імена не рахуються. У цій теці однолітерні `P`, `S`, `V`, `L`
 * — місцева скоропись для складання даних, і кличуть їх лише вдома;
 * натомість збігів на кшталт «Ctrl+P (» вони дають скільки завгодно.
 */
function calledIn(code) {
  const out = new Set();
  for (const m of code.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/gm)) {
    if (m[2].length >= 3) out.add(m[2]);
  }
  return out;
}

/** Усе, що віддає назовні бодай один модуль теки */
const PUBLIC = new Map();
files.forEach((f) => exportsOf(src[f]).forEach((n) => {
  if (!PUBLIC.has(n)) PUBLIC.set(n, f);
}));

test('модулі знайдено, і вони щось віддають назовні', () => {
  // якщо перелік спорожніє, наступний тест пройде, нічого не перевіривши
  assert.ok(files.length >= 15, `файлів лише ${files.length}`);
  assert.ok(PUBLIC.size >= 100, `експортів лише ${PUBLIC.size}`);
  assert.equal(PUBLIC.has('readSheet'), true, 'readSheet мав би бути серед експортів sheets.js');
});

test('жоден модуль не кличе сусідського імені без імпорту', () => {
  const bad = [];
  files.forEach((f) => {
    const known = knownIn(src[f]);
    calledIn(src[f]).forEach((name) => {
      const from = PUBLIC.get(name);
      if (from && from !== f && !known.has(name)) {
        bad.push(`${f}: кличе ${name}() з ${from}, не імпортувавши`);
      }
    });
  });
  assert.deepEqual(bad, []);
});

test('перевірка справді ловить такий випадок, а не мовчить завжди', () => {
  /*
   * Тест, який нічого не перевіряє, виглядає точнісінько як той, що
   * пройшов. Тому підробку ловимо навмисно — тим самим рядком, який два
   * тижні лежав у `savePatch`.
   */
  const bida = `
    import { getSheetsClient } from './sheets.js';
    async function read(sheet) { return sheet; }
    export async function save(sheet) {
      const rows = await readSheet(sheet);
      return rows.length;
    }
  `;
  const known = knownIn(bida);
  const missed = [...calledIn(bida)].filter((n) => PUBLIC.has(n) && !known.has(n));
  assert.deepEqual(missed, ['readSheet']);
});
