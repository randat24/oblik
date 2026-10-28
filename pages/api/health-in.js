import { sameSecret, keyFrom } from '../../lib/auth';
import { saveDay, todayKyiv } from '../../lib/health';
import { dayFromBody, hasNumbers } from '../../lib/vitals';

/**
 * Прийом чисел ззовні — для «Команд» на iPhone. Вебсторінка не має доступу
 * до Apple Health, зате «Команди» мають: вони читають кроки чи спалені
 * калорії й надсилають їх сюди.
 *
 * Вмикається лише змінною HEALTH_INGEST_TOKEN. Поки її немає, маршрут не
 * існує взагалі — жодного способу дописати щось у розділ повз вхід.
 */
export default async function handler(req, res) {
  const secret = process.env.HEALTH_INGEST_TOKEN;
  if (!secret || secret.length < 16) {
    return res.status(404).json({ error: 'Not found' });
  }

  // Ключ приймаємо трьома способами: заголовком, у тілі або в адресі.
  // Заголовок надійніший, але в «Командах» його легко забути, а перевірити
  // налаштування простіше за посиланням.
  if (!sameSecret(String(keyFrom(req)), secret)) {
    return res.status(401).json({ error: 'Не той ключ' });
  }

  // Перевірка налаштувань: відкрити в браузері й побачити, що ключ підходить.
  // Нічого не записує.
  if (req.method === 'GET') {
    return res.json({ ok: true, message: 'Ключ правильний. Тепер надсилайте POST.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { day, ignored } = dayFromBody(req.body, todayKyiv());
  if (!hasNumbers(day)) {
    return res.status(400).json({ error: 'Немає жодного числа' });
  }

  try {
    await saveDay(day);
    // Віддаємо не лише назви полів, а й числа. Перелік назв каже тільки те,
    // що щось дійшло; побачити, що кроки опинились у вазі, можна лише за
    // значеннями — а відповідь команди видно одразу на телефоні.
    const saved = { ...day };
    delete saved.date;
    return res.json({ ok: true, date: day.date, saved, ...(ignored.length ? { ignored } : {}) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Помилка запису' });
  }
}
