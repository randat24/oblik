/**
 * Повтори між листами: екран, де їх не лише видно, а й розв'язують.
 *
 * Одна й та сама річ у двох листах — це розбіжність обліку, а не описка в
 * клітинці, тому тут нічого не робиться само. Кожна група показує всі
 * входження з усіма заповненими колонками, щоб порівняти їх поруч, і
 * дає три рішення: відкрити рядок, видалити зайве або визнати, що це
 * різні речі (тоді група більше не з'являється).
 *
 * Видалення йде через ту саму дію, що й на сторінці листа, тож його видно
 * в журналі змін і можна скасувати кнопкою «Повернути».
 */
import { useState, useEffect, useCallback } from 'react';
import { api, useToast } from './base';

export function DupesView({ setState, onOpen }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const toast = useToast();

  const load = useCallback(async () => {
    setState('завантаження…');
    try {
      setData(await api('/api/dupes'));
      setState('синхронізовано');
    } catch (e) {
      setState('помилка: ' + e.message);
    }
  }, [setState]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="loading">Завантаження…</div>;

  const dismiss = async (g) => {
    setBusy(g.key);
    try {
      await api('/api/dupes', { method: 'POST', body: { action: 'dismiss', sn: g.sn } });
      toast(`${g.sn}: це різні речі`, {
        action: {
          label: 'Скасувати',
          run: async () => {
            await api('/api/dupes', { method: 'POST', body: { action: 'restore', sn: g.sn } });
            load();
          },
        },
      });
      load();
    } catch (e) { toast(e.message || 'Не вдалося зберегти', { type: 'err' }); } finally { setBusy(''); }
  };

  const remove = async (g, p) => {
    if (!confirm(`Видалити рядок ${p.row} з листа «${p.sheet}»?\n\n${p.name || g.sn}`)) return;
    setBusy(`${g.key}#${p.sheet}#${p.row}`);
    try {
      const d = await api('/api/item', { method: 'DELETE', body: { sheet: p.sheet, row: p.row } });
      toast(`Видалено: ${p.sheet}, рядок ${p.row}`, {
        type: 'warn',
        action: {
          label: 'Повернути',
          run: async () => {
            await api('/api/item', {
              method: 'POST',
              body: { sheet: p.sheet, action: 'restore', row: p.row, values: d.deleted },
            });
            toast('Запис повернено');
            load();
          },
        },
      });
      // номери рядків після видалення зсунулись, тож список читаємо заново
      load();
    } catch (e) { toast(e.message || 'Не вдалося видалити', { type: 'err' }); } finally { setBusy(''); }
  };

  return (
    <>
      <div className="toolbar">
        <h2 className="dup-title">Повтори між листами</h2>
        <div className="spacer" />
        <button className="btn" onClick={load}>Оновити</button>
      </div>

      <p className="dup-lead">
        Однаковий серійник у різних листах — одна річ у двох обліках. Порівняйте
        рядки й залиште потрібний. Якщо це справді різні речі, натисніть «Це різні речі».
        {data.dismissed > 0 && ` Уже розглянуто: ${data.dismissed}.`}
      </p>

      {!data.groups.length ? (
        <div className="empty">Повторів між листами немає. Кожен серійник стоїть в одному листі.</div>
      ) : (
        data.groups.map((g) => (
          <section className="dup-group" key={g.key}>
            <header className="dup-head">
              <b className="dup-sn">{g.sn}</b>
              <span className="dup-meta">{g.places.length} рядки в листах: {g.sheets.join(', ')}</span>
              <button className="act-btn" disabled={busy === g.key} onClick={() => dismiss(g)}>Це різні речі</button>
            </header>
            <div className="dup-places">
              {g.places.map((p) => (
                <article className="dup-place" key={`${p.sheet}#${p.row}`}>
                  <div className="dup-top">
                    <span className="badge">{p.sheet}</span>
                    <span className="dup-row">рядок {p.row}</span>
                  </div>
                  <b className="dup-name">{p.name || '—'}</b>
                  <dl className="dup-fields">
                    {p.fields.map((f) => (
                      <div key={f.h}><dt>{f.h}</dt><dd>{f.v}</dd></div>
                    ))}
                  </dl>
                  <div className="dup-act">
                    <button className="act-btn" onClick={() => onOpen({ kind: 'items', name: p.sheet })}>Відкрити лист</button>
                    <button className="act-btn act-del" disabled={busy.startsWith(g.key)} onClick={() => remove(g, p)}>
                      Видалити цей рядок
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
