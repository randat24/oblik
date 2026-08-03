import { appendRow, ensureSheet, readSheet } from './sheets';

export const LOG_SHEET = 'Журнал';
export const LOG_HEADERS = ['Дата', 'Час', 'Лист', 'Рядок', 'Дія', 'Поле', 'Було', 'Стало'];

let ensured = false;

async function ensureLogSheet() {
  if (ensured) return;
  await ensureSheet(LOG_SHEET, LOG_HEADERS);
  ensured = true;
}

function kyivParts() {
  // Сервер працює в UTC, а журнал має читатися за київським часом
  const fmt = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const p = {};
  fmt.formatToParts(new Date()).forEach((x) => (p[x.type] = x.value));
  return { date: `${p.day}.${p.month}.${p.year}`, time: `${p.hour}:${p.minute}:${p.second}` };
}

const short = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return s.length > 200 ? s.slice(0, 197) + '…' : s;
};

/**
 * Дописує запис у журнал змін.
 * Помилка журналювання не має валити саму операцію, тож ковтається.
 */
export async function logChange({ sheet, row, action, field = '', before = '', after = '' }) {
  try {
    await ensureLogSheet();
    const { date, time } = kyivParts();
    await appendRow(LOG_SHEET, [
      date, time, sheet ?? '', row ?? '', action ?? '', field, short(before), short(after),
    ]);
  } catch (err) {
    console.error('Не вдалося записати в журнал:', err.message);
  }
}

/** Читає журнал, найновіші зверху */
export async function readLog(limit = 300) {
  try {
    const values = await readSheet(LOG_SHEET);
    if (!values || values.length < 2) return [];
    return values
      .slice(1)
      .map((r, i) => {
        const p = [...r];
        while (p.length < LOG_HEADERS.length) p.push('');
        return {
          row: i + 2,
          date: p[0], time: p[1], sheet: p[2], target: p[3],
          action: p[4], field: p[5], before: p[6], after: p[7],
        };
      })
      .filter((e) => e.date || e.action)
      .reverse()
      .slice(0, limit);
  } catch {
    return [];
  }
}
