/**
 * Спільна абетка сторінки: запит, сповіщення, поля, таблиці.
 *
 * Раніше все це лежало в `pages/index.js` — файлі на сім тисяч рядків.
 * Такий файл не читають цілком, тож правлять наосліп: знаходять потрібне
 * пошуком і міняють, не бачачи сусіднього.
 *
 * Сюди винесене те, чим користується не один розділ, а всі: звернення до
 * таблиці, сповіщення, модальне вікно, пошук, вибір зі списку, знімок,
 * зчитувач QR. Кожне з них — слово спільної мови, якою написані склад,
 * майно, звірка й доставки; тому вони й виглядають однаково скрізь.
 *
 * Правило те саме, що й для `components/util`: сюди складають лише те,
 * що справді потрібне більш ніж одному розділу. Модуль «різне» росте так
 * само непомітно, як сторінка, з якої його дістали.
 */
import {
  useState, useEffect, useCallback, useRef, useContext, createContext,
} from 'react';
import { enqueue, cacheGet, cachePut } from '../lib/offline';

// Сесія добігає кінця сама, тож будь-який запит може повернути 401.
// Тоді показуємо екран входу, а не незрозумілу помилку посеред роботи.
let onUnauthed = null;

/** Кого будити, коли сесія скінчилась: сторінка ставить це на себе */
export const setOnUnauthed = (fn) => { onUnauthed = fn; };

export const api = async (url, opts = {}) => {
  const method = (opts.method || 'GET').toUpperCase();
  let res;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    // Зв'язку немає. Запис не втрачаємо — він піде, щойно мережа зʼявиться.
    if (method !== 'GET') {
      enqueue({ url, method, body: opts.body, label: opts.label || '' });
      const e = new Error('Немає звʼязку. Запис збережено — надішлемо, щойно зʼявиться мережа');
      e.offline = true;
      throw e;
    }
    const hit = cacheGet(url);
    if (hit) {
      const e = { ...hit.data };
      Object.defineProperty(e, '__cachedAt', { value: hit.at, enumerable: false });
      return e;
    }
    const e = new Error('Немає звʼязку, і збережених даних для цього екрана ще немає');
    e.offline = true;
    throw e;
  }

  if (res.status === 401) {
    onUnauthed?.();
    throw new Error('Сесія завершилась — увійдіть знову');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка');
  if (method === 'GET') cachePut(url, data);
  return data;
};

/** Повідомлення про невдале збереження: офлайн — це не помилка, а відкладення */
export function saveFailed(toast, e, prefix = 'Не вдалося зберегти: ') {
  if (e?.offline) toast(e.message, { type: 'warn' });
  else toast(prefix + (e?.message || ''), { type: 'err' });
}

/** Час завершення сесії у звичному вигляді */
export function hhmm(ms) {
  if (!ms) return '';
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ms));
}

/** Сьогоднішня дата у форматі, який використовує таблиця */
export function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/* Векторні іконки — емодзі виглядають по-різному в кожній системі */
export const IconSearch = ({ size = 15 }) => (
  <svg className="ico" viewBox="0 0 16 16" width={size} height={size} fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
    <circle cx="6.8" cy="6.8" r="4.6" />
    <path d="M10.3 10.3 14 14" />
  </svg>
);

/* Семантика станів, а не просто палітра: видано — усе гаразд, втрачено —
   небезпека, КСП і склад — довідка, списано — поза обліком, решта — увага */
export function statusColor(s) {
  const v = (s || '').toLowerCase();
  if (v.includes('видан') || v.includes('выдан')) return 'var(--ob-success)';
  if (v.includes('втрач') || v.includes('утер')) return 'var(--ob-danger)';
  if (v.includes('ксп') || v.includes('склад')) return 'var(--ob-info)';
  if (v.includes('спис')) return 'var(--ob-muted)';
  return 'var(--ob-warning)';
}

/** Зовнішнє посилання лишаємо як є, приватне фото віддає наш маршрут */
export function photoSrc(v) {
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : '/api/photo?p=' + encodeURIComponent(v);
}

/* ---------- Сповіщення ---------- */
export const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ toasts, onClose }) {
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={'toast toast-' + (t.type || 'ok')}>
          <span className="toast-msg">{t.msg}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => { onClose(t.id); t.action.run(); }}
            >
              {t.action.label}
            </button>
          )}
          <button className="toast-x" onClick={() => onClose(t.id)} aria-label="Закрити">×</button>
        </div>
      ))}
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const close = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), []);

  const push = useCallback((msg, opts = {}) => {
    const id = ++seq.current;
    // undo має жити довше, ніж звичайне сповіщення
    const ttl = opts.ttl ?? (opts.action ? 9000 : 3500);
    setToasts((p) => [...p, { id, msg, type: opts.type, action: opts.action }]);
    if (ttl > 0) setTimeout(() => close(id), ttl);
    return id;
  }, [close]);

  return { toasts, push, close };
}

/** «1 мішок», «2 мішки», «5 мішків» — інакше лічильник читається як помилка */
/**
 * Українське число: «один рядок», «два рядки», «пʼять рядків».
 *
 * Одна функція на всі слова. До неї тут лежали дві однакові — для мішків
 * і для діб, — і кожне нове слово додавало б третю.
 */
export function plural(n, [one, few, many]) {
  const t = Math.abs(n) % 100;
  const o = Math.abs(n) % 10;
  if (t >= 11 && t <= 14) return many;
  if (o === 1) return one;
  if (o >= 2 && o <= 4) return few;
  return many;
}

export function bagWord(n) {
  return plural(n, ['мішок', 'мішки', 'мішків']);
}

/** «1 добу», «2 доби», «5 діб» — за останньою цифрою, крім підлітків */
export function dayWord(n) {
  return plural(n, ['добу', 'доби', 'діб']);
}

/* ---------- Сканування QR камерою ---------- */
export const IconQr = ({ size = 15 }) => (
  <svg className="ico" viewBox="0 0 16 16" width={size} height={size} fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
    <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
    <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
    <path d="M9.5 9.5h2v2h-2zM13 9.5h1.5M9.5 13H11v1.5M13.5 12.5v2" strokeLinecap="round" />
  </svg>
);

/**
 * Що саме відсканували. QR ящика — це посилання на застосунок,
 * решта може бути серійником, номером або чим завгодно з коробки.
 */
export function parseCode(raw) {
  const text = (raw || '').toString().trim();
  if (!text) return null;

  let box = null;
  let id = null;
  try {
    const u = new URL(text, 'https://oblik.local');
    box = u.searchParams.get('box');
    id = u.searchParams.get('id');
  } catch {}
  if (box) return { kind: 'box', value: box };
  if (id) return { kind: 'stock', value: id };
  if (/^[РPр]-?\d{1,5}$/i.test(text)) return { kind: 'stock', value: text.toUpperCase().replace(/^P/, 'Р') };
  return { kind: 'text', value: text };
}

export function QrScanner({ title = 'Наведіть на QR-код', hint, onCode, onClose }) {
  const videoRef = useRef(null);
  const [err, setErr] = useState('');
  const [torch, setTorch] = useState(null); // null — ліхтарика немає
  const stopRef = useRef(() => {});

  useEffect(() => {
    let alive = true;
    let stream = null;
    let raf = 0;
    let timer = 0;

    const stop = () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    stopRef.current = stop;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr('Браузер не дає доступу до камери. Скористайтесь камерою телефона — QR ящика відкриє потрібну картку сам.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (e) {
        setErr(
          e?.name === 'NotAllowedError'
            ? 'Доступ до камери заборонено. Дозвольте його в налаштуваннях сайту й спробуйте знову.'
            : 'Не вдалося увімкнути камеру: ' + (e?.message || '')
        );
        return;
      }
      if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play().catch(() => {});

      const track = stream.getVideoTracks()[0];
      if (track?.getCapabilities?.().torch) setTorch(false);

      const hit = (text) => {
        if (!alive || !text) return;
        stop();
        onCode(text);
      };

      // на Android є вбудований розпізнавач — він швидший і не гріє телефон
      if ('BarcodeDetector' in window) {
        try {
          const det = new window.BarcodeDetector({ formats: ['qr_code'] });
          timer = setInterval(async () => {
            if (!alive || video.readyState < 2) return;
            try {
              const codes = await det.detect(video);
              if (codes?.length) hit(codes[0].rawValue);
            } catch {}
          }, 250);
          return;
        } catch {}
      }

      // запасний шлях — розбираємо кадри самі (потрібно для iPhone)
      const { default: jsQR } = await import('jsqr');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (!alive) return;
        if (video.readyState >= 2) {
          const w = 320;
          const h = Math.round((video.videoHeight / video.videoWidth) * w) || 240;
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const found = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
          if (found?.data) return hit(found.data);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => stop();
  }, [onCode]);

  const toggleTorch = async () => {
    const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
    if (!track) return;
    const next = !torch;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorch(next);
    } catch {}
  };

  return (
    <div className="overlay scan-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="scan">
        <div className="scan-head">
          <span>{title}</span>
          <button className="scan-x" onClick={onClose} aria-label="Закрити">✕</button>
        </div>

        {err ? (
          <div className="scan-err">{err}</div>
        ) : (
          <div className="scan-view">
            <video ref={videoRef} muted playsInline />
            <div className="scan-frame" />
          </div>
        )}

        <div className="scan-foot">
          {hint && <span className="scan-hint">{hint}</span>}
          {torch !== null && (
            <button className="act-btn" onClick={toggleTorch}>
              {torch ? 'Вимкнути ліхтарик' : 'Ліхтарик'}
            </button>
          )}
          <button className="act-btn" onClick={onClose}>Скасувати</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Головна: що є, що робилось, на що глянути ---------- */
export function Stat({ label, value, sub, tone }) {
  return (
    /* Підпис зверху, число під ним: око спершу читає, про що картка, і
       лише тоді бачить величину. У макетах Signal картки показників
       побудовані саме так. */
    <div className={'stat' + (tone ? ' stat-' + tone : '')}>
      <div className="stat-l">{label}</div>
      <div className="stat-v">{value}</div>
      {sub && <div className="stat-s">{sub}</div>}
    </div>
  );
}

/* ---------- Модальні вікна ---------- */
export function Modal({ title, children, onCancel, onSave, saveLabel = 'Зберегти', busy, error }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="overlay" onClick={(e) => e.target.className === 'overlay' && onCancel()}>
      <div className="modal">
        <h2>{title}</h2>
        {children}
        {error && <div className="err">{error}</div>}
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel}>Скасувати</button>
          <button className="btn-save" onClick={onSave} disabled={busy}>
            {busy ? '...' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Завантаження фото ---------- */

/** Стискає фото у браузері, щоб не вантажити 8 МБ з телефона */
function shrinkImage(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      if (scale === 1 && file.size < 700 * 1024) return resolve(file);

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(new File([blob], 'photo.jpg', { type: 'image/jpeg' })) : reject(new Error('Не вдалося обробити фото'))),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не вдалося прочитати фото'));
    };
    img.src = url;
  });
}

export function PhotoField({ value, onChange, showPreview = true, label = 'Фото' }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef(null);

  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const small = await shrinkImage(file);
      const res = await fetch('/api/upload', { method: 'POST', body: small });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка завантаження');
      // фото приватні — зберігаємо ідентифікатор, а не URL: показує їх наш маршрут після входу
      onChange(data.fileId);
    } catch (e) {
      setErr(e.message || 'Помилка завантаження');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="photo-field">
      <label>{label}</label>
      {showPreview && value && <img className="photo-preview" src={photoSrc(value)} alt="" />}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <div className="photo-actions">
        <button type="button" className="act-btn act-qr" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Завантаження…' : value ? 'Замінити фото' : 'Завантажити фото'}
        </button>
        {value && (
          <button type="button" className="act-btn act-del" disabled={busy} onClick={() => onChange('')}>
            Прибрати
          </button>
        )}
      </div>
      {err && <div className="err">{err}</div>}
    </div>
  );
}

/* ---------- Картки або таблиця ---------- */
const MODE_KEY = 'oblik-view-mode';

/** Вибір зберігаємо, щоб не перемикати його щоразу заново */
export function useViewMode() {
  const [mode, setMode] = useState('cards');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === 'table' || saved === 'cards') setMode(saved);
    } catch {}
  }, []);
  const change = useCallback((m) => {
    setMode(m);
    try { localStorage.setItem(MODE_KEY, m); } catch {}
  }, []);
  return [mode, change];
}

export function ViewToggle({ mode, onChange }) {
  return (
    <div className="vtoggle" role="group" aria-label="Вигляд списку">
      <button className={mode === 'cards' ? 'on' : ''} onClick={() => onChange('cards')}>Картки</button>
      <button className={mode === 'table' ? 'on' : ''} onClick={() => onChange('table')}>Таблиця</button>
    </div>
  );
}

/**
 * Обгортка широкої таблиці. Підказку показуємо не «про всяк випадок», а лише
 * коли стовпчики справді не вміщаються: інакше вона брехала б на вузьких
 * таблицях, які й так видно цілком.
 */
export function TableWrap({ children }) {
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
      <div className="table-wrap" ref={ref}>{children}</div>
    </>
  );
}

/** Щільна таблиця: колонки задає той, хто її викликає */
export function DataTable({ columns, rows, onPick, pickLabel = 'Картка' }) {
  return (
    <TableWrap>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key} className={c.cls}>{c.title}</th>)}
            {onPick && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} onClick={onPick ? () => onPick(r.item) : undefined}>
              {columns.map((c) => {
                const v = c.render(r.item);
                return (
                  <td
                    key={c.key}
                    className={c.cls}
                    style={c.style?.(r.item)}
                    // клітинка в один рядок, тож довге значення видно у підказці
                    title={typeof v === 'string' || typeof v === 'number' ? String(v) : undefined}
                  >
                    {v}
                  </td>
                );
              })}
              {onPick && (
                <td className="col-act">
                  <button className="act-btn" onClick={(e) => { e.stopPropagation(); onPick(r.item); }}>
                    {pickLabel}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

/* ---------- Підсумковий рядок ---------- */
/**
 * Числа під фільтрами: скільки видно зараз і скільки всього.
 * parts — [['Позицій', 12], ['Залишок', 40]]; порожні значення пропускаються.
 */
export function Totals({ parts, of }) {
  const shown = parts.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!shown.length) return null;
  return (
    <div className="totals">
      {shown.map(([label, value], i) => (
        <span key={label}>
          {i > 0 && <span className="totals-sep">·</span>}
          {label}: <b>{value}</b>
        </span>
      ))}
      {of !== undefined && of !== null && <span className="totals-of">(з {of})</span>}
    </div>
  );
}

/** Скільки записів у кожному статусі — рахуємо лише те, що зараз показано */
export function countBy(list, pick) {
  const map = new Map();
  list.forEach((it) => {
    const v = (pick(it) || '').toString().trim();
    if (!v) return;
    map.set(v, (map.get(v) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

/* ---------- Поле «вибери наявне або впиши нове» ---------- */
/** Показує вже вживані значення, але не заважає ввести своє — нове стає варіантом наступного разу */
export function Combo({ value, options = [], onChange, placeholder, className = '', autoFocus }) {
  const [open, setOpen] = useState(false);
  const q = (value || '').trim().toLowerCase();
  const hits = options.filter((o) => !q || o.toLowerCase().includes(q)).slice(0, 10);
  const isNew = !!q && !options.some((o) => o.toLowerCase() === q);

  return (
    <div className="pick">
      <input
        type="text"
        className={className}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        // Escape має ховати підказки, а не закривати всю форму
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}
      />
      {open && (hits.length > 0 || isNew) && (
        <div className="pick-list">
          {isNew && <div className="pick-opt pick-fresh">Створити «{value.trim()}»</div>}
          {hits.map((o) => (
            <div
              className="pick-opt"
              key={o}
              onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false); }}
            >
              <span className="pick-title">{o}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Поле пошуку: живий пошук + кнопка очищення ---------- */
export function SearchBox({ value, onChange, placeholder, autoFocus }) {
  const ref = useRef(null);

  // Ctrl/Cmd+F або «/» — фокус у пошук
  useEffect(() => {
    const onKey = (e) => {
      const hot = (e.key === 'f' && (e.ctrlKey || e.metaKey)) ||
        (e.key === '/' && !e.ctrlKey && !e.metaKey && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName));
      if (!hot) return;
      if (document.querySelector('.overlay')) return;
      e.preventDefault();
      ref.current?.focus();
      ref.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="search-wrap">
      <span className="search-icon"><IconSearch /></span>
      <input
        ref={ref}
        type="text"
        className="search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          if (value) onChange('');
          else e.target.blur();
        }}
        autoFocus={autoFocus}
      />
      {value && (
        <button
          type="button"
          className="search-clear"
          onClick={() => { onChange(''); ref.current?.focus(); }}
          aria-label="Очистити пошук"
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Ctrl/Cmd+N — створити запис у поточній вкладці */
/**
 * Поле, що росте під текст.
 *
 * `rows` у textarea — це висота на початку, а не «скільки видно». Примітка
 * на два рядки лишалась обрізаною посеред слова: підсвітити її ми
 * підсвітили, а прочитати однаково не можна.
 *
 * Сучасні браузери вміють це самі (`field-sizing: content` у стилях), але
 * не всі й не скрізь, а сторінку відкривають із того телефона, який є.
 * Тому висоту доганяємо й руками — це кілька рядків, зате однаково всюди.
 */
export const useGrow = () => {
  const fit = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  return {
    ref: (el) => fit(el),
    onInput: (e) => fit(e.target),
  };
};

export function useNewRecordHotkey(open) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'n' || !(e.ctrlKey || e.metaKey)) return;
      if (document.querySelector('.overlay')) return;
      e.preventDefault();
      open();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
}
