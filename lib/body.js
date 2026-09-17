/**
 * Тіло: склад маси, а не сантиметри самі по собі.
 *
 * Ваги відповідають на питання «скільки», але не на єдине важливе — «з чого».
 * Мінус чотири кілограми означають протилежні речі залежно від того, пішов
 * жир чи мʼязи, і самі ваги цієї різниці не бачать. Обхват разом із
 * відсотком жиру — бачить.
 *
 * Тут лише арифметика над рядами замірів: розклад зміни ваги на жир і решту
 * тіла, пропорції, витрати у спокої за безжировою масою. Ніякого React і
 * ніякого читання таблиць, щоб висновки можна було перевірити окремо від
 * екрана.
 */

import { smooth, stampOf } from './weight.js';

const DAY = 86400000;
const r1 = (x) => Math.round(x * 10) / 10;
const n = (v) => {
  // Number(null) і Number('') дають нуль — саме так порожня клітинка
  // перетворюється на «нуль відсотків жиру». Порожнє має лишатись порожнім.
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/**
 * Вага на день заміру — згладжена, а не та, що показали ваги того ранку.
 *
 * Денне зважування гуляє на кілограм від солі й води. Якщо взяти його як є,
 * то жирова й безжирова маси стрибають на той самий кілограм, і саме
 * безжирова — те число, за яким дивляться, чи не йдуть мʼязи. Тож беремо
 * згладжену лінію на дату заміру й повертаємо ще й розрив у днях: заміряти
 * тіло через тиждень після останнього зважування — теж відповідь.
 */
export function weightOn(days, date) {
  const s = smooth(days);
  const t = stampOf(date);
  if (!s.length || !t) return null;
  const upto = s.filter((p) => p.t <= t);
  if (!upto.length) return null;
  const last = upto[upto.length - 1];
  return {
    kg: last.v,
    raw: last.raw,
    date: last.d,
    gap: Math.round((t - last.t) / DAY),
  };
}

/** Один замір у кілограмах жиру й решти тіла */
export function split(weightKg, fatPct) {
  const w = n(weightKg);
  const f = n(fatPct);
  // нуль відсотків жиру не буває — це порожня клітинка, а не сухе тіло
  if (!(w > 0) || f === null || f <= 0 || f > 100) return null;
  const fatKg = (w * f) / 100;
  return { weight: w, fat: f, fatKg, leanKg: w - fatKg };
}

/*
 * Нижче цих меж говорити про склад тіла рано.
 *
 * Похибка стрічки в сантиметр дає близько відсотка жиру, а це майже
 * кілограм жирової маси на вазі під вісімдесят. Тож зміну менш як
 * пів кілограма чесніше назвати шумом, ніж результатом.
 */
const NOISE_KG = 0.5;
const MIN_DAYS = 14;

/**
 * Куди пішла вага — у жир чи в решту тіла.
 *
 * points: [{ date, weight, fat }], відсоток жиру — числом.
 * Беремо найстаріший і найсвіжіший замір у вікні: склад тіла міняється
 * місяцями, і два сусідні заміри про нього не скажуть нічого.
 */
export function composition(points, span = 56) {
  const pts = (points || [])
    .map((p) => {
      const s = p && stampOf(p.date) ? split(p.weight, p.fat) : null;
      return s ? { ...s, date: p.date, t: stampOf(p.date) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;

  const last = pts[pts.length - 1];
  const win = pts.filter((p) => p.t >= last.t - span * DAY);
  if (win.length < 2) return null;
  const first = win[0];

  const days = Math.round((last.t - first.t) / DAY);
  if (days < MIN_DAYS) return null;

  const dWeight = last.weight - first.weight;
  const dFat = last.fatKg - first.fatKg;
  const dLean = last.leanKg - first.leanKg;

  // частка зміни ваги, що припала на жир; при майже незмінній вазі це
  // ділення на шум, тож числа немає
  const share = Math.abs(dWeight) >= NOISE_KG
    ? Math.round((dFat / dWeight) * 100)
    : null;

  const noisy = Math.abs(dWeight) < NOISE_KG && Math.abs(dFat) < NOISE_KG;
  let kind = 'flat';
  if (dFat <= -NOISE_KG && dLean >= NOISE_KG) kind = 'recomp';
  else if (dWeight <= -NOISE_KG) kind = 'cut';
  else if (dWeight >= NOISE_KG) kind = 'bulk';

  return {
    days,
    from: first.date,
    to: last.date,
    n: win.length,
    dWeight: r1(dWeight),
    dFat: r1(dFat),
    dLean: r1(dLean),
    fatNow: r1(last.fatKg),
    leanNow: r1(last.leanKg),
    share,
    kind,
    noisy,
  };
}

/**
 * Висновок словами. Або хвалить за конкретне число, або називає дію —
 * «стежте за собою» тут не висновок.
 */
export function compositionVerdict(c) {
  if (!c) return null;
  const a = (x) => Math.abs(x);

  if (c.noisy) {
    return {
      tone: 'note',
      text: `За ${c.days} днів вага змінилась на ${a(c.dWeight)} кг — це в межах `
        + 'похибки стрічки й ваг. Про склад тіла говорити ще рано: заміряйте раз '
        + 'на два тижні, і за місяць-другий різниця переросте шум.',
    };
  }

  if (c.kind === 'recomp') {
    // про саму вагу кажемо те, що сталось: рекомпозиція буває і при падінні
    // ваги, тож обіцяти «вага стоїть» тут не можна
    const scale = c.dWeight === 0 ? 'не зрушили з місця'
      : c.dWeight > 0 ? `додали ${a(c.dWeight)} кг`
        : `зняли ${a(c.dWeight)} кг`;
    return {
      tone: 'ok',
      text: `Жиру мінус ${a(c.dFat)} кг, решти тіла плюс ${a(c.dLean)} кг за `
        + `${c.days} днів — жир пішов, мʼязи прийшли. Ваги за цей час ${scale} `
        + 'і про склад тіла майже нічого не сказали. Нічого не міняйте.',
    };
  }

  if (c.kind === 'cut') {
    if (c.share === null || c.share < 0) {
      return {
        tone: 'warn',
        text: `Вага впала на ${a(c.dWeight)} кг, а жиру стало більше на `
          + `${a(c.dFat)} кг — пішли мʼязи й вода. Так буває на жорсткому `
          + 'дефіциті без білка й силових: підніміть їжу на 200–300 ккал.',
      };
    }
    /*
     * Жиру пішло більше, ніж усієї ваги — отже, решта тіла додала. Формально
     * це «частка понад сто відсотків», і саме так воно колись і виглядало на
     * екрані: «112% з них — жир». Відсоток тут не має сенсу, має сенс друге
     * число.
     */
    if (c.share > 100) {
      return {
        tone: 'ok',
        text: `Мінус ${a(c.dWeight)} кг, а жиру пішло навіть більше — ${a(c.dFat)} кг. `
          + `Решта тіла за цей час додала ${a(c.dLean)} кг: саме так і має `
          + 'виглядати схуднення, нічого не міняйте.',
      };
    }
    if (c.share >= 75) {
      return {
        tone: 'ok',
        text: `Мінус ${a(c.dWeight)} кг за ${c.days} днів, і ${c.share}% з них — `
          + `жир (${a(c.dFat)} кг). Мʼязи тримаються: білок і силові працюють, `
          + 'нічого не міняйте.',
      };
    }
    if (c.share >= 55) {
      return {
        tone: 'note',
        text: `Мінус ${a(c.dWeight)} кг, з них жиру ${c.share}% — решта пішла з `
          + 'мʼязів і води. Добре — від 75%: додайте білка й силові двічі на тиждень.',
      };
    }
    return {
      tone: 'warn',
      text: `Мінус ${a(c.dWeight)} кг, але жиру з них лише ${c.share}% — більша `
        + `частина втрати (${a(c.dLean)} кг) з мʼязів. Зменште дефіцит на 200–300 `
        + 'ккал, білок 2 г на кілограм сухої маси, силові двічі на тиждень.',
    };
  }

  if (c.kind === 'bulk') {
    if (c.share !== null && c.share <= 50) {
      return {
        tone: 'ok',
        text: `Плюс ${a(c.dWeight)} кг за ${c.days} днів, і лише ${c.share}% з них — `
          + `жир. Набір іде переважно в мʼязи (${a(c.dLean)} кг) — тримайте цей профіцит.`,
      };
    }
    return {
      tone: 'warn',
      text: `Плюс ${a(c.dWeight)} кг, і ${c.share}% з них — жир. Для набору це `
        + 'забагато: мʼязи не ростуть швидше за свою межу, решта йде в бік. '
        + 'Зменште профіцит удвічі.',
    };
  }

  return {
    tone: 'note',
    text: `Вага майже не рухалась (${c.dWeight > 0 ? '+' : ''}${c.dWeight} кг за `
      + `${c.days} днів), склад теж: жир ${c.dFat > 0 ? '+' : ''}${c.dFat} кг, `
      + `решта ${c.dLean > 0 ? '+' : ''}${c.dLean} кг.`,
  };
}

/**
 * Чи схоже число на описку, а не на замір.
 *
 * Найчастіша помилка зі стрічкою — порядок: на рулетці після оранжевої
 * рамки «100» ідуть 101, 102, 103, і легко записати «10.4» замість «104».
 * Тому мало сказати «забагато»: якщо це саме число, помножене чи поділене
 * на десять, лягає в межі — його людина й мала на увазі, і сказати варто
 * саме це.
 *
 * Межі навмисно широкі. Завдання — спіймати описку, а не вирішувати за
 * людину, яким має бути її тіло: сумнівне число все одно можна зберегти.
 */
export function oddValue(value, min, max) {
  const v = n(value);
  if (v === null || (v >= min && v <= max)) return null;
  const hint = [v * 10, v / 10].find((x) => x >= min && x <= max);
  return { value: v, min, max, hint: hint === undefined ? null : r1(hint) };
}

/**
 * Талія до зросту — найпростіше, що взагалі можна порахувати, і воно
 * сильніше за ІМТ там, де йдеться про жир на животі: ІМТ не бачить різниці
 * між мʼязами й салом, а талія бачить. Межа запамʼятовується з одного разу:
 * талія має бути меншою за половину зросту.
 */
export function whtr(waistCm, heightCm) {
  const w = n(waistCm);
  const h = n(heightCm);
  return w > 0 && h > 0 ? w / h : null;
}

export function whtrLabel(v) {
  if (v == null) return '';
  if (v < 0.4) return 'нижче норми';
  if (v < 0.5) return 'норма';
  if (v < 0.6) return 'підвищений ризик';
  return 'високий ризик';
}

/** Талія до стегон — про те, де саме лежить жир */
export function whr(waistCm, hipsCm) {
  const w = n(waistCm);
  const h = n(hipsCm);
  return w > 0 && h > 0 ? w / h : null;
}

export function whrLabel(v, sex) {
  if (v == null) return '';
  const limit = sex === 'f' ? 0.85 : 0.9;
  if (v < limit - 0.05) return 'норма';
  if (v < limit) return 'ближче до межі';
  return 'підвищений ризик';
}

/**
 * Скільки мʼязів відносно зросту. Безжирова маса в кілограмах нічого не
 * каже сама по собі: сімдесят кілограмів на зрості метр шістдесят і на
 * метр дев'яносто — різні тіла. Ділення на квадрат зросту це вирівнює.
 */
export function ffmi(leanKg, heightCm) {
  const l = n(leanKg);
  const h = n(heightCm);
  if (!(l > 0) || !(h > 0)) return null;
  const m = h / 100;
  const raw = l / (m * m);
  // приведення до зросту 1,80 — щоб шкала однаково читалась для всіх
  return { raw, norm: raw + 6.1 * (1.8 - m) };
}

export function ffmiLabel(v, sex) {
  if (v == null) return '';
  const steps = sex === 'f'
    ? [14, 16, 18, 20]
    : [18, 20, 22, 25];
  if (v < steps[0]) return 'нижче середнього';
  if (v < steps[1]) return 'середній';
  if (v < steps[2]) return 'добрий';
  if (v < steps[3]) return 'спортивний';
  return 'дуже високий';
}

/**
 * Витрати у спокої за Кетчем-Макардлом.
 *
 * Міффлін рахує з ваги, зросту й віку — тобто вгадує склад тіла за
 * середнім. Коли безжирова маса відома, вгадувати не треба: саме вона й
 * витрачає енергію, жир майже не витрачає нічого. На краях — у сухого
 * спортсмена й у людини з великою вагою — різниця виходить у сотні калорій.
 */
export function katchBmr(leanKg) {
  const l = n(leanKg);
  return l > 0 ? 370 + 21.6 * l : null;
}

/**
 * Що сказати, коли ІМТ і відсоток жиру суперечать одне одному. ІМТ не
 * розрізняє мʼязи й жир, тож у людини з силовими він регулярно показує
 * «надлишок» там, де надлишку немає.
 */
export function bmiVsFat(bmiValue, fatPct, sex) {
  const b = n(bmiValue);
  const f = n(fatPct);
  if (b === null || f === null) return null;
  const lean = sex === 'f' ? f < 25 : f < 15;
  const fatty = sex === 'f' ? f > 32 : f > 24;
  if (b >= 25 && lean) {
    return `ІМТ каже «надлишок», але жиру ${r1(f)}% — це мʼязи, а не жир. `
      + 'ІМТ їх не розрізняє, тож тут вірте відсотку.';
  }
  if (b < 25 && fatty) {
    return `ІМТ у нормі, але жиру ${r1(f)}% — мало мʼязів, а не мало жиру. `
      + 'Силові дадуть більше, ніж дефіцит.';
  }
  return null;
}
