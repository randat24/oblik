/**
 * Поле дати зі своїм календарем.
 *
 * Системний `<input type="date">` відкриває вікно, яке малює система:
 * воно не слухається теми, показує місяці мовою телефону й виглядає чужим.
 * Тут календар українською, з тижнем від понеділка й кольорами застосунку.
 *
 * Значення — рядок «РРРР-ММ-ДД», як у таблиці. Правила календаря (сітка
 * місяця, переходи, «сьогодні» за Києвом) лежать у `lib/calendar.js` і
 * покриті тестами; тут лише зовнішній вигляд і клавіатура.
 */
import { useEffect, useRef, useState } from 'react';
import {
  MONTH_NAMES, WEEKDAY_NAMES, parseIso, showDate, shiftMonth, monthGrid, kyivToday, toIso,
} from '../lib/calendar';

const Arrow = ({ dir }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir < 0 ? 'M14 6l-6 6 6 6' : 'M10 6l6 6-6 6'} />
  </svg>
);

const CalIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" />
  </svg>
);

/** Зсув дати на кількість днів: для стрілок клавіатури */
const addDays = (iso, n) => {
  const p = parseIso(iso);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return toIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};

export function DatePicker({
  value, onChange, label = 'Дата', placeholder = 'Оберіть дату', min, max,
}) {
  const today = kyivToday();
  const [open, setOpen] = useState(false);
  const start = parseIso(value) || parseIso(today);
  const [view, setView] = useState({ y: start.y, m: start.m });
  const [focus, setFocus] = useState(value || today);
  const box = useRef(null);
  const field = useRef(null);
  // зсув вікна, щоб воно не виходило за край екрана, навіть якщо поле стоїть біля правого краю
  const [dx, setDx] = useState(0);

  const close = (back = true) => { setOpen(false); if (back) field.current?.focus(); };

  const toggle = () => {
    if (open) return close(false);
    const p = parseIso(value) || parseIso(today);
    setView({ y: p.y, m: p.m });
    setFocus(parseIso(value) ? value : today);
    const r = field.current.getBoundingClientRect();
    const w = Math.min(304, window.innerWidth - 16);
    setDx(Math.min(Math.max(r.left, 8), window.innerWidth - w - 8) - r.left);
    setOpen(true);
  };

  // клік повз календар закриває його; Esc теж
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('touchstart', down);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('touchstart', down); };
  }, [open]);

  // фокус стоїть на вибраному дні: так по календарю ходять стрілками
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector(`[data-iso="${focus}"]`)?.focus({ preventScroll: true });
  }, [open, focus, view]);

  // вікно відкривається під полем, а поле може бути внизу: підсуваємо його в межі екрана
  useEffect(() => {
    if (open) box.current?.querySelector('.dp-panel')?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  const allowed = (iso) => (!min || iso >= min) && (!max || iso <= max);

  const pick = (iso) => {
    if (!allowed(iso)) return;
    onChange(iso);
    close();
  };

  const move = (iso) => {
    const p = parseIso(iso);
    setFocus(iso);
    if (p.y !== view.y || p.m !== view.m) setView({ y: p.y, m: p.m });
  };

  const key = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) { e.preventDefault(); move(addDays(focus, step)); return; }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const p = parseIso(focus);
      const n = shiftMonth({ y: p.y, m: p.m }, e.key === 'PageUp' ? -1 : 1);
      const last = new Date(Date.UTC(n.y, n.m, 0)).getUTCDate();
      move(toIso(n.y, n.m, Math.min(p.d, last)));
      return;
    }
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  };

  const weeks = monthGrid(view.y, view.m, today);

  return (
    <div className="dp" ref={box}>
      <button type="button" ref={field} className={'dp-field' + (value ? '' : ' is-empty')} onClick={toggle}
        aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${showDate(value) || 'не вибрано'}`}>
        <span>{showDate(value) || placeholder}</span>
        <CalIcon />
      </button>

      {open && (
        <div className="dp-panel" style={{ left: dx }} role="dialog" aria-label={label} onKeyDown={key}>
          <div className="dp-head">
            <button type="button" className="dp-nav" aria-label="Попередній місяць"
              onClick={() => setView((v) => shiftMonth(v, -1))}><Arrow dir={-1} /></button>
            <b>{MONTH_NAMES[view.m - 1]} {view.y}</b>
            <button type="button" className="dp-nav" aria-label="Наступний місяць"
              onClick={() => setView((v) => shiftMonth(v, 1))}><Arrow dir={1} /></button>
          </div>
          <div className="dp-week" aria-hidden="true">
            {WEEKDAY_NAMES.map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="dp-grid" role="grid">
            {weeks.flat().map((c) => (
              <button type="button" key={c.iso} data-iso={c.iso} role="gridcell"
                tabIndex={c.iso === focus ? 0 : -1}
                disabled={!allowed(c.iso)}
                aria-selected={c.iso === value}
                aria-current={c.today ? 'date' : undefined}
                className={'dp-day' + (c.out ? ' is-out' : '') + (c.today ? ' is-today' : '') + (c.iso === value ? ' is-sel' : '')}
                onClick={() => pick(c.iso)}>
                {c.day}
              </button>
            ))}
          </div>
          <div className="dp-foot">
            <button type="button" className="dp-link" onClick={() => pick(today)}>Сьогодні</button>
            <button type="button" className="dp-link is-muted" onClick={() => close()}>Закрити</button>
          </div>
        </div>
      )}
    </div>
  );
}
