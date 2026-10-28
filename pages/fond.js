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
  openPeriod, leaveGroup, rejoinGroup, addVacation, newExpenseParts, cashAdjustment,
  ownerRecalcPlan, monthBounds, daysOf,
} from '../lib/fund';
import { monthsOf, monthReport, memberStatement } from '../lib/fund-report';
import { DatePicker } from '../components/date-picker';
import { BottomNav, Sheet, KindPicker, OP_KINDS, Avatar, hueOf, IcoTune } from '../components/fund-ui';

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
  // шторка «Нова операція»: null — закрита, 'pick' — вибір типу, інакше — форма цього типу
  const [sheet, setSheet] = useState(null);
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
            <span className="fund-legend">
              <i className="is-neg">− винен фонду</i><i className="is-pos">+ фонд винен йому</i>
            </span>
          </div>
          {!canEdit && <span className="fund-ro">тільки перегляд</span>}
        </header>

        <main className="fund-main">
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
          {tab === 'log' && (
            <Journal ops={ops} members={members} nameOf={nameOf} canEdit={canEdit}
              onDone={load} toast={toast} />
          )}
          {tab === 'rep' && !!members.length && <Reports members={members} ops={ops} config={config} nameOf={nameOf} />}
          {tab === 'people' && <People members={members} state={state} ops={ops} config={config} canEdit={canEdit} onDone={load} toast={toast} />}
        </main>
      </div>

      <BottomNav tab={tab} onTab={setTab} canEdit={canEdit && !!members.length} onAdd={() => setSheet('pick')} />

      {sheet && canEdit && (
        <Sheet
          title={sheet === 'pick' ? 'Нова операція' : OP_KINDS.find((x) => x.k === sheet)?.title}
          onBack={sheet === 'pick' ? null : () => setSheet('pick')}
          onClose={() => setSheet(null)}
        >
          {sheet === 'pick' && <KindPicker onPick={setSheet} />}
          {sheet === 'expense' && (
            <ExpenseForm members={members} ops={ops} config={config} toast={toast}
              onDone={() => { load(); setSheet(null); }} />
          )}
          {sheet !== 'pick' && sheet !== 'expense' && (
            <CashForm type={sheet} members={members} ops={ops} config={config} toast={toast}
              onDone={() => { load(); setSheet(null); }} />
          )}
        </Sheet>
      )}
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
/* ---------- Зведення ---------- */

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
  // власник каси бере участь у витратах, але в списках боргів його немає
  const ms = byOrder(members).filter((m) => m.id !== config.owner);
  const today = todayIso();
  const text = shortReport(state, members, config.owner);
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

/* ---------- Кирпичики форм ---------- */

const shiftDay = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Велика сума зверху: це перше й найважливіше поле будь-якої операції */
function AmountField({ value, onChange, label = 'Сума', autoFocus = true }) {
  return (
    <label className="fund-amt">
      <span>{label}</span>
      <div>
        <input inputMode="decimal" value={value} autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)} placeholder="0" aria-label={label} />
        <i>грн</i>
      </div>
    </label>
  );
}

/** Дата: швидкі «Сьогодні» і «Вчора», інша — звичайним полем */
function DateField({ value, onChange }) {
  const today = todayIso();
  const yday = shiftDay(today, -1);
  return (
    <div className="fund-f">
      <span>Коли</span>
      <div className="fund-picks">
        <button type="button" className={'fund-pchip' + (value === today ? ' on' : '')} onClick={() => onChange(today)}>Сьогодні</button>
        <button type="button" className={'fund-pchip' + (value === yday ? ' on' : '')} onClick={() => onChange(yday)}>Вчора</button>
        <DatePicker value={value} onChange={onChange} label="Дата" />
      </div>
    </div>
  );
}

/** Вибір однієї людини (платник, отримувач): аватар + імʼя, а не випадний список */
function PersonPick({ members, value, onChange, cash = false, label }) {
  return (
    <div className="fund-f">
      <span>{label}</span>
      <div className="fund-picks">
        {byOrder(members).map((m, i) => (
          <button type="button" key={m.id} className={'fund-pchip' + (value === m.id ? ' on' : '')} onClick={() => onChange(m.id)}>
            <Avatar m={m} i={i} size={24} />{m.name}
          </button>
        ))}
        {cash && (
          <button type="button" className={'fund-pchip' + (value === 'cash' ? ' on' : '')} onClick={() => onChange('cash')}>
            Каса
          </button>
        )}
      </div>
    </div>
  );
}

/** Нижня смужка форми: завжди під рукою, із підсумком у самій кнопці */
function SubmitBar({ busy, children }) {
  return (
    <div className="fund-submit">
      <button className="btn" disabled={busy}>{busy ? 'Записуємо…' : children}</button>
    </div>
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
  // кого не рахуємо — спільне налаштування з вкладки «Учасники»; тут лише разові зміни
  const excluded = useMemo(() => config.excluded || [], [config.excluded]);
  const [flips, setFlips] = useState([]);
  const auto = useMemo(() => eligible(members, category, date), [members, category, date]);
  const parts = useMemo(
    () => newExpenseParts(members, category, date, excluded, flips),
    [members, category, date, excluded, flips],
  );
  // по днях: обираємо людей і для кожної — її дні; дні, яких не змінювали, — увесь місяць дати витрати
  const [byDays, setByDays] = useState(false);
  const [days, setDays] = useState({});
  const month = useMemo(() => monthBounds(date), [date]);
  const rangeOf = (id) => days[id] || month;
  const pool = useMemo(
    () => byOrder(members).map((m) => m.id).filter((id) => excluded.includes(id) === flips.includes(id)),
    [members, excluded, flips],
  );
  const use = byDays ? pool : parts;
  const manual = byDays || parts.length !== auto.length || parts.some((id) => !auto.includes(id));
  const toggle = (id) => setFlips((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const setDay = (id, key, value) => setDays((d) => ({ ...d, [id]: { ...rangeOf(id), [key]: value } }));
  // дні кожної вибраної людини; період витрати — від найранішого дня до найпізнішого
  const ranges = byDays ? Object.fromEntries(use.map((id) => [id, rangeOf(id)])) : {};
  const rangeList = Object.values(ranges);
  const daysOk = !byDays || (rangeList.length > 0
    && rangeList.every((r) => daysOf(r.from, r.to).length > 0));
  const periodFrom = rangeList.map((r) => r.from).sort()[0];
  const periodTo = rangeList.map((r) => r.to).sort().slice(-1)[0];

  const sum = kop(amount);
  const draft = {
    type: 'expense', amount: sum, date, category, payer,
    mode: manual ? 'manual' : 'auto', participants: use,
    ...(byDays && daysOk ? { periodFrom, periodTo, ranges } : {}),
  };
  const preview = Number.isFinite(sum) && sum > 0 && use.length && daysOk
    ? effect(draft, members) : null;

  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!Number.isFinite(sum) || sum <= 0) return toast('Вкажіть суму більшу за нуль', { type: 'err' });
    if (!use.length) return toast('Відмітьте хоча б одного учасника', { type: 'err' });
    if (!daysOk) return toast('Вкажіть дні кожної людини: «з» не пізніше за «по»', { type: 'err' });
    setBusy(true);
    try {
      await api('/api/fund', {
        method: 'POST', label: 'витрата фонду',
        body: {
          action: 'expense', amount, desc, category, date, payer,
          mode: manual ? 'manual' : 'auto', participants: use,
          ...(byDays ? { periodFrom, periodTo, ranges } : {}),
        },
      });
      toast(`Записано: ${money(sum)} грн`);
      setAmount(''); setDesc(''); setFlips([]); setDays({});
      onDone();
    } catch (ex) { saveFailed(toast, ex); } finally { setBusy(false); }
  };

  return (
    <form className="fund-form" onSubmit={send}>
      <AmountField value={amount} onChange={setAmount} />

      <label className="fund-f">Що купили
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Наприклад: продукти" />
      </label>

      <div className="fund-f">
        <span>Категорія</span>
        <div className="fund-picks">
          {CATEGORIES.map((c) => (
            <button type="button" key={c.id} className={'fund-pchip' + (category === c.id ? ' on' : '')}
              onClick={() => setCategory(c.id)} title={c.name}>{c.short}</button>
          ))}
        </div>
        <span className="fund-hint">{categoryOf(category).hint}</span>
      </div>

      <DateField value={date} onChange={setDate} />
      <PersonPick members={members} value={payer} onChange={setPayer} cash label="Хто платив" />

      <div className="fund-f">
        <span>На кого ділимо</span>
        <label className="fund-switch">
          <input type="checkbox" checked={byDays} onChange={(e) => { setByDays(e.target.checked); setDays({}); }} />
          <i aria-hidden="true" />
          <span><b>По днях</b> — оренда, комуналка: кожен платить за свої дні</span>
        </label>

        {byDays ? (
          <div className="fund-days">
            {ms.map((m, i) => {
              const on = use.includes(m.id);
              const r = rangeOf(m.id);
              return (
                <div className="fund-day-row" key={m.id}>
                  <button type="button" className={'fund-pchip' + (on ? ' on' : '')} onClick={() => toggle(m.id)}>
                    <Avatar m={m} i={i} size={24} />{m.name}
                  </button>
                  {on && (
                    <>
                      <DatePicker value={r.from} label={`${m.name}: з`} onChange={(v) => setDay(m.id, 'from', v)} />
                      <DatePicker value={r.to} label={`${m.name}: по`} onChange={(v) => setDay(m.id, 'to', v)} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="fund-picks">
            {ms.map((m, i) => {
              const on = use.includes(m.id);
              const st = statusOn(m, date);
              return (
                <button type="button" key={m.id} className={'fund-pchip' + (on ? ' on' : '')} onClick={() => toggle(m.id)}>
                  <Avatar m={m} i={i} size={24} />{m.name}
                  {st !== 'in' && <i>{st === 'vac' ? 'відпустка' : 'поза групою'}</i>}
                  {st === 'in' && excluded.includes(m.id) && <i>не рахуємо</i>}
                </button>
              );
            })}
            {flips.length > 0 && (
              <button type="button" className="fund-pchip is-clear" onClick={() => setFlips([])}>Скинути</button>
            )}
          </div>
        )}
        <span className="fund-hint">
          {byDays
            ? 'Кожна доба ділиться порівну між тими, чиї дні її охоплюють. Кому дні не змінювали, рахується весь місяць дати витрати.'
            : excluded.length > 0
              ? 'Хто в «Не рахуємо» — знятий за замовчуванням (Люди → Склад). Відмітка тут діє лише на цю витрату.'
              : 'Відмічені ділять витрату порівну.'}
        </span>
      </div>

      {preview && (
        <div className="fund-prev">
          <span className="fund-k">Хто скільки</span>
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

      <SubmitBar busy={busy}>Записати{Number.isFinite(sum) && sum > 0 ? ` ${money(sum)} грн` : ''}</SubmitBar>
    </form>
  );
}

/* ---------- Каса ---------- */

function CashForm({ type, members, ops, config, onDone, toast }) {
  const ms = byOrder(members);
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
  const isSet = type === 'setcash';
  const fix = isSet && Number.isFinite(sum) ? cashAdjustment(now.cash, sum) : null;
  const preview = !isSet && Number.isFinite(sum) && sum > 0 ? effect(draft, members) : null;

  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (isSet) {
      if (!Number.isFinite(sum) || sum < 0) return toast('Вкажіть, скільки зараз у касі', { type: 'err' });
      if (!fix) return toast('У касі вже стільки, нічого міняти не треба', { type: 'err' });
      setBusy(true);
      try {
        await api('/api/fund', {
          method: 'POST', label: 'сума каси',
          body: {
            action: 'adjust', amount: money(fix.amount).replace(/\s/g, ''), date, sign: fix.sign,
            note: `Сума в касі вказана вручну: було ${money(now.cash)}, стало ${money(sum)}${note.trim() ? ` · ${note.trim()}` : ''}`,
          },
        });
        toast(`Каса тепер ${money(sum)}`);
        setAmount(''); setNote('');
        onDone();
      } catch (ex) { saveFailed(toast, ex); } finally { setBusy(false); }
      return;
    }
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

  const who = type === 'transfer' ? 'Хто віддав' : type === 'reimburse' ? 'Кому видали' : 'Хто вніс';
  return (
    <form className="fund-form" onSubmit={send}>
      <AmountField value={amount} onChange={setAmount}
        label={isSet ? 'Скільки зараз у касі' : 'Сума'} />

      {type !== 'adjust' && !isSet && (
        <PersonPick members={members} value={member} onChange={setMember} label={who} />
      )}
      {type === 'transfer' && (
        <PersonPick members={members} value={to} onChange={setTo} label="Кому" />
      )}

      {type === 'adjust' && (
        <div className="fund-f">
          <span>Що з касою</span>
          <div className="fund-picks">
            <button type="button" className={'fund-pchip' + (sign === '1' ? ' on' : '')} onClick={() => setSign('1')}>У касі більше</button>
            <button type="button" className={'fund-pchip' + (sign === '-1' ? ' on' : '')} onClick={() => setSign('-1')}>У касі менше</button>
          </div>
        </div>
      )}

      <DateField value={date} onChange={setDate} />

      {isSet && (
        <div className="fund-prev">
          <div className="fund-row">
            <span>Каса за журналом</span><b className="fund-v">{money(now.cash)}</b>
          </div>
          <div className="fund-row">
            <span>Різниця</span>
            <b className="fund-v">{fix ? signed(fix.amount * fix.sign) : 'немає'}</b>
          </div>
          <span className="fund-hint">У журнал запишеться коригування з цією різницею й причиною — баланси людей не змінюються.</span>
        </div>
      )}

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

      <SubmitBar busy={busy}>Записати{Number.isFinite(sum) && sum > 0 ? ` ${money(sum)} грн` : ''}</SubmitBar>
    </form>
  );
}

/* ---------- Журнал ---------- */

const FILTERS = [
  ['all', 'Усі'], ['exp', 'Витрати'], ['cash', 'Каса'], ['off', 'Скасовані'],
];
const WEEKDAYS = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота'];
const dayTitle = (iso) => {
  if (iso === todayIso()) return 'Сьогодні';
  const [y, mo, da] = iso.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, mo - 1, da)).getUTCDay()];
  return `${longDate(iso).replace(/ \d{4}$/, '')} · ${wd}`;
};

/** Знак суми в журналі: що операція робить з грошима каси */
const signOf = (op) => {
  if (op.type === 'deposit') return { cls: 'is-pos', pre: '+' };
  if (op.type === 'reimburse') return { cls: 'is-warn', pre: '−' };
  if (op.type === 'expense' && op.payer === 'cash') return { cls: 'is-neg', pre: '−' };
  return { cls: '', pre: '' };
};

function Journal({ ops, members, nameOf, canEdit, onDone, toast }) {
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [asking, setAsking] = useState(null);
  const [reason, setReason] = useState('');

  const pass = (o) => {
    if (filter === 'off') return o.status === 'cancelled';
    if (o.status === 'cancelled') return false;
    if (filter === 'exp') return o.type === 'expense';
    if (filter === 'cash') return o.type !== 'expense';
    return true;
  };
  const list = [...ops].filter(pass).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1
    : String(b.createdAt || '') < String(a.createdAt || '') ? -1 : 1));
  const groups = [];
  list.forEach((o) => {
    const g = groups[groups.length - 1];
    if (g && g.date === o.date) g.items.push(o); else groups.push({ date: o.date, items: [o] });
  });

  const cancel = async (op) => {
    if (!reason.trim()) return toast('Напишіть причину скасування', { type: 'err' });
    try {
      await api('/api/fund', { method: 'POST', label: 'скасування', body: { action: 'cancel', row: op.row, reason } });
      toast('Скасовано');
      setOpen(null); setAsking(null); setReason('');
      onDone();
    } catch (e) { saveFailed(toast, e); }
  };

  return (
    <>
      <div className="fund-filters">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" className={'fund-pchip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      {!list.length && <div className="empty">{filter === 'off' ? 'Скасованих операцій немає.' : 'Операцій ще немає.'}</div>}

      {groups.map((g) => (
        <section className="fund-day" key={g.date}>
          <h2 className="fund-day-h">{dayTitle(g.date)}</h2>
          <div className="fund-feed">
            {g.items.map((op) => {
              const e = effect(op, members);
              const sg = signOf(op);
              const isOpen = open === (op.id || op.row);
              return (
                <div className={'fund-jrow' + (op.status === 'cancelled' ? ' is-off' : '')} key={op.id || op.row}>
                  <button type="button" className="fund-jmain" onClick={() => setOpen(isOpen ? null : (op.id || op.row))}>
                    <span className={'fund-mark t-' + op.type}>{OP_MARK[op.type] || '·'}</span>
                    <span className="fund-who">
                      {opTitle(op, nameOf)}
                      <i>
                        {op.type === 'expense'
                          ? `${categoryOf(op.category).short} · ${op.payer === 'cash' ? 'з каси' : `платив ${nameOf(op.payer)}`}`
                          : op.author}
                      </i>
                    </span>
                    <b className={'fund-v ' + sg.cls}>{sg.pre}{money(op.amount)}</b>
                  </button>

                  {isOpen && (
                    <div className="fund-jmore">
                      {op.type === 'expense' && !!e.parts.length && (
                        <div className="fund-small">
                          Частки: {e.parts.map((id) => `${nameOf(id)} ${money(e.shares[id])}`).join(', ')}
                        </div>
                      )}
                      {op.periodFrom && (
                        <div className="fund-small">
                          По днях {dmy(op.periodFrom)}–{dmy(op.periodTo)}
                          {Object.keys(op.ranges || {}).length > 0 && ` · дні: ${Object.entries(op.ranges).map(([id, r]) => `${nameOf(id)} ${dmy(r.from)}–${dmy(r.to)}`).join(', ')}`}
                        </div>
                      )}
                      {!!e.cash && <div className="fund-small">Каса: {signed(e.cash)}</div>}
                      {op.note && <div className="fund-small">{op.note}</div>}
                      <div className="fund-small">Вніс: {op.author || '—'}{op.mode === 'manual' && op.type === 'expense' ? ' · склад вибрано вручну' : ''}</div>
                      {op.status === 'cancelled' && (
                        <div className="fund-small is-off-t">Скасовано: {op.cancelReason}</div>
                      )}
                      {canEdit && op.status !== 'cancelled' && (
                        asking === op.row ? (
                          <div className="fund-cancel">
                            <input value={reason} onChange={(ev) => setReason(ev.target.value)}
                              placeholder="Чому скасовуємо" autoFocus />
                            <button type="button" className="act-btn act-del" onClick={() => cancel(op)}>Підтвердити</button>
                            <button type="button" className="act-btn" onClick={() => { setAsking(null); setReason(''); }}>Ні</button>
                          </div>
                        ) : (
                          <button type="button" className="act-btn act-del" onClick={() => setAsking(op.row)}>Скасувати</button>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
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
          <DatePicker value={date} onChange={setDate} label="Дата" />
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
          <DatePicker value={from} onChange={setFrom} label="Початок" />
          <DatePicker value={to} onChange={setTo} label="Кінець" />
          <button type="button" className="act-btn" disabled={busy}
            onClick={() => save(addVacation(m, from, to), 'Відпустку додано')}>Додати</button>
        </div>
      </div>
    </details>
  );
}

/** Новий учасник: з якої дати він у групі, з тієї й починає платити */
function AddMemberCard({ canEdit, onDone, toast }) {
  const [name, setName] = useState('');
  const [start, setStart] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  if (!canEdit) return null;
  const add = async () => {
    if (busy) return;
    if (!name.trim()) return toast('Вкажіть імʼя', { type: 'err' });
    setBusy(true);
    try {
      await api('/api/fund', { method: 'POST', label: 'новий учасник', body: { action: 'addMember', name, start } });
      toast(`Додано: ${name.trim()}`);
      setName('');
      onDone();
    } catch (e) { saveFailed(toast, e); } finally { setBusy(false); }
  };
  return (
    <div className="fund-card">
      <h2 className="fund-h2">Додати учасника</h2>
      <span className="fund-hint">
        Платитиме лише з дати вступу, а витрати за період (оренда) ділитимуться по днях.
        Забрати людину з групи можна нижче, у її картці: «Вийшов з цієї дати».
      </span>
      <div className="fund-edit-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Імʼя" aria-label="Імʼя" />
        <DatePicker value={start} onChange={setStart} label="У групі з" />
        <button type="button" className="act-btn" disabled={busy || !name.trim()} onClick={add}>Додати</button>
      </div>
    </div>
  );
}

/** Власник каси: додається одним кліком, з перерахунком уже записаних витрат */
function OwnerCard({ members, ops, config, canEdit, onDone, toast }) {
  const [name, setName] = useState('Алекс');
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  if (config.owner) {
    const o = members.find((m) => m.id === config.owner);
    return (
      <div className="fund-card">
        <h2 className="fund-h2">Власник каси: {o?.name || config.owner}</h2>
        <span className="fund-hint">
          Бере участь у всіх витратах нарівні з іншими, але в списках боргу й плюсів не показується:
          його частку покриває каса.
        </span>
      </div>
    );
  }
  if (!canEdit) return null;
  const count = ownerRecalcPlan(ops, 'alex').length;
  // підтвердження на самій сторінці: системне вікно confirm() у вбудованих
  // браузерах мовчки блокується, і кнопка здавалась би мертвою
  const add = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const d = await api('/api/fund', { method: 'POST', label: 'власник каси', body: { action: 'owner', name } });
      toast(`Готово: перераховано витрат ${d.recalculated}`);
      setAsk(false);
      onDone();
    } catch (e) { saveFailed(toast, e); } finally { setBusy(false); }
  };
  return (
    <div className="fund-card">
      <h2 className="fund-h2">Власник каси</h2>
      <span className="fund-hint">
        Додається учасником і береться в усі витрати, але в списках боргу й плюсів його не буде.
        Наразі витрат для перерахунку: {count}.
      </span>
      <div className="fund-edit-row">
        <input value={name} onChange={(e) => { setName(e.target.value); setAsk(false); }} aria-label="Імʼя" />
        {!ask && (
          <button type="button" className="act-btn" disabled={!name.trim()} onClick={() => setAsk(true)}>
            Додати й перерахувати
          </button>
        )}
      </div>
      {ask && (
        <div className="fund-edit">
          <span className="fund-small">
            Додати «{name}» власником каси й перерахувати витрат: {count}? Старі записи буде скасовано
            з причиною, замість них зʼявляться нові вже з ним.
          </span>
          <div className="fund-edit-row">
            <button type="button" className="act-btn" disabled={busy} onClick={add}>
              {busy ? 'Перераховуємо…' : 'Так, перерахувати'}
            </button>
            <button type="button" className="act-btn" disabled={busy} onClick={() => setAsk(false)}>Ні</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Кого не рахуємо у нових витратах — одне налаштування для всіх пристроїв */
function ExcludeCard({ members, config, canEdit, onDone, toast }) {
  const [busy, setBusy] = useState(false);
  const off = config.excluded || [];
  const flip = async (id) => {
    if (!canEdit || busy) return;
    const next = off.includes(id) ? off.filter((x) => x !== id) : [...off, id];
    setBusy(true);
    try {
      await api('/api/fund', { method: 'POST', label: 'налаштування', body: { action: 'excluded', ids: next } });
      toast(next.includes(id) ? 'Тепер не рахуємо' : 'Знову рахуємо');
      onDone();
    } catch (e) { saveFailed(toast, e); } finally { setBusy(false); }
  };
  return (
    <div className="fund-card">
      <h2 className="fund-h2">Кого не рахуємо</h2>
      <div className="fund-parts">
        {byOrder(members).map((m) => (
          <button key={m.id} type="button" disabled={!canEdit || busy}
            className={'chip' + (off.includes(m.id) ? ' on' : '')} onClick={() => flip(m.id)}>
            {off.includes(m.id) ? '✕ ' : ''}{m.name}
          </button>
        ))}
      </div>
      <span className="fund-hint">
        Позначені не потрапляють у нові витрати за замовчуванням, але їхній баланс лишається.
        Старі операції не змінюються. У конкретній витраті людину можна повернути галочкою.
        {!canEdit && ' Змінювати може той, хто увійшов.'}
      </span>
    </div>
  );
}

function People({ members, state, ops, config, canEdit, onDone, toast }) {
  const [setup, setSetup] = useState(false);
  const ms = byOrder(members);
  const today = todayIso();
  return (
    <>
      <div className="fund-people">
        {ms.map((m, i) => {
          let run = m.opening || 0;
          const lines = [{ date: '', what: 'Початковий баланс', v: null, run }];
          for (const op of livedOps(ops)) {
            const v = effect(op, members).bal[m.id];
            if (!v) continue;
            run += v;
            lines.push({ date: op.date, what: opTitle(op, (id) => members.find((x) => x.id === id)?.name || '—'), v, run });
          }
          const b = state.bal[m.id] || 0;
          const st = statusOn(m, today);
          const note = m.id === config.owner ? 'власник каси'
            : st === 'out' ? `поза групою з ${dmy(m.periods[m.periods.length - 1]?.end)}`
              : st === 'vac' ? 'у відпустці'
                : (config.excluded || []).includes(m.id) ? 'не рахуємо в нових витратах' : 'у групі';
          return (
            <div className="fund-pcard" key={m.id}>
              <div className="fund-pcard-h">
                <Avatar m={m} i={i} size={44} />
                <span className="fund-who">{m.name}<i>{note}</i></span>
                <b className={'fund-big ' + (b < 0 ? 'is-neg' : b > 0 ? 'is-pos' : '')}>{signed(b)}</b>
              </div>
              <details className="fund-exp">
                <summary>Як вийшов баланс</summary>
                <div className="fund-rows">
                  {lines.map((l, k) => (
                    <div className="fund-row" key={k}>
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
              {canEdit && <MemberEdit m={m} onDone={onDone} toast={toast} />}
            </div>
          );
        })}
      </div>

      <button type="button" className={'fund-setup' + (setup ? ' on' : '')} onClick={() => setSetup(!setup)}>
        <IcoTune size={18} /> Склад і налаштування <i>{setup ? '▴' : '▾'}</i>
      </button>
      {setup && (
        <>
          <AddMemberCard canEdit={canEdit} onDone={onDone} toast={toast} />
          <OwnerCard members={members} ops={ops} config={config} canEdit={canEdit} onDone={onDone} toast={toast} />
          <ExcludeCard members={members} config={config} canEdit={canEdit} onDone={onDone} toast={toast} />
        </>
      )}
    </>
  );
}
