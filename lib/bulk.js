// Розширення в імпортах сусідів стоїть навмисно: файл покритий тестами, а
// вбудований у Node запускач шукає модуль рівно за тим шляхом, який написали.

/**
 * «Додати кілька»: партія однакових речей одним заходом.
 *
 * Рації приходять по девʼять-десять штук: та сама модель, той самий статус,
 * різняться лише серійник і власний номер. Вносити їх по одній — девʼять
 * разів та сама форма, і на шостій хтось ставить номер 354 удруге. Тут
 * людина вставляє стовпчик серійників, а решту застосунок розкладає сам:
 * номери йдуть підряд від стартового, спільні поля копіюються в кожен рядок.
 *
 * Тут лише правила; читає й пише маршрут `/api/item`, показує — `pages/index`.
 */

import { normalizeSn } from './dupes.js';

/** Більше за раз не приймаємо: це партія, а не перенесення всієї таблиці */
export const BULK_MAX = 200;

/**
 * Вставлений текст → серійники.
 *
 * Ділимо за рядками, комами, крапками з комою й табуляцією — так виглядає
 * стовпчик, скопійований з таблиці, накладної чи повідомлення. Пробіл
 * усередині не ділить: «SN 1234» буває одним серійником. Повтори в самій
 * вставці прибираємо, але повертаємо окремо, щоб людина їх побачила.
 */
export function parseSerials(text) {
  const list = [];
  const repeated = [];
  const seen = new Set();
  String(text ?? '').split(/[\n\r,;\t]+/).map((s) => s.trim()).filter(Boolean).forEach((s) => {
    const key = normalizeSn(s) || s;
    if (seen.has(key)) { repeated.push(s); return; }
    seen.add(key);
    list.push(s);
  });
  return { list, repeated };
}

/** Наступний вільний номер: найбільший числовий у колонці + 1 */
export function nextId(rows, idIdx) {
  if (!(idIdx >= 0)) return null;
  let max = 0;
  (rows || []).forEach((r) => {
    const m = String((r || [])[idIdx] ?? '').trim().match(/^\d+$/);
    if (m) max = Math.max(max, Number(m[0]));
  });
  return max + 1;
}

/**
 * Рядки для запису.
 *
 * `base` — спільні значення для всіх (назва, статус, де, дата…), `serials` —
 * по одному на рядок, `startId` — номер першого; далі підряд.
 */
export function bulkRows({ base, idIdx, snIdx, serials, startId }) {
  const start = Number(startId);
  return (serials || []).map((sn, i) => {
    const r = [...(base || [])];
    if (snIdx >= 0) r[snIdx] = sn;
    if (idIdx >= 0 && Number.isInteger(start)) r[idIdx] = String(start + i);
    return r.map((v) => (v === undefined || v === null ? '' : String(v)));
  });
}

/**
 * Що завадить записати партію: серійники, які вже є в листі, і номери, які
 * вже зайняті. Порівняння серійників — як у пошуку повторів (`normalizeSn`):
 * «865-ecbe597» і «865ECBE597» — та сама рація.
 */
export function bulkConflicts({ existing, rows, idIdx, snIdx }) {
  const sns = new Map();
  const ids = new Map();
  (existing || []).forEach((r, i) => {
    const sn = snIdx >= 0 ? normalizeSn((r || [])[snIdx]) : '';
    if (sn && !sns.has(sn)) sns.set(sn, i + 2);
    const id = idIdx >= 0 ? String((r || [])[idIdx] ?? '').trim() : '';
    if (id && !ids.has(id)) ids.set(id, i + 2);
  });
  const snTaken = [];
  const idTaken = [];
  (rows || []).forEach((r) => {
    const sn = snIdx >= 0 ? normalizeSn(r[snIdx]) : '';
    if (sn && sns.has(sn)) snTaken.push({ value: r[snIdx], row: sns.get(sn) });
    const id = idIdx >= 0 ? String(r[idIdx] ?? '').trim() : '';
    if (id && ids.has(id)) idTaken.push({ value: id, row: ids.get(id) });
  });
  return { snTaken, idTaken };
}
