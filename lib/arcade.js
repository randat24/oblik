/**
 * Аркада: очки, серія, рекорд.
 *
 * Тут лише рахунок — скільки коштує відповідь, коли серія дістає ім'я і
 * що показати в підсумку раунду. Жодного React, жодного читання таблиць:
 * ціну відповіді має бути видно й без гри, в одному тесті.
 *
 * Чому взагалі очки. Аркада вже вміє рівні, життя й годинник, але
 * відповідь у ній нічого не варта: правильна просто веде до наступної.
 * Очки роблять видимою різницю між «згадав» і «пригадав за пів секунди
 * до кінця» — а саме її ми й тренуємо.
 *
 * Чому ціна така. Дві ручки, обидві зрозумілі на око:
 *
 *   швидкість — десять, двадцять або тридцять за відповідь;
 *   серія     — множник від одного до чотирьох.
 *
 * Разом виходить від 10 до 120, і число на екрані завжди кругле. Більше
 * ручок давати не варто: коли гравець не може пояснити, звідки взялося
 * число, воно перестає бути нагородою.
 *
 * Складність окремого множника не отримує навмисно. Чим вищий рівень,
 * тим менше часу на відповідь — а швидкісні пороги рахуються в частках
 * того часу. На першому рівні найдорожчий поріг це три секунди, на
 * двадцятому — півтори. Рівень платить сам, без ще одного коефіцієнта.
 */

/** Ціна найповільнішої правильної відповіді */
export const BASE = 10;

/**
 * Пороги серії.
 *
 * `at` — скільки правильних поспіль потрібно, `mult` — у скільки разів
 * дорожчає відповідь. Назви українські й короткі, щоб уміщались у
 * плашку на телефоні.
 */
export const TIERS = [
  { at: 3, name: 'Розгін', mult: 2 },
  { at: 6, name: 'Чудово', mult: 3 },
  { at: 10, name: 'Супер', mult: 4 },
];

/** Найвищий досягнутий поріг або `null`, доки серія коротка */
export function tierOf(combo) {
  let hit = null;
  for (const t of TIERS) if (combo >= t.at) hit = t;
  return hit;
}

/** Наступний поріг — щоб показати, скільки лишилось до нього */
export function nextTier(combo) {
  return TIERS.find((t) => combo < t.at) || null;
}

/** Множник за серію. Поки серія коротка — один, тобто без множення. */
export function comboMult(combo) {
  return tierOf(combo)?.mult ?? 1;
}

/**
 * Наскільки швидко відповіли: 2 — дуже швидко, 1 — вчасно, 0 — на межі.
 *
 * Рахуємо в частках відпущеного часу, а не в секундах, бо час на рівнях
 * різний. Третина годинника, що лишилась, — це той самий «згадав одразу»
 * і на дев'яти секундах, і на чотирьох.
 */
export function speedStep(secondsLeft, seconds) {
  if (!(seconds > 0)) return 0;
  const left = Math.max(0, Math.min(secondsLeft, seconds)) / seconds;
  if (left >= 2 / 3) return 2;
  if (left >= 1 / 3) return 1;
  return 0;
}

/**
 * Ціна однієї відповіді.
 *
 * `combo` — скільки правильних поспіль було ДО цієї відповіді. Так
 * третя правильна вже дістає множник «Розгону», а не четверта: поріг
 * обіцяли на третій, на третій його й видно.
 */
export function pointsFor({ right, secondsLeft = 0, seconds = 0, combo = 0 }) {
  if (!right) return 0;
  const step = speedStep(secondsLeft, seconds);
  return (BASE + step * BASE) * comboMult(combo + 1);
}

/**
 * Стан серії після відповіді.
 *
 * Серія рветься і на помилці, і на вичерпаному годиннику — інакше
 * найдешевший спосіб тримати множник це перечекати важкий приклад.
 *
 * Повертає ще й `tier` — поріг, якщо його щойно взяли саме цією
 * відповіддю. Плашку «Чудово — 6 поспіль» показуємо раз, у мить
 * переходу, а не на кожній наступній відповіді.
 */
export function step(state, answer) {
  const { score = 0, combo = 0, bestCombo = 0 } = state || {};
  const { right, secondsLeft = 0, seconds = 0 } = answer || {};

  if (!right) {
    return { score, combo: 0, bestCombo, gained: 0, tier: null };
  }

  const gained = pointsFor({ right: true, secondsLeft, seconds, combo });
  const next = combo + 1;
  const before = tierOf(combo);
  const now = tierOf(next);

  return {
    score: score + gained,
    combo: next,
    bestCombo: Math.max(bestCombo, next),
    gained,
    tier: now && now.name !== before?.name ? now : null,
  };
}

/**
 * Розжарення — наскільки «розігрітий» екран: 0, доки серії немає, далі
 * по одному за взятий поріг. Сторінка міняє тло за цим числом, і більше
 * воно ні на що не впливає: гра не має ставати складнішою від того, що
 * вона стала яскравішою.
 */
export function heatOf(combo) {
  return TIERS.filter((t) => combo >= t.at).length;
}

/** Чи це рекорд. Рівний рахунок рекордом не вважаємо — його вже бачили. */
export const isRecord = (score, best) => score > (best || 0);

/**
 * Швидкість пригадування — середнє по правильних відповідях, у секундах.
 *
 * Саме по правильних: час помилки каже не про пам'ять, а про те, скільки
 * людина вагалась перед тим, як схибити. Нема правильних — нема й числа,
 * і тоді в підсумку його просто не показуємо.
 */
export function recallSpeed(results) {
  const ok = (results || []).filter((r) => r && r.right && Number.isFinite(r.ms));
  if (!ok.length) return null;
  const avg = ok.reduce((a, r) => a + r.ms, 0) / ok.length / 1000;
  return Math.round(avg * 10) / 10;
}

/**
 * Підсумок раунду — те, що показуємо на картці наприкінці.
 *
 * Окремою функцією, бо підсумок рахується з того самого, що вже зібрано
 * під час гри, і помилитись у ньому легко: «точність» від нуля відповідей
 * дає NaN, а він на екрані виглядає як поломка.
 */
export function roundSummary({ score = 0, best = 0, bestCombo = 0, level = 1, results = [] } = {}) {
  const total = results.length;
  const right = results.filter((r) => r && r.right).length;
  return {
    score,
    record: isRecord(score, best),
    best: Math.max(score, best || 0),
    bestCombo,
    level,
    total,
    right,
    accuracy: total ? Math.round((right / total) * 100) : null,
    recall: recallSpeed(results),
  };
}
