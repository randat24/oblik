import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';

/*
 * Особистий розділ здоров'я. Свідомо окрема сторінка з власним кодом:
 * ці дані не мають перетинатися з рештою застосунку — ні в пошуку, ні на
 * дашборді, ні в журналі. Сюди веде лише пряме посилання /health.
 */

const MEALS = ['Сніданок', 'Обід', 'Вечеря', 'Перекус'];
const MOODS = ['Чудово', 'Добре', 'Нормально', 'Втома', 'Погано'];

const BODY_FIELDS = [
  { key: 'chest', label: 'Груди', unit: 'см' },
  { key: 'waist', label: 'Талія', unit: 'см' },
  { key: 'belly', label: 'Живіт', unit: 'см' },
  { key: 'hips', label: 'Стегна', unit: 'см' },
  { key: 'biceps', label: 'Біцепс', unit: 'см' },
  { key: 'thigh', label: 'Стегно', unit: 'см' },
  { key: 'neck', label: 'Шия', unit: 'см' },
  { key: 'fat', label: '% жиру', unit: '%' },
];

// Стать, зріст і рік народження — не цілі, а вихідні дані для формул
const PROFILE_FIELDS = [
  { key: 'height', label: 'Зріст', unit: 'см' },
  { key: 'birthYear', label: 'Рік народження', unit: '' },
];

const GOAL_FIELDS = [
  { key: 'startWeight', label: 'Стартова вага', unit: 'кг' },
  { key: 'weight', label: 'Цільова вага', unit: 'кг' },
  { key: 'kcal', label: 'Норма калорій', unit: 'ккал' },
  { key: 'protein', label: 'Білки', unit: 'г' },
  { key: 'fat', label: 'Жири', unit: 'г' },
  { key: 'carbs', label: 'Вуглеводи', unit: 'г' },
  { key: 'water', label: 'Вода', unit: 'мл' },
  { key: 'steps', label: 'Кроки', unit: '' },
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
  { key: '1.2', label: 'Сидяча робота, без тренувань' },
  { key: '1.375', label: 'Легка активність, 1–3 рази на тиждень' },
  { key: '1.55', label: 'Помірна, 3–5 разів на тиждень' },
  { key: '1.725', label: 'Висока, 6–7 разів на тиждень' },
  { key: '1.9', label: 'Дуже висока, важка фізична праця' },
];

const AIMS = [
  { key: '-20', label: 'Схуднення', note: 'мінус 20% від витрат' },
  { key: '-10', label: 'Повільне схуднення', note: 'мінус 10%' },
  { key: '0', label: 'Утримання ваги', note: 'скільки витрачаєте' },
  { key: '10', label: 'Набір маси', note: 'плюс 10%' },
];

/**
 * Норма калорій і БЖВ. Білок рахуємо на кілограм ваги, жир — теж,
 * решту добираємо вуглеводами: так пропорція лишається розумною
 * і на дефіциті, і на наборі.
 */
function calcNorm({ sex, weight, height, age, activity, aim }) {
  const base = bmr({ sex, weight, height, age });
  if (base === null) return null;
  const tdee = base * (num(activity) || 1.375);
  const kcal = tdee * (1 + (num(aim) || 0) / 100);
  const w = num(weight);
  const protein = Math.round(w * 1.8);
  const fat = Math.round(w * 0.9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return {
    bmr: Math.round(base),
    tdee: Math.round(tdee),
    kcal: Math.round(kcal),
    protein, fat, carbs,
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

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
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
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не вдалося прочитати фото')); };
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
              {(points.length <= 8 || i === 0 || i === points.length - 1) && <b>{n1(p.v)}</b>}
            </span>
          ))}
        </div>
      </div>
      <div className="h-chart-x">
        {points.map((p, i) => (
          (i % labelStep === 0 || i === points.length - 1)
            ? <span key={i} style={{ left: `${x(i)}%` }}>{short(p.d)}</span>
            : null
        ))}
      </div>
    </div>
  );
}

/* ---------- Фото ---------- */

function PhotoSlot({ label, value, onChange }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (file) => {
    if (!file) return;
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
        </div>
      ) : (
        <button className="h-slot-add" onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? '…' : '+ фото'}
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {err && <div className="h-err">{err}</div>}
    </div>
  );
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

function DayTab({ data, date, setDate, reload, setBusy, toast }) {
  const [food, setFood] = useState(null);
  const [copy, setCopy] = useState(false);
  const day = data.days.find((d) => d.date === date) || { date, kcal: 0, protein: 0, fat: 0, carbs: 0, water: 0, steps: 0 };
  const meals = data.food.filter((f) => f.date === date);
  const g = data.goals || {};
  const kcalGoal = num(g.kcal);
  const eaten = day.kcal;
  const leftKcal = kcalGoal > 0 ? Math.round(kcalGoal - eaten) : null;

  const delFood = async (row) => {
    if (!confirm('Прибрати запис?')) return;
    setBusy(true);
    try {
      await api('/api/health', { method: 'POST', body: { action: 'delFood', row, date } });
      await reload();
    } finally { setBusy(false); }
  };

  const shift = (days) => {
    const t = stamp(date) + days * 86400000;
    const d = new Date(t);
    const p = (x) => String(x).padStart(2, '0');
    setDate(`${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`);
  };

  return (
    <>
      <div className="h-daybar">
        <button className="h-nav" onClick={() => shift(-1)}>‹</button>
        <div className="h-daybar-d">
          {date}
          {date !== today() && (
            <button className="h-today" onClick={() => setDate(today())}>сьогодні</button>
          )}
        </div>
        <button className="h-nav" onClick={() => shift(1)} disabled={stamp(date) >= stamp(today())}>›</button>
      </div>

      <div className="h-kcal">
        <div className="h-kcal-v">
          {Math.round(eaten)}
          {kcalGoal > 0 && <span className="h-kcal-g"> / {kcalGoal}</span>}
        </div>
        <div className="h-kcal-l">зʼїдено калорій</div>
        {leftKcal !== null && (
          <div className={'h-kcal-left' + (leftKcal < 0 ? ' is-over' : '')}>
            {leftKcal >= 0 ? `лишилось ${leftKcal} ккал` : `перебір на ${-leftKcal} ккал`}
          </div>
        )}
      </div>

      <div className="h-bars">
        <Bar label="Білки" value={day.protein} goal={num(g.protein)} tone="var(--red)" />
        <Bar label="Жири" value={day.fat} goal={num(g.fat)} tone="var(--amber)" />
        <Bar label="Вуглеводи" value={day.carbs} goal={num(g.carbs)} tone="var(--green)" />
        {num(g.water) > 0 && <Bar label="Вода" value={day.water} goal={num(g.water)} unit="мл" tone="var(--blue)" />}
        {num(g.steps) > 0 && <Bar label="Кроки" value={day.steps} goal={num(g.steps)} unit="" tone="var(--blue)" />}
      </div>

      <div className="h-sec">
        <h3>Що зʼїв<span className="h-count">{meals.length}</span></h3>
        <div className="h-sec-a">
          <button className="h-btn" onClick={() => setCopy(true)}>Скопіювати день</button>
          <button className="h-btn h-btn-p" onClick={() => setFood({ date })}>+ Додати їжу</button>
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
                <span className="h-food-n">{f.name}{f.amount ? <i> · {f.amount}</i> : null}</span>
                <span className="h-food-k">{Math.round(f.kcal)}</span>
                <span className="h-food-m">{n1(f.protein)}/{n1(f.fat)}/{n1(f.carbs)}</span>
                <button className="h-food-x" onClick={() => delFood(f.row)} title="Прибрати">×</button>
              </div>
            ))}
          </div>
        ))
      )}

      {food && (
        <FoodModal
          date={date}
          known={data.food}
          products={data.products || []}
          dishes={data.dishes || []}
          onClose={() => setFood(null)}
          onDone={reload}
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
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    let stop = false;
    let stream = null;
    let timer = null;

    (async () => {
      if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
        setSupported(false);
        return;
      }
      let detector;
      try {
        detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
        });
      } catch {
        setSupported(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      } catch {
        setErr('Немає доступу до камери');
        return;
      }
      if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      await v.play().catch(() => {});

      const tick = async () => {
        if (stop) return;
        try {
          const found = await detector.detect(v);
          if (found.length) {
            const code = (found[0].rawValue || '').replace(/\D/g, '');
            if (code.length >= 6) { onFound(code); return; }
          }
        } catch { /* кадр не розпізнався — не біда, беремо наступний */ }
        timer = setTimeout(tick, 220);
      };
      tick();
    })();

    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
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

        {supported && !err && (
          <div className="h-scan-view">
            <video ref={videoRef} playsInline muted />
            <div className="h-scan-frame" />
          </div>
        )}

        <div className="h-scan-foot">
          {err && <div className="h-err">{err}</div>}
          {!supported && (
            <div className="h-hint">
              Цей браузер не вміє читати штрихкод камерою — на iPhone так і є.
              Введіть цифри з-під смужок, результат буде той самий.
            </div>
          )}
          <label>Ввести код руками</label>
          <div className="h-scan-manual">
            <input
              type="tel"
              inputMode="numeric"
              value={manual}
              autoFocus={!supported}
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

function FoodModal({ date, known, products = [], dishes = [], onClose, onDone }) {
  const [meal, setMeal] = useState(MEALS[0]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // коли страва прийшла з бази чи каталогу — рахуємо від грамів, а не вручну
  const [per100, setPer100] = useState(null);
  const [grams, setGrams] = useState('100');
  const [scan, setScan] = useState(false);
  const [found, setFound] = useState('');
  const [newCode, setNewCode] = useState('');
  const [np, setNp] = useState({});
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
    setAmount(k === 1 ? '1 порція' : `${n1(k)} порції`);
  }, [portionOf, portions]);

  // грами змінились — перераховуємо все, що знаємо на 100 г
  useEffect(() => {
    if (!per100) return;
    const k = num(grams) / 100;
    setKcal(String(n1(per100.kcal * k)));
    setProtein(String(n1(per100.protein * k)));
    setFat(String(n1(per100.fat * k)));
    setCarbs(String(n1(per100.carbs * k)));
    setAmount(`${n1(num(grams))} г`);
  }, [per100, grams]);

  const takeProduct = (p, note) => {
    setPortionOf(null);
    setPer100({ kcal: p.kcal, protein: p.protein, fat: p.fat, carbs: p.carbs });
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
        body: { action: 'food', entry: { date, meal, name: name.trim(), amount, kcal, protein, fat, carbs } },
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
          <button key={m} className={'h-pill' + (meal === m ? ' on' : '')} onClick={() => setMeal(m)}>{m}</button>
        ))}
      </div>
      <div className="h-food-top">
        <button className="h-btn h-btn-scan" onClick={() => setScan(true)} disabled={busy}>
          Сканувати штрихкод
        </button>
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
      {scan && <BarcodeScanner onFound={byCode} onClose={() => setScan(false)} />}
    </Modal>
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
      </div>

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

  const a = withPhotos.find((d) => d.date === left);
  const b = withPhotos.find((d) => d.date === right);
  const sides = side ? PHOTO_SIDES.filter((s) => s.key === side) : PHOTO_SIDES;
  const shown = sides.filter((s) => a?.[s.key] || b?.[s.key]);

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
                {d.date}{d.weight != null ? ` · ${n1(d.weight)} кг` : ''}
              </option>
            ))}
          </select>
          <span className="h-cmp-arrow">→</span>
          <select value={right} onChange={(e) => setRight(e.target.value)}>
            {withPhotos.map((d) => (
              <option key={d.date} value={d.date}>
                {d.date}{d.weight != null ? ` · ${n1(d.weight)} кг` : ''}
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

        <div className="h-cmp-pills">
          <button className={'h-pill' + (side === null ? ' on' : '')} onClick={() => setSide(null)}>Усі</button>
          {PHOTO_SIDES.map((s) => (
            <button key={s.key} className={'h-pill' + (side === s.key ? ' on' : '')} onClick={() => setSide(s.key)}>
              {s.label}
            </button>
          ))}
        </div>

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
    const fat = m.fat != null ? m.fat : navyFat({ sex: g.sex, height: g.height, waist: m.waist, neck: m.neck, hips: m.hips });
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
              const d = prev && prev[f.key] != null ? n1(last[f.key] - prev[f.key]) : null;
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
          <div className="h-tablewrap">
            <table className="h-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  {BODY_FIELDS.map((f) => <th key={f.key}>{f.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date}>
                    <td>{r.date}</td>
                    {BODY_FIELDS.map((f) => <td key={f.key}>{r[f.key] == null ? '—' : n1(r[f.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {open && <BodyModal data={data} onClose={() => setOpen(false)} onDone={reload} />}
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
  const auto = navyFat({
    sex: g.sex, height: g.height,
    waist: vals.waist, neck: vals.neck, hips: vals.hips,
  });

  useEffect(() => {
    const v = {};
    BODY_FIELDS.forEach((f) => { v[f.key] = existing?.[f.key] != null ? String(existing[f.key]) : ''; });
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
      BODY_FIELDS.forEach((f) => { body[f.key] = vals[f.key] === '' ? '' : num(vals[f.key]); });
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
    [...PROFILE_FIELDS, ...GOAL_FIELDS].forEach((f) => { v[f.key] = data.goals?.[f.key] || ''; });
    return v;
  });
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const age = vals.birthYear ? new Date().getFullYear() - num(vals.birthYear) : null;

  // остання зважена вага — з неї й рахуємо норму
  const weighed = data.days.filter((d) => d.weight != null);
  const weight = weighed.length ? weighed[weighed.length - 1].weight : null;
  const norm = calcNorm({
    sex: vals.sex, weight, height: vals.height, age,
    activity: vals.activity || '1.375', aim: vals.aim || '-20',
  });

  const applyNorm = () => {
    if (!norm) return;
    setVals((p) => ({
      ...p,
      kcal: String(norm.kcal),
      protein: String(norm.protein),
      fat: String(norm.fat),
      carbs: String(norm.carbs),
    }));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true); setErr(''); setSaved(false);
    try {
      await api('/api/health', { method: 'POST', body: { action: 'goals', goals: vals } });
      await reload();
      setSaved(true);
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

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
            <button className="h-btn h-btn-p" onClick={applyNorm}>Підставити в цілі</button>
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
        Ці числа задають норми на день і лінію цілі на графіку ваги.
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
      <div className="h-sec">
        <button className="h-btn h-btn-p" onClick={save}>Зберегти цілі</button>
        {saved && <span className="h-ok">збережено</span>}
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

/* ---------- Сторінка ---------- */

const TABS = [
  { key: 'day', label: 'День' },
  { key: 'weight', label: 'Вага' },
  { key: 'dishes', label: 'Страви' },
  { key: 'body', label: 'Заміри' },
  { key: 'goals', label: 'Цілі' },
];

export default function Health() {
  const [data, setData] = useState(null);
  const [note, setNote] = useState('');
  const [tab, setTab] = useState('day');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api('/api/health'));
      setError(null);
    } catch (e) {
      setError(e);
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
        <Head><title>Здоровʼя</title></Head>
        <div className="h-gate">
          <h1>Здоровʼя</h1>
          <p>{error.status === 401 ? 'Спершу увійдіть у застосунок.' : error.message}</p>
          <a className="h-btn h-btn-p" href="/">На головну</a>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Head><title>Здоровʼя</title></Head>
        <div className="h-gate"><p>Завантаження…</p></div>
      </>
    );
  }

  return (
    <>
      <Head><title>Здоровʼя</title></Head>
      <div className={'h-wrap' + (busy ? ' is-busy' : '')}>
        <header className="h-head">
          <h1>Здоровʼя</h1>
          <a className="h-back" href="/">← до обліку</a>
        </header>

        <div className="h-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={'h-tab' + (tab === t.key ? ' on' : '')}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'day' && <DayTab data={data} date={date} setDate={setDate} reload={load} setBusy={setBusy} toast={toast} />}
        {tab === 'weight' && <WeightTab data={data} reload={load} />}
        {tab === 'dishes' && <DishesTab data={data} reload={load} setBusy={setBusy} />}
        {tab === 'body' && <BodyTab data={data} reload={load} />}
        {tab === 'goals' && <GoalsTab data={data} reload={load} setBusy={setBusy} />}
      </div>
      {note && <div className="h-toast">{note}</div>}
    </>
  );
}
