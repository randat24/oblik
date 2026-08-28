import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
// Чиста логіка тренажера — без звернень до таблиць, тому їде і в браузер
import {
  LESSONS, FACTS, RUN, FAST_SEC, keyOf, known, auto, runOf, tipFor, options, question, factOf,
  problems, slows, dayQueue, daily, dayStreak, hardest, hookFor, practiceDays, DAY_SIZE,
  QUICK_TILES, QUICK_SIZE, quickQueue, HARD, hardDone, stats, nextNew, NEW_PER_DAY,
  arcadeLevel, arcadeNext, ARCADE_LIVES, ARCADE_PER_LEVEL, ask, formFor,
  lessonFacts, freshFacts, partsOf, partMultipliers, modesOf,
  lessonProgress, partProgress, unlockedLessons,
  buildSession, partQueue, applyResults,
} from '../lib/mult';
import { pace, forecast, verdicts } from '../lib/weight';
import { CODE_LESSONS, TRACKS, openUpTo, courseStats, nextLink } from '../lib/code';
import { FIELDS as PRACTICE_FIELDS, statsOf, freshIdeas } from '../lib/practice';
import { REF_GROUPS, REF_CARDS, findCards } from '../lib/ref';
import { TOURS, tourById } from '../lib/tour';

/*
 * Особистий розділ здоров'я. Свідомо окрема сторінка з власним кодом:
 * ці дані не мають перетинатися з рештою застосунку — ні в пошуку, ні на
 * дашборді, ні в журналі. Сюди веде лише пряме посилання /me.
 */

const MEALS = ['Сніданок', 'Обід', 'Вечеря', 'Перекус'];
const MOODS = ['Чудово', 'Добре', 'Нормально', 'Втома', 'Погано'];

// Vercel підставляє це під час збірки — видно, який код зараз живий
const BUILD = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);

/*
 * Обхвати всюди в сантиметрах — і на екрані, і в таблиці. Крок 0,1 дозволяє
 * записати півсантиметра, якщо стрічка лягла між поділками.
 */
const BODY_FIELDS = [
  { key: 'chest', label: 'Груди', unit: 'см', cm: true },
  { key: 'waist', label: 'Талія', unit: 'см', cm: true },
  { key: 'belly', label: 'Живіт', unit: 'см', cm: true },
  { key: 'hips', label: 'Стегна', unit: 'см', cm: true },
  { key: 'biceps', label: 'Біцепс', unit: 'см', cm: true },
  { key: 'thigh', label: 'Стегно', unit: 'см', cm: true },
  { key: 'neck', label: 'Шия', unit: 'см', cm: true },
  { key: 'fat', label: '% жиру', unit: '%' },
];

// Стать, зріст і рік народження — не цілі, а вихідні дані для формул
const PROFILE_FIELDS = [
  { key: 'height', label: 'Зріст', unit: 'см' },
  { key: 'birthYear', label: 'Рік народження', unit: '' },
];

const GOAL_FIELDS = [
  { key: 'startWeight', label: 'Стартова вага', unit: 'кг' },
  { key: 'burned', label: 'Ціль руху', unit: 'ккал' },
  { key: 'exercise', label: 'Ціль тренувань', unit: 'хв' },
  { key: 'stand', label: 'Ціль розминки', unit: 'год' },
  { key: 'weight', label: 'Цільова вага', unit: 'кг' },
  { key: 'kcal', label: 'Норма калорій', unit: 'ккал' },
  { key: 'protein', label: 'Білки', unit: 'г' },
  { key: 'fat', label: 'Жири', unit: 'г' },
  { key: 'carbs', label: 'Вуглеводи', unit: 'г' },
  { key: 'water', label: 'Вода', unit: 'мл' },
  { key: 'steps', label: 'Кроки', unit: '' },
  { key: 'fiber', label: 'Клітковина', unit: 'г' },
  { key: 'sugar', label: 'Цукор, не більше', unit: 'г' },
  { key: 'sodium', label: 'Натрій, не більше', unit: 'мг' },
];

/**
 * Відсоток жиру за формулою ВМС США (US Navy) — та сама, що в популярних
 * застосунках. Чоловікам потрібні талія, шия і зріст; жінкам ще й стегна.
 * Обхвати в сантиметрах.
 */
function navyFat({ sex, height, waist, neck, hips }) {
  const h = num(height), w = num(waist), n = num(neck);
  if (!(h > 0 && w > 0 && n > 0)) return null;
  const lg = Math.log10;
  let d;
  if (sex === 'f') {
    const hp = num(hips);
    if (!(hp > 0) || w + hp - n <= 0) return null;
    d = 1.29579 - 0.35004 * lg(w + hp - n) + 0.22100 * lg(h);
  } else {
    if (w - n <= 0) return null;
    d = 1.0324 - 0.19077 * lg(w - n) + 0.15456 * lg(h);
  }
  if (!(d > 0)) return null;
  const v = 495 / d - 450;
  // за межами цього діапазону формула вже не має сенсу — краще не показувати
  return v >= 3 && v <= 70 ? v : null;
}

// Скільки тіло витрачає у спокої — формула Міффліна-Сан Жеора
function bmr({ sex, weight, height, age }) {
  const w = num(weight), h = num(height), a = num(age);
  if (!(w > 0 && h > 0 && a > 0)) return null;
  return 10 * w + 6.25 * h - 5 * a + (sex === 'f' ? -161 : 5);
}

const ACTIVITY = [
  { key: '1.2', label: 'Сидяча робота, без тренувань', ex: 20 },
  { key: '1.375', label: 'Легка активність, 1–3 рази на тиждень', ex: 30 },
  { key: '1.55', label: 'Помірна, 3–5 разів на тиждень', ex: 45 },
  { key: '1.725', label: 'Висока, 6–7 разів на тиждень', ex: 60 },
  { key: '1.9', label: 'Дуже висока, важка фізична праця', ex: 75 },
];

const AIMS = [
  { key: '-20', label: 'Схуднення', note: 'мінус 20% від витрат' },
  { key: '-10', label: 'Повільне схуднення', note: 'мінус 10%' },
  { key: '0', label: 'Утримання ваги', note: 'скільки витрачаєте' },
  { key: '10', label: 'Набір маси', note: 'плюс 10%' },
];

// Скільки годин на день людина стоїть чи рухається — ціль кільця розминки.
// Дванадцять: година активності на кожну годину неспання, як в Apple.
const STAND_GOAL = 12;

/**
 * Норма калорій і БЖВ. Білок рахуємо на кілограм ваги, жир — теж,
 * решту добираємо вуглеводами: так пропорція лишається розумною
 * і на дефіциті, і на наборі.
 *
 * Тут же — цілі трьох кілець. Ціль руху не вигадана: це різниця між
 * витратами з активністю і витратами у спокої, тобто саме та енергія,
 * яку треба спалити рухом. Хвилини тренувань беремо з рівня активності.
 */
function calcNorm({ sex, weight, height, age, activity, aim }) {
  const base = bmr({ sex, weight, height, age });
  if (base === null) return null;
  const act = num(activity) || 1.375;
  const tdee = base * act;
  const kcal = tdee * (1 + (num(aim) || 0) / 100);
  const w = num(weight);
  const protein = Math.round(w * 1.8);
  const fat = Math.round(w * 0.9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  // округлюємо до десятків: ціль кільця — орієнтир, а не точне число
  const move = Math.max(200, Math.round((tdee - base) / 10) * 10);
  const exercise = (ACTIVITY.find((a) => a.key === String(activity))?.ex) || 30;
  // Клітковина — 14 г на кожні 1000 ккал, як радить більшість настанов.
  // Цукор — не більше десятої частини калорій (4 ккал на грам).
  // Натрій — 2300 мг, звична межа для дорослого.
  const fiber = Math.round((kcal / 1000) * 14);
  const sugar = Math.round((kcal * 0.1) / 4);
  const sodium = 2300;
  return {
    bmr: Math.round(base),
    tdee: Math.round(tdee),
    kcal: Math.round(kcal),
    protein, fat, carbs,
    move, exercise, stand: STAND_GOAL,
    fiber, sugar, sodium,
  };
}

/**
 * Ковзне середнє за 7 днів. Денна вага стрибає на кілограм від солі й води,
 * тож саме згладжене число показує справжній рух, а не шум.
 */
function weekly(days) {
  const pts = days.filter((d) => d.weight != null);
  return pts.map((d, i) => {
    const from = stamp(d.date) - 6 * 86400000;
    const win = pts.filter((x, j) => j <= i && stamp(x.date) >= from);
    return { d: d.date, v: win.reduce((a, x) => a + x.weight, 0) / win.length, n: win.length };
  });
}

/** Середнє за останні N днів від найсвіжішого запису */
function avgLast(days, back = 0, span = 7) {
  const pts = days.filter((d) => d.weight != null);
  if (!pts.length) return null;
  const end = stamp(pts[pts.length - 1].date) - back * span * 86400000;
  const start = end - (span - 1) * 86400000;
  const win = pts.filter((d) => stamp(d.date) >= start && stamp(d.date) <= end);
  return win.length ? win.reduce((a, d) => a + d.weight, 0) / win.length : null;
}

function bmi(weight, height) {
  const w = num(weight), h = num(height) / 100;
  return w > 0 && h > 0 ? w / (h * h) : null;
}

/** Як читати ІМТ — підпис поруч із числом */
function bmiLabel(v) {
  if (v === null) return '';
  if (v < 18.5) return 'дефіцит ваги';
  if (v < 25) return 'норма';
  if (v < 30) return 'надлишок';
  return 'ожиріння';
}

const PHOTO_SIDES = [
  { key: 'front', label: 'Спереду' },
  { key: 'side', label: 'Збоку' },
  { key: 'back', label: 'Ззаду' },
];

/* ---------- Дрібниці ---------- */

/*
 * Сторінка відкрита за посиланням, але змінювати щось може лише господар
 * розділу. Прапорець живе поруч із `api`, а не в пропсах: інакше його
 * довелося б протягувати крізь кожну вкладку й кожну картку, а перевірка
 * потрібна рівно в одному місці — перед відправкою запису.
 */
let CAN_EDIT = true;

/**
 * Запит із межею терпіння. Без неї застряглий запит виглядає як вічне
 * «Завантаження…»: сторінка ніби працює, а насправді вже нікуди не йде.
 */
async function api(path, opts = {}) {
  if (opts.method && opts.method !== 'GET' && !CAN_EDIT) {
    const err = new Error('Тільки перегляд. Увійдіть у застосунок, щоб змінювати.');
    err.status = 403;
    throw err;
  }
  const stop = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const bell = stop ? setTimeout(() => stop.abort(), opts.wait || 25000) : null;
  let res;
  try {
    res = await fetch(path, {
      ...opts,
      signal: stop?.signal,
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error('Таблиця не відповіла за 25 секунд. Спробуйте ще раз.');
      err.status = 0;
      throw err;
    }
    throw e;
  } finally {
    if (bell) clearTimeout(bell);
  }
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!res.ok) {
    const err = new Error(data.error || `Помилка ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Клітковина, цукор і натрій масштабуються так само, як решта — на той самий k */
const EXTRA = ['fiber', 'sugar', 'sodium'];
const scaleExtra = (src, k) => Object.fromEntries(
  EXTRA.map((key) => [key, num(src?.[key]) ? String(n1(num(src[key]) * k)) : ''])
);

/**
 * Який зараз прийом їжі. Форма підставляє його сама: найчастіша помилка —
 * записати вечерю о сьомій вечора, а вона мовчки лягає в сніданок, бо він
 * стояв першим у списку.
 *
 * Межі свідомо широкі: о пʼятій ранку це вже сніданок, після десятої вечора —
 * перекус. Кордони — питання звички, тож будь-який вибір лишається за вами.
 */
function hourKyiv() {
  const f = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = {};
  f.formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  return { h: Number(p.hour) % 24, hhmm: `${p.hour}:${p.minute}` };
}

function mealByHour(h) {
  if (h >= 5 && h < 11) return 'Сніданок';
  if (h >= 11 && h < 16) return 'Обід';
  if (h >= 16 && h < 22) return 'Вечеря';
  return 'Перекус';
}

const photoSrc = (v) => (v ? '/api/photo?p=' + encodeURIComponent(v) : '');

function today() {
  const fmt = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p = {};
  fmt.formatToParts(new Date()).forEach((x) => (p[x.type] = x.value));
  return `${p.day}.${p.month}.${p.year}`;
}

function stamp(d) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((d || '').toString().trim());
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : 0;
}

const short = (d) => (d || '').slice(0, 5);
const n1 = (v) => Math.round((Number(v) || 0) * 10) / 10;
const num = (v) => {
  const x = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(x) ? x : 0;
};

function shrink(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      if (scale === 1 && file.size < 700 * 1024) return resolve(file);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(
        (b) => (b ? resolve(new File([b], 'photo.jpg', { type: 'image/jpeg' })) : reject(new Error('Не вдалося обробити фото'))),
        'image/jpeg', quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // найчастіше це HEIC, який браузер не вміє розібрати
      reject(new Error('Браузер не прочитав це фото. Спробуйте JPEG або PNG.'));
    };
    img.src = url;
  });
}

/* ---------- Графік ---------- */

/**
 * Проста лінія без бібліотек: точки, підписи осей і пунктир цілі.
 * Малюємо в координатах 0..100 і розтягуємо через viewBox — тоді графік
 * лишається чітким на будь-якій ширині.
 */
function LineChart({ points, goal, unit = '' }) {
  if (points.length === 0) {
    return <div className="h-empty">Ще немає записів</div>;
  }

  const vals = points.map((p) => p.v);
  const all = goal ? [...vals, goal] : vals;
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.15;
  lo -= pad; hi += pad;

  const W = 100, H = 46;
  const x = (i) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v) => H - ((v - lo) / (hi - lo)) * H;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(2)},${H} L${x(0).toFixed(2)},${H} Z`;
  const ticks = [hi, (hi + lo) / 2, lo];
  // дат на осі має бути близько пʼяти — інакше вони налазять одна на одну
  const labelStep = Math.max(1, Math.ceil(points.length / 5));

  return (
    <div className="h-chart">
      <div className="h-chart-y">
        {ticks.map((t, i) => <span key={i}>{n1(t)}</span>)}
      </div>
      <div className="h-chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-svg">
          {ticks.map((t, i) => (
            <line key={i} x1="0" x2={W} y1={y(t)} y2={y(t)} className="h-grid" />
          ))}
          {goal ? <line x1="0" x2={W} y1={y(goal)} y2={y(goal)} className="h-goal" /> : null}
          <path d={area} className="h-area" />
          <path d={line} className="h-line" />
        </svg>
        <div className="h-dots">
          {points.map((p, i) => (
            <span
              key={i}
              className="h-dot"
              style={{ left: `${x(i)}%`, top: `${(y(p.v) / H) * 100}%` }}
              title={`${p.d} — ${n1(p.v)}${unit}`}
            >
              {/* число біля кожної точки читається лише коли їх мало */}
              {(points.length <= 8 || i === 0 || i === points.length - 1) && (
                <b className={i === 0 ? 'is-first' : i === points.length - 1 ? 'is-last' : ''}>
                  {n1(p.v)}
                </b>
              )}
            </span>
          ))}
        </div>
      </div>
      <div className="h-chart-x">
        {points.map((p, i) => (
          (i % labelStep === 0 || i === points.length - 1)
            ? (
              <span
                key={i}
                className={i === 0 ? 'is-first' : i === points.length - 1 ? 'is-last' : ''}
                style={{ left: `${x(i)}%` }}
              >
                {short(p.d)}
              </span>
            )
            : null
        ))}
      </div>
    </div>
  );
}

/**
 * Обгортка широкої таблиці. Підказку показуємо не «про всяк випадок», а лише
 * коли стовпчики справді не вміщаються.
 */
function TableWrap({ children }) {
  const ref = useRef(null);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const check = () => setWide(el.scrollWidth > el.clientWidth + 4);
    check();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  return (
    <>
      {wide && <div className="tbl-hint">← гортайте таблицю вбік →</div>}
      <div className="h-tablewrap" ref={ref}>{children}</div>
    </>
  );
}

/* ---------- Фото ---------- */

/**
 * Одне фото одного ракурсу. Джерела два і обидва явні: зняти зараз або
 * взяти готове з телефона. Раніше поле відкривало лише камеру — зробити
 * вдалий кадр заздалегідь і потім прикріпити було неможливо.
 */
function PhotoSlot({ label, value, onChange }) {
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (input) => {
    const file = input?.files?.[0];
    // одразу відпускаємо поле: інакше повторний вибір того самого файлу
    // не викличе подію і здаватиметься, що кнопка не працює
    if (input) input.value = '';
    if (!file) return;
    if (!CAN_EDIT) { setErr('Тільки перегляд.'); return; }
    setBusy(true); setErr('');
    try {
      const small = await shrink(file);
      const res = await fetch('/api/upload', { method: 'POST', body: small });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка завантаження');
      onChange(data.fileId);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-slot">
      <div className="h-slot-l">{label}</div>
      {value ? (
        <div className="h-slot-img">
          <img src={photoSrc(value)} alt={label} />
          <button className="h-slot-x" onClick={() => onChange('')} title="Прибрати">×</button>
          <button
            className="h-slot-re"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? '…' : 'замінити'}
          </button>
        </div>
      ) : (
        <div className="h-slot-add">
          {busy ? (
            <span className="h-slot-busy">завантаження…</span>
          ) : (
            <>
              <button className="h-slot-b" onClick={() => fileRef.current?.click()}>
                З телефона
              </button>
              <button className="h-slot-b h-slot-b2" onClick={() => camRef.current?.click()}>
                Зняти зараз
              </button>
            </>
          )}
        </div>
      )}
      {/* без capture — системний вибір покаже і галерею, і файли */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pick(e.target)}
      />
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => pick(e.target)}
      />
      {err && <div className="h-err">{err}</div>}
    </div>
  );
}

/**
 * Розбирає відповідь чат-моделі про страву. Числа шукаємо не за жорстким
 * шаблоном, а за близькістю до слова: моделі пишуть і «450 ккал», і
 * «Калорії: 450», і «калорійність — 450».
 */
function parseNutrition(text) {
  const t = String(text || '').replace(/[  ]/g, ' ');
  if (!t.trim()) return null;

  const NUM = /-?\d+(?:[.,]\d+)?/g;
  const nums = [];
  let m;
  while ((m = NUM.exec(t)) !== null) {
    nums.push({ v: Number(m[0].replace(',', '.')), at: m.index, end: m.index + m[0].length });
  }
  if (!nums.length) return null;

  // число, найближче до слова: спершу те, що одразу перед ним, далі — після
  const near = (re) => {
    re.lastIndex = 0;
    let best = null;
    let k;
    while ((k = re.exec(t)) !== null) {
      const s = k.index;
      const e = k.index + k[0].length;
      nums.forEach((n) => {
        // між числом і словом допускаємо лише розділові знаки й одиниці
        const gapAfter = n.at >= e ? t.slice(e, n.at) : null;
        const gapBefore = n.end <= s ? t.slice(n.end, s) : null;
        let dist = null;
        if (gapAfter !== null && /^[\s:—–\-=~≈»)(]*$/.test(gapAfter) && gapAfter.length <= 4) {
          dist = n.at - e;
        } else if (gapBefore !== null && /^[\s]*(?:г|гр|g|грам\w*)?[\s.,;)]*$/.test(gapBefore) && gapBefore.length <= 6) {
          dist = s - n.end + 0.5; // за однакової відстані слово після числа трохи слабше
        }
        if (dist !== null && (best === null || dist < best.dist)) best = { dist, v: n.v };
      });
      if (re.lastIndex === k.index) re.lastIndex++;
    }
    return best ? best.v : null;
  };

  const CYR = '[а-яіїєґёА-ЯІЇЄҐЁ]*';
  const w = (base) => new RegExp(base.replace(/#/g, CYR), 'gi');
  const kcal = near(w('ккал|kcal|калорійн#|калорийн#|калор#'));
  const protein = near(w('білк#|белк#|протеїн#|протеин#|protein'));
  const fat = near(w('жир#|\\bfat\\b'));
  const carbs = near(w('вуглевод#|углевод#|carb[a-z]*'));

  // вага порції — лише там, де поруч немає слова про БЖВ
  let grams = null;
  const gm = /(\d+(?:[.,]\d+)?)\s*(?:грам[а-яіїєґё]*|гр|г|g)(?![а-яіїєґёa-z])/gi;
  let g;
  while ((g = gm.exec(t)) !== null) {
    // важлива лише те, що стоїть одразу перед числом: «білки 9 г» — це не вага
    const head = t.slice(Math.max(0, g.index - 14), g.index).toLowerCase();
    if (/білк|белк|жир|вуглевод|углевод|protein|fat|carb|ккал|kcal/.test(head)) continue;
    grams = Number(g[1].replace(',', '.'));
    break;
  }

  // назва — початок першого рядка до розділювача, без службових слів
  const firstLine = t.split('\n')[0].trim();
  let name = firstLine.split(/[—–|:]/)[0].trim();
  if (/^(калор|білк|белк|жир|вуглевод|углевод|приблиз|орієнт|ориентир|разом|итого|всего|порц|порція)/i.test(name)) name = '';
  name = name
    .replace(/[,\s]*(?:порц[а-яіїєґё]*|вага|вес|маса|масса)[,\s]*\d*\s*(?:г|гр)?\.?$/i, '')
    .replace(/\s+\d+(?:[.,]\d+)?\s*(?:г|гр)\.?$/i, '')
    .replace(/[\s,.:;–—-]+$/, '')
    .trim();
  if (/^\d/.test(name) || name.length > 60) name = '';
  name = name.replace(/\s*\(\s*\d+[^)]*\)\s*$/, '').trim();

  if (kcal === null && protein === null && fat === null && carbs === null) return null;
  return { name, grams, kcal, protein, fat, carbs };
}

/* ---------- Модалка ---------- */

function Modal({ title, children, onClose, onSave, saveLabel = 'Зберегти', busy, error }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="h-overlay" onClick={(e) => e.target.classList.contains('h-overlay') && onClose()}>
      <div className="h-modal">
        <h2>{title}</h2>
        {children}
        {error && <div className="h-err">{error}</div>}
        <div className="h-modal-a">
          <button className="h-btn" onClick={onClose}>Скасувати</button>
          <button className="h-btn h-btn-p" onClick={onSave} disabled={busy}>
            {busy ? '…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Смуга норми ---------- */

function Bar({ label, value, goal, unit = 'г', tone }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  const over = goal > 0 && value > goal;
  return (
    <div className="h-bar">
      <div className="h-bar-l">{label}</div>
      <div className="h-bar-t">
        <div className={'h-bar-f' + (over ? ' is-over' : '')} style={{ width: `${pct}%`, background: tone }} />
      </div>
      <div className="h-bar-v">
        <b>{n1(value)}</b>{goal > 0 ? <span> / {n1(goal)} {unit}</span> : <span> {unit}</span>}
      </div>
    </div>
  );
}

/* ---------- Вкладка «День» ---------- */

const DOW = ['НД', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

/**
 * «21 день», «22 дні», «25 днів» — за останньою цифрою, крім підлітків.
 * Дні тут за замовчуванням, бо їх рахують найчастіше, але форми можна
 * передати й свої: `plural(n, 'зміна', 'зміни', 'змін')`.
 */
function plural(n, one = 'день', few = 'дні', many = 'днів') {
  const t = n % 100;
  const o = n % 10;
  if (t >= 11 && t <= 14) return many;
  if (o === 1) return one;
  if (o >= 2 && o <= 4) return few;
  return many;
}

/** Чи є за цей день хоч якийсь запис — саме це й означає «вів щоденник» */
function filled(d) {
  if (!d) return false;
  return num(d.kcal) > 0 || num(d.weight) > 0 || num(d.water) > 0
    || num(d.steps) > 0 || num(d.burned) > 0;
}

/**
 * Скільки днів поспіль ведеться щоденник. Рахуємо назад від сьогодні; якщо
 * сьогодні ще нічого не внесено, це не обриває серію — день не закінчився.
 */
function streakOf(days, today) {
  const map = new Map(days.map((d) => [d.date, d]));
  const key = (t) => {
    const d = new Date(t);
    const p = (x) => String(x).padStart(2, '0');
    return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  };
  const t0 = stamp(today);
  let n = 0;
  for (let i = filled(map.get(today)) ? 0 : 1; i < 400; i++) {
    if (!filled(map.get(key(t0 - i * 86400000)))) break;
    n++;
  }
  return { n, map, key, t0 };
}

/**
 * Смужка тижня з галочками й лічильником серії. Видно не лише число, а й
 * які саме дні закриті — і де розрив.
 */
function StreakBar({ days, today, date, setDate }) {
  const { n, map, key, t0 } = streakOf(days, today);

  // сім днів, що закінчуються сьогодні
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const t = t0 - i * 86400000;
    const k = key(t);
    week.push({ k, on: filled(map.get(k)), dow: DOW[new Date(t).getUTCDay()] });
  }

  return (
    <div className="h-streak">
      <div className="h-streak-w">
        {week.map((d) => (
          <button
            key={d.k}
            className={'h-streak-d' + (d.on ? ' on' : '') + (d.k === date ? ' cur' : '')}
            onClick={() => setDate(d.k)}
            title={d.k}
          >
            <span className="h-streak-dow">{d.dow}</span>
            <span className="h-streak-dot">{d.on ? '✓' : ''}</span>
          </button>
        ))}
      </div>
      <div className="h-streak-l">
        {n === 0
          ? 'почніть серію — внесіть щось за сьогодні'
          : <>серія: <b>{n}</b> {plural(n)} поспіль</>}
      </div>
    </div>
  );
}

/** Один показник у картці: підпис, смужка, «скільки з чого» */
function Metric({ label, value, goal, unit, tone, limit }) {
  const v = num(value);
  const gl = num(goal);
  const pct = gl > 0 ? Math.min(100, (v / gl) * 100) : (v > 0 ? 100 : 0);
  // для цукру й натрію ціль — це стеля, а не мета: перебір має бути помітним
  const over = limit && gl > 0 && v > gl;
  return (
    <div className={'h-m' + (over ? ' is-over' : '')}>
      <div className="h-m-l">{label}{unit ? `, ${unit}` : ''}</div>
      <div className="h-m-t">
        <div className="h-m-f" style={{ width: pct + '%', background: over ? 'var(--red)' : tone }} />
      </div>
      <div className="h-m-v">
        <b>{n1(v)}</b>
        {gl > 0 && <span> / {n1(gl)}</span>}
      </div>
    </div>
  );
}

/**
 * Кілька карток по три показники, які гортаються вбік. Раніше все це стояло
 * стовпчиком і займало пів екрана; тепер видно одну картку, а решта —
 * порухом пальця. Крапки знизу показують, скільки їх і де ти зараз.
 */
function CardDeck({ cards }) {
  const ref = useRef(null);
  const [at, setAt] = useState(0);
  const list = cards.filter(Boolean);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  const go = (i) => {
    const el = ref.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  if (!list.length) return null;

  return (
    <div className="h-deck">
      <div className="h-deck-t" ref={ref} onScroll={onScroll}>
        {list.map((c, i) => (
          <div className="h-deck-c" key={i}>
            <div className="h-deck-h">{c.title}</div>
            <div className="h-deck-m">{c.items}</div>
          </div>
        ))}
      </div>
      {list.length > 1 && (
        <div className="h-pgs">
          {list.map((c, i) => (
            <button
              key={i}
              className={'h-pg' + (i === at ? ' on' : '')}
              onClick={() => go(i)}
              title={c.title}
              aria-label={c.title}
            >
              <i />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Головне число дня. За замовчуванням — скільки лишилось, бо саме це питання
 * виникає, коли вирішуєш, що зʼїсти. Одним дотиком перемикається на «зʼїдено»
 * — коли цікаво, скільки вже набрав. Вибір памʼятається.
 */
function KcalHead({ eaten, goal, left }) {
  const [mode, setMode] = useState('left');

  useEffect(() => {
    try {
      const v = localStorage.getItem('h-kcal-mode');
      if (v === 'eaten' || v === 'left') setMode(v);
    } catch { /* приватний режим — просто лишаємо типове */ }
  }, []);

  const flip = () => {
    const next = mode === 'left' ? 'eaten' : 'left';
    setMode(next);
    try { localStorage.setItem('h-kcal-mode', next); } catch { /* нічого страшного */ }
  };

  // без цілі показувати «лишилось» нема з чого
  const showLeft = mode === 'left' && left !== null;
  const value = showLeft ? Math.abs(left) : Math.round(eaten);
  const over = showLeft && left < 0;

  return (
    <div className="h-kcal">
      <button className="h-kcal-sw" onClick={flip} disabled={left === null}>
        {showLeft ? (over ? 'Перебір' : 'Залишилось') : 'Зʼїдено'}
        {left !== null && <span className="h-kcal-arr">⇅</span>}
      </button>
      <div className={'h-kcal-v' + (over ? ' is-over' : '')}>
        {value}<i> ккал</i>
      </div>
      {goal > 0 && (
        <div className="h-kcal-goal">
          Ціль: <b>{goal}</b> ккал
          {showLeft && <> · зʼїдено {Math.round(eaten)}</>}
        </div>
      )}
    </div>
  );
}

function DayTab({ data, date, setDate, reload, setBusy, toast }) {
  const [food, setFood] = useState(null);
  const [copy, setCopy] = useState(false);
  const [dayEdit, setDayEdit] = useState(false);
  const day = data.days.find((d) => d.date === date) || { date, kcal: 0, protein: 0, fat: 0, carbs: 0, water: 0, steps: 0 };
  const meals = data.food.filter((f) => f.date === date);
  const g = data.goals || {};
  const kcalGoal = num(g.kcal);
  const eaten = day.kcal;

  // Клітковину, цукор і натрій беремо просто із записів їжі: вони й
  // складаються тільки з неї. Так вони одразу є і для старих днів, де в
  // рядку дня цих колонок ще не було.
  const sumOf = (k) => Math.round(meals.reduce((a, f) => a + num(f[k]), 0) * 10) / 10;
  const micro = { fiber: sumOf('fiber'), sugar: sumOf('sugar'), sodium: sumOf('sodium') };
  const leftKcal = kcalGoal > 0 ? Math.round(kcalGoal - eaten) : null;

  const delFood = async (row) => {
    if (!confirm('Прибрати запис?')) return;
    setBusy(true);
    try {
      await api('/api/health', { method: 'POST', body: { action: 'delFood', row, date } });
      await reload();
    } finally { setBusy(false); }
  };

  return (
    <>
      <StreakBar days={data.days} today={today()} date={date} setDate={setDate} />

      <KcalHead eaten={eaten} goal={kcalGoal} left={leftKcal} />

      <CardDeck cards={[
        {
          title: 'Білки · Жири · Вуглеводи',
          items: (
            <>
              <Metric label="Білки" value={day.protein} goal={g.protein} unit="г" tone="var(--red)" />
              <Metric label="Жири" value={day.fat} goal={g.fat} unit="г" tone="var(--amber)" />
              <Metric label="Вуглеводи" value={day.carbs} goal={g.carbs} unit="г" tone="var(--green)" />
            </>
          ),
        },
        {
          title: 'Рух і вода',
          items: (
            <>
              <Metric label="Кроки" value={day.steps} goal={g.steps} unit="" tone="var(--ring-ex)" />
              <Metric label="Вода" value={day.water} goal={g.water} unit="мл" tone="var(--ring-stand)" />
              <Metric label="Спалено" value={day.burned} goal={g.burned} unit="ккал" tone="var(--ring-move)" />
            </>
          ),
        },
        // клітковина, цукор і натрій відомі не про кожну їжу — картку
        // показуємо, лише коли за день щось із цього набралося
        (micro.fiber > 0 || micro.sugar > 0 || micro.sodium > 0) && {
          title: 'Клітковина · Цукор · Натрій',
          items: (
            <>
              <Metric label="Клітковина" value={micro.fiber} goal={g.fiber} unit="г" tone="var(--ring-ex)" />
              <Metric label="Цукор" value={micro.sugar} goal={g.sugar} unit="г" limit tone="var(--red)" />
              <Metric label="Натрій" value={micro.sodium} goal={g.sodium} unit="мг" limit tone="var(--amber)" />
            </>
          ),
        },
        // третя картка з'являється лише коли є що показати: порожні смужки
        // сну й пульсу тільки крали б місце
        (num(day.sleep) > 0 || num(day.workout) > 0 || num(day.pulse) > 0) && {
          title: 'Відновлення',
          items: (
            <>
              <Metric label="Сон" value={day.sleep} goal={8} unit="год" tone="var(--blue)" />
              <Metric label="Тренування" value={day.workout} goal={g.exercise} unit="хв" tone="var(--ring-ex)" />
              <Metric label="Пульс спокою" value={day.pulse} goal={0} unit="уд/хв" tone="var(--red)" />
            </>
          ),
        },
      ]} />

      <TodayBoard data={data} day={day} date={date} />



      <DayStats
        day={day}
        goals={g}
        onWater={async (v) => {
          setBusy(true);
          try {
            await api('/api/health', { method: 'POST', body: { action: 'day', day: { date, water: v } } });
            await reload();
          } finally { setBusy(false); }
        }}
        onOpen={() => setDayEdit(true)}
      />

      <SuggestBlock
        data={data}
        day={day}
        onPick={(x) => setFood({ date, prefill: x })}
      />

      <div className="h-sec">
        <h3>Що зʼїв<span className="h-count">{meals.length}</span></h3>
        <div className="h-sec-a">
          <button className="h-btn" onClick={() => setCopy(true)}>Скопіювати день</button>
        </div>
      </div>

      {meals.length === 0 ? (
        <div className="h-empty">Записів за цей день немає</div>
      ) : (
        MEALS.filter((m) => meals.some((f) => f.meal === m)).map((m) => (
          <div className="h-meal" key={m}>
            <div className="h-meal-h">
              <span>{m}</span>
              <b>{Math.round(meals.filter((f) => f.meal === m).reduce((a, f) => a + f.kcal, 0))} ккал</b>
            </div>
            {meals.filter((f) => f.meal === m).map((f) => (
              <div className="h-food" key={f.row}>
                <div className="h-food-t">
                  <div className="h-food-n">{f.name}{f.amount ? <i> · {f.amount}</i> : null}</div>
                  {/* підписи, а не три числа через дріб: інакше не згадаєш,
                      котре з них білки, а котре вуглеводи */}
                  <div className="h-food-m">
                    <b>{Math.round(f.kcal)}</b> ккал
                    <span>Б {n1(f.protein)}</span>
                    <span>Ж {n1(f.fat)}</span>
                    <span>В {n1(f.carbs)}</span>
                  </div>
                </div>
                <button className="h-food-x" onClick={() => delFood(f.row)} title="Прибрати">×</button>
              </div>
            ))}
          </div>
        ))
      )}

      {/* Кнопка завжди під рукою: раніше по неї треба було прокрутити вниз,
          а додають їжу разів пʼять на день. */}
      <div className="h-addbar">
        <button className="h-add" onClick={() => setFood({ date })}>+ Додати їжу</button>
      </div>

      {food && (
        <FoodModal
          date={date}
          known={data.food}
          products={data.products || []}
          dishes={data.dishes || []}
          prefill={food.prefill}
          onClose={() => setFood(null)}
          onDone={reload}
        />
      )}

      {dayEdit && (
        <DayModal
          date={date}
          day={day}
          onClose={() => setDayEdit(false)}
          onDone={async () => { await reload(); toast('День записано'); }}
        />
      )}

      {copy && (
        <CopyDayModal
          date={date}
          days={data.days}
          onClose={() => setCopy(false)}
          onDone={async (n) => { await reload(); toast(n ? `Скопійовано записів: ${n}` : 'Копіювати не було чого'); }}
        />
      )}
    </>
  );
}

/* ---------- Штрихкод ---------- */

/**
 * Сканер штрихкодів. У Chrome на Android є вбудований BarcodeDetector —
 * ним і користуємось. У Safari його немає, тож там лишається ввести цифри
 * під штрихкодом руками: це довше, але працює завжди.
 */
function BarcodeScanner({ onFound, onClose }) {
  const videoRef = useRef(null);
  const [err, setErr] = useState('');
  const [manual, setManual] = useState('');
  const [mode, setMode] = useState('start'); // start | camera | manual

  useEffect(() => {
    let stop = false;
    let stream = null;
    let timer = null;
    let controls = null;

    const found = (raw) => {
      const code = String(raw || '').replace(/\D/g, '');
      if (code.length >= 6 && !stop) { stop = true; onFound(code); }
    };

    (async () => {
      const video = videoRef.current;
      if (!video) return;

      // 1) вбудований у браузер розпізнавач — найшвидший, є в Chrome на Android
      const native = typeof window !== 'undefined' && 'BarcodeDetector' in window;
      if (native) {
        let detector;
        try {
          detector = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
          });
        } catch { detector = null; }

        if (detector) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          } catch {
            setErr('Немає доступу до камери');
            setMode('manual');
            return;
          }
          if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
          video.srcObject = stream;
          await video.play().catch(() => {});
          setMode('camera');

          const tick = async () => {
            if (stop) return;
            try {
              const hits = await detector.detect(video);
              if (hits.length) { found(hits[0].rawValue); return; }
            } catch { /* кадр не розпізнався — беремо наступний */ }
            timer = setTimeout(tick, 200);
          };
          tick();
          return;
        }
      }

      // 2) Safari на iPhone такого не має — вантажимо розпізнавач окремо.
      // Саме тому імпорт динамічний: він потрібен лише тут і важить чимало.
      try {
        const [{ BrowserMultiFormatReader }, zx] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        if (stop) return;
        const hints = new Map();
        hints.set(zx.DecodeHintType.POSSIBLE_FORMATS, [
          zx.BarcodeFormat.EAN_13, zx.BarcodeFormat.EAN_8,
          zx.BarcodeFormat.UPC_A, zx.BarcodeFormat.UPC_E,
          zx.BarcodeFormat.CODE_128,
        ]);
        hints.set(zx.DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
        setMode('camera');
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          video,
          (result) => { if (result) found(result.getText()); }
        );
      } catch (e) {
        setErr('Камера недоступна: ' + (e?.message || 'невідома причина'));
        setMode('manual');
      }
    })();

    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      if (controls) { try { controls.stop(); } catch { /* вже зупинено */ } }
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [onFound]);

  return (
    <div className="h-overlay" onClick={(e) => e.target.classList.contains('h-overlay') && onClose()}>
      <div className="h-scan">
        <div className="h-cmp-head">
          <span>Штрихкод</span>
          <button className="h-cmp-x" onClick={onClose}>×</button>
        </div>

        <div className="h-scan-view">
          <video ref={videoRef} playsInline muted autoPlay />
          <div className="h-scan-frame" />
          {mode === 'start' && <div className="h-scan-wait">вмикаємо камеру…</div>}
        </div>

        <div className="h-scan-foot">
          {err && <div className="h-err">{err}</div>}
          <div className="h-hint">
            Наведіть камеру на смужки. Тримайте штрихкод у рамці й трохи
            віддаліть телефон, якщо не читається.
          </div>
          <label>Або ввести цифри руками</label>
          <div className="h-scan-manual">
            <input
              type="tel"
              inputMode="numeric"
              value={manual}
              placeholder="4820000000000"
              onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && manual.length >= 6 && onFound(manual)}
            />
            <button
              className="h-btn h-btn-p"
              disabled={manual.length < 6}
              onClick={() => onFound(manual)}
            >
              Знайти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FoodModal({ date, known, products = [], dishes = [], prefill, onClose, onDone }) {
  // підставляємо за годиною; щойно торкнулись пігулки — далі вирішує людина
  const [meal, setMeal] = useState(() => mealByHour(hourKyiv().h));
  const [mealAuto, setMealAuto] = useState(true);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');
  // клітковина, цукор і натрій ідуть купкою: їх рідко правлять руками,
  // здебільшого вони приїжджають із продукту чи страви разом із рештою
  const [extra, setExtra] = useState({ fiber: '', sugar: '', sodium: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // коли страва прийшла з бази чи каталогу — рахуємо від грамів, а не вручну
  const [per100, setPer100] = useState(null);
  const [grams, setGrams] = useState('100');
  const [scan, setScan] = useState(false);
  const [found, setFound] = useState('');
  const [newCode, setNewCode] = useState('');
  const [np, setNp] = useState({});
  const [paste, setPaste] = useState(null);
  const [pasteInfo, setPasteInfo] = useState('');
  const [portionOf, setPortionOf] = useState(null);
  const [portions, setPortions] = useState('1');

  const takeDish = (d) => {
    setPer100(null); setNewCode('');
    setPortionOf(d);
    setPortions('1');
    setName(d.name);
    setFound('з ваших страв');
    setErr('');
  };

  // порції змінились — перераховуємо страву
  useEffect(() => {
    if (!portionOf) return;
    const k = num(portions) || 1;
    setKcal(String(n1(portionOf.kcal * k)));
    setProtein(String(n1(portionOf.protein * k)));
    setFat(String(n1(portionOf.fat * k)));
    setCarbs(String(n1(portionOf.carbs * k)));
    setExtra(scaleExtra(portionOf, k));
    setAmount(k === 1 ? '1 порція' : `${n1(k)} порції`);
  }, [portionOf, portions]);

  // натиснули підказку «чим добрати» — форма відкривається вже заповненою
  useEffect(() => {
    if (!prefill) return;
    setName(prefill.label);
    setAmount(prefill.unit === 'г' ? `${Math.round(prefill.k)} г` : `${n1(prefill.k)} ${prefill.unit}`);
    setKcal(String(Math.round(prefill.got.kcal)));
    setProtein(String(n1(prefill.got.protein)));
    setFat(String(n1(prefill.got.fat)));
    setCarbs(String(n1(prefill.got.carbs)));
    setExtra(scaleExtra(prefill.got, 1));
    setFound('з підказки «чим добрати»');
  }, [prefill]);

  // грами змінились — перераховуємо все, що знаємо на 100 г
  useEffect(() => {
    if (!per100) return;
    const k = num(grams) / 100;
    setKcal(String(n1(per100.kcal * k)));
    setProtein(String(n1(per100.protein * k)));
    setFat(String(n1(per100.fat * k)));
    setCarbs(String(n1(per100.carbs * k)));
    setExtra(scaleExtra(per100, k));
    setAmount(`${n1(num(grams))} г`);
  }, [per100, grams]);

  const takeProduct = (p, note) => {
    setPortionOf(null);
    setPer100({
      kcal: p.kcal, protein: p.protein, fat: p.fat, carbs: p.carbs,
      fiber: p.fiber, sugar: p.sugar, sodium: p.sodium,
    });
    setName([p.name, p.brand].filter(Boolean).join(' · ') || p.name || 'Без назви');
    setGrams(String(p.serving > 0 ? p.serving : 100));
    setFound(note || '');
    setErr('');
  };

  const byCode = async (code) => {
    setScan(false);
    setBusy(true); setErr(''); setFound('');
    try {
      const r = await api('/api/health', { method: 'POST', body: { action: 'barcode', code } });
      if (r.error) {
        setErr(r.error);
        // не знайшли — пропонуємо завести самому, наступного разу підставиться
        if (r.code) setNewCode(r.code);
        return;
      }
      takeProduct(r.product, r.from === 'база' ? 'з вашої бази' : 'з каталогу Open Food Facts');
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  // те, що вже їв раніше, підставляємо одним дотиком
  const q = name.trim().toLowerCase();
  const seen = [];
  known.forEach((f) => {
    if (!f.name || (q && !f.name.toLowerCase().includes(q))) return;
    if (seen.some((s) => s.name.toLowerCase() === f.name.toLowerCase())) return;
    seen.push(f);
  });

  const use = (f) => {
    setPer100(null); setPortionOf(null); setFound('');
    setName(f.name); setAmount(f.amount);
    setKcal(String(f.kcal)); setProtein(String(f.protein));
    setFat(String(f.fat)); setCarbs(String(f.carbs));
    setExtra(scaleExtra(f, 1));
  };

  // продукти з власної бази — шукаються за назвою так само, як страви
  const prodHits = q
    ? products.filter((p) => (p.name + ' ' + p.brand).toLowerCase().includes(q)).slice(0, 5)
    : [];

  const save = async () => {
    if (!name.trim()) { setErr('Вкажіть страву'); return; }
    setBusy(true); setErr('');
    try {
      await api('/api/health', {
        method: 'POST',
        body: {
          action: 'food',
          entry: { date, meal, name: name.trim(), amount, kcal, protein, fat, carbs, ...extra },
        },
      });
      await onDone();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Додати їжу" onClose={onClose} onSave={save} saveLabel="Додати" busy={busy} error={err}>
      <label>Прийом їжі</label>
      <div className="h-pills">
        {MEALS.map((m) => (
          <button
            key={m}
            className={'h-pill' + (meal === m ? ' on' : '')}
            onClick={() => { setMeal(m); setMealAuto(false); }}
          >
            {m}
          </button>
        ))}
      </div>
      {mealAuto && (
        <div className="h-hint h-hint-auto">
          Обрано за часом — зараз {hourKyiv().hhmm}. Якщо не так, натисніть інше.
        </div>
      )}
      <div className="h-food-top">
        <button className="h-btn h-btn-scan" onClick={() => setScan(true)} disabled={busy}>
          Сканувати штрихкод
        </button>
      </div>
      <div className="h-paste">
        <button className="h-paste-b" onClick={() => setPaste(paste === null ? '' : null)}>
          {paste === null ? 'Вставити відповідь із чату' : 'Згорнути'}
        </button>
        {paste !== null && (
          <>
            <textarea
              className="h-paste-t"
              rows={4}
              value={paste}
              autoFocus
              placeholder={'Сфотографуйте страву в Gemini чи іншому чаті, спитайте калорійність\nі вставте відповідь сюди — числа підставляться самі.'}
              onChange={(e) => {
                setPaste(e.target.value);
                const r = parseNutrition(e.target.value);
                if (!r) { setPasteInfo(''); return; }
                setPortionOf(null); setPer100(null);
                if (r.name) setName(r.name);
                if (r.grams !== null) setAmount(`${n1(r.grams)} г`);
                if (r.kcal !== null) setKcal(String(n1(r.kcal)));
                if (r.protein !== null) setProtein(String(n1(r.protein)));
                if (r.fat !== null) setFat(String(n1(r.fat)));
                if (r.carbs !== null) setCarbs(String(n1(r.carbs)));
                const got = ['ккал', 'білки', 'жири', 'вуглеводи']
                  .filter((_, i) => [r.kcal, r.protein, r.fat, r.carbs][i] !== null);
                setPasteInfo(got.length ? 'Розпізнано: ' + got.join(', ') : '');
              }}
            />
            {pasteInfo && <div className="h-found">{pasteInfo}</div>}
            <div className="h-hint">
              Питайте так: «Скільки тут калорій, білків, жирів і вуглеводів?
              Відповідай числами». Чат назве приблизну вагу порції — перевірте
              її очима, бо саме вага дає найбільшу похибку.
            </div>
          </>
        )}
      </div>

      {dishes.length > 0 && (
        <>
          <label>Мої страви</label>
          <div className="h-seen">
            {dishes.map((d) => (
              <button key={d.name} className="h-seen-b is-dish" onClick={() => takeDish(d)}>
                {d.name} <i>{Math.round(d.kcal)} ккал</i>
              </button>
            ))}
          </div>
          {portionOf && (
            <>
              <label>Скільки порцій</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.25"
                value={portions}
                onChange={(e) => setPortions(e.target.value)}
              />
              <div className="h-hint">
                Одна порція «{portionOf.name}» — <b>{Math.round(portionOf.kcal)}</b> ккал.
              </div>
            </>
          )}
        </>
      )}
      <label>Страва</label>
      <input
        type="text"
        value={name}
        autoFocus
        onChange={(e) => { setName(e.target.value); setPer100(null); setPortionOf(null); setFound(''); }}
        placeholder="вівсянка, куряче філе…"
      />
      {found && <div className="h-found">Знайдено {found}</div>}
      {newCode && (
        <div className="h-hint">
          Штрихкод <b>{newCode}</b> застосунку невідомий. Заповніть значення
          на 100 г нижче — і він запамʼятає цей продукт назавжди.
          <div className="h-newprod">
            <label>Ккал на 100 г</label>
            <div className="h-row4">
              <input type="number" inputMode="decimal" placeholder="ккал"
                onChange={(e) => setNp((p) => ({ ...p, kcal: e.target.value }))} />
              <input type="number" inputMode="decimal" placeholder="Б"
                onChange={(e) => setNp((p) => ({ ...p, protein: e.target.value }))} />
              <input type="number" inputMode="decimal" placeholder="Ж"
                onChange={(e) => setNp((p) => ({ ...p, fat: e.target.value }))} />
              <input type="number" inputMode="decimal" placeholder="В"
                onChange={(e) => setNp((p) => ({ ...p, carbs: e.target.value }))} />
            </div>
            <button
              className="h-btn h-btn-p"
              style={{ marginTop: 10 }}
              disabled={!name.trim() || !num(np.kcal)}
              onClick={async () => {
                const prod = {
                  code: newCode, name: name.trim(), brand: '',
                  kcal: num(np.kcal), protein: num(np.protein),
                  fat: num(np.fat), carbs: num(np.carbs), serving: 0,
                  source: 'вручну',
                };
                setBusy(true);
                try {
                  await api('/api/health', { method: 'POST', body: { action: 'product', product: prod } });
                  takeProduct(prod, 'збережено у вашу базу');
                  setNewCode(''); setErr('');
                } catch (e) { setErr(e.message); } finally { setBusy(false); }
              }}
            >
              Запамʼятати продукт
            </button>
          </div>
        </div>
      )}
      {(seen.length > 0 || prodHits.length > 0) && (
        <div className="h-seen">
          {prodHits.map((p) => (
            <button key={'p' + p.row} className="h-seen-b is-prod" onClick={() => takeProduct(p, 'з вашої бази')}>
              {p.name} <i>{Math.round(p.kcal)} ккал/100 г</i>
            </button>
          ))}
          {seen.slice(0, 6).map((f) => (
            <button key={f.row} className="h-seen-b" onClick={() => use(f)}>
              {f.name} <i>{Math.round(f.kcal)} ккал</i>
            </button>
          ))}
        </div>
      )}
      {portionOf ? null : per100 ? (
        <>
          <label>Скільки зʼїли, г</label>
          <input
            type="number"
            inputMode="decimal"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
          />
          <div className="h-hint">
            На 100 г: <b>{n1(per100.kcal)}</b> ккал · Б <b>{n1(per100.protein)}</b> ·
            Ж <b>{n1(per100.fat)}</b> · В <b>{n1(per100.carbs)}</b>.
            Числа нижче перераховуються самі.
          </div>
        </>
      ) : (
        <>
          <label>Кількість</label>
          <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100 г, 1 порція…" />
        </>
      )}
      <div className="h-row4">
        <div><label>Ккал</label><input type="number" inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} /></div>
        <div><label>Білки</label><input type="number" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} /></div>
        <div><label>Жири</label><input type="number" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} /></div>
        <div><label>Вугл.</label><input type="number" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} /></div>
      </div>
      {/* Три числа, які частіше приїжджають самі — зі штрихкоду чи страви.
          Лишаються порожніми, якщо про них нічого не відомо. */}
      <div className="h-row3">
        <div><label>Клітковина</label><input type="number" inputMode="decimal" value={extra.fiber}
          onChange={(e) => setExtra((p) => ({ ...p, fiber: e.target.value }))} /></div>
        <div><label>Цукор</label><input type="number" inputMode="decimal" value={extra.sugar}
          onChange={(e) => setExtra((p) => ({ ...p, sugar: e.target.value }))} /></div>
        <div><label>Натрій, мг</label><input type="number" inputMode="decimal" value={extra.sodium}
          onChange={(e) => setExtra((p) => ({ ...p, sodium: e.target.value }))} /></div>
      </div>
      {scan && <BarcodeScanner onFound={byCode} onClose={() => setScan(false)} />}
    </Modal>
  );
}

/*
 * Невеликий довідник звичайних продуктів на 100 г. Потрібен, щоб підказки
 * працювали з першого дня, поки власна база порожня. Числа орієнтовні —
 * усереднені довідкові, а не з лабораторії; свої продукти завжди точніші
 * й тому в підказках ідуть першими.
 */
const BASIC_FOODS = [
  // білок
  { name: 'Куряче філе, варене', kcal: 165, protein: 31, fat: 3.6, carbs: 0 },
  { name: 'Індичка, філе', kcal: 135, protein: 29, fat: 1.7, carbs: 0 },
  { name: 'Тріска / мінтай', kcal: 78, protein: 17.8, fat: 0.7, carbs: 0 },
  { name: 'Тунець у власному соку', kcal: 96, protein: 22, fat: 1, carbs: 0 },
  { name: 'Яловичина, пісна', kcal: 187, protein: 26, fat: 9, carbs: 0 },
  { name: 'Лосось', kcal: 208, protein: 20, fat: 13, carbs: 0 },
  { name: 'Яйце куряче', kcal: 157, protein: 12.7, fat: 11.5, carbs: 0.7 },
  { name: 'Яєчний білок', kcal: 48, protein: 11, fat: 0.2, carbs: 0.7 },
  { name: 'Сир кисломолочний 5%', kcal: 121, protein: 17, fat: 5, carbs: 1.8 },
  { name: 'Сир кисломолочний 0%', kcal: 71, protein: 16, fat: 0.2, carbs: 1.8 },
  { name: 'Грецький йогурт 2%', kcal: 73, protein: 10, fat: 2, carbs: 3.6 },
  { name: 'Кефір 1%', kcal: 40, protein: 3, fat: 1, carbs: 4 },
  { name: 'Сир твердий 45%', kcal: 350, protein: 25, fat: 27, carbs: 0 },
  // вуглеводи
  { name: 'Гречка, варена', kcal: 110, protein: 4.2, fat: 1.1, carbs: 21 },
  { name: 'Рис, варений', kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
  { name: 'Вівсянка на воді', kcal: 88, protein: 3, fat: 1.7, carbs: 15 },
  { name: 'Картопля, варена', kcal: 82, protein: 2, fat: 0.1, carbs: 17 },
  { name: 'Макарони, варені', kcal: 131, protein: 5, fat: 1.1, carbs: 25 },
  { name: 'Хліб житній', kcal: 250, protein: 8, fat: 3, carbs: 45 },
  { name: 'Квасоля, варена', kcal: 123, protein: 7.8, fat: 0.5, carbs: 21 },
  { name: 'Сочевиця, варена', kcal: 116, protein: 9, fat: 0.4, carbs: 20 },
  { name: 'Банан', kcal: 89, protein: 1.1, fat: 0.3, carbs: 23 },
  { name: 'Яблуко', kcal: 52, protein: 0.3, fat: 0.2, carbs: 14 },
  // жири
  { name: 'Олія соняшникова', kcal: 899, protein: 0, fat: 100, carbs: 0 },
  { name: 'Горіхи волоські', kcal: 654, protein: 15, fat: 65, carbs: 14 },
  { name: 'Авокадо', kcal: 160, protein: 2, fat: 15, carbs: 9 },
  // овочі
  { name: 'Огірок', kcal: 15, protein: 0.8, fat: 0.1, carbs: 2.8 },
  { name: 'Помідор', kcal: 18, protein: 0.9, fat: 0.2, carbs: 3.9 },
  { name: 'Капуста, тушкована', kcal: 40, protein: 2, fat: 1, carbs: 6 },
];

/* ---------- Інфографіка в стилі Apple ---------- */

/**
 * Кільця активності. Три дуги від 12-ї години за годинниковою стрілкою,
 * як у Apple: рух, тренування, розминка. Перевиконання не обрізаємо —
 * кільце йде на друге коло, це видно за яскравішим кінцем.
 */
function Rings({ move, moveGoal, exercise, exerciseGoal, stand, standGoal, size = 168 }) {
  const rings = [
    { v: move, g: moveGoal, color: 'var(--ring-move)', dim: 'var(--ring-move-dim)', r: 0.42, label: 'Рух' },
    { v: exercise, g: exerciseGoal, color: 'var(--ring-ex)', dim: 'var(--ring-ex-dim)', r: 0.30, label: 'Тренування' },
    { v: stand, g: standGoal, color: 'var(--ring-stand)', dim: 'var(--ring-stand-dim)', r: 0.18, label: 'Розминка' },
  ];
  const w = 12 / 168 * size;

  return (
    <svg className="h-rings" viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Кільця активності">
      {rings.map((x, i) => {
        const rad = x.r * 100;
        const len = 2 * Math.PI * rad;
        const pct = x.g > 0 ? Math.min(1, x.v / x.g) : 0;
        return (
          <g key={i} transform="rotate(-90 50 50)">
            <circle cx="50" cy="50" r={rad} fill="none" stroke={x.dim} strokeWidth={w * 100 / size} />
            <circle
              cx="50" cy="50" r={rad} fill="none"
              stroke={x.color}
              strokeWidth={w * 100 / size}
              strokeLinecap="round"
              strokeDasharray={`${len * pct} ${len}`}
              className="h-ring-arc"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Підпис до кільця: число, ціль і колір */
function RingLegend({ rows }) {
  return (
    <div className="h-ring-leg">
      {rows.map((r) => (
        <div className="h-ring-row" key={r.label}>
          <span className="h-ring-dot" style={{ background: r.color }} />
          <span className="h-ring-l">{r.label}</span>
          <span className="h-ring-v" style={{ color: r.color }}>
            {r.value}<i>/{r.goal} {r.unit}</i>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Стовпчики за останні дні з лінією середнього — так Apple показує
 * «Діаграми» у «Здоровʼї». Стовпчик за сьогодні підсвічений.
 */
function WeekBars({ days, pick, goal, unit = '', label, color = 'var(--ring-move)', span = 7 }) {
  const now = today();
  const t0 = stamp(now);
  const p2 = (x) => String(x).padStart(2, '0');
  const key = (t) => {
    const d = new Date(t);
    return `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  };

  // Ряд будуємо по днях, а не по записах: інакше день без запису просто
  // зникав, і три стовпчики розтягувались на всю ширину з дірками між ними.
  const byDate = new Map(days.map((d) => [d.date, d]));
  const slots = [];
  for (let i = span - 1; i >= 0; i--) {
    const k = key(t0 - i * 86400000);
    slots.push({ k, v: num(pick(byDate.get(k) || {})) });
  }

  const vals = slots.map((s) => s.v);
  if (!vals.some((v) => v > 0)) return null;

  const filled = vals.filter((v) => v > 0);
  const avg = filled.reduce((a, v) => a + v, 0) / filled.length;

  // Верх шкали — рівне число трохи вище за найбільший стовпчик або ціль,
  // щоб підписи осі не були на кшталт «1387».
  const top = (() => {
    const raw = Math.max(...vals, num(goal), 1);
    const step = Math.pow(10, Math.floor(Math.log10(raw)));
    return Math.ceil(raw / (step / 2)) * (step / 2);
  })();

  const fmt = (v) => (v >= 10000 ? Math.round(v / 1000) + 'к'
    : v >= 1000 ? Math.round(v / 100) / 10 + 'к' : String(Math.round(v)));

  // Підписуємо не кожен день: підпис «28.07» ширший за слот, тож поруч
  // потрібні порожні. На два тижні виходить пʼять підписів — читається.
  const everyN = slots.length > 8 ? Math.ceil(slots.length / 5) : 1;

  return (
    <div className="h-week">
      <div className="h-week-h">
        <span className="h-week-t">{label}</span>
        {filled.length > 0 && (
          <span className="h-week-a">
            у середньому <b>{fmt(avg)}</b> {unit}
          </span>
        )}
      </div>

      <div className="h-week-plot">
        <div className="h-week-y">
          {[top, top / 2, 0].map((v, i) => <span key={i}>{fmt(v)}</span>)}
        </div>
        <div className="h-week-area">
          <div className="h-week-grid"><i /><i /><i /></div>
          {num(goal) > 0 && num(goal) <= top && (
            <div className="h-week-goal" style={{ bottom: `${(num(goal) / top) * 100}%` }}>
              <span>ціль {fmt(num(goal))}</span>
            </div>
          )}
          <div className="h-week-bars">
            {slots.map((s) => {
              const done = num(goal) > 0 && s.v >= num(goal);
              return (
                <div className="h-week-c" key={s.k}>
                  {s.v > 0 && (
                    <div
                      className={'h-week-bar' + (done ? ' is-done' : '') + (s.k === now ? ' is-today' : '')}
                      style={{ height: `max(3px, ${(s.v / top) * 100}%)`, background: color }}
                      title={`${s.k} — ${fmt(s.v)} ${unit}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Підписи ставимо по місцю, а не комірками: «28.07» ширше за слот,
          і в комірці воно б не помістилось. Рахуємо від кінця — сьогодні
          підписане завжди, решта відступає рівно. */}
      <div className="h-week-x">
        {slots.map((s, i) => {
          if ((slots.length - 1 - i) % everyN !== 0) return null;
          const at = ((i + 0.5) / slots.length) * 100;
          const edge = i === 0 ? ' at-start' : i === slots.length - 1 ? ' at-end' : '';
          return (
            <span
              key={s.k}
              className={(s.k === now ? 'is-today' : '') + edge}
              style={{ left: at + '%' }}
            >
              {s.k.slice(0, 5)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Плитка показника: велике число, підпис, зміна */
function Tile({ value, unit, label, delta, deltaGood, sub, tone }) {
  const better = delta === null || delta === undefined || delta === 0 ? null
    : (deltaGood === 'down' ? delta < 0 : delta > 0);
  return (
    <div className="h-tile">
      <div className="h-tile-l">{label}</div>
      <div className="h-tile-v" style={tone ? { color: tone } : undefined}>
        {value}{unit && <i> {unit}</i>}
      </div>
      {sub && <div className="h-tile-s">{sub}</div>}
      {delta !== null && delta !== undefined && delta !== 0 && (
        <div className={'h-tile-d' + (better ? ' is-good' : ' is-bad')}>
          {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}
        </div>
      )}
    </div>
  );
}

/**
 * Верх вкладки «День»: кільця, головні показники й тижневі стовпчики.
 * Усе, заради чого відкривають сторінку, — на першому екрані.
 */
function TodayBoard({ data, day, date }) {
  const g = data.goals || {};
  const moveGoal = num(g.burned) || 600;
  const exGoal = num(g.exercise) || 30;
  const standGoal = num(g.stand) || 12;

  // порівнюємо з середнім за попередні сім днів, а не з учора: так менше шуму
  const before = data.days.filter((d) => stamp(d.date) < stamp(date)).slice(-7);
  const avgOf = (k) => {
    const v = before.map((d) => num(d[k])).filter((x) => x > 0);
    return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null;
  };
  const dOf = (k) => {
    const a = avgOf(k);
    return a === null || !num(day[k]) ? null : Math.round(num(day[k]) - a);
  };

  const has = (k) => num(day[k]) > 0;
  const anyRing = has('burned') || has('workout') || has('stand');

  return (
    <div className="h-board">
      {anyRing && (
        <div className="h-board-rings">
          <Rings
            move={num(day.burned)} moveGoal={moveGoal}
            exercise={num(day.workout)} exerciseGoal={exGoal}
            stand={num(day.stand)} standGoal={standGoal}
          />
          <RingLegend rows={[
            { label: 'Рух', value: Math.round(num(day.burned)), goal: moveGoal, unit: 'ккал', color: 'var(--ring-move)' },
            { label: 'Тренування', value: Math.round(num(day.workout)), goal: exGoal, unit: 'хв', color: 'var(--ring-ex)' },
            { label: 'Розминка', value: Math.round(num(day.stand)), goal: standGoal, unit: 'год', color: 'var(--ring-stand)' },
          ]} />
        </div>
      )}

      {/* Кроки, вода, сон і решта тепер у картках, що гортаються, — тут
          лишились тільки ті числа, яких там немає. */}
      <div className="h-tiles">
        {has('distance') && (
          <Tile label="Дистанція" value={n1(day.distance)} unit="км" delta={dOf('distance')} deltaGood="up" />
        )}
        {has('hrv') && (
          <Tile label="ВСР" value={Math.round(num(day.hrv))} unit="мс"
            delta={dOf('hrv')} deltaGood="up" tone="var(--ring-stand)"
            sub="вище — краще відновлення" />
        )}
        {/* Кільце «Рух» показує лише активні калорії. Разом зі спокоєм це
            вже все, що тіло витратило за добу, — з цим числом і треба
            порівнювати з'їдене, а не з самим рухом. */}
        {has('restEnergy') && (
          <Tile label="Разом спалено"
            value={Math.round(num(day.burned) + num(day.restEnergy))} unit="ккал"
            tone="var(--ring-move)"
            sub={`рух ${Math.round(num(day.burned))} + спокій ${Math.round(num(day.restEnergy))}`} />
        )}
      </div>

      <div className="h-weeks">
        <WeekBars days={data.days} pick={(d) => d.steps} goal={num(g.steps)}
          unit="кроків" label="Кроки за тиждень" color="var(--ring-ex)" />
        <WeekBars days={data.days} pick={(d) => d.kcal} goal={num(g.kcal)}
          unit="ккал" label="Калорії за тиждень" color="var(--ring-move)" />
      </div>
    </div>
  );
}

/** Швидкі кнопки для води й решти денних чисел */
function DayStats({ day, goals, onWater, onOpen }) {
  const water = num(day.water);
  const glass = 250;

  return (
    <div className="h-quick">
      <div className="h-quick-w">
        <span className="h-quick-l">Вода</span>
        <button className="h-quick-b" disabled={water <= 0} onClick={() => onWater(Math.max(0, water - glass))}>−</button>
        <span className="h-quick-v">{water}<i> мл</i></span>
        <button className="h-quick-b" onClick={() => onWater(water + glass)}>+</button>
        <button className="h-quick-x" onClick={() => onWater(water + 500)}>+500</button>
      </div>
      <button className="h-btn h-quick-more" onClick={onOpen}>
        Кроки, тренування, сон
      </button>
    </div>
  );
}

/** Решта денних чисел — те, що вводиться раз на день */
function DayModal({ date, day, onClose, onDone }) {
  const [steps, setSteps] = useState(day.steps ? String(day.steps) : '');
  const [burned, setBurned] = useState(day.burned ? String(day.burned) : '');
  const [workout, setWorkout] = useState(day.workout ? String(day.workout) : '');
  const [sleep, setSleep] = useState(day.sleep ? String(day.sleep) : '');
  const [water, setWater] = useState(day.water ? String(day.water) : '');
  const [mood, setMood] = useState(day.mood || '');
  const [note, setNote] = useState(day.note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api('/api/health', {
        method: 'POST',
        body: { action: 'day', day: { date, steps, burned, workout, sleep, water, mood, note } },
      });
      await onDone();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`День ${date}`} onClose={onClose} onSave={save} busy={busy} error={err}>
      <div className="h-row2">
        <div>
          <label>Кроки</label>
          <input type="number" inputMode="numeric" value={steps} autoFocus onChange={(e) => setSteps(e.target.value)} />
        </div>
        <div>
          <label>Вода, мл</label>
          <input type="number" inputMode="numeric" step="50" value={water} onChange={(e) => setWater(e.target.value)} />
        </div>
        <div>
          <label>Спалено, ккал</label>
          <input type="number" inputMode="numeric" value={burned} onChange={(e) => setBurned(e.target.value)} />
        </div>
        <div>
          <label>Тренування, хв</label>
          <input type="number" inputMode="numeric" value={workout} onChange={(e) => setWorkout(e.target.value)} />
        </div>
        <div>
          <label>Сон, год</label>
          <input type="number" inputMode="decimal" step="0.5" value={sleep} onChange={(e) => setSleep(e.target.value)} />
        </div>
      </div>
      <label>Самопочуття</label>
      <div className="h-pills">
        {MOODS.map((m) => (
          <button key={m} className={'h-pill' + (mood === m ? ' on' : '')} onClick={() => setMood(mood === m ? '' : m)}>
            {m}
          </button>
        ))}
      </div>
      <label>Примітка</label>
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="h-hint">
        Кроки й спалені калорії подивіться в «Здоровʼї» на iPhone — сторінка
        сама їх не бачить. Як налаштувати, щоб вони підставлялись автоматично,
        написано в кінці вкладки «Цілі».
      </div>
    </Modal>
  );
}

/* ---------- Що доїсти ---------- */

/**
 * Підбирає, чим закрити залишок норми. Кандидати — тільки те, що ви самі
 * колись їли або завели: продукти з бази, свої страви й недавні записи.
 * Ніяких порад «взагалі» — лише ваша ж їжа в потрібній кількості.
 */
function suggestions({ left, products, dishes, food }) {
  const need = {
    kcal: Math.max(0, left.kcal),
    protein: Math.max(0, left.protein),
    fat: Math.max(0, left.fat),
    carbs: Math.max(0, left.carbs),
  };
  if (need.kcal < 50) return [];

  const cands = [];

  // продукт із бази — крок 10 г
  products.forEach((p) => {
    if (!p.kcal) return;
    cands.push({
      label: [p.name, p.brand].filter(Boolean).join(' · '),
      kind: 'продукт',
      per: { kcal: p.kcal / 100, protein: p.protein / 100, fat: p.fat / 100, carbs: p.carbs / 100 },
      min: 20, max: 400, step: 10, unit: 'г',
    });
  });

  // своя страва — крок чверть порції
  dishes.forEach((d) => {
    if (!d.kcal) return;
    cands.push({
      label: d.name,
      kind: 'страва',
      per: { kcal: d.kcal, protein: d.protein, fat: d.fat, carbs: d.carbs },
      min: 0.25, max: 3, step: 0.25, unit: 'порц.',
    });
  });

  // довідник — тільки якщо такого продукту немає у власній базі
  const mine = new Set(products.map((p) => p.name.toLowerCase().trim()));
  BASIC_FOODS.forEach((f) => {
    if (mine.has(f.name.toLowerCase())) return;
    cands.push({
      label: f.name,
      kind: 'довідник',
      basic: true,
      per: { kcal: f.kcal / 100, protein: f.protein / 100, fat: f.fat / 100, carbs: f.carbs / 100 },
      min: 20, max: 400, step: 10, unit: 'г',
    });
  });

  // те, що вже їли — беремо найсвіжіше і без повторів
  const seen = new Set();
  [...food].reverse().forEach((f) => {
    if (!f.kcal || !f.name) return;
    const key = f.name.toLowerCase().trim();
    if (seen.has(key) || seen.size >= 25) return;
    seen.add(key);
    cands.push({
      label: f.name,
      kind: f.amount ? `як ${f.amount}` : 'як їли',
      per: { kcal: f.kcal, protein: f.protein, fat: f.fat, carbs: f.carbs },
      min: 0.5, max: 3, step: 0.5, unit: 'порц.',
    });
  });

  const cover = (got, want) => (want > 0 ? Math.min(got, want) / want : 0);
  const over = (got, want) => Math.max(0, got - want) / Math.max(want, 1);

  const scored = [];
  cands.forEach((c) => {
    let best = null;
    for (let k = c.min; k <= c.max + 1e-9; k += c.step) {
      const got = {
        kcal: c.per.kcal * k, protein: c.per.protein * k,
        fat: c.per.fat * k, carbs: c.per.carbs * k,
      };
      // понад залишок калорій не пропонуємо взагалі
      if (got.kcal > need.kcal * 1.05) break;
      const score =
        2 * cover(got.protein, need.protein) +
        cover(got.carbs, need.carbs) +
        cover(got.fat, need.fat) +
        cover(got.kcal, need.kcal) -
        1.5 * over(got.fat, need.fat) -
        over(got.carbs, need.carbs) -
        0.5 * over(got.protein, need.protein);
      if (!best || score > best.score) best = { k, got, score };
    }
    // свої продукти й страви точніші за довідник, тож ідуть попереду
    if (best && best.score > 0.15 && best.got.kcal >= 40) {
      scored.push({ ...c, ...best, score: c.basic ? best.score * 0.85 : best.score });
    }
  });

  // одна назва — одна підказка, найкраща
  const uniq = new Map();
  scored.sort((a, b) => b.score - a.score).forEach((x) => {
    const key = x.label.toLowerCase().trim();
    if (!uniq.has(key)) uniq.set(key, x);
  });
  return [...uniq.values()].slice(0, 5);
}

/** Чого сьогодні бракує найбільше — це і є головна підказка */
function tightest(left, goals) {
  const rows = [
    { key: 'protein', label: 'білка', left: left.protein, goal: num(goals.protein) },
    { key: 'carbs', label: 'вуглеводів', left: left.carbs, goal: num(goals.carbs) },
    { key: 'fat', label: 'жирів', left: left.fat, goal: num(goals.fat) },
  ].filter((r) => r.goal > 0);
  if (!rows.length) return null;
  rows.sort((a, b) => (b.left / b.goal) - (a.left / a.goal));
  return rows[0].left > 0 ? rows[0] : null;
}

function SuggestBlock({ data, day, onPick }) {
  const g = data.goals || {};
  const left = {
    kcal: num(g.kcal) - day.kcal,
    protein: num(g.protein) - day.protein,
    fat: num(g.fat) - day.fat,
    carbs: num(g.carbs) - day.carbs,
  };

  if (!num(g.kcal)) {
    return (
      <div className="h-hint">
        Щоб застосунок підказував, чим добрати норму, задайте її на вкладці «Цілі».
      </div>
    );
  }

  if (left.kcal <= 0) {
    return (
      <div className="h-sug">
        <div className="h-sug-h">Норму вибрано</div>
        <div className="h-sug-n">
          {left.kcal < -50
            ? `Перебір на ${Math.abs(Math.round(left.kcal))} ккал — завтра буде рівніше.`
            : 'Рівно в ціль.'}
        </div>
      </div>
    );
  }

  const list = suggestions({
    left, products: data.products || [], dishes: data.dishes || [], food: data.food || [],
  });
  const tight = tightest(left, g);

  return (
    <div className="h-sug">
      <div className="h-sug-h">Чим добрати</div>
      <div className="h-sug-left">
        <span>ще <b>{Math.round(left.kcal)}</b> ккал</span>
        {left.protein > 0 && <span>Б <b>{n1(left.protein)}</b> г</span>}
        {left.fat > 0 && <span>Ж <b>{n1(left.fat)}</b> г</span>}
        {left.carbs > 0 && <span>В <b>{n1(left.carbs)}</b> г</span>}
      </div>
      {tight && (
        <div className="h-sug-n">
          Найбільше бракує <b>{tight.label}</b> — на це й дивимось у першу чергу.
        </div>
      )}

      {list.some((x) => x.basic) && (
        <div className="h-sug-n h-sug-ref">
          Позначені «довідник» — усереднені значення звичайних продуктів.
          Свої, відскановані чи введені, точніші й показуються першими.
        </div>
      )}

      {list.length === 0 ? (
        <div className="h-sug-n">
          Немає нічого, що вписалося б у залишок — схоже, норма майже вибрана.
        </div>
      ) : (
        <div className="h-sug-list">
          {list.map((x, i) => (
            <button className="h-sug-i" key={i} onClick={() => onPick(x)}>
              <span className="h-sug-t">
                {x.label}
                <i className={x.basic ? 'is-basic' : ''}>{x.kind}</i>
              </span>
              <span className="h-sug-q">
                {x.unit === 'г' ? `${Math.round(x.k)} г` : `${n1(x.k)} ${x.unit}`}
              </span>
              <span className="h-sug-k">
                {Math.round(x.got.kcal)} ккал
                <i>Б {n1(x.got.protein)} · Ж {n1(x.got.fat)} · В {n1(x.got.carbs)}</i>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Вкладка «Страви» ---------- */

function DishesTab({ data, reload, setBusy }) {
  const [edit, setEdit] = useState(null); // {name, items} або 'new'
  const dishes = data.dishes || [];

  const remove = async (name) => {
    if (!confirm(`Прибрати страву «${name}»?`)) return;
    setBusy(true);
    try {
      await api('/api/health', { method: 'POST', body: { action: 'delDish', name } });
      await reload();
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="h-sec">
        <h3>Мої страви<span className="h-count">{dishes.length}</span></h3>
        <div className="h-sec-a">
          <button className="h-btn h-btn-p" onClick={() => setEdit('new')}>+ Страва</button>
        </div>
      </div>
      <div className="h-note">
        Страва — це набір складників із порахованим підсумком. Записали раз —
        далі додаєте її в день одним дотиком, не перебираючи інгредієнти.
      </div>

      {dishes.length === 0 ? (
        <div className="h-empty">Страв ще немає</div>
      ) : (
        dishes.map((d) => (
          <div className="h-dish" key={d.name}>
            <div className="h-dish-h">
              <span className="h-dish-n">{d.name}</span>
              <span className="h-dish-k">{Math.round(d.kcal)} ккал</span>
              <button className="h-food-x" onClick={() => remove(d.name)} title="Прибрати">×</button>
            </div>
            <div className="h-dish-m">
              {d.grams > 0 && <>{n1(d.grams)} г · </>}
              Б {n1(d.protein)} · Ж {n1(d.fat)} · В {n1(d.carbs)}
              {d.grams > 0 && <> · <i>{Math.round((d.kcal / d.grams) * 100)} ккал/100 г</i></>}
            </div>
            <div className="h-dish-i">
              {d.items.map((it, i) => (
                <span key={i}>{it.name}{it.grams ? ` ${n1(it.grams)} г` : ''}</span>
              ))}
            </div>
            <button className="h-btn" onClick={() => setEdit(d)}>Змінити</button>
          </div>
        ))
      )}

      {edit && (
        <DishModal
          dish={edit === 'new' ? null : edit}
          products={data.products || []}
          onClose={() => setEdit(null)}
          onDone={reload}
        />
      )}
    </>
  );
}

function DishModal({ dish, products, onClose, onDone }) {
  const [name, setName] = useState(dish?.name || '');
  const [items, setItems] = useState(
    dish?.items?.length ? dish.items.map((i) => ({ ...i })) : [{ name: '', grams: '', kcal: '', protein: '', fat: '', carbs: '' }]
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (i, key, v) => setItems((p) => p.map((it, j) => (j === i ? { ...it, [key]: v } : it)));

  // взяли продукт з бази — рахуємо його склад від грамів
  const fromProduct = (i, p) => {
    const g = num(items[i].grams) || 100;
    setItems((prev) => prev.map((it, j) => (j === i ? {
      name: [p.name, p.brand].filter(Boolean).join(' · '),
      grams: String(g),
      kcal: String(n1((p.kcal * g) / 100)),
      protein: String(n1((p.protein * g) / 100)),
      fat: String(n1((p.fat * g) / 100)),
      carbs: String(n1((p.carbs * g) / 100)),
      per100: { kcal: p.kcal, protein: p.protein, fat: p.fat, carbs: p.carbs },
    } : it)));
  };

  // грами змінились у складника, взятого з бази — перераховуємо
  const setGrams = (i, v) => {
    setItems((prev) => prev.map((it, j) => {
      if (j !== i) return it;
      if (!it.per100) return { ...it, grams: v };
      const k = num(v) / 100;
      return {
        ...it, grams: v,
        kcal: String(n1(it.per100.kcal * k)),
        protein: String(n1(it.per100.protein * k)),
        fat: String(n1(it.per100.fat * k)),
        carbs: String(n1(it.per100.carbs * k)),
      };
    }));
  };

  const total = items.reduce((a, it) => ({
    grams: a.grams + num(it.grams), kcal: a.kcal + num(it.kcal),
    protein: a.protein + num(it.protein), fat: a.fat + num(it.fat), carbs: a.carbs + num(it.carbs),
  }), { grams: 0, kcal: 0, protein: 0, fat: 0, carbs: 0 });

  const save = async () => {
    if (!name.trim()) { setErr('Вкажіть назву страви'); return; }
    setBusy(true); setErr('');
    try {
      await api('/api/health', {
        method: 'POST',
        body: {
          action: 'dish',
          dish: {
            name: name.trim(),
            rename: dish?.name || '',
            items: items
              .filter((it) => it.name?.trim() || num(it.kcal))
              .map((it) => ({
                name: it.name, grams: num(it.grams), kcal: num(it.kcal),
                protein: num(it.protein), fat: num(it.fat), carbs: num(it.carbs),
              })),
          },
        },
      });
      await onDone();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal
      title={dish ? `Страва: ${dish.name}` : 'Нова страва'}
      onClose={onClose}
      onSave={save}
      busy={busy}
      error={err}
    >
      <label>Назва</label>
      <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="яєчня з овочами" />

      <label>Складники</label>
      {items.map((it, i) => (
        <div className="h-ing" key={i}>
          <div className="h-ing-top">
            <input
              type="text"
              className="h-ing-n"
              value={it.name}
              placeholder="продукт"
              onChange={(e) => set(i, 'name', e.target.value)}
            />
            <input
              type="number"
              inputMode="decimal"
              className="h-ing-g"
              value={it.grams}
              placeholder="г"
              onChange={(e) => setGrams(i, e.target.value)}
            />
            <button className="h-food-x" onClick={() => setItems((p) => p.filter((_, j) => j !== i))}>×</button>
          </div>
          {it.name?.trim() && !it.per100 && (
            <ProductHints
              q={it.name}
              products={products}
              onPick={(p) => fromProduct(i, p)}
            />
          )}
          <div className="h-row4">
            <input type="number" inputMode="decimal" value={it.kcal} placeholder="ккал" onChange={(e) => set(i, 'kcal', e.target.value)} />
            <input type="number" inputMode="decimal" value={it.protein} placeholder="Б" onChange={(e) => set(i, 'protein', e.target.value)} />
            <input type="number" inputMode="decimal" value={it.fat} placeholder="Ж" onChange={(e) => set(i, 'fat', e.target.value)} />
            <input type="number" inputMode="decimal" value={it.carbs} placeholder="В" onChange={(e) => set(i, 'carbs', e.target.value)} />
          </div>
        </div>
      ))}

      <button
        className="h-btn"
        style={{ width: '100%', marginTop: 10, borderStyle: 'dashed' }}
        onClick={() => setItems((p) => [...p, { name: '', grams: '', kcal: '', protein: '', fat: '', carbs: '' }])}
      >
        + складник
      </button>

      <div className="h-dish-total">
        Разом: <b>{Math.round(total.kcal)}</b> ккал
        {total.grams > 0 && <> · {n1(total.grams)} г</>}
        {' · '}Б {n1(total.protein)} · Ж {n1(total.fat)} · В {n1(total.carbs)}
      </div>
    </Modal>
  );
}

/** Підказки з бази продуктів під полем складника */
function ProductHints({ q, products, onPick }) {
  const s = (q || '').trim().toLowerCase();
  const hits = s.length >= 2
    ? products.filter((p) => (p.name + ' ' + p.brand).toLowerCase().includes(s)).slice(0, 4)
    : [];
  if (!hits.length) return null;
  return (
    <div className="h-seen">
      {hits.map((p) => (
        <button key={p.row} className="h-seen-b is-prod" onClick={() => onPick(p)}>
          {p.name} <i>{Math.round(p.kcal)} ккал/100 г</i>
        </button>
      ))}
    </div>
  );
}

/** Перенести їжу з іншого дня */
function CopyDayModal({ date, days, onClose, onDone }) {
  const withFood = days.filter((d) => d.date !== date && d.kcal > 0)
    .sort((a, b) => stamp(b.date) - stamp(a.date));
  const [from, setFrom] = useState(withFood[0]?.date || '');
  const [meals, setMeals] = useState(MEALS);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const toggle = (m) => setMeals((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));

  const save = async () => {
    if (!from) { setErr('Немає дня, з якого копіювати'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api('/api/health', {
        method: 'POST', body: { action: 'copyDay', from, to: date, meals },
      });
      await onDone(r.copied);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`Скопіювати в ${date}`} onClose={onClose} onSave={save} saveLabel="Скопіювати" busy={busy} error={err}>
      {withFood.length === 0 ? (
        <div className="h-empty">Немає жодного дня із записаною їжею</div>
      ) : (
        <>
          <label>Звідки</label>
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {withFood.map((d) => (
              <option key={d.date} value={d.date}>{d.date} · {Math.round(d.kcal)} ккал</option>
            ))}
          </select>
          <label>Що саме</label>
          <div className="h-pills">
            {MEALS.map((m) => (
              <button key={m} className={'h-pill' + (meals.includes(m) ? ' on' : '')} onClick={() => toggle(m)}>
                {m}
              </button>
            ))}
          </div>
          <div className="h-hint">
            Записи додадуться до того, що вже є в цьому дні, — нічого не зітреться.
          </div>
        </>
      )}
    </Modal>
  );
}

/* ---------- Вкладка «Вага» ---------- */

/**
 * Розумна вага: швидкість, темп, прогноз і висновки.
 *
 * Три числа вгорі — це відповідь на «чи туди я йду»: скільки кілограмів
 * на тиждень, який це відсоток маси й коли за таким темпом буде ціль.
 * Нижче — висновки словами, і кожен або хвалить за конкретне число, або
 * називає дію. «Стежте за харчуванням» тут не висновок.
 */
function SmartWeight({ days, body, goals, last }) {
  const goal = num(goals.weight);
  const kcalGoal = num(goals.kcal);
  const w = last ? last.weight : 0;

  const p = pace(days, w);
  const f = forecast(days, goal);
  const list = verdicts({ days, body, goal, kcalGoal, weight: w });

  // менш як за тиждень записів рахувати нема чого — і сказати про це
  // чесніше, ніж показати швидкість, зібрану з двох зважувань
  if (!p) {
    return (
      <div className="h-sw">
        <div className="h-sw-none">
          Зважуйтесь щодня — за тиждень записів тут з’явиться швидкість,
          темп і прогноз. Денна вага стрибає, а висновки робить лише лінія.
        </div>
      </div>
    );
  }

  const paceWord = {
    fast: 'зашвидко',
    good: 'здоровий темп',
    slow: 'повільно',
    flat: 'стоїть',
  }[p.level];

  return (
    <div className="h-sw">
      <div className="h-sw-top">
        <div className="h-sw-c">
          <div className="h-sw-l">За тиждень</div>
          <div className={'h-sw-v is-' + p.dir}>
            {p.kgWeek > 0 ? '+' : ''}{n1(p.kgWeek)} <i>кг</i>
          </div>
          <div className="h-sw-s">за {Math.round(p.days)} діб</div>
        </div>
        <div className="h-sw-c">
          <div className="h-sw-l">Темп</div>
          <div className={'h-sw-v is-' + p.level}>{n1(p.pctWeek)}<i>%</i></div>
          <div className="h-sw-s">{paceWord}</div>
        </div>
        <div className="h-sw-c">
          <div className="h-sw-l">Ціль</div>
          <div className="h-sw-v">
            {f?.done ? '✓' : f?.weeks ? Math.round(f.weeks) : '—'}
            {f?.weeks && <i>тиж.</i>}
          </div>
          <div className="h-sw-s">{f?.date || (f?.stalled ? 'не наближається' : '—')}</div>
        </div>
      </div>

      {list.length > 0 && (
        <div className="h-sw-v-list">
          {list.map((v, i) => (
            <div key={i} className={'h-sw-say is-' + v.tone}>{v.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeightTab({ data, reload }) {
  const [open, setOpen] = useState(null);   // дата, яку редагуємо, або 'new'
  const [shot, setShot] = useState(null);
  const [compare, setCompare] = useState(false);
  const [avgMode, setAvgMode] = useState(false);

  const weights = data.days.filter((d) => d.weight !== null && d.weight !== undefined);
  const last = weights[weights.length - 1] || null;
  const first = weights[0] || null;
  const g = data.goals || {};
  const goal = num(g.weight);
  const start = num(g.startWeight) || (first ? first.weight : 0);

  const diff = last && start ? n1(last.weight - start) : null;
  const toGoal = last && goal ? n1(last.weight - goal) : null;
  const pct = start && goal && start !== goal && last
    ? Math.max(0, Math.min(100, ((start - last.weight) / (start - goal)) * 100))
    : 0;

  const history = [...weights].reverse();
  // порівнювати є що лише коли фото є хоча б у двох днях
  const withPhotos = data.days.filter((d) => PHOTO_SIDES.some((s) => d[s.key]));

  // відсоток жиру з розумних ваг. Береться окремо від останнього зважування:
  // ваги пишуть його не щоразу, тож дата може розійтися — і тоді її видно.
  const fats = data.days.filter((d) => num(d.bodyFat) > 0);
  const lastFat = fats[fats.length - 1] || null;

  const avg7 = avgLast(data.days, 0);
  const avgPrev = avgLast(data.days, 1);
  const trend = avg7 !== null && avgPrev !== null ? n1(avg7 - avgPrev) : null;
  const smooth = weekly(data.days);

  return (
    <>
      <div className="h-wcard">
        <div className="h-wcard-t">
          <div>
            <div className="h-wcard-l">{diff === null ? 'Зміна' : diff > 0 ? 'Ви набрали' : 'Ви скинули'}</div>
            <div className={'h-wcard-d' + (diff > 0 ? ' is-up' : ' is-down')}>
              {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff}`} <i>кг</i>
            </div>
          </div>
          <div className="h-wcard-r">
            <div className="h-wcard-l">Поточна вага</div>
            <div className="h-wcard-v">{last ? n1(last.weight) : '—'} <i>кг</i></div>
          </div>
        </div>
        {goal > 0 && start > 0 && (
          <div className="h-wgoal">
            <div className="h-wgoal-l">досягнуто {Math.round(pct)}% цілі</div>
            <div className="h-wgoal-t"><div className="h-wgoal-f" style={{ width: `${pct}%` }} /></div>
            <div className="h-wgoal-e">
              <span>{n1(start)} кг</span>
              <span>→</span>
              <span>{n1(goal)} кг</span>
            </div>
            {toGoal !== null && (
              <div className="h-wgoal-n">
                {toGoal > 0 ? `лишилось скинути ${toGoal} кг` : toGoal < 0 ? `нижче цілі на ${-toGoal} кг` : 'ціль досягнута'}
              </div>
            )}
          </div>
        )}
        {lastFat && (
          <div className="h-wfat">
            <span className="h-wfat-l">% жиру з ваг</span>
            <span className="h-wfat-v">{n1(lastFat.bodyFat)}<i>%</i></span>
            {(!last || lastFat.date !== last.date) && (
              <span className="h-wfat-d">заміряно {lastFat.date}</span>
            )}
          </div>
        )}
      </div>

      {/*
        Розумна вага. Число на вагах — найменш корисне, що вони дають:
        денна вага гуляє на кілограм від солі й води, а жиру за добу не
        набирається більше ніж сто-двісті грамів фізично. Тут з тих самих
        записів рахується те, що справді відповідає на «чи туди я йду».
      */}
      <SmartWeight days={data.days} body={data.body} goals={g} last={last} />

      {avg7 !== null && (
        <div className="h-avg">
          <div className="h-avg-l">Середнє за 7 днів</div>
          <div className="h-avg-v">{n1(avg7)} <i>кг</i></div>
          {trend !== null && (
            <div className={'h-avg-d' + (trend > 0 ? ' is-up' : trend < 0 ? ' is-down' : '')}>
              {trend > 0 ? '+' : ''}{trend} кг до попереднього тижня
            </div>
          )}
          <div className="h-avg-n">
            Денна вага стрибає від солі й води — рухається саме це число.
          </div>
        </div>
      )}

      <div className="h-sec">
        <h3>Динаміка ваги</h3>
        <div className="h-sec-a">
          <div className="h-pills">
            <button className={'h-pill' + (!avgMode ? ' on' : '')} onClick={() => setAvgMode(false)}>Дні</button>
            <button className={'h-pill' + (avgMode ? ' on' : '')} onClick={() => setAvgMode(true)}>Середнє</button>
          </div>
          {withPhotos.length >= 2 && (
            <button className="h-btn" onClick={() => setCompare(true)}>Порівняти фото</button>
          )}
          <button className="h-btn h-btn-p" onClick={() => setOpen('new')}>+ Записати вагу</button>
        </div>
      </div>

      <LineChart
        points={(avgMode ? smooth : weights.map((d) => ({ d: d.date, v: d.weight }))).slice(-14)}
        goal={goal || null}
        unit=" кг"
      />
      {avgMode && (
        <div className="h-hint">
          Кожна точка — середнє за сім днів до неї. Лінія рівніша за денну,
          бо не реагує на разові стрибки.
        </div>
      )}

      <div className="h-sec"><h3>Історія<span className="h-count">{history.length}</span></h3></div>
      {history.length === 0 ? (
        <div className="h-empty">Ще немає зважувань</div>
      ) : (
        <div className="h-hist">
          {history.map((d, i) => {
            const prev = history[i + 1];
            const delta = prev ? n1(d.weight - prev.weight) : null;
            const photos = PHOTO_SIDES.filter((s) => d[s.key]);
            return (
              <div className="h-hrow" key={d.date}>
                <div className="h-hshots">
                  {photos.map((s) => (
                    <img
                      key={s.key}
                      className="h-hshot"
                      src={photoSrc(d[s.key])}
                      alt={s.label}
                      title={`${s.label} · ${d.date}`}
                      onClick={() => setShot({ src: photoSrc(d[s.key]), label: `${s.label} · ${d.date}` })}
                    />
                  ))}
                  {photos.length < PHOTO_SIDES.length && (
                    <button
                      className="h-hshot-add"
                      onClick={() => setOpen(d.date)}
                      title={photos.length ? 'Додати ще ракурс' : 'Додати фото до цього запису'}
                    >
                      +
                    </button>
                  )}
                </div>
                <span className="h-hw">{n1(d.weight)} кг</span>
                <span className={'h-hd' + (delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : '')}>
                  {delta === null ? '' : `${delta > 0 ? '+' : ''}${delta} кг`}
                </span>
                <button className="h-hedit" onClick={() => setOpen(d.date)} title="Змінити запис">{d.date}</button>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <WeightModal
          data={data}
          initialDate={open === 'new' ? null : open}
          onClose={() => setOpen(null)}
          onDone={reload}
        />
      )}
      {compare && <PhotoCompare data={data} onClose={() => setCompare(false)} />}
      {shot && (
        <div className="h-overlay" onClick={() => setShot(null)}>
          <div className="h-lightbox">
            <img src={shot.src} alt={shot.label} />
            <div className="h-lightbox-c">{shot.label}</div>
          </div>
        </div>
      )}
    </>
  );
}

function WeightModal({ data, initialDate, onClose, onDone }) {
  const [date, setDate] = useState(initialDate || today());
  const existing = data.days.find((d) => d.date === date);
  const [weight, setWeight] = useState('');
  const [photos, setPhotos] = useState({ front: '', side: '', back: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // перемкнули дату — підставляємо те, що вже записано на цей день
  useEffect(() => {
    setWeight(existing?.weight != null ? String(existing.weight) : '');
    setPhotos({ front: existing?.front || '', side: existing?.side || '', back: existing?.back || '' });
    setNote(existing?.note || '');
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!weight.trim()) { setErr('Вкажіть вагу'); return; }
    setBusy(true); setErr('');
    try {
      await api('/api/health', {
        method: 'POST',
        body: { action: 'day', day: { date, weight: num(weight), ...photos, note } },
      });
      await onDone();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Записати вагу" onClose={onClose} onSave={save} busy={busy} error={err}>
      <label>Дата</label>
      <input type="text" value={date} onChange={(e) => setDate(e.target.value)} placeholder="дд.мм.рррр" />
      <label>Вага, кг</label>
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        value={weight}
        autoFocus
        onChange={(e) => setWeight(e.target.value)}
      />
      <label>Фото — три ракурси</label>
      <div className="h-slots">
        {PHOTO_SIDES.map((s) => (
          <PhotoSlot
            key={s.key}
            label={s.label}
            value={photos[s.key]}
            onChange={(v) => setPhotos((p) => ({ ...p, [s.key]: v }))}
          />
        ))}
      </div>
      <div className="h-hint">
        Фото можна зняти зараз або взяти вже готове з телефона. Не обов'язково
        всі три — і не обов'язково сьогодні: додати чи замінити їх можна будь-коли,
        відкривши цей запис знову.
      </div>
      <label>Примітка</label>
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="самопочуття, обставини…" />
    </Modal>
  );
}

/**
 * Порівняння двох дат: три ракурси поруч, з вагою і різницею.
 * Дати обираються самі — найдавніша з фото проти найсвіжішої, бо саме це
 * питання виникає першим: «що змінилось відтоді, як почав».
 */
function PhotoCompare({ data, onClose }) {
  const withPhotos = data.days
    .filter((d) => PHOTO_SIDES.some((s) => d[s.key]))
    .sort((a, b) => stamp(a.date) - stamp(b.date));

  const [left, setLeft] = useState(withPhotos[0]?.date || '');
  const [right, setRight] = useState(withPhotos[withPhotos.length - 1]?.date || '');
  const [side, setSide] = useState(null); // null — усі ракурси
  const [mode, setMode] = useState('side');
  const [pos, setPos] = useState(50);     // де стоїть шторка, %
  const [blink, setBlink] = useState(false); // яке фото показує «блимання»
  const [auto, setAuto] = useState(true);
  const [guides, setGuides] = useState(false);

  const a = withPhotos.find((d) => d.date === left);
  const b = withPhotos.find((d) => d.date === right);
  const sides = side ? PHOTO_SIDES.filter((s) => s.key === side) : PHOTO_SIDES;
  const shown = sides.filter((s) => a?.[s.key] || b?.[s.key]);

  // Шторка й блимання накладають знімки один на одного, тож потрібен один
  // ракурс і обидва фото — інакше накладати нема чого.
  const pairs = PHOTO_SIDES.filter((s) => a?.[s.key] && b?.[s.key]);
  const one = pairs.find((s) => s.key === side) || pairs[0] || null;
  const overlay = mode !== 'side';

  // саме блимання: очей ловить зміну силуету краще, ніж порівняння поруч
  useEffect(() => {
    if (mode !== 'blink' || !auto) return;
    const t = setInterval(() => setBlink((v) => !v), 900);
    return () => clearInterval(t);
  }, [mode, auto]);

  const dw = a?.weight != null && b?.weight != null ? n1(b.weight - a.weight) : null;
  const days = a && b ? Math.round((stamp(b.date) - stamp(a.date)) / 86400000) : null;

  return (
    <div className="h-overlay" onClick={(e) => e.target.classList.contains('h-overlay') && onClose()}>
      <div className="h-cmp">
        <div className="h-cmp-head">
          <span>Порівняння</span>
          <button className="h-cmp-x" onClick={onClose}>×</button>
        </div>

        <div className="h-cmp-pick">
          <select value={left} onChange={(e) => setLeft(e.target.value)}>
            {withPhotos.map((d) => (
              <option key={d.date} value={d.date}>
                {short(d.date)}{d.weight != null ? ` · ${n1(d.weight)} кг` : ''}
              </option>
            ))}
          </select>
          <span className="h-cmp-arrow">→</span>
          <select value={right} onChange={(e) => setRight(e.target.value)}>
            {withPhotos.map((d) => (
              <option key={d.date} value={d.date}>
                {short(d.date)}{d.weight != null ? ` · ${n1(d.weight)} кг` : ''}
              </option>
            ))}
          </select>
        </div>

        {(dw !== null || days !== null) && (
          <div className="h-cmp-sum">
            {days !== null && <span>минуло <b>{Math.abs(days)}</b> дн.</span>}
            {dw !== null && (
              <span className={dw > 0 ? 'is-up' : dw < 0 ? 'is-down' : ''}>
                вага <b>{dw > 0 ? '+' : ''}{dw} кг</b>
              </span>
            )}
          </div>
        )}

        <div className="h-cmp-modes">
          {[
            { key: 'side', label: 'Поруч' },
            { key: 'wipe', label: 'Шторка' },
            { key: 'blink', label: 'Блимання' },
          ].map((m) => (
            <button
              key={m.key}
              className={'h-pill' + (mode === m.key ? ' on' : '')}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="h-cmp-pills">
          {!overlay && (
            <button className={'h-pill' + (side === null ? ' on' : '')} onClick={() => setSide(null)}>Усі</button>
          )}
          {(overlay ? pairs : PHOTO_SIDES).map((s) => (
            <button
              key={s.key}
              className={'h-pill' + ((overlay ? one?.key : side) === s.key ? ' on' : '')}
              onClick={() => setSide(s.key)}
            >
              {s.label}
            </button>
          ))}
          {overlay && (
            <button className={'h-pill' + (guides ? ' on' : '')} onClick={() => setGuides(!guides)}>
              лінії
            </button>
          )}
        </div>

        {overlay && (
          <div className="h-cmp-body">
            {!one ? (
              <div className="h-empty">
                Щоб накласти знімки, потрібне фото одного ракурсу на обидві дати.
                Поки такого немає — подивіться «Поруч».
              </div>
            ) : mode === 'wipe' ? (
              <>
                <div className={'h-wipe' + (guides ? ' has-guides' : '')}>
                  <img className="h-wipe-b" src={photoSrc(b[one.key])} alt={b.date} />
                  <div className="h-wipe-a" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
                    <img src={photoSrc(a[one.key])} alt={a.date} />
                  </div>
                  <div className="h-wipe-line" style={{ left: pos + '%' }} />
                  <span className="h-wipe-t is-l">{short(a.date)}</span>
                  <span className="h-wipe-t is-r">{short(b.date)}</span>
                  <input
                    className="h-wipe-range"
                    type="range" min="0" max="100" step="0.5"
                    value={pos}
                    onChange={(e) => setPos(Number(e.target.value))}
                    aria-label="Пересунути шторку"
                  />
                </div>
                <div className="h-hint">
                  Тягніть поперек фото: ліворуч від лінії — {a.date}, праворуч — {b.date}.
                </div>
              </>
            ) : (
              <>
                <div
                  className={'h-blink' + (guides ? ' has-guides' : '')}
                  onClick={() => { setAuto(false); setBlink((v) => !v); }}
                >
                  <img src={photoSrc((blink ? b : a)[one.key])} alt={(blink ? b : a).date} />
                  <span className="h-blink-t">
                    {(blink ? b : a).date}
                    {(blink ? b : a).weight != null && <b> {n1((blink ? b : a).weight)} кг</b>}
                  </span>
                </div>
                <div className="h-cmp-modes">
                  <button className={'h-pill' + (auto ? ' on' : '')} onClick={() => setAuto(!auto)}>
                    {auto ? 'зупинити' : 'перемикати само'}
                  </button>
                </div>
                <div className="h-hint">
                  Знімки міняються на одному місці — так зміна силуету помітна
                  краще, ніж коли вони поруч. Торкніться фото, щоб гортати вручну.
                </div>
              </>
            )}
          </div>
        )}

        {!overlay && (
        <div className="h-cmp-body">
          {shown.length === 0 ? (
            <div className="h-empty">На цих датах немає фото для порівняння</div>
          ) : shown.map((sd) => (
            <div className="h-cmp-pair" key={sd.key}>
              <div className="h-cmp-t">{sd.label}</div>
              <div className="h-cmp-imgs">
                {[a, b].map((d, i) => (
                  <figure className="h-cmp-fig" key={i}>
                    {d?.[sd.key] ? (
                      <img src={photoSrc(d[sd.key])} alt={`${sd.label} ${d.date}`} />
                    ) : (
                      <div className="h-cmp-none">немає фото</div>
                    )}
                    <figcaption>
                      {d?.date}
                      {d?.weight != null && <b> {n1(d.weight)} кг</b>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Вкладка «Заміри» ---------- */

function BodyTab({ data, reload }) {
  const [open, setOpen] = useState(false);
  const rows = [...data.body].reverse();
  const last = rows[0];
  const prev = rows[1];

  const g = data.goals || {};
  // вага на день заміру, а якщо її нема — найсвіжіша до цієї дати
  const weightAt = (date) => {
    const upto = data.days.filter((d) => d.weight != null && stamp(d.date) <= stamp(date));
    return upto.length ? upto[upto.length - 1].weight : null;
  };
  const derive = (m) => {
    if (!m) return null;
    const w = weightAt(m.date);
    const fat = m.fat != null ? m.fat
      : navyFat({ sex: g.sex, height: g.height, waist: m.waist, neck: m.neck, hips: m.hips });
    const mass = w != null && fat != null ? (w * fat) / 100 : null;
    return {
      weight: w,
      fat,
      fatMass: mass,
      leanMass: mass != null ? w - mass : null,
      bmi: bmi(w, g.height),
    };
  };
  const dLast = derive(last);
  const dPrev = derive(prev);
  const delta = (a, b) => (a != null && b != null ? n1(a - b) : null);

  return (
    <>
      <div className="h-sec">
        <h3>Заміри тіла</h3>
        <button className="h-btn h-btn-p" onClick={() => setOpen(true)}>+ Записати заміри</button>
      </div>

      {!last ? (
        <div className="h-empty">Замірів ще немає</div>
      ) : (
        <>
          <div className="h-mgrid">
            {BODY_FIELDS.filter((f) => f.key !== 'fat' && last[f.key] != null).map((f) => {
              const raw = prev && prev[f.key] != null ? last[f.key] - prev[f.key] : null;
              const d = raw === null ? null : n1(raw);
              return (
                <div className="h-mcell" key={f.key}>
                  <div className="h-mcell-v">{n1(last[f.key])}<i> {f.unit}</i></div>
                  <div className="h-mcell-l">{f.label}</div>
                  {d !== null && d !== 0 && (
                    <div className={'h-mcell-d' + (d > 0 ? ' is-up' : ' is-down')}>
                      {d > 0 ? '+' : ''}{d}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="h-note">Останні заміри: <b>{last.date}</b></div>

          {dLast && (dLast.fat != null || dLast.bmi != null) && (
            <>
              <div className="h-sec"><h3>Порахувалось саме</h3></div>
              <div className="h-mgrid">
                {dLast.fat != null && (
                  <Derived label="Жир" value={n1(dLast.fat)} unit="%"
                    delta={delta(dLast.fat, dPrev?.fat)} good="down" />
                )}
                {dLast.fatMass != null && (
                  <Derived label="Жирова маса" value={n1(dLast.fatMass)} unit="кг"
                    delta={delta(dLast.fatMass, dPrev?.fatMass)} good="down" />
                )}
                {dLast.leanMass != null && (
                  <Derived label="Безжирова маса" value={n1(dLast.leanMass)} unit="кг"
                    delta={delta(dLast.leanMass, dPrev?.leanMass)} good="up" />
                )}
                {dLast.bmi != null && (
                  <Derived label="ІМТ" value={n1(dLast.bmi)} sub={bmiLabel(dLast.bmi)}
                    delta={delta(dLast.bmi, dPrev?.bmi)} good="down" />
                )}
              </div>
              {dLast.fat != null && dLast.weight != null && (
                <ExcessFat weight={dLast.weight} fat={dLast.fat} />
              )}

              <div className="h-hint">
                Відсоток жиру — за формулою ВМС США (талія, шия, зріст).
                {dLast.weight != null && <> Маси пораховані з ваги <b>{n1(dLast.weight)} кг</b>.</>}
                {' '}Це оцінка, а не заміри калiпером — цінна саме динамікою.
              </div>
            </>
          )}

          {!dLast?.fat && (
            <div className="h-hint">
              Щоб рахувалися відсоток жиру й маси, вкажіть стать і зріст на
              вкладці «Цілі», а тут — талію й шию.
            </div>
          )}

          <div className="h-sec"><h3>Історія<span className="h-count">{rows.length}</span></h3></div>
          <TableWrap>
            <table className="h-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  {BODY_FIELDS.map((f) => <th key={f.key}>{f.label}{f.cm ? ', см' : ''}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date}>
                    <td>{r.date}</td>
                    {BODY_FIELDS.map((f) => (
                      <td key={f.key}>{r[f.key] == null ? '—' : n1(r[f.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </>
      )}

      {open && <BodyModal data={data} onClose={() => setOpen(false)} onDone={reload} />}
    </>
  );
}

/**
 * Скільки жиру зайвого. Рахуємо від безжирової маси: вона й є тіло без
 * жиру, тож потрібна вага при бажаному відсотку — це безжирова маса,
 * поділена на «одиниця мінус відсоток».
 */
const SHAPE_TARGETS = [
  { fat: 20, label: 'Здоровий рівень', note: 'без зайвого, але без рельєфу' },
  { fat: 15, label: 'Підтягнуте тіло', note: 'видно форму, живіт плаский' },
  { fat: 12, label: 'Спортивне', note: 'видно прес, помітні мʼязи' },
  { fat: 10, label: 'Сухе', note: 'рельєф; довго тримати важко' },
];

function ExcessFat({ weight, fat }) {
  if (weight == null || fat == null) return null;
  const fatMass = (weight * fat) / 100;
  const lean = weight - fatMass;

  const rows = SHAPE_TARGETS.map((t) => {
    const target = lean / (1 - t.fat / 100);
    return { ...t, target, drop: weight - target };
  });

  return (
    <>
      <div className="h-sec"><h3>Скільки жиру зайвого</h3></div>
      <div className="h-note">
        Зараз жиру <b>{n1(fatMass)} кг</b>, решта — <b>{n1(lean)} кг</b> тіла
        без жиру. Саме її й треба зберегти, скидаючи все інше.
      </div>
      <div className="h-goals">
        {rows.map((r) => (
          <div className={'h-goal-row' + (r.drop <= 0 ? ' is-done' : '')} key={r.fat}>
            <div className="h-goal-t">
              <span className="h-goal-n">{r.label}</span>
              <span className="h-goal-p">{r.fat}%</span>
            </div>
            <div className="h-goal-s">{r.note}</div>
            <div className="h-goal-v">
              {r.drop > 0 ? (
                <>скинути <b>{n1(r.drop)} кг</b> → вага <b>{n1(r.target)} кг</b></>
              ) : (
                <>вже досягнуто</>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="h-hint">
        Розрахунок припускає, що мʼязи збережуться — інакше вага впаде, а
        вигляд не зміниться. Для цього потрібні білок щодня й силові;
        безпечний темп — приблизно <b>0.5–0.7 кг</b> на тиждень, тобто
        дефіцит близько 500 ккал.
      </div>
    </>
  );
}

/** Порахована величина з різницею від попереднього заміру */
function Derived({ label, value, unit, sub, delta, good }) {
  const better = delta === null || delta === 0 ? null
    : (good === 'down' ? delta < 0 : delta > 0);
  return (
    <div className="h-mcell">
      <div className="h-mcell-v">{value}{unit ? <i> {unit}</i> : null}</div>
      <div className="h-mcell-l">{label}</div>
      {sub && <div className="h-mcell-s">{sub}</div>}
      {delta !== null && delta !== 0 && (
        <div className={'h-mcell-d' + (better ? ' is-down' : ' is-up')}>
          {delta > 0 ? '+' : ''}{delta}
        </div>
      )}
    </div>
  );
}

function BodyModal({ data, onClose, onDone }) {
  const [date, setDate] = useState(today());
  const existing = data.body.find((b) => b.date === date);
  const [vals, setVals] = useState({});
  const [note, setNote] = useState('');
  const [manualFat, setManualFat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const g = data.goals || {};
  // формула працює в сантиметрах — переводимо назад те, що ввели в міліметрах
  const auto = navyFat({
    sex: g.sex, height: g.height,
    waist: vals.waist, neck: vals.neck, hips: vals.hips,
  });

  useEffect(() => {
    const v = {};
    BODY_FIELDS.forEach((f) => {
      const raw = existing?.[f.key];
      v[f.key] = raw == null ? '' : String(raw);
    });
    setVals(v);
    setNote(existing?.note || '');
    setManualFat(false);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  // поки відсоток не правили руками — тримаємо його порахованим
  useEffect(() => {
    if (manualFat || auto === null) return;
    const v = String(n1(auto));
    setVals((p) => (p.fat === v ? p : { ...p, fat: v }));
  }, [auto, manualFat]);

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const body = { date, note };
      BODY_FIELDS.forEach((f) => {
        body[f.key] = vals[f.key] === '' ? '' : num(vals[f.key]);
      });
      await api('/api/health', { method: 'POST', body: { action: 'body', body } });
      await onDone();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Заміри тіла" onClose={onClose} onSave={save} busy={busy} error={err}>
      <label>Дата</label>
      <input type="text" value={date} onChange={(e) => setDate(e.target.value)} placeholder="дд.мм.рррр" />
      <div className="h-row2">
        {BODY_FIELDS.map((f) => (
          <div key={f.key}>
            <label>
              {f.label}{f.unit ? `, ${f.unit}` : ''}
              {f.key === 'fat' && auto !== null && !manualFat && <i className="h-auto">авто</i>}
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={vals[f.key] || ''}
              onChange={(e) => {
                if (f.key === 'fat') setManualFat(true);
                setVals((p) => ({ ...p, [f.key]: e.target.value }));
              }}
            />
          </div>
        ))}
      </div>
      {auto !== null && (
        <div className="h-hint">
          Відсоток жиру порахований за формулою ВМС США з талії, шиї та зросту:
          {' '}<b>{n1(auto)}%</b>.
          {manualFat && (
            <> Ви ввели своє значення — <button className="h-link" onClick={() => setManualFat(false)}>повернути пораховане</button>.</>
          )}
        </div>
      )}
      {auto === null && (
        <div className="h-hint">
          Щоб відсоток жиру рахувався сам, заповніть талію й шию тут, а стать
          і зріст — на вкладці «Цілі».
        </div>
      )}
      <label>Примітка</label>
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}

/* ---------- Вкладка «Цілі» ---------- */

function GoalsTab({ data, reload, setBusy }) {
  const [vals, setVals] = useState(() => {
    const v = { sex: data.goals?.sex || 'm' };
    [...PROFILE_FIELDS, ...GOAL_FIELDS].forEach((f) => {
      const raw = data.goals?.[f.key] || '';
      v[f.key] = raw === '' ? '' : String(raw);
    });
    return v;
  });
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  // чи відрізняється те, що на екрані, від записаного в таблиці
  const dirty = [...PROFILE_FIELDS, ...GOAL_FIELDS].some((f) => {
    const stored = data.goals?.[f.key] || '';
    const shown = vals[f.key] === '' || vals[f.key] === undefined ? '' : vals[f.key];
    const norm = String(stored);
    return String(shown) !== norm;
  }) || String(vals.sex || 'm') !== String(data.goals?.sex || 'm');

  const age = vals.birthYear ? new Date().getFullYear() - num(vals.birthYear) : null;

  // остання зважена вага — з неї й рахуємо норму
  const weighed = data.days.filter((d) => d.weight != null);
  const weight = weighed.length ? weighed[weighed.length - 1].weight : null;
  const norm = calcNorm({
    sex: vals.sex, weight, height: vals.height, age,
    activity: vals.activity || '1.375', aim: vals.aim || '-20',
  });

  /** Один запис у таблицю. Порожні значення не шлемо — вони лише сміття. */
  const persist = async (v) => {
    setBusy(true); setErr(''); setSaved(false);
    try {
      const out = {};
      Object.entries(v).forEach(([k, val]) => {
        if (val === undefined || val === null || val === '') return;
        out[k] = String(val);
      });
      await api('/api/health', { method: 'POST', body: { action: 'goals', goals: out } });
      await reload();
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    } finally { setBusy(false); }
  };

  // Кнопка не лише підставляє числа, а й одразу зберігає: поля цілей лежать
  // нижче за екраном, і без запису здавалося, що нічого не сталося.
  const applyNorm = async () => {
    if (!norm) return;
    const next = {
      ...vals,
      kcal: String(norm.kcal),
      protein: String(norm.protein),
      fat: String(norm.fat),
      carbs: String(norm.carbs),
      // цілі кілець теж підставляємо: без них поля лишалися порожні,
      // а кільця мовчки міряли себе за прихованими числами
      burned: String(norm.move),
      exercise: String(norm.exercise),
      stand: String(norm.stand),
      fiber: String(norm.fiber),
      sugar: String(norm.sugar),
      sodium: String(norm.sodium),
    };
    // Воду й кроки формула не рахує — це звичка, а не обмін речовин.
    // Тож лише підказуємо початкове число там, де ще порожньо, і не чіпаємо
    // те, що ви вже поставили собі самі.
    if (!next.water && weight) next.water = String(Math.round(weight * 30 / 50) * 50);
    if (!next.steps) next.steps = '10000';
    setVals(next);
    await persist(next);
  };

  const save = () => persist(vals);


  return (
    <>
      <div className="h-sec"><h3>Профіль</h3></div>
      <div className="h-note">
        Стать і зріст потрібні, щоб застосунок сам рахував відсоток жиру та ІМТ.
      </div>
      <label>Стать</label>
      <div className="h-pills">
        <button className={'h-pill' + (vals.sex !== 'f' ? ' on' : '')} onClick={() => setVals((p) => ({ ...p, sex: 'm' }))}>Чоловік</button>
        <button className={'h-pill' + (vals.sex === 'f' ? ' on' : '')} onClick={() => setVals((p) => ({ ...p, sex: 'f' }))}>Жінка</button>
      </div>
      <div className="h-row2">
        {PROFILE_FIELDS.map((f) => (
          <div key={f.key}>
            <label>{f.label}{f.unit ? `, ${f.unit}` : ''}</label>
            <input
              type="number"
              inputMode="decimal"
              step={f.key === 'birthYear' ? '1' : '0.1'}
              value={vals[f.key]}
              onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      {age !== null && age > 0 && age < 120 && (
        <div className="h-hint">Вам {age} — рахується з року народження.</div>
      )}

      <div className="h-sec"><h3>Скільки вам треба</h3></div>
      <label>Активність</label>
      <select value={vals.activity || '1.375'} onChange={(e) => setVals((p) => ({ ...p, activity: e.target.value }))}>
        {ACTIVITY.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
      </select>
      <label>Мета</label>
      <select value={vals.aim || '-20'} onChange={(e) => setVals((p) => ({ ...p, aim: e.target.value }))}>
        {AIMS.map((a) => <option key={a.key} value={a.key}>{a.label} — {a.note}</option>)}
      </select>

      {norm ? (
        <>
          <div className="h-norm">
            <div className="h-norm-v">{norm.kcal}<i> ккал</i></div>
            <div className="h-norm-l">
              у спокої {norm.bmr} · з активністю {norm.tdee}
            </div>
            <div className="h-norm-m">
              Б {norm.protein} г · Ж {norm.fat} г · В {norm.carbs} г
            </div>
            <div className="h-norm-m">
              Кільця: рух {norm.move} ккал · тренування {norm.exercise} хв · розминка {norm.stand} год
            </div>
            <div className="h-norm-m">
              Клітковина {norm.fiber} г · цукор до {norm.sugar} г · натрій до {norm.sodium} мг
            </div>
            <button className="h-btn h-btn-p" onClick={applyNorm}>
              Підставити в цілі й зберегти
            </button>
            {saved && <div className="h-ok" style={{ marginTop: 8 }}>норми записано</div>}
          </div>
          <div className="h-hint">
            Пораховано за формулою Міффліна-Сан Жеора з ваги <b>{n1(weight)} кг</b>,
            зросту й віку. Це орієнтир: якщо за два-три тижні вага не рухається
            так, як хочете, підправте число руками.
          </div>
        </>
      ) : (
        <div className="h-hint">
          Щоб порахувати норму, потрібні стать, зріст, рік народження і хоча б
          одне зважування.
        </div>
      )}

      <div className="h-sec"><h3>Мої цілі</h3></div>
      <div className="h-note">
        Ці числа задають норми на день і лінію цілі на графіку ваги. Три цілі
        руху, тренувань і розминки — це кільця на вкладці «День»: поки поле
        порожнє, кільце міряє себе за типовим числом (600 ккал, 30 хв, 12 год).
      </div>
      <div className="h-row2">
        {GOAL_FIELDS.map((f) => (
          <div key={f.key}>
            <label>{f.label}{f.unit ? `, ${f.unit}` : ''}</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={vals[f.key]}
              onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      {err && <div className="h-err">{err}</div>}
      <div className="h-sec h-save">
        <button className="h-btn h-btn-p" onClick={save}>Зберегти цілі</button>
        {saved
          ? <span className="h-ok">збережено</span>
          : dirty && <span className="h-dirty">є незбережені зміни</span>}
      </div>

      <div className="h-sec"><h3>Дані з годинника</h3></div>
      <div className="h-hint">
        Сторінка не бачить Apple Health — браузеру туди доступу не дають. Але
        «Команди» на iPhone бачать і вміють надіслати дані сюди.

        <div className="h-steps">
          <div>
            <b>Крок 0. Ключ.</b> У Vercel задайте змінну
            <b> HEALTH_INGEST_TOKEN</b> — довгий рядок, який більше ніде не
            використовується. Перевірка: відкрийте в браузері
            <code> /api/health-in?token=ВАШ_КЛЮЧ</code>, має відповісти
            «Ключ правильний».
          </div>

          <div>
            <b>Крок 1. Один блок на один показник.</b> Це головне. Кожен
            показник — це три дії поспіль, і так для кожного окремо:
            <div className="h-code">
              1 · Найти данные Здоровья<br />
              &nbsp;&nbsp;&nbsp;Тип: <b>Steps</b><br />
              &nbsp;&nbsp;&nbsp;Начало: <b>сегодня</b><br />
              &nbsp;&nbsp;&nbsp;Источник: <b>Apple Watch</b><br />
              2 · Вычислить статистику → <b>Сумма</b><br />
              3 · Задать переменную → имя <b>кроки</b>
            </div>
            Третя дія обовʼязкова. Без неї результат кожного блоку зветься
            однаково — «Сумма», — у тілі запиту всі поля виглядають
            однаково, і легко підставити не ту: тоді кроки полетять і у вагу,
            і в пульс.
          </div>

          <div>
            <b>Крок 1½. Фільтр «Источник».</b> Без нього числа будуть
            завищені. «Здоровʼя» показує кроки один раз, навіть коли їх
            записали і телефон, і годинник; дія «Найти» так не вміє — вона
            складає <i>всі</i> джерела поспіль, і 1271 крок перетворюється на
            2339. Додайте фільтр <b>Источник совпадает с</b> і виберіть
            годинник. Свій перелік джерел видно в «Здоровʼя» → потрібний
            показник → «Источники данных и доступ». Стосується кроків,
            спаленого й відстані — тобто того, що пишуть обидва пристрої.
          </div>

          <div>
            <b>Крок 2. Розмножте блок.</b> Виділіть усі три дії → «Дублювати»,
            і в копії поміняйте лише <i>тип</i>, <i>операцію</i>{' '}
            та <i>імʼя змінної</i>. Що куди — у таблиці нижче. Так сім блоків
            збираються за кілька хвилин. Одна пастка: після дублювання «Сумм»
            у списку стає кілька. Відкрийте нову дію «Задать переменную»,
            натисніть на значення і візьміть <b>нижню</b> «Сумму» — вони йдуть
            у тому ж порядку, що й дії. Додавайте блоки по одному й одразу
            перевіряйте кнопкою ▶: так видно, який саме блок зачепився не туди.
          </div>

          <div>
            <b>Крок 3. Один запит у самому кінці.</b> Дія «Получить
            содержимое URL», адреса <code>/api/health-in</code>. Натисніть
            стрілку <b>›</b>: спосіб <b>POST</b> (вибрати зі списку, не
            перетягувати змінну), запит <b>JSON</b>. У тілі:
            <div className="h-code">
              token &nbsp;&nbsp;&nbsp;= ваш ключ (текст)<br />
              steps &nbsp;&nbsp;&nbsp;= змінна <b>кроки</b><br />
              burned &nbsp;&nbsp;= змінна <b>спалено</b><br />
              …і так далі — своя змінна в кожне поле
            </div>
            Зайвих полів не додавайте: чого немає в запиті, те лишиться в
            таблиці як було.
          </div>

          <div>
            <b>Крок 4. Автоматизація.</b> «Автоматизація» → «Час доби» →
            23:50, щодня, без запиту на підтвердження. Щоб час запуску взагалі
            не мав значення, додайте в тіло ще поле <code>date</code> у
            вигляді <code>дд.мм.рррр</code> — тоді запис завжди піде в
            потрібний день, навіть якщо команда спрацює після півночі.
          </div>
        </div>

        <div className="h-tbl">
          <table>
            <thead>
              <tr><th>Поле</th><th>Тип у «Здоровʼї»</th><th>Операція</th></tr>
            </thead>
            <tbody>
              <tr><td><code>steps</code></td><td>Шаги</td><td>Сумма</td></tr>
              <tr><td><code>burned</code></td><td>Энергия активности</td><td>Сумма</td></tr>
              <tr><td><code>restEnergy</code></td><td>Энергия покоя</td><td>Сумма</td></tr>
              <tr><td><code>workout</code></td><td>Минуты упражнений</td><td>Сумма</td></tr>
              <tr><td><code>stand</code></td><td>Минуты разминки</td><td>Сумма ÷ 60</td></tr>
              <tr><td><code>distance</code></td><td>Дистанция ходьбы и бега</td><td>Сумма</td></tr>
              <tr><td><code>water</code></td><td>Вода</td><td>Сумма</td></tr>
              <tr><td><code>sleep</code></td><td>Сон</td><td>Сумма</td></tr>
              <tr><td><code>pulse</code></td><td>Пульс в покое</td><td>Среднее</td></tr>
              <tr><td><code>hrv</code></td><td>Вариабельность пульса</td><td>Среднее</td></tr>
              <tr><td><code>weight</code></td><td>Вес</td><td>Среднее</td></tr>
              <tr><td><code>bodyFat</code></td><td>Процент жира в организме</td><td>Среднее</td></tr>
            </tbody>
          </table>
        </div>

        Операція вибирається в самій дії: там написано «Вычислить
        <u> Сумма</u> для…» — натисніть підкреслене слово. Пункту «Последнее»
        там немає, тому для ваги й жиру стоїть «Среднее»: хто зважується раз
        на день, отримає рівно своє число.

        <div className="h-steps" style={{ marginTop: 12 }}>
          <div>
            <b>Розминка рахується окремо.</b> «Годин стоячи» у списку
            «Здоровʼя» немає — кільце стояння по-російськи зветься
            «Разминка», а дає воно хвилини. Тому після «Вычислить статистику»
            додайте ще дію «Вычислить» і поділіть суму на 60: колонка чекає
            години. Без ділення 280 хвилин або відсіються за межею, або тихо
            запишуться як «22 години стоячи» — і це гірше, бо схоже на правду.
          </div>
        </div>

        <div className="h-steps" style={{ marginTop: 12 }}>
          <div>
            <b>Що брати, а що ні.</b> З годинника справді корисні кроки,
            спалене, тренування, години стоячи, відстань, пульс і ВСР. Вагу й
            відсоток жиру беріть, лише якщо ваги пишуть у «Здоровʼя», —
            інакше не додавайте ці поля взагалі й вносьте руками на вкладці
            «Вага». Менше блоків — менше шансів переплутати.
          </div>
          <div>
            <b>Як перевірити.</b> Запустіть команду вручну. У відповіді
            <code> saved</code> — кожне поле разом зі <i>значенням</i>, яке
            лягло в таблицю. Дивіться саме на числа: якщо у <code>weight</code>{' '}
            стоїть щось на кшталт кількості кроків, у це поле підставлена
            змінна від чужого блоку.
          </div>
          <div>
            <b>Явно неможливе не запишеться.</b> Вага 11331 кг чи пульс 11331
            відкидаються, а в відповіді зʼявляється список
            <code> ignored</code> із поясненням. Решта полів того ж запиту
            записується як завжди.
          </div>
          <div>
            <b>Число більше, ніж у «Здоровʼї».</b> Майже завжди це подвійний
            рахунок джерел — див. крок 1½. Порівнюйте не на око: 2339 проти
            1271 — це не «команда порахувала інакше», а телефон плюс годинник.
          </div>
          <div>
            <b>Сон майже завжди неповний.</b> Фільтр «Начало — сегодня»
            відсікає ніч, що почалася вчора ввечері. Для сну поставте початок
            «вчера».
          </div>
          <div>
            <b>«748 объектов».</b> Пропущено «Вычислить статистику» — назовні
            йде список записів замість числа. Або ввімкніть «Настройки →
            Быстрые команды → Разрешить отправку большого объёма данных».
          </div>
          <div>
            <b>Одиниці.</b> Чекаємо: кроки — штуки, енергія — ккал, вода — мл,
            тренування — хвилини, сон і години стоячи — години, вага — кг,
            пульс — уд/хв, ВСР — мс, відстань — км, жир — відсотки. Частку
            жиру (0,34) і воду в літрах (2,5) переведемо самі. Відстань
            перевірте: якщо в дії «Найти» стоять метри — поставте кілометри.
          </div>
        </div>
      </div>


      <div className="h-priv">
        <b>Приватність.</b> Ці дані не показуються ніде, крім цієї сторінки: ні в
        пошуку, ні на головній, ні в журналі змін. Доступ має лише <b>{data.owner}</b>.
        {data.separate
          ? ' Записи лежать в окремій таблиці.'
          : ' Зараз листи лежать у спільній таблиці — щоб їх не бачив ніхто з доступом до файлу, задайте змінну HEALTH_SPREADSHEET_ID з ідентифікатором окремої таблиці.'}
      </div>
    </>
  );
}

/* ---------- Вкладка «Ліки» ---------- */

/** Українська множина для довільних форм */
function plur(n, [one, few, many]) {
  const a = Math.abs(Math.round(n));
  const t = a % 100;
  const o = a % 10;
  if (t >= 11 && t <= 14) return many;
  if (o === 1) return one;
  if (o >= 2 && o <= 4) return few;
  return many;
}

const minutesOf = (t) => {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** «дд.мм.рррр» → «рррр-мм-дд» для <input type="date"> і навпаки */
const toInputDate = (s) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((s || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
const fromInputDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || '').trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};

/** Де ми в межах курсу: день N з M, ще не почався чи вже завершений */
function courseInfo(m, todayStamp) {
  const start = stamp(m.start);
  const total = m.days && m.days > 0 ? Math.round(m.days) : null;
  const dayIndex = start ? Math.round((todayStamp - start) / 86400000) + 1 : null;
  const notStarted = dayIndex !== null && dayIndex < 1;
  const finished = total !== null && dayIndex !== null && dayIndex > total;
  const progress = total && dayIndex !== null
    ? Math.max(0, Math.min(100, Math.round((Math.min(dayIndex, total) / total) * 100)))
    : null;
  return { total, dayIndex, notStarted, finished, progress, active: !finished && !notStarted };
}

/** «2000 МО» → { value: '2000', unit: 'МО' } — щоб цифра йшла великим кеглем */
function splitDose(dose) {
  const m = /^\s*(\d+(?:[.,]\d+)?(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?)\s*(.*)$/.exec(dose || '');
  if (m) return { value: m[1].replace(/\s+/g, ''), unit: (m[2] || '').trim() };
  return { value: '', unit: (dose || '').trim() };
}

/** Хвилини від початку доби за київським часом — за ними «прострочено» */
function nowMinKyiv() {
  const fmt = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = {};
  fmt.formatToParts(new Date()).forEach((x) => (p[x.type] = x.value));
  return Number(p.hour) * 60 + Number(p.minute);
}

function MedsTab({ data, reload, setBusy, toast }) {
  const [edit, setEdit] = useState(null);      // { med } або { med: null } для нового
  const [restock, setRestock] = useState(null);
  const [nowMin, setNowMin] = useState(() => nowMinKyiv());

  // «прострочено» й «наступний прийом» залежать від часу — оновлюємо щохвилини
  useEffect(() => {
    const t = setInterval(() => setNowMin(nowMinKyiv()), 60000);
    return () => clearInterval(t);
  }, []);

  const slots = data.slots || [];
  const slotMap = Object.fromEntries(slots.map((s) => [s.key, s]));
  const td = today();
  const ts = stamp(td);

  const meds = (data.meds || []).map((m) => {
    const info = courseInfo(m, ts);
    const taken = m.log[td] || [];
    const pending = info.active ? m.slots.filter((s) => !taken.includes(s)) : [];
    const late = pending.filter((s) => slotMap[s] && minutesOf(slotMap[s].time) < nowMin);
    // «мало» — коли лишилось менше ніж на два дні прийому
    const low = m.stock !== null && m.slots.length > 0 && m.stock <= m.slots.length * 2;
    return { ...m, info, taken, pending, late, low };
  });

  const active = meds.filter((m) => m.info.active);
  const dosesTotal = active.reduce((n, m) => n + m.slots.length, 0);
  const dosesTaken = active.reduce((n, m) => n + m.taken.length, 0);
  const lateTotal = active.reduce((n, m) => n + m.late.length, 0);
  const lowTotal = active.filter((m) => m.low).length;
  const pct = dosesTotal ? Math.round((dosesTaken / dosesTotal) * 100) : 0;

  // найближчий за часом прийом, який ще попереду
  let next = null;
  active.forEach((m) => m.pending.forEach((s) => {
    const meta = slotMap[s];
    if (!meta) return;
    const min = minutesOf(meta.time);
    if (min >= nowMin && (!next || min < next.min)) next = { min, meta, drug: m.drug };
  }));

  const nextLabel = dosesTotal === 0 ? '—'
    : dosesTaken >= dosesTotal ? 'усе прийнято'
    : next ? `${next.meta.key} · ${next.meta.time}`
    : 'на сьогодні все';

  const send = async (body) => {
    setBusy(true);
    try {
      await api('/api/health', { method: 'POST', body });
      await reload();
    } catch (e) {
      toast(e.message);
    } finally { setBusy(false); }
  };

  const toggle = (m, slot) => send({ action: 'takeMed', row: m.row, slot, date: td });

  const byName = (a, b) => a.drug.localeCompare(b.drug, 'uk');
  const groups = [
    {
      title: 'Приймати сьогодні',
      // Тільки за назвою. Спокуса підняти неприйняті вгору є, але тоді
      // картка їде з-під пальця одразу після відмітки — а що прийнято,
      // видно й так: галочка, рамка, лічильник угорі.
      items: active.sort(byName),
    },
    { title: 'Ще не почались', items: meds.filter((m) => m.info.notStarted).sort(byName) },
    { title: 'Курс завершено', items: meds.filter((m) => m.info.finished).sort(byName) },
  ].filter((g) => g.items.length);

  return (
    <>
      <div className="h-med-sum">
        <div className="h-med-sum-l">
          <div className="h-cap">Прийнято сьогодні</div>
          <div className="h-med-big">
            {dosesTaken}<span className="h-med-of">/{dosesTotal}</span>
          </div>
          <div className="h-med-unit">{plur(dosesTotal, ['доза', 'дози', 'доз'])} за день</div>
          <div className={'h-med-bar' + (dosesTotal && dosesTaken >= dosesTotal ? ' is-ok' : '')}>
            <i style={{ width: pct + '%' }} />
          </div>
        </div>
        <div className="h-med-sum-r">
          {[
            ['Наступний', nextLabel, ''],
            ['Прострочено', lateTotal || '—', lateTotal ? ' is-bad' : ''],
            ['Курсів', active.length || '—', ''],
            ['Закінчуються', lowTotal || '—', lowTotal ? ' is-warn' : ''],
          ].map(([cap, val, cls]) => (
            <div key={cap}>
              <span className="h-cap">{cap}</span>
              <span className={'h-med-stat' + cls}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {groups.length === 0 && (
        <div className="h-empty">
          Порожньо. Додайте препарат — і сторінка щодня питатиме, чи прийняли.
        </div>
      )}

      {groups.map((g) => (
        <section key={g.title}>
          <div className="h-sec"><h3>{g.title}</h3></div>
          <div className="h-med-list">
            {g.items.map((m) => (
              <MedCard
                key={m.row}
                med={m}
                slotMap={slotMap}
                today={td}
                onToggle={toggle}
                onEdit={() => setEdit({ med: m })}
                onRestock={() => setRestock(m)}
                onDelete={async () => {
                  if (!confirm(`Видалити «${m.drug}»? Журнал прийомів теж зникне.`)) return;
                  await send({ action: 'delMed', row: m.row });
                }}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="h-addbar">
        <button className="h-add" onClick={() => setEdit({ med: null })}>+ Препарат</button>
      </div>

      {edit && (
        <MedModal
          med={edit.med}
          slots={slots}
          onClose={() => setEdit(null)}
          onSave={async (body) => {
            await send({ action: 'med', med: edit.med ? { ...body, row: edit.med.row } : body });
            setEdit(null);
          }}
        />
      )}

      {restock && (
        <RestockModal
          med={restock}
          onClose={() => setRestock(null)}
          onSave={async (qty) => {
            await send({ action: 'restockMed', row: restock.row, qty });
            setRestock(null);
          }}
        />
      )}
    </>
  );
}

function MedCard({ med, slotMap, today: td, onToggle, onEdit, onRestock, onDelete }) {
  const { value, unit } = splitDose(med.dose);
  const done = med.info.active && med.slots.length > 0 && med.pending.length === 0;
  const cls = med.info.finished ? ' is-fin'
    : med.info.notStarted ? ' is-soon'
    : med.late.length ? ' is-late'
    : done ? ' is-done' : '';

  const n = med.slots.length;
  const perDay = n
    ? `${n} ${plur(n, ['прийом', 'прийоми', 'прийомів'])} на добу`
    : 'розклад не заданий';

  // Велика цифра — доза. Якщо дози не вказали, її місце займає кількість
  // прийомів, і тоді підпис іде без числа: інакше «2» стояло б двічі.
  let big = value;
  let asText = false;
  let sub = [unit, n ? perDay : ''].filter(Boolean).join(' · ');
  if (!value && unit) { big = unit; asText = true; sub = perDay; }
  else if (!value) {
    big = n || '—';
    asText = !n;
    sub = n ? plur(n, ['прийом на добу', 'прийоми на добу', 'прийомів на добу']) : perDay;
  }

  // тиждень позаду: крапка на кожен прийом, зелена — відмічений
  const week = [...Array(7)].map((_, i) => {
    const d = new Date(stamp(td) - (6 - i) * 86400000);
    const p = (x) => String(x).padStart(2, '0');
    const key = `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
    return { key, short: `${Number(p(d.getUTCDate()))}`, taken: med.log[key] || [] };
  });

  return (
    <div className={'h-med' + cls}>
      <div className="h-med-head">
        <span className="h-med-name">{med.drug || 'Без назви'}</span>
        {med.late.length > 0 && <span className="h-med-flag">прострочено</span>}
      </div>

      <div className={'h-med-big' + (asText ? ' is-text' : '')}>{big}</div>
      <div className="h-med-unit">{sub || ' '}</div>

      {med.slots.length > 0 && (
        <div className="h-doses">
          {med.slots.map((s) => {
            const meta = slotMap[s] || { key: s, time: '' };
            const on = med.taken.includes(s);
            const late = med.late.includes(s);
            return (
              <button
                key={s}
                type="button"
                className={'h-dose' + (on ? ' is-on' : '') + (late ? ' is-late' : '')}
                onClick={() => onToggle(med, s)}
                disabled={!med.info.active}
                title={on ? 'Зняти відмітку' : 'Відмітити прийом'}
              >
                <span className="h-dose-m">{on ? '✓' : ''}</span>
                <span>{meta.key}</span>
                <span className="h-dose-t">{meta.time}</span>
              </button>
            );
          })}
        </div>
      )}

      {med.info.total && med.info.dayIndex !== null ? (
        <div className="h-med-course">
          <div className="h-med-row">
            <span>День {Math.min(Math.max(med.info.dayIndex, 0), med.info.total)} з {med.info.total}</span>
            <span>
              {med.info.finished ? 'завершено'
                : med.info.notStarted ? `старт ${med.start}`
                : `лишилось ${med.info.total - med.info.dayIndex + 1} ${plur(med.info.total - med.info.dayIndex + 1, ['день', 'дні', 'днів'])}`}
            </span>
          </div>
          <div className={'h-med-bar' + (med.info.finished ? ' is-ok' : '')}>
            <i style={{ width: (med.info.progress || 0) + '%' }} />
          </div>
        </div>
      ) : med.start ? (
        <div className="h-med-row">
          <span>{med.info.notStarted ? 'Старт' : 'Від'} {med.start}</span>
          <span>{med.info.notStarted ? 'ще не почався' : 'без обмеження'}</span>
        </div>
      ) : null}

      {med.stock !== null && (
        <div className="h-med-row">
          <span className={med.low ? 'is-bad' : ''}>
            Залишок <b>{med.stock}</b> {plur(med.stock, ['таблетка', 'таблетки', 'таблеток'])}
          </span>
          <button className="h-link" onClick={onRestock}>поповнити</button>
        </div>
      )}

      {med.note && <div className="h-med-note">{med.note}</div>}

      <div className="h-med-week">
        {week.map((d) => (
          <div key={d.key} title={`${d.key}: ${d.taken.join(', ') || 'пропущено'}`}>
            <span className="h-med-wd">{d.short}</span>
            <span className="h-med-dots">
              {(med.slots.length ? med.slots : ['—']).map((s) => (
                <i key={s} className={d.taken.includes(s) ? 'is-on' : ''} />
              ))}
            </span>
          </div>
        ))}
      </div>

      <div className="h-med-acts">
        <button className="h-link" onClick={onEdit}>Редагувати</button>
        <button className="h-link is-danger" onClick={onDelete}>Видалити</button>
      </div>
    </div>
  );
}

function MedModal({ med, slots, onClose, onSave }) {
  const [f, setF] = useState(() => ({
    drug: med?.drug || '',
    dose: med?.dose || '',
    slots: med?.slots?.length ? med.slots : ['Ранок'],
    start: med ? toInputDate(med.start) : toInputDate(today()),
    days: med?.days ?? '',
    stock: med?.stock ?? '',
    note: med?.note || '',
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      title={med ? 'Редагувати курс' : 'Новий препарат'}
      onClose={onClose}
      busy={busy}
      error={err}
      onSave={async () => {
        if (!f.drug.trim()) return setErr('Вкажіть назву препарату');
        setBusy(true); setErr('');
        try {
          await onSave({ ...f, drug: f.drug.trim(), start: fromInputDate(f.start) });
        } catch (e) {
          setErr(e.message);
        } finally { setBusy(false); }
      }}
    >
      <label>Препарат</label>
      <input type="text" value={f.drug} onChange={(e) => up('drug', e.target.value)}
        placeholder="Напр. Вітамін D3" />

      <label>Дозування</label>
      <input type="text" value={f.dose} onChange={(e) => up('dose', e.target.value)}
        placeholder="2000 МО · 1 табл." />

      <label>Коли приймати</label>
      <div className="h-doses">
        {slots.map((s) => (
          <button
            key={s.key}
            type="button"
            className={'h-dose' + (f.slots.includes(s.key) ? ' is-sel' : '')}
            onClick={() => up('slots', f.slots.includes(s.key)
              ? f.slots.filter((x) => x !== s.key)
              : [...f.slots, s.key])}
          >
            <span className="h-dose-m">{f.slots.includes(s.key) ? '✓' : ''}</span>
            <span>{s.key}</span>
            <span className="h-dose-t">{s.time}</span>
          </button>
        ))}
      </div>

      <div className="h-row2">
        <div>
          <label>Початок</label>
          <input type="date" value={f.start} onChange={(e) => up('start', e.target.value)} />
        </div>
        <div>
          <label>Днів курсу</label>
          <input type="number" min="0" inputMode="numeric" value={f.days}
            onChange={(e) => up('days', e.target.value)} placeholder="без обмеження" />
        </div>
      </div>

      <label>Залишок таблеток</label>
      <input type="number" min="0" inputMode="numeric" value={f.stock}
        onChange={(e) => up('stock', e.target.value)} placeholder="не рахувати" />

      <label>Нотатка</label>
      <input type="text" value={f.note} onChange={(e) => up('note', e.target.value)}
        placeholder="після їжі, запивати водою…" />

      <div className="h-hint">
        Залишок зменшується сам із кожною відміткою про прийом. Зняли
        відмітку — таблетка повертається назад.
      </div>
    </Modal>
  );
}

function RestockModal({ med, onClose, onSave }) {
  const [qty, setQty] = useState('10');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <Modal
      title={'Поповнити: ' + med.drug}
      saveLabel="Додати"
      onClose={onClose}
      busy={busy}
      error={err}
      onSave={async () => {
        if (num(qty) <= 0) return setErr('Вкажіть кількість більшу за нуль');
        setBusy(true); setErr('');
        try {
          await onSave(num(qty));
        } catch (e) {
          setErr(e.message);
        } finally { setBusy(false); }
      }}
    >
      <label>Скільки таблеток додати</label>
      <input type="number" min="1" inputMode="numeric" value={qty}
        onChange={(e) => setQty(e.target.value)} />
      <div className="h-hint">Зараз на руках: {med.stock} шт.</div>
    </Modal>
  );
}

/* ---------- Вкладка «Множення» ---------- */

/**
 * Тренажер таблиці множення й ділення.
 *
 * Урок — це одна таблиця, розбита на частини по три приклади. Частина
 * закривається за хвилину, і між ними видно рух; вісім прикладів за
 * підхід — це вже стіна, об яку розбивається бажання вчити.
 *
 * Приклад вважається вивченим, коли дався чотири рази поспіль. Умова навмисно
 * така, щоб її розумів той, хто вчить: «три зірочки» замість «рівень 4 з 5».
 */
function MultTab({ data, reload, toast }) {
  const [prog, setProg] = useState(() => data.mult || {});
  const [view, setView] = useState({ s: 'lessons' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { setProg(data.mult || {}); }, [data.mult]);

  const open = unlockedLessons(prog);

  const done = FACTS.reduce((n, f) => n
    + (known(prog, f.key, 'mul') ? 1 : 0)
    + (known(prog, f.key, 'div') ? 1 : 0), 0);
  const total = FACTS.length * 2;
  const fastN = FACTS.reduce((n, f) => n
    + (auto(prog, f.key, 'mul') ? 1 : 0)
    + (auto(prog, f.key, 'div') ? 1 : 0), 0);
  const day = daily(prog, stamp(today()));
  const hard = hardest(prog, 5);
  const streak = dayStreak(prog, today());

  /*
   * Один запит у кінці підходу, а не після кожної відповіді: інакше
   * хвилинна квота Google скінчилась би на третьому прикладі.
   */
  const save = async (results, extra) => {
    const next = applyResults(prog, results, today());
    setProg(next);
    setSaving(true);
    try {
      await api('/api/health', { method: 'POST', body: { action: 'mult', mult: next } });
      if (extra) await api('/api/health', { method: 'POST', body: { action: 'goals', goals: extra } });
      await reload();
    } catch (e) {
      toast('Не вдалося зберегти: ' + e.message);
    } finally { setSaving(false); }
    return next;
  };

  if (view.s === 'lesson') {
    return (
      <MultLesson
        lesson={view.lesson} prog={prog}
        onBack={() => setView({ s: 'lessons' })}
        onLook={(part, n) => setView({ s: 'look', lesson: view.lesson, part, n })}
        onDrill={(part, n) => setView({ s: 'drill', lesson: view.lesson, part, n })}
        onSession={() => setView({ s: 'drill', lesson: view.lesson, part: null })}
      />
    );
  }
  if (view.s === 'look') {
    return (
      <MultLook
        lesson={view.lesson} part={view.part} n={view.n}
        onStart={() => setView({ s: 'drill', lesson: view.lesson, part: view.part, n: view.n })}
        onBack={() => setView({ s: 'lesson', lesson: view.lesson })}
      />
    );
  }
  if (view.s === 'drill') {
    return (
      <MultDrill
        lesson={view.lesson} part={view.part} n={view.n} prog={prog}
        onBack={() => setView({ s: view.part ? 'lesson' : 'lessons', lesson: view.lesson })}
        onDone={async (results) => {
          const next = await save(results);
          const whole = lessonProgress(view.lesson, next) >= 1;
          setView(whole
            ? { s: 'win', lesson: view.lesson }
            : { s: view.part ? 'lesson' : 'lessons', lesson: view.lesson });
        }}
      />
    );
  }
  if (view.s === 'win') {
    return <MultWin lesson={view.lesson} onBack={() => setView({ s: 'lessons' })} />;
  }
  if (view.s === 'quick') {
    return (
      <MultQuick
        tile={view.tile}
        onBack={() => setView({ s: 'lessons' })}
        onDone={async (results) => { await save(results); setView({ s: 'lessons' }); }}
      />
    );
  }
  if (view.s === 'day') {
    return (
      <MultSpeed
        prog={prog} items={daily(prog, stamp(today())).all}
        onBack={() => setView({ s: 'lessons' })}
        onDone={async (results) => { await save(results); setView({ s: 'lessons' }); }}
      />
    );
  }
  if (view.s === 'arcade') {
    return (
      <MultArcade
        prog={prog} best={num(data.goals?.arcadeBest)}
        onBack={() => setView({ s: 'lessons' })}
        onDone={async (results, level) => {
          await save(results, {
            ...(data.goals || {}),
            arcadeBest: Math.max(num(data.goals?.arcadeBest), level),
          });
          setView({ s: 'lessons' });
        }}
      />
    );
  }

  return (
    <>
      {/* Вісім медалей за вісім таблиць. Кубок у кінці уроку зникає, а це
          лишається — видно і скільки пройдено, і скільки попереду. */}
      <div className="h-mt-medals">
        {LESSONS.filter((l) => l.kind === 'table').map((l) => (
          <span key={l.key} className={lessonProgress(l, prog) >= 1 ? 'is-on' : ''}>{l.table}</span>
        ))}
      </div>

      <div className="h-mt-top">
        <div className="h-cap">Вивчено прикладів</div>
        <div className="h-mt-big">{done}<span className="h-mt-of">/{total}</span></div>
        <div className="h-mt-bar"><i style={{ width: (total ? (done / total) * 100 : 0) + '%' }} /></div>
        <div className="h-mt-sub">
          {done === 0 ? 'Починайте з таблиці на 2 — далі кожен урок буде легшим за попередній.'
            : done >= total ? 'Уся таблиця вивчена. Лишилось довести до автоматизму.'
            : `Приклад вивчений, коли дався ${RUN} рази поспіль.`}
        </div>
        {done > 0 && (
          <>
            <div className="h-mt-two">
              <span><i>{fastN}</i> автоматом</span>
              {streak > 0 && <span><i>{streak}</i> {plur(streak, ['день', 'дні', 'днів'])} поспіль</span>}
            </div>
            {/* Два тижні крапками: пропуск видно одразу, і його не хочеться
                робити — це працює краще за будь-яке нагадування. */}
            <div className="h-mt-cal">
              {(() => {
                const was = new Set(practiceDays(prog));
                const p2 = (x) => String(x).padStart(2, '0');
                return [...Array(14)].map((_, k) => {
                  const d = new Date(stamp(today()) - (13 - k) * 86400000);
                  const key = `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
                  return <i key={key} className={was.has(key) ? 'is-on' : ''} title={key} />;
                });
              })()}
            </div>
          </>
        )}
      </div>

      {/*
        Одна кнопка на весь день. Розбирати самому, що зараз важливіше —
        помилки, повторення чи швидкість, — зайва робота: правильний
        порядок відомий заздалегідь, і його краще зібрати за людину.
      */}
      {done > 0 && (
        day.all.length > 0 ? (
          <button className={'h-mt-card' + (day.bad.length ? ' is-bad' : '')} onClick={() => setView({ s: 'day' })}>
            <span>Тренування дня</span>
            <span className="h-mt-card-b">
              {DAY_SIZE} питань · блоками по 5, кожен двічі
            </span>
            <span className="h-mt-card-b">
              {[
                day.fresh.length ? `${day.fresh.length} нових` : '',
                day.bad.length ? `${day.bad.length} з помилками` : '',
                day.rep.length ? `${day.rep.length} повторити` : '',
                day.slow.length ? `${day.slow.length} розігнати` : '',
                day.keep.length ? `${day.keep.length} закріпити` : '',
              ].filter(Boolean).join(' · ')}
            </span>
          </button>
        ) : (
          <div className="h-mt-clean">
            Поки нема чого повторювати — вивчіть перший урок, і тренування
            дня почне збиратись саме.
          </div>
        )
      )}

      {/*
        Повторити те, що сам вибрав.
        Уроки йдуть по черзі й відкриваються один за одним — це щоб вивчити
        з нуля. Але коли таблиця вже загалом відома, потрібне інше: ткнути
        «×7» і десять разів його проговорити, не питаючи дозволу. Тому
        плитки нічого не вимагають і ніколи не замкнені.
      */}
      {/*
        Аналітика. Не «скільки відсотків пройдено», а що саме зараз із
        таблицею: чого ще не бачив, що вчиться, що знаєш і що вже
        відповідається не думаючи. Чотири щаблі — і видно, куди рухається
        робота, а не лише те, скільки її лишилось.
      */}
      {(() => {
        const st = stats(prog);
        const next = nextNew(prog, NEW_PER_DAY);
        const parts = [
          ['auto', 'автомат', st.auto],
          ['known', 'знаю', st.known],
          ['learning', 'вчу', st.learning],
          ['new', 'не бачив', st.new],
        ];
        return (
          <>
            <div className="h-sec"><h3>Як справи</h3></div>
            <div className="h-mt-an">
              <div className="h-mt-an-bar">
                {parts.map(([k, , n]) => n > 0 && (
                  <i key={k} className={'is-' + k} style={{ flexGrow: n }} />
                ))}
              </div>
              <div className="h-mt-an-l">
                {parts.map(([k, label, n]) => (
                  <span key={k} className={'is-' + k}><b>{n}</b> {label}</span>
                ))}
              </div>
              <div className="h-mt-an-r">
                <span>Точність <b>{Math.round(st.accuracy * 100)}%</b>
                  {st.answers > 0 && <i> з {st.answers} відповідей</i>}</span>
                {st.timed > 0 && (
                  <span>Середній час <b>{st.avgTime.toFixed(1)} с</b>
                    <i> · до {FAST_SEC} с — {st.fast}</i></span>
                )}
              </div>
              {next.length > 0 && (
                <div className="h-mt-an-next">
                  Далі вчимо: <b>{next.map((x) => x.fact.key).join(', ')}</b>
                  {' — вони самі зʼявляться в тренуванні дня'}
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/*
        Важка дюжина. «Вивчено 12 із 72» — число чесне, але від нього руки
        опускаються; насправді більшість фактів закривається правилами, а
        пам'ятати доводиться дванадцять. До дванадцяти видимо близько.
      */}
      <div className="h-sec"><h3>Важка дюжина</h3></div>
      <button className="h-mt-doz" onClick={() => setView({ s: 'quick', tile: QUICK_TILES.find((t) => t.key === 'hard') })}>
        <span className="h-mt-doz-n">
          <b>{hardDone(prog)}</b> з {HARD.length}
        </span>
        <span className="h-mt-doz-g">
          {HARD.map((k) => (
            <i key={k} className={known(prog, k, 'mul') ? 'is-on' : ''}>{k}</i>
          ))}
        </span>
        <span className="h-mt-doz-c">
          Решта таблиці закривається правилами. Ці дванадцять доводиться
          саме памʼятати — вони й вирішують.
        </span>
      </button>

      <div className="h-sec"><h3>Повторити таблицю</h3></div>
      <div className="h-mt-tiles">
        {QUICK_TILES.map((t) => (
          <button key={t.key} className={'h-mt-tile' + (t.table ? '' : ' is-wide')}
            onClick={() => setView({ s: 'quick', tile: t })}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="h-mt-tiles-n">{QUICK_SIZE} прикладів · без таймера</div>

      <VoiceToggle />

      {done > 0 && (
        <button className="h-mt-arcade" onClick={() => setView({ s: 'arcade' })}>
          <span>🎮 Рівні</span>
          <span className="h-mt-quiz-b">
            {num(data.goals?.arcadeBest)
              ? `дійшли до ${num(data.goals.arcadeBest)}-го · лише вивчене, чистий рівень відкриває складніше`
              : 'лише вивчене · чистий рівень відкриває складніше'}
          </span>
        </button>
      )}

      <div className="h-sec"><h3>Уроки</h3></div>
      <div className="h-mt-steps">
        {LESSONS.map((l, i) => {
          const pct = Math.round(lessonProgress(l, prog) * 100);
          const locked = !open[i];
          const all = lessonFacts(l).length;
          const fresh = freshFacts(l).filter((f) => !known(prog, f.key, modesOf(l)[0])).length;
          return (
            <button
              key={l.key}
              className={'h-mt-step' + (locked ? ' is-lock' : '') + (pct === 100 ? ' is-done' : '')}
              disabled={locked}
              onClick={() => setView({ s: 'lesson', lesson: l })}
            >
              <span className="h-mt-step-h">
                <span className="h-mt-n">{pct === 100 ? '✓' : i + 1}</span>
                <span className="h-mt-title">{l.title}</span>
                <span className="h-mt-pct">{locked ? '🔒' : pct + '%'}</span>
              </span>
              <span className="h-mt-bar"><i style={{ width: pct + '%' }} /></span>
              <span className="h-mt-meta">
                {locked ? 'Спершу пройдіть попередній урок'
                  : l.kind !== 'table' ? `${all} прикладів`
                  : fresh > 0
                    ? `${fresh} ${plur(fresh, ['новий', 'нові', 'нових'])} · ${all - fresh} на повторення`
                    : `${all} прикладів на повторення`}
              </span>
            </button>
          );
        })}
      </div>

      {hard.length > 0 && (
        <>
          <div className="h-sec"><h3>Найважче саме вам</h3></div>
          <div className="h-mt-hard">
            {hard.map((h) => (
              <div key={h.fact.key + h.mode} className={h.done ? 'is-done' : ''}>
                <span className="h-mt-hard-q">
                  {h.mode === 'div'
                    ? `${h.fact.a * h.fact.b} ÷ ${h.fact.a} = ${h.fact.b}`
                    : `${h.fact.a} × ${h.fact.b} = ${h.fact.a * h.fact.b}`}
                </span>
                <span className="h-mt-hard-n">
                  {h.done ? 'закрито' : `${h.bad} ${plur(h.bad, ['промах', 'промахи', 'промахів'])}`}
                </span>
                {hookFor(h.fact.key) && <span className="h-mt-hard-h">{hookFor(h.fact.key)}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="h-sec"><h3>Що вже знаю</h3></div>
      <MultGrid prog={prog} />
      {saving && <div className="h-hint">Зберігаю прогрес…</div>}
    </>
  );
}

/** Уся таблиця однією картинкою: видно, де діри */
function MultGrid({ prog }) {
  const nums = [2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <div className="h-mt-grid-w">
      <table className="h-mt-grid">
        <thead>
          <tr><th />{nums.map((n) => <th key={n}>{n}</th>)}</tr>
        </thead>
        <tbody>
          {nums.map((a) => (
            <tr key={a}>
              <th>{a}</th>
              {nums.map((b) => {
                const k = keyOf(a, b);
                const run = runOf(prog, k, 'mul');
                const cls = known(prog, k, 'mul') ? 'is-known' : run > 0 ? 'is-now' : '';
                return (
                  <td
                    key={b}
                    className={cls + (known(prog, k, 'div') ? ' has-div' : '')}
                    title={`${a} × ${b} = ${a * b}\nмноження: ${run}/${RUN} поспіль\nділення: ${runOf(prog, k, 'div')}/${RUN}`}
                  >
                    {a * b}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="h-mt-leg">
        <span><i /> не вчили</span>
        <span><i className="is-now" /> вчимо</span>
        <span><i className="is-known" /> знаю</span>
        <span><i className="is-known has-div" /> і ділення</span>
      </div>
    </div>
  );
}

/** Урок: правило й список частин по три приклади */
function MultLesson({ lesson, prog, onBack, onLook, onDrill, onSession }) {
  const parts = partsOf(lesson);
  const table = lesson.kind === 'table';

  return (
    <>
      <div className="h-mt-learn-h">
        <button className="h-link" onClick={onBack}>← Уроки</button>
        <h2>{lesson.title}</h2>
      </div>

      <div className="h-mt-rule"><b>Правило</b>{lesson.rule}</div>

      {!table ? (
        <div className="h-addbar">
          <button className="h-add" onClick={onSession}>Тренувати →</button>
        </div>
      ) : (
        <>
          <div className="h-sec"><h3>Частини</h3></div>
          <div className="h-mt-parts">
            {parts.map((part, n) => {
              const pct = Math.round(partProgress(lesson, part, prog) * 100);
              const ready = pct === 100;
              return (
                <div key={n} className={'h-mt-part' + (ready ? ' is-done' : '')}>
                  <span className="h-mt-part-i">{ready ? '✓' : n + 1}</span>
                  <span className="h-mt-part-t">
                    <b>Частина {n + 1} з {parts.length}</b>
                    <i>{part.map((f) => `${lesson.table}×${f.a === lesson.table ? f.b : f.a}`).join(' · ')}</i>
                  </span>
                  <span className="h-mt-part-a">
                    <button className="h-btn" onClick={() => onLook(part, n)}>Подивись</button>
                    <button className={'h-btn' + (ready ? '' : ' h-btn-p')} onClick={() => onDrill(part, n)}>
                      {ready ? 'Повторити' : 'Відповідати'}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/**
 * «Подивись»: приклад показаний крапками й числовою стрічкою. Множення —
 * це повторне додавання, і поки це видно очима, запам'ятовувати доводиться
 * набагато менше.
 */
function MultLook({ lesson, part, n, onStart, onBack }) {
  const mults = partMultipliers(lesson, part);
  const [i, setI] = useState(0);
  const b = mults[i];
  const t = lesson.table;

  return (
    <div className="h-mt-look">
      <div className="h-mt-learn-h">
        <button className="h-link" onClick={onBack}>← Частини</button>
        <h2>Частина {n + 1}</h2>
      </div>

      <div className="h-mt-shot">
        <div className="h-mt-eqbig">{t} × {b} = <b>{t * b}</b></div>

        {/* Прямокутник замість купок по t. Купки показують, що множення —
            це додавання; прямокутник показує ще й як дійти до відповіді,
            не перелічуючи все з початку: п'ять стовпчиків і решта. */}
        <FactArray a={t} b={b} />

        <div className="h-mt-line">
          <div className="h-cap">Додавай по {t}</div>
          <div className="h-mt-chips">
            {[...Array(9)].map((_, k) => {
              const v = t * (k + 1);
              return (
                <span key={k} className={k + 1 === b ? 'is-now' : k + 1 < b ? 'is-past' : ''}>{v}</span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="h-mt-look-a">
        {i > 0 && <button className="h-btn" onClick={() => setI(i - 1)}>← Назад</button>}
        {i < mults.length - 1
          ? <button className="h-add" onClick={() => setI(i + 1)}>Далі →</button>
          : <button className="h-add" onClick={onStart}>Твоя черга →</button>}
      </div>
    </div>
  );
}

/**
 * Відповіді.
 *
 * У частині питаємо, доки кожен приклад не дасться чотири рази поспіль — це
 * й означає «вивчив». Помилка обнуляє серію: «знаю» — це коли не
 * помиляєшся, а не коли вгадав більше разів, ніж не вгадав.
 *
 * Варіантів три, і всі з тієї ж таблиці. Іноді пропуск стоїть ліворуч:
 * «▢ = 2 × 8». Це ламає звичку читати зліва направо й писати відповідь у
 * кінці — знак «дорівнює» означає «стільки ж», а не «зараз буде результат».
 */
function MultDrill({ lesson, part, n, prog, onBack, onDone }) {
  const mode = part ? 'part' : 'session';
  const [pool] = useState(() => (part ? partQueue(lesson, part) : null));
  const [queue] = useState(() => (part ? null : buildSession(lesson, prog, 12)));

  const [runs, setRuns] = useState(() => {
    const r = {};
    if (pool) pool.forEach((x) => { r[x.fact.key + x.mode] = 0; });
    return r;
  });
  /*
   * Відповіді й серії живуть у ref, а не лише в стані. Правильну відповідь
   * гортає setTimeout, а він тримає значення з того рендера, коли на неї
   * натиснули — тобто без неї самої. Через це остання відповідь підходу
   * губилась, і частина не закривалась, хоча всі приклади вже дались.
   */
  const resRef = useRef([]);
  const runRef = useRef(null);
  if (runRef.current === null) {
    runRef.current = {};
    if (pool) pool.forEach((x) => { runRef.current[x.fact.key + x.mode] = 0; });
  }
  const [q, setQ] = useState(() => (part ? nextFrom(pool, {}, null) : null));
  const [i, setI] = useState(0);
  const [fix, setFix] = useState(null);
  const [opts, setOpts] = useState([]);
  const [picked, setPicked] = useState(null);
  const [results, setResults] = useState([]);
  const started = useRef(Date.now());

  // перше питання й кожне наступне: варіанти рахуються один раз на питання
  const cur = (part || fix) ? q : queue?.[i];

  useEffect(() => {
    if (!cur) return;
    // «правда-неправда» й «що більше» малюють свої кнопки самі — числових
    // варіантів у них немає, і рахувати їх нема з чого
    setOpts(cur.kind === 'tf' || cur.kind === 'cmp'
      ? null
      : options(cur, lesson.kind === 'table' ? lesson.table : 0));
    setPicked(null);
    started.current = Date.now();
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps

  const need = fix ? FIXRUN : RUN;
  const total = fix ? fix.length * FIXRUN : part ? pool.length * RUN : queue.length;
  const doneRuns = (part || fix)
    ? Object.values(runs).reduce((s, v) => s + Math.min(v, need), 0)
    : i;

  if (!cur) {
    return (
      <div className="h-mt-drill">
        <div className="h-mt-drill-h"><button className="h-link" onClick={onBack}>← Вийти</button></div>
        <div className="h-empty">Тут поки нема чого питати.</div>
      </div>
    );
  }

  const answer = (v) => {
    if (picked !== null) return;
    const right = v === cur.answer;
    const k = cur.key + cur.mode;
    resRef.current = [...resRef.current, {
      key: cur.key, mode: cur.mode, right, ms: Date.now() - started.current,
      text: cur.text, answer: cur.answer,
    }];
    if (part || fix) runRef.current = { ...runRef.current, [k]: right ? (runRef.current[k] || 0) + 1 : 0 };
    sayFact(cur);
    setPicked(v);
    setResults(resRef.current);
    setRuns(runRef.current);
    // Правильну пропускаємо самі — пауза рівно щоб побачити зелене.
    // Помилку не пропускаємо: правильне число має бути прочитане.
    if (right) setTimeout(step, 500);
  };

  function step() {
    if (part || fix) {
      const p = fix || pool;
      const need = fix ? FIXRUN : RUN;
      const nxt = nextFrom(p, runRef.current, cur.key, need);
      if (!nxt) return onDone(resRef.current);
      setQ(nxt);
      return;
    }
    if (i + 1 >= queue.length) {
      /*
       * Черга скінчилась, але помилки лишились. Проїхати повз них —
       * значить закріпити саме те, що не вийшло: наступного разу приклад
       * трапиться нескоро, а помилковий слід уже ліг. Тому одразу коло
       * доробки — кожен завалений приклад, доки не дасться двічі поспіль.
       */
      const wrong = [];
      const seen = new Set();
      resRef.current.forEach((r) => {
        if (r.right) return;
        const k = r.key + r.mode;
        if (seen.has(k)) return;
        seen.add(k);
        const [x, y] = r.key.split('×').map(Number);
        wrong.push({ fact: { a: x, b: y, key: r.key }, mode: r.mode });
      });
      if (wrong.length) {
        const r0 = {};
        wrong.forEach((w) => { r0[w.fact.key + w.mode] = 0; });
        runRef.current = r0;
        setRuns(r0);
        setFix(wrong);
        setQ(nextFrom(wrong, r0, null, FIXRUN));
        return;
      }
      return onDone(resRef.current);
    }
    setI(i + 1);
  }

  return (
    <div className="h-mt-drill">
      <div className="h-mt-drill-h">
        <button className="h-link" onClick={onBack}>← Вийти</button>
        <span className="h-mt-where">
          {fix ? 'Робота над помилками' : part ? `Частина ${n + 1}` : lesson.title}
        </span>
      </div>

      <div className="h-mt-bar"><i style={{ width: Math.min(100, (doneRuns / total) * 100) + '%' }} /></div>

      {(part || fix) && (
        <div className="h-mt-stars">
          {[...Array(need)].map((_, k) => (
            <i key={k} className={k < (runs[cur.key + cur.mode] || 0) ? 'is-on' : ''}>★</i>
          ))}
        </div>
      )}

      {/*
        Питання показує AskBox — той самий, що в тренуванні дня й аркаді.
        Раніше урок малював рядок і варіанти сам, і це працювало доти, доки
        траплялись самі лише звичайні приклади. «Правда-неправда» й «що
        більше» приходили сюди з відповіддю true чи «eq» замість числа:
        рядок виходив порожній, а серед кнопок стояла порожня.
      */}
      <AskBox q={cur} state={picked === null ? '' : picked === cur.answer ? 'right' : 'wrong'}
        typed={picked === null ? '' : String(picked)}
        opts={opts} onAnswer={answer} disabled={picked !== null} />

      {picked !== null && picked !== cur.answer && (
        <div className="h-mt-fb">
          <div className="h-mt-fb-t">Не так. Правильно: <b>{answerLabel(cur)}</b></div>
          {(() => {
            // Зачіпка краща за обчислення: поки приклад рахують, його не
            // памʼятають. Якщо зачіпки немає — показуємо, як порахувати.
            const hook = hookFor(cur.key);
            if (hook) return <div className="h-mt-fb-h">💡 {hook}</div>;
            if (lesson.kind === 'table' && cur.mode === 'mul') {
              const [x, y] = cur.key.split('×').map(Number);
              return <div className="h-mt-fb-h">💡 {tipFor(lesson.table, x === lesson.table ? y : x)}</div>;
            }
            return null;
          })()}
          {/* і сам приклад прямокутником: слова пояснюють, картинка показує */}
          <FactArray {...factOf(cur.key)} small />
          <button className="h-add" onClick={() => step()}>Далі →</button>
        </div>
      )}
    </div>
  );
}

/**
 * Питання будь-якого виду — одним компонентом.
 *
 * Раніше кожен режим малював свій екран, і додати новий вид питання
 * означало правити три місця. Тепер вид описується в даних, а показує його
 * одне місце: і в тренуванні дня, і в аркаді питання виглядають однаково,
 * бо це буквально той самий код.
 */
/* ---------- Голос ---------- */

/**
 * Приклад, сказаний уголос.
 *
 * Прочитане очима й почуте вухами лягають у різну памʼять, і та, що чує,
 * у таблиці працює краще: «сім на вісім — пʼятдесят шість» згадується
 * ритмом, як рядок вірша, а не як картинка. Саме тому таблицю споконвіку
 * промовляли вголос, а не переписували.
 *
 * Синтез мовлення вбудований у браузер — ні ключів, ні мережі, ні
 * бібліотек. Українського голосу може не бути; тоді просто мовчимо, бо
 * читати українські слова англійським голосом гірше, ніж не читати.
 */
const SAY_KEY = 'oblik_mult_voice';

function voiceOk() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Чим говорити. Українського голосу в системі може не бути — на iOS його
 * треба окремо завантажити. Тоді беремо будь-який слов'янський: числа
 * ним читаються зрозуміло, а мовчати гірше, ніж мати легкий акцент.
 */
function ukVoice() {
  const all = window.speechSynthesis.getVoices() || [];
  return all.find((v) => /^uk/i.test(v.lang))
    || all.find((v) => /^(ru|be|pl)/i.test(v.lang))
    || all.find((v) => v.default)
    || all[0]
    || null;
}

function say(text) {
  if (!voiceOk()) return;
  const v = ukVoice();
  const u = new SpeechSynthesisUtterance(text);
  if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = 0.95;
  // нове питання перебиває попереднє: черга з десяти прикладів, які
  // дочитуються вже після того, як ви відповіли, — це не допомога
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/*
 * Прапорець читаємо просто зі сховища, а не тягнемо пропсом крізь п'ять
 * компонентів: це налаштування, яке нікого, крім самого голосу, не
 * стосується.
 */
const voiceOn = () => typeof window !== 'undefined' && localStorage.getItem(SAY_KEY) === '1';

/** «7×8» уголос: саме як приклад, а не як два числа поспіль */
function sayFact(q) {
  if (!q || !voiceOn()) return;
  if (q.kind && q.kind !== 'pick') return;
  const [x, y] = String(q.key).split('×').map(Number);
  if (!x || !y) return;
  if (q.mode === 'div') say(`${x * y} поділити на ${x} — ${y}`);
  else say(`${x} на ${y} — ${x * y}`);
}

/**
 * Вмикач голосу. Стоїть поруч із тренуваннями, а не в налаштуваннях: його
 * вмикають і вимикають залежно від того, де ви зараз — самі вдома чи в
 * кімнаті, де сплять.
 */
function VoiceToggle() {
  const [on, setOn] = useState(false);
  const [has, setHas] = useState(true);
  const [uk, setUk] = useState(true);

  useEffect(() => {
    if (!voiceOk()) { setHas(false); return; }
    setOn(voiceOn());
    // у частині браузерів список голосів приходить не одразу
    const check = () => {
      const all = window.speechSynthesis.getVoices() || [];
      setHas(all.length > 0);
      setUk(all.some((v) => /^uk/i.test(v.lang)));
    };
    check();
    window.speechSynthesis.addEventListener?.('voiceschanged', check);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', check);
  }, []);

  if (!has) return null;

  return (
    <button
      className={'h-mt-voice' + (on ? ' is-on' : '')}
      onClick={() => {
        const next = !on;
        localStorage.setItem(SAY_KEY, next ? '1' : '0');
        setOn(next);
        if (next) say('сім на вісім — пʼятдесят шість');
      }}
    >
      {on ? '🔊 Голос увімкнено' : '🔇 Голос вимкнено'}
      <span>
        {uk
          ? 'приклад звучить уголос — вухами таблиця вчиться краще'
          : 'українського голосу в системі немає, читає той, що є. '
            + 'iPhone: Налаштування → Універсальний доступ → Вимовляння → Голоси'}
      </span>
    </button>
  );
}

/**
 * Приклад як прямокутник, розрізаний по п'ятірці.
 *
 * Уся решта тренажера символьна: 7 × 8 — це два знаки й відповідь, яку
 * або згадав, або ні. Прямокутник із 56 крапок, розрізаний на 7×5 і 7×3,
 * показує, чому саме 56, і — головне — дає спосіб дійти до відповіді,
 * коли вона не спливла: 35 і ще 21.
 *
 * Ріжемо завжди по п'ятірці, хоч для дев'ятки й зручніше «десять мінус
 * одне». Один інструмент, застосовний до всього, кращий за вісім різних:
 * його встигаєш дістати, поки згадуєш, який із восьми тут потрібен.
 */
function FactArray({ a, b, small }) {
  // рядків беремо менший множник: прямокутник виходить широким, а не
  // високим, і на телефоні його видно цілком
  const rows = Math.min(a, b);
  const cols = Math.max(a, b);
  const cut = cols > 5 ? 5 : 0;
  const rest = cols - cut;

  const block = (n, cls) => (
    <div className={'h-fa-b ' + cls} style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      {[...Array(rows * n)].map((_, k) => <i key={k} />)}
    </div>
  );

  return (
    <div className={'h-fa' + (small ? ' is-small' : '')}>
      <div className="h-fa-pair">
        {cut ? (
          <>
            {block(cut, 'is-one')}
            <span className="h-fa-plus">+</span>
            {block(rest, 'is-two')}
          </>
        ) : block(cols, 'is-one')}
      </div>
      {/* Рядок суми потрібен рівно там, де є що розкладати. Коли множник
          не більший за п'ять, прямокутник видно цілком — і «2 × 2 = 4» під
          таким самим написом угорі лише займає місце. */}
      {cut > 0 && (
        <>
          <div className="h-fa-sum">
            <b className="is-one">{rows * cut}</b>
            <span>+</span>
            <b className="is-two">{rows * rest}</b>
            <span>=</span>
            <b>{a * b}</b>
          </div>
          <div className="h-fa-n">
            {rows} × {cut} = {rows * cut} · {rows} × {rest} = {rows * rest}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Правильна відповідь словами. У звичайного прикладу це число, у
 * «правда-неправда» — так чи ні, у порівняння — сам вираз: показати там
 * `true` означає не показати нічого.
 */
function answerLabel(q) {
  if (q.kind === 'tf') return q.answer ? 'правда' : 'неправда';
  if (q.kind === 'cmp') return q.answer === 'eq' ? 'порівну' : q.answer === 'left' ? q.left : q.right;
  return q.answer;
}

function AskBox({ q, state, typed, opts, onAnswer, disabled, quad }) {
  if (q.kind === 'tf') {
    return (
      <>
        <div className={'h-mt-qbox' + (state ? ' is-' + state : '')}>
          <div className="h-mt-tf-q">{q.shown}</div>
          <div className="h-mt-tf-c">Це правда?</div>
        </div>
        <div className="h-mt-tf">
          <button className="h-mt-tf-b is-no" onClick={() => onAnswer(false)} disabled={disabled}>✗</button>
          <button className="h-mt-tf-b is-yes" onClick={() => onAnswer(true)} disabled={disabled}>✓</button>
        </div>
      </>
    );
  }

  if (q.kind === 'cmp') {
    return (
      <>
        <div className={'h-mt-qbox' + (state ? ' is-' + state : '')}>
          <div className="h-mt-tf-c">Що більше?</div>
        </div>
        <div className="h-mt-opts">
          <button className="h-mt-opt" onClick={() => onAnswer('left')} disabled={disabled}>{q.left}</button>
          <button className="h-mt-opt is-eq" onClick={() => onAnswer('eq')} disabled={disabled}>порівну</button>
          <button className="h-mt-opt" onClick={() => onAnswer('right')} disabled={disabled}>{q.right}</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={'h-mt-qbox' + (state ? ' is-' + state : '')}>
        <QLine q={q} shown={typed} state={state === 'right' ? 'ok' : state === 'wrong' ? 'bad' : ''} />
      </div>
      {opts && (
        // чотири варіанти йдуть сіткою 2×2: так кнопки вдвічі більші й обидві
        // колонки дістаються великим пальцем, не переставляючи телефон
        <div className={'h-mt-opts' + (quad ? ' is-quad' : '')}>
          {opts.map((o) => (
            <button key={o}
              className={'h-mt-opt' + (state ? (o === q.answer ? ' is-ok' : String(o) === String(typed) ? ' is-bad' : ' is-dim') : '')}
              onClick={() => onAnswer(o)} disabled={disabled}>{o}</button>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Рядок питання. Пропуск стоїть або на місці відповіді («▢ = 6 × 7»), або
 * посередині («6 × ▢ = 42»). Друга форма питає не «порахуй», а «добери» —
 * це інша дія, вона ж наступний крок до ділення й до рівнянь.
 */
function QLine({ q, shown, state }) {
  return (
    <div className="h-mt-q2">
      {q.pre && <span className="h-mt-nums">{q.pre}</span>}
      <span className={'h-mt-blank' + (state ? ' is-' + state : '')}>{shown || ''}</span>
      <span className="h-mt-nums">{q.post}</span>
    </div>
  );
}

/** У колі доробки трохи менше, ніж при вивченні: приклад уже знайомий */
const FIXRUN = 3;

/**
 * Наступний приклад частини: той, у якого серія найкоротша, і не той
 * самий, що щойно був — інакше відповідь просто списується з екрана.
 */
function nextFrom(pool, runs, prevKey, need = RUN) {
  const left = pool.filter((x) => (runs[x.fact.key + x.mode] || 0) < need);
  if (!left.length) return null;
  const other = left.filter((x) => x.fact.key !== prevKey);
  const from = other.length ? other : left;
  const min = Math.min(...from.map((x) => runs[x.fact.key + x.mode] || 0));
  const cand = from.filter((x) => (runs[x.fact.key + x.mode] || 0) === min);
  const pick = cand[Math.floor(Math.random() * cand.length)];
  return question(pick.fact, pick.mode);
}

/** Кубок за таблицю — урок має мати кінець, і кінець має бути видно */
function MultWin({ lesson, onBack }) {
  return (
    <div className="h-mt-win">
      <div className="h-mt-cup">🏆</div>
      <h2>{lesson.kind === 'table' ? `Таблиця на ${lesson.table} вивчена!` : lesson.title + ' — пройдено!'}</h2>
      <p>
        {lesson.kind === 'table'
          ? 'Наступний урок буде легшим: частина прикладів у ньому вже ваша.'
          : 'Спробуйте вікторину на час — там усе разом і на швидкість.'}
      </p>
      <button className="h-add" onClick={onBack}>Далі →</button>
    </div>
  );
}

/**
 * Розгін: ті самі приклади, але з вводом замість вибору.
 *
 * Вибрати з трьох — це впізнати; набрати — згадати. Різні дії й різна
 * памʼять: у контрольній ніхто не пропонує варіантів. Тому останній щабель
 * саме такий, і саме тут вимірюється час: приклад вважається доведеним до
 * автоматизму, коли відповідь приходить швидше ніж за три секунди.
 */
function MultSpeed({ prog, items, onBack, onDone }) {
  const [queue] = useState(() => dayQueue(items, DAY_SIZE));
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const [state, setState] = useState('ask');
  const started = useRef(Date.now());
  const resRef = useRef([]);
  const [results, setResults] = useState([]);

  const cur = queue[i];

  useEffect(() => { started.current = Date.now(); setTyped(''); setState('ask'); }, [i]);

  if (!queue.length) {
    return (
      <div className="h-empty">
        Нема чого розганяти — спершу вивчіть хоч одну таблицю.{' '}
        <button className="h-link" onClick={onBack}>Назад</button>
      </div>
    );
  }

  if (i >= queue.length) {
    const fastN = resRef.current.filter((r) => r.right && r.ms <= FAST_SEC * 1000).length;
    return (
      <div className="h-mt-win">
        <div className="h-mt-cup">{fastN === resRef.current.length ? '⚡' : '⏱'}</div>
        <h2>{fastN} з {resRef.current.length} — швидко</h2>
        <p>
          Швидко — це до {FAST_SEC} секунд. Повільна правильна відповідь означає,
          що приклад рахують, а не памʼятають; такі повернуться сюди ще раз.
        </p>
        <button className="h-add" onClick={() => onDone(resRef.current)}>Зберегти й вийти</button>
      </div>
    );
  }

  const commit = (t) => {
    if (state !== 'ask') return;
    const ms = Date.now() - started.current;
    const right = cur.kind === 'pick' ? Number(t) === cur.answer : t === cur.answer;
    resRef.current = [...resRef.current, {
      key: cur.key, mode: cur.mode, right, ms, text: cur.text, answer: cur.answer,
    }];
    setResults(resRef.current);
    setState(right ? 'right' : 'wrong');
    if (right) setTimeout(() => setI((x) => x + 1), 380);
  };

  const press = (d) => {
    if (state !== 'ask') return;
    const t = (typed + d).slice(0, 3);
    setTyped(t);
    // Зараховуємо, щойно набрано стільки цифр, скільки в правильній
    // відповіді: окреме «готово» на кожен приклад — це зайвий дотик,
    // помножений на дванадцять.
    if (t.length >= String(cur.answer).length) setTimeout(() => commit(t), 50);
  };

  return (
    <div className="h-mt-drill">
      <div className="h-mt-drill-h">
        <button className="h-link" onClick={onBack}>← Вийти</button>
        <span className="h-mt-where">{i + 1} з {queue.length}</span>
      </div>
      <div className="h-mt-bar"><i style={{ width: (i / queue.length) * 100 + '%' }} /></div>

      <AskBox q={cur} state={state === 'right' ? 'right' : state === 'wrong' ? 'wrong' : ''}
        typed={typed} onAnswer={(v) => commit(v)} disabled={state !== 'ask'} />

      {state === 'wrong' ? (
        <div className="h-mt-fb">
          <div className="h-mt-fb-t">
            Не так. {cur.kind === 'pick' ? 'Правильно:' : 'Тут'} <b>{answerLabel(cur)}</b>
          </div>
          {hookFor(cur.key) && <div className="h-mt-fb-h">💡 {hookFor(cur.key)}</div>}
          <button className="h-add" onClick={() => setI(i + 1)}>Далі →</button>
        </div>
      ) : cur.kind === 'pick' ? (
        <div className="h-mt-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button key={d} onClick={() => press(String(d))} disabled={state !== 'ask'}>{d}</button>
          ))}
          <button className="is-soft" onClick={() => setTyped('')} disabled={state !== 'ask'}>С</button>
          <button onClick={() => press('0')} disabled={state !== 'ask'}>0</button>
          <button className="is-soft" onClick={() => setTyped((t) => t.slice(0, -1))} disabled={state !== 'ask'}>⌫</button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Швидкий повтор обраної таблиці.
 *
 * Найпростіший екран у тренажері, і це навмисно: питання, чотири великі
 * кнопки, лічильники правильних і промахів. Ні таймера, ні життів, ні
 * кнопки «далі» — відповів і поїхали. Саме така вправа виходить, коли є
 * вільна хвилина й немає бажання розбиратися, чого від тебе хочуть.
 *
 * Помилка не зупиняє: правильна відповідь підсвічується, під нею зачіпка,
 * і за півтори секунди йде наступне питання. Тиснути нічого не треба —
 * інакше половина повтору перетворюється на натискання «далі».
 */
function MultQuick({ tile, onBack, onDone }) {
  const [queue] = useState(() => quickQueue(tile, QUICK_SIZE));
  const [i, setI] = useState(0);
  const [opts, setOpts] = useState([]);
  const [picked, setPicked] = useState(null);
  const [state, setState] = useState('ask');
  const started = useRef(Date.now());
  const resRef = useRef([]);
  const cur = queue[i];

  useEffect(() => {
    if (!cur) return;
    setOpts(options(cur, tile.table, 4));
    setPicked(null);
    setState('ask');
    started.current = Date.now();
  }, [i]);

  if (!queue.length) {
    return <div className="h-empty">Нема чого повторювати. <button className="h-link" onClick={onBack}>Назад</button></div>;
  }

  const ok = resRef.current.filter((r) => r.right).length;
  const bad = resRef.current.length - ok;

  if (i >= queue.length) {
    return (
      <div className="h-mt-win">
        <div className="h-mt-cup">{bad === 0 ? '🏆' : ok >= queue.length - 2 ? '👍' : '🔁'}</div>
        <h2>{ok} з {queue.length}</h2>
        <p>
          {bad === 0
            ? 'Без жодного промаху. Саме так це й має відповідатись.'
            : `Промахів ${bad} — вони самі повернуться в тренування дня.`}
        </p>
        <button className="h-add" onClick={() => onDone(resRef.current)}>Зберегти й вийти</button>
      </div>
    );
  }

  const answer = (v) => {
    if (state !== 'ask') return;
    const right = v === cur.answer;
    resRef.current = [...resRef.current, {
      key: cur.key, mode: cur.mode, right,
      ms: Date.now() - started.current, text: cur.text, answer: cur.answer,
    }];
    setPicked(v);
    setState(right ? 'right' : 'wrong');
    // промах озвучуємо теж — саме тоді почути правильну відповідь
    // найкорисніше
    sayFact(cur);
    // Правильну гортаємо самі — пауза рівно щоб побачити зелене. Промах
    // не гортаємо: під ним стоїть розбір із прямокутником, і поки його
    // читають, екран не має тікати. Далі — коли людина сама скаже.
    if (right) setTimeout(() => setI((x) => x + 1), 520);
  };

  return (
    <div className="h-mt-drill">
      <div className="h-mt-drill-h">
        <button className="h-link" onClick={onBack}>← Вийти</button>
        <span className="h-mt-where">{i + 1} з {queue.length}</span>
        <span className="h-mt-tally">
          <b className="is-ok">{ok}</b>
          <b className="is-bad">{bad}</b>
        </span>
      </div>
      <div className="h-mt-bar"><i style={{ width: (i / queue.length) * 100 + '%' }} /></div>

      <AskBox q={cur} state={state === 'ask' ? '' : state}
        typed={picked === null ? '' : String(picked)}
        opts={opts} quad onAnswer={answer} disabled={state !== 'ask'} />

      {state === 'wrong' && (
        <div className="h-mt-fb">
          <div className="h-mt-fb-t">Не так. Правильно: <b>{cur.answer}</b></div>
          {hookFor(cur.key) && <div className="h-mt-fb-h">💡 {hookFor(cur.key)}</div>}
          <FactArray {...factOf(cur.key)} small />
          <button className="h-add" onClick={() => setI(i + 1)}>Далі →</button>
        </div>
      )}
    </div>
  );
}

/**
 * Аркада: гра «доки не програєш».
 *
 * Три життя, рівень із десяти правильних, і з кожним рівнем менше часу на
 * відповідь. Сенс не в змаганні: у звичайному підході людина сама вирішує,
 * коли їй досить, і зупиняється рівно там, де стало трохи важко. Тут
 * зупиняє гра — і тому повторів виходить утричі більше, ніж збирався
 * зробити той, хто заходив «просто повторити».
 *
 * Матеріал — саме вивчене: гра тут для того, щоб довести до блиску те, що
 * вже знаєш. Невивчене підмішується лише після рівня, закритого без жодного
 * промаху, — і теж лише з відкритих уроків: кидати 8×8 тому, хто дійшов до
 * п'ятірки, нечесно.
 */
function MultArcade({ prog, best, onBack, onDone }) {
  const [lvl, setLvl] = useState(1);
  const [idx, setIdx] = useState(0);          // питань на цьому рівні
  const [lives, setLives] = useState(ARCADE_LIVES);
  const [score, setScore] = useState(0);
  const [q, setQ] = useState(() => arcadeNext(prog, 1, 0, false));
  const [opts, setOpts] = useState([]);
  const [typed, setTyped] = useState('');
  const [state, setState] = useState('ask');  // ask | right | wrong | levelup | over
  const [left, setLeft] = useState(0);
  const started = useRef(Date.now());
  const resRef = useRef([]);
  const dead = useRef(false);
  /*
   * Чи був попередній рівень чистим. Поки ні — трапляється лише вивчене:
   * аркада тут для того, щоб довести до блиску знайоме. Пройшов рівень
   * без жодного промаху — заслужив складніше, і тоді підмішується те, що
   * знаєш гірше.
   */
  const clean = useRef(true);      // поточний рівень ще без промахів
  const [earned, setEarned] = useState(false);   // попередній закрито ідеально

  const cfg = arcadeLevel(lvl);

  /*
   * Скидання прив'язане саме до нового питання, а не до будь-якої зміни
   * стану. Інакше воно спрацьовувало й на екрані промаху: набране число
   * стиралось, і натиснутий неправильний варіант виглядав так, ніби час
   * вийшов, а годинник тим часом починався заново.
   */
  useEffect(() => {
    if (!q) return;
    setOpts(q.kind === 'pick' ? options(q) : []);
    setTyped('');
    setLeft(q.seconds);
    started.current = Date.now();
  }, [q]);

  // Годинник спільний для всіх рівнів: смуга тане, і коли скінчилась —
  // це така сама помилка, як неправильна відповідь. Інакше на важкому
  // прикладі можна сидіти скільки завгодно, і швидкість не тренується.
  useEffect(() => {
    if (state !== 'ask' || !q) return;
    const t = setInterval(() => {
      const gone = (Date.now() - started.current) / 1000;
      const rest = q.seconds - gone;
      setLeft(rest);
      if (rest <= 0) { clearInterval(t); miss(null); }
    }, 100);
    return () => clearInterval(t);
  }, [state, q]);

  if (!q) {
    return (
      <div className="h-empty">
        Спершу вивчіть хоч одну частину — в аркаді трапляється те, що вже знайоме.{' '}
        <button className="h-link" onClick={onBack}>Назад</button>
      </div>
    );
  }

  function record(right) {
    resRef.current = [...resRef.current, {
      key: q.key, mode: q.mode, right,
      ms: Math.min(Date.now() - started.current, q.seconds * 1000),
      text: q.text, answer: q.answer,
    }];
  }

  function miss(v) {
    if (dead.current) return;
    record(false);
    clean.current = false;
    setTyped(v === null ? '' : String(v));
    setState('wrong');
    const rest = lives - 1;
    setLives(rest);
    if (rest <= 0) { dead.current = true; setTimeout(() => setState('over'), 1200); }
  }

  function hit() {
    record(true);
    setScore((x) => x + 1);
    setState('right');
    const n = idx + 1;
    setTimeout(() => {
      if (n >= ARCADE_PER_LEVEL) {
        const won = clean.current;
        setEarned(won);
        setState('levelup');
        setTimeout(() => {
          clean.current = true;
          setLvl((l) => l + 1);
          setIdx(0);
          setQ(arcadeNext(prog, lvl + 1, 0, won));
          setState('ask');
        }, 1100);
      } else {
        setIdx(n);
        setQ(arcadeNext(prog, lvl, n, earned));
        setState('ask');
      }
    }, 340);
  }

  const answer = (v) => {
    if (state !== 'ask') return;
    if (v === q.answer) hit(); else miss(v);
  };

  const press = (d) => {
    if (state !== 'ask') return;
    const t = (typed + d).slice(0, 3);
    setTyped(t);
    if (t.length >= String(q.answer).length) setTimeout(() => answer(Number(t)), 50);
  };

  const next = () => {
    if (dead.current) return;
    const n = idx + 1;
    if (n >= ARCADE_PER_LEVEL) {
      // після промаху рівень уже не чистий — наступний знову зі знайомого
      setEarned(false);
      clean.current = true;
      setLvl((l) => l + 1); setIdx(0); setQ(arcadeNext(prog, lvl + 1, 0, false));
    } else {
      setIdx(n); setQ(arcadeNext(prog, lvl, n, earned));
    }
    setState('ask');
  };

  if (state === 'over') {
    const better = lvl > best;
    return (
      <div className="h-mt-win">
        <div className="h-mt-cup">{better ? '🏆' : '🎮'}</div>
        <h2>Рівень {lvl}</h2>
        <p>
          {score} {plur(score, ['правильна', 'правильні', 'правильних'])} поспіль.{' '}
          {better
            ? `Новий рекорд — до цього був ${best || 0}.`
            : `Рекорд ${best}. До нього ${best - lvl + 1} ${plur(best - lvl + 1, ['рівень', 'рівні', 'рівнів'])}.`}
        </p>
        <button className="h-add" onClick={() => onDone(resRef.current, lvl)}>Зберегти й вийти</button>
      </div>
    );
  }

  if (state === 'levelup') {
    return (
      <div className="h-mt-win">
        <div className="h-mt-cup">{earned ? '🏅' : '⚡'}</div>
        <h2>Рівень {lvl + 1}</h2>
        <p>
          {arcadeLevel(lvl + 1).seconds.toFixed(1)} с на відповідь
          {arcadeLevel(lvl + 1).withDiv && !cfg.withDiv ? ' · додається ділення' : ''}
          {arcadeLevel(lvl + 1).typed && !cfg.typed ? ' · тепер набираємо цифри' : ''}
        </p>
        {/* чистий рівень — єдиний спосіб дістати складніше: доки є промахи,
            аркада лишається повторенням знайомого */}
        <p className="h-mt-earned">
          {earned
            ? 'Рівень без жодного промаху — далі підмішаємо те, що знаєте гірше.'
            : 'Був промах — далі знову лише знайоме. Пройдіть рівень чисто, щоб додалося складніше.'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-mt-drill">
      <div className="h-mt-drill-h">
        <button className="h-link" onClick={onBack}>← Вийти</button>
        <span className="h-mt-arc-l">
          {[...Array(ARCADE_LIVES)].map((_, k) => (
            <i key={k} className={k < lives ? 'is-on' : ''}>♥</i>
          ))}
        </span>
        <span className="h-mt-where">рівень {lvl} · {score}</span>
      </div>

      <div className="h-mt-bar">
        <i className={left <= q.seconds * 0.3 ? 'is-hot' : ''}
          style={{ width: Math.max(0, (left / q.seconds) * 100) + '%', transition: 'none' }} />
      </div>
      <div className="h-mt-arc-n">
        {idx + (state === 'right' ? 1 : 0)} / {ARCADE_PER_LEVEL}
        {q.fresh && <b> · новий</b>}
      </div>

      <AskBox q={q} state={state === 'right' ? 'right' : state === 'wrong' ? 'wrong' : ''}
        typed={state === 'wrong' && !typed ? '—' : typed}
        opts={q.kind === 'pick' && !q.typed ? opts : null}
        onAnswer={answer} disabled={state !== 'ask'} />

      {state === 'wrong' ? (
        <div className="h-mt-fb">
          <div className="h-mt-fb-t">
            {typed ? 'Не так.' : 'Час вийшов.'} Правильно: <b>{answerLabel(q)}</b>
          </div>
          {hookFor(q.key) && <div className="h-mt-fb-h">💡 {hookFor(q.key)}</div>}
          {lives > 0 && <button className="h-add" onClick={next}>Далі →</button>}
        </div>
      ) : q.kind === 'pick' && q.typed ? (
        <div className="h-mt-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button key={d} onClick={() => press(String(d))} disabled={state !== 'ask'}>{d}</button>
          ))}
          <button className="is-soft" onClick={() => setTyped('')} disabled={state !== 'ask'}>С</button>
          <button onClick={() => press('0')} disabled={state !== 'ask'}>0</button>
          <button className="is-soft" onClick={() => setTyped((t) => t.slice(0, -1))} disabled={state !== 'ask'}>⌫</button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Вкладка «Код» ---------- */

/**
 * Пісочниця для JS-завдань. Виконується у Web Worker — окремому потоці,
 * а не в цій вкладці, — тож нескінченний цикл у власному коді підвісить
 * тільки воркер, який просто вб'ють по таймауту, а не сторінку.
 *
 * `console.log` усередині воркера підмінений: замість друку в консоль він
 * складає рядки в масив і повертає їх одним повідомленням.
 */
const WORKER_SRC = `
self.onmessage = (e) => {
  const logs = [];
  const put = (a) => a.map((x) => {
    if (typeof x === 'string') return x;
    try { return JSON.stringify(x); } catch { return String(x); }
  }).join(' ');
  const orig = console.log;
  console.log = (...a) => { logs.push(put(a)); };

  const done = (ok, error) => {
    console.log = orig;
    self.postMessage({ ok: ok, output: logs.join('\\n'), error: error });
  };

  try {
    const result = (0, eval)(e.data);
    // Коли останній рядок коду — виклик async-функції, у цю мить надруковано
    // ще нічого: обіцянка тільки видана. Чекаємо на неї, а потім даємо ще
    // один оберт черги — інакше загубиться друк із самого кінця ланцюжка.
    if (result && typeof result.then === 'function') {
      result.then(
        () => setTimeout(() => done(true), 0),
        (err) => done(false, String((err && err.message) || err))
      );
    } else {
      done(true);
    }
  } catch (err) {
    done(false, String((err && err.message) || err));
  }
};
`;

function runJS(code, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let worker;
    try {
      const blob = new Blob([WORKER_SRC], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      worker = new Worker(url);
      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve(r);
      };
      const timer = setTimeout(
        () => finish({ ok: false, output: '', error: 'Код виконувався надто довго — можливо, нескінченний цикл.' }),
        timeoutMs
      );
      worker.onmessage = (e) => finish(e.data);
      worker.onerror = (e) => finish({ ok: false, output: '', error: e.message || 'Помилка виконання' });
      worker.postMessage(code);
    } catch (e) {
      resolve({ ok: false, output: '', error: 'Браузер не підтримує виконання коду тут.' });
    }
  });
}

/**
 * Пісочниця для сторінкових завдань. Рамка без `allow-same-origin` — у
 * неї немає доступу ні до кукі, ні до застосунку, лише до того, що
 * написано в самому коді. Тому єдиний спосіб дізнатись, що вийшло, —
 * дочекатись, доки рамка сама розповість про себе через postMessage.
 */
function runPage(html, timeoutMs = 3000) {
  const ping = `<script>window.addEventListener('load',()=>{try{parent.postMessage({__lesson:true,text:document.body?document.body.innerText:''},'*');}catch(e){parent.postMessage({__lesson:true,text:''},'*');}});</script>`;
  const promise = new Promise((resolve) => {
    let done = false;
    const finish = (text) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      resolve(text);
    };
    const onMsg = (e) => {
      if (!e.data || !e.data.__lesson) return;
      finish(e.data.text || '');
    };
    const timer = setTimeout(() => finish(''), timeoutMs);
    window.addEventListener('message', onMsg);
  });
  return { promise, srcdoc: html + ping };
}

/**
 * Пісочниця для React.
 *
 * Та сама рамка, що й для сторінкових завдань, але спершу в неї
 * вантажиться зібраний файл із React, react-dom і перетворювачем JSX:
 * браузер JSX не розуміє, а React 19 більше не постачає готових файлів
 * для браузера. Збирає їх `scripts/build-sandbox.mjs`.
 *
 * Монтуємо компонент `App` самі — щоб урок був про компонент, а не про
 * три однакові рядки запуску, які в справжньому застосунку пише
 * фреймворк.
 *
 * `clicks` — селектори, по яких треба клацнути після показу. Саме це й
 * робить перевірку справжньою: видно не те, що написано, а те, що
 * сталося після натискання. Клацаємо по черзі з паузою, бо React
 * складає кілька змін в одному такті в одну.
 */
function runReact(code, clicks = [], timeoutMs = 6000) {
  const shell = `
<div id="root"></div>
<script src="/vendor/react-sandbox.js"><\/script>
<script>
(function () {
  var say = function (text, error) {
    try { parent.postMessage({ __lesson: true, text: text || '', error: error || '' }, '*'); } catch (e) {}
  };
  window.addEventListener('load', function () {
    if (!window.React) { say('', 'Не вдалося завантажити React — оновіть сторінку.'); return; }
    try {
      var js = window.__jsx(${JSON.stringify(code)});
      var make = new Function('React', 'ReactDOM', js + '\\n;return typeof App === "function" ? App : null;');
      var App = make(window.React, window.ReactDOM);
      if (!App) { say('', 'Не знайдено компонент App — назвіть свій компонент саме так.'); return; }
      window.ReactDOM.createRoot(document.getElementById('root'))
        .render(window.React.createElement(App));
      var list = ${JSON.stringify(clicks)};
      var step = function (i) {
        if (i >= list.length) { setTimeout(function () { say(document.body.innerText); }, 80); return; }
        var el = document.querySelector(list[i]);
        if (el) el.click();
        setTimeout(function () { step(i + 1); }, 60);
      };
      setTimeout(function () { step(0); }, 60);
    } catch (e) { say('', String((e && e.message) || e)); }
  });
})();
<\/script>`;

  const promise = new Promise((resolve) => {
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      resolve(r);
    };
    const onMsg = (e) => {
      if (!e.data || !e.data.__lesson) return;
      finish({ text: e.data.text || '', error: e.data.error || '' });
    };
    const timer = setTimeout(() => finish({ text: '', error: 'Не дочекались відповіді від рамки.' }), timeoutMs);
    window.addEventListener('message', onMsg);
  });
  return { promise, srcdoc: shell };
}

/** Підсвітка синтаксису для читання, не для редагування — просто фарбує рядки */
function CodeBlock({ code }) {
  return <pre className="cd-block"><code>{code}</code></pre>;
}

/** Текст пояснення з `код` у зворотних лапках — підсвічений моноширинним */
function Prose({ text }) {
  const parts = String(text).split(/(`[^`]+`)/g);
  return (
    <p>
      {parts.map((p, i) => (p.startsWith('`')
        ? <code key={i} className="cd-inline">{p.slice(1, -1)}</code>
        : <span key={i}>{p}</span>))}
    </p>
  );
}

function CodeTab({ data, reload, toast }) {
  const [prog, setProg] = useState(() => data.code || {});
  const [openId, setOpenId] = useState(null);
  const [saving, setSaving] = useState(false);
  // Курс проходять один раз, а довідник відкривають щотижня — тож це не
  // підрозділ уроків, а рівноправний режим вкладки.
  const [mode, setMode] = useState('learn');

  useEffect(() => { setProg(data.code || {}); }, [data.code]);

  const upIdx = openUpTo(prog);
  const stats = courseStats(prog);
  const diary = statsOf(data.practice || [], today());

  const save = async (next) => {
    setProg(next);
    setSaving(true);
    try {
      await api('/api/health', { method: 'POST', body: { action: 'code', code: next } });
      await reload();
    } catch (e) {
      toast?.(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (openId) {
    const idx = CODE_LESSONS.findIndex((l) => l.id === openId);
    const lesson = CODE_LESSONS[idx];
    return (
      <LessonRoom
        lesson={lesson}
        saved={prog[lesson.id]}
        locked={idx > upIdx}
        onBack={() => setOpenId(null)}
        onNext={() => {
          const nxt = CODE_LESSONS[idx + 1];
          setOpenId(nxt ? nxt.id : null);
        }}
        onDone={async (code) => {
          const next = {
            ...prog,
            [lesson.id]: {
              id: lesson.id, state: 'done',
              date: new Date().toLocaleDateString('uk-UA'),
              tries: (prog[lesson.id]?.tries || 0) + 1,
              code,
            },
          };
          await save(next);
        }}
        onTry={async () => {
          const next = {
            ...prog,
            [lesson.id]: {
              ...(prog[lesson.id] || { id: lesson.id, state: '' }),
              tries: (prog[lesson.id]?.tries || 0) + 1,
            },
          };
          setProg(next);   // рахунок спроб не варто чекати на мережу
        }}
      />
    );
  }

  if (mode === 'ref') {
    return <RefBook onBack={() => setMode('learn')} />;
  }

  if (mode === 'tour') {
    return <TourBook onBack={() => setMode('learn')} />;
  }

  if (mode === 'diary') {
    return (
      <Diary
        list={data.practice || []}
        canEdit={data.canEdit}
        onBack={() => setMode('learn')}
        onAdd={async (entry) => {
          await api('/api/health', { method: 'POST', body: { action: 'practice', entry } });
          await reload();
        }}
        toast={toast}
      />
    );
  }

  return (
    <div className="cd-home">
      <div className="cd-intro">
        {/* назва вкладки вже стоїть у шапці — другий заголовок зайвий */}
        <p>
          Одна мова — JavaScript: нею ж написано цей застосунок. Спершу
          сторінка, бо результат видно очима; скрипти й основи підключаються
          там, де без них уже не обійтись. Далі React — те, чим написані ці
          екрани, — і сервер, який віддає їм дані.
        </p>
      </div>

      {/* Довідник — не додаток до уроків, а друга половина вкладки: уроки
          проходять один раз, а сюди повертаються щоразу, коли забули, як
          саме пишеться те, що вже колись робив. */}
      <button className="cd-refb" onClick={() => setMode('ref')}>
        <span className="cd-refb-t">Довідник</span>
        <span className="cd-refb-d">
          {REF_CARDS.length} карток: як поставити по центру, як перебрати
          список, як надіслати запит
        </span>
      </button>

      {/* Читати чуже — половина роботи розробника, і навчитись цього на
          вигаданих прикладах не можна: вигаданий приклад завжди зрозумілий,
          а робочий файл — ні. Тут розбирається код цього ж застосунку. */}
      <button className="cd-refb is-tour" onClick={() => setMode('tour')}>
        <span className="cd-refb-t">Розбір свого коду</span>
        <span className="cd-refb-d">
          {TOURS.length} розборів справжніх файлів «Обліку» — рядок за рядком,
          із поясненням, чому саме так
        </span>
      </button>

      {/* Третя частина вкладки — і найважливіша після того, як уроки
          скінчаться. Курс закінчується, довідник відповідає на питання,
          а вміння починається на першій зміні, якої ніхто не задавав. */}
      <button className="cd-refb is-diary" onClick={() => setMode('diary')}>
        <span className="cd-refb-t">
          Щоденник практики
          {diary.entries > 0 && <em className="cd-refb-n">{diary.entries}</em>}
        </span>
        <span className="cd-refb-d">
          {diary.entries > 0
            ? `${diary.entries} ${plural(diary.entries, 'зміна', 'зміни', 'змін')} за ${diary.days} ${plural(diary.days, 'день', 'дні', 'днів')}`
              + (diary.fixed ? `, з них ${diary.fixed} з розібраною поломкою` : '')
            : 'Свої зміни в цьому застосунку: що хотів, що зробив, на чому спіткнувся'}
        </span>
      </button>

      <div className="cd-prog">
        <div className="cd-prog-t">
          <div className="cd-prog-t">Пройдено</div>
          <b>{stats.done} з {stats.total}</b>
        </div>
        <div className="cd-prog-bar"><i style={{ width: `${(stats.done / stats.total) * 100}%` }} /></div>
      </div>

      {/* Три доріжки прогріваються по черзі: сторінка → скрипти → основи,
          коли без них уже не обійтись. Ділити список на три коробки за
          назвою доріжки означало б показати «наступний урок» унизу зовсім
          іншого розділу — тож список один, а доріжка лишається міткою на
          кожній картці, щоб було видно, звідки урок і що там ще лишилось. */}
      <div className="cd-track-legend">
        {stats.byTrack.map((t) => (
          <span key={t.key} className={'cd-tag is-' + t.key}>{t.label} {t.done}/{t.total}</span>
        ))}
      </div>

      <div className="cd-list">
        {CODE_LESSONS.map((l, i) => {
          const st = prog[l.id];
          const locked = i > upIdx;
          const done = st?.state === 'done';
          const current = i === upIdx && !done;
          const track = TRACKS.find((t) => t.key === l.track);
          return (
            <button
              key={l.id}
              className={'cd-item' + (done ? ' is-done' : '') + (locked ? ' is-locked' : '') + (current ? ' is-current' : '')}
              onClick={() => !locked && setOpenId(l.id)}
              disabled={locked}
            >
              <i className="cd-item-i">{done ? '✓' : locked ? '🔒' : i + 1}</i>
              <span className="cd-item-b">
                <b>{l.title}</b>
                <em>{l.goal}</em>
              </span>
              <span className={'cd-tag is-' + l.track}>{track.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Довідник.
 *
 * Побудований за питаннями, а не за темами: у роботі згадується не
 * «flexbox», а «як поставити по центру». Тому пошук іде і по назві, і по
 * питанню, і по самому коду — знайдеться і так, і так.
 *
 * У кожній картці є рядок «у застосунку»: приклад із підручника
 * забувається, а «ось так зроблено в моєму «Обліку» — ні.
 */
function RefBook({ onBack }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  const found = findCards(q);
  const searching = q.trim().length > 0;

  return (
    <div className="cd-ref">
      <div className="cd-ref-top">
        <button className="cd-back" onClick={onBack}>← До уроків</button>
        <input
          className="cd-ref-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Що потрібно згадати?"
        />
      </div>

      {searching && (
        <div className="cd-ref-n">
          {found.length === 0
            ? 'Нічого не знайшлось. Спробуйте іншими словами — пошук іде і по коду.'
            : `Знайдено: ${found.length}`}
        </div>
      )}

      {REF_GROUPS.map((g) => {
        const cards = found.filter((c) => c.g === g.key);
        if (!cards.length) return null;
        return (
          <div className="cd-ref-g" key={g.key}>
            <div className="cd-ref-h">
              <b>{g.label}</b>
              <em>{g.hint}</em>
            </div>
            <div className="cd-ref-list">
              {cards.map((c) => (
                <RefCard
                  key={c.id}
                  c={c}
                  open={open === c.id || searching}
                  onToggle={() => setOpen(open === c.id ? null : c.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Розбори власного коду.
 *
 * Уроки вчать писати, довідник нагадує як — а тут читають чуже. У роботі
 * це половина справи: правити наявне доводиться частіше, ніж писати з
 * нуля, і незнайомий файл лякає рівно доти, доки хтось не проведе по
 * ньому пальцем.
 */
function TourBook({ onBack }) {
  const [openId, setOpenId] = useState(null);
  const tour = openId ? tourById(openId) : null;

  if (tour) return <TourRoom tour={tour} onBack={() => setOpenId(null)} />;

  return (
    <div className="cd-ref">
      <div className="cd-ref-top">
        <button className="cd-back" onClick={onBack}>← До уроків</button>
      </div>

      <div className="cd-intro">
        <h2>Розбір свого коду</h2>
        <p>
          Тут не спрощені приклади, а справжні файли цього застосунку.
          Спрощений приклад завжди виглядає зрозумілим — а потім відкриваєш
          робочий файл, і він не схожий ні на що.
        </p>
      </div>

      <div className="cd-tours">
        {TOURS.map((t, i) => (
          <button className="cd-tour" key={t.id} onClick={() => setOpenId(t.id)}>
            <span className="cd-tour-n">{i + 1}</span>
            <span className="cd-tour-b">
              <b>{t.title}</b>
              <em>{t.goal}</em>
              <code>{t.file}</code>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Один розбір: вступ, кроки з кодом, висновок і одна зміна, яку варто спробувати */
function TourRoom({ tour, onBack }) {
  return (
    <div className="cd-troom">
      <button className="cd-back" onClick={onBack}>← До розборів</button>

      <div className="cd-thead">
        <h2>{tour.title}</h2>
        <code className="cd-tfile">{tour.file}</code>
        <div className="cd-tlevel">{tour.level}</div>
      </div>

      {tour.intro.map((p, i) => <p className="cd-tp" key={i}>{p}</p>)}

      <div className="cd-tsteps">
        {tour.steps.map((s, i) => (
          <div className="cd-tstep" key={i}>
            <pre className="cd-card-code">{s.code}</pre>
            <p className="cd-tsay"><Marked text={s.say} /></p>
          </div>
        ))}
      </div>

      <div className="cd-twhy">
        <h3>Що з цього забрати</h3>
        {tour.why.map((p, i) => <p key={i}><Marked text={p} /></p>)}
      </div>

      {/* Читання без спроби не лишається в голові, тож кожен розбір
          закінчується однією зміною, яку можна внести за хвилину. */}
      <div className="cd-ttry">
        <h3>Спробуйте</h3>
        <p>{tour.try}</p>
      </div>
    </div>
  );
}

/** Дві зірочки — жирним, зворотні лапки — кодом. Більше в поясненнях не треба. */
function Marked({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>;
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
        return p;
      })}
    </>
  );
}

/** Картка згорнута, поки не потрібна: список із тридцяти розгорнутих не гортається */
function RefCard({ c, open, onToggle }) {
  return (
    <div className={'cd-card' + (open ? ' is-open' : '')}>
      <button className="cd-card-h" onClick={onToggle}>
        <span className="cd-card-t">{c.t}</span>
        <span className="cd-card-q">{c.q}</span>
      </button>
      {open && (
        <div className="cd-card-b">
          <pre className="cd-card-code">{c.code}</pre>
          {c.note && <p className="cd-card-n">{c.note}</p>}
          {c.note2 && <p className="cd-card-n">{c.note2}</p>}
          {c.here && (
            <p className="cd-card-here"><b>У застосунку:</b> {c.here}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Кімната одного уроку. Пояснення й підказка ліворуч, редактор і
 * результат праворуч — на телефоні одне під одним. Перевірка не блокує
 * поле вводу: поки код виконується, можна вже читати, що вийшло минулого
 * разу.
 */
function LessonRoom({ lesson, saved, locked, onBack, onNext, onDone, onTry }) {
  const [code, setCode] = useState(saved?.code || lesson.start);
  const [out, setOut] = useState(null);        // { ok, text }
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [passed, setPassed] = useState(saved?.state === 'done');
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [showExample, setShowExample] = useState(false);
  /*
   * Скільки разів не вийшло.
   *
   * Розвʼязок раніше відкривався тільки після успіху — тобто рівно тоді,
   * коли він уже не потрібен. Хто застряг, лишався сам на сам із
   * підказкою в один рядок, і саме там уроки й кидають. Тепер після двох
   * невдалих спроб можна подивитись, як це мало виглядати: підглянути
   * відповідь і розібрати її корисніше, ніж закрити вкладку.
   */
  const [fails, setFails] = useState(0);
  const iframeRef = useRef(null);
  const STUCK = 2;

  useEffect(() => {
    setCode(saved?.code || lesson.start);
    setPassed(saved?.state === 'done');
    setOut(null); setErr(''); setShowHint(false); setShowSolution(false);
    setShowExample(false); setFails(0);
  }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (locked) {
    return (
      <div className="cd-room">
        <button className="cd-back" onClick={onBack}>← До уроків</button>
        <div className="h-empty">Цей урок ще закритий. Пройдіть попередні по черзі.</div>
      </div>
    );
  }

  /*
   * Чому не зарахувалось.
   *
   * Один текст на всі випадки повторює завдання й нічого не пояснює. У
   * «Умові» через це можна було застрягти надовго: гілку написано
   * правильно, а у виводі все одно «Важка» — бо `kg` лишилось 25, і до
   * нової гілки виконання просто не доходить. Тому `why` буває функцією
   * й дивиться, що саме людина написала.
   */
  const whyOf = (a, b) => {
    const w = typeof lesson.why === 'function' ? lesson.why(a, b) : lesson.why;
    return w || 'Поки що не те. Спробуйте ще.';
  };

  const run = async () => {
    setBusy(true); setErr(''); onTry?.();
    try {
      if (lesson.kind === 'js') {
        const r = await runJS(code);
        if (!r.ok && r.error) { setErr(r.error); setOut({ text: r.output }); }
        else {
          setOut({ text: r.output });
          const ok = lesson.check(r.output, code);
          if (ok) { setPassed(true); await onDone(code); }
          else { setFails((n) => n + 1); setErr(whyOf(r.output, code)); }
        }
      } else if (lesson.kind === 'react') {
        const { promise, srcdoc } = runReact(code, lesson.clicks);
        if (iframeRef.current) iframeRef.current.srcdoc = srcdoc;
        const r = await promise;
        if (r.error) setErr(r.error);
        else {
          const ok = lesson.check(code, r.text);
          if (ok) { setPassed(true); await onDone(code); }
          else { setFails((n) => n + 1); setErr(whyOf(code, r.text)); }
        }
      } else {
        const { promise, srcdoc } = runPage(code);
        // рамку монтуємо тут, а не через runPage: їй потрібен реальний DOM
        if (iframeRef.current) iframeRef.current.srcdoc = srcdoc;
        const text = await promise;
        const ok = lesson.check(code, text);
        if (ok) { setPassed(true); await onDone(code); }
        else { setFails((n) => n + 1); setErr(whyOf(code, text)); }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cd-room">
      <div className="cd-room-h">
        <button className="cd-back" onClick={onBack}>← До уроків</button>
        <b>{lesson.title}</b>
      </div>

      <div className="cd-intro-box">
        {lesson.intro.map((t, i) => <Prose key={i} text={t} />)}
      </div>

      {/* Та сама думка, показана працюючою. Пояснення словами каже, що
          робить `filter`; приклад показує, що з нього виходить — і саме
          цього бракувало між «прочитав» і «пиши сам». Згорнутий, щоб не
          заступати завдання тому, кому вже зрозуміло. */}
      {lesson.example && (
        <div className="cd-ex">
          <button className="cd-ex-h" onClick={() => setShowExample((v) => !v)}>
            <span className={'cd-ex-arr' + (showExample ? ' on' : '')}>▸</span>
            Ось як це працює
          </button>
          {showExample && (
            <div className="cd-ex-b">
              <CodeBlock code={lesson.example.code} />
              <div className="cd-ex-out">
                <span className="cd-ex-lab">Виходить</span>
                <pre>{lesson.example.out}</pre>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="cd-task">
        <b>Завдання.</b> {lesson.task}
        {/* Ціль була відома лише з тексту помилки, тобто вже після
            невдачі. Тепер її видно до того, як почали писати. */}
        {lesson.want && (
          <div className="cd-want"><b>Має вийти:</b> {lesson.want}</div>
        )}
      </div>

      <div className={'cd-work' + (lesson.kind === 'js' ? '' : ' is-page')}>
        <textarea
          className="cd-editor"
          value={code}
          onChange={(e) => { setCode(e.target.value); setErr(''); }}
          spellCheck={false}
          rows={lesson.kind === 'js' ? 8 : 12}
        />
        {lesson.kind !== 'js' && (
          <iframe
            ref={iframeRef}
            className="cd-frame"
            sandbox="allow-scripts"
            title="Перегляд"
          />
        )}
      </div>

      {lesson.kind === 'js' && out && (
        <div className="cd-out">
          <div className="cd-out-h">Надруковано</div>
          <pre>{out.text || '(нічого не надруковано)'}</pre>
        </div>
      )}

      {err && <div className="cd-err">{err}</div>}
      {passed && !err && (
        <div className="cd-ok">✓ Зроблено. Можна йти далі — або лишитись і поекспериментувати.</div>
      )}

      <div className="cd-actions">
        <button className="act-btn act-accept" onClick={run} disabled={busy}>
          {busy ? 'Виконую…' : 'Запустити'}
        </button>
        {passed && (
          <button className="act-btn act-accept" onClick={onNext}>Далі →</button>
        )}
        <button className="act-btn" onClick={() => setShowHint((v) => !v)}>
          {showHint ? 'Сховати підказку' : 'Підказка'}
        </button>
        {(passed || fails >= STUCK) && (
          <button className="act-btn" onClick={() => setShowSolution((v) => !v)}>
            {showSolution ? 'Сховати розвʼязок' : 'Показати розвʼязок'}
          </button>
        )}
      </div>

      {showHint && <div className="cd-hint">{lesson.hint}</div>}
      {showSolution && (
        <>
          {!passed && (
            <div className="cd-hint">
              Подивіться, розберіть по рядку — і напишіть у себе руками, а не
              копіюйте. Урок зарахується, коли запуститься ваш код.
            </div>
          )}
          <CodeBlock code={lesson.solution} />
        </>
      )}

      <NextRead lesson={lesson} done={passed} />
    </div>
  );
}

/**
 * Щоденник практики.
 *
 * Уроки закінчуються, і саме там зупиняється більшість. Вміння
 * починається на першій зміні, якої ніхто не задавав, — і от її треба
 * записати: що хотів, що зробив, на чому спіткнувся.
 *
 * Форма навмисно вимагає лише одне поле. Щоденник, який просить
 * заповнити сім клітинок, кидають на третьому записі.
 */
function Diary({ list, canEdit, onBack, onAdd, toast }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const s = statsOf(list, today());
  const ideas = freshIdeas(list);

  const send = async () => {
    if (!String(form.want || '').trim()) { toast?.('Напишіть, що саме хотіли зробити'); return; }
    setBusy(true);
    try {
      await onAdd(form);
      setForm({});
      setOpen(false);
    } catch (e) {
      toast?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cd-room">
      <div className="cd-room-h">
        <button className="cd-back" onClick={onBack}>← До уроків</button>
        <b>Щоденник практики</b>
      </div>

      <div className="cd-intro-box">
        <Prose text={'Сюди йдуть власні зміни в цьому застосунку, а не пройдені уроки. Через пів року це готова відповідь на «що ви робили», а вже наступного тижня — спосіб не витратити вечір на помилку, яку колись уже розібрали.'} />
      </div>

      {s.entries > 0 && (
        <div className="dy-stats">
          <div className="dy-stat"><b>{s.entries}</b><span>{plural(s.entries, 'зміна', 'зміни', 'змін')}</span></div>
          <div className="dy-stat"><b>{s.days}</b><span>{plural(s.days)}</span></div>
          {s.streak > 1 && <div className="dy-stat"><b>{s.streak}</b><span>поспіль</span></div>}
          {s.fixed > 0 && <div className="dy-stat"><b>{s.fixed}</b><span>розібраних поломок</span></div>}
          {s.hours > 0 && <div className="dy-stat"><b>{s.hours}</b><span>годин</span></div>}
        </div>
      )}

      {canEdit && !open && (
        <div className="cd-actions">
          <button className="act-btn act-accept" onClick={() => setOpen(true)}>Записати зміну</button>
        </div>
      )}

      {canEdit && open && (
        <div className="dy-form">
          {PRACTICE_FIELDS.map((f) => (
            <label key={f.key} className="dy-field">
              <span className="dy-lab">
                {f.label}
                {f.required && <i className="dy-req">обовʼязково</i>}
              </span>
              <textarea
                rows={f.key === 'want' || f.key === 'broke' ? 2 : 1}
                value={form[f.key] || ''}
                placeholder={f.example}
                onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              <em className="dy-hint">{f.hint}</em>
            </label>
          ))}
          <label className="dy-field is-short">
            <span className="dy-lab">Скільки часу зайняло, хв</span>
            <input
              type="number"
              inputMode="numeric"
              value={form.mins || ''}
              onChange={(e) => setForm((v) => ({ ...v, mins: e.target.value }))}
            />
          </label>
          <div className="cd-actions">
            <button className="act-btn act-accept" onClick={send} disabled={busy}>
              {busy ? 'Записую…' : 'Зберегти'}
            </button>
            <button className="act-btn" onClick={() => { setOpen(false); setForm({}); }}>Скасувати</button>
          </div>
        </div>
      )}

      {!open && (
        <div className="dy-ideas">
          <div className="dy-ideas-h">Якщо не знаєте, з чого почати</div>
          {ideas.map((i) => (
            <div key={i.t} className="dy-idea">
              <b>{i.t}</b>
              <span>{i.d}</span>
              <code>{i.where}</code>
            </div>
          ))}
        </div>
      )}

      {list.length === 0 && !open && (
        <div className="h-empty">
          Поки порожньо. Перший запис варто зробити навіть про однорядкову зміну —
          саме з них і починається рахунок.
        </div>
      )}

      <div className="dy-list">
        {list.map((e) => (
          <div key={e.row} className="dy-entry">
            <div className="dy-entry-h">
              <b>{e.want}</b>
              <span>{e.date}{e.mins ? ` · ${e.mins} хв` : ''}</span>
            </div>
            {e.did && <div className="dy-line"><i>Зробив</i>{e.did}</div>}
            {e.where && <div className="dy-line"><i>Де</i><code>{e.where}</code></div>}
            {e.broke && <div className="dy-line is-broke"><i>Зламалось</i>{e.broke}</div>}
            {e.learned && <div className="dy-line is-learn"><i>Зрозумів</i>{e.learned}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * «Що почитати далі». Стоїть унизу уроку й до розвʼязання виглядає
 * стримано: спершу треба зробити завдання руками, а вже потім читати,
 * як воно влаштоване насправді. Після «зроблено» посилання підсвічується —
 * саме тоді від нього найбільше користі.
 */
function NextRead({ lesson, done }) {
  const n = nextLink(lesson);
  if (!n) return null;
  return (
    <a
      className={'cd-next' + (done ? ' is-done' : '')}
      href={n.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="cd-next-l">
        Далі почитати{n.foreign && ' · англійською'}
      </span>
      <b>{n.t}</b>
      {n.d && <span className="cd-next-d">{n.d}</span>}
    </a>
  );
}

/* ---------- Вкладка «Підсумки» ---------- */

/**
 * Не окремі числа за день, а картина за час: скільки днів ведеться облік,
 * скільки з них у межах норми, яка серія зараз і яка була найдовша. Плюс
 * стовпчики за два тижні — де провал, видно одразу.
 */
function StatsTab({ data }) {
  const g = data.goals || {};
  const kcalGoal = num(g.kcal);
  const days = data.days;

  const logged = days.filter((d) => num(d.kcal) > 0).length;
  const hit = kcalGoal > 0
    ? days.filter((d) => num(d.kcal) > 0 && num(d.kcal) <= kcalGoal).length
    : null;

  const cur = streakOf(days, today()).n;

  // найдовша серія — просто найбільший непереривний відрізок серед усіх днів
  const best = (() => {
    const set = new Set(days.filter(filled).map((d) => d.date));
    let max = 0;
    set.forEach((date) => {
      // рахуємо лише від початку відрізка, щоб не міряти той самий двічі
      const prev = new Date(stamp(date) - 86400000);
      const p = (x) => String(x).padStart(2, '0');
      const before = `${p(prev.getUTCDate())}.${p(prev.getUTCMonth() + 1)}.${prev.getUTCFullYear()}`;
      if (set.has(before)) return;
      let n = 0;
      let t = stamp(date);
      while (true) {
        const d = new Date(t);
        const k = `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
        if (!set.has(k)) break;
        n++; t += 86400000;
      }
      if (n > max) max = n;
    });
    return max;
  })();

  return (
    <>
      <div className="h-stiles">
        <div className="h-stile is-dark">
          <div className="h-stile-l">Днів обліку</div>
          <div className="h-stile-v">{logged}</div>
        </div>
        <div className="h-stile is-dark">
          <div className="h-stile-l">Днів у межах норми</div>
          <div className="h-stile-v">
            {hit === null ? '—' : hit}
            {hit > 0 && <i> 🏆</i>}
          </div>
        </div>
        <div className="h-stile">
          <div className="h-stile-l">Серія зараз</div>
          <div className="h-stile-v">{cur}</div>
        </div>
        <div className="h-stile">
          <div className="h-stile-l">Найдовша серія</div>
          <div className="h-stile-v">{best}</div>
        </div>
      </div>
      {hit === null && (
        <div className="h-hint">
          Щоб рахувати дні в межах норми, задайте норму калорій на вкладці «Цілі».
        </div>
      )}

      <div className="h-sec"><h3>За два тижні</h3></div>
      <WeekBars days={days} span={14} pick={(d) => d.kcal} goal={kcalGoal}
        unit="ккал" label="Зʼїдено калорій" color="var(--amber)" />
      <WeekBars days={days} span={14} pick={(d) => d.burned} goal={num(g.burned)}
        unit="ккал" label="Спалено активністю" color="var(--ring-move)" />
      <WeekBars days={days} span={14} pick={(d) => d.steps} goal={num(g.steps)}
        unit="кроків" label="Кроки" color="var(--green)" />
      <WeekBars days={days} span={14} pick={(d) => d.water} goal={num(g.water)}
        unit="мл" label="Вода" color="var(--ring-stand)" />

      {days.length === 0 && <div className="h-empty">Ще немає з чого рахувати</div>}
    </>
  );
}

/**
 * Два світи.
 *
 * Під однією назвою тут зійшлося те, що спільного між собою не має: тіло
 * (що зʼїв, скільки важу, які ліки) і навчання (уроки коду, таблиця
 * множення). Дев'ять вкладок в один ряд перетворювали розділ на купу, у
 * якій «Ліки» стоять поруч із «Кодом».
 *
 * Сторінка лишилась одна навмисно: дані читаються одним запитом до
 * Google, і доступ перевіряється в одному місці. Розділені лише очі.
 *
 * Ключі світів навмисно не збігаються з ключами вкладок: вкладка `body` —
 * це заміри тіла, і два різні `body` в одному файлі рано чи пізно
 * зустрілися б.
 */
const WORLDS = [
  { key: 'telo', label: 'Тіло' },
  { key: 'navch', label: 'Навчання' },
];

const TABS = [
  { key: 'day', label: 'День', world: 'telo' },
  { key: 'weight', label: 'Вага', world: 'telo' },
  { key: 'dishes', label: 'Страви', world: 'telo' },
  { key: 'body', label: 'Заміри', world: 'telo' },
  { key: 'meds', label: 'Ліки', world: 'telo' },
  { key: 'stats', label: 'Підсумки', world: 'telo' },
  { key: 'goals', label: 'Цілі', world: 'telo' },
  { key: 'code', label: 'Код', world: 'navch' },
  { key: 'mult', label: 'Множення', world: 'navch' },
];

/** У якому світі живе вкладка; невідома вкладка вважається тілом */
const worldOf = (key) => TABS.find((t) => t.key === key)?.world || 'telo';

/** Перша вкладка світу — те, що показати після перемикання */
const firstTabOf = (world) => TABS.find((t) => t.world === world)?.key || 'day';

/* Прості значки для нижньої панелі — без бібліотек, щоб сторінка лишалась
   самодостатньою. Обведення успадковує колір, тож активна вкладка
   підсвічується сама. */
const Ico = ({ d, fill }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
    fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const IcoDay = <Ico d={<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>} />;
const IcoWeight = <Ico d={<><circle cx="12" cy="13" r="8" /><path d="M12 13l3-4" /><path d="M9 5h6" /></>} />;
const IcoStats = <Ico d={<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>} />;
const IcoMore = <Ico d={<><path d="M4 7h16M4 12h16M4 17h16" /></>} />;

const IcoCode = <Ico d={<><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" /></>} />;
const IcoMult = <Ico d={<><path d="M6 6l12 12M18 6L6 18" /><rect x="3" y="3" width="18" height="18" rx="3" /></>} />;

/*
 * Унизу — тільки те, куди заходять щодня, і в кожного світу воно своє.
 * Решта за «Ще»: шість дрібних кнопок в один ряд на телефоні не натиснеш.
 * У «Навчанні» вкладок дві, тож «Ще» там просто немає — порожня кнопка
 * гірша за її відсутність.
 */
const BNAV = {
  telo: [
    { key: 'day', label: 'День', icon: IcoDay },
    { key: 'weight', label: 'Вага', icon: IcoWeight },
    { key: 'stats', label: 'Підсумки', icon: IcoStats },
  ],
  navch: [
    { key: 'code', label: 'Код', icon: IcoCode },
    { key: 'mult', label: 'Множення', icon: IcoMult },
  ],
};

const MORE = {
  telo: [
    { key: 'meds', label: 'Ліки й курси' },
    { key: 'dishes', label: 'Свої страви' },
    { key: 'body', label: 'Заміри тіла' },
    { key: 'goals', label: 'Цілі й профіль' },
  ],
  navch: [],
};

const MONTHS = [
  'січ', 'лют', 'бер', 'кві', 'тра', 'чер',
  'лип', 'сер', 'вер', 'жов', 'лис', 'гру',
];

/** «09.08.2026» → «9 сер» — у шапці важлива не точність запису, а читабельність */
function longDate(d) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((d || '').trim());
  if (!m) return d;
  return `${Number(m[1])} ${MONTHS[Number(m[2]) - 1] || m[2]}`;
}

export default function Osobyste() {
  const [data, setData] = useState(null);
  const [note, setNote] = useState('');
  const [tab, setTab] = useState('day');
  const [world, setWorld] = useState('telo');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [more, setMore] = useState(false);

  /*
   * Куди повертатись. Той, хто вчора сидів в уроках, завтра хоче знову
   * туди, а не на «День». Читаємо в ефекті, а не при першому малюванні:
   * на сервері localStorage немає, і сторінка розійшлася б із розміткою.
   */
  useEffect(() => {
    try {
      const saved = localStorage.getItem('oblik_me_tab');
      if (saved && TABS.some((t) => t.key === saved)) {
        setTab(saved);
        setWorld(worldOf(saved));
      }
    } catch { /* приватне вікно — просто почнемо з початку */ }
  }, []);

  /** Перейти на вкладку разом зі світом, у якому вона живе */
  const go = useCallback((key) => {
    setTab(key);
    setWorld(worldOf(key));
    try { localStorage.setItem('oblik_me_tab', key); } catch { /* дарма */ }
  }, []);

  /** Перемкнути світ — на його першу вкладку */
  const goWorld = useCallback((w) => go(firstTabOf(w)), [go]);

  // гортання днів переїхало в шапку, тож і зсув дати тепер тут
  const shiftDate = (days) => {
    const d = new Date(stamp(date) + days * 86400000);
    const p = (x) => String(x).padStart(2, '0');
    setDate(`${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`);
  };

  const [slow, setSlow] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setSlow(false);
    // якщо таблиця думає довше десяти секунд — краще сказати про це вголос,
    // ніж лишати людину перед написом «Завантаження…»
    const warn = setTimeout(() => setSlow(true), 10000);
    try {
      const fresh = await api('/api/health');
      CAN_EDIT = fresh.canEdit !== false;
      setData(fresh);
    } catch (e) {
      setError(e);
    } finally {
      clearTimeout(warn);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // одне коротке повідомлення внизу — окремої системи сповіщень тут не треба
  const toast = useCallback((text) => {
    setNote(text);
    setTimeout(() => setNote((n) => (n === text ? '' : n)), 3000);
  }, []);

  if (error) {
    return (
      <>
        <Head><title>Особисте</title></Head>
        <div className="h-gate">
          <h1>Особисте</h1>
          <p>{error.status === 401 ? 'Спершу увійдіть у застосунок.' : error.message}</p>
          {error.status !== 401 && error.status !== 403 && (
            <button className="h-btn h-btn-p" onClick={load}>Спробувати ще раз</button>
          )}
          <a className="h-btn" href="/">На головну</a>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Head><title>Особисте</title></Head>
        <div className="h-gate">
          <p>Завантаження…</p>
          {slow && (
            <>
              <p className="h-gate-slow">
                Таблиця відповідає довше, ніж зазвичай. Ще чекаємо — якщо не
                вийде, за 25 секунд скажемо про це прямо.
              </p>
              <button className="h-btn" onClick={load}>Спробувати ще раз</button>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <Head><title>Особисте</title></Head>
      <div className={'h-wrap' + (busy ? ' is-busy' : '')}>
        {/* Гість бачить розділ, але нічого не змінює — і має про це знати
            одразу, а не після натискання кнопки, яка нічого не зробить. */}
        {data.canEdit === false && (
          <div className="h-ro">
            <span className="h-ro-t">Тільки перегляд</span>
            <a className="h-ro-a" href="/">Увійти</a>
          </div>
        )}
        {/* Угорі лише те, без чого не обійтися: вихід, який день дивимось і
            серія. Назва сторінки, номер збірки й перелік вкладок звідси
            прибрані — вкладки живуть унизу, під великим пальцем. */}
        <header className="h-head">
          <a className="h-back" href="/" title="До обліку майна">←</a>
          {tab === 'day' ? (
            <div className="h-hdate">
              <button className="h-hnav" onClick={() => shiftDate(-1)} title="Попередній день">‹</button>
              <button
                className="h-hday"
                onClick={() => setDate(today())}
                title={date === today() ? 'Сьогодні' : 'Повернутись на сьогодні'}
              >
                {date === today() ? 'Сьогодні' : longDate(date)}
              </button>
              <button
                className="h-hnav"
                onClick={() => shiftDate(1)}
                disabled={stamp(date) >= stamp(today())}
                title="Наступний день"
              >
                ›
              </button>
            </div>
          ) : (
            <div className="h-htitle">{TABS.find((t) => t.key === tab)?.label || 'Особисте'}</div>
          )}
          {/* Серія — нагорода за ведення щоденника тіла. У «Навчанні» вона
              міряє не те, чим людина там зайнята, тож її там немає. */}
          {world === 'telo' ? (
            <button
              className="h-fire"
              onClick={() => go('stats')}
              title="Днів поспіль — відкрити підсумки"
            >
              ✦ <b>{streakOf(data.days, today()).n}</b>
            </button>
          ) : (
            <span className="h-fire is-quiet" title="Пройдено уроків">
              {courseStats(data.code || {}).done}<b>/{CODE_LESSONS.length}</b>
            </span>
          )}
        </header>

        {/* Два світи — головний поділ розділу, тож вони стоять над усім
            іншим і видно їх завжди, і на телефоні, і на широкому екрані. */}
        <div className="h-worlds">
          {WORLDS.map((w) => (
            <button
              key={w.key}
              className={'h-world' + (world === w.key ? ' on' : '')}
              onClick={() => goWorld(w.key)}
            >
              {w.label}
            </button>
          ))}
        </div>

        {/* на широкому екрані нижньої панелі немає — лишаються вкладки вгорі */}
        <div className="h-tabs">
          {TABS.filter((t) => t.world === world).map((t) => (
            <button
              key={t.key}
              className={'h-tab' + (tab === t.key ? ' on' : '')}
              onClick={() => go(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'day' && <DayTab data={data} date={date} setDate={setDate} reload={load} setBusy={setBusy} toast={toast} />}
        {tab === 'weight' && <WeightTab data={data} reload={load} />}
        {tab === 'dishes' && <DishesTab data={data} reload={load} setBusy={setBusy} />}
        {tab === 'body' && <BodyTab data={data} reload={load} />}
        {tab === 'meds' && <MedsTab data={data} reload={load} setBusy={setBusy} toast={toast} />}
        {tab === 'mult' && <MultTab data={data} reload={load} toast={toast} />}
        {tab === 'code' && <CodeTab data={data} reload={load} toast={toast} />}
        {tab === 'stats' && <StatsTab data={data} />}
        {tab === 'goals' && <GoalsTab data={data} reload={load} setBusy={setBusy} />}
      </div>

      {/* Нижня панель на телефоні: щоденне — окремими кнопками, рідке —
          під «Ще», щоб не було шести дрібних цілей в один ряд. */}
      <nav className="h-bnav">
        {BNAV[world].map((t) => (
          <button
            key={t.key}
            className={'h-bnav-b' + (tab === t.key ? ' on' : '')}
            onClick={() => go(t.key)}
          >
            <span className="h-bnav-i">{t.icon}</span>
            {t.label}
          </button>
        ))}
        {MORE[world].length > 0 && (
          <button
            className={'h-bnav-b' + (MORE[world].some((m) => m.key === tab) ? ' on' : '')}
            onClick={() => setMore(true)}
          >
            <span className="h-bnav-i">{IcoMore}</span>
            Ще
          </button>
        )}
      </nav>

      {more && (
        <div className="h-sheet-bg" onClick={() => setMore(false)}>
          <div className="h-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="h-sheet-g" />
            {MORE[world].map((m) => (
              <button
                key={m.key}
                className={'h-sheet-b' + (tab === m.key ? ' on' : '')}
                onClick={() => { go(m.key); setMore(false); }}
              >
                {m.label}
              </button>
            ))}
            <a className="h-sheet-b" href="/">← До обліку майна</a>
            {BUILD && <div className="h-sheet-v">збірка {BUILD}</div>}
          </div>
        </div>
      )}

      {note && <div className="h-toast">{note}</div>}
    </>
  );
}
