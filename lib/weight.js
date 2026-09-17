/**
 * Розумна вага — читання цифр замість їх показу.
 *
 * Ваги показують число, і це найменш корисне, що з ними можна зробити:
 * денна вага гуляє на кілограм від солі, води й того, скільки лежить у
 * кишківнику, а жиру за добу не набирається більше ніж сто-двісті грамів
 * фізично. Тому людина бачить «+0,9» і робить хибний висновок.
 *
 * Тут — лише обчислення: швидкість зміни, прогноз, темп, чому стрибнуло,
 * чи сходиться дефіцит. Ніякого React і ніякого читання таблиць, щоб
 * висновки можна було перевірити окремо від екрана.
 */

/** «16.08.2026» → мітка часу */
export function stampOf(d) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(d || '').trim());
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0;
}

export function dateOf(ms) {
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

const DAY = 86400000;
const r1 = (x) => Math.round(x * 10) / 10;

/** Записи з вагою, від старих до нових */
const points = (days) => (days || [])
  .filter((d) => d && d.weight != null && stampOf(d.date))
  .map((d) => ({ ...d, t: stampOf(d.date) }))
  .sort((a, b) => a.t - b.t);

/**
 * Згладжена вага — експоненційне середнє.
 *
 * Просте середнє за сім днів запізнюється на пів тижня: воно однаково
 * важить учорашнє зважування й те, що було шість днів тому. Експоненційне
 * дає більшу вагу свіжому, тож розворот видно одразу, а разовий стрибок
 * усе одно розчиняється.
 */
export function smooth(days, alpha = 0.25) {
  const pts = points(days);
  let cur = null;
  return pts.map((p) => {
    cur = cur === null ? p.weight : cur + alpha * (p.weight - cur);
    return { d: p.date, t: p.t, v: cur, raw: p.weight };
  });
}

/**
 * Швидкість зміни, кг за тиждень. Рахуємо по згладженій лінії за останні
 * `span` днів: різниця двох денних зважувань — це різниця двох випадкових
 * чисел, а не швидкість.
 */
export function rate(days, span = 14) {
  const s = smooth(days);
  if (s.length < 2) return null;
  const end = s[s.length - 1];
  const from = end.t - span * DAY;
  const win = s.filter((x) => x.t >= from);
  if (win.length < 2) return null;
  const first = win[0];
  const dt = (end.t - first.t) / DAY;
  if (dt < 3) return null;      // менш як три доби — це ще не швидкість
  return { kgWeek: ((end.v - first.v) / dt) * 7, days: dt, from: first.d, to: end.d };
}

/**
 * Коли буде ціль за нинішнього темпу. Прогноз чесний: якщо темп веде не
 * туди, дати немає — не треба вигадувати числа, яких не буде.
 */
export function forecast(days, goal) {
  const s = smooth(days);
  const r = rate(days);
  if (!s.length || !goal || !r) return null;
  const now = s[s.length - 1].v;
  const need = now - goal;
  if (Math.abs(need) < 0.2) return { done: true };
  // рух не в бік цілі — прогнозувати нема чого
  if (need > 0 && r.kgWeek >= -0.05) return { stalled: true, kgWeek: r.kgWeek };
  if (need < 0 && r.kgWeek <= 0.05) return { stalled: true, kgWeek: r.kgWeek };
  const weeks = Math.abs(need / r.kgWeek);
  return {
    weeks,
    kgWeek: r.kgWeek,
    date: dateOf(s[s.length - 1].t + Math.round(weeks * 7) * DAY),
    left: r1(need),
  };
}

/**
 * Чи здоровий темп.
 *
 * Понад один відсоток маси на тиждень — це вже не жир: організм не встигає
 * стільки віддати й починає розбирати мʼязи. Менш як чверть відсотка —
 * рух є, але настільки повільний, що його не відрізнити від похибки ваг.
 */
export function pace(days, weight) {
  const r = rate(days);
  if (!r || !weight) return null;
  const pctWeek = (Math.abs(r.kgWeek) / weight) * 100;
  const dir = r.kgWeek < -0.05 ? 'down' : r.kgWeek > 0.05 ? 'up' : 'flat';
  let level = 'good';
  if (dir === 'flat') level = 'flat';
  else if (pctWeek > 1) level = 'fast';
  else if (pctWeek < 0.25) level = 'slow';
  return { dir, level, pctWeek, kgWeek: r.kgWeek, days: r.days };
}

/**
 * Чому стрибнуло.
 *
 * Найчастіше питання до ваг — «звідки кілограм за ніч». Відповідь майже
 * завжди та сама: вода. Сто грамів жиру — це 900 ккал понад норму, тож
 * кілограм жиру за добу означав би зайвих девʼять тисяч. Показуємо межу
 * фізики й те, що з учорашнього дня могло затримати воду.
 */
export function explainJump(days, kcalGoal) {
  const pts = points(days);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const gap = Math.round((last.t - prev.t) / DAY);
  const delta = last.weight - prev.weight;
  if (gap < 1 || gap > 3 || Math.abs(delta) < 0.4) return null;

  const causes = [];
  // дивимось день перед зважуванням: саме він і відклався
  const src = pts[pts.length - 2];
  const kcal = src.kcal || 0;
  if (delta > 0) {
    if (kcalGoal && kcal > kcalGoal + 300) causes.push(`напередодні ${Math.round(kcal)} ккал за норми ${Math.round(kcalGoal)}`);
    if (src.water > 0 && src.water < 1500) causes.push(`мало води — ${Math.round(src.water)} мл`);
    if (src.steps > 0 && src.steps < 4000) causes.push(`мало руху — ${Math.round(src.steps)} кроків`);
    if (src.sleep > 0 && src.sleep < 6) causes.push(`сон ${src.sleep} год`);
  } else {
    if (kcalGoal && kcal > 0 && kcal < kcalGoal - 300) causes.push(`напередодні ${Math.round(kcal)} ккал — менше за норму`);
    if (src.steps > 8000) causes.push(`${Math.round(src.steps)} кроків`);
  }

  /*
   * Скільки жиру фізично могло змінитись. У кілограмі жиру 7700 ккал, тож
   * рахуємо з реального перебору над нормою, а не з припущень: зʼїли на
   * тисячу більше — це сто тридцять грамів жиру, хоч би що показали ваги.
   * Без записаного раціону беремо стелю в 150 г на добу — більше просто
   * не встигає відкластись.
   */
  const over = kcalGoal && kcal > 0 ? Math.max(0, kcal - kcalGoal) : 0;
  const maxFat = over ? Math.max(0.05, r1(over / 7700)) : r1(0.15 * gap);

  return { delta: r1(delta), gap, causes, maxFat, over: Math.round(over), date: last.date };
}

/**
 * Чи сходиться з'їдене з тим, що показують ваги.
 *
 * У кілограмі жиру близько 7700 ккал. Якщо ваги кажуть мінус пів
 * кілограма на тиждень, це приблизно 550 ккал дефіциту щодня. Коли
 * записаний раціон дає геть інше число, справа не в обміні речовин —
 * справа в тому, що записано не все.
 */
export function deficit(days, kcalGoal, span = 14) {
  const r = rate(days, span);
  if (!r) return null;
  const pts = points(days);
  const from = pts[pts.length - 1].t - span * DAY;
  const eaten = pts.filter((d) => d.t >= from && d.kcal > 0);
  if (eaten.length < 5) return null;

  const avgKcal = eaten.reduce((a, d) => a + d.kcal, 0) / eaten.length;
  const realDaily = (r.kgWeek * 7700) / 7;      // мінус — дефіцит
  const planDaily = kcalGoal ? avgKcal - kcalGoal : null;

  return {
    avgKcal: Math.round(avgKcal),
    days: eaten.length,
    realDaily: Math.round(realDaily),
    planDaily: planDaily === null ? null : Math.round(planDaily),
    // розбіжність понад 400 ккал — це вже не похибка ваг
    gap: planDaily === null ? null : Math.round(planDaily - realDaily),
  };
}

/**
 * Застій: згладжена вага майже не рухається довше двох тижнів. Це не
 * привід різати їжу — спершу варто подивитись на сантиметр і на те, чи
 * все записано.
 */
export function plateau(days, span = 14) {
  const r = rate(days, span);
  if (!r || r.days < 10) return null;
  return Math.abs(r.kgWeek) < 0.15 ? { days: Math.round(r.days), kgWeek: r.kgWeek } : null;
}

/**
 * Талія проти ваги. Коли вага стоїть, а талія йде — це не застій, а
 * рекомпозиція: жир пішов, вода й мʼязи прийшли. Побачити це можна лише
 * сантиметром, ваги про це не знають.
 */
/**
 * Висновки — те, заради чого все решта.
 *
 * Кожен має бути або похвалою за конкретне число, або дією. «Стежте за
 * харчуванням» — не висновок; «за два тижні мінус 0,1 кг, а талія мінус
 * 2 см — жир іде, вага стоїть через воду» — висновок.
 *
 * Порядок важливий: спершу те, що вимагає дії, потім пояснення, потім
 * підтвердження. Читають зазвичай перший рядок.
 */
export function verdicts({ days, body, goal, kcalGoal, weight }) {
  const out = [];
  const add = (tone, text) => out.push({ tone, text });

  const p = pace(days, weight);
  const f = forecast(days, goal);
  const flat = plateau(days);
  const waist = waistTrend(body);
  const d = deficit(days, kcalGoal);
  const jump = explainJump(days, kcalGoal);
  const wantDown = goal && weight ? weight > goal : true;

  // 1. Темп — головне питання «чи туди я йду»
  if (p && p.level === 'fast' && p.dir === 'down') {
    add('warn', `Мінус ${r1(Math.abs(p.kgWeek))} кг на тиждень — це ${r1(p.pctWeek)}% маси. `
      + 'Понад один відсоток організм добирає з мʼязів, а не з жиру. Додайте 200–300 ккал.');
  } else if (p && p.level === 'good' && ((p.dir === 'down') === !!wantDown)) {
    add('ok', `${p.dir === 'down' ? 'Мінус' : 'Плюс'} ${r1(Math.abs(p.kgWeek))} кг на тиждень `
      + `(${r1(p.pctWeek)}% маси) — саме той темп, за якого йде жир, а не мʼязи.`);
  } else if (p && p.dir !== 'flat' && wantDown && p.dir === 'up') {
    add('warn', `Вага росте на ${r1(p.kgWeek)} кг на тиждень, хоч ціль нижча. `
      + 'Подивіться на записаний раціон за останній тиждень.');
  }

  // 2. Застій — і чим його перевірити
  if (flat) {
    if (waist && waist.cm <= -1) {
      add('ok', `Вага стоїть ${flat.days} днів, але талія за цей час мінус ${Math.abs(waist.cm)} см. `
        + 'Це не застій: жир іде, вода й мʼязи його маскують. Нічого не міняйте.');
    } else {
      add('warn', `Вага стоїть ${flat.days} днів. Спершу перевірте, чи все записано: `
        + 'застій найчастіше не в обміні речовин, а в незаписаних перекусах.');
    }
  }

  // 3. Чи сходиться з'їдене з тим, що на вагах
  if (d && d.gap !== null && Math.abs(d.gap) >= 400) {
    if (d.gap < 0) {
      add('warn', `За записами ви їсте в дефіциті ${Math.abs(d.planDaily)} ккал, а ваги показують `
        + `${Math.abs(d.realDaily)}. Різниця ${Math.abs(d.gap)} ккал на день — зазвичай це те, `
        + 'що з\'їдено, але не записано.');
    } else {
      add('ok', `Ваги показують більший дефіцит, ніж записи (${Math.abs(d.realDaily)} проти `
        + `${Math.abs(d.planDaily)} ккал). Або рухаєтесь більше, ніж думаєте, або порція менша за вказану.`);
    }
  }

  // 4. Стрибок за добу — найчастіше питання до ваг
  if (jump && jump.delta > 0) {
    add('note', `${jump.gap === 1 ? 'За добу' : `За ${jump.gap} дні`} плюс ${jump.delta} кг. `
      + `Жиру за цей час могло додатись щонайбільше ${jump.maxFat} кг — решта вода.`
      + (jump.causes.length ? ` Схоже на: ${jump.causes.join(', ')}.` : ''));
  }

  // 5. Прогноз — коли це скінчиться
  if (f && f.done) {
    add('ok', 'Ціль досягнута. Далі задача інша — утримати; для неї темп нуль, а не мінус.');
  } else if (f && f.weeks) {
    add('note', `За нинішнього темпу до цілі ${r1(Math.abs(f.left))} кг — це близько `
      + `${Math.round(f.weeks)} ${plural(Math.round(f.weeks), 'тижня', 'тижнів', 'тижнів')}, `
      + `орієнтовно ${f.date}.`);
  } else if (f && f.stalled && !flat) {
    add('warn', 'За нинішнього темпу ціль не наближається — рух або зупинився, або йде не в той бік.');
  }

  return out;
}

function plural(n, one, few, many) {
  const t = n % 100;
  const o = n % 10;
  if (t >= 11 && t <= 14) return many;
  if (o === 1) return one;
  if (o >= 2 && o <= 4) return few;
  return many;
}

/**
 * Тренд будь-якого заміру за вікно.
 *
 * Стрічка бреше на пів сантиметра від натягу, вдиху й часу доби, тож
 * різниця двох сусідніх замірів — це різниця двох похибок. Беремо
 * найстаріший і найсвіжіший замір у вікні: за місяць справжня зміна
 * встигає перерости шум.
 */
export function trend(rows, key, span = 28) {
  const pts = (rows || [])
    .filter((b) => b && b[key] > 0 && stampOf(b.date))
    .map((b) => ({ v: b[key], date: b.date, t: stampOf(b.date) }))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const win = pts.filter((x) => x.t >= last.t - span * DAY);
  if (win.length < 2) return null;
  const first = win[0];
  return {
    delta: r1(last.v - first.v),
    from: first.date,
    to: last.date,
    days: Math.round((last.t - first.t) / DAY),
    n: win.length,
  };
}

export function waistTrend(body, span = 28) {
  const t = trend(body, 'waist', span);
  return t ? { cm: t.delta, from: t.from, to: t.to } : null;
}
