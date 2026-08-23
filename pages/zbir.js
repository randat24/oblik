import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { partsOf, parsePart, splitParts, joinParts } from '../lib/delivery';

/**
 * Пункт збору.
 *
 * Окремий вхід для того, хто складає посилки й віддає їх на відправку. У
 * нього рівно дві дії, і сторінка зроблена так, щоб їх не треба було
 * шукати: зібрав коробку — записав; віддав водієві — відмітив, кому.
 *
 * Ані майна, ані складу, ані решти доставок тут немає навмисно. Людина з
 * коробкою в руках не має пробиратися крізь розділи, які до неї не
 * стосуються, а посилання, що ходить по руках, не має відкривати більше,
 * ніж потрібно для роботи.
 */

const KEY = 'oblik_pack_key';
const WHO = 'oblik_pack_who';

const load = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватне вікно */ } };

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!res.ok) {
    const err = new Error(data.error || `Помилка ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const kgOf = (n) => Math.round(n * 10) / 10;

export default function Zbir() {
  const router = useRouter();
  const [key, setKey] = useState(null);      // null — ще не прочитали
  const [me, setMe] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState(false);
  const [hand, setHand] = useState(null);

  // Ключ приходить у посиланні один раз, далі живе в цьому браузері:
  // просити людину щоразу відкривати довгий рядок — це просити її його
  // десь зберегти, а зберігає вона зазвичай у чаті.
  useEffect(() => {
    if (!router.isReady) return;
    const fromUrl = String(router.query.k || '');
    if (fromUrl) {
      save(KEY, fromUrl);
      // прибираємо ключ з адресного рядка: далі він живе в цьому браузері,
      // і сторінкою можна ділитись скріншотом, не роздаючи доступ
      router.replace('/zbir', undefined, { shallow: true });
    }
    setKey(fromUrl || load(KEY));
    setMe(load(WHO));
  }, [router.isReady, router.query.k]);   // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async (k = key) => {
    if (!k) return;
    setBusy(true);
    try {
      setData(await api('/api/pack?token=' + encodeURIComponent(k)));
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [key]);

  useEffect(() => { if (key) reload(key); }, [key, reload]);

  const send = async (body) => {
    setBusy(true);
    try {
      setData(await api('/api/pack', { method: 'POST', body: { ...body, token: key, me } }));
      return true;
    } catch (e) {
      alert(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (key === null) return null;

  if (!key) {
    return (
      <Shell>
        <div className="z-gate">
          <h1>Пункт збору</h1>
          <p>Відкрийте сторінку за посиланням із ключем — його дає черговий.</p>
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="z-gate">
          <h1>Пункт збору</h1>
          <p>{error.status === 401 ? 'Ключ не підходить. Попросіть у чергового свіже посилання.'
            : error.status === 404 ? 'Пункт збору вимкнено.'
            : error.message}</p>
          <button className="z-btn" onClick={() => reload()}>Спробувати ще</button>
        </div>
      </Shell>
    );
  }

  if (!me) {
    return (
      <Shell>
        <WhoAsk onSet={(v) => { save(WHO, v); setMe(v); }} />
      </Shell>
    );
  }

  if (!data) return <Shell><div className="z-gate"><p>Завантаження…</p></div></Shell>;

  const waiting = data.list.filter((d) => d.stage === 'packed');
  const gone = data.list.filter((d) => d.stage === 'handed');
  const waitKg = waiting.reduce((a, d) => a + (d.parts?.kg || d.weight || 0), 0);

  return (
    <Shell busy={busy}>
      <header className="z-head">
        <div>
          <div className="z-title">Пункт збору</div>
          <button className="z-who" onClick={() => { save(WHO, ''); setMe(''); }}>
            {me} <i>змінити</i>
          </button>
        </div>
        <button className="z-btn z-btn-main" onClick={() => setAdd(true)}>+ Нова посилка</button>
      </header>

      <div className="z-sum">
        <span>Чекає відправки <b>{waiting.length}</b></span>
        {waitKg > 0 && <span className="z-sum-kg">{kgOf(waitKg)} кг</span>}
      </div>

      {waiting.length === 0 ? (
        <div className="z-empty">Нічого не чекає. Зберіть посилку — вона зʼявиться тут.</div>
      ) : (
        <div className="z-list">
          {waiting.map((d) => (
            <PackCard key={d.row} d={d} onHand={() => setHand(d)} />
          ))}
        </div>
      )}

      {gone.length > 0 && (
        <>
          <div className="z-sec">Передано за останні дві доби</div>
          <div className="z-list">
            {gone.map((d) => (
              <div className="z-card is-gone" key={d.row}>
                <div className="z-card-top">
                  {d.to && <span className="z-to">{d.to}</span>}
                  <span className="z-name">{d.what}</span>
                </div>
                <div className="z-meta">
                  Передали {d.driver} · {(d.handed || '').split(' ')[0]}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {add && (
        <AddForm
          tos={data.tos}
          onCancel={() => setAdd(false)}
          onSave={async (body) => { if (await send({ ...body, action: 'add' })) setAdd(false); }}
        />
      )}

      {hand && (
        <HandForm
          d={hand}
          drivers={data.drivers}
          onCancel={() => setHand(null)}
          onSave={async (driver) => {
            if (await send({ action: 'handed', row: hand.row, driver })) setHand(null);
          }}
        />
      )}
    </Shell>
  );
}

function Shell({ children, busy }) {
  return (
    <>
      <Head><title>Пункт збору</title></Head>
      <div className={'z-wrap' + (busy ? ' is-busy' : '')}>{children}</div>
    </>
  );
}

/** Позивний питаємо один раз: без нього в таблиці нема кого спитати */
function WhoAsk({ onSet }) {
  const [v, setV] = useState('');
  return (
    <div className="z-gate">
      <h1>Хто ви?</h1>
      <p>Позивний піде в графу «Хто здав». Запитаємо один раз.</p>
      <input className="z-inp" value={v} autoFocus
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) onSet(v.trim()); }}
        placeholder="ваш позивний" />
      <button className="z-btn z-btn-main" disabled={!v.trim()} onClick={() => onSet(v.trim())}>
        Далі
      </button>
    </div>
  );
}

function PackCard({ d, onHand }) {
  const kg = d.parts?.kg || d.weight;
  const hot = d.parts?.names.filter((x) => x.hot) || [];
  return (
    <div className="z-card">
      <div className="z-card-top">
        {d.to && <span className="z-to">{d.to}</span>}
        {hot.length > 0 && <span className="z-hot">1 черга · {hot.length}</span>}
        <span className="z-name">{d.what}</span>
      </div>
      <div className="z-meta">
        {kg ? `${kgOf(kg)} кг` : 'вага не вказана'}
        {d.parts ? ` · ${d.parts.total} місць` : ''}
        {d.giver ? ` · зібрав ${d.giver}` : ''}
      </div>
      {d.parts && (
        <div className="z-bags">
          {d.parts.names.map((x, i) => (
            <span className={'z-bag' + (x.hot ? ' hot' : '')} key={i}>
              {x.name}{x.kg !== null ? ` · ${x.kg}` : ''}
            </span>
          ))}
        </div>
      )}
      {d.note && <div className="z-note">{d.note}</div>}
      <button className="z-btn z-btn-main z-wide" onClick={onHand}>Передати на відправку</button>
    </div>
  );
}

function AddForm({ tos, onCancel, onSave }) {
  const [f, setF] = useState({ to: '', what: '', weight: '', note: '' });
  const [parts, setParts] = useState('');
  const [hot, setHot] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const partList = parts.split(/[\n;]/).map((x) => x.trim()).filter(Boolean);
  const weighed = partList.map(parsePart);
  const partsKg = weighed.some((x) => x.kg !== null)
    ? kgOf(weighed.reduce((a, x) => a + (x.kg || 0), 0))
    : null;
  const hotNums = partList.map((l, i) => (hot.has(l) ? i + 1 : 0)).filter(Boolean);

  const toggle = (label) => setHot((s) => {
    const n = new Set(s);
    if (n.has(label)) n.delete(label); else n.add(label);
    return n;
  });

  return (
    <Sheet title="Нова посилка" onCancel={onCancel} busy={busy} error={err}
      saveLabel="Зібрано"
      onSave={async () => {
        if (!f.what.trim()) return setErr('Вкажіть назву');
        setBusy(true); setErr('');
        try {
          await onSave({
            ...f,
            what: f.what.trim(),
            weight: partsKg !== null ? partsKg : f.weight,
            parts: joinParts(partList),
            partsHot: hotNums.join('; '),
          });
        } catch (e) { setErr(e.message); }
        finally { setBusy(false); }
      }}
    >
      <label className="z-lab">Кому призначена</label>
      <input className="z-inp" list="zTo" value={f.to} onChange={(e) => up('to', e.target.value)}
        placeholder="позивний або підрозділ" />
      <datalist id="zTo">{(tos || []).map((v) => <option key={v} value={v} />)}</datalist>

      <label className="z-lab">Назва</label>
      <input className="z-inp" value={f.what} onChange={(e) => up('what', e.target.value)}
        placeholder="Вода, Їжа, Акумулятори…" />

      <label className="z-lab">
        Мішки — кожен з нового рядка
        {partList.length > 0 && <span className="z-cnt">{partList.length}</span>}
      </label>
      <textarea className="z-inp z-area" rows={4} value={parts}
        onChange={(e) => setParts(e.target.value)}
        placeholder={'Мішок 1 = 20\nМішок 2 = 20\nВода 7,7 л = 7.7'} />
      <div className="z-tip">
        Після «=» можна вписати вагу — тоді вага посилки складеться сама.
      </div>

      {partList.length > 0 && (
        <>
          <label className="z-lab">
            В першу чергу
            {hotNums.length > 0 && <span className="z-cnt">{hotNums.length} з {partList.length}</span>}
          </label>
          <div className="z-chips">
            {partList.map((label, i) => (
              <button key={label + i} type="button"
                className={'z-chip' + (hot.has(label) ? ' on' : '')}
                onClick={() => toggle(label)}>
                {parsePart(label).name}
              </button>
            ))}
          </div>
          <div className="z-tip">Ті, що мають полетіти найближчим бортом.</div>
        </>
      )}

      <label className="z-lab">
        Вага, кг
        {partsKg !== null && <span className="z-cnt">з мішків: {partsKg}</span>}
      </label>
      <input className="z-inp" type="number" min="0" step="0.1" inputMode="decimal"
        value={partsKg !== null ? partsKg : f.weight}
        disabled={partsKg !== null}
        onChange={(e) => up('weight', e.target.value)} placeholder="—" />

      <label className="z-lab">Примітка</label>
      <input className="z-inp" value={f.note} onChange={(e) => up('note', e.target.value)}
        placeholder="крихке, тримати сухим…" />
    </Sheet>
  );
}

function HandForm({ d, drivers, onCancel, onSave }) {
  const [driver, setDriver] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <Sheet title="Кому передали" onCancel={onCancel} busy={busy} error={err}
      saveLabel="Передав"
      onSave={async () => {
        if (!driver.trim()) return setErr('Вкажіть, кому передали');
        setBusy(true); setErr('');
        try { await onSave(driver.trim()); }
        catch (e) { setErr(e.message); }
        finally { setBusy(false); }
      }}
    >
      <div className="z-card-top" style={{ marginBottom: 12 }}>
        {d.to && <span className="z-to">{d.to}</span>}
        <span className="z-name">{d.what}</span>
      </div>
      <div className="z-chips">
        {(drivers || []).map((v) => (
          <button key={v} type="button"
            className={'z-chip' + (driver === v ? ' on' : '')}
            onClick={() => setDriver(v)}>{v}</button>
        ))}
      </div>
      <input className="z-inp" value={driver} onChange={(e) => setDriver(e.target.value)}
        placeholder="або впишіть свого" style={{ marginTop: 10 }} />
      <div className="z-tip">
        Дата й час проставляться самі. Далі посилку веде черговий.
      </div>
    </Sheet>
  );
}

/** Вікно знизу: на телефоні до нижнього краю дотягнутись легше, ніж до центру */
function Sheet({ title, children, onCancel, onSave, saveLabel = 'Зберегти', busy, error }) {
  return (
    <div className="z-back" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="z-sheet">
        <div className="z-sheet-h">{title}</div>
        <div className="z-sheet-b">{children}</div>
        {error && <div className="z-err">{error}</div>}
        <div className="z-sheet-f">
          <button className="z-btn" onClick={onCancel} disabled={busy}>Скасувати</button>
          <button className="z-btn z-btn-main" onClick={onSave} disabled={busy}>
            {busy ? 'Зберігаю…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
