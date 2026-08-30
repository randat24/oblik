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
  if (v === undefined || v === null) return null;
  // «Команди» можуть віддати число текстом і з роздільниками: «7 470»,
  // «7,470», «7 470,5». Прибираємо пробіли, а кому тлумачимо за контекстом:
  // разом із крапкою вона розділяє тисячі, сама по собі — дробову частину.
  let t = String(v).replace(/[\s\u00a0\u202f]/g, '').trim();
  if (t === '') return null;
  if (t.includes(',') && t.includes('.')) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Діапазони, за межами яких число може бути лише помилкою заповнення.
 * Взяті з великим запасом: мета не «перевірити здоров'я», а зловити
 * підставлену не ту змінну — коли в вагу прилітають одинадцять тисяч кроків.
 */
const SANE = {
  weight: [20, 400],        // кг
  bodyFat: [3, 70],         // %
  pulse: [25, 250],         // уд/хв
  hrv: [1, 500],            // мс
  sleep: [0, 24],           // год
  stand: [0, 24],           // год
  workout: [0, 1440],       // хв за добу
  water: [0, 20000],        // мл
  steps: [0, 200000],
  burned: [0, 20000],       // ккал
  restEnergy: [0, 10000],   // ккал
  distance: [0, 500],       // км
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

  // Ключ приймаємо трьома способами: заголовком, у тілі або в адресі.
  // Заголовок надійніший, але в «Командах» його легко забути, а перевірити
  // налаштування простіше за посиланням.
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    || (req.body?.token || '')
    || (req.query?.token || '');
  if (!sameToken(String(given), secret)) {
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

  const body = req.body || {};
  const day = { date: (body.date || '').trim() || todayKyiv() };

  // беремо лише те, що справді надіслали: нуль теж значення, а порожнє — ні
  [
    'steps', 'burned', 'water', 'workout', 'sleep', 'weight',
    'pulse', 'hrv', 'distance', 'stand', 'restEnergy', 'bodyFat',
  ].forEach((k) => {
    const v = num(body[k]);
    if (v !== null) day[k] = v;
  });

  // Нуль у цих полях фізично неможливий — це або порожня дія в «Командах»,
  // або вручну вписаний нуль. Пропускаємо, щоб не затерти справжній замір.
  // Для кроків чи води нуль, навпаки, чесний: не ходив, не пив.
  ['pulse', 'hrv', 'weight', 'bodyFat'].forEach((k) => {
    if (day[k] === 0) delete day[k];
  });

  // Дві одиниці, у яких «Здоровʼя» майже завжди розходиться з нами.
  // Межі взяті із запасом: 0,5 % жиру й 30 мл води за добу не буває, тож
  // переплутати справжнє значення з чужою одиницею тут неможливо.
  if (day.bodyFat !== undefined && day.bodyFat > 0 && day.bodyFat <= 1) {
    day.bodyFat = Math.round(day.bodyFat * 1000) / 10;  // частка → відсотки
  }
  if (day.water !== undefined && day.water > 0 && day.water < 50) {
    day.water = Math.round(day.water * 1000);           // літри → мілілітри
  }

  // Межі здорового глузду. У «Командах» результат кожної дії зветься
  // однаково, тож переплутати змінні легко — і тоді кроки летять у вагу.
  // Такий запис перекриває справжній, і повертати доводиться руками через
  // історію Google Таблиць. Дешевше не пустити його всередину.
  const ignored = [];
  Object.entries(SANE).forEach(([k, [lo, hi]]) => {
    if (day[k] === undefined) return;
    if (day[k] < lo || day[k] > hi) {
      ignored.push(`${k}=${day[k]} (чекали ${lo}–${hi})`);
      delete day[k];
    }
  });

  if (Object.keys(day).length === 1) {
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
