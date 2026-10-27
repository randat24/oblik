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
  byOrder, statusOn, opTitle, balanceWord, livedOps, invariantOk,
} from '../lib/fund';

const TABS = [
  ['sum', 'Зведення'],
  ['add', 'Витрата'],
  ['cash', 'Каса'],
  ['log', 'Журнал'],
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

        {tab === 'sum' && !!members.length && <Summary state={state} members={members} config={config} />}
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
        {tab === 'people' && <People members={members} state={state} ops={ops} />}
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

function Summary({ state, members, config }) {
  const ms = byOrder(members);
  const owe = ms.filter((m) => state.bal[m.id] < 0);
  const cred = ms.filter((m) => state.bal[m.id] > 0);
  const even = ms.filter((m) => !state.bal[m.id]);
  const base = config.openingDiff || 0;

  return (
    <>
      <div className="fund-card">
        <div className="fund-cash">
          <span className="fund-k">Готівка в касі</span>
          <b className="fund-big">{money(state.cash)} грн</b>
        </div>
        <div className="fund-note">
          Каса мінус сума балансів: <b>{signed(state.diff)}</b> грн.{' '}
          {state.adjusted
            ? <>З них початкове розходження {money(base)} і коригування {signed(state.adjusted)}.</>
            : <>Це початкове розходження {money(base)} грн — воно ні на кого не розподілене.</>}
        </div>
      </div>

      <div className="fund-card">
        <h2 className="fund-h2">Баланси</h2>
        <div className="fund-rows">
          {ms.map((m) => {
            const b = state.bal[m.id] || 0;
            const st = statusOn(m, todayIso());
            return (
              <div className="fund-row" key={m.id}>
                <span className="fund-who">
                  {m.name}
                  <i>{balanceWord(b)}{st !== 'in' && (st === 'vac' ? ' · у відпустці' : ' · не в групі')}</i>
                </span>
                <b className={'fund-v ' + (b < 0 ? 'is-neg' : b > 0 ? 'is-pos' : '')}>{signed(b)}</b>
              </div>
            );
          })}
        </div>
      </div>

      {(owe.length > 0 || cred.length > 0) && (
        <div className="fund-card">
          <h2 className="fund-h2">Коротко</h2>
          {owe.length > 0 && (
            <p className="fund-p">
              <b>Винні фондові:</b> {owe.map((m) => `${m.name} ${money(-state.bal[m.id])}`).join(', ')}
            </p>
          )}
          {cred.length > 0 && (
            <p className="fund-p">
              <b>Фонд винен:</b> {cred.map((m) => `${m.name} ${money(state.bal[m.id])}`).join(', ')}
            </p>
          )}
          {even.length > 0 && <p className="fund-p"><b>У розрахунку:</b> {even.map((m) => m.name).join(', ')}</p>}
        </div>
      )}
    </>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/* ---------- Витрата ---------- */

function ExpenseForm({ members, ops, config, onDone, toast }) {
  const ms = byOrder(members);
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('var');
  const [date, setDate] = useState(todayIso());
  const [payer, setPayer] = useState(ms[0]?.id || '');
  const [manual, setManual] = useState(false);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);

  const auto = useMemo(() => eligible(members, category, date), [members, category, date]);
  const parts = manual ? picked : auto;
  useEffect(() => { if (!manual) setPicked(auto); }, [manual, auto]);

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
          <button type="button" className={'chip' + (!manual ? ' on' : '')} onClick={() => setManual(false)}>За правилами</button>
          <button type="button" className={'chip' + (manual ? ' on' : '')} onClick={() => setManual(true)}>Обрати вручну</button>
        </div>
        <div className="fund-parts">
          {ms.map((m) => {
            const on = parts.includes(m.id);
            const st = statusOn(m, date);
            return (
              <label key={m.id} className={'chip' + (on ? ' on' : '')}>
                <input type="checkbox" checked={on} disabled={!manual}
                  onChange={() => setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))} />
                {m.name}{st !== 'in' && <i> · {st === 'vac' ? 'відпустка' : 'не в групі'}</i>}
              </label>
            );
          })}
        </div>
        <span className="fund-hint">
          {manual
            ? 'Відмічені ділять витрату порівну. Цей список не міняється при перерахунках.'
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

function People({ members, state, ops }) {
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
          </div>
        );
      })}
    </>
  );
}
