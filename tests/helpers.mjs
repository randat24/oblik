/**
 * Спільне для тестів: зібрати рядок листа з людських назв полів.
 *
 * У самому коді індекси колонок позиційні, і саме це найлегше зламати —
 * тому тести описують дані іменами, а в масив їх розкладає одна функція.
 */
import { DELIVERY_HEADERS, DL } from '../lib/delivery.js';

/** { what: 'Вода', parts: 'A; B' } → рядок листа «Доставки» */
export function row(fields = {}) {
  const r = new Array(DELIVERY_HEADERS.length).fill('');
  Object.entries(fields).forEach(([key, value]) => {
    if (!(key in DL)) throw new Error(`Немає колонки «${key}» — перевірте DL`);
    r[DL[key]] = value === null || value === undefined ? '' : String(value);
  });
  return r;
}

/** Готовий двовимірний масив «як із таблиці»: заголовок + рядки */
export const sheet = (...rows) => [DELIVERY_HEADERS, ...rows.map(row)];

/** Фіксований «зараз», щоб тести не залежали від дня запуску */
export const NOW = Date.UTC(2026, 7, 20, 12, 0); // 20.08.2026 12:00 UTC
