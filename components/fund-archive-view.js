/**
 * Архів фонду: стара таблиця «каса ВУ», яку вели до 15.10.2026.
 *
 * Лише перегляд і звірка, баланси від архіву не рахуються: актуальний стан
 * тримається на знімку на 15.10. Архів показує, звідки взялись ці числа,
 * і доводить, що вони сходяться, — рядок за рядком до копійки.
 */

import { useState, useEffect, useMemo } from 'react';
import { api } from './base';
import { money, signed } from '../lib/fund';
import { OLD_PEOPLE, reconcile, toAppBalance } from '../lib/fund-archive';

const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
const monthName = (ym) => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
const dmy = (d) => (d ? d.split('-').reverse().join('.') : '');
const nameOf = (id) => OLD_PEOPLE.find((p) => p.id === id)?.name || id;

/** Що відбулось у рядку — одним реченням */
function titleOf(r) {
  if (r.kind === 'transfer') return `Переказ: ${nameOf(r.from)} → ${nameOf(r.to)}`;
  if (r.kind === 'expense') return r.desc || 'Витрата';
  return r.desc || 'Кілька операцій в одному рядку';
}

/** Другий рядок: платник і частка або те, що лишилось із рядка */
function detailOf(r) {
  if (r.kind === 'expense') {
    const n = r.parts.length;
    return `платив ${nameOf(r.payer)} · на ${n} осіб по ${money(r.share)}`;
  }
  if (r.kind === 'transfer') return '';
  return '';
}

export function FundArchive({ members, config }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [ym, setYm] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    api('/api/fund?archive=1')
      .then((d) => setData(d.archive))
      .catch((e) => setErr(e.message || 'Не вдалося завантажити архів'));
  }, []);

  const months = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rows.map((r) => r.date.slice(0, 7)))].reverse();
  }, [data]);
  useEffect(() => { if (months.length && !ym) setYm(months[0]); }, [months, ym]);

  const rec = useMemo(() => (data ? reconcile(data.rows, data.typed) : []), [data]);

  if (err) return <div className="fund-card"><div className="empty">{err}</div></div>;
  if (!data) return <div className="fund-card"><div className="loading">Завантаження…</div></div>;

  // у застосунку стартові баланси стоять у знаках застосунку, у таблиці — у старих
  const inApp = (id) => (id === 'alex'
    ? Math.round(config.openingCash || 0)
    : (members.find((m) => m.id === id)?.opening ?? null));
  const rowsOk = rec.every((r) => r.diff === 0);
  const appOk = rec.every((r) => {
    const a = inApp(r.id);
    return a === null || a === toAppBalance(r.id, r.typed);
  });

  const needle = q.trim().toLowerCase();
  const list = data.rows.filter((r) => (needle
    ? [r.desc, r.note, ...Object.keys(r.by).map(nameOf)].join(' ').toLowerCase().includes(needle)
    : r.date.slice(0, 7) === ym));

  return (
    <>
      <div className="fund-card">
        <h2 className="fund-h2">Архів: таблиця «{data.source}»</h2>
        <p className="fund-hint">
          Так вели облік до 15.10.2026: {data.rows.length} рядків, з {dmy(data.rows[0].date)} по {dmy(data.until)}.
          Баланси в застосунку від цього архіву не рахуються, вони стартують зі знімка на 15.10.
        </p>
        <div className="fund-rows">
          <div className="fund-row">
            <span className="fund-who">Рядки сходяться з підсумками таблиці</span>
            <b className={'fund-v ' + (rowsOk ? 'is-pos' : 'is-neg')}>{rowsOk ? 'так, до копійки' : 'ні'}</b>
          </div>
          <div className="fund-row">
            <span className="fund-who">Підсумки збігаються зі стартом у застосунку</span>
            <b className={'fund-v ' + (appOk ? 'is-pos' : 'is-neg')}>{appOk ? 'так' : 'ні'}</b>
          </div>
        </div>
      </div>

      <div className="fund-card">
        <h2 className="fund-h2">Звірка по людях</h2>
        <div className="fund-rows">
          {rec.map((r) => {
            const a = inApp(r.id);
            const app = r.id === 'alex' ? r.typed : toAppBalance(r.id, r.typed);
            return (
              <div className="fund-row" key={r.id}>
                <span className="fund-who">
                  {r.name}{r.id === 'alex' ? ' (каса)' : ''}
                  <i>сума рядків {money(r.id === 'alex' ? r.sum : toAppBalance(r.id, r.sum))} · в застосунку {a === null ? '—' : money(a)}</i>
                </span>
                <b className={'fund-v ' + (r.diff === 0 && (a === null || a === app) ? 'is-pos' : 'is-neg')}>
                  {r.diff === 0 && (a === null || a === app) ? '✓' : signed(r.diff)}
                </b>
              </div>
            );
          })}
        </div>
        <span className="fund-hint">
          Знаки застосунку: плюс — фонд винен людині, мінус — вона винна фондові.
          «Алекс» — власник каси, його число в таблиці дорівнює готівці.
        </span>
      </div>

      <div className="fund-card">
        <h2 className="fund-h2">Записи</h2>
        <input className="fund-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Пошук: опис, імʼя" aria-label="Пошук по архіву" />
        {!needle && (
          <select className="fund-search" value={ym} onChange={(e) => setYm(e.target.value)} aria-label="Місяць">
            {months.map((m) => (
              <option key={m} value={m}>
                {monthName(m)} · {data.rows.filter((r) => r.date.startsWith(m)).length} рядків
              </option>
            ))}
          </select>
        )}
        {!list.length && <div className="empty">Нічого не знайдено.</div>}
        <div className="fund-rows">
          {[...list].reverse().map((r) => (
            <div className="fund-row fund-arch-row" key={r.n}>
              <span className="fund-who">
                {titleOf(r)}
                <i>
                  {r.approx ? '≈ ' : ''}{dmy(r.date)} · рядок {r.n}
                  {detailOf(r) ? ` · ${detailOf(r)}` : ''}
                </i>
                <i className="fund-arch-d">
                  {Object.entries(r.by)
                    .map(([id, v]) => `${nameOf(id)} ${signed(id === 'alex' ? v : toAppBalance(id, v))}`)
                    .join(' · ')}
                </i>
              </span>
              {r.kind === 'expense' && <b className="fund-v">{money(r.total)}</b>}
              {r.kind === 'transfer' && <b className="fund-v">{money(r.amount)}</b>}
            </div>
          ))}
        </div>
        {needle && <span className="fund-hint">Показано всі збіги за весь час.</span>}
        {!needle && <span className="fund-hint">≈ означає, що в рядку своєї дати немає, і взято останню відому.</span>}
      </div>
    </>
  );
}
