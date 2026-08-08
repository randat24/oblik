import { saveDay, todayKyiv } from '../../lib/health';

/**
 * Прийом чисел ззовні — для «Команд» на iPhone. Вебсторінка не має доступу
 * до Apple Health, зате «Команди» мають: вони читають кроки чи спалені
 * калорії й надсилають їх сюди.
 *
 * Вмикається лише змінною HEALTH_INGEST_TOKEN. Поки її немає, маршрут не
 * існує взагалі — жодного способу дописати щось у розділ повз вхід.
 */
/**
 * Порожнє значення — це «не надсилали», а не нуль. Без цієї перевірки
 * Number('') дає 0, і поле, якого в запиті не було, затирало б збережене.
 */
const num = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
};

/** Порівняння, що не підказує довжиною збігу, скільки символів угадано */
function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function handler(req, res) {
  const secret = process.env.HEALTH_INGEST_TOKEN;
  if (!secret || secret.length < 16) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    || (req.body?.token || '');
  if (!sameToken(given, secret)) {
    return res.status(401).json({ error: 'Не той ключ' });
  }

  const body = req.body || {};
  const day = { date: (body.date || '').trim() || todayKyiv() };

  // беремо лише те, що справді надіслали: нуль теж значення, а порожнє — ні
  ['steps', 'burned', 'water', 'workout', 'sleep', 'weight'].forEach((k) => {
    const v = num(body[k]);
    if (v !== null) day[k] = v;
  });

  if (Object.keys(day).length === 1) {
    return res.status(400).json({ error: 'Немає жодного числа' });
  }

  try {
    await saveDay(day);
    return res.json({ ok: true, date: day.date, saved: Object.keys(day).filter((k) => k !== 'date') });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Помилка запису' });
  }
}
