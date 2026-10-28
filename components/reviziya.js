/**
 * Звірка: обхід із телефоном і зведення розбіжностей.
 *
 * Розділ живе окремо від решти сторінки, бо в нього своя логіка часу:
 * звірку починають, ведуть днями й закривають, а не редагують запис за
 * записом. Із спільної абетки йому потрібні сім слів — стільки ж, скільки
 * будь-якому іншому розділу, тож шов між ними чистий.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { api, Modal, SearchBox, QrScanner, IconQr, parseCode, useToast } from './base';

const RESULT = { ok: 'Є', missing: 'Немає', diff: 'Розбіжність' };

// Причини, чому речі немає на місці. Найчастіші — в один дотик, решту
// можна дописати словами: без причини «немає» нічого не пояснює.
const REASONS = [
  'видано на руки',
  'в іншому місці',
  'у ремонті',
  'втрачено',
  'списано',
  'не знайшли',
];

/**
 * Останнє слово за найсвіжішою позначкою рядка: під час обходу ту саму річ
 * можуть позначити двічі — спершу «немає», потім із причиною.
 */
function lastMarks(lines) {
  const m = new Map();
  (lines || []).forEach((l) => m.set(`${l.sheet}#${l.row}`, l));
  return m;
}

export function AuditView({ setState }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [onlyLeft, setOnlyLeft] = useState(true);
  const [marks, setMarks] = useState({}); // ключ рядка → { result, fact }
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [scan, setScan] = useState(false);
  const [detail, setDetail] = useState(null); // ID звірки, яку розглядаємо
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
        seen[`${l.sheet}#${l.row}`] = { result: l.result, fact: l.fact, note: l.note };
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
    } catch {
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

  if (detail) return <AuditDetail id={detail} onBack={() => setDetail(null)} setState={setState} />;

  if (!data) return <div className="loading">Завантаження…</div>;

  const mark = (item, result, fact = '', note = '') => {
    const key = `${item.sheet}#${item.row}`;
    setMarks((p) => ({ ...p, [key]: { result, fact, note } }));
    setState('запис…');
    queue.current.push({
      sheet: item.sheet, row: item.row, name: item.name, ident: item.ident,
      expected: item.expected, fact, result, note,
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
              <div
                className="log-row log-row-click"
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetail(a.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setDetail(a.id); }}
              >
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
                  <div className="audit-open">Показати перелік →</div>
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

  // Ховаємо лише підтверджене. Те, чого немає, лишається на видноті, поки не
  // скажете чому: інакше позначка зникає разом із можливістю пояснити.
  let list = expected;
  if (onlyLeft) list = list.filter((it) => marks[`${it.sheet}#${it.row}`]?.result !== RESULT.ok);
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
        <button type="button" className={'chip' + (onlyLeft ? ' on' : '')} onClick={() => setOnlyLeft(!onlyLeft)}>
          {onlyLeft ? 'Ховати підтверджені' : 'Показувати всі'}
        </button>
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
                {m && m.result !== RESULT.ok && (
                  <WhyRow
                    value={m.note || ''}
                    onPick={(note) => mark(it, m.result, m.fact || '', note)}
                  />
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

/**
 * Причина під позначкою «немає». Найчастіші — в один дотик; якщо жодна не
 * підходить, розкривається поле для своїх слів. Причина пишеться окремою
 * позначкою, тож обхід не гальмує: спершу відмітили, потім пояснили.
 */
function WhyRow({ value, onPick }) {
  const own = value && !REASONS.includes(value);
  const [free, setFree] = useState(own);
  const [text, setText] = useState(own ? value : '');

  return (
    <div className="audit-why">
      <span className="audit-why-l">Чому:</span>
      {REASONS.map((r) => (
        <button
          key={r}
          className={'why-chip' + (value === r ? ' on' : '')}
          onClick={() => { setFree(false); onPick(value === r ? '' : r); }}
        >
          {r}
        </button>
      ))}
      {free ? (
        <input
          className="why-own"
          type="text"
          autoFocus={!own}
          placeholder="своїми словами"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => { if (text.trim() !== (value || '')) onPick(text.trim()); }}
        />
      ) : (
        <button className="why-chip" onClick={() => setFree(true)}>інше…</button>
      )}
    </div>
  );
}

/**
 * Розбір однієї звірки: не «19 немає», а які саме дев'ятнадцять і чому.
 * Поруч із позначкою показуємо, що про річ каже база зараз — часто цього
 * досить, щоб зрозуміти причину без розпитувань.
 */
function AuditDetail({ id, onBack, setState }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('missing');
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setState('завантаження…');
      try {
        const r = await api('/api/audit?id=' + encodeURIComponent(id));
        if (!alive) return;
        setD(r);
        setState('синхронізовано');
      } catch (e) {
        if (!alive) return;
        setErr(e.message);
        setState('помилка: ' + e.message);
      }
    })();
    return () => { alive = false; };
  }, [id, setState]);

  if (err) return (
    <>
      <div className="toolbar"><button className="act-btn" onClick={onBack}>← до списку</button></div>
      <div className="empty">{err}</div>
    </>
  );
  if (!d) return <div className="loading">Завантаження…</div>;

  const marks = lastMarks(d.lines);
  const a = d.audit;

  // Кожна позиція обсягу + її позначка. Те, чого не позначили, — теж
  // результат: «не дійшли» це не «є».
  const rows = d.expected.map((it) => {
    const m = marks.get(`${it.sheet}#${it.row}`);
    return {
      ...it,
      result: m?.result || '',
      fact: m?.fact || '',
      note: m?.note || '',
      who: m?.who || '',
      time: m?.time || '',
      group: !m ? 'skip'
        : m.result === RESULT.ok ? 'ok'
        : m.result === RESULT.diff ? 'diff' : 'missing',
    };
  });

  // Позначки на рядки, яких у обсязі вже немає: річ могли видалити після
  // звірки. Мовчки губити їх не можна — показуємо окремо.
  const seen = new Set(d.expected.map((it) => `${it.sheet}#${it.row}`));
  [...marks.entries()].forEach(([key, m]) => {
    if (seen.has(key)) return;
    rows.push({
      sheet: m.sheet, row: m.row, name: m.name, ident: m.ident,
      hint: 'рядка вже немає в базі', expected: m.expected,
      result: m.result, fact: m.fact, note: m.note, who: m.who, time: m.time,
      group: m.result === RESULT.ok ? 'ok' : m.result === RESULT.diff ? 'diff' : 'missing',
    });
  });

  const count = (g) => rows.filter((r) => r.group === g).length;
  const TABS = [
    { key: 'missing', label: 'Немає', cls: 'a-miss' },
    { key: 'diff', label: 'Розбіжності', cls: 'a-diff' },
    { key: 'skip', label: 'Не перевірено', cls: 'a-skip' },
    { key: 'ok', label: 'Є', cls: 'a-ok' },
  ].filter((t) => t.key === 'missing' || count(t.key) > 0);

  const needle = q.trim().toLowerCase();
  const list = rows
    .filter((r) => r.group === tab)
    .filter((r) => !needle || [r.name, r.ident, r.hint, r.note]
      .some((v) => (v || '').toString().toLowerCase().includes(needle)));

  // Чому саме немає — зведення по причинах, щоб одразу бачити картину
  const why = new Map();
  rows.filter((r) => r.group === 'missing').forEach((r) => {
    const k = r.note || 'причину не вказано';
    why.set(k, (why.get(k) || 0) + 1);
  });

  return (
    <>
      <div className="toolbar">
        <button className="act-btn" onClick={onBack}>← до списку</button>
        <div className="spacer" />
        <span className="id-badge">{a.id}</span>
        <span className="badge">{a.scope}</span>
      </div>

      <div className="audit-sum">
        <div className="audit-sum-top">
          {a.date} {a.time} · {a.status}
          {a.who ? <> · {a.who}</> : null}
        </div>
        <div className="audit-nums">
          <span>Очікувано: <b>{a.expected}</b></span>
          <span className="a-ok">Є: <b>{count('ok')}</b></span>
          <span className="a-miss">Немає: <b>{count('missing')}</b></span>
          {count('diff') > 0 && <span className="a-diff">Розбіжності: <b>{count('diff')}</b></span>}
          {count('skip') > 0 && <span className="a-skip">Не перевірено: <b>{count('skip')}</b></span>}
        </div>
        {a.note && <div className="act-note">{a.note}</div>}
        {why.size > 0 && (
          <div className="audit-why-sum">
            {[...why.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => (
              <span key={k} className="why-tag">{k} — <b>{n}</b></span>
            ))}
          </div>
        )}
      </div>

      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Знайти в цій звірці…" />
      </div>

      <div className="audit-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={'audit-tab ' + t.cls + (tab === t.key ? ' on' : '')}
            onClick={() => setTab(t.key)}
          >
            {t.label} <b>{count(t.key)}</b>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="empty">
          {needle ? 'Нічого не знайдено' : 'Тут порожньо — і це добре.'}
        </div>
      ) : (
        <div className="audit-list">
          {list.map((r) => (
            <div className={'audit-item audit-res-' + r.group} key={r.sheet + '#' + r.row + r.name}>
              <div className="audit-what">
                <div className="audit-name">{r.name || '—'}</div>
                <div className="audit-meta">
                  {r.ident && <span className="audit-ident">{r.ident}</span>}
                  {r.hint && <span>у базі: {r.hint}</span>}
                  {r.group === 'diff' && (
                    <span className="a-diff">мало бути {r.expected}, порахували {r.fact}</span>
                  )}
                </div>
                {r.note && <div className="audit-note">Чому: {r.note}</div>}
                {r.group === 'missing' && !r.note && (
                  <div className="audit-note audit-note-empty">Причину не вказали</div>
                )}
                {(r.who || r.time) && (
                  <div className="audit-by">
                    {r.who}{r.who && r.time ? ' · ' : ''}{r.time}
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

