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
              title={`${p.d} — ${p.v}${unit}`}
            >
              <b>{n1(p.v)}</b>
            </span>
          ))}
        </div>
      </div>
      <div className="h-chart-x">
        {points.map((p, i) => <span key={i} style={{ left: `${x(i)}%` }}>{short(p.d)}</span>)}
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

function DayTab({ data, date, setDate, reload, setBusy }) {
  const [food, setFood] = useState(null);
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
        <button className="h-btn h-btn-p" onClick={() => setFood({ date })}>+ Додати їжу</button>
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
          onClose={() => setFood(null)}
          onDone={reload}
        />
      )}
    </>
  );
}

function FoodModal({ date, known, onClose, onDone }) {
  const [meal, setMeal] = useState(MEALS[0]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // те, що вже їв раніше, підставляємо одним дотиком
  const q = name.trim().toLowerCase();
  const seen = [];
  known.forEach((f) => {
    if (!f.name || (q && !f.name.toLowerCase().includes(q))) return;
    if (seen.some((s) => s.name.toLowerCase() === f.name.toLowerCase())) return;
    seen.push(f);
  });

  const use = (f) => {
    setName(f.name); setAmount(f.amount);
    setKcal(String(f.kcal)); setProtein(String(f.protein));
    setFat(String(f.fat)); setCarbs(String(f.carbs));
  };

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
      <label>Страва</label>
      <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="вівсянка, куряче філе…" />
      {seen.length > 0 && (
        <div className="h-seen">
          {seen.slice(0, 6).map((f) => (
            <button key={f.row} className="h-seen-b" onClick={() => use(f)}>
              {f.name} <i>{Math.round(f.kcal)} ккал</i>
            </button>
          ))}
        </div>
      )}
      <label>Кількість</label>
      <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100 г, 1 порція…" />
      <div className="h-row4">
        <div><label>Ккал</label><input type="number" inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} /></div>
        <div><label>Білки</label><input type="number" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} /></div>
        <div><label>Жири</label><input type="number" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} /></div>
        <div><label>Вугл.</label><input type="number" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

/* ---------- Вкладка «Вага» ---------- */

function WeightTab({ data, reload }) {
  const [open, setOpen] = useState(false);
  const [shot, setShot] = useState(null);

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

      <div className="h-sec">
        <h3>Динаміка ваги</h3>
        <button className="h-btn h-btn-p" onClick={() => setOpen(true)}>+ Записати вагу</button>
      </div>

      <LineChart
        points={weights.slice(-14).map((d) => ({ d: d.date, v: d.weight }))}
        goal={goal || null}
        unit=" кг"
      />

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
                  {photos.length === 0 ? (
                    <span className="h-hshot-ph">—</span>
                  ) : photos.map((s) => (
                    <img
                      key={s.key}
                      className="h-hshot"
                      src={photoSrc(d[s.key])}
                      alt={s.label}
                      title={`${s.label} · ${d.date}`}
                      onClick={() => setShot({ src: photoSrc(d[s.key]), label: `${s.label} · ${d.date}` })}
                    />
                  ))}
                </div>
                <span className="h-hw">{n1(d.weight)} кг</span>
                <span className={'h-hd' + (delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : '')}>
                  {delta === null ? '' : `${delta > 0 ? '+' : ''}${delta} кг`}
                </span>
                <span className="h-hdate">{d.date}</span>
              </div>
            );
          })}
        </div>
      )}

      {open && <WeightModal data={data} onClose={() => setOpen(false)} onDone={reload} />}
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

function WeightModal({ data, onClose, onDone }) {
  const [date, setDate] = useState(today());
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

/* ---------- Вкладка «Заміри» ---------- */

function BodyTab({ data, reload }) {
  const [open, setOpen] = useState(false);
  const rows = [...data.body].reverse();
  const last = rows[0];
  const prev = rows[1];

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
            {BODY_FIELDS.filter((f) => last[f.key] != null).map((f) => {
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

function BodyModal({ data, onClose, onDone }) {
  const [date, setDate] = useState(today());
  const existing = data.body.find((b) => b.date === date);
  const [vals, setVals] = useState({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const v = {};
    BODY_FIELDS.forEach((f) => { v[f.key] = existing?.[f.key] != null ? String(existing[f.key]) : ''; });
    setVals(v);
    setNote(existing?.note || '');
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

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
            <label>{f.label}{f.unit ? `, ${f.unit}` : ''}</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={vals[f.key] || ''}
              onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <label>Примітка</label>
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}

/* ---------- Вкладка «Цілі» ---------- */

function GoalsTab({ data, reload, setBusy }) {
  const [vals, setVals] = useState(() => {
    const v = {};
    GOAL_FIELDS.forEach((f) => { v[f.key] = data.goals?.[f.key] || ''; });
    return v;
  });
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

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
  { key: 'body', label: 'Заміри' },
  { key: 'goals', label: 'Цілі' },
];

export default function Health() {
  const [data, setData] = useState(null);
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

        {tab === 'day' && <DayTab data={data} date={date} setDate={setDate} reload={load} setBusy={setBusy} />}
        {tab === 'weight' && <WeightTab data={data} reload={load} />}
        {tab === 'body' && <BodyTab data={data} reload={load} />}
        {tab === 'goals' && <GoalsTab data={data} reload={load} setBusy={setBusy} />}
      </div>
    </>
  );
}
