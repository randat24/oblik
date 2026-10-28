import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { parsePart, joinParts, STAGES } from '../lib/delivery';

/**
 * Пункт збору.
 *
 * Окремий вхід для того, хто складає посилки й віддає їх на відправку. У
 * нього рівно дві дії, і сторінка зроблена так, щоб їх не треба було
 * шукати: зібрав коробку — записав; згадав про забутий мішок — виправив.
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
const WHO = 'Пакувальник';

const load = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватне вікно */ } };

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data;
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
        <div className="z-gate" role="main">
          <h1>Пункт збору</h1>
          <p>Відкрийте сторінку за посиланням із ключем — його дає черговий.</p>
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="z-gate" role="main">
          <h1>Пункт збору</h1>
          <p>{error.status === 401 ? 'Ключ не підходить. Попросіть у чергового свіже посилання.'
            : error.status === 404 ? 'Пункт збору вимкнено.'
            : error.message}</p>
          <button className="z-btn" onClick={() => reload()}>Спробувати ще</button>
        </div>
      </Shell>
    );
  }

  if (!data) return <Shell><div className="z-gate" role="main"><p>Завантаження…</p></div></Shell>;

  /*
   * Дві купки: те, що чекає водія, і те, що вже їде. Обидві правляться —
   * саме тому вони тут. Доставлені не показуємо взагалі: правити їх
   * однаково не можна, а в списку вони плуталися з тими, що ще чекають.
   */
  const waiting = data.list.filter((d) => d.stage === 'packed');
  const moving = data.list.filter((d) => d.stage === 'handed' || d.stage === 'atbase');
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

      {moving.length > 0 && (
        <>
          <div className="z-sec">У дорозі</div>
          <div className="z-list">
            {moving.map((d) => (
              <PackCard key={d.row} d={d} onEdit={() => setEdit(d)} />
            ))}
          </div>
        </>
      )}

      {add && (
        <AddForm
          tos={data.tos}
          pilots={data.pilots}
          onCancel={() => setAdd(false)}
          onSave={async (body) => { if (await send({ ...body, action: 'add' })) setAdd(false); }}
        />
      )}

      {edit && (
        <AddForm
          tos={data.tos}
          pilots={data.pilots}
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
    t: 'Куди і що',
    d: '«На яке СП посилка» — оберіть із готових. Вписати свій варіант не можна навмисно: перелік веде черговий, і так у кожній картці стоять ті самі назви. «Назва» — коротко, щоб упізнати в списку: не опис вмісту, а назва партії.',
    warn: 'Одна посилка — один СП. Якщо частина мішків їде на Тигр, а частина на Рись, заводьте дві.',
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
    t: 'Якому пілоту',
    d: 'Внизу форми оберіть пілота: Лотар, БПС або хто там сьогодні. Пілоти приймають коробку на точці вильоту й доставляють її дронами — тому без цього посилку не зберегти.',
    warn: 'Немає потрібного позивного — скажіть черговому: перелік веде він, і новий зʼявиться в формі того ж дня.',
  },
  {
    t: 'Збережено',
    d: 'Посилка стала карткою: видно кому, скільки мішків, скільки кілограмів і які з них першочергові. На цьому ваша частина роботи закінчується.',
  },
  {
    t: 'Забули мішок — допишіть',
    d: 'На картці внизу є «Виправити»: відкриється та сама форма з тим, що вже вписано. Правити можна й тоді, коли посилка вже поїхала: про забутий мішок згадують не за хвилину після збереження. Відмітки чергового при цьому не збиваються — вони переносяться за назвами мішків.',
    img: '06-card',
  },
  {
    t: 'У дорозі',
    d: 'Коли посилку заберуть, вона перейде в «У дорозі» — і буде видно, чим її повезли й хто прийняв на точці вильоту. Це відмічає черговий: він і так це знає, тож у вас цих полів немає. Картка лишається вашою — «Виправити» на ній нікуди не дівається.',
    img: '09-move',
  },
  {
    t: 'Дійшла — картка зникає',
    d: 'Щойно посилка дійшла до СП, вона зникає зі сторінки. Правити її вже не можна: її прийняли на тому кінці, і переписувати заднім числом те, що вже отримали, — не виправлення. Тут лишається тільки те, за що ви ще відповідаєте.',
    warn: 'Порожньо — це добре: значить, усе доїхало. Куди саме дійшла посилка, бачить черговий — спитайте його.',
  },
];

function HelpSheet({ onClose }) {
  return (
    <div className="z-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="z-sheet">
        <div className="z-sheet-h">Як заповнювати</div>
        <div className="z-sheet-b" tabIndex={0}>
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

/** Куди посилка дійшла — словами, які стоять і в чергового */
const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

/*
 * Картка посилки — та сама і для тієї, що чекає водія, і для тієї, що вже
 * в дорозі. Різниця лише в рядку про рух: правити можна обидві, і робити
 * заради цього другий вигляд картки означало б учити людину двом.
 */
function PackCard({ d, onEdit }) {
  const kg = d.parts?.kg || d.weight;
  const hot = d.parts?.names.filter((x) => x.hot) || [];
  const moving = d.stage === 'handed' || d.stage === 'atbase';
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
        {d.pilot ? ` · дроном: ${d.pilot}` : ''}
        {d.giver ? ` · зібрав ${d.giver}` : ''}
      </div>
      {moving && (
        <div className="z-move">
          {STAGE_LABEL[d.stage] || ''}
          {d.stage === 'handed' && d.driver ? ` · ${d.driver}` : ''}
          {d.stage === 'atbase' && d.taker ? ` · прийняв ${d.taker}` : ''}
          {' · '}
          {((d.stage === 'atbase' ? d.atbase : d.handed) || '').split(' ')[0]}
        </div>
      )}
      {d.parts && (
        <>
          {/* Підсумок з'являється лише тоді, коли з мішками щось сталося:
              «4 місця» і так стоїть у рядку вище, а другий такий самий
              рядок над кожною карткою — це шум, у якому губиться рідкісне
              «втрачено». */}
          {(d.parts.done > 0 || d.parts.lost > 0) && (
            <div className="z-bsum">
              {d.parts.done > 0 && (
                <span className="is-done">{d.parts.done} доїхало</span>
              )}
              {d.parts.left > 0 && <span>{d.parts.left} у дорозі</span>}
              {d.parts.lost > 0 && (
                <span className="is-lost">{d.parts.lost} втрачено</span>
              )}
            </div>
          )}
          <div className="z-bags">
            {d.parts.names.map((x, i) => (
              <span
                className={'z-bag'
                  + (x.lost ? ' lost' : x.done ? ' done' : '')
                  + (x.hot && !x.done && !x.lost ? ' hot' : '')}
                key={i}
              >
                {/* Позначка попереду назви, а не кольором самої назви:
                    у полі екран часто бачать під сонцем, і колір там
                    розрізняється гірше за значок. */}
                {x.lost ? '✕ ' : x.done ? '✓ ' : ''}
                {x.name}{x.kg !== null ? ` · ${x.kg}` : ''}
              </span>
            ))}
          </div>
        </>
      )}
      {/* Примітка — те, заради чого її писали: «крихке», «тримати сухим».
          Сірим дрібним текстом її не читав ніхто. */}
      {d.note && (
        <div className="note">
          <span className="note-l">Примітка</span>
          {d.note}
        </div>
      )}
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
function AddForm({ tos, pilots, from, onCancel, onSave }) {
  const [f, setF] = useState(() => ({
    to: from?.to || '',
    pilot: from?.pilot || '',
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
        // питаємо лише тоді, коли є з чого обирати: порожній перелік —
        // це недогляд адміністратора, а не привід не дати зберегти
        if (!f.pilot && (pilots || []).length > 0) {
          return setErr('Оберіть пілота, якому везете посилку');
        }
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
      {/* Тільки вибір, без поля для набору. Збирач не вирішує, як
          називається СП, — він показує пальцем на готове. Заразом це
          прибирає описки, через які «Тигр» і «тигр» ставали різними
          напрямками. Перелік веде черговий. */}
      <label className="z-lab">
        На яке СП посилка
        {!f.to && <span className="z-cnt">оберіть</span>}
      </label>
      <div className="z-chips">
        {(tos || []).map((v) => (
          <button key={v} type="button"
            className={'z-chip' + (f.to === v ? ' on' : '')}
            onClick={() => up('to', f.to === v ? '' : v)}>{v}</button>
        ))}
      </div>
      {(tos || []).length === 0 && (
        <div className="z-tip">Перелік СП порожній — скажіть черговому.</div>
      )}

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

      {/* Кому везуть на точку. Збирач це знає — він і домовляється про
          передачу; черговий потім лише підтвердить, хто справді забрав.
          Підпис пояснює, хто ці люди: без нього «Лотар» і «БПС» для
          новенького — просто два слова. */}
      <label className="z-lab">
        Якому пілоту
        {!f.pilot && (pilots || []).length > 0 && <span className="z-cnt">оберіть</span>}
      </label>
      <div className="z-chips">
        {(pilots || []).map((v) => (
          <button key={v} type="button"
            className={'z-chip' + (f.pilot === v ? ' on' : '')}
            onClick={() => up('pilot', f.pilot === v ? '' : v)}>{v}</button>
        ))}
      </div>
      <div className="z-tip">
        {(pilots || []).length > 0
          ? 'Пілоти — ті, хто прийме коробку на точці вильоту й доставить її дроном. Оберіть того, кому везете.'
          : 'Перелік порожній — скажіть черговому.'}
      </div>

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
        <div className="z-sheet-b" tabIndex={0}>{children}</div>
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
