import {
  useState, useEffect, useCallback, useRef, useContext, createContext,
} from 'react';

const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) throw new Error('UNAUTHED');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка');
  return data;
};

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
function Login({ onOk }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('/api/login', { method: 'POST', body: { password: pw } });
      onOk();
    } catch (e) {
      setErr('Невірний пароль');
    }
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <div className="login-box">
        <h1 style={{ fontSize: '1.1rem', marginBottom: 18 }}>Облік майна</h1>
        <label>Пароль</label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          style={{ width: '100%' }}
          autoFocus
        />
        <button className="btn" style={{ width: '100%', marginTop: 16 }} onClick={submit} disabled={busy}>
          {busy ? '...' : 'Увійти'}
        </button>
        {err && <div className="err">{err}</div>}
      </div>
    </div>
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

function PhotoField({ value, onChange, showPreview = true }) {
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
      <label>Фото</label>
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
export default function Home() {
  const [authed, setAuthed] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [view, setView] = useState({ kind: 'search', name: null });
  const [state, setState] = useState('');
  const { toasts, push, close } = useToasts();

  useEffect(() => {
    api('/api/login')
      .then((d) => setAuthed(d.authed || !d.required))
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (!authed) return;
    api('/api/sheet')
      .then((d) => setSheets(d.sheets))
      .catch((e) => setState('помилка: ' + e.message));
  }, [authed]);

  // QR-код веде на /?box=КОД — одразу відкриваємо склад і фільтруємо на потрібний ящик
  useEffect(() => {
    if (typeof window === 'undefined' || !sheets.length) return;
    const box = new URLSearchParams(window.location.search).get('box');
    if (!box) return;
    const wh = sheets.find((s) => s.kind === 'warehouse');
    if (wh) setView({ kind: 'warehouse', name: wh.name, box });
    window.history.replaceState({}, '', window.location.pathname);
  }, [sheets]);

  if (authed === null) return <div className="loading">Завантаження…</div>;
  if (!authed) return <Login onOk={() => setAuthed(true)} />;

  return (
    <ToastCtx.Provider value={push}>
      <div className="wrap">
        <header>
          <h1>Облік майна<span className="ver">{VERSION}</span></h1>
          <div className="state">
            {state}
            {BUILD && <span className="build" title="Версія збірки">{BUILD}</span>}
          </div>
        </header>

        <div className="tabs">
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
        </div>

        {view.kind === 'search' && <SearchView sheets={sheets} setState={setState} onOpen={setView} />}
        {view.kind === 'items' && (
          <ItemsView key={view.name + ':' + (view.row || '')} name={view.name} setState={setState} focusRow={view.row} />
        )}
        {view.kind === 'ledger' && <LedgerView key={view.name} name={view.name} setState={setState} />}
        {view.kind === 'warehouse' && <WarehouseView key={view.box || ''} setState={setState} focusCode={view.box} />}
        {view.kind === 'log' && <LogView setState={setState} />}
      </div>
      <ToastHost toasts={toasts} onClose={close} />
    </ToastCtx.Provider>
  );
}

/* ---------- Пошук ---------- */
function SearchView({ setState, onOpen }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const reqId = useRef(0);

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
  }, [q, setState]);

  const groups = res
    ? [
        { title: 'Знайдено за номером', cls: 'primary', data: res.serial },
        { title: 'Рахується за', cls: 'primary', data: res.assigned },
        { title: 'Інші згадки', cls: 'sec', data: res.other },
      ].filter((g) => g.data.length)
    : [];

  return (
    <>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="S/N, позивний, модель, місце, примітка..." autoFocus />
      </div>

      {q.trim().length > 0 && q.trim().length < 2 && (
        <div className="empty">Введіть щонайменше 2 символи</div>
      )}
      {!busy && res && groups.length === 0 && <div className="empty">Нічого не знайдено</div>}

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
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/* ---------- Звичайні листи ---------- */
/** Колонки, що йдуть у тіло картки: без назви, номера, серійника й статусу — вони вже в шапці */
function bodyCols(headers, cols, snIdx, idIdx) {
  return headers
    .map((_, i) => i)
    .filter((i) => i !== 0 && i !== snIdx && i !== idIdx && i !== cols.status);
}

function ItemsView({ name, setState, focusRow }) {
  const [data, setData] = useState(null);
  const [chip, setChip] = useState(null);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [issuing, setIssuing] = useState(null);
  const [highlightRow, setHighlightRow] = useState(focusRow || null);
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

  const save = async (row, colIdx, value, prev) => {
    setState('збереження…');
    try {
      await api('/api/item', { method: 'PATCH', body: { sheet: name, row, col: colIdx, value, prev } });
      setState('синхронізовано');
      toast('Збережено');
    } catch (e) {
      setState('помилка збереження');
      toast('Не вдалося зберегти: ' + e.message, { type: 'err' });
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
        <button className="btn" onClick={() => setAdding(true)}>+ Додати запис</button>
      </div>

      {list.length === 0 ? (
        <div className="empty">Немає записів</div>
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

              <div className="card-body">
                {bodyCols(headers, cols, snIdx, idIdx).map((ci) => (
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
                              toast('Не вдалося повернути: ' + e.message, { type: 'err' });
                            }
                          },
                        },
                      });
                    } catch (e) {
                      setState('помилка: ' + e.message);
                      toast('Не вдалося видалити: ' + e.message, { type: 'err' });
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

function AddItemModal({ headers, cols, statusOptions, typeOptions, hideStatus, onCancel, onSave }) {
  // дату підставляємо сьогоднішню — її однаково майже завжди ставлять поточну
  const [vals, setVals] = useState(() => headers.map((_, i) => (i === cols.date ? todayStr() : '')));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  return (
    <Modal
      title="Новий запис"
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
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
      {headers.map((h, i) => {
        if (hideStatus && i === cols.status) return null;
        return (
        <div key={i} style={{ marginTop: 10 }}>
          <label>{h || 'Поле ' + (i + 1)}</label>
          {i === cols.status || i === cols.type ? (
            <select value={vals[i]} onChange={(e) => setVals((v) => v.map((x, j) => (j === i ? e.target.value : x)))}>
              <option value=""></option>
              {(i === cols.status ? statusOptions : typeOptions).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={vals[i]}
              onChange={(e) => setVals((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
            />
          )}
        </div>
        );
      })}
    </Modal>
  );
}

function IssueModal({ whoOptions = [], whereOptions = [], onCancel, onSave }) {
  const [who, setWho] = useState('');
  const [where, setWhere] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
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
        if (!who && !where) return alert('Вкажіть хоча б позивний або місце');
        setBusy(true);
        setErr('');
        try {
          await onSave({ who, where, date: date.split('-').reverse().join('.') });
        } catch (e) {
          setErr(e.message || 'Помилка збереження');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div style={{ marginTop: 10 }}>
        <label>Кому (позивний)</label>
        <input type="text" list="whoList" value={who} onChange={(e) => setWho(e.target.value)} />
        <datalist id="whoList">{whoOptions.map((w) => <option key={w} value={w} />)}</datalist>
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Куди (місце)</label>
        <input type="text" list="whereList" value={where} onChange={(e) => setWhere(e.target.value)} />
        <datalist id="whereList">{whereOptions.map((w) => <option key={w} value={w} />)}</datalist>
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Дата видачі</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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

  const save = async (row, field, value) => {
    setState('збереження…');
    try {
      const d = await api('/api/ledger', { method: 'POST', body: { sheet: name, action: 'update', row, field, value } });
      setItems(d.items);
      setState('синхронізовано');
      toast('Збережено');
    } catch (e) {
      setState('помилка: ' + e.message);
      toast('Не вдалося зберегти: ' + e.message, { type: 'err' });
    }
  };

  return (
    <>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Пошук за назвою..." />
        <div className="spacer" />
        <button className="btn" onClick={() => setAdding(true)}>+ Додати позицію</button>
      </div>

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
                          toast('Не вдалося повернути: ' + e.message, { type: 'err' });
                        }
                      },
                    },
                  });
                } catch (e) {
                  setState('помилка: ' + e.message);
                  toast('Не вдалося видалити: ' + e.message, { type: 'err' });
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
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
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
          await onSave({ qty: n, date: date.split('-').reverse().join('.') });
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
        <label>Дата</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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

/* ---------- Склад ---------- */
function WarehouseView({ setState, focusCode }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [chip, setChip] = useState(null);
  const [adding, setAdding] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [qr, setQr] = useState(null);
  const [highlight, setHighlight] = useState(focusCode || null);
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

  const save = async (row, field, value, prev) => {
    setState('збереження…');
    try {
      await api('/api/warehouse', { method: 'PATCH', body: { row, field, value, prev } });
      setState('синхронізовано');
      toast('Збережено');
    } catch (e) {
      setState('помилка збереження');
      toast('Не вдалося зберегти: ' + e.message, { type: 'err' });
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
        <button className="btn" onClick={() => setAdding(true)}>+ Додати ящик</button>
      </div>

      {list.length === 0 ? (
        <div className="empty">Немає ящиків</div>
      ) : (
        <div className="grid">
          {list.map((it) => (
            <div className={'card' + (it.code === highlight ? ' highlight' : '')} key={it.row} id={'box-' + it.code}>
              <div className="card-head">
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="wh-code">{it.code}</span>
                  <input className="ghost big" type="text" defaultValue={it.name} placeholder="Назва"
                    onBlur={(e) => e.target.value !== it.name && save(it.row, 'name', e.target.value, it.name)} />
                </div>
                <select
                  className="pill"
                  style={{ color: statusColor(it.status) }}
                  defaultValue={it.status}
                  onChange={(e) => save(it.row, 'status', e.target.value, it.status)}
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
                        onBlur={(e) => e.target.value !== it[field] && save(it.row, field, e.target.value, it[field])} />
                    </span>
                  </div>
                ))}
                <div className="drow">
                  <span className="drow-k">Пріоритет</span>
                  <span className="drow-v">
                    <select className="ghost" defaultValue={it.priority}
                      onChange={(e) => save(it.row, 'priority', e.target.value, it.priority)}
                      title={data.priorities.find((p) => p.value === it.priority)?.label}>
                      {data.priorities.map((p) => (
                        <option key={p.value} value={p.value} title={p.label}>{p.value} — {p.label.split(' — ')[1] || p.label}</option>
                      ))}
                    </select>
                  </span>
                </div>
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
                  save(it.row, 'photoUrl', url, prev);
                }}
              />

              <div className="actions">
                <button className="act-btn act-qr" onClick={() => setQr(it)}>QR</button>
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
                            toast('Не вдалося повернути: ' + e.message, { type: 'err' });
                          }
                        },
                      },
                    });
                  } catch (e) {
                    setState('помилка: ' + e.message);
                    toast('Не вдалося видалити: ' + e.message, { type: 'err' });
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

function LogView({ setState }) {
  const [entries, setEntries] = useState(null);
  const [q, setQ] = useState('');

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
        [e.date, e.sheet, e.action, e.field, e.before, e.after].join(' ').toLowerCase()
          .includes(q.trim().toLowerCase()))
    : entries;

  return (
    <>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Пошук у журналі: лист, дія, значення..." />
        <div className="spacer" />
        <button className="btn" onClick={load}>Оновити</button>
      </div>

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
    </>
  );
}
