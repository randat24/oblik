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
  startOffline, flushQueue, onOfflineChange, getState, takeDropped,
} from '../lib/offline';

export function OfflineBar({ onSynced }) {
  const [st, setSt] = useState({ online: true, pending: 0, syncing: false });
  const [bad, setBad] = useState([]);

  useEffect(() => {
    setSt(getState());
    const off = onOfflineChange((s) => {
      setSt(s);
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
    }
    wasPending.current = st.pending;
  }, [st.pending, st.online]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (st.online && !st.pending && !bad.length) return null;

  return (
    <div className={'offline-bar' + (st.online ? ' is-sync' : '')}>
      <span className="offline-dot" />
      <span className="offline-text">
        {!st.online && 'Немає звʼязку — працюємо офлайн'}
        {st.online && st.syncing && 'Надсилаємо відкладені записи…'}
        {st.online && !st.syncing && st.pending > 0 && 'Є відкладені записи'}
        {st.online && !st.pending && bad.length > 0 && 'Частину записів сервер не прийняв'}
      </span>
      {st.pending > 0 && <span className="offline-count">{st.pending}</span>}
      {st.online && st.pending > 0 && !st.syncing && (
        <button className="offline-act" onClick={() => flushQueue()}>Надіслати</button>
      )}
      {bad.length > 0 && (
        <button className="offline-act" onClick={() => {
          alert(bad.map((b) => `${b.method} ${b.url}\n${b.error}`).join('\n\n'));
          setBad([]);
        }}>
          Показати {bad.length}
        </button>
      )}
    </div>
  );
}
