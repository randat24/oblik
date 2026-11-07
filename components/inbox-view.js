/**
 * Вхідні: повідомлення, які люди переслали з Signal швидкою командою.
 *
 * Екран нічого не вирішує за людину: показує текст, а після того як його
 * внесли куди треба, його позначають опрацьованим. Правила — у `lib/inbox.js`.
 */
import { useState, useEffect, useCallback } from 'react';
import { api, useToast, saveFailed } from './base';
import { isDone } from '../lib/inbox';

export function InboxView({ setState }) {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setState('завантаження…');
    try {
      const d = await api('/api/inbox');
      setItems(d.items);
      setState('синхронізовано');
    } catch (e) {
      setState('помилка: ' + e.message);
    }
  }, [setState]);

  useEffect(() => { load(); }, [load]);

  const done = async (id) => {
    if (busy) return;
    setBusy(id);
    setState('збереження…');
    try {
      await api('/api/inbox', { method: 'POST', body: { action: 'done', id }, label: 'вхідне опрацьовано' });
      await load();
    } catch (e) {
      setState('помилка: ' + e.message);
      saveFailed(toast, e);
    } finally {
      setBusy('');
    }
  };

  if (!items) return <div className="loading">Завантаження…</div>;

  const fresh = items.filter((m) => !isDone(m));
  const old = items.filter(isDone);
  const list = showDone ? old : fresh;

  return (
    <>
      <h2 className="zv-h1">Вхідні з Signal</h2>
      <div className="chips">
        <button type="button" className={'chip' + (showDone ? '' : ' on')} aria-pressed={!showDone}
          onClick={() => setShowDone(false)}>Нові · {fresh.length}</button>
        <button type="button" className={'chip' + (showDone ? ' on' : '')} aria-pressed={showDone}
          onClick={() => setShowDone(true)}>Опрацьовані · {old.length}</button>
      </div>

      {list.length === 0 && (
        <div className="empty">
          {showDone ? 'Опрацьованих повідомлень ще немає.' : 'Нових повідомлень немає.'}
        </div>
      )}

      <ul className="zv-moves">
        {list.map((m) => (
          <li className="zv-move" key={m.id}>
            <div className="zv-move-top">
              {m.from && <span className="zv-kind">{m.from}</span>}
              <span className="spacer" />
              <span className="muted">{m.date} {m.time}</span>
            </div>
            <div style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{m.text}</div>
            {isDone(m) ? (
              <div className="muted zv-move-more">Опрацьовано {m.doneAt}{m.doneBy ? ` · ${m.doneBy}` : ''}</div>
            ) : (
              <div style={{ marginTop: 8 }}>
                <button type="button" className="act-btn" disabled={!!busy} onClick={() => done(m.id)}>Опрацьовано</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
