/**
 * Застосунок: вхід, головна, майно, склад, сховище, журнал, налаштування.
 *
 * Довгі розділи звідси вже винесені — звірка й доставки лежать поруч
 * окремими файлами, а спільні слова, якими всі вони написані (запит,
 * сповіщення, модальне вікно, пошук, таблиця), — у `components/base`.
 * Тут лишилось те, що тримає сторінку разом: хто увійшов, яка вкладка
 * відкрита і яка в неї адреса.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  api, setOnUnauthed, saveFailed, todayStr, statusColor, photoSrc,
  ToastCtx, useToast, ToastHost, useToasts, IconSearch, IconQr, parseCode, hhmm,
  QrScanner, Stat, Modal, PhotoField, useViewMode, ViewToggle, TableWrap,
  DataTable, Totals, countBy, Combo, SearchBox, useNewRecordHotkey, useGrow,
  bagWord, dayWord, plural,
} from '../components/base';
import { SheetIcon, IconBoxes, IconShelf } from '../components/icons';
import { OfflineBar } from '../components/offline-bar';
import { toCsv, csvName, BOM } from '../lib/csv';
import { headTags, accountingCol } from '../lib/cards';
import { findDupes, dupeCount, dupeLabel, sameSn, sameId } from '../lib/dupes';
import { AuditView } from '../components/reviziya';
import { DeliveryView } from '../components/dostavka';

const VERSION = 'v2.0';
// Vercel сам підставляє це під час збірки — видно, який код зараз живий
const BUILD = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);


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

  const submit = async (event) => {
    event?.preventDefault();
    if (busy) return;
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
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">О</span>
          <div>
            <h1>Облік</h1>
            <p>Система управління майном</p>
          </div>
        </div>
        <div className="login-heading">
          <h2>Вхід до системи</h2>
          <p>Введіть свої дані, щоб продовжити роботу</p>
        </div>

        <form onSubmit={submit}>
          {expired && (
            <div className="login-note">
              Сесія завершилась — так налаштовано: кожні 4 години о 00:00, 04:00,
              08:00 і далі потрібно ввести PIN знову.
            </div>
          )}

          {mode === 'pin' ? (
            <>
              <div className="login-field">
                <label htmlFor="login-callsign">Позивний</label>
                <select id="login-callsign" value={callsign} onChange={(e) => setCallsign(e.target.value)}>
                  {callsigns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="login-field">
                <label htmlFor="login-pin">PIN</label>
                <input
                  id="login-pin" type="password" inputMode="numeric" autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoFocus
                />
              </div>
            </>
          ) : (
            <div className="login-field">
              <label htmlFor="login-password">Спільний пароль</label>
              <input
                id="login-password" type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <button type="submit" className="btn login-submit" disabled={busy}>
            {busy ? 'Входимо…' : 'Увійти'}
          </button>
          {err && <div className="err" role="alert">{err}</div>}

          {callsigns.length > 0 && (
            <button
              type="button"
              className="login-alt"
              onClick={() => { setMode(mode === 'pin' ? 'pw' : 'pin'); setErr(''); }}
            >
              {mode === 'pin' ? 'Увійти спільним паролем' : 'Увійти за позивним'}
            </button>
          )}
        </form>
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
/* Іконки бічного меню. Один стиль: контур 1.6, квадрат 20, без заливки —
   щоб у стовпчику вони читались як один набір, а не як збірна солянка. */
const IconTruck = ({ size = 18 }) => (
  <svg className="ico" viewBox="0 0 20 20" width={size} height={size} fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M1.8 4.5h9.4v8.8H1.8zM11.2 7.6h3.3l3.7 3.1v2.6h-7z" />
    <circle cx="5.4" cy="15.4" r="1.7" /><circle cx="14.2" cy="15.4" r="1.7" />
  </svg>
);
const IconClock = ({ size = 18 }) => (
  <svg className="ico" viewBox="0 0 20 20" width={size} height={size} fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="10" cy="10" r="7.3" /><path d="M10 5.6V10l3 1.8" />
  </svg>
);
const IconGear = ({ size = 18 }) => (
  <svg className="ico" viewBox="0 0 20 20" width={size} height={size} fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.3v2.1M10 15.6v2.1M3.9 3.9l1.5 1.5M14.6 14.6l1.5 1.5M2.3 10h2.1M15.6 10h2.1M3.9 16.1l1.5-1.5M14.6 5.4l1.5-1.5" />
  </svg>
);
const IconLayers = ({ size = 18 }) => (
  <svg className="ico" viewBox="0 0 20 20" width={size} height={size} fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 2.8 17.4 7 10 11.2 2.6 7z" /><path d="M2.6 11.4 10 15.6l7.4-4.2" />
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
    { key: 'more', label: 'Ще', icon: <IconList />, on: ['items', 'ledger', 'stock', 'warehouse', 'log', 'people', 'delivery'].includes(view.kind), run: () => setMore(true) },
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
                  className={'sheet-i' + (e.kind === 'delivery' ? ' sheet-dlv' : '')
                    + (view.kind === e.kind ? ' on' : '')}
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
  /*
   * Одна річ на двох обліках. Це не описка в клітинці, а розходження
   * між листами, і виправляти його доведеться рішенням — де їй бути, —
   * тому рядок веде в пошук за серійником: там одразу видно обидві
   * картки поруч.
   */
  if (d.items.cross?.length) {
    const first = d.items.cross[0];
    attention.push({
      key: 'cross',
      tone: 'bad',
      text: `Один серійник у різних листах: ${d.items.cross.length} — `
        + `${d.items.cross.slice(0, 3).map((x) => `${x.sn} (${x.sheets.join(' + ')})`).join(', ')}`
        + `${d.items.cross.length > 3 ? '…' : ''}`,
      action: 'Показати',
      run: () => onOpen({ kind: 'search', name: null, q: first.sn }),
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
  // застрягла посилка — це не статистика, а те, з чим треба щось робити
  if (d.delivery?.lateTotal) {
    const l = d.delivery.late[0];
    attention.push({
      key: 'dlvlate',
      tone: 'bad',
      text: `Стоїть без руху: ${d.delivery.lateTotal} — ${l.what}${l.to ? ` для ${l.to}` : ''},`
        + ` ${l.stage.toLowerCase()} ${l.days} ${dayWord(l.days)}`,
      action: 'Доставки',
      run: () => onOpen(DELIVERY_VIEW),
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
      {/* Заголовок сторінки за макетом: надпис, велика фраза, пояснення.
          Три рядки замість одного — зате з них видно, де ти і що далі. */}
      <div className="page-head">
        <div>
          <div className="eyebrow">Ваш робочий день</div>
          <h2 className="page-h">{me ? <>Вітаю, {me}.</> : 'Тримайте все під контролем.'}</h2>
          <p className="page-sub">Ось що зараз на обліку — майно, люди та рух в одному просторі.</p>
        </div>
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
        <TableWrap>
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
                  <td className="col-name">
                    <span className="cat"><i className="cat-i"><SheetIcon name={s.name} size={17} /></i>{s.name}</span>
                  </td>
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
                <td className="col-name">
                  <span className="cat"><i className="cat-i"><IconBoxes size={17} /></i>Склад — ящики</span>
                </td>
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
                <td className="col-name">
                  <span className="cat"><i className="cat-i"><IconShelf size={17} /></i>Майно Рибаківки</span>
                </td>
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
        </TableWrap>
        <div className="totals" style={{ marginTop: 8 }}>
          <span>У «В наявності» для Рибаківки — залишок у штуках, а не кількість позицій</span>
        </div>
      </div>

      {/* Доставки. На головній важливо не скільки коробок узагалі, а що
          зараз у дорозі й скільки місць ще везти: одна посилка може бути
          трьома каністрами, з яких дві ще на точці вильоту. */}
      {d.delivery && (
        <div className="section">
          <h3 className="sec">Доставки<span className="count">{d.delivery.onWay}</span></h3>

          {/* Головне число тут — місця, а не посилки. «Вода, 3 шт» їде однією
              карткою, а прибуває трьома приїздами: питання «скільки ще
              везти» посилками завжди «одна», хоч дві третини вже на місці. */}
          <div className="totals">
            <span>Місць у дорозі <b>{d.delivery.places.left}</b>{' '}
              <span className="totals-of">з {d.delivery.places.total}</span>
              {d.delivery.kg > 0 ? ` · ${d.delivery.kg} кг` : ''}</span>
            <span className="totals-sep">·</span>
            <span>Посилок <b>{d.delivery.onWay}</b>
              {d.delivery.places.split > 0 && (
                <span className="totals-of"> · {d.delivery.places.split} їде частинами</span>
              )}
            </span>
            {d.delivery.hot.places > 0 && (
              <>
                <span className="totals-sep">·</span>
                <span style={{ color: 'var(--amber)' }}>
                  В першу чергу <b>{d.delivery.hot.places}</b>
                  <span className="totals-of"> {bagWord(d.delivery.hot.places)}</span>
                  {d.delivery.hot.kg > 0 ? ` · ${d.delivery.hot.kg} кг` : ''}
                </span>
              </>
            )}
            <span className="totals-sep">·</span>
            <span>Доставлено місць <b>{d.delivery.donePlaces}</b>{' '}
              <span className="totals-of">посилок за тиждень {d.delivery.week}</span></span>
            {d.delivery.lost.places > 0 && (
              <>
                <span className="totals-sep">·</span>
                <span style={{ color: 'var(--red)' }}>
                  Втрачено <b>{d.delivery.lost.places}</b>
                  {d.delivery.lost.kg > 0 ? ` · ${d.delivery.lost.kg} кг` : ''}
                </span>
              </>
            )}
          </div>

          <div className="chips">
            {d.delivery.urgent.slice(0, 4).map((x, i) => (
              <div className="chip dlv-prio-chip on" key={'u' + i}
                onClick={() => onOpen(DELIVERY_VIEW)}
                title={[x.stage, x.names.length && x.names.join(', '), x.kg && `${x.kg} кг`]
                  .filter(Boolean).join(' · ')}>
                {x.what}{x.to ? ` → ${x.to}` : ''}
                <b style={{ marginLeft: 5 }}>{x.places}</b>
              </div>
            ))}
            {d.delivery.byStage.filter((s) => s.n > 0).map((s) => (
              <div className="chip" key={s.key} onClick={() => onOpen(DELIVERY_VIEW)}>
                {s.label}<span className="count">{s.n}</span>
              </div>
            ))}
            {d.delivery.points.map((x) => (
              <div className="chip" key={'p' + x.name} style={{ color: 'var(--blue)' }}
                onClick={() => onOpen(DELIVERY_VIEW)}
                title={`${x.places} місць у ${x.n} посилках`}>
                → {x.name} <b style={{ marginLeft: 4 }}>{x.places}</b>
                {x.places !== x.n && <span className="totals-of"> / {x.n}</span>}
              </div>
            ))}
          </div>

          {d.delivery.open.length > 0 && (
            <TableWrap>
              <table className="data-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Посилка</th>
                    <th>Кому</th>
                    <th className="col-num">Місць</th>
                    <th className="col-num">Везти, кг</th>
                    <th>Ще не поставлено</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.delivery.open.map((x, i) => (
                    <tr key={i} onClick={() => onOpen(DELIVERY_VIEW)}>
                      <td className="col-name">{x.what}</td>
                      <td>{x.to || '—'}</td>
                      <td className="col-num col-strong" style={{ color: 'var(--amber)' }}>
                        {x.done} з {x.total}
                      </td>
                      <td className="col-num">{x.kgLeft ?? '—'}</td>
                      <td>{x.left.join(', ')}</td>
                      <td className="col-act">
                        <button className="act-btn" onClick={(e) => {
                          e.stopPropagation();
                          onOpen(DELIVERY_VIEW);
                        }}>Відкрити</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}

          <button className="act-btn" style={{ marginTop: 8 }}
            onClick={() => onOpen(DELIVERY_VIEW)}>Усі доставки</button>
        </div>
      )}

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

/* ---------- Хто працює із застосунком ---------- */
/**
 * Перелік СП.
 *
 * Веде його адміністратор, і саме тому в решті форм СП лише обирають.
 * Видалення тут немає навмисно: назва стоїть у вже написаних картках, і
 * прибрати її з переліку означало б лишити ті картки з посиланням на те,
 * чого немає. Вимкнений СП просто перестає пропонуватись у нових
 * посилках, а історія лишається читабельною.
 */
function SpBlock({ toast, setState }) {
  const [data, setData] = useState(null);
  const [name, setName] = useState({});
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);      // { key, row }
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api('/api/points'));
    } catch (e) {
      setState('помилка: ' + e.message);
    }
  }, [setState]);

  useEffect(() => { load(); }, [load]);

  const call = async (opts, ok) => {
    setBusy(true);
    try {
      const d = await api('/api/points', opts);
      setData((p) => ({ ...p, lists: d.lists }));
      toast(ok);
      return true;
    } catch (e) {
      toast(e.message, { type: 'err' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;

  return (
    <>
      {data.kinds.map((kind) => {
        const list = data.lists[kind.key] || [];
        const live = list.filter((p) => p.active).length;
        return (
          <div key={kind.key}>
            <div className="sec-h">{kind.title}</div>
            <div className="empty-note">
              {kind.hint}.{' '}
              {kind.strict
                ? 'У формі посилки лише обирають — вписати свій варіант не можна.'
                : 'У формі це підказки: можна обрати зі списку або вписати своє.'}
            </div>

            <div className="toolbar">
              <input
                type="text"
                value={name[kind.key] || ''}
                placeholder="нова назва"
                onChange={(e) => setName((p) => ({ ...p, [kind.key]: e.target.value }))}
                style={{ maxWidth: 220 }}
              />
              <button
                className="btn"
                disabled={busy || !(name[kind.key] || '').trim()}
                onClick={async () => {
                  const v = (name[kind.key] || '').trim();
                  if (await call({ method: 'POST', body: { key: kind.key, name: v } }, `Додано ${v}`)) {
                    setName((p) => ({ ...p, [kind.key]: '' }));
                  }
                }}
              >
                + Додати
              </button>
              <div className="spacer" />
              <span className="pill">{live} з {list.length} у переліку</span>
            </div>

            <div className="sp-list">
              {list.map((p) => (
                <div className={'sp-item' + (p.active ? '' : ' is-off')} key={p.row}>
                  {edit && edit.key === kind.key && edit.row === p.row ? (
                    <>
                      <input type="text" value={editName} autoFocus
                        onChange={(e) => setEditName(e.target.value)} />
                      <button className="act-btn act-accept" disabled={busy}
                        onClick={async () => {
                          if (await call(
                            { method: 'PATCH', body: { key: kind.key, row: p.row, name: editName.trim() } },
                            'Перейменовано'
                          )) setEdit(null);
                        }}>Зберегти</button>
                      <button className="act-btn" onClick={() => setEdit(null)}>Скасувати</button>
                    </>
                  ) : (
                    <>
                      <span className="sp-name">{p.name}</span>
                      {!p.active && <span className="pill" style={{ color: 'var(--gray)' }}>вимкнений</span>}
                      <div className="spacer" />
                      <button className="act-btn"
                        onClick={() => { setEdit({ key: kind.key, row: p.row }); setEditName(p.name); }}>
                        Перейменувати
                      </button>
                      <button className={'act-btn ' + (p.active ? 'act-del' : 'act-accept')} disabled={busy}
                        onClick={() => call(
                          { method: 'PATCH', body: { key: kind.key, row: p.row, active: !p.active } },
                          p.active ? `${p.name} більше не пропонується` : `${p.name} знову в переліку`
                        )}>
                        {p.active ? 'Вимкнути' : 'Увімкнути'}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

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
      <SpBlock toast={toast} setState={setState} />

      <div className="sec-h">Люди</div>
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


/* ---------- Вміст ящиків ---------- */

/** Що написати після руху: акт важливіший за сам рух, тож згадуємо його */
function boxAct(kind, d, where = 'ящика') {
  const base = kind === 'take' ? `Взято з ${where}` : `Повернуто в ${where === 'ящика' ? 'ящик' : 'комплект'}`;
  if (!d?.act) return base;
  if (d.act.error) return `${base}, але акт не записався: ${d.act.error}`;
  return `${base} · акт ${kind === 'take' ? 'видачі' : 'приймання'} записано`;
}

const BOX_ACTIONS = {
  take: { label: 'Взяти', title: 'Взяти з ящика', cls: 'act-btn' },
  give: { label: 'Повернути', title: 'Повернути в ящик', cls: 'act-btn act-accept' },
  add: { label: 'Додати', title: 'Додати в ящик', cls: 'act-btn act-accept' },
  writeOff: { label: 'Списати', title: 'Списати з ящика', cls: 'act-btn act-del' },
  replace: { label: 'Заміна', title: 'Відмітити заміну', cls: 'act-btn' },
};

/** Скільки лежить на місці — головне число, яке треба бачити з першого погляду */
function BoxLeft({ line }) {
  const color = line.left > 0 ? 'var(--green)' : 'var(--red)';
  return (
    <span className="box-left" style={{ color }}>
      {line.left}<span className="box-of"> з {line.total}</span>
      {line.unit ? ' ' + line.unit : ''}
      {line.taken > 0 && <span className="box-taken">на руках {line.taken}</span>}
    </span>
  );
}

/**
 * Взяти / повернути / додати / списати — одна форма на всі дії.
 * Взяття й повернення — це видача й приймання, тож вони ще й пишуть акт:
 * звідси поля «кому», «стан» і фото.
 */
function BoxMoveModal({ line, kind, people = [], conditions = [], sheet = 'Склад', onClose, onDone }) {
  const [qty, setQty] = useState('1');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [condition, setCondition] = useState('');
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cfg = BOX_ACTIONS[kind] || BOX_ACTIONS.take;
  const isAct = kind === 'take' || kind === 'give';

  const save = async () => {
    if (kind === 'take' && !to.trim()) { setErr('Вкажіть, кому видаєте'); return; }
    setBusy(true);
    setErr('');
    try {
      const d = await api('/api/boxes', {
        method: 'POST',
        body: { action: 'move', row: line.row, kind, qty: Number(qty) || 1, to, note, condition, photo, sheet },
      });
      onDone(d);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`${cfg.title}: ${line.name}`}
      onCancel={onClose}
      onSave={save}
      saveLabel={cfg.label}
      busy={busy}
      error={err}
    >
      <div className="box-modal-head">
        <span className="badge">{line.box}</span>
        <BoxLeft line={line} />
      </div>
      <label>Кількість</label>
      <input
        type="number"
        min="1"
        step="1"
        value={qty}
        autoFocus
        onChange={(e) => setQty(e.target.value)}
      />
      {kind === 'take' && (
        <>
          <label>Кому видаємо</label>
          <Combo value={to} options={people} onChange={setTo} placeholder="позивний або підрозділ" />
        </>
      )}
      {kind === 'give' && (
        <>
          <label>Хто повертає</label>
          <Combo value={to} options={people} onChange={setTo} placeholder="позивний" />
        </>
      )}
      {kind === 'replace' && (
        <>
          <label>Кому / куди</label>
          <Combo value={to} options={people} onChange={setTo} placeholder="позивний або місце" />
        </>
      )}
      {isAct && conditions.length > 0 && (
        <>
          <label>Стан речі</label>
          <select value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="">не вказано</option>
            {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </>
      )}
      <label>Примітка</label>
      <input type="text" value={note} placeholder="за потреби" onChange={(e) => setNote(e.target.value)} />
      {isAct && (
        <>
          <PhotoField value={photo} onChange={setPhoto} showPreview={false} label="Фото до акта" />
          <div className="box-act-hint">
            Запишеться акт {kind === 'take' ? 'видачі' : 'приймання'} — знайдете його в пошуку та на головній.
          </div>
        </>
      )}
    </Modal>
  );
}

/** Нова позиція в ящику */
function BoxLineModal({ box, title, units = [], names = [], accountingOptions = [], onClose, onDone }) {
  const [name, setName] = useState('');
  const [total, setTotal] = useState('1');
  const [unit, setUnit] = useState('шт.');
  const [accounting, setAccounting] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!name.trim()) { setErr('Вкажіть назву'); return; }
    setBusy(true);
    setErr('');
    try {
      const d = await api('/api/boxes', {
        method: 'POST',
        body: { box, name: name.trim(), total: Number(total) || 1, unit, accounting, note },
      });
      onDone(d);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title || `Що покласти в ящик ${box}`} onCancel={onClose} onSave={save} saveLabel="Додати" busy={busy} error={err}>
      <label>Назва</label>
      <Combo value={name} options={names} onChange={setName} placeholder="ПНВ, підсумок, акумулятор…" autoFocus />
      <div className="box-form-row">
        <div>
          <label>Скільки</label>
          <input type="number" min="1" step="1" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
        <div>
          <label>Од.</label>
          <Combo value={unit} options={units} onChange={setUnit} placeholder="шт." />
        </div>
      </div>
      <label>Облік</label>
      <select value={accounting} onChange={(e) => setAccounting(e.target.value)}>
        <option value="">не вказано</option>
        {accountingOptions.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <label>Примітка</label>
      <input type="text" value={note} placeholder="стан, комплектність…" onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}


/* ---------- Головна ---------- */
export const STOCK_SHEET_NAME = 'Майно Рибаківки';
// стабільне посилання — інакше useEffect із цим значенням крутився б без кінця
export const DELIVERY_VIEW = { kind: 'delivery', name: null };

export const STOCK_VIEW = { kind: 'stock', name: STOCK_SHEET_NAME };

/** Адреса, яку показуємо в рядку браузера для поточної вкладки */
/**
 * Адреса, що відповідає вкладці.
 *
 * Не косметика: саме через неї сторінка лишається собою після входу.
 * Екран пароля показується поверх застосунку, адреса тим часом уже
 * підмінена — і той, хто відкрив /delivery і ввів пароль, опинявся на
 * головній. Кожна вкладка з власною адресою має бути тут; решта чесно
 * зводиться до кореня.
 */
function urlFor(view) {
  if (view.kind === 'stock') {
    return '/rybakivka' + (view.id ? '?id=' + encodeURIComponent(view.id) : '');
  }
  if (view.kind === 'delivery') return '/delivery';
  return '/';
}

export default function Home({ startView }) {
  const [authed, setAuthed] = useState(null);
  const [me, setMe] = useState({ callsign: '', role: 'admin', chief: false, callsigns: [], expires: 0 });
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
          // головний — не роль із таблиці, а позивний зі змінної оточення
          chief: !!d.chief,
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
    setOnUnauthed(() => { setExpired(true); setAuthed(false); });
    return () => setOnUnauthed(null);
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
    { label: 'Доставки', hint: 'екран', run: () => setView({ kind: 'delivery', name: null }) },
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

  /*
   * Один перелік розділів на дві навігації: бічне меню на широкому екрані
   * і хлібні крихти вгорі. Доки він був розкладений по JSX двічі, два
   * списки встигали розʼїхатись — тепер розʼїхатись нема чому.
   */
  const nav = [
    { kind: 'home', label: 'Огляд', icon: <IconHome size={18} />, on: view.kind === 'home' },
    { kind: 'search', label: 'Пошук', icon: <IconSearch size={18} />, on: view.kind === 'search' },
    ...sheets.map((s) => ({
      kind: s.kind, name: s.name, label: s.name, icon: <SheetIcon name={s.name} />,
      on: view.name === s.name,
    })),
    { kind: 'delivery', label: 'Доставки', icon: <IconTruck />, on: view.kind === 'delivery', dot: true },
    { kind: 'log', label: 'Журнал', icon: <IconClock />, on: view.kind === 'log' },
    { kind: 'audit', label: 'Звірка', icon: <IconCheck size={18} />, on: view.kind === 'audit' },
    ...(me.role === 'admin'
      ? [{ kind: 'people', label: 'Налаштування', icon: <IconGear />, on: view.kind === 'people' }]
      : []),
  ];
  const here = nav.find((n) => n.on);
  const initials = (me.callsign || 'О').slice(0, 2).toUpperCase();

  return (
    <ToastCtx.Provider value={push}>
      <div className="wrap">
        {/* `push`, а не `toast`: той живе в контексті й доступний лише
            дітям, а ми тут самі той контекст і ставимо */}
        <OfflineBar onSynced={(n) => push(`Надіслано відкладені записи: ${n}`)} />
        <aside className="side">
          <div className="side-brand">
            <span className="brand-mark" aria-hidden="true">О</span>
            <span className="side-brand-t">облік<i>.</i></span>
          </div>

          <div className="side-ws">
            <span className="side-ws-i" aria-hidden="true"><IconLayers /></span>
            <div className="side-ws-t">
              <strong>Робочий простір</strong>
              <small>{me.callsign || 'спільний вхід'}</small>
            </div>
          </div>

          <span className="side-label">Робота</span>
          <nav className="side-nav">
            {nav.map((n) => (
              <button
                key={n.kind + (n.name || '')}
                className={'nav-item' + (n.on ? ' on' : '')}
                aria-current={n.on ? 'page' : undefined}
                onClick={() => setView({ kind: n.kind, name: n.name || null })}
              >
                {n.icon}
                <span>{n.label}</span>
                {n.dot && <i className="nav-dot" aria-hidden="true" />}
              </button>
            ))}
          </nav>

          <div className="side-foot">
            <span>SIGNAL / {VERSION}</span>
            {BUILD && <span title="Версія збірки">{BUILD}</span>}
          </div>
        </aside>

        <div className="shell">
          <div className="topbar">
            <div className="crumb">
              <span className="mobile-mark" aria-hidden="true">О</span>
              <span className="crumb-root">Облік майна</span>
              <i className="slash" aria-hidden="true">/</i>
              <strong>{here ? here.label : 'Огляд'}</strong>
            </div>
            <div className="top-acts">
              <div className="state">
                {state}
              </div>
              <button className="top-search" onClick={() => setPalette(true)} title="Пошук та дії">
                <IconSearch size={16} />
                <span className="top-search-t">Знайти в просторі</span>
                <kbd>⌘K</kbd>
              </button>
              <button className="icon-btn" onClick={() => setScan(true)} title="Сканувати QR">
                <IconQr size={17} />
              </button>
              <div className="who">
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
                <span className="avatar" title={me.role === 'admin' ? 'Адміністратор' : 'Користувач'}>
                  {initials}
                </span>
              </div>
            </div>
          </div>

          <main className="shell-main">

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
          <ItemsView key={view.name + ':' + (view.row || '')} name={view.name} setState={setState} focusRow={view.row} onOpen={setView} />
        )}
        {view.kind === 'delivery' && <DeliveryView setState={setState} me={me.callsign} chief={!!me.chief} />}
        {view.kind === 'ledger' && <LedgerView key={view.name} name={view.name} setState={setState} />}
        {view.kind === 'stock' && (
          <StockView
            key={view.id || ''}
            setState={setState}
            focusId={view.id}
            onClearFocus={() => setView(STOCK_VIEW)}
            onOpen={setView}
          />
        )}
        {view.kind === 'warehouse' && (
          <WarehouseView key={view.box || ''} setState={setState} focusCode={view.box} onOpen={setView} />
        )}
        {view.kind === 'log' && <LogView key={view.q || ''} setState={setState} initialQuery={view.q} />}
        {view.kind === 'audit' && <AuditView setState={setState} />}
        {view.kind === 'people' && me.role === 'admin' && <PeopleView setState={setState} />}
          </main>
        </div>
      </div>
      <BottomNav
        view={view}
        sheets={sheets}
        onOpen={setView}
        onScan={() => setScan(true)}
        extra={[
          { label: 'Доставки', kind: 'delivery', run: () => setView({ kind: 'delivery', name: null }) },
          { label: 'Журнал змін', kind: 'log', run: () => setView({ kind: 'log', name: null }) },
          ...(me.role === 'admin'
            ? [{ label: 'Налаштування', kind: 'people', run: () => setView({ kind: 'people', name: null }) }]
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
  const [boxMove, setBoxMove] = useState(null); // {line, kind}
  const [boxPeople, setBoxPeople] = useState([]);
  const [boxConditions, setBoxConditions] = useState([]);
  const reqId = useRef(0);
  const toast = useToast();

  // Підказки «кому» для ящиків потрібні лише коли відкривають форму —
  // тягнемо їх один раз і не раніше
  const openBoxMove = async (line, kind) => {
    setBoxMove({ line, kind });
    if (boxPeople.length) return;
    try {
      const d = await api('/api/boxes');
      setBoxPeople(d.people || []);
      setBoxConditions(d.conditions || []);
    } catch { /* підказки не критичні */ }
  };

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
  const boxHits = res?.boxes?.length || 0;
  const dlvHits = res?.deliveries?.length || 0;
  const found = hits.length + stockHits + boxHits + dlvHits + acts.length;
  let totalsParts = [];
  if (res) {
    // «нічого не знайдено» вже написано нижче — дублювати нулем не треба
    if (found) {
      totalsParts = [
        ['Знайдено', found],
        ...countBy(hits, (r) => r.sheet),
        ...(stockHits ? [['Склад Рибаківки', stockHits]] : []),
        ...(boxHits ? [['У ящиках', boxHits]] : []),
        ...(dlvHits ? [['Доставки', dlvHits]] : []),
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
      {!busy && res && groups.length === 0 && acts.length === 0
        && !res.stock?.length && !res.boxes?.length && !res.deliveries?.length && (
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

      {/* Доставки в загальному пошуку. Шукають не лише посилку, а й окреме
          місце: «Вода 7,7» — це каністра, і людина тримає в голові саме її. */}
      {res?.deliveries?.length > 0 && (
        <div className="section">
          <h3 className="primary">Доставки<span className="count">{res.deliveries.length}</span></h3>
          {res.deliveries.map((r) => (
            <div className="result" key={'dl' + r.row}>
              <div className="result-head">
                {r.to && <span className="badge">{r.to}</span>}
                <span style={{ fontWeight: 600 }}>{r.what}</span>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: '.8rem', fontWeight: 700,
                  color: r.done ? 'var(--green)' : 'var(--amber)',
                }}>
                  {r.stage}
                </span>
                {r.date && (
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '.7rem', color: 'var(--muted)' }}>
                    {r.date.split(' ')[0]}
                  </span>
                )}
              </div>
              <div className="fields">
                {[
                  r.matchedField === 'місце' && ['Місце', r.matchedValue],
                  r.parts && ['Місць', `${r.parts.done} з ${r.parts.total}`
                    + (r.parts.left.length ? `, лишилось: ${r.parts.left.join(', ')}` : '')
                    + (r.parts.kgLeft > 0 ? ` (${r.parts.kgLeft} кг)` : '')],
                  r.weight !== null && ['Вага', `${r.weight} кг`],
                  r.driver && ['Чим везли', r.driver],
                  r.point && ['Точка', r.point],
                ].filter(Boolean).map(([k, v], i, a) => (
                  <span key={k}>
                    <span className="k">{k}:</span> {v}{i < a.length - 1 ? '  ·  ' : ''}
                  </span>
                ))}
              </div>
              <div className="actions">
                <button className="act-btn act-qr" onClick={() => onOpen(DELIVERY_VIEW)}>
                  Відкрити доставки
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {res?.boxes?.length > 0 && (
        <div className="section">
          <h3 className="primary">У ящиках і комплектах<span className="count">{res.boxes.length}</span></h3>
          {res.boxes.map((r) => (
            <div className="result" key={'b' + r.row}>
              <div className="result-head">
                <span className="badge">{r.boxKind || 'ящик'} {r.box}</span>
                <span style={{ fontWeight: 600 }}>{r.name}</span>
                {r.accounting && (
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '.74rem', fontWeight: 700,
                    color: r.accounting === 'Облікове' ? 'var(--green)' : 'var(--gray)',
                  }}>
                    {r.accounting}
                  </span>
                )}
                <span style={{ marginLeft: 'auto' }}><BoxLeft line={r} /></span>
              </div>
              <div className="fields">
                {r.boxName && <span><span className="k">{r.boxKind === 'комплект' ? 'Комплект' : 'Ящик'}:</span> {r.boxName}{'  ·  '}</span>}
                {/* крапку перед приміткою не ставимо: у неї своя смужка,
                    і роздільник поруч читається як загублений хвіст */}
                {r.location && <span><span className="k">Де:</span> {r.location}{r.note ? ' ' : ''}</span>}
                {r.note && <span className="note-in">{r.note}</span>}
              </div>
              <div className="actions">
                <button
                  className="act-btn act-qr"
                  onClick={() => onOpen(r.boxKind === 'комплект'
                    ? { ...STOCK_VIEW, id: r.box }
                    : { kind: 'warehouse', name: 'Склад', box: r.box })}
                >
                  {r.boxKind === 'комплект' ? 'Відкрити позицію' : 'Відкрити ящик'}
                </button>
                <button className="act-btn" disabled={r.left <= 0} onClick={() => openBoxMove(r, 'take')}>
                  Взяти
                </button>
                <button className="act-btn act-accept" disabled={r.taken <= 0} onClick={() => openBoxMove(r, 'give')}>
                  Повернути
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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

      {boxMove && (
        <BoxMoveModal
          line={boxMove.line}
          kind={boxMove.kind}
          people={boxPeople}
          conditions={boxConditions}
          sheet={boxMove.line.boxKind === 'комплект' ? STOCK_SHEET_NAME : 'Склад'}
          onClose={() => setBoxMove(null)}
          onDone={(d) => {
            toast(boxAct(boxMove.kind, d, boxMove.line.boxKind === 'комплект' ? 'комплекту' : 'ящика'));
            setTick((t) => t + 1);
          }}
        />
      )}

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
/**
 * Віддати людині файл.
 *
 * Живе тут, поруч із єдиним, хто цим користується. Переїде в спільну
 * абетку тоді, коли зʼявиться другий, — не раніше: модуль «різне» росте
 * саме з таких переїздів наперед.
 */
function download(filename, text) {
  const blob = new Blob([BOM + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // посилання живе, доки браузер не забере файл; секунди вистачає
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bodyCols(headers, cols, snIdx, idIdx, tagCols = []) {
  // примітка йде окремим рядком у кінці картки, тож із загального списку її
  // прибираємо — інакше показалась би двічі, ще й вузьким однорядковим полем
  const skip = new Set(
    [nameOf(cols), snIdx, idIdx, cols.status, cols.note, ...tagCols].filter((i) => i >= 0)
  );
  return headers.map((_, i) => i).filter((i) => !skip.has(i));
}

/**
 * Колонка з назвою речі. Стара версія листа могла прийти без цього поля —
 * тоді, як і раніше, назвою вважається перша колонка.
 */
const nameOf = (cols) => (cols?.name >= 0 ? cols.name : 0);

/** Плавно підводить до потрібного рядка після перемикання на картки */
function scrollToRow(row) {
  setTimeout(() => {
    document.getElementById('item-row-' + row)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 60);
}

function ItemsView({ name, setState, focusRow, onOpen }) {
  const [data, setData] = useState(null);
  const [chip, setChip] = useState(null);
  const [who, setWho] = useState(null);
  const [where, setWhere] = useState(null);
  const [group, setGroup] = useState(null); // 'who' | 'where'
  const [dupOnly, setDupOnly] = useState(false);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [issuing, setIssuing] = useState(null);
  const [highlightRow, setHighlightRow] = useState(focusRow || null);
  const [mode, setMode] = useViewMode();
  // свіжий текст приміток за рядком: без нього смужка-акцент зʼявлялась би
  // аж після перезавантаження, хоч примітка вже записана
  const [notes, setNotes] = useState({});
  const toast = useToast();
  const grow = useGrow();

  useNewRecordHotkey(useCallback(() => setAdding(true), []));

  /*
   * Повтори рахуємо з того, що вже в руках, — жодного зайвого читання
   * таблиці. Квоту Google ми щойно лагодили, і платити за наведення ладу
   * ще однією дюжиною запитів було б дивно.
   *
   * Лічильник стоїть тут, вище за `if (!data)`, а не там, де він
   * потрібен: гуки мають викликатись у тому самому порядку щоразу, а
   * нижче на сторінці вже є ранній вихід. Лінтер це й упіймав.
   */
  const dupes = useMemo(() => (data ? findDupes(data.items, data.cols) : []), [data]);
  const dupBy = useMemo(() => {
    const m = new Map();
    dupes.forEach((g) => g.rows.forEach((r) => m.set(r, g)));
    return m;
  }, [dupes]);
  const extra = dupeCount(dupes);

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

  const {
    headers, items, cols, statusOptions, typeOptions, whereOptions,
    suggestions = {}, maskCols, noIssue, hideStatus,
  } = data;
  // у шапці картки: власний номер речі бейджем, назва, серійник виробника під нею
  const nameIdx = nameOf(cols);
  const idIdx = cols.id >= 0 && cols.id !== nameIdx ? cols.id : -1;
  const snIdx = cols.snCols?.find((i) => i !== nameIdx && i !== idIdx) ?? -1;
  // облік, тип і місце йдуть тегами під назвою, а не окремими рядками
  const accIdx = accountingCol(headers);

  /* Що пропонувати в тезі. Тип і місце мають власні переліки, решта
     бере вже вжите в цьому листі — тим самим довідником, яким
     користується форма додавання. */
  const tagOptions = (ci) => {
    if (ci === cols.type) return typeOptions || [];
    if (ci === cols.where) return whereOptions || [];
    return suggestions[ci] || [];
  };
  /* Коротка назва колонки для порожнього тега: «Тип», «Де», «Оф облік» */
  const tagLabel = (ci) => (headers[ci] || '').toString().trim() || 'Поле';


  /*
   * Попереджаємо, але не забороняємо. Людина може правити саме для того,
   * щоб звести два записи в один, або бачити річ, якої в таблиці ще
   * немає. Заборона тут зупинила б роботу, а попередження — лише
   * нагадує подивитись.
   */
  const warnSame = (found, what) => {
    if (!found.length) return;
    const where = found.slice(0, 3).map((x) => x.row).join(', ');
    toast(`Такий ${what} уже є — ${plural(found.length, ['рядок', 'рядки', 'рядків'])} ${where}`,
      { type: 'warn' });
  };

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

  /** Примітка: свіжа, якщо її щойно правили, інакше та, що прийшла з таблиці */
  const noteOf = (it) =>
    (notes[it.row] !== undefined ? notes[it.row] : it.values[cols.note]) || '';

  /** Картка запису — одна й та сама у звичайному списку і в групуванні */
  const renderCard = (it) => {
    const tags = headTags(it.values, cols, accIdx);
    const dup = dupBy.get(it.row);
    return (
    <div
      className={'card' + (it.row === highlightRow ? ' highlight' : '') + (dup ? ' is-dup' : '')}
      key={it.row} id={'item-row-' + it.row}
    >
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
                onBlur={(e) => {
                  if (e.target.value === it.values[idIdx]) return;
                  warnSame(sameId(items, cols, e.target.value, it.row), headers[idIdx] || 'Номер');
                  save(it.row, idIdx, e.target.value, it.values[idIdx]);
                }}
              />
            ) : (
              <span className="id-badge" title={'Рядок у таблиці: ' + it.row}>{it.row}</span>
            )}
            <input
              className="ghost big"
              type="text"
              defaultValue={it.values[nameIdx]}
              placeholder={headers[nameIdx] || 'Назва'}
              onBlur={(e) => e.target.value !== it.values[nameIdx] && save(it.row, nameIdx, e.target.value, it.values[nameIdx])}
            />
          </div>
          {snIdx >= 0 && (
            <input
              className="ghost mono card-sn"
              type="text"
              defaultValue={it.values[snIdx]}
              placeholder={headers[snIdx] || 'S/N'}
              onBlur={(e) => {
                if (e.target.value === it.values[snIdx]) return;
                warnSame(sameSn(items, cols, e.target.value, it.row), headers[snIdx] || 'S/N');
                save(it.row, snIdx, e.target.value, it.values[snIdx]);
              }}
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

      {dup && (
        <div className="card-dup">
          Повтор: {dupeLabel(dup)} · {plural(dup.rows.length, ['рядок', 'рядки', 'рядків'])}{' '}
          {dup.rows.join(', ')}
        </div>
      )}

      {tags.shown.length > 0 && (
        <div className="card-tags">
          {tags.shown.map((t) => {
            const opts = tagOptions(t.ci);
            return (
              <span className={'tag ' + t.cls + (t.v ? '' : ' is-empty')} key={t.ci}>
                {opts.length ? (
                  /*
                   * Ширину чипа задає напис, а сам `select` лежить поверх
                   * прозорим. Інакше чип розтягується під найдовший
                   * варіант у переліку: «не на обліку» розсовує тег, у
                   * якому написано «пбд».
                   */
                  <>
                    <b className="tag-v">{t.v || tagLabel(t.ci)}</b>
                    <select
                      className="tag-pick is-over"
                      defaultValue={t.v}
                      title={tagLabel(t.ci)}
                      onChange={(e) => save(it.row, t.ci, e.target.value, t.v)}
                    >
                      <option value="">{tagLabel(t.ci)}</option>
                      {t.v && !opts.includes(t.v) && <option value={t.v}>{t.v}</option>}
                      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </>
                ) : (
                  <input
                    className="tag-pick"
                    type="text"
                    defaultValue={t.v}
                    placeholder={tagLabel(t.ci)}
                    title={tagLabel(t.ci)}
                    size={Math.max(4, (t.v || tagLabel(t.ci)).length)}
                    onBlur={(e) => e.target.value !== t.v && save(it.row, t.ci, e.target.value, t.v)}
                  />
                )}
              </span>
            );
          })}
        </div>
      )}

      <div className="card-body">
        {bodyCols(headers, cols, snIdx, idIdx, tags.shown.map((t) => t.ci)).map((ci) => (
          <div className="drow" key={ci}>
            <span className="drow-k">{(headers[ci] || '').toString().trim() || 'Поле ' + (ci + 1)}</span>
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

        {/* Написана примітка світиться, порожня — ні: акцент, що стоїть
            завжди, за тиждень перестають помічати. */}
        {cols.note >= 0 && (
          <div className={'drow' + (noteOf(it) ? ' has-note' : '')}>
            <span className="drow-k">{headers[cols.note] || 'Примітка'}</span>
            <span className="drow-v">
              <textarea
                className="ghost"
                rows={1}
                defaultValue={noteOf(it)}
                placeholder="—"
                {...grow}
                onBlur={(e) => {
                  const prev = noteOf(it);
                  if (e.target.value === prev) return;
                  setNotes((p) => ({ ...p, [it.row]: e.target.value }));
                  save(it.row, cols.note, e.target.value, prev);
                }}
              />
            </span>
          </div>
        )}
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
    );
  };

  const cell = (it, i) => (i >= 0 ? (it.values[i] || '').toString().trim() : '');
  const whoIdx = cols.who >= 0 ? cols.who : -1;
  const whereIdx = cols.where > 0 ? cols.where : -1;

  let list = items;
  if (dupOnly) list = list.filter((it) => dupBy.has(it.row));
  if (chip !== null && cols.status >= 0) list = list.filter((it) => it.values[cols.status] === chip);
  if (who) list = list.filter((it) => cell(it, whoIdx) === who);
  if (where) list = list.filter((it) => cell(it, whereIdx) === where);
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    list = list.filter((it) => it.values.join(' ').toLowerCase().includes(s));
  }

  // «в наявності» — те, що лежить у нас: КСП або склад
  const has = (v) => {
    const t = (v || '').toString().toLowerCase();
    return t.includes('ксп') || t.includes('склад');
  };
  const statusOf = (it) => cell(it, cols.status);
  const booked = list.filter((it) => {
    const a = (accIdx >= 0 ? cell(it, accIdx) : '').toLowerCase();
    if (a.startsWith('не')) return false;
    return a.startsWith('на облік') || a.startsWith('облікове')
      || cell(it, cols.type).toLowerCase().startsWith('учт');
  }).length;

  const cuts = [];
  if (whoIdx >= 0) {
    cuts.push({
      title: 'У кого на руках',
      rows: cutBy(list, (it) => cell(it, whoIdx)),
      active: who,
      onPick: setWho,
    });
  }
  if (whereIdx >= 0) {
    cuts.push({
      title: 'Де лежить',
      rows: cutBy(list, (it) => cell(it, whereIdx)),
      active: where,
      onPick: setWhere,
    });
  }

  // втрачене й списане варто бачити окремо, а не шукати очима серед решти
  const lost = list.filter((it) => {
    const t = statusOf(it).toLowerCase();
    return t.includes('втрач') || t.includes('утер');
  });

  const groups = group === 'who' || group === 'where'
    ? groupRows(list, (it) => cell(it, group === 'who' ? whoIdx : whereIdx),
        group === 'who' ? 'Ні в кого' : 'Без місця')
    : null;

  return (
    <>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Пошук..." />
        {/* фільтри за статусом — лише там, де статус узагалі є: у листі без
            такої колонки шість чипів нічого не фільтрують, а місце займають */}
        {!hideStatus && cols.status >= 0 && statusOptions.map((s) => (
          <div key={s} className={'chip' + (chip === s ? ' on' : '')} onClick={() => setChip(chip === s ? null : s)}>
            {s}
          </div>
        ))}
        <div className="spacer" />
        {whoIdx >= 0 && (
          <button className={'btn btn-2 btn-group' + (group === 'who' ? ' on' : '')}
            onClick={() => setGroup(group === 'who' ? null : 'who')}>
            За людиною
          </button>
        )}
        {whereIdx >= 0 && (
          <button className={'btn btn-2 btn-group' + (group === 'where' ? ' on' : '')}
            onClick={() => setGroup(group === 'where' ? null : 'where')}>
            За місцем
          </button>
        )}
        <ViewToggle mode={mode} onChange={setMode} />
        {/* Вивантаження — не копія бази, а перелік, який комусь віддають:
            у штаб, у сусідній підрозділ, у папери. Тому й береться те, що
            зараз на екрані, разом із фільтром: людина спершу відбирає
            потрібне очима, а вже потім натискає. */}
        <button
          className="btn btn-2"
          title={list.length === items.length
            ? `Зберегти файлом усі записи (${items.length})`
            : `Зберегти файлом те, що зараз відібрано: ${list.length} з ${items.length}`}
          onClick={() => {
            const csv = toCsv(headers, list.map((it) => it.values), { skip: maskCols || [] });
            download(csvName(name, todayStr()), csv);
            toast('Вивантажено записів: ' + list.length);
          }}
        >
          Експорт
        </button>
        <button className="btn" onClick={() => setAdding(true)}>+ Додати запис</button>
      </div>

      {!focusRow && (
        <PageDash
          stats={[
            { label: 'Записів', value: list.length, sub: list.length !== items.length ? `з ${items.length}` : null },
            ...(hideStatus || cols.status < 0 ? [] : [
              { label: 'В наявності', value: list.filter((it) => has(statusOf(it))).length, tone: 'ok', sub: 'КСП або склад' },
              { label: 'Видано', value: list.filter((it) => statusOf(it).toLowerCase().includes('видан')).length },
            ]),
            ...(accIdx >= 0 || cols.type >= 0
              ? [{ label: 'За документами', value: booked, sub: 'числиться в паперах' }]
              : []),
          ]}
          cuts={cuts}
          audit={data.audit}
          scope={name}
          attn={[
            ...(extra ? [{
              bad: true,
              text: <>Повтори: <b>{extra}</b> {plural(extra, ['зайвий рядок', 'зайві рядки', 'зайвих рядків'])}{' '}
                <span className="sd-empty">
                  {dupes.slice(0, 3).map(dupeLabel).join(', ')}{dupes.length > 3 ? '…' : ''}
                </span></>,
              action: { label: 'Розібрати', run: () => { setDupOnly(true); setChip(null); setQ(''); } },
            }] : []),
            ...(lost.length ? [{
              bad: true,
              text: <>Втрачено або списано: <b>{lost.length}</b>{' '}
                <span className="sd-empty">{lost.slice(0, 4).map((it) => cell(it, nameIdx) || cell(it, idIdx)).join(', ')}{lost.length > 4 ? '…' : ''}</span></>,
              action: { label: 'Показати', run: () => setChip(cell(lost[0], cols.status)) },
            }] : []),
          ]}
          onOpen={onOpen}
        />
      )}

      {dupOnly && (
        <div className="scan-banner">
          <span>
            Показано лише повтори — <b>{dupes.length}</b>{' '}
            {plural(dupes.length, ['група', 'групи', 'груп'])}, <b>{extra}</b>{' '}
            {plural(extra, ['зайвий рядок', 'зайві рядки', 'зайвих рядків'])}.{' '}
            Зайве видаляйте кнопкою в картці — видалення можна скасувати.
          </span>
          <button className="act-btn" onClick={() => setDupOnly(false)}>Показати всіх</button>
        </div>
      )}

      {(who || where) && (
        <div className="scan-banner">
          <span>Показано лише <b>{who || where}</b></span>
          <button className="act-btn" onClick={() => { setWho(null); setWhere(null); }}>Показати всіх</button>
        </div>
      )}

      <Totals
        parts={[
          ...(hideStatus || cols.status < 0
            ? [['Записів', list.length]]
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
      ) : groups ? (
        groups.map((g) => (
          <div className="sd-group" key={g.key}>
            <div className="sd-group-h">
              <span className="sd-group-n">{g.key}</span>
              <span className="sd-group-s">записів: <b>{g.rows.length}</b></span>
            </div>
            <div className="grid">
              {g.rows.map((it) => renderCard(it))}
            </div>
          </div>
        ))
      ) : (
        <div className="grid">
          {list.map((it) => renderCard(it))}
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

  const thing = [take(nameOf(cols)), take(idIdx), take(snIdx)].filter((i) => i !== null);
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
  // обов'язкова — назва речі, а не перша колонка: у «майно не облік»
  // першою стоїть «№ з/п», і вимагати його першим питанням безглуздо
  const nameIdx = nameOf(cols);

  /*
   * Підказка в порожньому полі. «№ з/п» і «Номер» стоять поруч і на вигляд
   * однакові — з самого заголовка не видно, що перше це порядковий номер
   * рядка, а друге серійник виробника. Пишемо це просто в полі.
   */
  const hintFor = (i) => {
    if (i === idIdx) return 'порядковий номер у таблиці';
    if (i === snIdx) return 'серійний номер або код виробника';
    if (i === cols.date) return 'дд.мм.рррр';
    if (i === cols.who) return 'позивний';
    return '';
  };

  return (
    <Modal
      title="Новий запис"
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        if (!vals[nameIdx]?.trim()) {
          return setErr(`Вкажіть «${headers[nameIdx] || 'назву'}» — без цього запис не знайти`);
        }
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
                {i === nameIdx && <span className="req"> *</span>}
              </label>
              {i === cols.status || i === cols.type ? (
                <select value={vals[i]} onChange={(e) => set(i, e.target.value)}>
                  <option value="">—</option>
                  {(i === cols.status ? statusOptions : typeOptions).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : suggestions[i]?.length ? (
                <Combo value={vals[i]} options={suggestions[i]} placeholder={hintFor(i)}
                  onChange={(v) => set(i, v)} />
              ) : (
                <input
                  type="text"
                  value={vals[i]}
                  autoFocus={i === nameIdx}
                  placeholder={hintFor(i)}
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
/* ---------- Шапка-дашборд для будь-якої сторінки ---------- */

/**
 * Верх сторінки: числа, два розрізи «у кого» / «де» і стан звірки.
 * Розрізи клікабельні — це швидший спосіб відфільтрувати, ніж пошук.
 */
function PageDash({ stats, cuts = [], audit, attn = [], moves = [], scope, onOpen }) {
  const shown = cuts.filter((c) => c.rows.length > 0);

  return (
    <div className="sd">
      {stats.length > 0 && (
        <div className="stats">
          {stats.map((st) => (
            <Stat key={st.label} value={st.value} label={st.label} sub={st.sub} tone={st.tone} />
          ))}
        </div>
      )}

      <div className="sd-cols">
        {shown.map((c) => (
          <div className="section" key={c.title}>
            <h3 className="primary">{c.title}<span className="count">{c.rows.length}</span></h3>
            <div className="sd-places">
              {c.rows.map((r) => (
                <button
                  key={r.key}
                  className={'sd-place' + (c.active === r.key ? ' on' : '')}
                  onClick={() => c.onPick(c.active === r.key ? null : r.key)}
                >
                  <span className="sd-place-n">{r.key}</span>
                  <span className="sd-place-v">{r.value}</span>
                  {r.sub && <span className="sd-place-c">{r.sub}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="section">
          <h3 className="sec">Звірка</h3>
          <div className="sd-audit">
            {audit?.open ? (
              <div className="attn">
                <span className="attn-text">
                  Звірка <b>{audit.open.id}</b> триває — почав {audit.open.who || '—'} {audit.open.date}
                </span>
                <button className="act-btn act-accept" onClick={() => onOpen({ kind: 'audit', name: null })}>
                  Продовжити
                </button>
              </div>
            ) : (
              <div className="attn">
                <span className="attn-text">
                  {audit?.last
                    ? <>Востаннє звіряли <b>{audit.last.date}</b> — підтверджено {audit.last.ok}, не знайдено {audit.last.missing}</>
                    : <>{scope ? <>«{scope}» ще жодного разу не звіряли</> : <>Звірки ще не було</>}</>}
                </span>
                <button className="act-btn" onClick={() => onOpen({ kind: 'audit', name: null })}>
                  Звірити
                </button>
              </div>
            )}
            {attn.map((a, i) => (
              <div className={'attn ' + (a.bad ? 'attn-bad' : '')} key={i}>
                <span className="attn-text">{a.text}</span>
                {a.action && (
                  <button className="act-btn" onClick={a.action.run}>{a.action.label}</button>
                )}
              </div>
            ))}
          </div>

          {moves.length > 0 && (
            <div className="sd-moves">
              <div className="sd-moves-t">Останні рухи</div>
              {moves.map((m, i) => (
                <div className="sd-move" key={i}>
                  <span className="sd-move-d">{m.date}</span>
                  <span className={'sd-move-a ' + (m.out ? 'is-out' : 'is-in')}>{m.action}</span>
                  <span className="sd-move-n">{m.name}</span>
                  {m.qty !== undefined && <span className="sd-move-q">{m.qty}</span>}
                  {m.who && <span className="sd-move-w">{m.who}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Рядки, згруповані за значенням — порожні значення в окрему групу в кінці */
function groupRows(items, pick, emptyLabel = 'Без значення') {
  const map = new Map();
  items.forEach((it) => {
    const key = (pick(it) || '').toString().trim() || emptyLabel;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  });
  return [...map.entries()]
    .map(([key, rows]) => ({ key, rows }))
    .sort((a, b) => {
      if (a.key === emptyLabel) return 1;
      if (b.key === emptyLabel) return -1;
      return b.rows.length - a.rows.length || a.key.localeCompare(b.key, 'uk');
    });
}

/** Розріз «скільки чого за значенням колонки», найбільші зверху */
function cutBy(items, pick, { limit = 10 } = {}) {
  const map = new Map();
  items.forEach((it) => {
    const v = (pick(it) || '').toString().trim();
    if (!v) return;
    map.set(v, (map.get(v) || 0) + 1);
  });
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'uk'))
    .slice(0, limit)
    .map(([key, value]) => ({ key, value }));
}

/* ---------- Дашборд складу Рибаківки ---------- */

/**
 * Верх сторінки складу: скільки всього, скільки за документами, де що лежить,
 * що закінчилось і коли востаннє звіряли. Числа рахуємо по тому, що зараз
 * показано на екрані, — фільтри мають на них впливати.
 */
function StockDash({ items, all, moves, audit, onPlace, place, onOpen }) {
  const sum = (list, pick) => list.reduce((a, it) => a + (Number(pick(it)) || 0), 0);
  const left = (kind) => items.filter((it) => (it.accounting || '') === kind)
    .reduce((a, it) => a + it.remainder, 0);

  // за місцем: скільки позицій і скільки штук у кожному ящику
  const byPlace = new Map();
  items.forEach((it) => {
    const key = (it.place || '').trim() || 'Без місця';
    const cur = byPlace.get(key) || { place: key, count: 0, left: 0 };
    cur.count += 1;
    cur.left += it.remainder;
    byPlace.set(key, cur);
  });
  const places = [...byPlace.values()].sort((a, b) => b.left - a.left || b.count - a.count);

  const empty = items.filter((it) => it.remainder <= 0);
  const unmarked = items.filter((it) => !it.accounting).length;
  const recent = moves.slice(-6).reverse();

  return (
    <div className="sd">
      <div className="stats">
        <Stat value={items.length} label="Позицій" sub={all !== items.length ? `з ${all}` : null} />
        <Stat value={sum(items, (it) => it.remainder)} label="Залишок" tone="ok" />
        <Stat value={left('Облікове')} label="За документами" sub="числиться в паперах" />
        <Stat value={left('Необлікове')} label="Поза обліком" sub={unmarked ? `${unmarked} без позначки` : null} />
      </div>

      <div className="sd-cols">
        <div className="section">
          <h3 className="primary">Де що лежить<span className="count">{places.length}</span></h3>
          {places.length === 0 ? (
            <div className="empty">Місця ще не вказані</div>
          ) : (
            <div className="sd-places">
              {places.map((p) => (
                <button
                  key={p.place}
                  className={'sd-place' + (place === p.place ? ' on' : '')}
                  onClick={() => onPlace(place === p.place ? null : p.place)}
                >
                  <span className="sd-place-n">{p.place}</span>
                  <span className="sd-place-v">{p.left}</span>
                  <span className="sd-place-c">{p.count} поз.</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <h3 className="sec">Звірка</h3>
          <div className="sd-audit">
            {audit?.open ? (
              <div className="attn">
                <span className="attn-text">
                  Звірка <b>{audit.open.id}</b> триває — почав {audit.open.who || '—'} {audit.open.date}
                </span>
                <button className="act-btn act-accept" onClick={() => onOpen({ kind: 'audit' })}>
                  Продовжити
                </button>
              </div>
            ) : (
              <div className="attn">
                <span className="attn-text">
                  {audit?.last
                    ? <>Востаннє звіряли <b>{audit.last.date}</b> — підтверджено {audit.last.ok}, не знайдено {audit.last.missing}</>
                    : <>Склад ще жодного разу не звіряли</>}
                </span>
                <button className="act-btn" onClick={() => onOpen({ kind: 'audit' })}>
                  Звірити склад
                </button>
              </div>
            )}
            {empty.length > 0 && (
              <div className="attn attn-bad">
                <span className="attn-text">
                  Закінчилось позицій: <b>{empty.length}</b>
                  <span className="sd-empty"> {empty.slice(0, 4).map((e) => e.name).join(', ')}
                    {empty.length > 4 ? '…' : ''}</span>
                </span>
              </div>
            )}
          </div>

          {recent.length > 0 && (
            <div className="sd-moves">
              <div className="sd-moves-t">Останні рухи</div>
              {recent.map((m, i) => (
                <div className="sd-move" key={i}>
                  <span className="sd-move-d">{m.date}</span>
                  <span className={'sd-move-a ' + (m.action === 'Списано' ? 'is-out' : 'is-in')}>{m.action}</span>
                  <span className="sd-move-n">{m.name}</span>
                  <span className="sd-move-q">{m.qty}</span>
                  {m.who && <span className="sd-move-w">{m.who}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Комплектність позиції: що входить до комплекту й чого зараз бракує.
 * Поки нічого не заведено — блок згорнутий у рядок, щоб не роздувати картку.
 */
function KitBlock({ item, lines, loading, open, onToggle, onAdd, onMove, onDelete, onEdit }) {
  const total = lines.reduce((a, l) => a + l.total, 0);
  const left = lines.reduce((a, l) => a + l.left, 0);
  const full = lines.length > 0 && left === total;

  if (!lines.length && !open) {
    return (
      <button className="kit-off" onClick={onToggle} disabled={loading}>
        {loading ? 'комплектність…' : '+ Описати комплектність'}
      </button>
    );
  }

  return (
    <>
      {lines.length > 0 && (
        <button className={'kit-sum' + (full ? ' is-full' : '')} onClick={onToggle}>
          <span className="kit-sum-t">Комплект</span>
          <span className="kit-sum-v">{left} з {total}</span>
          <span className="kit-sum-s">{full ? 'повний' : `бракує ${total - left}`}</span>
          <span className="kit-sum-x">{open ? '▲' : '▼'}</span>
        </button>
      )}
      {open && (
        <BoxContents
          box={null}
          lines={lines}
          loading={loading}
          title="Що входить"
          addLabel="+ до комплекту"
          emptyHint={`Опишіть, з чого складається «${item.name}»: тоді на звірці буде видно, чого бракує.`}
          onAdd={onAdd}
          onMove={onMove}
          onImport={() => {}}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      )}
    </>
  );
}

/** Позиції, згруповані за ящиком (місцем) — з підсумком по кожному */
function stockGroups(items) {
  const map = new Map();
  items.forEach((it) => {
    const key = (it.place || '').trim() || 'Без місця';
    if (!map.has(key)) map.set(key, { place: key, items: [], left: 0, booked: 0 });
    const g = map.get(key);
    g.items.push(it);
    g.left += it.remainder;
    if (it.accounting === 'Облікове') g.booked += it.remainder;
  });
  return [...map.values()].sort((a, b) => b.left - a.left || a.place.localeCompare(b.place, 'uk'));
}

function StockView({ setState, focusId, onClearFocus, onOpen }) {
  const grow = useGrow();
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(null);
  const [acct, setAcct] = useState(null);
  const [adding, setAdding] = useState(false);
  const [move, setMove] = useState(null); // { item, kind: 'receive' | 'writeoff' }
  const [hist, setHist] = useState({});
  const [photo, setPhoto] = useState(null);
  const [place, setPlace] = useState(null);
  const [grouped, setGrouped] = useState(false);
  const [kits, setKits] = useState(null);   // комплектність позицій
  const [addKit, setAddKit] = useState(null); // ID позиції, до якої додаємо
  const [kitMove, setKitMove] = useState(null); // {line, kind}
  const [openKit, setOpenKit] = useState({}); // які комплекти розгорнуті
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

  const loadKits = useCallback(async () => {
    try {
      setKits(await api('/api/boxes'));
    } catch {
      // комплектність — доповнення: без неї склад має лишатись робочим
      setKits({ lines: [], units: [], names: [], people: [], conditions: [], accountingOptions: [] });
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadKits(); }, [loadKits]);
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
  if (place) list = list.filter((it) => ((it.place || '').trim() || 'Без місця') === place);
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    list = list.filter((it) =>
      [it.id, it.name, it.description, it.category, it.place, it.notes]
        .join(' ').toLowerCase().includes(s));
  }

  const sum = (pick) => list.reduce((a, it) => a + (Number(pick(it)) || 0), 0);
  const left = (kind) =>
    list.filter((it) => (it.accounting || '') === kind).reduce((a, it) => a + it.remainder, 0);

  /** Картка позиції — та сама і в звичайному списку, і в групуванні за ящиками */
  const saveKitLine = async (line, field, value, prev) => {
    if (value === prev) return;
    setState('збереження…');
    try {
      await api('/api/boxes', { method: 'PATCH', body: { row: line.row, field, value, prev } });
      setKits((p) => ({
        ...p,
        lines: p.lines.map((l) => (l.row === line.row
          ? { ...l, [field]: field === 'total' ? Number(value) || 0 : value,
              left: field === 'total' ? (Number(value) || 0) - l.taken : l.left }
          : l)),
      }));
      setState('синхронізовано');
      toast('Збережено');
    } catch (e) {
      setState('помилка збереження');
      saveFailed(toast, e);
    }
  };

  const delKitLine = async (line) => {
    if (!confirm(`Прибрати «${line.name}» з комплекту ${line.box}?`)) return;
    try {
      const d = await api('/api/boxes', { method: 'DELETE', body: { row: line.row } });
      setKits((p) => ({ ...p, lines: d.lines }));
      toast(`Прибрано «${line.name}»`, { type: 'warn' });
    } catch (e) {
      saveFailed(toast, e);
    }
  };

  const renderCard = (it) => {
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
              <textarea className="ghost" rows={2} defaultValue={it.description} {...grow}
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
          {/* Написана примітка світиться, порожня — ні: акцент, що стоїть
              завжди, за тиждень перестають помічати. */}
          <div className={'drow' + (it.notes ? ' has-note' : '')}>
            <span className="drow-k">Примітки</span>
            <span className="drow-v">
              <textarea className="ghost" rows={1} defaultValue={it.notes} placeholder="—" {...grow}
                onBlur={(e) => save(it.row, 'notes', e.target.value, it.notes)} />
            </span>
          </div>
        </div>

        <KitBlock
          item={it}
          lines={(kits?.lines || []).filter((l) => l.box === it.id)}
          loading={!kits}
          open={!!openKit[it.id]}
          onToggle={() => setOpenKit((p) => ({ ...p, [it.id]: !p[it.id] }))}
          onAdd={() => setAddKit(it)}
          onMove={(line, kind) => setKitMove({ line, kind })}
          onDelete={delKitLine}
          onEdit={saveKitLine}
        />

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
  };

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
        <button
          className={'btn btn-group' + (grouped ? ' on' : '')}
          onClick={() => setGrouped(!grouped)}
          title="Показати позиції згруповано за ящиками"
        >
          За ящиками
        </button>
        <ViewToggle mode={mode} onChange={setMode} />
        <button className="btn btn-accept" onClick={() => setAdding(true)}>+ Додати позицію</button>
      </div>

      {!focusId && (
        <StockDash
          items={list}
          all={data.items.length}
          moves={data.moves}
          audit={data.audit}
          place={place}
          onPlace={setPlace}
          onOpen={onOpen}
        />
      )}

      {place && (
        <div className="scan-banner">
          <span>Показано лише <b>{place}</b></span>
          <button className="act-btn" onClick={() => setPlace(null)}>Показати всі місця</button>
        </div>
      )}

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
        parts={focusId ? [
          ['Позицій', list.length],
          ['Прийнято', sum((it) => it.received)],
          ['Списано', sum((it) => it.writtenOff)],
          ['Залишок', sum((it) => it.remainder)],
          ['За документами', left('Облікове')],
          ['Поза обліком', left('Необлікове')],
        ] : [
          // решту чисел уже показує дашборд — тут лише те, чого там немає
          ['Прийнято', sum((it) => it.received)],
          ['Списано', sum((it) => it.writtenOff)],
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
      ) : grouped ? (
        stockGroups(list).map((g) => (
          <div className="sd-group" key={g.place}>
            <div className="sd-group-h">
              <span className="sd-group-n">{g.place}</span>
              <span className="sd-group-s">
                позицій: <b>{g.items.length}</b> · залишок: <b>{g.left}</b>
                {g.booked ? <> · за документами: <b>{g.booked}</b></> : null}
              </span>
            </div>
            <div className="grid">
              {g.items.map((it) => renderCard(it))}
            </div>
          </div>
        ))
      ) : (
        <div className="grid">
          {list.map((it) => renderCard(it))}
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

      {addKit && kits && (
        <BoxLineModal
          box={addKit.id}
          title={`Що входить у «${addKit.name}»`}
          units={kits.units}
          names={kits.names}
          accountingOptions={kits.accountingOptions || []}
          onClose={() => setAddKit(null)}
          onDone={(d) => {
            setKits((p) => ({ ...p, lines: d.lines }));
            toast(`Додано до комплекту ${addKit.id}`);
          }}
        />
      )}

      {kitMove && (
        <BoxMoveModal
          line={kitMove.line}
          kind={kitMove.kind}
          people={kits?.people || []}
          conditions={kits?.conditions || []}
          sheet={STOCK_SHEET_NAME}
          onClose={() => setKitMove(null)}
          onDone={(d) => {
            setKits((p) => ({ ...p, lines: d.lines }));
            toast(boxAct(kitMove.kind, d, 'комплекту'));
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

/** Список того, що лежить у ящику: скільки на місці, скільки на руках */
function BoxContents({ box, lines, loading, title = 'Вміст', addLabel = '+ позиція', emptyHint, onAdd, onMove, onImport, onDelete, onEdit }) {
  const total = lines.reduce((a, l) => a + l.total, 0);
  const left = lines.reduce((a, l) => a + l.left, 0);
  const taken = lines.reduce((a, l) => a + l.taken, 0);

  return (
    <div className="box-con">
      <div className="box-con-head">
        <span className="box-con-t">{title}</span>
        {lines.length > 0 && (
          <span className="box-con-sum">
            позицій: <b>{lines.length}</b> · на місці: <b>{left}</b> з <b>{total}</b>
            {taken > 0 && <> · на руках: <b className="box-con-out">{taken}</b></>}
          </span>
        )}
        <button className="box-con-add" onClick={onAdd} title="Додати до вмісту">{addLabel}</button>
      </div>

      {loading && <div className="box-con-empty">завантаження…</div>}

      {!loading && lines.length === 0 && (
        <div className="box-con-empty">
          {box?.contents?.trim() ? (
            <>
              <div className="box-con-old">{box.contents}</div>
              <button className="act-btn" onClick={onImport}>
                Розібрати на позиції
              </button>
            </>
          ) : (
            emptyHint || 'Порожньо. Натисніть «+ позиція», щоб описати, що всередині.'
          )}
        </div>
      )}

      {lines.map((l) => (
        <div className={'box-line' + (l.left <= 0 ? ' is-out' : '')} key={l.row}>
          <input
            className="ghost box-line-n"
            type="text"
            defaultValue={l.name}
            onBlur={(e) => onEdit(l, 'name', e.target.value, l.name)}
          />
          <BoxLeft line={l} />
          <div className="box-line-b">
            <button className="box-b" disabled={l.left <= 0} title="Взяти" onClick={() => onMove(l, 'take')}>−</button>
            <button className="box-b" disabled={l.taken <= 0} title="Повернути" onClick={() => onMove(l, 'give')}>+</button>
            <button className="box-b box-b-x" title="Прибрати з ящика" onClick={() => onDelete(l)}>×</button>
          </div>
          {(l.accounting || l.note) && (
            <div className="box-line-m">
              {l.accounting && (
                <span className={'tag ' + (l.accounting === 'Облікове' ? 'tag-acc' : 'tag-type')}>{l.accounting}</span>
              )}
              {l.note && <span className="box-line-note">{l.note}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Склад ---------- */
function WarehouseView({ setState, focusCode, onOpen }) {
  const grow = useGrow();
  const [data, setData] = useState(null);
  const [boxes, setBoxes] = useState(null); // вміст ящиків окремими позиціями
  const [q, setQ] = useState('');
  const [chip, setChip] = useState(null);
  const [adding, setAdding] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [qr, setQr] = useState(null);
  const [loc, setLoc] = useState(null);          // фільтр за розташуванням
  const [addLine, setAddLine] = useState(null); // код ящика, куди кладемо
  const [boxMove, setBoxMove] = useState(null); // {line, kind}
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

  const loadBoxes = useCallback(async () => {
    try {
      setBoxes(await api('/api/boxes'));
    } catch (e) {
      // вміст — доповнення до картки: без нього склад має лишатись робочим
      setBoxes({ lines: [], units: [], names: [], people: [], accountingOptions: [] });
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadBoxes(); }, [loadBoxes]);

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

  /** Одне поле позиції — назва, кількість, облік */
  const saveLine = async (line, field, value, prev) => {
    if (value === prev) return;
    setState('збереження…');
    try {
      await api('/api/boxes', { method: 'PATCH', body: { row: line.row, field, value, prev } });
      setBoxes((p) => ({
        ...p,
        lines: p.lines.map((l) => (l.row === line.row
          ? { ...l, [field]: field === 'total' ? Number(value) || 0 : value,
              left: field === 'total' ? (Number(value) || 0) - l.taken : l.left }
          : l)),
      }));
      setState('синхронізовано');
      toast('Збережено');
    } catch (e) {
      setState('помилка збереження');
      saveFailed(toast, e);
    }
  };

  const delLine = async (line) => {
    if (!confirm(`Прибрати «${line.name}» з ящика ${line.box}?`)) return;
    setState('видалення…');
    try {
      const d = await api('/api/boxes', { method: 'DELETE', body: { row: line.row } });
      setBoxes((p) => ({ ...p, lines: d.lines }));
      setState('синхронізовано');
      toast(`Прибрано «${line.name}»`, { type: 'warn' });
    } catch (e) {
      setState('помилка видалення');
      saveFailed(toast, e);
    }
  };

  /** Старий текстовий вміст → позиції. Показуємо, що вийшло, і питаємо. */
  const importContents = async (box) => {
    if (!box.contents?.trim()) return;
    setState('розбір вмісту…');
    try {
      const { parsed } = await api('/api/boxes', {
        method: 'POST', body: { action: 'preview', text: box.contents },
      });
      setState('синхронізовано');
      if (!parsed.length) {
        toast('З цього тексту не вийшло виділити позиції', { type: 'warn' });
        return;
      }
      const preview = parsed.map((x) => `• ${x.name} — ${x.total} ${x.unit}`).join('\n');
      if (!confirm(`Створити ${parsed.length} позицій у ящику ${box.code}?\n\n${preview}`)) return;
      setState('створення…');
      const d = await api('/api/boxes', {
        method: 'POST', body: { action: 'import', box: box.code, text: box.contents },
      });
      setBoxes((p) => ({ ...p, lines: d.lines }));
      setState('синхронізовано');
      toast(`Створено позицій: ${d.added}`);
    } catch (e) {
      setState('помилка розбору');
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
  if (loc) list = list.filter((it) => (it.location || '').trim() === loc);
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    // назви позицій усередині ящика теж шукаємо: «ПНВ» має знайти ящик,
    // у якому вони лежать, а не лише той, у чиїй назві є це слово
    const byLine = new Set(
      (boxes?.lines || [])
        .filter((l) => [l.name, l.note, l.accounting].join(' ').toLowerCase().includes(s))
        .map((l) => l.box)
    );
    list = list.filter((it) =>
      byLine.has(it.code) ||
      [it.code, it.name, it.contents, it.location].join(' ').toLowerCase().includes(s)
    );
  }

  // числа підсумку рахуємо лише по тих ящиках, що зараз на екрані
  const shownCodes = new Set(list.map((it) => it.code));
  const shownLines = (boxes?.lines || []).filter((l) => shownCodes.has(l.box));
  const outCount = shownLines.reduce((a, l) => a + l.taken, 0);

  // ящик, який давно не відкривали, — перший кандидат на несподіванку
  const daysSince = (d) => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((d || '').toString().trim());
    if (!m) return null;
    return Math.floor((Date.now() - Date.UTC(+m[3], +m[2] - 1, +m[1])) / 86400000);
  };
  const stale = list.filter((it) => {
    const d = daysSince(it.updated) ?? daysSince(it.checkedDate);
    return d !== null && d >= 90;
  });

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

      {!focusCode && (
        <PageDash
          stats={[
            { label: 'Ящиків', value: list.length, sub: list.length !== data.items.length ? `з ${data.items.length}` : null },
            { label: 'Позицій усередині', value: shownLines.length },
            { label: 'На місці', value: shownLines.reduce((a, l) => a + l.left, 0), tone: 'ok' },
            { label: 'На руках', value: outCount, sub: outCount ? 'треба повернути' : null },
          ]}
          cuts={[{
            title: 'Де стоять ящики',
            rows: cutBy(list, (it) => it.location),
            active: loc,
            onPick: setLoc,
          }]}
          audit={data.audit}
          scope="Склад"
          attn={stale.length ? [{
            bad: true,
            text: <>Давно не перевіряли: <b>{stale.length}</b> <span className="sd-empty">{stale.slice(0, 4).map((x) => x.code).join(', ')}{stale.length > 4 ? '…' : ''}</span></>,
          }] : []}
          moves={(data.moves || []).map((m) => ({
            date: m.date, action: m.action, name: `${m.name} (${m.box})`,
            qty: m.qty, who: m.to || m.who, out: m.action === 'Взяв' || m.action === 'Списав',
          }))}
          onOpen={onOpen}
        />
      )}

      {loc && (
        <div className="scan-banner">
          <span>Показано лише <b>{loc}</b></span>
          <button className="act-btn" onClick={() => setLoc(null)}>Показати всі</button>
        </div>
      )}

      <Totals
        parts={countBy(list, (it) => it.status)}
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
            {
              key: 'notes', title: 'Примітки',
              render: (it) => (it.notes ? <span className="note-in">{it.notes}</span> : '—'),
            },
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
                {/* той самий title-line, що й в інших картках: інакше правила
                    для вузького екрана сюди просто не дістають */}
                <div className="card-title title-line">
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

              <BoxContents
                box={it}
                lines={(boxes?.lines || []).filter((l) => l.box === it.code)}
                loading={!boxes}
                onAdd={() => setAddLine(it.code)}
                onMove={(line, kind) => setBoxMove({ line, kind })}
                onImport={() => importContents(it)}
                onDelete={(line) => delLine(line)}
                onEdit={(line, field, value, prev) => saveLine(line, field, value, prev)}
              />

              <div className="card-body">
                {[
                  ['Розташування', 'location'], ['Примітки', 'notes'],
                ].map(([label, field]) => (
                  <div className={'drow' + (field === 'notes' && it.notes ? ' has-note' : '')} key={field}>
                    <span className="drow-k">{label}</span>
                    <span className="drow-v">
                      {/* Примітка — поле, що росте: в один рядок вона
                          обрізалась посеред слова, і підсвічений хвіст
                          читався гірше, ніж сірий цілий. Розташування
                          лишається рядком: воно й є коротким. */}
                      {field === 'notes' ? (
                        <textarea className="ghost" rows={1} defaultValue={it[field]} placeholder="—" {...grow}
                          onBlur={(e) => e.target.value !== it[field] && save(it.row, field, e.target.value, it[field], it.code)} />
                      ) : (
                        <input className="ghost" type="text" defaultValue={it[field]} placeholder="—"
                          onBlur={(e) => e.target.value !== it[field] && save(it.row, field, e.target.value, it[field], it.code)} />
                      )}
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

      {addLine && boxes && (
        <BoxLineModal
          box={addLine}
          units={boxes.units}
          names={boxes.names}
          accountingOptions={boxes.accountingOptions || []}
          onClose={() => setAddLine(null)}
          onDone={(d) => {
            setBoxes((p) => ({ ...p, lines: d.lines }));
            toast(`Покладено в ящик ${addLine}`);
          }}
        />
      )}

      {boxMove && (
        <BoxMoveModal
          line={boxMove.line}
          kind={boxMove.kind}
          people={boxes?.people || []}
          conditions={boxes?.conditions || []}
          onClose={() => setBoxMove(null)}
          onDone={(d) => {
            setBoxes((p) => ({ ...p, lines: d.lines }));
            toast(boxAct(boxMove.kind, d));
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
  // і яке з них головне: у більшості листів це перша колонка, але не в усіх —
  // сервер знає, де назва речі, і форма має питати саме її
  const [titleCol, setTitleCol] = useState(0);
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
        setTitleCol(d.titleCol ?? 0);
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

  const titleField = fields.find((f) => f.col === titleCol);
  const subFields = fields.filter((f) => f.col !== titleCol);
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
              placeholder={titleField?.label || 'Назва'}
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
