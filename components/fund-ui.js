/**
 * Кирпичики інтерфейсу фонду: іконки, аватар, нижня навігація й шторка.
 *
 * Фонд відкривають з телефону й однією рукою, тому головне тут унизу: нижня
 * панель із кнопкою «＋», а нова операція — шторка, яка виїжджає знизу, а не
 * окремі вкладки з довгими формами.
 */
import { useEffect } from 'react';

const svg = (children, size = 22) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IcoHome = ({ size }) => svg(<><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /></>, size);
export const IcoLog = ({ size }) => svg(<><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>, size);
export const IcoChart = ({ size }) => svg(<><path d="M5 20V10M12 20V4M19 20v-7" /></>, size);
export const IcoPeople = ({ size }) => svg(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.4 2.7-5.5 6-5.5s6 2.1 6 5.5" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.6c2.6 0 4.5 1.6 4.5 4.4" /></>, size);
export const IcoPlus = ({ size }) => svg(<path d="M12 5v14M5 12h14" />, size);
export const IcoCart = ({ size }) => svg(<><path d="M3 4h2.5l2 11h10l2-8H7" /><circle cx="9.5" cy="19" r="1.3" /><circle cx="16.5" cy="19" r="1.3" /></>, size);
export const IcoIn = ({ size }) => svg(<><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>, size);
export const IcoOut = ({ size }) => svg(<><path d="M12 16V5M7 10l5-5 5 5" /><path d="M5 20h14" /></>, size);
export const IcoSwap = ({ size }) => svg(<><path d="M5 8h13l-3-3M19 16H6l3 3" /></>, size);
export const IcoSafe = ({ size }) => svg(<><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M12 9v1M12 14v1" /></>, size);
export const IcoTune = ({ size }) => svg(<><path d="M5 8h14M5 16h14" /><circle cx="9" cy="8" r="2" /><circle cx="15" cy="16" r="2" /></>, size);
export const IcoBack = ({ size }) => svg(<path d="M14 6l-6 6 6 6" />, size);
export const IcoClose = ({ size }) => svg(<path d="M6 6l12 12M18 6 6 18" />, size);

/** Відтінки аватарів: той самий порядок, що й у зведенні, щоб людина мала один колір скрізь */
export const HUES = [152, 28, 262, 205, 340, 48];
export const hueOf = (m, i = 0) => HUES[(m && m.order ? m.order - 1 : i) % HUES.length];

export function Avatar({ m, i = 0, size = 36 }) {
  return (
    <span className="fund-ava" style={{ '--h': hueOf(m, i), width: size, height: size, fontSize: size * 0.42 }}>
      {(m?.name || '?').slice(0, 1)}
    </span>
  );
}

/**
 * Нижня панель. Посередині велика кнопка «＋» — найчастіша дія фонду.
 * Гостю кнопки немає: він лише дивиться.
 */
export function BottomNav({ tab, onTab, canEdit, onAdd }) {
  const item = (k, label, Icon) => (
    <button key={k} type="button" className={'fund-nav-i' + (tab === k ? ' on' : '')} onClick={() => onTab(k)}>
      <Icon size={22} /><span>{label}</span>
    </button>
  );
  return (
    <nav className="fund-nav" aria-label="Розділи фонду">
      <div className="fund-nav-in">
        {item('sum', 'Зведення', IcoHome)}
        {item('log', 'Журнал', IcoLog)}
        {canEdit && (
          <button type="button" className="fund-nav-add" onClick={onAdd} aria-label="Нова операція">
            <IcoPlus size={26} />
          </button>
        )}
        {item('rep', 'Звіти', IcoChart)}
        {item('people', 'Люди', IcoPeople)}
      </div>
    </nav>
  );
}

/** Шторка знизу: на телефоні на всю ширину, на широкому екрані — по центру */
export function Sheet({ title, onBack, onClose, children }) {
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fund-sheet-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fund-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="fund-sheet-h">
          {onBack
            ? <button type="button" className="fund-icon-btn" onClick={onBack} aria-label="Назад"><IcoBack size={20} /></button>
            : <span className="fund-icon-btn is-ghost" />}
          <h2>{title}</h2>
          <button type="button" className="fund-icon-btn" onClick={onClose} aria-label="Закрити"><IcoClose size={20} /></button>
        </div>
        <div className="fund-sheet-b">{children}</div>
      </div>
    </div>
  );
}

/** Вибір типу операції: великі плитки з поясненням, а не випадний список */
export const OP_KINDS = [
  { k: 'expense', title: 'Витрата', hint: 'Щось купили — розділити між людьми', Icon: IcoCart, tone: 'neg' },
  { k: 'deposit', title: 'Внесок у касу', hint: 'Хтось поклав гроші в касу', Icon: IcoIn, tone: 'pos' },
  { k: 'reimburse', title: 'Видача з каси', hint: 'З каси віддали гроші людині', Icon: IcoOut, tone: 'warn' },
  { k: 'transfer', title: 'Переказ', hint: 'Одна людина віддала іншій', Icon: IcoSwap, tone: 'info' },
  { k: 'setcash', title: 'Каса за фактом', hint: 'Вказати, скільки в касі зараз', Icon: IcoSafe, tone: 'neutral' },
  { k: 'adjust', title: 'Коригування', hint: 'Підправити касу з поясненням', Icon: IcoTune, tone: 'neutral' },
];

export function KindPicker({ onPick }) {
  return (
    <div className="fund-kinds">
      {OP_KINDS.map(({ k, title, hint, Icon, tone }) => (
        <button key={k} type="button" className={'fund-kind t-' + tone} onClick={() => onPick(k)}>
          <span className="fund-kind-i"><Icon size={24} /></span>
          <b>{title}</b>
          <span>{hint}</span>
        </button>
      ))}
    </div>
  );
}
