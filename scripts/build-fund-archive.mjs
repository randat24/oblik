// Збирає lib/fund-archive-data.js зі старої таблиці «каса ВУ».
//
//   node scripts/build-fund-archive.mjs шлях/до/каса.csv
//
// CSV — експорт аркуша «Аркуш1» як є. Скрипт запускають один раз: стара
// таблиця закрита, нових рядків у ній не буде. Нічого не пише в таблицю
// фонду; результат — звичайний модуль у репозиторії, який читає /api/fund.

import fs from 'node:fs';
import { parseOldTable, typedTotals, reconcile } from '../lib/fund-archive.js';

const file = process.argv[2];
if (!file) { console.error('Вкажіть шлях до CSV'); process.exit(1); }

/** Мінімальний розбір CSV з лапками й переносами рядків усередині клітинки */
function parseCsv(text) {
  const grid = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false; } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); grid.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); grid.push(row); }
  return grid;
}

const grid = parseCsv(fs.readFileSync(file, 'utf8'));
const rows = parseOldTable(grid);
const typed = typedTotals(grid);
const check = reconcile(rows, typed);
const bad = check.filter((c) => c.diff !== 0);
if (bad.length) {
  console.error('Рядки не сходяться з підсумками таблиці:', bad);
  process.exit(2);
}

const out = `// Згенеровано scripts/build-fund-archive.mjs зі старої таблиці «каса ВУ».
// Руками не правити: старий облік закрито, цей файл — його копія.
export const ARCHIVE = ${JSON.stringify({
  source: 'каса ВУ',
  until: rows.at(-1).date,
  typed,
  rows,
})};
`;
fs.writeFileSync(new URL('../lib/fund-archive-data.js', import.meta.url), out);
console.log(`Рядків: ${rows.length}, до ${rows.at(-1).date}. Підсумки сходяться.`);
