import { appendRow, ensureSheet, readSheet } from './sheets';

export const ACTS_SHEET = 'Акти';
export const ACT_HEADERS = [
  'Дата', 'Час', 'Дія', 'Лист', 'Позиції', 'К-сть',
  'Хто віддав', 'Хто прийняв', 'Стан', 'Фото', 'Примітка',
];

export const ACT_KINDS = {
  accept: 'Прийнято',
  issue: 'Видано',
};

export const CONDITIONS = ['Нове', 'Робоче', 'Потребує ремонту', 'Пошкоджене', 'Некомплект'];

let ensured = false;

async function ensureActsSheet() {
  if (ensured) return;
  await ensureSheet(ACTS_SHEET, ACT_HEADERS);
  ensured = true;
}

function kyivParts() {
  const fmt = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = {};
  fmt.formatToParts(new Date()).forEach((x) => (p[x.type] = x.value));
  return { date: `${p.day}.${p.month}.${p.year}`, time: `${p.hour}:${p.minute}` };
}

/** Записує рядок акта. Помилка тут не має скасовувати вже внесені позиції. */
export async function appendAct({ kind, sheet, items, from, to, condition, photo, note, date }) {
  await ensureActsSheet();
  const { date: today, time } = kyivParts();
  const titles = items.map((it) => it.title).filter(Boolean).join('; ');

  await appendRow(ACTS_SHEET, [
    date || today,
    time,
    ACT_KINDS[kind] || kind,
    sheet,
    titles,
    items.length,
    from,
    to,
    condition || '',
    photo || '',
    note || '',
  ]);
  return { titles, count: items.length };
}

/** Читає акти, найновіші зверху */
export async function readActs(limit = 200) {
  try {
    const values = await readSheet(ACTS_SHEET);
    if (!values || values.length < 2) return [];
    return values
      .slice(1)
      .map((r, i) => {
        const p = [...r];
        while (p.length < ACT_HEADERS.length) p.push('');
        return {
          row: i + 2,
          date: p[0], time: p[1], kind: p[2], sheet: p[3], titles: p[4],
          count: p[5], from: p[6], to: p[7], condition: p[8], photo: p[9], note: p[10],
        };
      })
      .filter((a) => a.date || a.titles)
      .reverse()
      .slice(0, limit);
  } catch {
    return [];
  }
}
