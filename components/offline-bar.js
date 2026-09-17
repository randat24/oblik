/**
 * Смуга офлайну.
 *
 * Стояла всередині головної сторінки й тому була лише там. А «Особисте»
 * — той самий застосунок і той самий телефон: зв’язку немає однаково в
 * обох, і мовчати про це в одному з них немає жодної причини.
 *
 * Про вдалу синхронізацію компонент не кричить сам, а каже тому, хто
 * його поставив: на головній це спливне повідомлення, в «Особистому» —
 * свій рядок унизу. Інакше сюди довелося б тягнути чужу систему
 * сповіщень, а з нею й пів застосунку.
 */
import { useState, useEffect, useRef } from 'react';

import {
  startOffline, flushQueue, onOfflineChange, getState, takeDropped, getQueue,
} from '../lib/offline';

/*
 * Чому черга стоїть — словами й з дією, а не кодом помилки. Найчастіше це
 * завершена сесія: вікно входу живе чотири години, а записи в черзі
 * лежать скільки завгодно, тож до ранку вони застають двері зачиненими.
 */
const STOP_TEXT = {
  auth: 'Сесія завершилась — увійдіть ще раз, і записи підуть самі',
  network: 'Сервер не відповів — спробуємо ще раз за хвилину',
  offline: 'Немає звʼязку — надішлемо, щойно зʼявиться',
};

/** Назва дії людською мовою — щоб було видно, що саме чекає */
const WHAT = {
  day: 'День', food: 'Їжа', delFood: 'Видалення їжі', body: 'Заміри тіла',
  goals: 'Цілі', med: 'Ліки', takeMed: 'Прийом ліків', restockMed: 'Поповнення ліків',
  delMed: 'Видалення ліків', product: 'Продукт', dish: 'Страва', delDish: 'Видалення страви',
  copyDay: 'Копіювання дня', practice: 'Практика',
};

function nameOf(e) {
  if (e.label) return e.label;
  const action = e.body?.action;
  if (action && WHAT[action]) return WHAT[action];
  const route = String(e.url || '').split('?')[0].replace('/api/', '');
  return `${e.method} ${route}${action ? ` · ${action}` : ''}`;
}

function whenOf(t) {
  if (!t) return '';
  try {
    return new Date(t).toLocaleString('uk-UA', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function OfflineBar({ onSynced }) {
  const [st, setSt] = useState({ online: true, pending: 0, syncing: false, stopped: null });
  const [bad, setBad] = useState([]);
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    setSt(getState());
    const off = onOfflineChange((s) => {
      setSt(s);
      setQueue(getQueue());
      const d = takeDropped();
      if (d.length) setBad((p) => [...p, ...d]);
    });
    const stop = startOffline();
    return () => { off(); stop(); };
  }, []);

  // коли черга спорожніла після синхронізації — сказати про це вголос
  const wasPending = useRef(0);
  useEffect(() => {
    if (wasPending.current > 0 && st.pending === 0 && st.online) {
      onSynced?.(wasPending.current);
      setOpen(false);
    }
    wasPending.current = st.pending;
  }, [st.pending, st.online]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (st.online && !st.pending && !bad.length) return null;

  const stopText = st.online && !st.syncing && st.pending > 0 ? STOP_TEXT[st.stopped] : null;
  const list = open ? (queue.length ? queue : getQueue()) : [];

  return (
    <div className={'offline-bar' + (st.online ? ' is-sync' : '')}>
      <div className="offline-row">
        <span className="offline-dot" />
        <span className="offline-text">
          {!st.online && 'Немає звʼязку — працюємо офлайн'}
          {st.online && st.syncing && 'Надсилаємо відкладені записи…'}
          {st.online && !st.syncing && st.pending > 0 && (stopText || 'Є відкладені записи')}
          {st.online && !st.pending && bad.length > 0 && 'Частину записів сервер не прийняв'}
        </span>
        {/*
          Лічильник тепер кнопка: доти побачити, що саме лежить у черзі,
          не можна було ніяк — лише кількість. Вісім записів без жодної
          назви однаково страшні й тоді, коли це вісім відміток води.
        */}
        {st.pending > 0 && (
          <button
            className="offline-count"
            onClick={() => { setQueue(getQueue()); setOpen((v) => !v); }}
            title={open ? 'Сховати' : 'Показати, що чекає'}
          >
            {st.pending}
          </button>
        )}
        {st.online && st.pending > 0 && !st.syncing && (
          <button className="offline-act" onClick={() => flushQueue()}>Надіслати</button>
        )}
        {bad.length > 0 && (
          <button className="offline-act" onClick={() => {
            alert(bad.map((b) => `${nameOf(b)}\n${b.error}`).join('\n\n'));
            setBad([]);
          }}>
            Показати {bad.length}
          </button>
        )}
      </div>

      {open && (
        <ul className="offline-list">
          {list.map((e) => (
            <li key={e.id}>
              <span className="offline-what">{nameOf(e)}</span>
              <span className="offline-when">{whenOf(e.at)}</span>
            </li>
          ))}
          {list.length === 0 && <li className="offline-when">Черга порожня</li>}
        </ul>
      )}
    </div>
  );
}
