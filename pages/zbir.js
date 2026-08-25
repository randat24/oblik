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
const SEEN = 'oblik_pack_help';

/*
 * Хто збирав.
 *
 * Раніше сторінка питала позивний. Виявилось, що питання розуміють
 * навпаки: люди вписували туди позивний того, кому посилка, — і в картці
 * виходило «здав Білий, прийняв Білий». Позивний збирача однаково нічого
 * не вирішує (за посиланням заходить пункт збору, а не конкретна людина),
 * тож питання прибране, а в журнал іде чесна загальна назва.
 */
const WHO = 'Збирач посилок';

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
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState(null);   // посилка, яку правимо
  const [help, setHelp] = useState(false);

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
    if (!load(SEEN)) { save(SEEN, '1'); setHelp(true); }
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
      setData(await api('/api/pack', { method: 'POST', body: { ...body, token: key, me: WHO } }));
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

  if (!data) return <Shell><div className="z-gate"><p>Завантаження…</p></div></Shell>;

  const waiting = data.list.filter((d) => d.stage === 'packed');
  const gone = data.list.filter((d) => d.stage === 'handed');
  const waitKg = waiting.reduce((a, d) => a + (d.parts?.kg || d.weight || 0), 0);

  return (
    <Shell busy={busy}>
      <header className="z-head">
        <div className="z-title">Пункт збору</div>
        {/* Підказка стоїть поруч із головною кнопкою, а не ховається під
            меню: до неї повертаються не раз, і шукати її щоразу — це
            робота понад ту, заради якої сюди зайшли. */}
        <button className="z-help-b" onClick={() => setHelp(true)} title="Як заповнювати">
          Як заповнювати
        </button>
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
            <PackCard key={d.row} d={d} onEdit={() => setEdit(d)} />
          ))}
        </div>
      )}

      {gone.length > 0 && (
        <>
          <div className="z-sec">Поїхало за останні дві доби</div>
          <div className="z-list">
            {gone.map((d) => (
              <div className="z-card is-gone" key={d.row}>
                <div className="z-card-top">
                  {d.to && <span className="z-to">{d.to}</span>}
                  <span className="z-name">{d.what}</span>
                </div>
                <div className="z-meta">
                  Забрав {d.driver || 'відправник'} · {(d.handed || '').split(' ')[0]}
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

      {edit && (
        <AddForm
          tos={data.tos}
          from={edit}
          onCancel={() => setEdit(null)}
          onSave={async (body) => {
            if (await send({ ...body, action: 'edit', row: edit.row })) setEdit(null);
          }}
        />
      )}

      {help && <HelpSheet onClose={() => setHelp(false)} />}
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

/**
 * Порядок дій.
 *
 * Написано не про кнопки, а про роботу: людина приходить сюди з коробкою
 * в руках, а не з питанням «що робить ця кнопка». Кожен крок названий тим
 * словом, яке стоїть на екрані, — щоб не доводилось перекладати.
 */
const HELP = [
  {
    t: 'Зібрали коробку',
    d: 'Натисніть «+ Нова посилка». Заводьте, коли вже зважили: потім дописувати доведеться через чергового.',
    img: '02-empty',
  },
  {
    t: 'Кому і що',
    d: '«Кому призначена» — позиція, куди це поїде: Тигр, Рись, Білий; почніть вводити, і підкаже те, що вже вписували. «Назва» — коротко, щоб упізнати в списку: не опис вмісту, а назва партії.',
    warn: 'Одна посилка — одна позиція. Якщо частина мішків їде на Тигр, а частина на Рись, заводьте дві.',
    img: '03-form-empty',
  },
  {
    t: 'Мішки — кожен з нового рядка',
    d: 'Один рядок — один мішок, саме так, як їх понесуть. Після «=» можна вписати вагу: тоді вага посилки складеться сама.',
    img: '04-form-filled',
  },
  {
    t: 'В першу чергу',
    d: 'Під переліком зʼявляться кнопки з назвами мішків. Натисніть ті, що мають полетіти найближчим бортом — борт бере не посилку цілком, а скільки підніме. На знімку відмічені два з чотирьох, а вага 31.5 кг порахувалась сама.',
    warn: 'Нічого термінового немає — не тисніть нічого. Коли першочергове все, черга перестає щось означати.',
    img: '05-form-hot',
  },
  {
    t: 'Збережено',
    d: 'Посилка стала карткою: видно кому, скільки мішків, скільки кілограмів і які з них першочергові. На цьому ваша частина роботи закінчується.',
  },
  {
    t: 'Помилились — виправте',
    d: 'На картці внизу є «Виправити»: відкриється та сама форма з тим, що вже вписано. Правити можна, доки посилка тут. Щойно її заберуть, кнопка зникає: картку вже бачили інші й діяли за нею, тож далі виправляє черговий.',
    img: '06-card',
  },
  {
    t: 'Далі веде черговий',
    d: 'Усе після збирання відмічає черговий: кому віддали на відправку — НРК чи комусь із пілотів, — хто прийняв на точці вильоту й коли посилка дійшла до позиції. Він це й так знає, тож у вас цих полів немає. Коли посилку заберуть, вона перейде у «Поїхало за останні дві доби» — щоб було видно, що вона рушила. Помилка в картці, коробка не поїхала, мішок розбили — теж до чергового: правити й видаляти звідси не можна.',
    img: '09-done',
  },
];

function HelpSheet({ onClose }) {
  return (
    <div className="z-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="z-sheet">
        <div className="z-sheet-h">Як заповнювати</div>
        <div className="z-sheet-b">
          <ol className="z-steps">
            {HELP.map((s) => (
              <li key={s.t}>
                <b>{s.t}</b>
                <span>{s.d}</span>
                {s.code && <pre className="z-code">{s.code}</pre>}
                {s.warn && <span className="z-warn">{s.warn}</span>}
                {/* Знімок того самого екрана. Вантажиться лише коли підказку
                    відкрили: у полі буває один поділок звʼязку. */}
                {s.img && (
                  <span className="z-shot">
                    <img src={`/zbir/${s.img}.png`} alt={s.t} loading="lazy" />
                  </span>
                )}
              </li>
            ))}
          </ol>
          <div className="z-tip" style={{ marginTop: 14 }}>
            Посилання на цю сторінку нікому не пересилайте: хто його отримає,
            зможе заводити посилки від вашого імені.
          </div>
        </div>
        <div className="z-sheet-f">
          <button className="z-btn z-btn-main" onClick={onClose}>Зрозуміло</button>
        </div>
      </div>
    </div>
  );
}

/** Позивний питаємо один раз: без нього в таблиці нема кого спитати */
function PackCard({ d, onEdit }) {
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
      <button className="z-btn z-wide" onClick={onEdit}>Виправити</button>
    </div>
  );
}

/**
 * Форма посилки — і для нової, і для правки.
 *
 * Це навмисно одна форма, а не дві схожі: поля, підказки й підрахунок
 * ваги мають лишатись однаковими, інакше правка починає поводитись
 * інакше за створення саме тоді, коли людина поспішає щось виправити.
 * `from` — посилка, яку відкрили правити; без неї форма порожня.
 */
function AddForm({ tos, from, onCancel, onSave }) {
  const [f, setF] = useState(() => ({
    to: from?.to || '',
    what: from?.what || '',
    // вага з поля потрібна лише для незважених посилок: у зважених вона
    // складається з мішків, і два числа рано чи пізно розійшлися б
    weight: from && !from.parts ? String(from.weight ?? '') : '',
    note: from?.note || '',
  }));
  const [parts, setParts] = useState(() => (from?.parts
    ? from.parts.names.map((x) => (x.kg === null ? x.name : `${x.name} = ${x.kg}`)).join('\n')
    : ''));
  const [hot, setHot] = useState(() => new Set(
    (from?.parts?.names || [])
      .filter((x) => x.hot)
      .map((x) => (x.kg === null ? x.name : `${x.name} = ${x.kg}`))
  ));
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
    <Sheet title={from ? 'Виправити посилку' : 'Нова посилка'} onCancel={onCancel} busy={busy} error={err}
      saveLabel={from ? 'Зберегти' : 'Зібрано'}
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
