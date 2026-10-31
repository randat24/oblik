/**
 * Майно служби звʼязку: реєстр, рух, акти наявності, штат, імпорт.
 *
 * Раніше все це було файлом Excel, де пошук серійника — Ctrl+F по шести
 * аркушах, а акт наявності збирали руками, переносячи рядки з «робочої».
 * Тут реєстр — єдине джерело: дії над позицією (списати, подати ПБД,
 * прийняти, перемістити) міняють лічильники й самі дописують історію, а акт
 * складається з поточного стану одним натисканням.
 *
 * Правила обліку — у `lib/zv.js`; тут лише екран. Ззовні розділ бере тільки
 * спільну абетку з `components/base`.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  api, Modal, SearchBox, Stat, Combo, Totals, useToast, saveFailed, plural,
} from './base';
import { DatePicker } from './date-picker';
import { kyivToday } from '../lib/calendar';
import { money } from '../lib/fund';
import {
  matches, stateOf, STATE_LABELS, placesOf, inPlace, totals, serialsOf, countCat, makeAct, retitle,
  normStatus, suggestKeys, isoOf, sheetCsv, registerTable, actTable, MOVE_KINDS,
} from '../lib/zv';

const TABS = [
  ['reg', 'Реєстр'],
  ['moves', 'Рух'],
  ['acts', 'Акти'],
  ['norms', 'Штат'],
  ['import', 'Імпорт'],
];

const STATE_TONE = { ok: 'var(--green)', partial: 'var(--amber)', lost: 'var(--red)', gone: 'var(--gray)' };
const CATS = ['прид', 'І', 'ІІ'];
const PAGE = 60;

/** Файл на телефон чи компʼютер: у браузері це посилання, натиснуте за людину */
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const units = (n) => plural(n, ['одиниця', 'одиниці', 'одиниць']);

export function ZvView({ setState }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('reg');

  const load = useCallback(async () => {
    setState('завантаження…');
    try {
      const d = await api('/api/zv');
      setData(d);
      setState('синхронізовано');
      // порожній реєстр — перше, що треба, це перенести файл
      if (!d.positions.length) setTab((t) => (t === 'reg' ? 'import' : t));
    } catch (e) {
      setState('помилка: ' + e.message);
    }
  }, [setState]);

  useEffect(() => { load(); }, [load]);

  /** Запис і одразу свіжий стан: таблицю могли правити й руками */
  const send = useCallback(async (body, label) => {
    setState('збереження…');
    try {
      await api('/api/zv', { method: 'POST', body, label });
      await load();
      return true;
    } catch (e) {
      setState('помилка: ' + e.message);
      if (e.offline) { saveFailed(toast, e); return true; }
      throw e;
    }
  }, [load, setState, toast]);

  if (!data) return <div className="loading">Завантаження…</div>;

  return (
    <>
      <h2 className="zv-h1">Майно служби звʼязку</h2>
      <div className="tabs zv-tabs" role="tablist" aria-label="Розділи майна звʼязку">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k}
            className={'tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>
            {label}
            {k === 'reg' && data.positions.length > 0 && <span className="count">{data.positions.length}</span>}
            {k === 'acts' && data.acts.length > 0 && <span className="count">{data.acts.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'reg' && <Register data={data} send={send} toast={toast} />}
      {tab === 'moves' && <Moves data={data} />}
      {tab === 'acts' && <Acts data={data} send={send} toast={toast} />}
      {tab === 'norms' && <Norms data={data} send={send} toast={toast} />}
      {tab === 'import' && <Import data={data} onDone={() => { load(); setTab('reg'); }} toast={toast} />}
    </>
  );
}

/* ====================== Реєстр ====================== */

function Register({ data, send, toast }) {
  const [q, setQ] = useState('');
  const [state, setStateF] = useState('');
  const [place, setPlace] = useState('');
  const [cat, setCat] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [move, setMove] = useState(null);
  const [edit, setEdit] = useState(null);
  const [hist, setHist] = useState(null);

  const all = data.positions;
  const places = useMemo(() => placesOf(all), [all]);
  const list = all.filter((p) => matches(p, q)
    && (!state || stateOf(p) === state || (state === 'short' && p.shortage > 0))
    && inPlace(p, place)
    && (!cat || p.cat === cat));
  const t = totals(all);
  const shown = totals(list);
  const filtered = q || state || place || cat;
  const shortCount = all.filter((p) => p.shortage > 0).length;
  const goneCount = all.filter((p) => stateOf(p) === 'gone').length;

  useEffect(() => { setLimit(PAGE); }, [q, state, place, cat]);

  if (!all.length) {
    return (
      <div className="empty">
        Реєстр порожній. Перенесіть файл Excel на вкладці «Імпорт» або додайте позицію вручну.
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => setEdit({})}>Нова позиція</button>
        </div>
        {edit && <EditForm pos={null} places={places} onCancel={() => setEdit(null)}
          onSave={async (body) => { await send({ action: 'add', ...body }); setEdit(null); toast('Позицію додано'); }} />}
      </div>
    );
  }

  return (
    <>
      <div className="stats zv-stats">
        <Stat label="На обліку" value={t.counted} sub={`${t.positions} ${plural(t.positions, ['позиція', 'позиції', 'позицій'])} у реєстрі`} />
        <Stat label="В наявності" value={t.onHand} tone="ok" sub={`${units(t.onHand)} фізично є`} />
        <Stat label="Нестача (ПБД)" value={t.shortage} tone={t.shortage ? 'warn' : undefined}
          sub={shortCount ? `у ${shortCount} ${plural(shortCount, ['позиції', 'позиціях', 'позиціях'])}` : 'немає'} />
        {/* повна сума в плитку не влазить — там мільйони, а копійки є нижче */}
        <Stat label="Вартість на обліку" value={`${(t.value / 1e8).toFixed(2).replace('.', ',')} млн`}
          sub={`${money(t.value)} грн за цінами накладних`} />
      </div>

      <div className="toolbar">
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <SearchBox value={q} onChange={setQ} placeholder="Назва, серійний номер, накладна, підрозділ…" />
        </div>
        <button type="button" className="btn" onClick={() => setEdit({})}>Нова позиція</button>
        <button type="button" className="act-btn zv-tool"
          onClick={() => download(`reyestr-zvyazok-${kyivToday()}.csv`, sheetCsv(registerTable(list)))}>
          Вивантажити CSV
        </button>
      </div>

      <div className="zv-filters">
        <div className="chips" role="group" aria-label="Стан">
          {[['', 'Усі'], ['ok', 'В наявності'], ['short', `Нестача · ${shortCount}`], ['gone', `Списано · ${goneCount}`]].map(([k, l]) => (
            <button key={k || 'all'} type="button" className={'chip' + (state === k ? ' on' : '')}
              aria-pressed={state === k} onClick={() => setStateF(state === k && k ? '' : k)}>{l}</button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Категорія">
          {CATS.map((c) => (
            <button key={c} type="button" className={'chip' + (cat === c ? ' on' : '')}
              aria-pressed={cat === c} onClick={() => setCat(cat === c ? '' : c)}>Кат. {c}</button>
          ))}
        </div>
        {/* підрозділів десятки, і назви довгі — чипами вони займали б пів
            екрана, тож тут звичайний список */}
        {places.length > 0 && (
          <select className="zv-place" aria-label="Підрозділ" value={place} onChange={(e) => setPlace(e.target.value)}>
            <option value="">Усі підрозділи</option>
            {places.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        )}
      </div>

      <Totals
        parts={[['Позицій', list.length], ['На обліку', shown.counted], ['В наявності', shown.onHand],
          ['Нестача', shown.shortage || null], ['Вартість', money(shown.value)]]}
        of={filtered ? all.length : undefined}
      />
      {filtered && (
        <button type="button" className="chip is-clear" style={{ marginBottom: 10 }}
          onClick={() => { setQ(''); setStateF(''); setPlace(''); setCat(''); }}>Скинути фільтри</button>
      )}

      {list.length === 0 && <div className="empty">Нічого не знайдено. Спробуйте інше слово або скиньте фільтри.</div>}
      <div className="grid">
        {list.slice(0, limit).map((p) => (
          <PosCard key={p.id || p.row} p={p} q={q}
            onMove={(kind) => setMove({ p, kind })}
            onEdit={() => setEdit(p)}
            onHistory={() => setHist(p)} />
        ))}
      </div>
      {list.length > limit && (
        <button type="button" className="btn zv-more" onClick={() => setLimit(limit + PAGE)}>
          Показати ще {Math.min(PAGE, list.length - limit)} з {list.length - limit}
        </button>
      )}

      {move && (
        <MoveForm p={move.p} kind={move.kind} places={places} onCancel={() => setMove(null)}
          onSave={async (body) => {
            await send({ action: 'move', id: move.p.id, kind: move.kind, ...body }, `${MOVE_KINDS[move.kind]}: ${move.p.name}`);
            setMove(null);
            toast(`${MOVE_KINDS[move.kind]}: ${move.p.name}`);
          }} />
      )}
      {edit && (
        <EditForm pos={edit.id ? edit : null} places={places} onCancel={() => setEdit(null)}
          onSave={async (body) => {
            await send(edit.id ? { action: 'edit', id: edit.id, ...body } : { action: 'add', ...body });
            setEdit(null);
            toast(edit.id ? 'Зміни збережено' : 'Позицію додано');
          }} />
      )}
      {hist && <History p={hist} moves={data.moves} onClose={() => setHist(null)} />}
    </>
  );
}

/** Підсвітити серійник, за яким знайшли позицію, — інакше в переліку з двадцяти його не видно */
function Serials({ text, q }) {
  const list = serialsOf(text);
  if (!list.length) return <span className="muted">—</span>;
  const words = q.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return (
    <span className="zv-sn">
      {list.map((s) => (
        <span key={s} className={words.some((w) => s.toLowerCase().includes(w)) ? 'hit' : ''}>{s}</span>
      ))}
    </span>
  );
}

function PosCard({ p, q, onMove, onEdit, onHistory }) {
  const st = stateOf(p);
  const rows = [
    ['Рахується / кат.', countCat(p)],
    ['Посада', p.post],
    ['Підрозділ', p.place],
    ['Накладна', [p.invoice, p.invoiceDate].filter(Boolean).join(' від ')],
    ['Ціна', p.price ? `${money(p.price)} × ${p.counted} = ${money(p.value)} грн` : ''],
  ].filter(([, v]) => v);
  const hasSerials = serialsOf(p.serials).length > 0;

  return (
    <article className="card zv-card" aria-label={p.name}>
      <div className="card-head">
        <div className="card-title">
          <div className="title-line">
            <span className="id-badge" title="Номер у реєстрі">{p.no || '—'}</span>
            <span className="zv-name">{p.name}</span>
          </div>
        </div>
        <span className="pill" style={{ color: STATE_TONE[st], cursor: 'default' }}>{STATE_LABELS[st]}</span>
      </div>

      <div className="zv-counts" aria-label="Кількість">
        <div><b>{p.onHand}</b><span>в наявності</span></div>
        <div><b>{p.counted}</b><span>на обліку</span></div>
        <div className={p.shortage ? 'is-short' : ''}><b>{p.shortage}</b><span>нестача</span></div>
        <div><b>{p.received}</b><span>отримано{p.writtenOff ? `, списано ${p.writtenOff}` : ''}</span></div>
      </div>

      <div className="card-body">
        {rows.map(([k, v]) => (
          <div className="drow" key={k}><span className="drow-k">{k}</span><span className="drow-v">{v}</span></div>
        ))}
        {hasSerials && (
          <div className="drow">
            <span className="drow-k">Серійні в наявності</span>
            <span className="drow-v"><Serials text={p.serialsOnHand} q={q} /></span>
          </div>
        )}
        {hasSerials && p.serials !== p.serialsOnHand && (
          <div className="drow">
            <span className="drow-k">Усі серійні</span>
            <span className="drow-v"><Serials text={p.serials} q={q} /></span>
          </div>
        )}
      </div>
      {p.note && <Note text={p.note} />}

      <div className="actions">
        <button type="button" className="act-btn act-lost" disabled={p.onHand <= 0} onClick={() => onMove('writeoff')}>Списати</button>
        <button type="button" className="act-btn" disabled={p.onHand <= 0} onClick={() => onMove('pbd')}>ПБД</button>
        <button type="button" className="act-btn act-issue" onClick={() => onMove('receive')}>Надійшло</button>
        <button type="button" className="act-btn" onClick={() => onMove('relocate')}>Перемістити</button>
        <button type="button" className="act-btn" onClick={onEdit}>Правка</button>
        <button type="button" className="act-btn" onClick={onHistory}>Історія</button>
      </div>
    </article>
  );
}

/**
 * Примітка позиції — це її паперова історія: «2 од. - ПБД 6123», «списано
 * наказом…», і буває вона на десяток рядків. Показуємо початок, решту — на
 * дотик, щоб одна позиція не розтягувала сітку на екран.
 */
function Note({ text }) {
  const [all, setAll] = useState(false);
  const lines = text.split('\n');
  const long = lines.length > 3 || text.length > 220;
  const shown = all || !long ? text : lines.slice(0, 3).join('\n').slice(0, 220) + '…';
  return (
    <div className="note zv-note">
      <span className="note-l">Примітка</span>
      <span>
        {shown}
        {long && (
          <button type="button" className="zv-link" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? 'згорнути' : 'усе'}
          </button>
        )}
      </span>
    </div>
  );
}

const MOVE_TEXT = {
  writeoff: { title: 'Списати за наказом', doc: 'Номер наказу', hint: 'Списане зникає з обліку: «рахується» зменшиться.' },
  pbd: { title: 'Подати за ПБД (втрата)', doc: 'Номер ПБД', hint: 'Лишається на обліку, але стає нестачею, доки його не спишуть наказом.' },
  receive: { title: 'Надійшло', doc: 'Накладна (необовʼязково)', hint: 'Отримане додається до цієї позиції. Нова партія з іншою накладною — краще окремою позицією.' },
  relocate: { title: 'Перемістити в інший підрозділ', doc: '', hint: '' },
};

function MoveForm({ p, kind, places, onCancel, onSave }) {
  const txt = MOVE_TEXT[kind];
  const have = serialsOf(p.serialsOnHand);
  const [qty, setQty] = useState(kind === 'relocate' ? '' : '1');
  const [doc, setDoc] = useState('');
  const [docDate, setDocDate] = useState(kyivToday());
  const [picked, setPicked] = useState([]);
  const [fresh, setFresh] = useState('');
  const [place, setPlace] = useState(p.place);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const out = kind === 'writeoff' || kind === 'pbd';

  const toggle = (s) => {
    const next = picked.includes(s) ? picked.filter((x) => x !== s) : [...picked, s];
    setPicked(next);
    // вибрали серійники — кількість іде за ними, рахувати вдруге не треба
    if (next.length) setQty(String(next.length));
  };

  return (
    <Modal title={`${txt.title}`} saveLabel="Записати" onCancel={onCancel} busy={busy} error={err}
      onSave={async () => {
        setErr('');
        const n = Number(qty);
        if (kind !== 'relocate' && (!Number.isInteger(n) || n <= 0)) return setErr('Вкажіть кількість — ціле число');
        if (out && n > p.onHand) return setErr(`У наявності лише ${p.onHand}`);
        if (out && !doc.trim()) return setErr(`Вкажіть: ${txt.doc.toLowerCase()}`);
        if (kind === 'relocate' && place.trim() === p.place) return setErr('Підрозділ не змінився');
        setBusy(true);
        try {
          await onSave({
            qty: n || 0, doc: doc.trim(), docDate: doc.trim() ? docDate : '', note: note.trim(), place: place.trim(),
            serials: out ? picked : serialsOf(fresh),
          });
        } catch (e) { setErr(e.message); setBusy(false); }
      }}>
      <div className="zv-move-head">
        <b>{p.name}</b>
        <span>в наявності {p.onHand} · на обліку {p.counted}{p.place ? ` · ${p.place}` : ''}</span>
      </div>
      {txt.hint && <div className="dlv-tip" style={{ marginBottom: 10 }}>{txt.hint}</div>}

      {kind !== 'relocate' && (
        <div className="zv-row2">
          <div>
            <label>Кількість</label>
            <input type="number" inputMode="numeric" min="1" max={out ? p.onHand : undefined}
              value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label>{txt.doc}</label>
            <input type="text" value={doc} onChange={(e) => setDoc(e.target.value)}
              placeholder={kind === 'pbd' ? '6123' : kind === 'writeoff' ? '№ 412' : ''} />
          </div>
        </div>
      )}
      {kind !== 'relocate' && doc.trim() && (
        <div style={{ marginTop: 10 }}>
          <DatePicker label="Дата документа" value={docDate} onChange={setDocDate} />
        </div>
      )}

      {out && have.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <label>Які саме — серійні номери{picked.length ? ` · вибрано ${picked.length}` : ''}</label>
          <div className="chips">
            {have.map((s) => (
              <button key={s} type="button" className={'chip zv-sn-chip' + (picked.includes(s) ? ' on' : '')}
                aria-pressed={picked.includes(s)} onClick={() => toggle(s)}>{s}</button>
            ))}
          </div>
        </div>
      )}
      {kind === 'receive' && (
        <div style={{ marginTop: 10 }}>
          <label>Серійні номери нових (кожен з нового рядка)</label>
          <textarea rows={2} value={fresh} onChange={(e) => setFresh(e.target.value)} />
        </div>
      )}
      {kind === 'relocate' && (
        <div style={{ marginTop: 10 }}>
          <label>Куди</label>
          <Combo value={place} options={places} onChange={setPlace} placeholder="Підрозділ" autoFocus />
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <label>Примітка</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="необовʼязково" />
      </div>
    </Modal>
  );
}

const FIELDS = [
  ['name', 'Найменування', 'text'],
  ['unit', 'Од. вим.', 'text'],
  ['post', 'Посада', 'text'],
  ['cat', 'Категорія', 'cat'],
  ['received', 'Отримано', 'int'],
  ['writtenOff', 'Списано', 'int'],
  ['submitted', 'Подано (ПБД)', 'int'],
  ['wrongCat', 'Не відп. категорії', 'int'],
  ['invoice', 'Накладна', 'text'],
  ['invoiceDate', 'Дата накладної', 'text'],
  ['price', 'Ціна за одиницю, грн', 'money'],
  ['place', 'Підрозділ', 'place'],
  ['serials', 'Серійні номери (усі)', 'area'],
  ['serialsOnHand', 'Серійні в наявності', 'area'],
  ['note', 'Примітка', 'area'],
];

function EditForm({ pos, places, onCancel, onSave }) {
  const init = () => {
    const f = {};
    FIELDS.forEach(([k, , type]) => {
      const v = pos ? pos[k] : '';
      f[k] = type === 'money' ? (v ? money(v).replace(/\s/g, '') : '') : String(v ?? (type === 'int' ? 0 : ''));
    });
    if (!pos) { f.unit = 'шт'; f.received = '1'; }
    return f;
  };
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const up = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const counted = Number(f.received || 0) - Number(f.writtenOff || 0);
  const onHand = counted - Number(f.submitted || 0);

  return (
    <Modal title={pos ? 'Правка позиції' : 'Нова позиція'} onCancel={onCancel} busy={busy} error={err}
      onSave={async () => {
        setErr('');
        if (!f.name.trim()) return setErr('Вкажіть найменування');
        if (counted < 0) return setErr('Списано більше, ніж отримано');
        if (onHand < 0) return setErr('Подано більше, ніж рахується');
        setBusy(true);
        const body = {};
        FIELDS.forEach(([k, , type]) => { body[k] = type === 'int' ? Number(f[k] || 0) : f[k]; });
        // нова позиція: якщо серійники «в наявності» не вписали — вони ті самі, що й усі
        if (!pos && !f.serialsOnHand.trim()) delete body.serialsOnHand;
        try { await onSave(body); } catch (e) { setErr(e.message); setBusy(false); }
      }}>
      {pos && (
        <div className="dlv-tip" style={{ marginBottom: 10 }}>
          Для списання, ПБД чи надходження краще кнопки на картці: вони вимагають документ і
          пишуть його в історію. Тут — виправлення помилок.
        </div>
      )}
      <div className="zv-form">
        {FIELDS.map(([k, label, type]) => (
          <div key={k} className={type === 'area' || k === 'name' ? 'wide' : ''}>
            <label>{label}</label>
            {type === 'area' && <textarea rows={2} value={f[k]} onChange={(e) => up(k, e.target.value)} />}
            {type === 'int' && <input type="number" inputMode="numeric" min="0" value={f[k]} onChange={(e) => up(k, e.target.value)} />}
            {type === 'money' && <input type="text" inputMode="decimal" value={f[k]} onChange={(e) => up(k, e.target.value)} placeholder="0,00" />}
            {type === 'text' && <input type="text" value={f[k]} onChange={(e) => up(k, e.target.value)} />}
            {type === 'place' && <Combo value={f[k]} options={places} onChange={(v) => up(k, v)} placeholder="Підрозділ" />}
            {type === 'cat' && (
              <select value={f[k]} onChange={(e) => up(k, e.target.value)}>
                <option value="">—</option>
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>
      <div className="totals" style={{ marginTop: 10 }}>
        <span>На обліку <b>{counted}</b></span><span className="totals-sep">·</span>
        <span>В наявності <b>{onHand}</b></span>
      </div>
    </Modal>
  );
}

function History({ p, moves, onClose }) {
  const mine = moves.filter((m) => m.pos === p.id);
  return (
    <Modal title="Історія позиції" onCancel={onClose} onSave={onClose} saveLabel="Закрити">
      <div className="zv-move-head"><b>{p.name}</b><span>№ {p.no} · додано {p.added || '—'}</span></div>
      {mine.length === 0 && <div className="empty">У застосунку з цією позицією ще нічого не робили.</div>}
      <ul className="zv-moves">
        {mine.map((m) => <MoveLine key={m.id || m.row} m={m} />)}
      </ul>
      {p.note && (
        <>
          <h3 className="sec" style={{ marginTop: 14 }}>З паперового обліку</h3>
          <div className="note"><span style={{ whiteSpace: 'pre-line' }}>{p.note}</span></div>
        </>
      )}
    </Modal>
  );
}

function MoveLine({ m, showName }) {
  return (
    <li className="zv-move">
      <div className="zv-move-top">
        <span className="zv-kind">{m.kind}</span>
        {m.qty > 0 && <b>{m.qty}</b>}
        {m.doc && <span className="zv-doc">{m.doc}</span>}
        <span className="spacer" />
        <span className="muted">{m.date} {m.time}{m.who ? ` · ${m.who}` : ''}</span>
      </div>
      {showName && <div className="zv-move-name">{m.name}</div>}
      {(m.serials || m.place || m.note) && (
        <div className="muted zv-move-more">
          {[m.serials, m.place, m.note].filter(Boolean).join(' · ')}
        </div>
      )}
    </li>
  );
}

/* ====================== Рух ====================== */

function Moves({ data }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [limit, setLimit] = useState(100);
  const kinds = Object.values(MOVE_KINDS);
  const words = q.trim().toLowerCase();
  const list = data.moves.filter((m) => (!kind || m.kind === kind)
    && (!words || [m.name, m.doc, m.serials, m.place, m.note, m.who].join(' ').toLowerCase().includes(words)));

  return (
    <>
      <div className="toolbar">
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <SearchBox value={q} onChange={setQ} placeholder="Назва, документ, серійний номер, хто…" />
        </div>
      </div>
      <div className="chips" role="group" aria-label="Дія">
        {kinds.map((k) => (
          <button key={k} type="button" className={'chip' + (kind === k ? ' on' : '')}
            aria-pressed={kind === k} onClick={() => setKind(kind === k ? '' : k)}>{k}</button>
        ))}
      </div>
      {list.length === 0 && <div className="empty">Записів руху немає. Вони зʼявляться після першої дії з позицією.</div>}
      <ul className="zv-moves card">
        {list.slice(0, limit).map((m) => <MoveLine key={m.id || m.row} m={m} showName />)}
      </ul>
      {list.length > limit && (
        <button type="button" className="btn zv-more" onClick={() => setLimit(limit + 100)}>Показати ще</button>
      )}
    </>
  );
}

/* ====================== Акти ====================== */

function Acts({ data, send, toast }) {
  const [make, setMake] = useState(false);
  const [open, setOpen] = useState(null);

  return (
    <>
      <div className="toolbar">
        <div className="muted" style={{ flex: '1 1 260px' }}>
          Акт наявності складається з реєстру: кожна позиція, що рахується, з наявністю й нестачею.
        </div>
        <button type="button" className="btn" disabled={!data.positions.length} onClick={() => setMake(true)}>Новий акт</button>
      </div>
      {data.acts.length === 0 && <div className="empty">Актів ще немає.</div>}
      <div className="grid">
        {data.acts.map((a) => {
          const short = a.items.reduce((s, x) => s + x.shortage, 0);
          const onHand = a.items.reduce((s, x) => s + x.onHand, 0);
          return (
            <article className="card zv-act" key={a.key}>
              <div className="card-head">
                <div className="card-title">
                  <div className="zv-name">Станом на {a.date || '—'}</div>
                  <div className="muted zv-act-sub">{a.who}{a.created ? ` · ${a.created}` : ''}</div>
                </div>
              </div>
              <div className="zv-counts">
                <div><b>{a.items.length}</b><span>рядків</span></div>
                <div><b>{onHand}</b><span>в наявності</span></div>
                <div className={short ? 'is-short' : ''}><b>{short}</b><span>нестача</span></div>
              </div>
              <div className="actions">
                <button type="button" className="act-btn" onClick={() => setOpen(a)}>Відкрити й друк</button>
                <button type="button" className="act-btn"
                  onClick={() => download(`akt-${isoOf(a.date)}.csv`, sheetCsv(actTable(a)))}>CSV</button>
              </div>
            </article>
          );
        })}
      </div>
      {make && (
        <ActForm data={data} onCancel={() => setMake(false)}
          onSave={async (body) => { await send({ action: 'act', ...body }); setMake(false); toast('Акт складено'); }} />
      )}
      {open && <ActSheet act={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ActForm({ data, onCancel, onSave }) {
  const last = data.acts[0];
  const [date, setDate] = useState(kyivToday());
  const [merge, setMerge] = useState(false);
  const [head, setHead] = useState(last?.head || '');
  const [footer, setFooter] = useState(last?.footer || '');
  const [titleEdited, setTitleEdited] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const title = titleEdited ?? retitle(last?.title, date);
  const items = makeAct(data.positions, { merge });
  const short = items.reduce((s, x) => s + x.shortage, 0);

  return (
    <Modal title="Новий акт наявності" saveLabel="Скласти акт" onCancel={onCancel} busy={busy} error={err}
      onSave={async () => {
        setBusy(true); setErr('');
        try { await onSave({ date, merge, head, title, footer }); } catch (e) { setErr(e.message); setBusy(false); }
      }}>
      <DatePicker label="Станом на" value={date} onChange={(d) => { setDate(d); setTitleEdited(null); }} />
      <div style={{ marginTop: 10 }}>
        <label>Рядки</label>
        <div className="chips">
          <button type="button" className={'chip' + (!merge ? ' on' : '')} aria-pressed={!merge} onClick={() => setMerge(false)}>
            Кожна накладна окремо
          </button>
          <button type="button" className={'chip' + (merge ? ' on' : '')} aria-pressed={merge} onClick={() => setMerge(true)}>
            Однакове майно разом
          </button>
        </div>
        <div className="dlv-tip">{items.length} рядків · в наявності {items.reduce((s, x) => s + x.onHand, 0)} · нестача {short}</div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Шапка (затверджую…)</label>
        <textarea rows={3} value={head} onChange={(e) => setHead(e.target.value)} />
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Заголовок</label>
        <textarea rows={2} value={title} onChange={(e) => setTitleEdited(e.target.value)} />
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Підписи комісії</label>
        <textarea rows={3} value={footer} onChange={(e) => setFooter(e.target.value)} />
      </div>
    </Modal>
  );
}

/** Акт на весь екран у вигляді паперового документа — його ж і друкують */
function ActSheet({ act, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('zv-printing');
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('zv-printing'); };
  }, [onClose]);

  return (
    <div className="zv-print" role="dialog" aria-modal="true" aria-label={`Акт станом на ${act.date}`}>
      <div className="zv-print-bar">
        <button type="button" className="btn" onClick={() => window.print()}>Друк</button>
        <button type="button" className="act-btn" onClick={() => download(`akt-${isoOf(act.date)}.csv`, sheetCsv(actTable(act)))}>CSV</button>
        <span className="spacer" />
        <button type="button" className="act-btn" onClick={onClose}>Закрити</button>
      </div>
      <div className="zv-paper">
        {act.head && <div className="zv-paper-head">{act.head}</div>}
        <h2 className="zv-paper-title">{act.title}</h2>
        <div className="zv-paper-scroll">
          <table className="zv-paper-table">
            <thead>
              <tr>
                <th>№</th><th>Найменування</th><th>Посада</th><th>Од.</th><th>Рах./кат.</th>
                <th>з/с №</th><th>Наявн.</th><th>Нест.</th><th>Не відп. кат.</th><th>Примітка</th>
              </tr>
            </thead>
            <tbody>
              {act.items.map((a) => (
                <tr key={a.no}>
                  <td>{a.no}</td><td>{a.name}</td><td>{a.post}</td><td>{a.unit}</td><td>{a.countCat}</td>
                  <td className="zv-paper-sn">{a.serials}</td><td>{a.onHand}</td><td>{a.shortage || ''}</td>
                  <td>{a.wrongCat || ''}</td><td className="zv-paper-note">{a.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {act.footer && <div className="zv-paper-foot">{act.footer}</div>}
      </div>
    </div>
  );
}

/* ====================== Штат ====================== */

function Norms({ data, send, toast }) {
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState('');

  return (
    <>
      <div className="toolbar">
        <div className="muted" style={{ flex: '1 1 260px' }}>
          Скільки належить за штатом і скільки є. Позиції реєстру знаходяться за ключами — кодами моделей.
        </div>
        <button type="button" className="btn" onClick={() => setEdit({})}>Додати рядок</button>
      </div>
      {data.norms.length === 0 && <div className="empty">Штат не заповнено.</div>}
      <div className="grid">
        {data.norms.map((n) => {
          const s = normStatus(n, data.positions);
          const ok = s.lack === 0;
          return (
            <article className="card" key={n.row}>
              <div className="card-head">
                <div className="card-title"><div className="zv-name">{n.name}</div></div>
              </div>
              {/* стан — плиткою поруч із числами, а не пігулкою біля назви:
                  назви штату довгі, і пігулка обрізалась до «БРА…» */}
              <div className="zv-counts">
                <div><b>{n.qty}</b><span>за штатом</span></div>
                <div><b>{s.onHand}</b><span>в наявності</span></div>
                <div><b>{s.counted}</b><span>на обліку</span></div>
                <div className={ok ? 'is-ok' : 'is-short'}><b>{ok ? '✓' : s.lack}</b><span>{ok ? 'укомплектовано' : 'бракує'}</span></div>
              </div>
              <div className="card-body">
                <div className="drow"><span className="drow-k">Ключі</span><span className="drow-v">{n.keys || <span className="muted">не задано</span>}</span></div>
              </div>
              {open === n.row && (
                <ul className="zv-hits">
                  {s.positions.length === 0 && <li className="muted">Жодна позиція реєстру не підходить під ключі</li>}
                  {s.positions.map((p) => <li key={p.id}>№ {p.no} · {p.name} — <b>{p.onHand}</b> з {p.counted}</li>)}
                </ul>
              )}
              <div className="actions">
                <button type="button" className="act-btn" aria-expanded={open === n.row}
                  onClick={() => setOpen(open === n.row ? '' : n.row)}>
                  {open === n.row ? 'Сховати позиції' : `Позиції · ${s.positions.length}`}
                </button>
                <button type="button" className="act-btn" onClick={() => setEdit(n)}>Правка</button>
              </div>
            </article>
          );
        })}
      </div>
      {edit && (
        <NormForm norm={edit.row ? edit : null} positions={data.positions} onCancel={() => setEdit(null)}
          onSave={async (body) => { await send({ action: 'norm', row: edit.row, ...body }); setEdit(null); toast('Штат збережено'); }} />
      )}
    </>
  );
}

function NormForm({ norm, positions, onCancel, onSave }) {
  const [name, setName] = useState(norm?.name || '');
  const [qty, setQty] = useState(String(norm?.qty ?? ''));
  const [keys, setKeys] = useState(norm?.keys || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const s = normStatus({ qty: Number(qty) || 0, keys }, positions);

  return (
    <Modal title={norm ? 'Рядок штату' : 'Новий рядок штату'} onCancel={onCancel} busy={busy} error={err}
      onSave={async () => {
        setErr('');
        if (!name.trim()) return setErr('Вкажіть найменування');
        if (!/^\d+$/.test(qty.trim())) return setErr('Кількість за штатом — ціле число');
        setBusy(true);
        try { await onSave({ name: name.trim(), qty: Number(qty), keys: keys.trim() }); } catch (e) { setErr(e.message); setBusy(false); }
      }}>
      <label>Найменування</label>
      <textarea rows={2} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="zv-row2" style={{ marginTop: 10 }}>
        <div>
          <label>За штатом</label>
          <input type="number" inputMode="numeric" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <label>Ключі пошуку (через «;»)</label>
          <input type="text" value={keys} onChange={(e) => setKeys(e.target.value)} placeholder={suggestKeys(name) || 'DP4800; DM4600'} />
        </div>
      </div>
      <div className="dlv-tip" style={{ marginTop: 6 }}>
        Підходить {s.positions.length} {plural(s.positions.length, ['позиція', 'позиції', 'позицій'])}, в наявності {s.onHand}.
        {!keys && suggestKeys(name) && (
          <> <button type="button" className="chip" onClick={() => setKeys(suggestKeys(name))}>Взяти «{suggestKeys(name)}»</button></>
        )}
      </div>
    </Modal>
  );
}

/* ====================== Імпорт ====================== */

function Import({ data, onDone, toast }) {
  const [file, setFile] = useState(null);
  const [sum, setSum] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const filled = data.positions.length > 0;

  const upload = async (mode) => {
    setBusy(true); setErr('');
    try {
      // сирі байти, а не форма: так простіше й серверу, і телефону
      const res = await fetch(`/api/zv-import?mode=${mode}`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Не вдалося');
      if (mode === 'commit') { toast(`Перенесено ${d.summary.positions} позицій`); onDone(); return; }
      setSum(d.summary);
    } catch (e) {
      setErr(e.message === 'Failed to fetch' ? 'Немає звʼязку — імпорт потребує мережі' : e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="card zv-import">
      <h2 className="sec">Перенесення з Excel</h2>
      {filled ? (
        <p>
          Реєстр уже заповнений ({data.positions.length} позицій), тож новий імпорт заблоковано: він задвоїв би майно.
          Зміни тепер вносять тут — у реєстрі, і їх видно в «Русі» та «Журналі».
        </p>
      ) : (
        <>
          <p className="muted">
            Оберіть файл «майно служби звʼязку.xlsx». Спершу застосунок покаже, що знайшов, і лише після
            підтвердження запише. Аркуш «робоча» стане реєстром, аркуші «Акт…» — архівом актів, «по штату» — штатом.
          </p>
          <label htmlFor="zv-file">Файл Excel (.xlsx)</label>
          <input id="zv-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files[0] || null); setSum(null); setErr(''); }} />
          <div className="actions" style={{ borderTop: 0 }}>
            <button type="button" className="btn" disabled={!file || busy} onClick={() => upload('preview')}>
              {busy && !sum ? 'Читаю…' : 'Перевірити файл'}
            </button>
          </div>
        </>
      )}
      {err && <div className="err">{err}</div>}
      {sum && !filled && (
        <div className="zv-sum">
          <div className="stats zv-stats">
            <Stat label="Позицій" value={sum.positions} />
            <Stat label="На обліку" value={sum.counted} />
            <Stat label="В наявності" value={sum.onHand} tone="ok" />
            <Stat label="Нестача" value={sum.shortage} tone={sum.shortage ? 'warn' : undefined} />
          </div>
          <p>Вартість на обліку: <b>{sum.value} грн</b>. Штат: {sum.norms} рядків.</p>
          {sum.acts.length > 0 && (
            <p>Акти в архів: {sum.acts.map((a) => `${a.date || a.sheet} (${a.items})`).join(', ')}.</p>
          )}
          {sum.issues.length > 0 ? (
            <div className="note" style={{ display: 'block' }}>
              <b>Розбіжності з формулами файлу ({sum.issues.length}):</b>
              <ul>{sum.issues.slice(0, 20).map((x) => <li key={x}>{x}</li>)}</ul>
              Застосунок рахує сам: наявність = отримано − списано − подано.
            </div>
          ) : <p style={{ color: 'var(--green)' }}>Числа файлу зійшлися з правилами обліку в кожному рядку.</p>}
          <button type="button" className="btn" disabled={busy} onClick={() => upload('commit')}>
            {busy ? 'Записую…' : `Перенести ${sum.positions} позицій`}
          </button>
        </div>
      )}
    </div>
  );
}
