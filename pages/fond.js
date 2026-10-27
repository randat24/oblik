/**
 * Спільний фонд: хто кому винен і скільки в касі.
 *
 * Єдина сторінка застосунку, відкрита **без входу**. Решта розділів
 * тримає майно підрозділу й за сесією лишається; тут інше — шестеро
 * скидаються на спільне, і дивитись на власні борги, вводячи PIN
 * щоразу, нікому не хочеться.
 *
 * Відкрите тільки читання. Кнопки запису з'являються лише тому, хто
 * увійшов: інакше журнал перестав би відповідати на питання «хто».
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import {
  api, ToastCtx, ToastHost, useToasts, useToast, saveFailed, todayStr,
} from '../components/base';
import {
  CATEGORIES, categoryOf, kop, money, signed, compute, effect, eligible,
  byOrder, statusOn, opTitle, balanceWord, livedOps, invariantOk, shortReport,
  openPeriod, leaveGroup, rejoinGroup, addVacation,
} from '../lib/fund';
import { monthsOf, monthReport, memberStatement } from '../lib/fund-report';

const OFF_KEY = 'fund-off';

const TABS = [
  ['sum', 'Зведення'],
  ['add', 'Витрата'],
  ['cash', 'Каса'],
  ['log', 'Журнал'],
  ['rep', 'Звіти'],
  ['people', 'Учасники'],
];

const dmy = (d) => (d ? d.split('-').reverse().join('.') : '');

export default function FundPage() {
  const { toasts, push, close } = useToasts();
  return (
    <ToastCtx.Provider value={push}>
      <Head>
        <title>Спільний фонд</title>
        {/* Сторінка відкрита, але в пошуковій видачі їй робити нічого */}
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Fund />
      <ToastHost toasts={toasts} onClose={close} />
    </ToastCtx.Provider>
  );
}

function Fund() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('sum');
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const d = await api('/api/fund');
      setData(d);
      setErr('');
    } catch (e) {
      setErr(e.message || 'Не вдалося завантажити');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const state = useMemo(
    () => (data ? compute(data.members, data.ops, data.config) : null),
    [data],
  );

  if (err) return <div className="wrap"><div className="fund-wrap"><div className="empty">{err}</div></div></div>;
  if (!data || !state) return <div className="wrap"><div className="fund-wrap"><div className="loading">Завантаження…</div></div></div>;

  const { members, ops, config, canEdit } = data;
  const nameOf = (id) => (id === 'cash' ? 'Каса' : members.find((m) => m.id === id)?.name || '—');
  const ok = invariantOk(state, config);

  return (
    <div className="wrap">
      <div className="fund-wrap">
        <header className="fund-head">
          <div>
            <h1 className="fund-h1">Спільний фонд</h1>
            <span className="fund-sub">
              Мінус — учасник винен фондові. Плюс — фонд винен йому.
            </span>
          </div>
          {!canEdit && <span className="fund-ro">тільки перегляд</span>}
        </header>

        <nav className="fund-tabs">
          {TABS.map(([k, label]) => (
            <button key={k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </nav>

        {!ok && (
          <div className="fund-bad">
            Каса не сходиться з балансами. Перевірте журнал — показані цифри
            можуть бути неправильні.
          </div>
        )}

        {!members.length && (
          <Empty canSeed={data.canSeed} onDone={load} toast={toast} />
        )}

        {tab === 'sum' && !!members.length && <Summary state={state} members={members} config={config} ops={ops} nameOf={nameOf} />}
        {tab === 'add' && (canEdit
          ? <ExpenseForm members={members} ops={ops} config={config} onDone={load} toast={toast} />
          : <LoginHint what="записувати витрати" />)}
        {tab === 'cash' && (canEdit
          ? <CashForm members={members} ops={ops} config={config} onDone={load} toast={toast} />
          : <LoginHint what="робити операції з касою" />)}
        {tab === 'log' && (
          <Journal ops={ops} members={members} nameOf={nameOf} canEdit={canEdit}
            onDone={load} toast={toast} />
        )}
        {tab === 'rep' && !!members.length && <Reports members={members} ops={ops} config={config} nameOf={nameOf} />}
        {tab === 'people' && <People members={members} state={state} ops={ops} canEdit={canEdit} onDone={load} toast={toast} />}
      </div>
    </div>
  );
}

/**
 * Порожній фонд.
 *
 * Початковий стан вписується один раз і тільки звідси: доступу до
 * таблиці з-поза застосунку немає, а руками шість рядків із копійками
 * набирають з помилками.
 */
function Empty({ canSeed, onDone, toast }) {
  const [busy, setBusy] = useState(false);
  const seed = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api('/api/fund', { method: 'POST', label: 'початковий стан', body: { action: 'seed' } });
      toast(`Записано учасників: ${r.members}`);
      onDone();
    } catch (e) { saveFailed(toast, e); } finally { setBusy(false); }
  };

  return (
    <div className="fund-card">
      <h2 className="fund-h2">Фонд ще порожній</h2>
      <p className="fund-p">
        Початковий стан — шестеро з балансами й каса 13 199,00 грн, із них
        2,00 грн розходження, яке ні на кого не розподілене.
      </p>
      {canSeed
        ? (
          <>
            <p className="fund-hint">
              Записується один раз. Якщо учасники вже є, кнопка нічого не
              зробить: повторний запуск подвоїв би всім початкові баланси.
            </p>
            <button className="btn" onClick={seed} disabled={busy}>
              {busy ? 'Записуємо…' : 'Вписати початковий стан'}
            </button>
          </>
        )
        : <p className="fund-hint">Вписати його може адміністратор застосунку.</p>}
    </div>
  );
}

/** Гостю кнопок не показуємо, але й не вдаємо, що їх немає взагалі */
const LoginHint = ({ what }) => (
  <div className="fund-card">
    <div className="empty">
      Щоб {what}, увійдіть у застосунок — <a className="h-link" href="/">на головну</a>.
      Переглядати фонд можна й без входу.
    </div>
  </div>
);

/* ---------- Зведення ---------- */

const HUES = [152, 28, 262, 205, 340, 48];
const hueOf = (m, i) => HUES[(m.order ? m.order - 1 : i) % HUES.length];
const longDate = (d) => {
  const [y, mo, da] = d.split('-').map(Number);
  return `${da} ${['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня',
    'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'][mo - 1]} ${y}`;
};

/** Знак операції для стрічки: що вона зробила з касою й людьми */
const OP_MARK = { expense: '−', deposit: '＋', reimburse: '↗', transfer: '⇄', adjust: '±' };

function Person({ m, i, bal, max, today }) {
  const st = statusOn(m, today);
  const w = max ? Math.max(4, Math.round((Math.abs(bal) / max) * 100)) : 0;
  return (
    <div className={'fund-person' + (bal < 0 ? ' is-owe' : bal > 0 ? ' is-save' : '')}>
      <span className="fund-ava" style={{ '--h': hueOf(m, i) }}>{m.name.slice(0, 1)}</span>
      <div className="fund-pbody">
        <div className="fund-ptop">
          <b>{m.name}</b>
          <span className="fund-pv">{bal ? signed(bal) : '0,00'}</span>
        </div>
        <div className="fund-bar"><i style={{ width: `${w}%` }} /></div>
        <span className="fund-pnote">
          {balanceWord(bal)}{st !== 'in' && (st === 'vac' ? ' · у відпустці' : ' · не в групі')}
        </span>
      </div>
    </div>
  );
}

function Summary({ state, members, config, ops, nameOf }) {
  const toast = useToast();
  const ms = byOrder(members);
  const base = config.openingDiff || 0;
  const today = todayIso();
  const text = shortReport(state, members);
  const max = Math.max(1, ...ms.map((m) => Math.abs(state.bal[m.id] || 0)));
  const owe = ms.filter((m) => (state.bal[m.id] || 0) < 0);
  const save = ms.filter((m) => (state.bal[m.id] || 0) > 0);
  const even = ms.filter((m) => !(state.bal[m.id] || 0));
  const recent = livedOps(ops).slice(-5).reverse();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Скопійовано — можна вставляти в месенджер');
    } catch {
      toast('Не вдалося скопіювати — виділіть текст вручну', { type: 'err' });
    }
  };

  const group = (title, list, tone) => !!list.length && (
    <section className="fund-group" key={title}>
      <h2 className={'fund-gh ' + tone}>{title}<span>{list.length}</span></h2>
      <div className="fund-people">
        {list.map((m) => (
          <Person key={m.id} m={m} i={ms.indexOf(m)} bal={state.bal[m.id] || 0} max={max} today={today} />
        ))}
      </div>
    </section>
  );

  return (
    <>
      <section className="fund-hero">
        <span className="fund-hero-k">У касі · {longDate(today)}</span>
        <b className="fund-hero-v">{money(state.cash)}<small> грн</small></b>
        <div className="fund-hero-row">
          <span><i>Борг у касу</i><b className="is-neg">{money(-owe.reduce((a, m) => a + state.bal[m.id], 0))}</b></span>
          <span><i>У плюсі (свої)</i><b className="is-pos">{money(save.reduce((a, m) => a + state.bal[m.id], 0))}</b></span>
        </div>
      </section>

      {group('Борг у касу', owe, 'is-neg')}
      {group('У плюсі — витратили свої', save, 'is-pos')}
      {group('У розрахунку', even, '')}

      <section className="fund-msg">
        <div className="fund-msg-head">
          <h2 className="fund-gh">Повідомлення для чату</h2>
          <button type="button" className="fund-copy" onClick={copy}>Копіювати</button>
        </div>
        <pre className="fund-bubble">{text}</pre>
      </section>

      {!!recent.length && (
        <section className="fund-group">
          <h2 className="fund-gh">Останні операції</h2>
          <div className="fund-feed">
            {recent.map((op) => (
              <div className="fund-feed-i" key={op.id || op.row}>
                <span className={'fund-mark t-' + op.type}>{OP_MARK[op.type] || '·'}</span>
                <span className="fund-who">{opTitle(op, nameOf)}<i>{dmy(op.date)}</i></span>
                <b className="fund-v">{money(op.amount)}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="fund-foot">
        Каса — окрема цифра: вона міняється лише від внесків у касу й виплат з неї.
        Плюс у людини — це не гроші в касі: вона витратила свої, і з цього плюса віднімаються її частки наступних витрат.
        {(state.diff || state.adjusted) ? <> Каса мінус сума балансів: {signed(state.diff)} грн
          {state.adjusted ? <> (початкове {money(base)}, коригування {signed(state.adjusted)})</> : <> — початкове розходження, воно ні на кого не розподілене</>}.</> : null}
      </p>
    </>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/* ---------- Звіти ---------- */

const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
const monthName = (ym) => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;

function Reports({ members, ops, config, nameOf }) {
  const months = useMemo(() => monthsOf(ops, todayIso()), [ops]);
  const [ym, setYm] = useState(months[0]);
  const [who, setWho] = useState('');
  const ms = byOrder(members);
  const r = useMemo(() => monthReport(members, ops, config, ym), [members, ops, config, ym]);
  const st = useMemo(() => (who ? memberStatement(members, ops, who) : null), [members, ops, who]);
  const cats = CATEGORIES.filter((c) => r.cats[c.id].count);

  return (
    <>
      <div className="fund-card">
        <h2 className="fund-h2">Звіт за місяць</h2>
        <div className="fund-seg">
          {months.map((m) => (
            <button key={m} type="button" className={'chip' + (m === ym ? ' on' : '')} onClick={() => setYm(m)}>
              {monthName(m)}
            </button>
          ))}
        </div>

        <div className="fund-rows">
          <div className="fund-row"><span className="fund-who">Витрати<i>{r.total.count} шт.</i></span><b className="fund-v">{money(r.total.spent)}</b></div>
          <div className="fund-row"><span className="fund-who">Внесено в касу</span><b className="fund-v is-pos">{money(r.total.deposits)}</b></div>
          <div className="fund-row"><span className="fund-who">Видано з каси</span><b className="fund-v">{money(r.total.reimbursed)}</b></div>
          <div className="fund-row"><span className="fund-who">Витрачено готівкою з каси</span><b className="fund-v">{money(r.total.fromCash)}</b></div>
          {!!r.total.adjusted && (
            <div className="fund-row"><span className="fund-who">Коригування</span><b className="fund-v">{signed(r.total.adjusted)}</b></div>
          )}
          <div className="fund-row"><span className="fund-who">Каса на початок</span><b className="fund-v">{money(r.cash.start)}</b></div>
          <div className="fund-row"><span className="fund-who">Каса на кінець</span><b className="fund-v">{money(r.cash.end)}</b></div>
        </div>
        {!r.ops && <div className="empty">У цьому місяці операцій не було.</div>}
      </div>

      {!!cats.length && (
        <div className="fund-card">
          <h2 className="fund-h2">За категоріями</h2>
          <div className="fund-rows">
            {cats.map((c) => (
              <div className="fund-row" key={c.id}>
                <span className="fund-who">{c.name}<i>{r.cats[c.id].count} шт.</i></span>
                <b className="fund-v">{money(r.cats[c.id].sum)}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="fund-card">
        <h2 className="fund-h2">По учасниках</h2>
        <div className="fund-rows">
          {ms.map((m) => {
            const e = r.each[m.id];
            return (
              <button type="button" className={'fund-row fund-pick' + (who === m.id ? ' is-on' : '')}
                key={m.id} onClick={() => setWho(who === m.id ? '' : m.id)}>
                <span className="fund-who">
                  {m.name}
                  <i>частка {money(e.share)} · заплатив {money(e.paid)}{e.deposited ? ` · вніс ${money(e.deposited)}` : ''}</i>
                </span>
                <b className="fund-v">
                  <small>{signed(e.start)} →</small> {signed(e.end)}
                </b>
              </button>
            );
          })}
        </div>
        <span className="fund-hint">Натисніть на людину, щоб побачити всю виписку.</span>
      </div>

      {st && (
        <div className="fund-card">
          <h2 className="fund-h2">Виписка: {nameOf(who)}</h2>
          <div className="fund-row">
            <span className="fund-who">Початковий баланс</span>
            <b className="fund-v">{signed(st.opening)}</b>
          </div>
          {!st.rows.length && <div className="empty">Операцій, що зачепили баланс, ще немає.</div>}
          {st.rows.map(({ op, delta, balance }) => (
            <div className="fund-row" key={op.id || op.row}>
              <span className="fund-who">{opTitle(op, nameOf)}<i>{dmy(op.date)}</i></span>
              <b className={'fund-v ' + (delta < 0 ? 'is-neg' : 'is-pos')}>
                {signed(delta)}<small> → {signed(balance)}</small>
              </b>
            </div>
          ))}
          <div className="fund-row">
            <span className="fund-who">Зараз</span>
            <b className="fund-v">{signed(st.closing)}</b>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Витрата ---------- */

function ExpenseForm({ members, ops, config, onDone, toast }) {
  const ms = byOrder(members);
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('var');
  const [date, setDate] = useState(todayIso());
  const [payer, setPayer] = useState(ms[0]?.id || '');
  const [busy, setBusy] = useState(false);
  // знята галочка живе, доки її не поставлять знову: між витратами й між візитами
  const [off, setOff] = useState([]);
  // позначені понад правила (наприклад, той, хто у відпустці) — лише на цю витрату
  const [extra, setExtra] = useState([]);
  useEffect(() => {
    try { setOff(JSON.parse(localStorage.getItem(OFF_KEY) || '[]')); } catch { /* без пам'яті */ }
  }, []);
  const saveOff = (next) => {
    setOff(next);
    try { localStorage.setItem(OFF_KEY, JSON.stringify(next)); } catch { /* приватне вікно */ }
  };

  const auto = useMemo(() => eligible(members, category, date), [members, category, date]);
  const parts = [...auto.filter((id) => !off.includes(id)), ...extra.filter((id) => !auto.includes(id))];
  const manual = parts.length !== auto.length || parts.some((id) => !auto.includes(id));
  const toggle = (id) => {
    if (parts.includes(id)) {
      if (auto.includes(id)) saveOff([...off, id]);
      else setExtra(extra.filter((x) => x !== id));
    } else if (off.includes(id)) saveOff(off.filter((x) => x !== id));
    else setExtra([...extra, id]);
  };

  const sum = kop(amount);
  const draft = {
    type: 'expense', amount: sum, date, category, payer,
    mode: manual ? 'manual' : 'auto', participants: parts,
  };
  const preview = Number.isFinite(sum) && sum > 0 && parts.length
    ? effect(draft, members) : null;

  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!Number.isFinite(sum) || sum <= 0) return toast('Вкажіть суму більшу за нуль', { type: 'err' });
    if (!parts.length) return toast('Відмітьте хоча б одного учасника', { type: 'err' });
    setBusy(true);
    try {
      await api('/api/fund', {
        method: 'POST', label: 'витрата фонду',
        body: { action: 'expense', amount, desc, category, date, payer, mode: manual ? 'manual' : 'auto', participants: parts },
      });
      toast(`Записано: ${money(sum)} грн`);
      setAmount(''); setDesc('');
      onDone();
    } catch (ex) { saveFailed(toast, ex); } finally { setBusy(false); }
  };

  return (
    <form className="fund-card" onSubmit={send}>
      <h2 className="fund-h2">Нова витрата</h2>
      <label className="fund-f">Сума, грн
        <input className="fund-amount" inputMode="decimal" value={amount}
          onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
      </label>
      <label className="fund-f">Що купили
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Продукти" />
      </label>
      <div className="fund-two">
        <label className="fund-f">Категорія
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="fund-f">Дата
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label className="fund-f">Хто платив
        <select value={payer} onChange={(e) => setPayer(e.target.value)}>
          {ms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          <option value="cash">Зі спільної каси (готівкою)</option>
        </select>
      </label>

      <div className="fund-f">
        <span>На кого ділимо</span>
        <div className="fund-seg">
          {off.length > 0 && (
            <button type="button" className="chip is-clear" onClick={() => { saveOff([]); setExtra([]); }}>
              Повернути всіх
            </button>
          )}
        </div>
        <div className="fund-parts">
          {ms.map((m) => {
            const on = parts.includes(m.id);
            const st = statusOn(m, date);
            return (
              <label key={m.id} className={'chip' + (on ? ' on' : '')}>
                <input type="checkbox" checked={on} onChange={() => toggle(m.id)} />
                {m.name}{st !== 'in' && <i> · {st === 'vac' ? 'відпустка' : 'не в групі'}</i>}
              </label>
            );
          })}
        </div>
        <span className="fund-hint">
          {off.length > 0
            ? 'Знята галочка запам’ятовується: поки ви не поставите її знову, людина в витратах не бере участі.'
            : categoryOf(category).hint}
        </span>
      </div>

      {preview && (
        <div className="fund-prev">
          <span className="fund-k">Частки</span>
          {preview.parts.map((id) => (
            <div className="fund-row" key={id}>
              <span>{members.find((m) => m.id === id)?.name}</span>
              <b className="fund-v">{money(preview.shares[id])}</b>
            </div>
          ))}
          <div className="fund-row">
            <span>Каса</span>
            <b className="fund-v">{preview.cash ? signed(preview.cash) : 'не міняється'}</b>
          </div>
        </div>
      )}

      <button className="btn" disabled={busy}>{busy ? 'Записуємо…' : 'Записати витрату'}</button>
    </form>
  );
}

/* ---------- Каса ---------- */

const CASH_KINDS = [
  ['deposit', 'Учасник вніс готівку в касу'],
  ['reimburse', 'З каси видали гроші учаснику'],
  ['transfer', 'Один учасник віддав гроші іншому'],
  ['adjust', 'Перерахували касу: коригування'],
];

function CashForm({ members, ops, config, onDone, toast }) {
  const ms = byOrder(members);
  const [type, setType] = useState('deposit');
  const [member, setMember] = useState(ms[0]?.id || '');
  const [to, setTo] = useState(ms[1]?.id || '');
  const [sign, setSign] = useState('1');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const sum = kop(amount);
  const now = compute(members, ops, config);
  const draft = { type, amount: sum, member, to, sign: Number(sign) };
  const preview = Number.isFinite(sum) && sum > 0 ? effect(draft, members) : null;

  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!Number.isFinite(sum) || sum <= 0) return toast('Вкажіть суму більшу за нуль', { type: 'err' });
    if (type === 'transfer' && member === to) return toast('Віддати й отримати мають різні люди', { type: 'err' });
    if (type === 'adjust' && !note.trim()) return toast('Напишіть причину коригування', { type: 'err' });
    setBusy(true);
    try {
      await api('/api/fund', {
        method: 'POST', label: 'операція каси',
        body: { action: type, amount, date, member, to, sign: Number(sign), note },
      });
      toast('Записано');
      setAmount(''); setNote('');
      onDone();
    } catch (ex) { saveFailed(toast, ex); } finally { setBusy(false); }
  };

  return (
    <form className="fund-card" onSubmit={send}>
      <h2 className="fund-h2">Операція з грошима</h2>
      <label className="fund-f">Що сталося
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {CASH_KINDS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </label>

      {type !== 'adjust' && (
        <div className="fund-two">
          <label className="fund-f">
            {type === 'transfer' ? 'Хто віддав' : type === 'reimburse' ? 'Кому видали' : 'Хто вніс'}
            <select value={member} onChange={(e) => setMember(e.target.value)}>
              {ms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          {type === 'transfer' && (
            <label className="fund-f">Кому
              <select value={to} onChange={(e) => setTo(e.target.value)}>
                {ms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      {type === 'adjust' && (
        <label className="fund-f">Напрямок
          <select value={sign} onChange={(e) => setSign(e.target.value)}>
            <option value="1">У касі виявилось більше</option>
            <option value="-1">У касі виявилось менше</option>
          </select>
        </label>
      )}

      <div className="fund-two">
        <label className="fund-f">Сума, грн
          <input className="fund-amount" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
        </label>
        <label className="fund-f">Дата
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <label className="fund-f">{type === 'adjust' ? 'Причина (обовʼязково)' : 'Коментар'}
        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={type === 'adjust' ? 'Перерахунок 27.10' : 'Наприклад: картка'} />
      </label>

      {preview && (
        <div className="fund-prev">
          {Object.entries(preview.bal).map(([id, v]) => (
            <div className="fund-row" key={id}>
              <span>{members.find((m) => m.id === id)?.name}</span>
              <b className="fund-v">{signed(now.bal[id] || 0)} → {signed((now.bal[id] || 0) + v)}</b>
            </div>
          ))}
          <div className="fund-row">
            <span>Каса</span>
            <b className="fund-v">
              {preview.cash ? `${money(now.cash)} → ${money(now.cash + preview.cash)}` : 'не міняється'}
            </b>
          </div>
        </div>
      )}

      <button className="btn" disabled={busy}>{busy ? 'Записуємо…' : 'Записати'}</button>
    </form>
  );
}

/* ---------- Журнал ---------- */

function Journal({ ops, members, nameOf, canEdit, onDone, toast }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(null);
  const [reason, setReason] = useState('');

  const list = [...ops]
    .filter((o) => all || o.status !== 'cancelled')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const cancel = async (op) => {
    if (!reason.trim()) return toast('Напишіть причину скасування', { type: 'err' });
    try {
      await api('/api/fund', { method: 'POST', label: 'скасування', body: { action: 'cancel', row: op.row, reason } });
      toast('Скасовано');
      setOpen(null); setReason('');
      onDone();
    } catch (e) { saveFailed(toast, e); }
  };

  return (
    <div className="fund-card">
      <div className="fund-cash">
        <h2 className="fund-h2">Журнал</h2>
        <button className="chip" onClick={() => setAll(!all)}>
          {all ? 'Лише чинні' : 'Разом зі скасованими'}
        </button>
      </div>

      {!list.length && <div className="empty">Операцій ще немає.</div>}

      {list.map((op) => {
        const e = effect(op, members);
        return (
          <div className={'fund-op' + (op.status === 'cancelled' ? ' is-off' : '')} key={op.id || op.row}>
            <div className="fund-row">
              <span className="fund-who">
                {opTitle(op, nameOf)}
                <i>{dmy(op.date)}{op.author && ` · ${op.author}`}</i>
              </span>
              <b className="fund-v">{money(op.amount)}</b>
            </div>
            {op.type === 'expense' && !!e.parts.length && (
              <div className="fund-small">
                {categoryOf(op.category).name} ·{' '}
                {op.payer === 'cash' ? 'з каси фонду' : `платив ${nameOf(op.payer)}`} ·{' '}
                {op.mode === 'manual' ? 'вручну' : 'за правилами'}
                <br />
                Частки: {e.parts.map((id) => `${nameOf(id)} ${money(e.shares[id])}`).join(', ')}
              </div>
            )}
            {!!e.cash && <div className="fund-small">Каса: {signed(e.cash)}</div>}
            {op.note && <div className="fund-small">{op.note}</div>}
            {op.status === 'cancelled' && (
              <div className="fund-small is-off-t">Скасовано: {op.cancelReason}</div>
            )}
            {canEdit && op.status !== 'cancelled' && (
              open === op.row ? (
                <div className="fund-cancel">
                  <input value={reason} onChange={(ev) => setReason(ev.target.value)}
                    placeholder="Чому скасовуємо" />
                  <button className="act-btn act-del" onClick={() => cancel(op)}>Підтвердити</button>
                  <button className="act-btn" onClick={() => { setOpen(null); setReason(''); }}>Ні</button>
                </div>
              ) : (
                <button className="act-btn act-del" onClick={() => setOpen(op.row)}>Скасувати</button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Учасники ---------- */

/** Правка складу: вихід із групи, повернення, відпустки */
function MemberEdit({ m, onDone, toast }) {
  const [date, setDate] = useState(todayIso());
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const open = openPeriod(m);

  const save = async (next, ok) => {
    if (next.error) return toast(next.error, { type: 'err' });
    if (busy) return;
    setBusy(true);
    try {
      await api('/api/fund', {
        method: 'POST', label: 'зміна учасника',
        body: { action: 'member', id: m.id, periods: next.periods || m.periods, vacations: next.vacations || m.vacations || [] },
      });
      toast(ok);
      onDone();
    } catch (e) { saveFailed(toast, e); } finally { setBusy(false); }
  };

  return (
    <details className="fund-exp">
      <summary>Склад і відпустки</summary>
      <div className="fund-edit">
        <div className="fund-small">
          {open ? 'Зараз у групі.' : 'Зараз поза групою — витрати на нього не діляться, баланс лишається.'}
        </div>
        <div className="fund-edit-row">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {open
            ? <button type="button" className="act-btn" disabled={busy} onClick={() => save(leaveGroup(m, date), 'Записано: вийшов з групи')}>Вийшов з цієї дати</button>
            : <button type="button" className="act-btn" disabled={busy} onClick={() => save(rejoinGroup(m, date), 'Записано: повернувся')}>Повернувся з цієї дати</button>}
        </div>

        <div className="fund-small">Відпустки (обидві дати включно):</div>
        {(m.vacations || []).map((v) => (
          <div className="fund-edit-row" key={v.start}>
            <span>{dmy(v.start)} — {dmy(v.end)}</span>
            <button type="button" className="act-btn act-del" disabled={busy}
              onClick={() => save({ vacations: m.vacations.filter((x) => x !== v) }, 'Відпустку прибрано')}>Прибрати</button>
          </div>
        ))}
        <div className="fund-edit-row">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Початок" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Кінець" />
          <button type="button" className="act-btn" disabled={busy}
            onClick={() => save(addVacation(m, from, to), 'Відпустку додано')}>Додати</button>
        </div>
      </div>
    </details>
  );
}

function People({ members, state, ops, canEdit, onDone, toast }) {
  return (
    <>
      {byOrder(members).map((m) => {
        let run = m.opening || 0;
        const lines = [{ date: '', what: 'Початковий баланс', v: null, run }];
        for (const op of livedOps(ops)) {
          const v = effect(op, members).bal[m.id];
          if (!v) continue;
          run += v;
          lines.push({ date: op.date, what: opTitle(op, (id) => members.find((x) => x.id === id)?.name || '—'), v, run });
        }
        const b = state.bal[m.id] || 0;
        return (
          <div className="fund-card" key={m.id}>
            <div className="fund-cash">
              <span className="fund-who">{m.name}<i>{balanceWord(b)}</i></span>
              <b className={'fund-big ' + (b < 0 ? 'is-neg' : b > 0 ? 'is-pos' : '')}>{signed(b)}</b>
            </div>
            <details className="fund-exp">
              <summary>Як вийшов баланс</summary>
              <div className="fund-rows">
                {lines.map((l, i) => (
                  <div className="fund-row" key={i}>
                    <span className="fund-who">{l.what}<i>{dmy(l.date)}</i></span>
                    <b className="fund-v">{l.v === null ? '' : signed(l.v)} <i>{signed(l.run)}</i></b>
                  </div>
                ))}
              </div>
            </details>
            {!!(m.vacations || []).length && (
              <div className="fund-small">
                Відпустки: {m.vacations.map((v) => `${dmy(v.start)} — ${dmy(v.end)}`).join('; ')}
              </div>
            )}
            {openPeriod(m) ? null : <div className="fund-small">Поза групою з {dmy(m.periods[m.periods.length - 1]?.end)}</div>}
            {canEdit && <MemberEdit m={m} onDone={onDone} toast={toast} />}
          </div>
        );
      })}
    </>
  );
}
