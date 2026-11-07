/**
 * Вхідні: повідомлення, які людина сама переслала з Signal.
 *
 * Бота в групі немає навмисно: він тримав би ключі й розшифровані повідомлення
 * військової групи на сервері. Тут людина натискає «Поділитися» на одному
 * повідомленні, і застосунок бачить лише його. Текст не розбираємо на витрати
 * чи майно: що з ним робити, вирішує той, хто прочитав.
 *
 * Тут лише правила — ні React, ні читання таблиць.
 */

export const INBOX_SHEET = 'Вхідні — Signal';

/* Нові колонки — лише в кінець: читання позиційне */
export const INBOX_HEADERS = ['ID', 'Дата', 'Час', 'Текст', 'Від', 'Опрацював', 'Опрацьовано'];
export const IC = { id: 0, date: 1, time: 2, text: 3, from: 4, doneBy: 5, doneAt: 6 };

export const MAX_TEXT = 5000;
const MAX_FROM = 60;

const str = (v) => (v === null || v === undefined ? '' : String(v)).trim();

/**
 * Тіло запиту від швидкої команди → `{ text, from }` або `{ error }`.
 * Задовгий текст — відмова, а не обрізка: відповідь команди видно на телефоні,
 * а мовчки обрізане повідомлення ніхто не помітить.
 */
export function messageFrom(body) {
  const text = str(body?.text);
  if (!text) return { error: 'Порожнє повідомлення' };
  if (text.length > MAX_TEXT) return { error: `Задовге повідомлення: можна до ${MAX_TEXT} знаків` };
  return { text, from: str(body?.from).slice(0, MAX_FROM) };
}

/** Повідомлення → рядок листа в порядку INBOX_HEADERS */
export function inboxRow(m) {
  const r = new Array(INBOX_HEADERS.length).fill('');
  r[IC.id] = m.id; r[IC.date] = m.date; r[IC.time] = m.time; r[IC.text] = m.text; r[IC.from] = m.from;
  return r;
}

/** Рядки листа → повідомлення, новіші зверху. Номер рядка — до відсіювання порожніх. */
export function parseInbox(values) {
  return (values || []).slice(1)
    .map((r, i) => (str((r || [])[IC.id]) ? {
      row: i + 2,
      id: str(r[IC.id]), date: str(r[IC.date]), time: str(r[IC.time]), text: str(r[IC.text]),
      from: str(r[IC.from]), doneBy: str(r[IC.doneBy]), doneAt: str(r[IC.doneAt]),
    } : null))
    .filter(Boolean)
    .reverse();
}

/** Опрацьоване: «хто» буває порожнім на спільному вході, тож дивимось і на час */
export const isDone = (m) => !!(m.doneAt || m.doneBy);

/** Що віддати екрану: межа лише на опрацьовані, бо нове не має загубитись за старим */
export function visibleInbox(items, limit) {
  return [...items.filter((m) => !isDone(m)), ...items.filter(isDone).slice(0, limit)];
}
