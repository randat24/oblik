/**
 * Статистика витрат фонду: на що й скільки йшло, книга разом з архівом.
 *
 * Лише перегляд. Правила підрахунку — у `lib/fund-stats.js`; архів береться
 * тим самим запитом, що й вкладка «Архів», у сторінку він не вшитий.
 */

import { useState, useEffect, useMemo } from 'react';
import { api, plural } from './base';
import { money, CATEGORIES } from '../lib/fund';
import { OLD_PEOPLE } from '../lib/fund-archive';
import { spendingOf, spendStats, NONE } from '../lib/fund-stats';

const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
const monthName = (ym) => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
const CAT_NAMES = { ...Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name])), [NONE]: 'Без категорії' };
/* «0%» у когось, хто таки платив, читається як «не платив» */
const pct = (part, whole) => {
  const p = whole ? (part / whole) * 100 : 0;
  return p > 0 && p < 1 ? '<1' : String(Math.round(p));
};

/** Рядок із підписом, сумою й смужкою частки від найбільшого */
function ShareRow({ name, note, sum, max, muted }) {
  return (
    <div className="fund-row fund-stat-row">
      <span className="fund-who">{name}{note && <i>{note}</i>}</span>
      <b className="fund-v">{money(sum)}</b>
      <span className={'fund-stat-bar' + (muted ? ' is-muted' : '')} aria-hidden="true">
        <i style={{ width: `${max ? Math.max(2, (sum / max) * 100) : 0}%` }} />
      </span>
    </div>
  );
}

export function FundStats({ members, ops, config, nameOf }) {
  const [arch, setArch] = useState(null);
  const [err, setErr] = useState('');
  const [range, setRange] = useState('');

  useEffect(() => {
    api('/api/fund?archive=1')
      .then((d) => setArch(d.archive.rows))
      .catch((e) => setErr(e.message || 'Не вдалося завантажити архів'));
  }, []);

  const items = useMemo(
    () => (arch ? spendingOf(members, ops, arch, config.owner || 'alex') : []),
    [members, ops, arch, config.owner],
  );
  const s = useMemo(() => spendStats(items, arch || [], range), [items, arch, range]);

  if (err) return <div className="fund-card"><div className="empty">{err}</div></div>;
  if (!arch) return <div className="fund-card"><div className="loading">Завантаження…</div></div>;

  const year = range.slice(0, 4);
  const peak = Math.max(1, ...s.months.map((m) => m.sum));
  const cats = [...CATEGORIES.map((c) => c.id), NONE].filter((id) => s.cats[id].count);
  const catMax = Math.max(0, ...cats.map((id) => s.cats[id].sum));
  const payMax = s.payers[0]?.sum || 0;
  const who = (id) => {
    const n = nameOf(id);
    return n !== '—' ? n : OLD_PEOPLE.find((p) => p.id === id)?.name || id;
  };
  const label = range.length === 7 ? monthName(range) : range ? `${range} рік` : 'увесь час';

  return (
    <>
      <div className="fund-seg fund-stat-years" role="group" aria-label="Період">
        <button type="button" className={'chip' + (!range ? ' on' : '')} aria-pressed={!range}
          onClick={() => setRange('')}>Увесь час</button>
        {s.years.map((y) => (
          <button key={y} type="button" className={'chip' + (year === y ? ' on' : '')} aria-pressed={year === y}
            onClick={() => setRange(y)}>{y}</button>
        ))}
      </div>

      <div className="fund-card">
        <span className="fund-k">Витрачено · {label}</span>
        <b className="fund-big">{money(s.total)}<small> грн</small></b>
        <span className="fund-hint">
          {s.count} {plural(s.count, ['витрата', 'витрати', 'витрат'])}{range.length === 7 ? '' : ` · у середньому ${money(s.perMonth)} грн на місяць`}
        </span>
      </div>

      <div className="fund-card">
        <h2 className="fund-h2">По місяцях</h2>
        <div className="fund-stat-chart" role="group" aria-label="Витрати по місяцях">
          {s.months.map((m) => {
            const on = range === m.ym;
            return (
              <button key={m.ym} type="button"
                className={'fund-stat-col' + (on ? ' is-on' : '') + (range.length === 7 && !on ? ' is-dim' : '')}
                aria-pressed={on} aria-label={`${monthName(m.ym)}: ${money(m.sum)} грн`}
                title={`${monthName(m.ym)} — ${money(m.sum)} грн`}
                onClick={() => setRange(on ? m.ym.slice(0, 4) : m.ym)}>
                <i style={{ height: `${m.sum ? Math.max(2, (m.sum / peak) * 100) : 0}%` }} />
              </button>
            );
          })}
        </div>
        <div className="fund-stat-axis" aria-hidden="true">
          <span>{s.months[0] && monthName(s.months[0].ym)}</span>
          <span>{s.months.length > 1 && monthName(s.months[s.months.length - 1].ym)}</span>
        </div>
        <span className="fund-hint">
          {range.length === 7
            ? `Вибрано ${monthName(range)}: ${money(s.total)} грн. Натисніть ще раз, щоб повернути рік.`
            : `Найбільше — ${money(peak)} грн за місяць. Натисніть на стовпчик, щоб побачити місяць.`}
        </span>
        <details className="fund-stat-table">
          <summary>Усі місяці списком</summary>
          <div className="fund-rows">
            {[...s.months].reverse().map((m) => (
              <div className="fund-row" key={m.ym}>
                <span className="fund-who">{monthName(m.ym)}</span>
                <b className="fund-v">{money(m.sum)}</b>
              </div>
            ))}
          </div>
        </details>
      </div>

      <div className="fund-card">
        <h2 className="fund-h2">На що</h2>
        {!cats.length && <div className="empty">За цей час витрат немає.</div>}
        <div className="fund-rows">
          {cats.map((id) => (
            <ShareRow key={id} name={CAT_NAMES[id]} sum={s.cats[id].sum} max={catMax} muted={id === NONE}
              note={`${pct(s.cats[id].sum, s.total)}% · ${s.cats[id].count} шт.`} />
          ))}
        </div>
        {!!s.cats[NONE].count && (
          <span className="fund-hint">
            «Без категорії» — рядки старої таблиці без підпису або з підписом, з якого не зрозуміло, що купили.
            Архів розкладено за словами в підписі («магаз», «соляра», «свет»), тож поділ приблизний.
          </span>
        )}
        {!!s.mixed && (
          <span className="fund-hint">
            Ще {s.mixed} рядків архіву поєднують витрату з переказом, і суму витрати з них не виділити — вони сюди не входять.
          </span>
        )}
      </div>

      <div className="fund-card">
        <h2 className="fund-h2">Хто платив</h2>
        <div className="fund-rows">
          {s.payers.map((p) => (
            <ShareRow key={p.id} name={who(p.id)} sum={p.sum} max={payMax}
              note={`${pct(p.sum, s.total)}%`} />
          ))}
        </div>
      </div>
    </>
  );
}
