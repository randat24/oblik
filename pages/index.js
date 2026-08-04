import {
  useState, useEffect, useCallback, useRef, useContext, createContext,
} from 'react';
import {
  enqueue, cacheGet, cachePut, startOffline, flushQueue, onOfflineChange, getState, takeDropped,
} from '../lib/offline';

// Сесія добігає кінця сама, тож будь-який запит може повернути 401.
// Тоді показуємо екран входу, а не незрозумілу помилку посеред роботи.
let onUnauthed = null;

const api = async (url, opts = {}) => {
  const method = (opts.method || 'GET').toUpperCase();
  let res;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (netErr) {
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
function saveFailed(toast, e, prefix = 'Не вдалося зберегти: ') {
  if (e?.offline) toast(e.message, { type: 'warn' });
  else toast(prefix + (e?.message || ''), { type: 'err' });
}

/** Час завершення сесії у звичному вигляді */
function hhmm(ms) {
  if (!ms) return '';
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ms));
}

const VERSION = 'v2.0';
// Vercel сам підставляє це під час збірки — видно, який код зараз живий
const BUILD = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);

/** Сьогоднішня дата у форматі, який використовує таблиця */
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/* Векторні іконки — емодзі виглядають по-різному в кожній системі */
const IconSearch = ({ size = 15 }) => (
  <svg className="ico" viewBox="0 0 16 16" width={size} height={size} fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
    <circle cx="6.8" cy="6.8" r="4.6" />
    <path d="M10.3 10.3 14 14" />
  </svg>
);

function statusColor(s) {
  const v = (s || '').toLowerCase();
  if (v.includes('видан') || v.includes('выдан')) return 'var(--green)';
  if (v.includes('втрач') || v.includes('утер')) return 'var(--red)';
  if (v.includes('ксп') || v.includes('склад')) return 'var(--blue)';
  if (v.includes('спис')) return 'var(--gray)';
  return 'var(--amber)';
}

/** Зовнішнє посилання лишаємо як є, приватне фото віддає наш маршрут */
function photoSrc(v) {
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : '/api/photo?p=' + encodeURIComponent(v);
}

/* ---------- Сповіщення ---------- */
const ToastCtx = createContext(() => {});
const useToast = () => useContext(ToastCtx);

function ToastHost({ toasts, onClose }) {
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

function useToasts() {
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

/* ---------- Логін ---------- */
function Login({ onOk, callsigns = [], expired = false, lastCallsign = '' }) {
  // поки нікого не заведено, лишається тільки спільний пароль
  const [mode, setMode] = useState(callsigns.length ? 'pin' : 'pw');
  const [callsign, setCallsign] = useState(
    callsigns.includes(lastCallsign) ? lastCallsign : callsigns[0] || ''
  );
  const [pin, setPin] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const body = mode === 'pin' ? { callsign, pin } : { password: pw };
      const d = await api('/api/login', { method: 'POST', body });
      onOk(d);
    } catch (e) {
      setErr(e.message || 'Не вдалося увійти');
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-box">
        <h1 style={{ fontSize: '1.1rem', marginBottom: 18 }}>Облік майна</h1>

        {expired && (
          <div className="login-note">
            Сесія завершилась — так налаштовано: кожні 4 години о 00:00, 04:00,
            08:00 і далі потрібно ввести PIN знову.
          </div>
        )}

        {mode === 'pin' ? (
          <>
            <label>Позивний</label>
            <select value={callsign} onChange={(e) => setCallsign(e.target.value)}>
              {callsigns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ marginTop: 12 }}>
              <label>PIN</label>
              <input
                type="password" inputMode="numeric" autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                style={{ width: '100%' }}
                autoFocus
              />
            </div>
          </>
        ) : (
          <>
            <label>Спільний пароль</label>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              style={{ width: '100%' }}
              autoFocus
            />
          </>
        )}

        <button className="btn" style={{ width: '100%', marginTop: 16 }} onClick={submit} disabled={busy}>
          {busy ? '...' : 'Увійти'}
        </button>
        {err && <div className="err">{err}</div>}

        {callsigns.length > 0 && (
          <button
            className="login-alt"
            onClick={() => { setMode(mode === 'pin' ? 'pw' : 'pin'); setErr(''); }}
          >
            {mode === 'pin' ? 'Увійти спільним паролем' : 'Увійти за позивним'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Нижня навігація для телефона ---------- */
const IconHome = ({ size = 20 }) => (
  <svg className="ico" viewBox="0 0 20 20" width={size} height={size} fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-3v-5H7v5H4a1 1 0 0 1-1-1z" />
  </svg>
);
const IconList = ({ size = 20 }) => (
  <svg className="ico" viewBox="0 0 20 20" width={size} height={size} fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <path d="M7 5h10M7 10h10M7 15h10M3.5 5h.01M3.5 10h.01M3.5 15h.01" />
  </svg>
);
const IconCheck = ({ size = 20 }) => (
  <svg className="ico" viewBox="0 0 20 20" width={size} height={size} fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 10.5 8 14l8-8.5" />
  </svg>
);

/**
 * На телефоні верхній ряд вкладок доводилося гортати й тягтися вгору.
 * Головне тримаємо внизу під великим пальцем, решта — у списку «Ще».
 */
function BottomNav({ view, sheets, onOpen, onScan, extra = [] }) {
  const [more, setMore] = useState(false);
  const is = (k) => view.kind === k;

  const items = [
    { key: 'home', label: 'Головна', icon: <IconHome />, on: is('home'), run: () => onOpen({ kind: 'home', name: null }) },
    { key: 'search', label: 'Пошук', icon: <IconSearch size={20} />, on: is('search'), run: () => onOpen({ kind: 'search', name: null }) },
    { key: 'scan', label: 'Скан', icon: <IconQr size={20} />, on: false, run: onScan, accent: true },
    { key: 'audit', label: 'Звірка', icon: <IconCheck />, on: is('audit'), run: () => onOpen({ kind: 'audit', name: null }) },
    { key: 'more', label: 'Ще', icon: <IconList />, on: ['items', 'ledger', 'stock', 'warehouse', 'log', 'people'].includes(view.kind), run: () => setMore(true) },
  ];

  return (
    <>
      <nav className="bnav">
        {items.map((it) => (
          <button key={it.key} className={'bnav-b' + (it.on ? ' on' : '') + (it.accent ? ' accent' : '')}
            onClick={it.run}>
            {it.icon}
            <span>{it.label}</span>
          </button>
        ))}
      </nav>

      {more && (
        <div className="overlay sheet-overlay" onClick={(e) => e.target === e.currentTarget && setMore(false)}>
          <div className="sheet">
            <div className="sheet-grab" />
            <div className="sheet-title">Куди перейти</div>
            <div className="sheet-list">
              {sheets.map((s) => (
                <button key={s.name}
                  className={'sheet-i' + (view.name === s.name ? ' on' : '')}
                  onClick={() => { setMore(false); onOpen({ kind: s.kind, name: s.name }); }}>
                  {s.name}
                </button>
              ))}
              {extra.map((e) => (
                <button key={e.label}
                  className={'sheet-i' + (view.kind === e.kind ? ' on' : '')}
                  onClick={() => { setMore(false); e.run(); }}>
                  {e.label}
                </button>
              ))}
            </div>
            <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={() => setMore(false)}>
              Закрити
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Сканування QR камерою ---------- */
const IconQr = ({ size = 15 }) => (
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
function parseCode(raw) {
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

function QrScanner({ title = 'Наведіть на QR-код', hint, onCode, onClose }) {
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
function Stat({ label, value, sub, tone }) {
  return (
    <div className={'stat' + (tone ? ' stat-' + tone : '')}>
      <div className="stat-v">{value}</div>
      <div className="stat-l">{label}</div>
      {sub && <div className="stat-s">{sub}</div>}
    </div>
  );
}

function HomeView({ setState, onOpen, me }) {
  const [d, setD] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setState('завантаження…');
    try {
      setD(await api('/api/dashboard'));
      setState('синхронізовано');
    } catch (e) {
      setState('помилка: ' + e.message);
      if (e.offline) toast(e.message, { type: 'warn' });
    }
  }, [setState, toast]);

  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="loading">Завантаження…</div>;

  const attention = [];
  if (d.audit.open) {
    attention.push({
      key: 'audit',
      text: `Звірка ${d.audit.open.id} триває — ${d.audit.open.scope}`,
      action: 'Продовжити',
      run: () => onOpen({ kind: 'audit', name: null }),
    });
  }
  if (d.items.lost.length) {
    attention.push({
      key: 'lost',
      tone: 'bad',
      text: `Втрачено: ${d.items.lost.length} — ${d.items.lost.slice(0, 3).map((x) => x.name).join(', ')}${d.items.lost.length > 3 ? '…' : ''}`,
      action: 'Знайти',
      run: () => onOpen({ kind: 'search', name: null, q: 'Втрачено' }),
    });
  }
  if (d.stock.unmarked) {
    attention.push({
      key: 'unmarked',
      text: `На складі Рибаківки ${d.stock.unmarked} поз. без позначки обліку`,
      action: 'Відкрити',
      run: () => onOpen(STOCK_VIEW),
    });
  }
  if (d.stock.empty.length) {
    attention.push({
      key: 'empty',
      text: `Нульовий залишок: ${d.stock.empty.map((x) => x.name).slice(0, 3).join(', ')}${d.stock.empty.length > 3 ? '…' : ''}`,
      action: 'Відкрити',
      run: () => onOpen(STOCK_VIEW),
    });
  }
  if (d.warehouse.stale.length) {
    attention.push({
      key: 'stale',
      text: `Ящиків не чіпали понад 90 днів: ${d.warehouse.stale.length}`,
      action: 'Переглянути',
      run: () => onOpen({ kind: 'warehouse', name: 'Склад' }),
    });
  }
  if (!d.audit.open) {
    attention.push({
      key: 'newaudit',
      text: d.audit.last
        ? `Остання звірка — ${d.audit.last.date}, ${d.audit.last.scope}`
        : 'Звірок ще не було',
      action: 'Почати звірку',
      run: () => onOpen({ kind: 'audit', name: null }),
    });
  }

  return (
    <>
      <div className="home-hi">
        {me ? <>Вітаю, <b>{me}</b>.</> : 'Вітаю.'} Ось що зараз на обліку.
      </div>

      <div className="stats">
        <Stat label="Усього одиниць" value={d.items.total}
          sub="радейки, ПНВ, теплаки, автомобільні, Кропива" />
        <Stat label="В наявності" value={d.items.available} tone="ok"
          sub="статус «КСП» або «Склад»" />
        <Stat label="На руках" value={d.items.issued}
          sub="статус «Видано»" />
        <Stat label="За документами" value={d.items.booked} tone="ok"
          sub="«на обліку» або тип «Учт.»" />
      </div>

      <div className="section">
        <h3 className="sec">За категоріями</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Категорія</th>
                <th className="col-num">Усього</th>
                <th className="col-num">В наявності</th>
                <th className="col-num">На руках</th>
                <th className="col-num">За док.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.items.perSheet.filter((s) => s.count > 0).map((s) => (
                <tr key={s.name} onClick={() => onOpen({ kind: 'items', name: s.name })}>
                  <td className="col-name">{s.name}</td>
                  <td className="col-num col-strong">{s.count}</td>
                  <td className="col-num" style={{ color: 'var(--green)' }}>{s.available}</td>
                  <td className="col-num">{s.issued}</td>
                  <td className="col-num" style={{ color: 'var(--amber)' }}>{s.booked}</td>
                  <td className="col-act">
                    <button className="act-btn" onClick={(e) => {
                      e.stopPropagation();
                      onOpen({ kind: 'items', name: s.name });
                    }}>Відкрити</button>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="col-name">Склад — ящики</td>
                <td className="col-num col-strong">{d.warehouse.total}</td>
                <td className="col-num">—</td>
                <td className="col-num">—</td>
                <td className="col-num">—</td>
                <td className="col-act">
                  <button className="act-btn" onClick={(e) => {
                    e.stopPropagation();
                    onOpen({ kind: 'warehouse', name: 'Склад' });
                  }}>Відкрити</button>
                </td>
              </tr>
              <tr>
                <td className="col-name">Майно Рибаківки</td>
                <td className="col-num col-strong">{d.stock.positions}</td>
                <td className="col-num" style={{ color: 'var(--green)' }}>{d.stock.remainder}</td>
                <td className="col-num">—</td>
                <td className="col-num" style={{ color: 'var(--amber)' }}>{d.stock.booked}</td>
                <td className="col-act">
                  <button className="act-btn" onClick={(e) => {
                    e.stopPropagation();
                    onOpen(STOCK_VIEW);
                  }}>Відкрити</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="totals" style={{ marginTop: 8 }}>
          <span>У «В наявності» для Рибаківки — залишок у штуках, а не кількість позицій</span>
        </div>
      </div>

      {d.items.byStatus.length > 0 && (
        <div className="section">
          <h3 className="sec">За статусами</h3>
          <div className="chips">
            {d.items.byStatus.map(([s, n]) => (
              <div className="chip" key={s} style={{ color: statusColor(s), borderColor: 'var(--line)' }}
                onClick={() => onOpen({ kind: 'search', name: null, q: s })}>
                {s} <b style={{ marginLeft: 4 }}>{n}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {attention.length > 0 && (
        <div className="section">
          <h3 className="primary">Потребує уваги<span className="count">{attention.length}</span></h3>
          <div className="attn-list">
            {attention.map((a) => (
              <div className={'attn' + (a.tone === 'bad' ? ' attn-bad' : '')} key={a.key}>
                <span className="attn-text">{a.text}</span>
                <button className="act-btn" onClick={a.run}>{a.action}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="home-cols">
        <div className="section">
          <h3 className="sec">Останні дії<span className="count">{d.log.length}</span></h3>
          {d.log.length === 0 ? (
            <div className="empty">Поки порожньо</div>
          ) : (
            <div className="log-list">
              {d.log.map((e, i) => (
                <div className="log-row" key={i}>
                  <div className="log-when">
                    <span>{e.date}</span>
                    <span className="log-time">{e.time}</span>
                  </div>
                  <div className="log-what">
                    <div className="log-head">
                      <span className={'log-action ' + actionClass(e.action)}>{e.action}</span>
                      <span className="badge">{e.sheet}</span>
                      {e.field && <span className="log-field">{e.field}</span>}
                      {e.by && <span className="log-by">{e.by}</span>}
                    </div>
                    {(e.before || e.after) && (
                      <div className="log-diff">
                        {e.before && <span className="log-before">{e.before}</span>}
                        {e.before && e.after && <span className="log-arrow">→</span>}
                        {e.after && <span className="log-after">{e.after}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="act-btn" style={{ marginTop: 8 }}
            onClick={() => onOpen({ kind: 'log', name: null })}>
            Весь журнал
          </button>
        </div>

        <div className="section">
          <h3 className="sec">Останні акти<span className="count">{d.acts.length}</span></h3>
          {d.acts.length === 0 ? (
            <div className="empty">Актів ще немає</div>
          ) : (
            <div className="log-list">
              {d.acts.map((a, i) => <ActRow key={i} act={a} onPhoto={() => {}} />)}
            </div>
          )}
          <button className="act-btn" style={{ marginTop: 8 }}
            onClick={() => onOpen({ kind: 'search', name: null })}>
            Пошук і акти
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------- Офлайн ---------- */
function OfflineBar() {
  const [st, setSt] = useState({ online: true, pending: 0, syncing: false });
  const [bad, setBad] = useState([]);
  const toast = useToast();

  useEffect(() => {
    setSt(getState());
    const off = onOfflineChange((s) => {
      setSt(s);
      const d = takeDropped();
      if (d.length) setBad((p) => [...p, ...d]);
    });
    const stop = startOffline();
    return () => { off(); stop(); };
  }, []);

  // коли черга спорожніла після синхронізації — сказати про це вголос
  const wasPending = useRef(0);
  useEffect(() => {
    if (wasPending.current > 0 && st.pending === 0 && st.online) {
      toast(`Надіслано відкладені записи: ${wasPending.current}`);
    }
    wasPending.current = st.pending;
  }, [st.pending, st.online, toast]);

  if (st.online && !st.pending && !bad.length) return null;

  return (
    <div className={'offline-bar' + (st.online ? ' is-sync' : '')}>
      <span className="offline-dot" />
      <span className="offline-text">
        {!st.online && 'Немає звʼязку — працюємо офлайн'}
        {st.online && st.syncing && 'Надсилаємо відкладені записи…'}
        {st.online && !st.syncing && st.pending > 0 && 'Є відкладені записи'}
        {st.online && !st.pending && bad.length > 0 && 'Частину записів сервер не прийняв'}
      </span>
      {st.pending > 0 && <span className="offline-count">{st.pending}</span>}
      {st.online && st.pending > 0 && !st.syncing && (
        <button className="offline-act" onClick={() => flushQueue()}>Надіслати</button>
      )}
      {bad.length > 0 && (
        <button className="offline-act" onClick={() => {
          alert(bad.map((b) => `${b.method} ${b.url}\n${b.error}`).join('\n\n'));
          setBad([]);
        }}>
          Показати {bad.length}
        </button>
      )}
    </div>
  );
}

/* ---------- Звірка ---------- */
const RESULT = { ok: 'Є', missing: 'Немає', diff: 'Розбіжність' };

function AuditView({ setState }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [onlyLeft, setOnlyLeft] = useState(true);
  const [marks, setMarks] = useState({}); // ключ рядка → { result, fact }
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [scan, setScan] = useState(false);
  const toast = useToast();

  // позначки летять пачками: на обході їх сотні, а квота на записи не безмежна
  const queue = useRef([]);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setState('завантаження…');
    try {
      const d = await api('/api/audit');
      setData(d);
      const seen = {};
      (d.lines || []).forEach((l) => {
        seen[`${l.sheet}#${l.row}`] = { result: l.result, fact: l.fact };
      });
      setMarks(seen);
      setState('синхронізовано');
    } catch (e) {
      setState('помилка: ' + e.message);
    }
  }, [setState]);

  useEffect(() => { load(); }, [load]);

  const flush = useCallback(async () => {
    const lines = queue.current;
    if (!lines.length) return;
    queue.current = [];
    try {
      await api('/api/audit', { method: 'POST', body: { action: 'tick', lines } });
      setState('синхронізовано');
    } catch (e) {
      // не втрачаємо позначки: повертаємо в чергу й спробуємо ще раз
      queue.current = [...lines, ...queue.current];
      setState('не збережено — спробуємо ще раз');
    }
  }, [setState]);

  // не лишаємо непослані позначки, коли вкладку закривають
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  if (!data) return <div className="loading">Завантаження…</div>;

  const mark = (item, result, fact = '') => {
    const key = `${item.sheet}#${item.row}`;
    setMarks((p) => ({ ...p, [key]: { result, fact } }));
    setState('запис…');
    queue.current.push({
      sheet: item.sheet, row: item.row, name: item.name, ident: item.ident,
      expected: item.expected, fact, result,
    });
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1200);
  };

  /* --- немає відкритої звірки --- */
  if (!data.open) {
    return (
      <>
        <div className="toolbar">
          <div className="spacer" />
          <button className="btn btn-accept" onClick={() => setStarting(true)}>Почати звірку</button>
        </div>

        <div className="empty-note">
          Звірка — це фіксація того, що річ бачили на власні очі. Обираєте обсяг,
          обходите й позначаєте кожну позицію. Позначки зберігаються одразу, тож
          телефон можна закрити й повернутися пізніше.
        </div>

        {data.audits.length === 0 ? (
          <div className="empty">Звірок ще не було.</div>
        ) : (
          <div className="log-list">
            {data.audits.slice().reverse().map((a) => (
              <div className="log-row" key={a.id}>
                <div className="log-when">
                  <span>{a.date}</span>
                  <span className="log-time">{a.time}</span>
                </div>
                <div className="log-what">
                  <div className="log-head">
                    <span className="id-badge">{a.id}</span>
                    <span className="badge">{a.scope}</span>
                    <span className={'log-action ' + (a.status === 'Завершено' ? 'log-add' : 'log-del')}>
                      {a.status}
                    </span>
                    {a.who && <span className="log-by">{a.who}</span>}
                  </div>
                  <div className="audit-nums">
                    <span>Очікувано: <b>{a.expected}</b></span>
                    <span className="a-ok">Є: <b>{a.ok}</b></span>
                    <span className="a-miss">Немає: <b>{a.missing}</b></span>
                    {a.diff > 0 && <span className="a-diff">Розбіжності: <b>{a.diff}</b></span>}
                  </div>
                  {a.note && <div className="act-note">{a.note}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {starting && (
          <StartAuditModal
            scopes={data.scopes}
            onCancel={() => setStarting(false)}
            onSave={async (scope) => {
              await api('/api/audit', { method: 'POST', body: { action: 'start', scope } });
              setStarting(false);
              toast('Звірку розпочато');
              load();
            }}
          />
        )}
      </>
    );
  }

  /* --- обхід --- */
  const expected = data.expected || [];
  const done = expected.filter((it) => marks[`${it.sheet}#${it.row}`]).length;
  const pct = expected.length ? Math.round((done / expected.length) * 100) : 0;

  let list = expected;
  if (onlyLeft) list = list.filter((it) => !marks[`${it.sheet}#${it.row}`]);
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    list = list.filter((it) => [it.name, it.ident, it.hint].join(' ').toLowerCase().includes(s));
  }

  const counts = {
    ok: Object.values(marks).filter((m) => m.result === RESULT.ok).length,
    missing: Object.values(marks).filter((m) => m.result === RESULT.missing).length,
    diff: Object.values(marks).filter((m) => m.result === RESULT.diff).length,
  };

  return (
    <>
      <div className="audit-bar">
        <div className="audit-bar-top">
          <span className="id-badge">{data.open.id}</span>
          <span className="badge">{data.open.scope}</span>
          <span className="audit-progress">{done} з {expected.length}</span>
          <button className="act-btn scan-btn" onClick={() => setScan(true)} title="Сканувати QR">
            <IconQr /> Сканувати
          </button>
          <button className="act-btn act-accept" onClick={() => setFinishing(true)}>Завершити</button>
        </div>
        <div className="audit-track"><div className="audit-fill" style={{ width: pct + '%' }} /></div>
        <div className="audit-nums">
          <span className="a-ok">Є: <b>{counts.ok}</b></span>
          <span className="a-miss">Немає: <b>{counts.missing}</b></span>
          {counts.diff > 0 && <span className="a-diff">Розбіжності: <b>{counts.diff}</b></span>}
        </div>
      </div>

      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Знайти позицію: назва, номер, S/N..." />
        <div className="spacer" />
        <div className={'chip' + (onlyLeft ? ' on' : '')} onClick={() => setOnlyLeft(!onlyLeft)}>
          {onlyLeft ? 'Тільки неперевірені' : 'Показувати всі'}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          {done === expected.length
            ? 'Усе перевірено. Натисніть «Завершити».'
            : 'Нічого не знайдено'}
        </div>
      ) : (
        <div className="audit-list">
          {list.map((it) => {
            const m = marks[`${it.sheet}#${it.row}`];
            return (
              <div className={'audit-item' + (m ? ' marked' : '')} key={it.sheet + it.row}>
                <div className="audit-what">
                  <div className="audit-name">{it.name || '—'}</div>
                  <div className="audit-meta">
                    {it.ident && <span className="audit-ident">{it.ident}</span>}
                    {it.hint && <span>{it.hint}</span>}
                    {it.kind === 'qty' && <span>має бути: <b>{it.expected}</b></span>}
                  </div>
                </div>
                {it.kind === 'qty' ? (
                  <div className="audit-qty">
                    <input
                      type="number" inputMode="decimal" step="any"
                      placeholder="факт"
                      defaultValue={m?.fact ?? ''}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v === '') return;
                        mark(it, Number(v) === Number(it.expected) ? RESULT.ok : RESULT.diff, v);
                      }}
                    />
                    <button className="act-btn act-del" onClick={() => mark(it, RESULT.missing, '0')}>
                      Немає
                    </button>
                  </div>
                ) : (
                  <div className="audit-btns">
                    <button
                      className={'act-btn act-accept' + (m?.result === RESULT.ok ? ' on' : '')}
                      onClick={() => mark(it, RESULT.ok)}
                    >
                      Є
                    </button>
                    <button
                      className={'act-btn act-del' + (m?.result === RESULT.missing ? ' on' : '')}
                      onClick={() => mark(it, RESULT.missing)}
                    >
                      Немає
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {scan && (
        <QrScanner
          title="Наведіть на QR або код речі"
          hint="Знайдену позицію одразу позначимо «Є»"
          onClose={() => setScan(false)}
          onCode={(text) => {
            setScan(false);
            const c = parseCode(text);
            const needle = (c?.value || '').toString().trim().toLowerCase();
            if (!needle) return;
            // шукаємо серед того, що входить у цю звірку
            const hit = expected.find((it) =>
              [it.ident, it.name].some((v) => (v || '').toString().toLowerCase().includes(needle))
              || (it.ident || '').toString().toLowerCase().split(' · ').includes(needle));
            if (!hit) {
              toast(`«${c.value}» немає серед позицій цієї звірки`, { type: 'warn' });
              return;
            }
            mark(hit, RESULT.ok);
            toast(`Є: ${hit.name || hit.ident}`);
          }}
        />
      )}

      {finishing && (
        <FinishAuditModal
          counts={counts}
          total={expected.length}
          done={done}
          onCancel={() => setFinishing(false)}
          onSave={async ({ note, cancel }) => {
            await flush();
            const d = await api('/api/audit', {
              method: 'POST',
              body: { action: cancel ? 'cancel' : 'finish', note },
            });
            setFinishing(false);
            toast(cancel ? 'Звірку скасовано' : `Звірку завершено: є ${d.summary.ok}, немає ${d.summary.missing}`);
            load();
          }}
        />
      )}
    </>
  );
}

function StartAuditModal({ scopes, onCancel, onSave }) {
  const [scope, setScope] = useState(scopes[0] || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  return (
    <Modal
      title="Почати звірку"
      saveLabel="Почати"
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        setBusy(true);
        setErr('');
        try {
          await onSave(scope);
        } catch (e) {
          setErr(e.message || 'Не вдалося почати');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div style={{ marginTop: 10 }}>
        <label>Що перевіряємо</label>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          {scopes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="act-hint">
        Одночасно може тривати лише одна звірка — щоб дві людини не рахували
        те саме й не перебивали одне одному результат.
      </div>
    </Modal>
  );
}

function FinishAuditModal({ counts, total, done, onCancel, onSave }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const left = total - done;

  return (
    <Modal
      title="Завершити звірку"
      saveLabel="Завершити"
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        setBusy(true);
        setErr('');
        try {
          await onSave({ note });
        } catch (e) {
          setErr(e.message || 'Не вдалося завершити');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="ledger-stats" style={{ marginBottom: 4 }}>
        <span>Є: {counts.ok}</span>
        <span>Немає: {counts.missing}</span>
        <span>Розбіжності: {counts.diff}</span>
      </div>
      {left > 0 && (
        <div className="err" style={{ marginTop: 10 }}>
          Не перевірено ще {left} — вони не потраплять у підсумок як підтверджені.
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <label>Примітка до звірки</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="що з'ясувалося, куди дивитись далі" />
      </div>
      <div className="act-hint">
        Результат лишиться в листі «Звірки», а кожна позначка — у «Звірка позицій».
      </div>
    </Modal>
  );
}

/* ---------- Хто працює із застосунком ---------- */
function PeopleView({ setState }) {
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const [pinFor, setPinFor] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setState('завантаження…');
    try {
      setData(await api('/api/people'));
      setState('синхронізовано');
    } catch (e) {
      setState('помилка: ' + e.message);
    }
  }, [setState]);

  useEffect(() => { load(); }, [load]);
  if (!data) return <div className="loading">Завантаження…</div>;

  const patch = async (row, body, okText) => {
    try {
      const d = await api('/api/people', { method: 'PATCH', body: { row, ...body } });
      setData((p) => ({ ...p, people: d.people }));
      toast(okText);
    } catch (e) {
      toast(e.message, { type: 'err' });
    }
  };

  return (
    <>
      <div className="toolbar">
        <div className="spacer" />
        <button className="btn" onClick={() => setAdding(true)}>+ Додати людину</button>
      </div>

      <Totals parts={[
        ['Людей', data.people.length],
        ...countBy(data.people, (p) => (p.active ? 'активні' : 'вимкнені')),
      ]} />

      <div className="empty-note">
        Кожен заходить своїм позивним і PIN — тоді в журналі видно, хто саме
        вніс зміну. PIN зберігається як відбиток, тож із таблиці його не прочитати.
      </div>

      {data.people.length === 0 ? (
        <div className="empty">Ще нікого не заведено. Натисніть «Додати людину».</div>
      ) : (
        <div className="grid">
          {data.people.map((p) => (
            <div className={'card' + (p.active ? '' : ' card-off')} key={p.row}>
              <div className="card-head">
                <div className="card-title">
                  <div className="title-line">
                    <span className="id-badge">{p.role === 'admin' ? 'адмін' : 'облік'}</span>
                    <span className="big">{p.callsign}</span>
                  </div>
                </div>
                <span className="pill" style={{ color: p.active ? 'var(--green)' : 'var(--gray)' }}>
                  {p.active ? 'Активний' : 'Вимкнений'}
                </span>
              </div>
              <div className="card-body">
                <div className="drow">
                  <span className="drow-k">PIN</span>
                  <span className="drow-v stock-ro">{p.hasPin ? 'встановлено' : '— не заданий'}</span>
                </div>
                <div className="drow">
                  <span className="drow-k">Додано</span>
                  <span className="drow-v stock-ro">{p.added || '—'}</span>
                </div>
              </div>
              <div className="actions">
                <button className="act-btn" onClick={() => setPinFor(p)}>Змінити PIN</button>
                <button className="act-btn" onClick={() => patch(p.row, { role: p.role === 'admin' ? 'user' : 'admin' },
                  p.role === 'admin' ? 'Тепер користувач' : 'Тепер адміністратор')}>
                  {p.role === 'admin' ? 'Зробити користувачем' : 'Зробити адміном'}
                </button>
                <button className={'act-btn ' + (p.active ? 'act-del' : 'act-accept')}
                  onClick={() => patch(p.row, { active: !p.active }, p.active ? 'Доступ вимкнено' : 'Доступ увімкнено')}>
                  {p.active ? 'Вимкнути' : 'Увімкнути'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <PersonModal
          title="Нова людина"
          onCancel={() => setAdding(false)}
          onSave={async (body) => {
            const d = await api('/api/people', { method: 'POST', body });
            setData((p) => ({ ...p, people: d.people }));
            setAdding(false);
            toast(`Додано ${body.callsign}`);
          }}
        />
      )}

      {pinFor && (
        <PersonModal
          title={'Новий PIN: ' + pinFor.callsign}
          fixedCallsign={pinFor.callsign}
          onCancel={() => setPinFor(null)}
          onSave={async ({ pin }) => {
            await patch(pinFor.row, { pin }, 'PIN змінено');
            setPinFor(null);
          }}
        />
      )}
    </>
  );
}

function PersonModal({ title, fixedCallsign, onCancel, onSave }) {
  const [callsign, setCallsign] = useState(fixedCallsign || '');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState('user');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  return (
    <Modal
      title={title}
      saveLabel="Зберегти"
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        if (!callsign.trim()) return setErr('Вкажіть позивний');
        if (!/^\d{4,8}$/.test(pin)) return setErr('PIN — від 4 до 8 цифр');
        setBusy(true);
        setErr('');
        try {
          await onSave({ callsign: callsign.trim(), pin, role });
        } catch (e) {
          setErr(e.message || 'Не вдалося зберегти');
        } finally {
          setBusy(false);
        }
      }}
    >
      {!fixedCallsign && (
        <>
          <div style={{ marginTop: 10 }}>
            <label>Позивний</label>
            <input type="text" value={callsign} onChange={(e) => setCallsign(e.target.value)} autoFocus />
          </div>
          <div style={{ marginTop: 10 }}>
            <label>Права</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">Користувач — веде облік</option>
              <option value="admin">Адміністратор — ще й заводить людей</option>
            </select>
          </div>
        </>
      )}
      <div style={{ marginTop: 10 }}>
        <label>PIN (4–8 цифр)</label>
        <input type="password" inputMode="numeric" autoComplete="off"
          value={pin} onChange={(e) => setPin(e.target.value)} autoFocus={!!fixedCallsign} />
      </div>
      <div className="act-hint">
        PIN не зберігається — у таблиці лежить лише його відбиток. Якщо людина
        забуде PIN, задайте новий.
      </div>
    </Modal>
  );
}

/* ---------- Модальні вікна ---------- */
function Modal({ title, children, onCancel, onSave, saveLabel = 'Зберегти', busy, error }) {
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

function PhotoField({ value, onChange, showPreview = true, label = 'Фото' }) {
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

/* ---------- Командна панель ---------- */
function CommandPalette({ commands, onClose }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef(null);

  const s = q.trim().toLowerCase();
  const cmds = commands.filter((c) => !c.query);
  const searchCmd = commands.find((c) => c.query);
  const hits = s ? cmds.filter((c) => c.label.toLowerCase().includes(s)) : cmds;
  // «Шукати» йде останнім: коли назва команди збіглася, Enter має спрацювати саме на ній
  const list = s && searchCmd
    ? [...hits, { ...searchCmd, label: `Шукати: «${q.trim()}»`, run: () => searchCmd.run(q.trim()) }]
    : hits;

  useEffect(() => { setSel(0); }, [q]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(i + 1, list.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = list[sel];
        if (cmd) { cmd.run(); onClose(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [list, sel, onClose]);

  useEffect(() => {
    listRef.current?.querySelector('.cmd-opt.on')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  return (
    <div className="overlay cmd-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmd">
        <input
          type="text"
          className="cmd-input"
          placeholder="Введіть команду або назву листа..."
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="cmd-list" ref={listRef}>
          {list.length === 0 && <div className="cmd-empty">Нічого не знайдено</div>}
          {list.map((c, i) => (
            <div
              key={c.label}
              className={'cmd-opt' + (i === sel ? ' on' : '')}
              onMouseEnter={() => setSel(i)}
              onMouseDown={(e) => { e.preventDefault(); c.run(); onClose(); }}
            >
              <span>{c.label}</span>
              {c.hint && <span className="cmd-hint">{c.hint}</span>}
            </div>
          ))}
        </div>
        <div className="cmd-foot">
          <span>↑↓ навігація</span><span>Enter вибрати</span><span>Esc закрити</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Картки або таблиця ---------- */
const MODE_KEY = 'oblik-view-mode';

/** Вибір зберігаємо, щоб не перемикати його щоразу заново */
function useViewMode() {
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

function ViewToggle({ mode, onChange }) {
  return (
    <div className="vtoggle" role="group" aria-label="Вигляд списку">
      <button className={mode === 'cards' ? 'on' : ''} onClick={() => onChange('cards')}>Картки</button>
      <button className={mode === 'table' ? 'on' : ''} onClick={() => onChange('table')}>Таблиця</button>
    </div>
  );
}

/** Щільна таблиця: колонки задає той, хто її викликає */
function DataTable({ columns, rows, onPick, pickLabel = 'Картка' }) {
  return (
    <div className="table-wrap">
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
    </div>
  );
}

/* ---------- Підсумковий рядок ---------- */
/**
 * Числа під фільтрами: скільки видно зараз і скільки всього.
 * parts — [['Позицій', 12], ['Залишок', 40]]; порожні значення пропускаються.
 */
function Totals({ parts, of }) {
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
function countBy(list, pick) {
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
function Combo({ value, options = [], onChange, placeholder, className = '', autoFocus }) {
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
function SearchBox({ value, onChange, placeholder, autoFocus }) {
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
function useNewRecordHotkey(open) {
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

/* ---------- Головна ---------- */
export const STOCK_SHEET_NAME = 'Майно Рибаківки';
// стабільне посилання — інакше useEffect із цим значенням крутився б без кінця
export const STOCK_VIEW = { kind: 'stock', name: STOCK_SHEET_NAME };

/** Адреса, яку показуємо в рядку браузера для поточної вкладки */
function urlFor(view) {
  if (view.kind !== 'stock') return '/';
  return '/rybakivka' + (view.id ? '?id=' + encodeURIComponent(view.id) : '');
}

export default function Home({ startView }) {
  const [authed, setAuthed] = useState(null);
  const [me, setMe] = useState({ callsign: '', role: 'admin', callsigns: [], expires: 0 });
  const [expired, setExpired] = useState(false);
  const [sheets, setSheets] = useState([]);
  const [view, setView] = useState(startView || { kind: 'home', name: null });
  const [state, setState] = useState('');
  const [palette, setPalette] = useState(false);
  const [scan, setScan] = useState(false);
  const { toasts, push, close } = useToasts();

  // параметри адреси читаємо один раз до того, як почнемо її переписувати
  const [params] = useState(() => {
    if (typeof window === 'undefined') return {};
    const p = new URLSearchParams(window.location.search);
    return { box: p.get('box'), id: p.get('id') };
  });

  // /rybakivka?id=Р-004 — відкрити склад одразу на потрібній позиції
  useEffect(() => {
    if (startView?.kind !== 'stock' || !params.id) return;
    setView({ ...startView, id: params.id });
  }, [startView, params.id]);

  // ⌘K / Ctrl+K — командна панель
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // адреса має відповідати вкладці, щоб склад можна було надіслати посиланням
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = urlFor(view);
    if (window.location.pathname + window.location.search !== url) {
      window.history.replaceState({}, '', url);
    }
  }, [view]);

  const loadMe = useCallback(() => {
    api('/api/login')
      .then((d) => {
        setMe({
          callsign: d.callsign || '', role: d.role || 'admin',
          callsigns: d.callsigns || [], expires: d.expires || 0,
        });
        setAuthed(d.authed || !d.required);
        if (d.authed) setExpired(false);
      })
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  // будь-який запит, що впав на 401, повертає на екран входу
  useEffect(() => {
    onUnauthed = () => { setExpired(true); setAuthed(false); };
    return () => { onUnauthed = null; };
  }, []);

  // не чекаємо на перший невдалий запит: вийде саме о рівній годині
  useEffect(() => {
    if (!authed || !me.expires) return;
    const left = me.expires - Date.now();
    if (left <= 0) { setExpired(true); setAuthed(false); return; }
    const t = setTimeout(() => { setExpired(true); setAuthed(false); }, left + 500);
    return () => clearTimeout(t);
  }, [authed, me.expires]);

  useEffect(() => {
    if (!authed) return;
    api('/api/sheet')
      .then((d) => setSheets(d.sheets))
      .catch((e) => setState('помилка: ' + e.message));
  }, [authed]);

  // QR-код веде на /?box=КОД — одразу відкриваємо склад і фільтруємо на потрібний ящик
  useEffect(() => {
    if (!sheets.length || !params.box) return;
    const wh = sheets.find((s) => s.kind === 'warehouse');
    if (wh) setView({ kind: 'warehouse', name: wh.name, box: params.box });
  }, [sheets, params.box]);

  const commands = [
    { label: 'Сканувати QR', hint: 'дія', run: () => setPalette(false) || setScan(true) },
    { label: 'Головна', hint: 'екран', run: () => setView({ kind: 'home', name: null }) },
    { label: 'Пошук і акти', hint: 'екран', run: () => setView({ kind: 'search', name: null }) },
    { label: 'Прийняти майно', hint: 'дія', run: () => setView({ kind: 'search', name: null, act: 'accept' }) },
    { label: 'Видати майно', hint: 'дія', run: () => setView({ kind: 'search', name: null, act: 'issue' }) },
    ...sheets.map((s) => ({
      label: 'Відкрити лист: ' + s.name,
      hint: 'лист',
      run: () => setView({ kind: s.kind, name: s.name }),
    })),
    { label: 'Звірка', hint: 'екран', run: () => setView({ kind: 'audit', name: null }) },
    { label: 'Журнал змін', hint: 'екран', run: () => setView({ kind: 'log', name: null }) },
    // цей рядок не показується сам по собі — він стає «Шукати: …», коли є текст
    { query: true, label: 'Шукати', hint: 'пошук', run: (q) => setView({ kind: 'search', name: null, q }) },
  ];

  if (authed === null) return <div className="loading">Завантаження…</div>;
  if (!authed) {
    return (
      <Login
        callsigns={me.callsigns}
        expired={expired}
        lastCallsign={me.callsign}
        onOk={loadMe}
      />
    );
  }

  return (
    <ToastCtx.Provider value={push}>
      <div className="wrap">
        <OfflineBar />
        <header>
          <h1>Облік майна<span className="ver">{VERSION}</span></h1>
          <div className="state">
            {state}
            {BUILD && <span className="build" title="Версія збірки">{BUILD}</span>}
          </div>
          <button className="cmd-open scan-open" onClick={() => setScan(true)} title="Сканувати QR">
            <IconQr /><span className="scan-open-t">Сканувати</span>
          </button>
          <button className="cmd-open" onClick={() => setPalette(true)} title="Пошук та дії">
            Пошук та дії<kbd>⌘K</kbd>
          </button>
          <div className="who">
            <span className="who-name" title={me.role === 'admin' ? 'Адміністратор' : 'Користувач'}>
              {me.callsign || 'спільний вхід'}
            </span>
            {me.expires > 0 && (
              <span className="who-till" title="Сесія діє до цієї години, далі — знову PIN">
                до {hhmm(me.expires)}
              </span>
            )}
            <button
              className="who-out"
              title="Вийти"
              onClick={async () => {
                await api('/api/login', { method: 'DELETE' });
                setAuthed(false);
                loadMe();
              }}
            >
              вийти
            </button>
          </div>
        </header>

        <div className="tabs">
          <div
            className={'tab' + (view.kind === 'home' ? ' active' : '')}
            onClick={() => setView({ kind: 'home', name: null })}
          >
            Головна
          </div>
          <div
            className={'tab' + (view.kind === 'search' ? ' active' : '')}
            onClick={() => setView({ kind: 'search', name: null })}
          >
            Пошук
          </div>
          {sheets.map((s) => (
            <div
              key={s.name}
              className={'tab' + (view.name === s.name ? ' active' : '')}
              onClick={() => setView({ kind: s.kind, name: s.name })}
            >
              {s.name}
            </div>
          ))}
          <div
            className={'tab' + (view.kind === 'log' ? ' active' : '')}
            onClick={() => setView({ kind: 'log', name: null })}
          >
            Журнал
          </div>
          <div
            className={'tab' + (view.kind === 'audit' ? ' active' : '')}
            onClick={() => setView({ kind: 'audit', name: null })}
          >
            Звірка
          </div>
          {me.role === 'admin' && (
            <div
              className={'tab' + (view.kind === 'people' ? ' active' : '')}
              onClick={() => setView({ kind: 'people', name: null })}
            >
              Люди
            </div>
          )}
        </div>

        {view.kind === 'home' && (
          <HomeView setState={setState} onOpen={setView} me={me.callsign} />
        )}
        {view.kind === 'search' && (
          <SearchView
            key={(view.q || '') + (view.act || '')}
            setState={setState}
            onOpen={setView}
            me={me.callsign}
            initialQuery={view.q}
            autoAct={view.act}
          />
        )}
        {view.kind === 'items' && (
          <ItemsView key={view.name + ':' + (view.row || '')} name={view.name} setState={setState} focusRow={view.row} />
        )}
        {view.kind === 'ledger' && <LedgerView key={view.name} name={view.name} setState={setState} />}
        {view.kind === 'stock' && (
          <StockView
            key={view.id || ''}
            setState={setState}
            focusId={view.id}
            onClearFocus={() => setView(STOCK_VIEW)}
          />
        )}
        {view.kind === 'warehouse' && (
          <WarehouseView key={view.box || ''} setState={setState} focusCode={view.box} onOpen={setView} />
        )}
        {view.kind === 'log' && <LogView key={view.q || ''} setState={setState} initialQuery={view.q} />}
        {view.kind === 'audit' && <AuditView setState={setState} />}
        {view.kind === 'people' && me.role === 'admin' && <PeopleView setState={setState} />}
      </div>
      <BottomNav
        view={view}
        sheets={sheets}
        onOpen={setView}
        onScan={() => setScan(true)}
        extra={[
          { label: 'Журнал змін', kind: 'log', run: () => setView({ kind: 'log', name: null }) },
          ...(me.role === 'admin'
            ? [{ label: 'Люди', kind: 'people', run: () => setView({ kind: 'people', name: null }) }]
            : []),
        ]}
      />

      {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
      {scan && (
        <QrScanner
          hint="QR ящика відкриє його картку, будь-який інший код — пошук"
          onClose={() => setScan(false)}
          onCode={(text) => {
            setScan(false);
            const c = parseCode(text);
            if (!c) return;
            if (c.kind === 'box') setView({ kind: 'warehouse', name: 'Склад', box: c.value });
            else if (c.kind === 'stock') setView({ ...STOCK_VIEW, id: c.value });
            else setView({ kind: 'search', name: null, q: c.value });
          }}
        />
      )}
      <ToastHost toasts={toasts} onClose={close} />
    </ToastCtx.Provider>
  );
}

/* ---------- Пошук і акти на одній вкладці ---------- */
function SearchView({ setState, onOpen, initialQuery, autoAct, me = '' }) {
  const [q, setQ] = useState(initialQuery || '');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [meta, setMeta] = useState(null); // акти + категорії + стани
  const [act, setAct] = useState(null); // {kind, sheet?, row?}
  const [photo, setPhoto] = useState(null);
  const reqId = useRef(0);
  const toast = useToast();

  const loadMeta = useCallback(async () => {
    try {
      const m = await api('/api/act');
      setMeta(m);
      return m;
    } catch (e) {
      setState('помилка: ' + e.message);
      return null;
    }
  }, [setState]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  // «Прийняти майно» з командної панелі одразу відкриває форму
  const acted = useRef(false);
  useEffect(() => {
    if (!autoAct || acted.current || !meta) return;
    acted.current = true;
    setAct({ kind: autoAct });
  }, [autoAct, meta]);

  // без результату — порожня форма; з результатом — одразу з тією річчю
  const openAct = async (kind, r) => {
    const m = meta || (await loadMeta());
    if (!m) return;
    if (r && !m.sheets.includes(r.sheet)) {
      setState(`акт недоступний для листа «${r.sheet}»`);
      return;
    }
    setAct(r ? { kind, sheet: r.sheet, row: r.row } : { kind });
  };

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      reqId.current++;
      setRes(null);
      setBusy(false);
      setState('');
      return;
    }
    const id = ++reqId.current;
    setBusy(true);
    setState('пошук…');
    const t = setTimeout(async () => {
      try {
        const d = await api('/api/search?q=' + encodeURIComponent(query));
        if (reqId.current !== id) return;
        setRes(d);
        setState('готово');
      } catch (e) {
        if (reqId.current !== id) return;
        setState('помилка: ' + e.message);
      } finally {
        if (reqId.current === id) setBusy(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, tick, setState]);

  const groups = res
    ? [
        { title: 'Знайдено за номером', cls: 'primary', data: res.serial },
        { title: 'Рахується за', cls: 'primary', data: res.assigned },
        { title: 'Інші згадки', cls: 'sec', data: res.other },
      ].filter((g) => g.data.length)
    : [];

  // той самий рядок пошуку відсіює й акти
  const query = q.trim().toLowerCase();
  const allActs = meta?.acts || [];
  const acts = query.length >= 2
    ? allActs.filter((a) =>
        [a.titles, a.from, a.to, a.sheet, a.note, a.kind, a.condition]
          .join(' ').toLowerCase().includes(query))
    : allActs.slice(0, 20);

  // у підсумку показуємо тільки те, що справді знайшлося: нулі нічого не кажуть,
  // а от у яких листах знайшлося — саме те, що потрібно бачити одразу
  const hits = groups.flatMap((g) => g.data);
  const stockHits = res?.stock?.length || 0;
  const found = hits.length + stockHits + acts.length;
  let totalsParts = [];
  if (res) {
    // «нічого не знайдено» вже написано нижче — дублювати нулем не треба
    if (found) {
      totalsParts = [
        ['Знайдено', found],
        ...countBy(hits, (r) => r.sheet),
        ...(stockHits ? [['Склад Рибаківки', stockHits]] : []),
        ...(acts.length ? [['Акти', acts.length]] : []),
      ];
    }
  } else if (allActs.length) {
    totalsParts = [['Останні акти', acts.length]];
    if (allActs.length !== acts.length) totalsParts.push(['Усього', allActs.length]);
  }

  return (
    <>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="S/N, позивний, модель, акт, місце..." autoFocus />
        <div className="spacer" />
        <button className="btn btn-accept" onClick={() => openAct('accept')}>Прийняти</button>
        <button className="btn" onClick={() => openAct('issue')}>Видати</button>
      </div>

      <Totals parts={totalsParts} />

      {q.trim().length > 0 && q.trim().length < 2 && (
        <div className="empty">Введіть щонайменше 2 символи</div>
      )}
      {!busy && res && groups.length === 0 && acts.length === 0 && !res.stock?.length && (
        <div className="empty">Нічого не знайдено</div>
      )}

      {groups.map((g) => (
        <div className="section" key={g.title}>
          <h3 className={g.cls}>{g.title}<span className="count">{g.data.length}</span></h3>
          {g.data.map((r, i) => (
            <div className="result" key={r.sheet + r.row + i}>
              <div className="result-head">
                <span className="badge">{r.sheet}</span>
                {r.matchedValue && (
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>
                    {r.matchedValue}
                  </span>
                )}
                {r.status && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '.8rem', fontWeight: 700, color: statusColor(r.status) }}>
                    {r.status}
                  </span>
                )}
                {r.who && <span style={{ fontFamily: 'var(--mono)', fontSize: '.8rem' }}>→ {r.who}</span>}
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '.7rem', color: 'var(--muted)' }}>
                  ряд. {r.row}
                </span>
              </div>
              <div className="fields">
                {r.headers.map((h, ci) =>
                  r.values[ci] ? (
                    <span key={ci}>
                      <span className="k">{h || 'Поле ' + (ci + 1)}:</span> {r.values[ci]}
                      {'  ·  '}
                    </span>
                  ) : null
                )}
              </div>
              <div className="actions">
                <button className="act-btn act-qr" onClick={() => onOpen({ kind: 'items', name: r.sheet, row: r.row })}>
                  Відкрити лист
                </button>
                {!r.noIssue && (
                  <button className="act-btn" onClick={() => openAct('issue', r)}>Видати</button>
                )}
                <button className="act-btn act-accept" onClick={() => openAct('accept', r)}>Прийняти</button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {res?.stock?.length > 0 && (
        <div className="section">
          <h3 className="primary">Склад Рибаківки<span className="count">{res.stock.length}</span></h3>
          {res.stock.map((r) => (
            <div className="result" key={r.row}>
              <div className="result-head">
                <span className="badge">{r.category || 'без категорії'}</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>{r.id}</span>
                <span style={{ fontWeight: 600 }}>{r.name}</span>
                {r.accounting && (
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '.74rem', fontWeight: 700,
                    color: r.accounting === 'Облікове' ? 'var(--green)' : 'var(--gray)',
                  }}>
                    {r.accounting}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '.8rem', fontWeight: 700, color: r.remainder > 0 ? 'var(--green)' : 'var(--red)' }}>
                  залишок {r.remainder} {r.unit}
                </span>
              </div>
              <div className="fields">
                {r.description && <span><span className="k">Опис:</span> {r.description}{'  ·  '}</span>}
                {r.place && <span><span className="k">Місце:</span> {r.place}{'  ·  '}</span>}
                <span><span className="k">Прийнято:</span> {r.received}{'  ·  '}</span>
                <span><span className="k">Списано:</span> {r.writtenOff}</span>
              </div>
              <div className="actions">
                <button className="act-btn act-qr" onClick={() => onOpen({ ...STOCK_VIEW, id: r.id })}>
                  Відкрити на складі
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {acts.length > 0 && (
        <div className="section">
          <h3 className="sec">
            {query.length >= 2 ? 'Акти' : 'Останні акти'}
            <span className="count">{acts.length}</span>
          </h3>
          <div className="log-list">
            {acts.map((a, i) => <ActRow key={i} act={a} onPhoto={setPhoto} />)}
          </div>
        </div>
      )}

      {!res && allActs.length === 0 && meta && (
        <div className="empty">
          Знайдіть річ у пошуку або натисніть «Прийняти», щоб оформити перший акт.
        </div>
      )}

      {photo && <PhotoLightbox act={photo} onClose={() => setPhoto(null)} />}

      {act && meta && (
        <ActModal
          kind={act.kind}
          sheets={meta.sheets}
          conditions={meta.conditions}
          initialSheet={act.sheet}
          bindRow={act.row}
          me={me}
          onCancel={() => setAct(null)}
          onSave={async (body) => {
            const d = await api('/api/act', { method: 'POST', body: { ...body, kind: act.kind } });
            setAct(null);
            toast(`${act.kind === 'accept' ? 'Прийнято' : 'Видано'}: ${d.count} поз.`);
            setTick((t) => t + 1);
            loadMeta();
          }}
        />
      )}
    </>
  );
}

/** Рядок акта — і в списку останніх, і в результатах пошуку */
function ActRow({ act: a, onPhoto }) {
  return (
    <div className="log-row act-row">
      <div className="log-when">
        <span>{a.date}</span>
        <span className="log-time">{a.time}</span>
      </div>
      <div className="log-what">
        <div className="log-head">
          <span className={'log-action ' + (a.kind === 'Прийнято' ? 'log-add' : 'log-writeoff')}>
            {a.kind}
          </span>
          <span className="badge">{a.sheet}</span>
          <span className="log-target">{a.count} поз.</span>
          {a.condition && <span className="log-field">{a.condition}</span>}
        </div>
        <div className="act-titles">{a.titles}</div>
        <div className="act-people">
          <span>{a.from}</span>
          <span className="log-arrow">→</span>
          <span>{a.to}</span>
          {a.note && <span className="act-note">{a.note}</span>}
        </div>
      </div>
      {a.photo && (
        <img className="act-photo" src={photoSrc(a.photo)} alt=""
          onClick={() => onPhoto(a)} title="Натисніть, щоб збільшити" />
      )}
    </div>
  );
}

function PhotoLightbox({ act, onClose }) {
  return (
    <div className="overlay" style={{ background: 'rgba(0,0,0,.92)' }} onClick={onClose}>
      <div style={{ textAlign: 'center' }}>
        <img src={photoSrc(act.photo)} alt=""
          style={{ maxWidth: '96vw', maxHeight: '80vh', objectFit: 'contain' }} />
        <div style={{ fontFamily: 'var(--mono)', marginTop: 12 }}>{act.kind}: {act.titles}</div>
        <button className="btn" style={{ marginTop: 12 }} onClick={onClose}>Закрити</button>
      </div>
    </div>
  );
}

/* ---------- Звичайні листи ---------- */
/** Колонки, що йдуть у тіло картки: без назви, номера, серійника й статусу — вони вже в шапці */
function bodyCols(headers, cols, snIdx, idIdx, tagCols = []) {
  const skip = new Set([0, snIdx, idIdx, cols.status, ...tagCols].filter((i) => i >= 0));
  return headers.map((_, i) => i).filter((i) => !skip.has(i));
}

/** Колонка «Оф облік»: числиться річ за документами чи ні */
function accountingCol(headers) {
  return headers.findIndex((h) => {
    const s = (h || '').toString().toLowerCase();
    return s.includes('облік') && !s.includes('не облік');
  });
}

/**
 * Короткі теги під назвою замість окремих рядків. Однакові значення
 * показуємо один раз: «Де: КСП» поруч зі статусом «КСП» нічого не додає.
 */
function headTags(values, cols, accIdx) {
  const out = [];
  const seen = new Set([(values[cols.status] || '').toString().trim().toLowerCase()]);
  const add = (text, cls) => {
    const v = (text || '').toString().trim();
    const key = v.toLowerCase();
    if (!v || seen.has(key)) return;
    seen.add(key);
    out.push({ v, cls });
  };
  add(values[accIdx], 'tag-acc');
  add(cols.type >= 0 ? values[cols.type] : '', 'tag-type');
  add(cols.where > 0 ? values[cols.where] : '', 'tag-where');
  return out;
}

/** Плавно підводить до потрібного рядка після перемикання на картки */
function scrollToRow(row) {
  setTimeout(() => {
    document.getElementById('item-row-' + row)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 60);
}

function ItemsView({ name, setState, focusRow }) {
  const [data, setData] = useState(null);
  const [chip, setChip] = useState(null);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [issuing, setIssuing] = useState(null);
  const [highlightRow, setHighlightRow] = useState(focusRow || null);
  const [mode, setMode] = useViewMode();
  const toast = useToast();

  useNewRecordHotkey(useCallback(() => setAdding(true), []));

  const load = useCallback(async () => {
    setState('завантаження…');
    try {
      const d = await api('/api/sheet?name=' + encodeURIComponent(name));
      setData(d);
      setState('синхронізовано');
    } catch (e) {
      setState('помилка: ' + e.message);
    }
  }, [name, setState]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data || !focusRow) return;
    setHighlightRow(focusRow);
    const t = setTimeout(() => {
      document.getElementById('item-row-' + focusRow)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    const clear = setTimeout(() => setHighlightRow(null), 2500);
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [data, focusRow]);

  if (!data) return <div className="loading">Завантаження…</div>;

  const { headers, items, cols, statusOptions, typeOptions, maskCols, noIssue, hideStatus } = data;
  // у шапці картки: власний номер речі бейджем, назва, серійник виробника під нею
  const idIdx = cols.id >= 0 && cols.id !== 0 ? cols.id : -1;
  const snIdx = cols.snCols?.find((i) => i !== 0 && i !== idIdx) ?? -1;
  // облік, тип і місце йдуть тегами під назвою, а не окремими рядками
  const accIdx = accountingCol(headers);
  const tagCols = [accIdx, cols.type, cols.where > 0 ? cols.where : -1];

  const save = async (row, colIdx, value, prev) => {
    setState('збереження…');
    try {
      await api('/api/item', { method: 'PATCH', body: { sheet: name, row, col: colIdx, value, prev } });
      setState('синхронізовано');
      toast('Збережено');
    } catch (e) {
      setState('помилка збереження');
      saveFailed(toast, e);
    }
  };

  let list = items;
  if (chip !== null && cols.status >= 0) list = list.filter((it) => it.values[cols.status] === chip);
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    list = list.filter((it) => it.values.join(' ').toLowerCase().includes(s));
  }

  return (
    <>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Пошук..." />
        {!hideStatus && statusOptions.map((s) => (
          <div key={s} className={'chip' + (chip === s ? ' on' : '')} onClick={() => setChip(chip === s ? null : s)}>
            {s}
          </div>
        ))}
        <div className="spacer" />
        <ViewToggle mode={mode} onChange={setMode} />
        <button className="btn" onClick={() => setAdding(true)}>+ Додати запис</button>
      </div>

      <Totals
        parts={[
          ['Записів', list.length],
          ...(hideStatus || cols.status < 0
            ? []
            : countBy(list, (it) => it.values[cols.status])),
        ]}
        of={list.length !== items.length ? items.length : undefined}
      />

      {list.length === 0 ? (
        <div className="empty">Немає записів</div>
      ) : mode === 'table' ? (
        <DataTable
          columns={headers.map((h, ci) => ({
            key: ci,
            title: h || 'Поле ' + (ci + 1),
            cls: ci === cols.status ? 'col-status' : ci === idIdx || ci === snIdx ? 'col-mono' : '',
            style: ci === cols.status ? (it) => ({ color: statusColor(it.values[ci]) }) : undefined,
            render: (it) => (maskCols?.includes(ci) && it.values[ci] ? '••••••' : it.values[ci]) || '—',
          }))}
          rows={list.map((it) => ({ key: it.row, item: it }))}
          onPick={(it) => { setMode('cards'); setHighlightRow(it.row); scrollToRow(it.row); }}
        />
      ) : (
        <div className="grid">
          {list.map((it) => (
            <div className={'card' + (it.row === highlightRow ? ' highlight' : '')} key={it.row} id={'item-row-' + it.row}>
              <div className="card-head">
                <div className="card-title">
                  <div className="title-line">
                    {idIdx >= 0 ? (
                      <input
                        className="id-badge"
                        type="text"
                        defaultValue={it.values[idIdx]}
                        title={headers[idIdx] || 'Номер'}
                        size={Math.max(2, String(it.values[idIdx] || '').length)}
                        onBlur={(e) => e.target.value !== it.values[idIdx] && save(it.row, idIdx, e.target.value, it.values[idIdx])}
                      />
                    ) : (
                      <span className="id-badge" title={'Рядок у таблиці: ' + it.row}>{it.row}</span>
                    )}
                    <input
                      className="ghost big"
                      type="text"
                      defaultValue={it.values[0]}
                      placeholder={headers[0] || 'Назва'}
                      onBlur={(e) => e.target.value !== it.values[0] && save(it.row, 0, e.target.value, it.values[0])}
                    />
                  </div>
                  {snIdx >= 0 && (
                    <input
                      className="ghost mono card-sn"
                      type="text"
                      defaultValue={it.values[snIdx]}
                      placeholder={headers[snIdx] || 'S/N'}
                      onBlur={(e) => e.target.value !== it.values[snIdx] && save(it.row, snIdx, e.target.value, it.values[snIdx])}
                    />
                  )}
                </div>
                {!hideStatus && cols.status >= 0 && (
                  <select
                    className="pill"
                    style={{ color: statusColor(it.values[cols.status]) }}
                    defaultValue={it.values[cols.status]}
                    onChange={(e) => save(it.row, cols.status, e.target.value, it.values[cols.status])}
                  >
                    {!statusOptions.includes(it.values[cols.status]) && it.values[cols.status] && (
                      <option value={it.values[cols.status]}>{it.values[cols.status]}</option>
                    )}
                    {statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
              </div>

              {headTags(it.values, cols, accIdx).length > 0 && (
                <div className="card-tags">
                  {headTags(it.values, cols, accIdx).map((t) => (
                    <span className={'tag ' + t.cls} key={t.v}>{t.v}</span>
                  ))}
                </div>
              )}

              <div className="card-body">
                {bodyCols(headers, cols, snIdx, idIdx, tagCols).map((ci) => (
                  <div className="drow" key={ci}>
                    <span className="drow-k">{headers[ci] || 'Поле ' + (ci + 1)}</span>
                    <span className="drow-v">
                      {ci === cols.type ? (
                        <select
                          className="ghost"
                          defaultValue={it.values[ci]}
                          onChange={(e) => save(it.row, ci, e.target.value, it.values[ci])}
                        >
                          <option value=""></option>
                          {!typeOptions.includes(it.values[ci]) && it.values[ci] && (
                            <option value={it.values[ci]}>{it.values[ci]}</option>
                          )}
                          {typeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          className="ghost"
                          type={maskCols?.includes(ci) ? 'password' : 'text'}
                          defaultValue={it.values[ci]}
                          placeholder="—"
                          onBlur={(e) => e.target.value !== it.values[ci] && save(it.row, ci, e.target.value, it.values[ci])}
                        />
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <div className="actions">
                {!noIssue && (
                  <>
                    <button className="act-btn act-issue" onClick={() => setIssuing(it)}>Видати</button>
                    <button
                      className="act-btn act-return"
                      onClick={async () => {
                        if (!confirm('Прийняти на КСП? Отримувача буде очищено.')) return;
                        setState('збереження…');
                        try {
                          await api('/api/item', { method: 'POST', body: { sheet: name, action: 'return', row: it.row } });
                          toast('Прийнято на КСП');
                          load();
                        } catch (e) {
                          setState('помилка: ' + e.message);
                          toast('Не вдалося прийняти: ' + e.message, { type: 'err' });
                        }
                      }}
                    >
                      Прийняти
                    </button>
                  </>
                )}
                <button
                  className="act-btn act-del"
                  onClick={async () => {
                    if (!confirm(`Видалити запис (рядок ${it.row})?`)) return;
                    setState('видалення…');
                    try {
                      const d = await api('/api/item', { method: 'DELETE', body: { sheet: name, row: it.row } });
                      load();
                      toast(`Видалено рядок ${it.row}`, {
                        type: 'warn',
                        action: {
                          label: 'Повернути',
                          run: async () => {
                            try {
                              await api('/api/item', {
                                method: 'POST',
                                body: { sheet: name, action: 'restore', row: it.row, values: d.deleted },
                              });
                              toast('Запис повернено');
                              load();
                            } catch (e) {
                              saveFailed(toast, e, 'Не вдалося повернути: ');
                            }
                          },
                        },
                      });
                    } catch (e) {
                      setState('помилка: ' + e.message);
                      saveFailed(toast, e, 'Не вдалося видалити: ');
                    }
                  }}
                >
                  Видалити
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddItemModal
          headers={headers}
          cols={cols}
          idIdx={idIdx}
          snIdx={snIdx}
          suggestions={data.suggestions}
          statusOptions={statusOptions}
          typeOptions={typeOptions}
          hideStatus={hideStatus}
          onCancel={() => setAdding(false)}
          onSave={async (values) => {
            await api('/api/item', { method: 'POST', body: { sheet: name, values } });
            setAdding(false);
            toast('Запис додано');
            load();
          }}
        />
      )}

      {issuing && (
        <IssueModal
          whoOptions={data.whoOptions}
          whereOptions={data.whereOptions}
          whoLabel={cols.who >= 0 ? headers[cols.who] || 'Отримав' : ''}
          whereLabel={cols.where > 0 ? headers[cols.where] || 'Де' : ''}
          onCancel={() => setIssuing(null)}
          onSave={async ({ who, where, date }) => {
            await api('/api/item', {
              method: 'POST',
              body: { sheet: name, action: 'issue', row: issuing.row, who, where, date },
            });
            setIssuing(null);
            toast(`Видано${who ? ' → ' + who : ''}`);
            load();
          }}
        />
      )}
    </>
  );
}

/**
 * Порядок полів у формі має збігатися з тим, як картка читається згори вниз:
 * спершу сама річ, потім її стан, потім кому й коли, і аж тоді решта.
 */
function formGroups({ headers, cols, idIdx, snIdx, hideStatus }) {
  const used = new Set();
  const take = (i) => {
    if (i === undefined || i === null || i < 0 || i >= headers.length || used.has(i)) return null;
    used.add(i);
    return i;
  };

  const thing = [take(0), take(idIdx), take(snIdx)].filter((i) => i !== null);
  const state = [hideStatus ? null : take(cols.status), take(cols.type)].filter((i) => i !== null);
  const whom = [take(cols.who), take(cols.date), take(cols.where > 0 ? cols.where : -1)]
    .filter((i) => i !== null);
  if (hideStatus && cols.status >= 0) used.add(cols.status);
  const rest = headers.map((_, i) => i).filter((i) => !used.has(i));

  return [
    { title: 'Річ', cols: thing },
    { title: 'Стан', cols: state },
    { title: 'Кому і коли', cols: whom },
    { title: 'Решта', cols: rest },
  ].filter((g) => g.cols.length);
}

function AddItemModal({
  headers, cols, statusOptions, typeOptions, hideStatus,
  idIdx, snIdx, suggestions = {}, onCancel, onSave,
}) {
  // дату підставляємо сьогоднішню — її однаково майже завжди ставлять поточну
  const [vals, setVals] = useState(() => headers.map((_, i) => (i === cols.date ? todayStr() : '')));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (i, v) => setVals((p) => p.map((x, j) => (j === i ? v : x)));
  const groups = formGroups({ headers, cols, idIdx, snIdx, hideStatus });

  return (
    <Modal
      title="Новий запис"
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        if (!vals[0]?.trim()) return setErr(`Вкажіть «${headers[0] || 'назву'}» — без цього запис не знайти`);
        setBusy(true);
        setErr('');
        try {
          await onSave(vals);
        } catch (e) {
          setErr(e.message || 'Помилка збереження');
        } finally {
          setBusy(false);
        }
      }}
    >
      {groups.map((g) => (
        <div key={g.title} className="fgroup">
          <div className="fgroup-t">{g.title}</div>
          {g.cols.map((i) => (
            <div key={i} style={{ marginTop: 10 }}>
              <label>
                {headers[i] || 'Поле ' + (i + 1)}
                {i === 0 && <span className="req"> *</span>}
              </label>
              {i === cols.status || i === cols.type ? (
                <select value={vals[i]} onChange={(e) => set(i, e.target.value)}>
                  <option value="">—</option>
                  {(i === cols.status ? statusOptions : typeOptions).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : suggestions[i]?.length ? (
                <Combo value={vals[i]} options={suggestions[i]} onChange={(v) => set(i, v)} />
              ) : (
                <input
                  type="text"
                  value={vals[i]}
                  autoFocus={i === 0}
                  placeholder={i === cols.date ? 'дд.мм.рррр' : ''}
                  onChange={(e) => set(i, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </Modal>
  );
}

function IssueModal({ whoOptions = [], whereOptions = [], whoLabel, whereLabel, onCancel, onSave }) {
  const [who, setWho] = useState('');
  const [where, setWhere] = useState('');
  const [date, setDate] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  return (
    <Modal
      title="Видати"
      saveLabel="Видати"
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        if (!who.trim() && !where.trim()) {
          return setErr(whereLabel ? 'Вкажіть позивний або місце' : 'Вкажіть, кому видаємо');
        }
        setBusy(true);
        setErr('');
        try {
          await onSave({ who: who.trim(), where: where.trim(), date });
        } catch (e) {
          setErr(e.message || 'Помилка збереження');
        } finally {
          setBusy(false);
        }
      }}
    >
      {whoLabel && (
        <div style={{ marginTop: 10 }}>
          <label>{whoLabel} — кому видаємо</label>
          <Combo value={who} options={whoOptions} onChange={setWho} placeholder="позивний" autoFocus />
        </div>
      )}
      {/* поле показуємо лише тоді, коли в листі справді є колонка місця —
          інакше введене нікуди не запишеться */}
      {whereLabel && (
        <div style={{ marginTop: 10 }}>
          <label>{whereLabel} — куди</label>
          <Combo value={where} options={whereOptions} onChange={setWhere} placeholder="місце" />
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <label>Дата видачі</label>
        <input type="text" value={date} onChange={(e) => setDate(e.target.value)} placeholder="дд.мм.рррр" />
      </div>
    </Modal>
  );
}

/* ---------- Відомість ---------- */
function LedgerView({ name, setState }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [wo, setWo] = useState(null);
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  useNewRecordHotkey(useCallback(() => setAdding(true), []));

  const load = useCallback(async () => {
    setState('завантаження…');
    try {
      const d = await api('/api/ledger?sheet=' + encodeURIComponent(name));
      setItems(d.items);
      setState('синхронізовано');
    } catch (e) {
      setState('помилка: ' + e.message);
    }
  }, [name, setState]);

  useEffect(() => { load(); }, [load]);
  if (!items) return <div className="loading">Завантаження…</div>;

  const list = q.trim()
    ? items.filter((it) => it.name.toLowerCase().includes(q.trim().toLowerCase()))
    : items;
  const sum = (pick) => list.reduce((a, it) => a + (Number(pick(it)) || 0), 0);

  const save = async (row, field, value) => {
    setState('збереження…');
    try {
      const d = await api('/api/ledger', { method: 'POST', body: { sheet: name, action: 'update', row, field, value } });
      setItems(d.items);
      setState('синхронізовано');
      toast('Збережено');
    } catch (e) {
      setState('помилка: ' + e.message);
      saveFailed(toast, e);
    }
  };

  return (
    <>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Пошук за назвою..." />
        <div className="spacer" />
        <button className="btn" onClick={() => setAdding(true)}>+ Додати позицію</button>
      </div>

      <Totals
        parts={[
          ['Позицій', list.length],
          ['Отримано', sum((it) => it.received)],
          ['Списано', sum((it) => it.writtenOff)],
          ['Залишок', sum((it) => it.remainder)],
        ]}
        of={list.length !== items.length ? items.length : undefined}
      />

      {list.length === 0 ? (
        <div className="empty">Немає позицій</div>
      ) : (
      <div className="grid">
        {list.map((it) => (
          <div className="card ledger-card" key={it.row}>
            <div className="card-head">
              <div className="card-title">
                <div className="title-line">
                  <span className="id-badge" title={'Рядок у таблиці: ' + it.row}>{it.row}</span>
                  <input className="ghost big" type="text" defaultValue={it.name} placeholder="Найменування"
                    onBlur={(e) => e.target.value.trim() && e.target.value !== it.name && save(it.row, 'name', e.target.value.trim())} />
                </div>
              </div>
              <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                <div className="remainder-label">Залишок</div>
                <div className={'remainder ' + (it.remainder <= 0 ? 'low' : 'ok')}>{it.remainder}</div>
              </div>
            </div>

            <div className="card-body">
              <div className="drow">
                <span className="drow-k">Од. виміру</span>
                <span className="drow-v">
                  <input className="ghost" type="text" defaultValue={it.unit} placeholder="шт."
                    onBlur={(e) => e.target.value !== it.unit && save(it.row, 'unit', e.target.value)} />
                </span>
              </div>
              <div className="drow">
                <span className="drow-k">Отримано</span>
                <span className="drow-v">
                  <input className="ghost" type="number" min="0" defaultValue={it.received}
                    onBlur={(e) => Number(e.target.value) !== it.received && save(it.row, 'received', Number(e.target.value) || 0)} />
                </span>
              </div>
              <div className="drow">
                <span className="drow-k">Списано</span>
                <span className="drow-v" style={{ padding: '3px 6px', color: 'var(--text-dim)' }}>{it.writtenOff}</span>
              </div>
            </div>
            <div className="actions">
              <button className="act-btn act-issue" disabled={it.remainder <= 0} onClick={() => setWo(it)}>Списати</button>
              <button className="act-btn act-del" onClick={async () => {
                if (!confirm(`Видалити позицію «${it.name}»?`)) return;
                setState('видалення…');
                try {
                  const d = await api('/api/ledger', { method: 'DELETE', body: { sheet: name, row: it.row } });
                  setItems(d.items);
                  setState('синхронізовано');
                  toast(`Видалено «${it.name}»`, {
                    type: 'warn',
                    action: {
                      label: 'Повернути',
                      run: async () => {
                        try {
                          const r = await api('/api/ledger', {
                            method: 'POST',
                            body: { sheet: name, action: 'restore', row: it.row, values: d.deleted },
                          });
                          setItems(r.items);
                          toast('Позицію повернено');
                        } catch (e) {
                          saveFailed(toast, e, 'Не вдалося повернути: ');
                        }
                      },
                    },
                  });
                } catch (e) {
                  setState('помилка: ' + e.message);
                  saveFailed(toast, e, 'Не вдалося видалити: ');
                }
              }}>Видалити</button>
            </div>
            {it.writeOffs.length > 0 && (
              <div className="history">
                {it.writeOffs.slice(-5).reverse().map((w, i) => (
                  <div key={i}>{w.qty} {it.unit || 'шт'} — {w.date || 'без дати'}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      )}

      {wo && (
        <WriteoffModal
          item={wo}
          onCancel={() => setWo(null)}
          onSave={async ({ qty, date }) => {
            const d = await api('/api/ledger', { method: 'POST', body: { sheet: name, action: 'writeoff', row: wo.row, qty, date } });
            setItems(d.items);
            toast(`Списано ${qty} ${wo.unit || 'шт'} — ${wo.name}`);
            setWo(null);
          }}
        />
      )}

      {adding && (
        <AddLedgerModal
          onCancel={() => setAdding(false)}
          onSave={async (body) => {
            await api('/api/ledger', { method: 'POST', body: { sheet: name, ...body } });
            setAdding(false);
            toast('Позицію додано');
            load();
          }}
        />
      )}
    </>
  );
}

function WriteoffModal({ item, onCancel, onSave }) {
  const [qty, setQty] = useState(1);
  const [date, setDate] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  return (
    <Modal
      title={'Списати: ' + item.name}
      saveLabel="Списати"
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        const n = Number(qty);
        if (!Number.isFinite(n) || n <= 0) return setErr('Вкажіть кількість більше 0');
        if (n > item.remainder) return setErr(`Залишок лише ${item.remainder} ${item.unit || 'шт'}`);
        setBusy(true);
        setErr('');
        try {
          await onSave({ qty: n, date });
        } catch (e) {
          setErr(e.message || 'Помилка списання');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="ledger-stats" style={{ marginBottom: 4 }}>
        <span>Отримано: {item.received}</span>
        <span>Списано: {item.writtenOff}</span>
        <span>Залишок: {item.remainder}</span>
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Кількість {item.unit && `(${item.unit})`}</label>
        <input type="number" min="1" max={item.remainder} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Дата списання</label>
        <input type="text" value={date} onChange={(e) => setDate(e.target.value)} placeholder="дд.мм.рррр" />
      </div>
    </Modal>
  );
}

function AddLedgerModal({ onCancel, onSave }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [received, setReceived] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  return (
    <Modal
      title="Нова позиція"
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        if (!name.trim()) return setErr('Вкажіть назву');
        setBusy(true);
        setErr('');
        try {
          await onSave({ name: name.trim(), unit, received: Number(received) || 0 });
        } catch (e) {
          setErr(e.message || 'Помилка збереження');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div style={{ marginTop: 10 }}><label>Найменування</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div style={{ marginTop: 10 }}><label>Од. виміру</label>
        <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="шт., к-т" /></div>
      <div style={{ marginTop: 10 }}><label>Кількість отриманого</label>
        <input type="number" min="0" value={received} onChange={(e) => setReceived(e.target.value)} /></div>
    </Modal>
  );
}

/* ---------- Великий склад (Рибаківка) ---------- */
function StockView({ setState, focusId, onClearFocus }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(null);
  const [acct, setAcct] = useState(null);
  const [adding, setAdding] = useState(false);
  const [move, setMove] = useState(null); // { item, kind: 'receive' | 'writeoff' }
  const [hist, setHist] = useState({});
  const [photo, setPhoto] = useState(null);
  const [mode, setMode] = useViewMode();
  const toast = useToast();

  useNewRecordHotkey(useCallback(() => setAdding(true), []));

  const load = useCallback(async () => {
    setState('завантаження…');
    try {
      setData(await api('/api/stock'));
      setState('синхронізовано');
    } catch (e) {
      setState('помилка: ' + e.message);
    }
  }, [setState]);

  useEffect(() => { load(); }, [load]);
  if (!data) return <div className="loading">Завантаження…</div>;

  const save = async (row, field, value, prev) => {
    if (value === prev) return;
    setState('збереження…');
    setData((p) => ({
      ...p,
      items: p.items.map((x) => (x.row === row ? { ...x, [field]: value } : x)),
    }));
    try {
      await api('/api/stock', { method: 'PATCH', body: { row, field, value, prev } });
      setState('синхронізовано');
      toast('Збережено');
    } catch (e) {
      setState('помилка збереження');
      saveFailed(toast, e);
    }
  };

  let list = data.items;
  if (focusId) list = list.filter((it) => it.id === focusId);
  if (cat) list = list.filter((it) => it.category === cat);
  // «не вказано» — окремий фільтр, інакше такі позиції легко загубити
  if (acct) list = list.filter((it) => (it.accounting || '—') === acct);
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    list = list.filter((it) =>
      [it.id, it.name, it.description, it.category, it.place, it.notes]
        .join(' ').toLowerCase().includes(s));
  }

  const sum = (pick) => list.reduce((a, it) => a + (Number(pick(it)) || 0), 0);
  const left = (kind) =>
    list.filter((it) => (it.accounting || '') === kind).reduce((a, it) => a + it.remainder, 0);

  return (
    <>
      {focusId && (
        <div className="scan-banner">
          <span>Показано позицію <b>{focusId}</b></span>
          <button className="act-btn" onClick={onClearFocus}>Показати всі</button>
        </div>
      )}

      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Пошук: назва, опис, категорія, місце..." />
        <div className="spacer" />
        <ViewToggle mode={mode} onChange={setMode} />
        <button className="btn btn-accept" onClick={() => setAdding(true)}>+ Додати позицію</button>
      </div>

      {data.items.length > 0 && (
        <div className="chips">
          {[...(data.accountingOptions || []), '—'].map((a) => (
            <div key={a} className={'chip chip-acct' + (acct === a ? ' on' : '')}
              title={a === '—' ? 'Облік не вказано' : ''}
              onClick={() => setAcct(acct === a ? null : a)}>
              {a === '—' ? 'Облік не вказано' : a}
            </div>
          ))}
        </div>
      )}

      {data.categories.length > 0 && (
        <div className="chips">
          {data.categories.map((c) => (
            <div key={c} className={'chip' + (cat === c ? ' on' : '')}
              onClick={() => setCat(cat === c ? null : c)}>
              {c}
            </div>
          ))}
        </div>
      )}

      <Totals
        parts={[
          ['Позицій', list.length],
          ['Прийнято', sum((it) => it.received)],
          ['Списано', sum((it) => it.writtenOff)],
          ['Залишок', sum((it) => it.remainder)],
          // головне питання складу: скільки з цього числиться за документами
          ['За документами', left('Облікове')],
          ['Поза обліком', left('Необлікове')],
          ['Облік не вказано', left('') || null],
        ]}
        of={list.length !== data.items.length ? data.items.length : undefined}
      />

      {list.length === 0 ? (
        <div className="empty">
          {data.items.length === 0
            ? 'Склад порожній. Натисніть «Додати позицію», щоб внести перше майно.'
            : 'Нічого не знайдено'}
        </div>
      ) : mode === 'table' ? (
        <DataTable
          columns={[
            { key: 'id', title: 'ID', cls: 'col-mono col-id', render: (it) => it.id },
            { key: 'cat', title: 'Категорія', render: (it) => it.category || '—' },
            { key: 'name', title: 'Найменування', cls: 'col-name', render: (it) => it.name },
            { key: 'desc', title: 'Опис', render: (it) => it.description || '—' },
            { key: 'unit', title: 'Од.', cls: 'col-mono', render: (it) => it.unit || '—' },
            { key: 'in', title: 'Прийнято', cls: 'col-num', render: (it) => it.received },
            { key: 'out', title: 'Списано', cls: 'col-num', render: (it) => it.writtenOff },
            {
              key: 'left', title: 'Залишок', cls: 'col-num col-strong',
              style: (it) => ({ color: it.remainder > 0 ? 'var(--green)' : 'var(--red)' }),
              render: (it) => it.remainder,
            },
            { key: 'place', title: 'Місце', render: (it) => it.place || '—' },
            {
              key: 'acct', title: 'Облік', cls: 'col-mono',
              style: (it) => ({ color: it.accounting === 'Облікове' ? 'var(--green)' : 'var(--gray)' }),
              render: (it) => it.accounting || '—',
            },
          ]}
          rows={list.map((it) => ({ key: it.row, item: it }))}
          onPick={(it) => setMode('cards')}
        />
      ) : (
        <div className="grid">
          {list.map((it) => {
            const moves = data.moves.filter((m) => m.id && m.id === it.id);
            const open = !!hist[it.row];
            return (
              <div className="card stock-card" key={it.row}>
                <div className="card-head">
                  <div className="card-title">
                    <div className="title-line">
                      <span className="id-badge" title="Номер позиції">{it.id}</span>
                      <input className="ghost big" type="text" defaultValue={it.name} placeholder="Найменування"
                        onBlur={(e) => e.target.value.trim() && save(it.row, 'name', e.target.value.trim(), it.name)} />
                    </div>
                    <select
                      className={'pill acct-' + (it.accounting === 'Облікове' ? 'on' : it.accounting ? 'off' : 'none')}
                      value={it.accounting}
                      title="Чи числиться за документами"
                      onChange={(e) => save(it.row, 'accounting', e.target.value, it.accounting)}
                    >
                      <option value="">Облік не вказано</option>
                      {(data.accountingOptions || []).map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                    <div className="remainder-label">Залишок</div>
                    <div className={'remainder ' + (it.remainder <= 0 ? 'low' : 'ok')}>{it.remainder}</div>
                    {it.unit && <div className="remainder-unit">{it.unit}</div>}
                  </div>
                </div>

                {(it.photo1 || it.photo2) && (
                  <div className="stock-photos">
                    {[it.photo1, it.photo2].filter(Boolean).map((p, i) => (
                      <img key={i} src={photoSrc(p)} alt=""
                        onClick={() => setPhoto({ src: p, title: it.name })}
                        // недоступне фото не має лишати порожню рамку на картці
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        title="Натисніть, щоб збільшити" />
                    ))}
                  </div>
                )}

                <div className="card-body">
                  <div className="drow">
                    <span className="drow-k">Категорія</span>
                    <span className="drow-v">
                      <Combo value={it.category} options={data.categories} className="ghost"
                        placeholder="—" onChange={(v) => save(it.row, 'category', v, it.category)} />
                    </span>
                  </div>
                  <div className="drow">
                    <span className="drow-k">Опис</span>
                    <span className="drow-v">
                      <textarea className="ghost" rows={2} defaultValue={it.description}
                        placeholder="що це, що всередині"
                        onBlur={(e) => save(it.row, 'description', e.target.value, it.description)} />
                    </span>
                  </div>
                  <div className="drow">
                    <span className="drow-k">Од. виміру</span>
                    <span className="drow-v">
                      <Combo value={it.unit} options={data.units} className="ghost"
                        placeholder="шт." onChange={(v) => save(it.row, 'unit', v, it.unit)} />
                    </span>
                  </div>
                  <div className="drow">
                    <span className="drow-k">Місце</span>
                    <span className="drow-v">
                      <Combo value={it.place} options={data.places} className="ghost"
                        placeholder="—" onChange={(v) => save(it.row, 'place', v, it.place)} />
                    </span>
                  </div>
                  <div className="drow">
                    <span className="drow-k">Прийнято</span>
                    <span className="drow-v stock-ro">{it.received} {it.unit}</span>
                  </div>
                  <div className="drow">
                    <span className="drow-k">Списано</span>
                    <span className="drow-v stock-ro">{it.writtenOff} {it.unit}</span>
                  </div>
                  <div className="drow">
                    <span className="drow-k">Примітки</span>
                    <span className="drow-v">
                      <textarea className="ghost" rows={1} defaultValue={it.notes} placeholder="—"
                        onBlur={(e) => save(it.row, 'notes', e.target.value, it.notes)} />
                    </span>
                  </div>
                </div>

                <div className="stock-photo-fields">
                  <PhotoField label="Фото 1" value={it.photo1} showPreview={false}
                    onChange={(v) => save(it.row, 'photo1', v, it.photo1)} />
                  <PhotoField label="Фото 2" value={it.photo2} showPreview={false}
                    onChange={(v) => save(it.row, 'photo2', v, it.photo2)} />
                </div>

                <div className="actions">
                  <button className="act-btn act-accept" onClick={() => setMove({ item: it, kind: 'receive' })}>
                    Прийняти
                  </button>
                  <button className="act-btn act-issue" disabled={it.remainder <= 0}
                    onClick={() => setMove({ item: it, kind: 'writeoff' })}>
                    Списати
                  </button>
                  {moves.length > 0 && (
                    <button className="act-btn" onClick={() => setHist((p) => ({ ...p, [it.row]: !p[it.row] }))}>
                      Історія ({moves.length})
                    </button>
                  )}
                  <button className="act-btn act-del" onClick={async () => {
                    if (!confirm(`Видалити позицію «${it.name}»?`)) return;
                    setState('видалення…');
                    try {
                      const d = await api('/api/stock', { method: 'DELETE', body: { row: it.row } });
                      setData(d);
                      setState('синхронізовано');
                      toast(`Видалено «${it.name}»`, {
                        type: 'warn',
                        action: {
                          label: 'Повернути',
                          run: async () => {
                            try {
                              setData(await api('/api/stock', {
                                method: 'POST',
                                body: { action: 'restore', row: it.row, values: d.deleted },
                              }));
                              toast('Позицію повернено');
                            } catch (e) {
                              saveFailed(toast, e, 'Не вдалося повернути: ');
                            }
                          },
                        },
                      });
                    } catch (e) {
                      setState('помилка: ' + e.message);
                      saveFailed(toast, e, 'Не вдалося видалити: ');
                    }
                  }}>Видалити</button>
                </div>

                {open && (
                  <div className="history">
                    {moves.slice().reverse().map((m, i) => (
                      <div key={i} className="hist-row">
                        <span className={m.action === 'Прийнято' ? 'hist-in' : 'hist-out'}>
                          {m.action === 'Прийнято' ? '+' : '−'}{m.qty}
                        </span>
                        <span>{m.date}</span>
                        {m.who && <span className="hist-who">{m.who}</span>}
                        {m.note && <span className="hist-note">{m.note}</span>}
                        <span className="hist-left">залишок {m.left}</span>
                        {m.photo && (
                          <img className="hist-photo" src={photoSrc(m.photo)} alt=""
                            onClick={() => setPhoto({ src: m.photo, title: `${m.action}: ${m.name}` })} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {photo && (
        <div className="overlay" style={{ background: 'rgba(0,0,0,.92)' }} onClick={() => setPhoto(null)}>
          <div style={{ textAlign: 'center' }}>
            <img src={photoSrc(photo.src)} alt=""
              style={{ maxWidth: '96vw', maxHeight: '80vh', objectFit: 'contain' }} />
            <div style={{ fontFamily: 'var(--mono)', marginTop: 12 }}>{photo.title}</div>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setPhoto(null)}>Закрити</button>
          </div>
        </div>
      )}

      {move && (
        <StockMoveModal
          item={move.item}
          kind={move.kind}
          people={data.people}
          onCancel={() => setMove(null)}
          onSave={async (body) => {
            const d = await api('/api/stock', {
              method: 'POST',
              body: { action: move.kind === 'receive' ? 'receive' : 'writeoff', row: move.item.row, ...body },
            });
            setData(d);
            toast(`${move.kind === 'receive' ? 'Прийнято' : 'Списано'} ${body.qty} ${move.item.unit || 'шт.'} — ${move.item.name}`);
            setMove(null);
          }}
        />
      )}

      {adding && (
        <AddStockModal
          data={data}
          onCancel={() => setAdding(false)}
          onSave={async (body) => {
            const d = await api('/api/stock', { method: 'POST', body });
            setData(d);
            setAdding(false);
            toast(`Додано ${d.id} — ${body.name}`);
          }}
        />
      )}
    </>
  );
}

function StockMoveModal({ item, kind, people, onCancel, onSave }) {
  const isIn = kind === 'receive';
  const [qty, setQty] = useState(1);
  const [date, setDate] = useState(todayStr());
  const [who, setWho] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  return (
    <Modal
      title={(isIn ? 'Прийняти: ' : 'Списати: ') + item.name}
      saveLabel={isIn ? 'Прийняти' : 'Списати'}
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        const n = Number(String(qty).replace(',', '.'));
        if (!Number.isFinite(n) || n <= 0) return setErr('Вкажіть кількість більше 0');
        if (!isIn && n > item.remainder) return setErr(`Залишок лише ${item.remainder} ${item.unit || 'шт.'}`);
        setBusy(true);
        setErr('');
        try {
          await onSave({ qty: n, date, who, note, photo });
        } catch (e) {
          setErr(e.message || 'Не вдалося зберегти');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="ledger-stats" style={{ marginBottom: 4 }}>
        <span>Прийнято: {item.received}</span>
        <span>Списано: {item.writtenOff}</span>
        <span>Залишок: {item.remainder}</span>
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Кількість {item.unit && `(${item.unit})`}</label>
        <input type="number" min="1" step="any" max={isIn ? undefined : item.remainder}
          value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Дата</label>
        <input type="text" value={date} onChange={(e) => setDate(e.target.value)} placeholder="дд.мм.рррр" />
      </div>
      <div style={{ marginTop: 10 }}>
        <label>{isIn ? 'Від кого' : 'Кому / підстава'}</label>
        <Combo value={who} options={people} onChange={setWho} placeholder="позивний або підрозділ" />
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Примітка</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <PhotoField value={photo} onChange={setPhoto} />
    </Modal>
  );
}

function AddStockModal({ data, onCancel, onSave }) {
  const [accounting, setAccounting] = useState((data.accountingOptions || [])[0] || '');
  const [category, setCategory] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('шт.');
  const [received, setReceived] = useState(1);
  const [place, setPlace] = useState('');
  const [who, setWho] = useState('');
  const [notes, setNotes] = useState('');
  const [photo1, setPhoto1] = useState('');
  const [photo2, setPhoto2] = useState('');
  const [date, setDate] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  return (
    <Modal
      title="Нова позиція складу"
      saveLabel="Додати"
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        if (!name.trim()) return setErr('Вкажіть найменування');
        const n = Number(String(received).replace(',', '.'));
        if (!Number.isFinite(n) || n < 0) return setErr('Кількість має бути числом');
        setBusy(true);
        setErr('');
        try {
          await onSave({
            category: category.trim(), name: name.trim(), description, unit: unit.trim(),
            received: n, place: place.trim(), who: who.trim(), notes, photo1, photo2, date,
            accounting,
          });
        } catch (e) {
          setErr(e.message || 'Не вдалося зберегти');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div style={{ marginTop: 10 }}>
        <label>Облік — чи числиться за документами</label>
        <select value={accounting} onChange={(e) => setAccounting(e.target.value)}>
          {(data.accountingOptions || []).map((a) => <option key={a} value={a}>{a}</option>)}
          <option value="">Поки невідомо</option>
        </select>
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Категорія</label>
        <Combo value={category} options={data.categories} onChange={setCategory}
          placeholder="човни, мотори, ящики…" />
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Найменування</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Опис — що це або що всередині</label>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="two-col">
        <div>
          <label>Од. виміру</label>
          <Combo value={unit} options={data.units} onChange={setUnit} placeholder="шт." />
        </div>
        <div>
          <label>Прийнято, к-сть</label>
          <input type="number" min="0" step="any" value={received}
            onChange={(e) => setReceived(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Місце на складі</label>
        <Combo value={place} options={data.places} onChange={setPlace} placeholder="ангар, стелаж, причал…" />
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Від кого прийнято</label>
        <Combo value={who} options={data.people} onChange={setWho} placeholder="позивний або підрозділ" />
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Дата приймання</label>
        <input type="text" value={date} onChange={(e) => setDate(e.target.value)} placeholder="дд.мм.рррр" />
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Примітки</label>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <PhotoField label="Фото 1" value={photo1} onChange={setPhoto1} />
      <PhotoField label="Фото 2" value={photo2} onChange={setPhoto2} />
    </Modal>
  );
}

/* ---------- Склад ---------- */
function WarehouseView({ setState, focusCode, onOpen }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [chip, setChip] = useState(null);
  const [adding, setAdding] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [qr, setQr] = useState(null);
  const [highlight, setHighlight] = useState(focusCode || null);
  const [mode, setMode] = useViewMode();
  const toast = useToast();

  useNewRecordHotkey(useCallback(() => setAdding(true), []));

  const load = useCallback(async () => {
    setState('завантаження…');
    try {
      const d = await api('/api/warehouse');
      setData(d);
      setState('синхронізовано');
    } catch (e) {
      setState('помилка: ' + e.message);
    }
  }, [setState]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data || !focusCode) return;
    setHighlight(focusCode);
    const t = setTimeout(() => {
      document.getElementById('box-' + focusCode)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    return () => clearTimeout(t);
  }, [data, focusCode]);

  if (!data) return <div className="loading">Завантаження…</div>;

  const save = async (row, field, value, prev, code) => {
    setState('збереження…');
    try {
      const d = await api('/api/warehouse', { method: 'PATCH', body: { row, field, value, prev, code } });
      // дата оновлення має змінитися одразу, не чекаючи перезавантаження листа
      setData((p) => ({
        ...p,
        items: p.items.map((x) => (x.row === row ? { ...x, [field]: value, updated: d.updated || x.updated } : x)),
      }));
      setState('синхронізовано');
      toast('Збережено');
    } catch (e) {
      setState('помилка збереження');
      saveFailed(toast, e);
    }
  };

  let list = [...data.items].sort((a, b) => {
    const na = parseInt(String(a.code).replace(/\D/g, ''), 10);
    const nb = parseInt(String(b.code).replace(/\D/g, ''), 10);
    return (isNaN(na) ? 0 : na) - (isNaN(nb) ? 0 : nb);
  });
  if (highlight) list = list.filter((it) => it.code === highlight);
  if (chip) list = list.filter((it) => it.priority === chip);
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    list = list.filter((it) =>
      [it.code, it.name, it.contents, it.location].join(' ').toLowerCase().includes(s)
    );
  }

  return (
    <>
      {highlight && (
        <div className="scan-banner">
          <span>Відскановано ящик <b>{highlight}</b></span>
          <button className="act-btn" onClick={() => setHighlight(null)}>Показати всі</button>
        </div>
      )}

      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Пошук: код, назва, вміст..." />
        {data.priorities.map((p) => (
          <div key={p.value} className={'chip' + (chip === p.value ? ' on' : '')}
            title={p.label} onClick={() => setChip(chip === p.value ? null : p.value)}>
            Пріоритет {p.value}
          </div>
        ))}
        <div className="spacer" />
        <ViewToggle mode={mode} onChange={setMode} />
        <button className="btn" onClick={() => setAdding(true)}>+ Додати ящик</button>
      </div>

      <Totals
        parts={[['Ящиків', list.length], ...countBy(list, (it) => it.status)]}
        of={list.length !== data.items.length ? data.items.length : undefined}
      />

      {list.length === 0 ? (
        <div className="empty">Немає ящиків</div>
      ) : mode === 'table' ? (
        <DataTable
          columns={[
            { key: 'code', title: 'Код', cls: 'col-mono col-id', render: (it) => it.code },
            { key: 'name', title: 'Назва', cls: 'col-name', render: (it) => it.name },
            { key: 'contents', title: 'Вміст', render: (it) => it.contents || '—' },
            { key: 'location', title: 'Розташування', render: (it) => it.location || '—' },
            {
              key: 'status', title: 'Статус', cls: 'col-status',
              style: (it) => ({ color: statusColor(it.status) }),
              render: (it) => it.status || '—',
            },
            { key: 'prio', title: 'Пріор.', cls: 'col-mono col-num', render: (it) => it.priority || '—' },
            { key: 'created', title: 'Додано', cls: 'col-mono', render: (it) => it.created || '—' },
            { key: 'updated', title: 'Оновлено', cls: 'col-mono', render: (it) => it.updated || '—' },
            { key: 'notes', title: 'Примітки', render: (it) => it.notes || '—' },
          ]}
          rows={list.map((it) => ({ key: it.row, item: it }))}
          onPick={(it) => {
            setMode('cards');
            setTimeout(() => {
              document.getElementById('box-' + it.code)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 60);
          }}
        />
      ) : (
        <div className="grid">
          {list.map((it) => (
            <div className={'card' + (it.code === highlight ? ' highlight' : '')} key={it.row} id={'box-' + it.code}>
              <div className="card-head">
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="wh-code">{it.code}</span>
                  <input className="ghost big" type="text" defaultValue={it.name} placeholder="Назва"
                    onBlur={(e) => e.target.value !== it.name && save(it.row, 'name', e.target.value, it.name, it.code)} />
                </div>
                <select
                  className="pill"
                  style={{ color: statusColor(it.status) }}
                  defaultValue={it.status}
                  onChange={(e) => save(it.row, 'status', e.target.value, it.status, it.code)}
                >
                  {data.statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {it.photoUrl ? (
                <img className="wh-photo" src={photoSrc(it.photoUrl)} alt="" onClick={() => setPhoto(it)}
                  title="Натисніть, щоб відкрити в повному розмірі" />
              ) : (
                <div className="wh-photo-ph">немає фото</div>
              )}

              <div className="card-body">
                {[
                  ['Вміст', 'contents'], ['Розташування', 'location'], ['Примітки', 'notes'],
                ].map(([label, field]) => (
                  <div className="drow" key={field}>
                    <span className="drow-k">{label}</span>
                    <span className="drow-v">
                      <input className="ghost" type="text" defaultValue={it[field]} placeholder="—"
                        onBlur={(e) => e.target.value !== it[field] && save(it.row, field, e.target.value, it[field], it.code)} />
                    </span>
                  </div>
                ))}
                <div className="drow">
                  <span className="drow-k">Пріоритет</span>
                  <span className="drow-v">
                    <select className="ghost" defaultValue={it.priority}
                      onChange={(e) => save(it.row, 'priority', e.target.value, it.priority, it.code)}
                      title={data.priorities.find((p) => p.value === it.priority)?.label}>
                      {data.priorities.map((p) => (
                        <option key={p.value} value={p.value} title={p.label}>{p.value} — {p.label.split(' — ')[1] || p.label}</option>
                      ))}
                    </select>
                  </span>
                </div>
              </div>

              <div className="wh-dates">
                <span>Додано: <b>{it.created || '—'}</b></span>
                <span>Оновлено: <b>{it.updated || '—'}</b></span>
              </div>

              <PhotoField
                value={it.photoUrl}
                showPreview={false}
                onChange={(url) => {
                  const prev = it.photoUrl;
                  setData((p) => ({
                    ...p,
                    items: p.items.map((x) => (x.row === it.row ? { ...x, photoUrl: url } : x)),
                  }));
                  save(it.row, 'photoUrl', url, prev, it.code);
                }}
              />

              <div className="actions">
                <button className="act-btn act-qr" onClick={() => setQr(it)}>QR</button>
                <button className="act-btn" onClick={() => onOpen({ kind: 'log', name: null, q: it.code })}>
                  Історія
                </button>
                <button className="act-btn act-del" onClick={async () => {
                  if (!confirm('Видалити ящик ' + it.code + '?')) return;
                  setState('видалення…');
                  try {
                    const d = await api('/api/warehouse', { method: 'DELETE', body: { row: it.row } });
                    setData((p) => ({ ...p, items: d.items }));
                    setState('синхронізовано');
                    toast(`Видалено ящик ${it.code}`, {
                      type: 'warn',
                      action: {
                        label: 'Повернути',
                        run: async () => {
                          try {
                            const r = await api('/api/warehouse', {
                              method: 'POST',
                              body: { action: 'restore', row: it.row, values: d.deleted },
                            });
                            setData((p) => ({ ...p, items: r.items }));
                            toast(`Ящик ${it.code} повернено`);
                          } catch (e) {
                            saveFailed(toast, e, 'Не вдалося повернути: ');
                          }
                        },
                      },
                    });
                  } catch (e) {
                    setState('помилка: ' + e.message);
                    saveFailed(toast, e, 'Не вдалося видалити: ');
                  }
                }}>Видалити</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {photo && (
        <div className="overlay" style={{ background: 'rgba(0,0,0,.92)' }} onClick={() => setPhoto(null)}>
          <div style={{ textAlign: 'center' }}>
            <img src={photoSrc(photo.photoUrl)} alt="" style={{ maxWidth: '96vw', maxHeight: '80vh', objectFit: 'contain' }} />
            <div style={{ fontFamily: 'var(--mono)', marginTop: 12 }}>{photo.code} — {photo.name}</div>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setPhoto(null)}>Закрити</button>
          </div>
        </div>
      )}

      {qr && <QrModal item={qr} onClose={() => setQr(null)} />}

      {adding && (
        <AddWarehouseModal
          priorities={data.priorities}
          onCancel={() => setAdding(false)}
          onSave={async (body) => {
            const d = await api('/api/warehouse', { method: 'POST', body });
            setData((p) => ({ ...p, items: d.items }));
            setAdding(false);
            toast(`Ящик ${d.code} додано`);
          }}
        />
      )}
    </>
  );
}

function QrModal({ item, onClose }) {
  const [src, setSrc] = useState('');
  const url = typeof window !== 'undefined' ? `${window.location.origin}/?box=${encodeURIComponent(item.code)}` : '';

  useEffect(() => {
    import('qrcode').then((QR) => {
      QR.toDataURL(url, { width: 260, margin: 1, color: { dark: '#12140f', light: '#ffffff' } })
        .then(setSrc).catch(() => {});
    });
  }, [url]);

  return (
    <div className="overlay" onClick={(e) => e.target.className === 'overlay' && onClose()}>
      <div className="modal" style={{ textAlign: 'center' }}>
        <h2>QR: {item.code}</h2>
        {src ? <img src={src} alt="QR" style={{ background: '#fff', padding: 12, borderRadius: 4 }} />
             : <div className="loading">Генерація…</div>}
        <div style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', color: 'var(--muted)', marginTop: 10, wordBreak: 'break-all' }}>
          {url}
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Закрити</button>
          <button className="btn-save" onClick={() => window.print()}>Друк</button>
        </div>
      </div>
    </div>
  );
}

function AddWarehouseModal({ priorities, onCancel, onSave }) {
  const [f, setF] = useState({ priority: '3', name: '', contents: '', location: '', notes: '', photoUrl: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      title="Новий ящик"
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        if (!f.name.trim()) return setErr('Вкажіть назву');
        setBusy(true);
        setErr('');
        try {
          await onSave(f);
        } catch (e) {
          setErr(e.message || 'Помилка збереження');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div style={{ marginTop: 10 }}><label>Пріоритет</label>
        <select value={f.priority} onChange={(e) => up('priority', e.target.value)}>
          {priorities.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select></div>
      {[['Назва', 'name'], ['Вміст', 'contents'], ['Розташування', 'location'],
        ['Примітки', 'notes']].map(([label, key]) => (
        <div style={{ marginTop: 10 }} key={key}>
          <label>{label}</label>
          <input type="text" value={f[key]} onChange={(e) => up(key, e.target.value)} />
        </div>
      ))}
      <div style={{ marginTop: 10 }}>
        <PhotoField value={f.photoUrl} onChange={(v) => up('photoUrl', v)} />
      </div>
    </Modal>
  );
}

/* ---------- Журнал змін ---------- */
function actionClass(a) {
  const v = (a || '').toLowerCase();
  if (v.includes('видален')) return 'log-del';
  if (v.includes('віднов')) return 'log-restore';
  if (v.includes('додано')) return 'log-add';
  if (v.includes('спис')) return 'log-writeoff';
  return 'log-edit';
}

function LogView({ setState, initialQuery }) {
  const [entries, setEntries] = useState(null);
  const [q, setQ] = useState(initialQuery || '');
  const [big, setBig] = useState(null);

  const load = useCallback(async () => {
    setState('завантаження…');
    try {
      const d = await api('/api/log');
      setEntries(d.entries);
      setState('синхронізовано');
    } catch (e) {
      setState('помилка: ' + e.message);
    }
  }, [setState]);

  useEffect(() => { load(); }, [load]);
  if (!entries) return <div className="loading">Завантаження…</div>;

  const list = q.trim()
    ? entries.filter((e) =>
        [e.date, e.sheet, e.action, e.field, e.before, e.after, e.by].join(' ').toLowerCase()
          .includes(q.trim().toLowerCase()))
    : entries;

  return (
    <>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Пошук у журналі: лист, дія, значення..." />
        <div className="spacer" />
        <button className="btn" onClick={load}>Оновити</button>
      </div>

      <Totals
        parts={[['Записів', list.length], ...countBy(list, (e) => e.action).slice(0, 4)]}
        of={list.length !== entries.length ? entries.length : undefined}
      />

      {list.length === 0 ? (
        <div className="empty">
          {entries.length === 0
            ? 'Журнал порожній — він заповнюється з першої зміни'
            : 'Нічого не знайдено'}
        </div>
      ) : (
        <div className="log-list">
          {list.map((e, i) => (
            <div className="log-row" key={i}>
              <div className="log-when">
                <span>{e.date}</span>
                <span className="log-time">{e.time}</span>
              </div>
              <div className="log-what">
                <div className="log-head">
                  <span className={'log-action ' + actionClass(e.action)}>{e.action}</span>
                  <span className="badge">{e.sheet}</span>
                  {e.target && <span className="log-target">ряд. {e.target}</span>}
                  {e.field && <span className="log-field">{e.field}</span>}
                  {e.by && <span className="log-by" title="Хто вніс зміну">{e.by}</span>}
                </div>
                {(e.before || e.after) && (
                  <div className="log-diff">
                    {e.before && <span className="log-before">{e.before}</span>}
                    {e.before && e.after && <span className="log-arrow">→</span>}
                    {e.after && <span className="log-after">{e.after}</span>}
                  </div>
                )}
              </div>
              {e.photo && (
                <img className="log-photo" src={photoSrc(e.photo)} alt=""
                  onClick={() => setBig(e)} title="Натисніть, щоб збільшити" />
              )}
            </div>
          ))}
        </div>
      )}

      {big && (
        <div className="overlay" style={{ background: 'rgba(0,0,0,.92)' }} onClick={() => setBig(null)}>
          <div style={{ textAlign: 'center' }}>
            <img src={photoSrc(big.photo)} alt="" style={{ maxWidth: '96vw', maxHeight: '80vh', objectFit: 'contain' }} />
            <div style={{ fontFamily: 'var(--mono)', marginTop: 12 }}>{big.action} · {big.sheet} · {big.date}</div>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setBig(null)}>Закрити</button>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Форма приймання та видачі за актом ---------- */
const emptyItem = () => ({ cells: {} });

/** Поле назви з підказками з обраного листа: вибрав річ — акт оновить її рядок */
function ItemPicker({ value, catalog, onPick, onText, placeholder = 'Назва' }) {
  const [open, setOpen] = useState(false);
  const q = (value || '').trim().toLowerCase();
  const hits = q
    ? catalog
        .filter((c) => [c.title, c.hint, c.who].join(' ').toLowerCase().includes(q))
        .slice(0, 8)
    : [];

  return (
    <div className="pick">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => { onText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        // Escape має ховати підказки, а не закривати всю форму
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}
      />
      {open && hits.length > 0 && (
        <div className="pick-list">
          {hits.map((h) => (
            <div
              className="pick-opt"
              key={h.row}
              // mousedown спрацьовує до blur, інакше список зникне раніше за клік
              onMouseDown={(e) => { e.preventDefault(); onPick(h); setOpen(false); }}
            >
              <span className="pick-title">{h.title || '—'}</span>
              {h.hint && <span className="pick-sn">{h.hint}</span>}
              {h.status && <span className="pick-st" style={{ color: statusColor(h.status) }}>{h.status}</span>}
              {h.who && <span className="pick-who">→ {h.who}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActModal({ kind, sheets, conditions, initialSheet, bindRow, me = '', onCancel, onSave }) {
  const accept = kind === 'accept';
  const [sheet, setSheet] = useState(initialSheet || sheets[0] || '');
  const [items, setItems] = useState([emptyItem()]);
  const [catalog, setCatalog] = useState([]);
  // набір полів у кожного листа свій — беремо його з сервера разом із підказками
  const [fields, setFields] = useState([]);
  // приймає або віддає той, хто зараз у системі — підставляємо, але лишаємо змінним
  const [from, setFrom] = useState(accept ? '' : me);
  const [to, setTo] = useState(accept ? me : '');
  const [condition, setCondition] = useState(accept ? conditions[1] : '');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState('');
  const [date] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const shownSheet = useRef(sheet);
  const bound = useRef(false);

  // поля й підказки беремо з того листа, який зараз обраний
  useEffect(() => {
    let alive = true;
    setCatalog([]);
    setFields([]);
    api('/api/act?sheet=' + encodeURIComponent(sheet))
      .then((d) => {
        if (!alive) return;
        setCatalog(d.catalog || []);
        setFields(d.fields || []);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [sheet]);

  // і рядок, і колонки належать конкретному листу — при зміні категорії
  // прив'язки скидаємо, а введене чистимо, бо колонки вже інші
  useEffect(() => {
    if (shownSheet.current === sheet) return;
    shownSheet.current = sheet;
    setItems([emptyItem()]);
  }, [sheet]);

  // відкрили форму з пошуку — одразу підставляємо знайдену річ
  useEffect(() => {
    if (bound.current || !bindRow || !catalog.length) return;
    const hit = catalog.find((c) => c.row === bindRow);
    if (!hit) return;
    bound.current = true;
    setItems([{ cells: { ...hit.cells }, row: hit.row }]);
  }, [catalog, bindRow]);

  const titleCol = fields[0]?.col ?? 0;
  const subFields = fields.slice(1);
  const cellOf = (it, col) => it.cells?.[col] || '';

  const upCell = (i, col, v) =>
    setItems((p) => p.map((x, j) => (j === i ? { ...x, cells: { ...x.cells, [col]: v } } : x)));
  const pickItem = (i, h) =>
    setItems((p) => p.map((x, j) => (j === i ? { cells: { ...h.cells }, row: h.row } : x)));
  const unbind = (i) => setItems((p) => p.map((x, j) => {
    if (j !== i) return x;
    const { row, ...rest } = x;
    return rest;
  }));

  const named = (it) => cellOf(it, titleCol).trim();
  const filled = items.filter(named).length;
  const bindings = items.filter((it) => named(it) && it.row).length;

  return (
    <Modal
      title={accept ? 'Прийняти майно' : 'Видати майно'}
      saveLabel={accept ? 'Прийняти' : 'Видати'}
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        if (!from.trim()) return setErr('Вкажіть, хто віддав');
        if (!to.trim()) return setErr('Вкажіть, хто прийняв');
        if (!filled) return setErr('Додайте хоча б одну позицію');
        setBusy(true);
        setErr('');
        try {
          await onSave({ sheet, items, from, to, condition, note, photo, date });
        } catch (e) {
          setErr(e.message || 'Не вдалося зберегти');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div style={{ marginTop: 10 }}>
        <label>Категорія</label>
        <select value={sheet} onChange={(e) => setSheet(e.target.value)}>
          {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Що {accept ? 'приймаємо' : 'видаємо'}{filled ? ` — ${filled} поз.` : ''}</label>
        {items.map((it, i) => (
          <div className={'act-item' + (it.row ? ' act-item-bound' : '')} key={i}>
            <ItemPicker
              value={cellOf(it, titleCol)}
              catalog={catalog}
              placeholder={fields[0]?.label || 'Назва'}
              onText={(v) => upCell(i, titleCol, v)}
              onPick={(h) => pickItem(i, h)}
            />
            <div className="act-item-sub">
              {subFields.map((f) => (
                <input key={f.col} type={f.mask ? 'password' : 'text'}
                  placeholder={f.label} title={f.label} autoComplete="off"
                  value={cellOf(it, f.col)}
                  onChange={(e) => upCell(i, f.col, e.target.value)} />
              ))}
              {items.length > 1 && (
                <button type="button" className="act-btn act-del"
                  onClick={() => setItems((p) => p.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
            {it.row ? (
              <div className="pick-bound">
                оновимо ряд. {it.row}
                <button type="button" onClick={() => unbind(i)} title="Записати як нову річ">
                  зробити новою
                </button>
              </div>
            ) : named(it) ? (
              <div className="pick-new">нова річ — додамо рядок</div>
            ) : null}
          </div>
        ))}
        <button type="button" className="act-btn" style={{ width: '100%', marginTop: 6 }}
          onClick={() => setItems((p) => [...p, emptyItem()])}>
          + Ще позиція
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Хто віддав *</label>
        <input type="text" value={from} onChange={(e) => setFrom(e.target.value)}
          placeholder="позивний або підрозділ" />
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Хто прийняв *</label>
        <input type="text" value={to} onChange={(e) => setTo(e.target.value)}
          placeholder="позивний" />
      </div>

      <div style={{ marginTop: 10 }}>
        <label>Стан</label>
        <select value={condition} onChange={(e) => setCondition(e.target.value)}>
          <option value="">—</option>
          {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ marginTop: 10 }}>
        <label>Примітка</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <PhotoField value={photo} onChange={setPhoto} />

      <div className="act-hint">
        Дата: {date}
        {fields.length > 0 && ` · поля листа: ${fields.map((f) => f.label).join(', ')}`}
        {catalog.length > 0 && ` · у листі «${sheet}»: ${catalog.length} поз.`}
        {bindings > 0 && ` · оновимо наявних: ${bindings}`}
      </div>
    </Modal>
  );
}
