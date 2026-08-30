/**
 * Доставки: шлях посилки від пункту збору до пілота.
 *
 * Це найдовший розділ застосунку — і водночас найбільш окремий: усе, що
 * йому потрібно ззовні, — кілька слів спільної абетки та розрахунки з
 * `lib/delivery`. Ніщо в решті сторінки не заглядає сюди, крім однієї
 * вкладки. Тому воно й винесене цілим шматком, без переписування: різати
 * по готовому шву безпечніше, ніж вигадувати новий.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  stuck, byDriver, byPilot, byPoint, deliveredWithin, splitPoints, joinPoints,
  splitParts, joinParts, partsOf, partsLeft, weightOf, weightLeft, parsePart,
  placesOf, lostOf, orderForRoad, hotOf, PRIO_FIRST,
} from '../lib/delivery';
import { api, Modal, SearchBox, Stat, bagWord, dayWord } from './base';

/**
 * Шлях посилки: зібрали → передали на відправку → відправник довіз до точки вильоту →
 * доставили адресатові.
 *
 * Побудовано тим самим словником, що й решта розділів: сітка карток,
 * бейдж-номер, пігулка стану, рядки даних, кнопки дій знизу. Свого тут
 * лише смуга маршруту — чотирьох етапів у застосунку більше ніде немає.
 *
 * На картці одна головна кнопка, а не перелік станів: маршрут лінійний,
 * наступний крок завжди відомий, і вибирати з чотирьох там, де правильний
 * один, — робота, яку не варто перекладати на того, хто стоїть із коробкою.
 */
/** Етапи для правки дат — підписи ті самі, що на картці */
const DLV_STAGE_KEYS = [
  ['packed', 'Зібрано'],
  ['handed', 'Передали'],
  ['atbase', 'На точці вильоту'],
  ['delivered', 'Доставлено'],
];

export function DeliveryView({ setState, me = '', chief = false }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('');
  const [add, setAdd] = useState(false);
  const [move, setMove] = useState(null);
  const [edit, setEdit] = useState(null);
  const [lose, setLose] = useState(null);

  const load = useCallback(async () => {
    setState('завантаження…');
    try {
      setData(await api('/api/delivery'));
      setState('синхронізовано');
    } catch (e) {
      setState('помилка: ' + e.message);
    }
  }, [setState]);

  useEffect(() => { load(); }, [load]);

  const send = async (body, method = 'POST') => {
    setState('збереження…');
    try {
      setData(await api('/api/delivery', { method, body }));
      setState('синхронізовано');
      return true;
    } catch (e) {
      setState('помилка: ' + e.message);
      alert(e.message);
      return false;
    }
  };

  if (!data) return <div className="loading">Завантаження…</div>;

  const stages = data.stages;
  // Списана посилка зберігає свій останній етап — але стоїть вона там уже
  // тільки в таблиці. Рахувати її як «на точці вильоту» означає щоранку
  // шукати на точці ящик, якого немає.
  const alive = data.list.filter((d) => !d.isLost);
  const counts = stages.map((s) => alive.filter((d) => d.stage === s.key).length);

  let list = data.list;
  // фільтр за етапом показує те, що там справді стоїть: списане має свій
  // окремий фільтр, а не ховається серед живих етапів
  if (only === 'lost') list = list.filter((d) => d.isLost);
  else if (only) list = list.filter((d) => d.stage === only && !d.isLost);
  if (q.trim()) {
    const t = q.trim().toLowerCase();
    list = list.filter((d) => [d.to, d.what, d.driver, d.point, d.giver, d.taker, d.pilot, d.note, d.parts]
      .join(' ').toLowerCase().includes(t));
  }

  // першочергове — вгору списку, далі те, що довше стоїть без руху
  const onWay = orderForRoad(list.filter((d) => !d.done && !d.isLost));
  const done = list.filter((d) => d.done);
  const goneList = list.filter((d) => d.isLost);

  // Зведення рахуємо по всьому, а не по відфільтрованому: пошук звужує
  // список, але не змінює того, скільки коробок насправді в дорозі.
  const all = data.list;
  const inTransit = all.filter((d) => !d.done && !d.isLost);
  // кілограми рахуємо по тому, що ще везти: половину посилки вже поставили,
  // і її вага в «у дорозі» більше не стоїть
  const weight = weightLeft(inTransit);
  const waiting = alive.filter((d) => d.stage === 'packed');
  const handed = alive.filter((d) => d.stage === 'handed');
  const atbase = alive.filter((d) => d.stage === 'atbase');
  const waitKg = weightLeft(waiting);
  const late = stuck(all);
  const week = deliveredWithin(all, 7);
  const pilots = byPilot(all);
  const points = byPoint(all);
  const left = partsLeft(all);
  const atbaseLeft = partsLeft(atbase);
  const places = placesOf(inTransit);
  const gone = lostOf(all);
  const lostCount = all.length - alive.length;
  // доставлені місця рахуємо по всьому: половина посилки, що приїхала
  // вчора, — це вже доставка, хай навіть картка ще стоїть «у дорозі»
  const donePlaces = placesOf(all).done;
  const closed = all.filter((d) => d.done).length;
  // черговість рахуємо мішками: борт бере не посилки, а стільки мішків,
  // скільки підніме
  const hot = hotOf(all);
  const kg = (n) => Math.round(n * 10) / 10;

  const card = (d) => (
    <DeliveryCard
      key={d.row}
      item={d}
      stages={stages}
      onMove={(stage) => setMove({ item: d, stage })}
      onPart={(n) => send({ action: 'part', row: d.row, n })}
      onLose={() => setLose(d)}
      onEdit={() => setEdit(d)}
      onDelete={async () => {
        if (!confirm(`Видалити посилку «${d.what}»?`)) return;
        await send({ row: d.row }, 'DELETE');
      }}
    />
  );

  return (
    <>
      {/* Плитки повторюють етапи один в один: питання логістики — «скільки
          готово, скільки передано, скільки доставлено», і відповідь має
          читатися без перекладу зі слів застосунку на слова людини. */}
      <div className="stats">
        <Stat label="Готово до відправки" value={waiting.length}
          tone={waiting.length ? 'warn' : undefined}
          sub={waitKg > 0 ? `${kg(waitKg)} кг чекає відправки` : 'зібрано, ще не передано'} />
        {/* під плиткою — ті самі посилки в розрізі водіїв, а не всі, що в
            когось на руках: «0» і «БПС 1» поруч читаються як помилка */}
        <Stat label="Передано на відправку" value={handed.length}
          sub={byDriver(handed).map((x) => `${x.name} ${x.n}`).join(' · ') || 'нікому не передавали'} />
        <Stat label="На точці вильоту" value={atbase.length}
          sub={atbaseLeft.left > 0
            ? `місць до розвезення: ${atbaseLeft.left}`
              + (weightLeft(atbase) > 0 ? ` · ${kg(weightLeft(atbase))} кг` : '')
            : 'чекає на виліт'} />
        {/* Місця, а не посилки: коли з трьох каністр приїхали дві, доставка
            вже відбулась — двічі. Порахувати це посилками неможливо, там
            досі «нуль», і плитка розходиться з галочками на картках. */}
        <Stat label="Доставлено місць" value={donePlaces} tone="ok"
          sub={`посилок закрито ${closed} · за тиждень ${week.length}`} />
      </div>

      <div className="totals">
        {/* Посилок може бути п'ять, а місць у них — двадцять: коли відправку
            везуть частинами, «скільки коробок» і «скільки ще везти» — різні
            числа, і друге в логістиці головніше. */}
        <span>Місць у дорозі <b>{places.left}</b>{' '}
          <span className="totals-of">з {places.total}</span>
          {weight > 0 ? ` · ${kg(weight)} кг` : ''}</span>
        <span className="totals-sep">·</span>
        <span>Посилок <b>{inTransit.length}</b>
          {places.split > 0 && <span className="totals-of"> · {places.split} їде частинами</span>}
        </span>
        {hot.places > 0 && (
          <>
            <span className="totals-sep">·</span>
            <span style={{ color: 'var(--amber)' }}>
              В першу чергу <b>{hot.places}</b>
              <span className="totals-of"> {bagWord(hot.places)}</span>
              {hot.kg > 0 ? ` · ${hot.kg} кг` : ''}
            </span>
          </>
        )}
        {gone.places > 0 && (
          <>
            <span className="totals-sep">·</span>
            <span style={{ color: 'var(--red)' }}>
              Втрачено <b>{gone.places}</b>{gone.kg > 0 ? ` · ${kg(gone.kg)} кг` : ''}
            </span>
          </>
        )}
      </div>

      {late.length > 0 && (
        <div className="section">
          <h3 className="primary">Потребує уваги<span className="count">{late.length}</span></h3>
          <div className="attn-list">
            {late.map((d) => {
              const st = stages[d.at];
              const nxt = stages[d.at + 1];
              return (
                <div className={'attn' + (d.days > d.sla * 2 ? ' attn-bad' : '')} key={d.row}>
                  <span className="attn-text">
                    <b>{d.what}</b>{d.to ? ` для ${d.to}` : ''} — {st.label.toLowerCase()}{' '}
                    {d.days} {dayWord(d.days)}
                    {d.driver ? `, у ${d.driver}` : ''}
                  </span>
                  {nxt && (
                    <button className="act-btn act-accept" onClick={() => setMove({ item: d, stage: nxt.key })}>
                      {nxt.action}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* У кого з пілотів що лежить і куди воно летить. Транспорт до точки
          вильоту тут колись стояв замість пілотів — і відповідав не на те
          питання: «Машина 1» нічого не каже про те, скільки чекає вильоту
          на Лотарі. */}
      {(pilots.length > 0 || points.length > 1) && (
        <div className="section">
          <h3 className="sec">Пілоти й куди</h3>
          <div className="chips">
            {pilots.map((x) => (
              <div className="chip" key={'d' + x.name} onClick={() => setQ(x.name)}>
                {x.name} <b style={{ marginLeft: 4 }}>{x.n}</b>
                {x.kg > 0 && <span className="count" style={{ marginLeft: 6 }}>{kg(x.kg)} кг</span>}
              </div>
            ))}
            {points.filter((x) => x.name !== '—').map((x) => (
              <div className="chip" key={'p' + x.name} style={{ color: 'var(--blue)' }}
                onClick={() => setQ(x.name)}>
                → {x.name} <b style={{ marginLeft: 4 }}>{x.n}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="chips">
        {stages.map((s, i) => (
          <div
            key={s.key}
            className={'chip' + (only === s.key ? ' on' : '')}
            onClick={() => setOnly(only === s.key ? '' : s.key)}
          >
            {s.label}<span className="count">{counts[i]}</span>
          </div>
        ))}
        {lostCount > 0 && (
          <div
            className={'chip' + (only === 'lost' ? ' on' : '')}
            style={{ color: 'var(--red)' }}
            onClick={() => setOnly(only === 'lost' ? '' : 'lost')}
          >
            Втрачено<span className="count">{lostCount}</span>
          </div>
        )}
      </div>

      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Знайти посилку: кому, вміст, хто відправляє, точка..." />
        <div className="spacer" />
        <button className="btn" onClick={() => setAdd(true)}>+ Нова посилка</button>
      </div>

      {list.length === 0 ? (
        <div className="empty">{q.trim() || only ? 'Нічого не знайдено' : 'Посилок немає'}</div>
      ) : (
        <>
          {onWay.length > 0 && (
            <div className="section">
              <h3 className="primary">У дорозі<span className="count">{onWay.length}</span></h3>
              <div className="grid">{onWay.map(card)}</div>
            </div>
          )}
          {done.length > 0 && (
            <div className="section">
              <h3>Доставлено<span className="count">{done.length}</span></h3>
              <div className="grid">{done.map(card)}</div>
            </div>
          )}
          {/* Втрачене стоїть окремо, а не серед доставленого: це не результат
              роботи, а її недостача, і мішати їх — значить втратити рахунок */}
          {goneList.length > 0 && (
            <div className="section">
              <h3>Втрачено<span className="count">{goneList.length}</span></h3>
              <div className="grid">{goneList.map(card)}</div>
            </div>
          )}
        </>
      )}

      {add && (
        <DeliveryAdd
          tos={data.tos}
          onCancel={() => setAdd(false)}
          onSave={async (body) => { if (await send({ ...body, action: 'add' })) setAdd(false); }}
        />
      )}

      {move && (
        <DeliveryMove
          item={move.item}
          stage={stages.find((s) => s.key === move.stage)}
          transport={data.transport}
          takers={data.takers}
          points={data.points}
          me={me}
          onCancel={() => setMove(null)}
          onSave={async (body) => {
            if (await send({ ...body, action: 'stage', row: move.item.row, stage: move.stage })) setMove(null);
          }}
        />
      )}

      {edit && (
        <DeliveryAdd
          item={edit}
          tos={data.tos}
          transport={data.transport}
          takers={data.takers}
          chief={chief}
          onCancel={() => setEdit(null)}
          onSave={async (body) => {
            if (await send({ ...body, action: 'update', row: edit.row })) setEdit(null);
          }}
        />
      )}

      {lose && (
        <DeliveryLose
          item={lose}
          whys={data.whys || []}
          onCancel={() => setLose(null)}
          onSave={async (body) => {
            if (await send({ ...body, action: 'lose', row: lose.row })) setLose(null);
          }}
        />
      )}
    </>
  );
}

function DeliveryCard({ item, stages, onMove, onPart, onLose, onEdit, onDelete }) {
  const next = item.at + 1 < stages.length ? stages[item.at + 1] : null;
  const pts = splitPoints(item.point);
  const parts = partsOf(item);
  // коли місця зважені, вага посилки — їх сума: два числа, вписані окремо,
  // рано чи пізно розійшлись би
  const kg = weightOf(item);
  const rows = [
    ['Чим везли до пілота', item.driver],
    [pts.length > 1 ? 'Точки' : 'Точка', item.point],
    ['Здав', item.giver],
    // намір збирача й факт чергового стоять поруч: коли коробку віддали
    // не тому, кому збирали, це видно з одного погляду
    ['Пілот', item.pilot],
    ['Прийняв', item.taker],
    // Примітки серед цих рядків більше немає: вона стоїть окремою смугою
    // нижче. «Крихке» й «тримати сухим» не мають читатися тим самим сірим,
    // що й позивний того, хто здав.
  ].filter(([, v]) => v);
  // списану посилку не рухають далі: наступного етапу в неї немає
  const gone = item.isLost;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <div className="title-line">
            {item.to && <span className="id-badge" title="Кому призначена">{item.to}</span>}
            {/* першочергове видно ще до того, як прочитали назву: у списку
                з двадцяти карток шукати позначку в тексті ніхто не буде */}
            {item.urgent && !item.done && !gone && (
              <span className="dlv-prio"
                title={parts ? `Першочергових мішків: ${parts.hotLeft}` : 'В першу чергу'}>
                1&nbsp;черга{parts && parts.hotLeft > 0 ? ` · ${parts.hotLeft}` : ''}
              </span>
            )}
            <span className="dlv-name">{item.what}</span>
          </div>
          {kg !== null && (
            <div className="card-sn" style={{ marginLeft: 0, width: 'auto' }}>
              {Math.round(kg * 10) / 10} кг
              {parts?.weighed && parts.kgLeft > 0 && parts.kgLeft !== kg && (
                <span className="dlv-kg-left"> · везти ще {Math.round(parts.kgLeft * 10) / 10}</span>
              )}
            </div>
          )}
        </div>
        <span
          className="pill dlv-pill"
          style={{ color: gone ? 'var(--red)' : item.done ? 'var(--green)' : 'var(--amber)' }}
        >
          {gone ? 'Втрачено' : (stages[item.at]?.short || stages[item.at]?.label || '—')}
        </span>
      </div>

      {/* Смуга маршруту: де була, де зараз, скільки лишилось */}
      <div className="dlv-track">
        {stages.map((s, i) => (
          <div key={s.key} className={'dlv-step' + (i <= item.at ? ' on' : '')} title={item.dates[s.key] || s.hint}>
            <i />
            <span>{s.label}</span>
            <em>{(item.dates[s.key] || '').split(' ')[0] || ''}</em>
          </div>
        ))}
      </div>

      {/* Місця. Відправку часто везуть частинами: вода полетіла сьогодні,
          їжа й обладнання — через день. Тому дата стоїть у кожного місця
          окремо, а не одна на всю посилку. Дотик ставить і знімає позначку —
          окремої кнопки «скасувати» тут не треба. */}
      {parts && (
        <div className="dlv-parts">
          <div className="dlv-parts-head">
            <span>Місця</span>
            <b className={parts.done === parts.total ? 'all' : ''}>{parts.done} з {parts.total}</b>
            {parts.weighed && parts.kgLeft > 0 && (
              <b className="dlv-kg">{Math.round(parts.kgLeft * 10) / 10} кг везти</b>
            )}
            {parts.lost > 0 && <b className="dlv-kg is-lost">втрачено {parts.lost}</b>}
            {parts.hotLeft > 0 && (
              <b className="dlv-kg is-hot">
                1 черга: {parts.hotLeft}{parts.kgHot > 0 ? ` · ${Math.round(parts.kgHot * 10) / 10} кг` : ''}
              </b>
            )}
            {parts.left.length > 0 && <em>лишилось: {parts.left.join(', ')}</em>}
          </div>
          <div className="dlv-chips">
            {parts.items.map((p) => (
              <button
                key={p.n}
                className={'dlv-part' + (p.done ? ' on' : '') + (p.lost ? ' lost' : '')
                  + (p.hot && !p.done && !p.lost ? ' hot' : '')}
                onClick={() => onPart(p.n)}
                title={p.lost
                  ? `Списано${p.at ? ' ' + p.at : ''} — натисніть, якщо все ж приїхало`
                  : p.done
                    ? `Доставлено${p.at ? ' ' + p.at : ''} — натисніть, щоб зняти`
                    : p.hot
                      ? 'В першу чергу — натисніть, щоб позначити доставленим'
                      : 'Позначити як доставлене'}
              >
                <i>{p.lost ? '✕' : p.done ? '✓' : ''}</i>
                <span>{p.name}</span>
                {p.kg !== null && <em className="dlv-part-kg">{p.kg} кг</em>}
                {/* на чипі досить дня й місяця — рік і час є в підказці */}
                {p.at && <em>{p.at.split(' ')[0].split('.').slice(0, 2).join('.')}</em>}
              </button>
            ))}
          </div>
          {parts.left.length > 0 && (
            <div className="dlv-parts-foot">
              Решта поїде пізніше — відмітьте її тоді. Посилка закриється,
              коли по кожному місцю буде відповідь: приїхало або списане.
            </div>
          )}
          {parts.lost > 0 && (
            <div className="dlv-parts-foot is-lost">
              Не доїде: {parts.lostNames.join(', ')}. Ці місця не рахуються ні
              в дорозі, ні в доставленому.
            </div>
          )}
        </div>
      )}

      {item.lost && (
        <div className="dlv-lost">
          <b>Списано</b> {item.lost}
        </div>
      )}

      {rows.length > 0 && (
        <div className="card-body">
          {rows.map(([k, v]) => (
            <div className="drow" key={k}>
              <div className="drow-k">{k}</div>
              <div className="drow-v">{v}</div>
            </div>
          ))}
        </div>
      )}

      {item.note && (
        <div className="note">
          <span className="note-l">Примітка</span>
          {item.note}
        </div>
      )}

      <div className="actions">
        {next && !gone && (
          <button className="act-btn act-accept" onClick={() => onMove(next.key)}>{next.action}</button>
        )}
        {/* Списання поруч із рухом уперед: не все, що не приїхало, ще їде,
            і поки цієї кнопки не було, розбитий ящик доводилось або
            вдавати доставленим, або тримати «в дорозі» назавжди. */}
        {(!item.done || gone) && (
          <button className="act-btn act-lost" onClick={onLose}>
            {gone ? 'Повернути' : 'Втрачено'}
          </button>
        )}
        <button className="act-btn" onClick={onEdit}>Правка</button>
        <button className="act-btn act-del" onClick={onDelete}>Видалити</button>
      </div>
    </div>
  );
}

function DeliveryAdd({ item, tos, transport, takers, chief, onCancel, onSave }) {
  const [f, setF] = useState(() => ({
    to: item?.to || '',
    pilot: item?.pilot || '',
    what: item?.what || '',
    weight: item?.weight ?? '',
    note: item?.note || '',
    prio: item?.prio || '',
    // Люди правляться лише в наявній посилці: у новій їх ще немає, а
    // «хто здав» проставляється сам при створенні.
    driver: item?.driver || '',
    giver: item?.giver || '',
    taker: item?.taker || '',
  }));
  // Дати етапів править лише головний — і тільки в наявній посилці
  const [dates, setDates] = useState(() => ({ ...(item?.dates || {}) }));
  // Місця вводяться рядками, а зберігаються через «;»: набирати список
  // з Enter простіше, ніж пам'ятати розділювач, а в самих назвах повно ком
  // («7,7 л»), тож кома розділювачем бути не може.
  const [parts, setParts] = useState(() => splitParts(item?.parts).join('\n'));
  const partList = parts.split(/[\n;]/).map((x) => x.trim()).filter(Boolean);
  // Черговість стоїть на мішку: партія «Для Тигра» — це чотири мішки на
  // один борт, і першочерговими бувають два з них. Тримаємо позначки за
  // назвами, бо номери зсуваються, щойно допишуть рядок посередині.
  const [hot, setHot] = useState(() => {
    const p = partsOf(item || {});
    return new Set(p ? p.items.filter((x) => x.hot).map((x) => x.label) : []);
  });
  const hotIn = (label) => hot.has(label);
  const toggleHot = (label) => setHot((s) => {
    const n = new Set(s);
    if (n.has(label)) n.delete(label); else n.add(label);
    return n;
  });
  const hotNums = partList.map((l, i) => (hotIn(l) ? i + 1 : 0)).filter(Boolean);
  // вага, порахована з місць: коли вона є, окреме поле ваги зайве —
  // два числа про одне й те саме завжди рано чи пізно розходяться
  const weighed = partList.map(parsePart);
  const partsKg = weighed.some((x) => x.kg !== null)
    ? Math.round(weighed.reduce((a, x) => a + (x.kg || 0), 0) * 10) / 10
    : null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      title={item ? 'Правка посилки' : 'Нова посилка'}
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        if (!f.what.trim()) return setErr('Вкажіть назву');
        setBusy(true); setErr('');
        try {
          const body = {
            ...f,
            what: f.what.trim(),
            weight: partsKg !== null ? partsKg : f.weight,
            parts: joinParts(partList),
            partsHot: hotNums.join('; '),
            // позначка на самій посилці лишається тільки коли місць немає:
            // тоді вся посилка і є той один мішок
            prio: partList.length ? '' : f.prio,
          };
          // у новій посилці цих полів у формі не було — не надсилаємо
          // порожнечу, щоб не затерти те, що проставляє сам маршрут
          if (!item) { delete body.driver; delete body.giver; delete body.taker; }
          if (item && chief) body.dates = dates;
          await onSave(body);
        }
        catch (e) { setErr(e.message); }
        finally { setBusy(false); }
      }}
    >
      {/* СП обирають зі списку, який ведеться окремо. Текстове поле тут
          колись було, і кожна описка ставала новим напрямком: «Тигр»,
          «тигр» і «Тирг» рахувались як три різні. Нову назву заводять у
          «Налаштуваннях», а не в цій формі. */}
      <div style={{ marginTop: 10 }}>
        <label>
          На яке СП посилка
          {!f.to && <span className="dlv-you">оберіть</span>}
        </label>
        <div className="chips">
          {(tos || []).map((v) => (
            <div key={v} className={'chip' + (f.to === v ? ' on' : '')}
              onClick={() => up('to', f.to === v ? '' : v)}>{v}</div>
          ))}
        </div>
        {(tos || []).length === 0 && (
          <div className="dlv-tip" style={{ marginTop: 6 }}>
            Перелік СП порожній — додайте його у «Налаштуваннях».
          </div>
        )}
      </div>
      {/* Кому везуть на точку вильоту — намір, відомий ще до відправки.
          Той, хто справді забрав, пишеться окремо на самому етапі: збіглося
          не завжди, і перезаписувати одне одним означало б втратити те, що
          варте погляду. */}
      <div style={{ marginTop: 10 }}>
        <label>Пілот</label>
        <div className="chips">
          {(takers || []).map((v) => (
            <div key={v} className={'chip' + (f.pilot === v ? ' on' : '')}
              onClick={() => up('pilot', f.pilot === v ? '' : v)}>{v}</div>
          ))}
        </div>
        <input type="text" value={f.pilot} style={{ marginTop: 8 }}
          onChange={(e) => up('pilot', e.target.value)}
          placeholder="або впишіть свій варіант" />
        <div className="dlv-tip" style={{ marginTop: 6 }}>
          Прийме на точці вильоту й доставить дроном.
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label>Назва</label>
        <input type="text" value={f.what} onChange={(e) => up('what', e.target.value)}
          placeholder="Вода, Їжа, Акумулятори…" />
      </div>

      {/* Черговість, коли посилка — один мішок. Коли їх кілька, позначка
          переїжджає на самі мішки: борт бере не посилку цілком, а стільки,
          скільки підніме. */}
      {partList.length === 0 && (
        <div style={{ marginTop: 10 }}>
          <label>Черговість</label>
          <div className="chips">
            <div className={'chip' + (!f.prio ? ' on' : '')} onClick={() => up('prio', '')}>
              Звичайна
            </div>
            <div className={'chip dlv-prio-chip' + (f.prio ? ' on' : '')}
              onClick={() => up('prio', PRIO_FIRST)}>
              В першу чергу
            </div>
          </div>
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <label>
          Вага, кг
          {partsKg !== null && <span className="dlv-you">з місць: {partsKg}</span>}
        </label>
        <input type="number" min="0" step="0.1" inputMode="decimal"
          value={partsKg !== null ? partsKg : f.weight}
          disabled={partsKg !== null}
          onChange={(e) => up('weight', e.target.value)}
          placeholder="—" />
      </div>
      <div style={{ marginTop: 10 }}>
        <label>
          Місця — кожне з нового рядка
          {partList.length > 0 && <span className="count" style={{ marginLeft: 6 }}>{partList.length}</span>}
        </label>
        <textarea rows={3} value={parts} onChange={(e) => setParts(e.target.value)}
          placeholder={'Вода 7,7 л = 7.7\nВода 7,8 л = 7.8\nЇжа'} />
        <div className="dlv-tip" style={{ marginTop: 6 }}>
          Заповнюйте, коли відправку везуть частинами: кожне місце
          відмічається окремо, і видно, що вже поставили, а що ні.
          Після «=» можна вписати вагу місця — тоді вага посилки складеться
          сама, а на картці буде видно, скільки кілограмів ще везти.
        </div>
      </div>

      {/* Які мішки летять найближчим бортом. Тиснути тут, а не вписувати
          значок у рядок: перелік уже набраний, лишилось показати пальцем. */}
      {partList.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <label>
            В першу чергу
            {hotNums.length > 0 && (
              <span className="count" style={{ marginLeft: 6 }}>{hotNums.length} з {partList.length}</span>
            )}
          </label>
          <div className="chips">
            {partList.map((label, i) => {
              const { name } = parsePart(label);
              return (
                <div key={label + i}
                  className={'chip dlv-prio-chip' + (hotIn(label) ? ' on' : '')}
                  onClick={() => toggleHot(label)}
                >
                  {name}
                </div>
              );
            })}
          </div>
          <div className="dlv-tip" style={{ marginTop: 6 }}>
            Відмітьте мішки, які мають полетіти найближчим бортом. Борт бере
            не посилку цілком, а скільки підніме, — і саме ці поїдуть першими.
          </div>
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <label>Примітка</label>
        <input type="text" value={f.note} onChange={(e) => up('note', e.target.value)}
          placeholder="крихке, тримати сухим…" />
      </div>

      {/* Люди. Правити їх доводиться частіше, ніж здається: позивний
          вписують у сусіднє поле, посилку передають не тому водієві, на
          точці приймає не той, кого чекали. Тут три поля поспіль, щоб
          виправити все за один захід, а не ганяти форму тричі. */}
      {item && (
        <div style={{ marginTop: 16 }}>
          <label>Люди</label>

          <div className="dlv-who-f">
            <span className="dlv-who-l">Чим веземо до пілота</span>
            <input type="text" list="dlvTransport" value={f.driver}
              onChange={(e) => up('driver', e.target.value)}
              placeholder="НРК, машина…" />
            <datalist id="dlvTransport">{(transport || []).map((v) => <option key={v} value={v} />)}</datalist>
          </div>

          <div className="dlv-who-f">
            <span className="dlv-who-l">Хто здав</span>
            <input type="text" value={f.giver}
              onChange={(e) => up('giver', e.target.value)}
              placeholder="хто зібрав посилку" />
          </div>

          <div className="dlv-who-f">
            <span className="dlv-who-l">
              Хто прийняв
              {f.taker && f.taker === f.to && <span className="dlv-you">адресат</span>}
            </span>
            <input type="text" list="dlvTakers" value={f.taker}
              onChange={(e) => up('taker', e.target.value)}
              placeholder="на точці — хто забрав, на СП — адресат" />
            <datalist id="dlvTakers">
              {[...(takers || []), ...(tos || [])].map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>

          <div className="dlv-tip" style={{ marginTop: 6 }}>
            Порожнє поле так і лишиться порожнім — це спосіб прибрати
            вписане помилково.
          </div>
        </div>
      )}

      {/* Дати етапів. Не звичайна правка описки: прибрана дата відкочує
          посилку на етап назад, дописана каже, що подія була тоді, коли
          її не було. Тому вони лише в головного, і сказано про це прямо. */}
      {item && chief && (
        <div style={{ marginTop: 16 }}>
          <label>Дати етапів</label>
          {DLV_STAGE_KEYS.map(([key, label]) => (
            <div className="dlv-who-f" key={key}>
              <span className="dlv-who-l">{label}</span>
              <input
                type="text"
                value={dates[key] || ''}
                onChange={(e) => setDates((p) => ({ ...p, [key]: e.target.value }))}
                placeholder="дд.мм.рррр гг:хх"
              />
            </div>
          ))}
          <div className="dlv-tip" style={{ marginTop: 6 }}>
            Порожня дата означає, що етапу не було — посилка повернеться на
            попередній. Написане не як дата просто не збережеться.
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Перехід на наступний етап. Питаємо рівно те, чого етап вимагає: водія
 * при передачі, точку й того, хто прийняв, — при доставці. Дата й час
 * ставляться самі: людина, яка щойно віддала коробку, не має ще й згадувати,
 * котра година.
 */
function DeliveryMove({ item, stage, transport, takers, points, me = '', onCancel, onSave }) {
  const [f, setF] = useState(() => ({
    driver: item.driver || '',
    point: item.point || '',
    /*
     * «Хто прийняв» — двічі різні люди, і поле одне.
     *
     * На точці вильоту посилку забирає той, хто повезе її далі дронами:
     * Лотар, БПС. На самому СП її отримує адресат — той, кому й везли.
     * Тому на точці підставлено те, що написав збирач (найчастіше забирає
     * саме той, кому й домовлялись), а при доставці — СП. Підставлене
     * лишається змінюваним: збіглося не завжди, і виправити це — один
     * дотик. Хто брав на точці, лишається в журналі.
     */
    taker: stage.key === 'delivered'
      ? (item.to || item.taker || '')
      : (stage.key === 'atbase' ? (item.taker || item.pilot || '') : ''),
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const needs = stage.needs || [];
  const picked = splitPoints(f.point);
  const parts = partsOf(item);
  // «Доставлено» закриє й невідмічені місця — про це треба сказати до, а не
  // після: якщо решта їде завтра, кнопку тиснути ще рано.
  const restLeft = stage.key === 'delivered' && parts && parts.left.length ? parts.left : null;

  return (
    <Modal
      title={stage.action}
      saveLabel="Підтвердити"
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        for (const n of needs) {
          if (!String(f[n] || '').trim()) {
            return setErr(n === 'driver' ? 'Вкажіть, чим відправляють'
              : n === 'point' ? 'Вкажіть точку' : 'Вкажіть, хто прийняв');
          }
        }
        setBusy(true); setErr('');
        try {
          /*
           * Надсилаємо тільки те, про що етап справді питав.
           *
           * Раніше йшло все поле форми цілком, і «хто прийняв»
           * підставлений з «Кому» записувався вже на «Передали» — на
           * картці стояло «прийняв Тигр» тоді, коли посилка ще їхала.
           *
           * На точці вильоту не питаємо нікого: там її приймають ті самі,
           * хто відправлятиме далі, і вони вже стоять у «хто відправляє».
           * Від етапу лишається дата й час — саме те, що ми як чергові й
           * відстежуємо.
           */
          const body = { driver: f.driver, point: f.point };
          // «Прийняв» пишеться на двох етапах із двох різних причин:
          // на точці вильоту — хто забрав, на СП — хто отримав
          if (stage.key === 'atbase' || stage.key === 'delivered') body.taker = f.taker;
          await onSave(body);
        }
        catch (e) { setErr(e.message); }
        finally { setBusy(false); }
      }}
    >
      <div className="dlv-mv">
        <div className="title-line">
          {item.to && <span className="id-badge">{item.to}</span>}
          <b>{item.what}</b>
          {item.weight !== null && <span className="count">{item.weight} кг</span>}
        </div>
        <p>{stage.hint}</p>
        {restLeft && (
          <p style={{ color: 'var(--amber)' }}>
            Ще не відмічено {restLeft.length} з {parts.total} місць: {restLeft.join(', ')}.
            Підтвердження закриє їх усі сьогоднішньою датою. Якщо вони поїдуть
            пізніше — закрийте вікно й відмітьте на картці лише те, що вже прибуло.
          </p>
        )}
      </div>

      {stage.key === 'atbase' && (
        <div style={{ marginTop: 10 }}>
          <label>Хто прийняв на точці вильоту</label>
          <div className="chips">
            {(takers || []).map((v) => (
              <div key={v} className={'chip' + (f.taker === v ? ' on' : '')}
                onClick={() => up('taker', f.taker === v ? '' : v)}>{v}</div>
            ))}
          </div>
          <input type="text" value={f.taker} style={{ marginTop: 8 }}
            onChange={(e) => up('taker', e.target.value)}
            placeholder="або впишіть свого" />
          <div className="dlv-tip" style={{ marginTop: 6 }}>
            Той, хто забрав посилку на точці й повезе її далі. Коли вона
            дійде до СП, тут стане адресат — а це лишиться в журналі.
          </div>
        </div>
      )}

      {needs.includes('driver') && (
        <div style={{ marginTop: 10 }}>
          {/* Не позивний, а транспорт: чим саме посилка їде на точку
              вильоту. Позивний того, хто її там забере, питаємо на
              наступному етапі. */}
          <label>Чим веземо до пілота</label>
          <div className="chips">
            {(transport || []).map((v) => (
              <div key={v} className={'chip' + (f.driver === v ? ' on' : '')}
                onClick={() => up('driver', f.driver === v ? '' : v)}>{v}</div>
            ))}
          </div>
          <input type="text" value={f.driver} style={{ marginTop: 8 }}
            onChange={(e) => up('driver', e.target.value)}
            placeholder="або впишіть своє" />
        </div>
      )}

      {needs.includes('point') && (
        <div style={{ marginTop: 10 }}>
          {/* Точок буває дві: один виліт часто закриває і Тигр, і Рись.
              Тому чипи з множинним вибором, а не одне поле — інакше
              доводиться згадувати, через що їх перелічувати. */}
          <label>Куди доставили{picked.length > 1 ? ` — ${picked.length} точки` : ''}</label>
          <div className="chips">
            {points.map((v) => (
              <div key={v}
                className={'chip' + (picked.includes(v) ? ' on' : '')}
                onClick={() => up('point', joinPoints(
                  picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]
                ))}
              >
                {v}
              </div>
            ))}
          </div>
          <input type="text" value={f.point} style={{ marginTop: 8 }}
            onChange={(e) => up('point', e.target.value)}
            placeholder="або впишіть свою: Тигр, Рись" />
        </div>
      )}

      {/* Хто прийняв — підставлений з «Кому»: посилку приймає адресат.
          Поле лишається відкритим, бо буває, що за нього розписався
          сусід по точці. */}
      {stage.key === 'delivered' && (
        <div style={{ marginTop: 10 }}>
          <label>
            Хто прийняв
            {f.taker && f.taker === item.to && <span className="dlv-you">адресат</span>}
          </label>
          <input type="text" value={f.taker} onChange={(e) => up('taker', e.target.value)}
            placeholder={picked.length > 1 ? 'позивні через кому' : 'позивний адресата'} />
          {!f.taker && (
            <div className="dlv-tip" style={{ marginTop: 6 }}>
              Впишіть, хто саме забрав. Ваш позивний сюди не підставляється:
              запис часто вносить не той, хто приймав.
            </div>
          )}
        </div>
      )}

      <div className="dlv-tip">
        {needs.length === 0
          ? 'Нічого вписувати не треба — просто підтвердіть.'
          : 'Дата й час проставляться самі.'}
      </div>
    </Modal>
  );
}

/**
 * Списання.
 *
 * Ящик розбили при завантаженні, виліт скасували назовсім, вантаж забрали
 * на іншу точку. Такого місця вже не буде — і поки його нема куди подіти,
 * воно або вдає доставлене, або вічно висить у «лишилось». Тут його
 * знімають з дороги, назвавши причину.
 */
function DeliveryLose({ item, whys = [], onCancel, onSave }) {
  const parts = partsOf(item);
  const gone = item.isLost;
  // списують те, що ще в дорозі: доставлене місце знімати нема сенсу
  const open = parts ? parts.items.filter((p) => !p.done || p.lost) : [];
  const [pick, setPick] = useState(() => (parts ? open.filter((p) => p.lost).map((p) => p.n) : []));
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const toggle = (n) => setPick((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  const undo = gone && (!parts || pick.length === 0);

  return (
    <Modal
      title={gone ? 'Повернути в дорогу' : 'Списати втрачене'}
      saveLabel={undo ? 'Повернути' : 'Списати'}
      onCancel={onCancel}
      busy={busy}
      error={err}
      onSave={async () => {
        if (!undo && parts && pick.length === 0) return setErr('Оберіть, які місця списати');
        setBusy(true); setErr('');
        try { await onSave({ parts: pick, why, undo }); }
        catch (e) { setErr(e.message); }
        finally { setBusy(false); }
      }}
    >
      <div className="dlv-mv">
        <div className="title-line">
          {item.to && <span className="id-badge">{item.to}</span>}
          <b>{item.what}</b>
        </div>
        <p>
          {gone && !parts
            ? 'Посилка повернеться в дорогу на той самий етап, де стояла.'
            : parts
              ? 'Відмітьте місця, яких не буде. Решта лишиться в дорозі — списання не закриває всю посилку.'
              : 'Посилка буде знята з дороги цілком.'}
        </p>
      </div>

      {parts && open.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <label>Що не доїде</label>
          <div className="chips">
            {open.map((p) => (
              <div key={p.n}
                className={'chip' + (pick.includes(p.n) ? ' on' : '')}
                onClick={() => toggle(p.n)}
              >
                {p.name}{p.kg !== null ? ` · ${p.kg} кг` : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {!undo && (
        <div style={{ marginTop: 10 }}>
          <label>Причина</label>
          <div className="chips">
            {whys.map((v) => (
              <div key={v} className={'chip' + (why === v ? ' on' : '')} onClick={() => setWhy(v)}>{v}</div>
            ))}
          </div>
          <input type="text" value={why} style={{ marginTop: 8 }}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="або своїми словами" />
        </div>
      )}

      <div className="dlv-tip">
        {undo
          ? 'Місця повернуться в «лишилось», наче списання не було.'
          : 'Списане не рахується ні в дорозі, ні в доставленому — воно піде окремим рядком «втрачено».'}
      </div>
    </Modal>
  );
}
