import { appendRow, ensureSheet, readSheet, writeRow, fromSerial } from './sheets';
import { currentActor } from './auth';

export const LOG_SHEET = 'Журнал';
// «Хто» дописано в кінець: у журналі вже лежать рядки на дев'ять колонок,
// і вставка в середину зсунула б їх усі
export const LOG_HEADERS = ['Дата', 'Час', 'Лист', 'Рядок', 'Дія', 'Поле', 'Було', 'Стало', 'Фото', 'Хто'];

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
export async function logChange({
  sheet, row, action, field = '', before = '', after = '', photo = '', who = '',
}) {
  try {
    await ensureLogSheet();
    const { date, time } = kyivParts();
    await appendRow(LOG_SHEET, [
      date, time, sheet ?? '', row ?? '', action ?? '', field,
      // вхід спільним паролем не має лишати порожнє місце: це теж інформація.
      // `who` передають маршрути без сесії — там, де людина назвалась сама.
      short(before), short(after), photo, currentActor() || who || 'спільний вхід',
    ], { raw: true });
  } catch (err) {
    console.error('Не вдалося записати в журнал:', err.message);
  }
}

/** Читає журнал, найновіші зверху */
export async function readLog(limit = 300) {
  try {
    const values = await readSheet(LOG_SHEET);
    if (!values || values.length < 2) return [];
    // лист створений до появи колонки «Хто» — дописуємо заголовок
    if ((values[0] || []).length < LOG_HEADERS.length) {
      await writeRow(LOG_SHEET, 1, LOG_HEADERS);
    }
    return values
      .slice(1)
      .map((r, i) => {
        const p = [...r];
        while (p.length < LOG_HEADERS.length) p.push('');
        return {
          row: i + 2,
          date: fromSerial(p[0]), time: fromSerial(p[1], 'time'),
          sheet: p[2], target: p[3], action: p[4], field: p[5],
          before: p[6], after: p[7], photo: p[8], by: p[9],
        };
      })
      .filter((e) => e.date || e.action)
      .reverse()
      .slice(0, limit);
  } catch {
    return [];
  }
}
