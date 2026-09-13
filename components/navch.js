/**
 * Світ «Навчання»: код, абетка, план і множення.
 *
 * Раніше все це лежало в `pages/me.js` разом із «Тілом» — сім тисяч
 * рядків в одному файлі. Такий файл не читають цілком, тож правлять
 * наосліп: знаходять потрібне пошуком і міняють, не бачачи сусіднього.
 *
 * Шов між світами виявився чистим: із сорока з гаком оголошень цього
 * блоку назовні потрібні рівно чотири вкладки, а ззовні сюди — сім
 * дрібниць, які тепер лежать у `components/util`. Тому воно й винесене
 * цілим шматком, без переписування: різати по готовому шву безпечніше,
 * ніж вигадувати новий.
 */
import { useState, useEffect, useRef } from 'react';

import {
  LESSONS, FACTS, RUN, FAST_SEC, keyOf, known, auto, runOf, tipFor, options, question, factOf,
  problems, slows, dayQueue, daily, dayStreak, hardest, hookFor, practiceDays, DAY_SIZE,
  QUICK_TILES, QUICK_SIZE, quickQueue, HARD, hardDone, stats, nextNew, NEW_PER_DAY,
  arcadeLevel, arcadeNext, ARCADE_LIVES, ARCADE_PER_LEVEL, ask, formFor,
  lessonFacts, freshFacts, partsOf, partMultipliers, modesOf,
  lessonProgress, partProgress, unlockedLessons,
  buildSession, partQueue, applyResults,
} from '../lib/mult';
import { CODE_LESSONS, TRACKS, openUpTo, courseStats, nextLink } from '../lib/code';
// DAY_SIZE тут своє — у множення воно теж є, і означає інше число
import {
  buildQueue, recallStats, nextLevel, pick as pickQuestion,
  DAY_SIZE as RECALL_SIZE,
} from '../lib/recall';
import { tokenize, modeOf, lineCount } from '../lib/highlight';
import { PLAN, COURSE, nextSteps, planProgress, lessonOf, tourOf } from '../lib/plan';
import {
  ABC, ABC_GROUPS, STATES, byGroup, abcProgress, suggestNext, cycleState, stateOf,
} from '../lib/abc';
import { changedOnly } from '../lib/patch';
import { FIELDS as PRACTICE_FIELDS, statsOf, freshIdeas } from '../lib/practice';
import { REF_GROUPS, REF_CARDS, findCards } from '../lib/ref';
import { TOURS, tourById } from '../lib/tour';
import { api, today, stamp, short, num, plural, plur } from './util';

/*
 * Лічильник уроків для шапки сторінки.
 *
 * Сторінці не потрібен увесь курс заради одного числа — досить двох
 * функцій. Інакше `pages/me.js` довелося б знову тягнути до себе
 * `lib/code`, і межа між світами почала б протікати з першої ж дрібниці.
 */
export const lessonsDone = (prog) => courseStats(prog || {}).done;
export const lessonsTotal = () => CODE_LESSONS.length;

/**
 * Тренажер таблиці множення й ділення.
 *
 * Урок — це одна таблиця, розбита на частини по три приклади. Частина
 * закривається за хвилину, і між ними видно рух; вісім прикладів за
 * підхід — це вже стіна, об яку розбивається бажання вчити.
 *
 * Приклад вважається вивченим, коли дався чотири рази поспіль. Умова навмисно
 * така, щоб її розумів той, хто вчить: «три зірочки» замість «рівень 4 з 5».
 */
export function MultTab({ data, reload, toast }) {
  const [prog, setProg] = useState(() => data.mult || {});
  const [view, setView] = useState({ s: 'lessons' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { setProg(data.mult || {}); }, [data.mult]);

  const open = unlockedLessons(prog);

  const done = FACTS.reduce((n, f) => n
    + (known(prog, f.key, 'mul') ? 1 : 0)
    + (known(prog, f.key, 'div') ? 1 : 0), 0);
  const total = FACTS.length * 2;
  const fastN = FACTS.reduce((n, f) => n
    + (auto(prog, f.key, 'mul') ? 1 : 0)
    + (auto(prog, f.key, 'div') ? 1 : 0), 0);
  const day = daily(prog, stamp(today()));
  const hard = hardest(prog, 5);
  const streak = dayStreak(prog, today());

  /*
   * Один запит у кінці підходу, а не після кожної відповіді: інакше
   * хвилинна квота Google скінчилась би на третьому прикладі.
   */
  const save = async (results, extra) => {
    const next = applyResults(prog, results, today());
    const patch = changedOnly(data.mult || {}, next);
    setProg(next);
    setSaving(true);
    try {
      await api('/api/health', { method: 'POST', body: { action: 'mult', mult: patch } });
      if (extra) await api('/api/health', { method: 'POST', body: { action: 'goals', goals: extra } });
      await reload();
    } catch (e) {
      toast('Не вдалося зберегти: ' + e.message);
    } finally { setSaving(false); }
    return next;
  };

  if (view.s === 'lesson') {
    return (
      <MultLesson
        lesson={view.lesson} prog={prog}
        onBack={() => setView({ s: 'lessons' })}
        onLook={(part, n) => setView({ s: 'look', lesson: view.lesson, part, n })}
        onDrill={(part, n) => setView({ s: 'drill', lesson: view.lesson, part, n })}
        onSession={() => setView({ s: 'drill', lesson: view.lesson, part: null })}
      />
    );
  }
  if (view.s === 'look') {
    return (
      <MultLook
        lesson={view.lesson} part={view.part} n={view.n}
        onStart={() => setView({ s: 'drill', lesson: view.lesson, part: view.part, n: view.n })}
        onBack={() => setView({ s: 'lesson', lesson: view.lesson })}
      />
    );
  }
  if (view.s === 'drill') {
    return (
      <MultDrill
        lesson={view.lesson} part={view.part} n={view.n} prog={prog}
        onBack={() => setView({ s: view.part ? 'lesson' : 'lessons', lesson: view.lesson })}
        onDone={async (results) => {
          const next = await save(results);
          const whole = lessonProgress(view.lesson, next) >= 1;
          setView(whole
            ? { s: 'win', lesson: view.lesson }
            : { s: view.part ? 'lesson' : 'lessons', lesson: view.lesson });
        }}
      />
    );
  }
  if (view.s === 'win') {
    return <MultWin lesson={view.lesson} onBack={() => setView({ s: 'lessons' })} />;
  }
  if (view.s === 'quick') {
    return (
      <MultQuick
        tile={view.tile}
        onBack={() => setView({ s: 'lessons' })}
        onDone={async (results) => { await save(results); setView({ s: 'lessons' }); }}
      />
    );
  }
  if (view.s === 'day') {
    return (
      <MultSpeed
        prog={prog} items={daily(prog, stamp(today())).all}
        onBack={() => setView({ s: 'lessons' })}
        onDone={async (results) => { await save(results); setView({ s: 'lessons' }); }}
      />
    );
  }
  if (view.s === 'arcade') {
    return (
      <MultArcade
        prog={prog} best={num(data.goals?.arcadeBest)}
        onBack={() => setView({ s: 'lessons' })}
        onDone={async (results, level) => {
          await save(results, {
            ...(data.goals || {}),
            arcadeBest: Math.max(num(data.goals?.arcadeBest), level),
          });
          setView({ s: 'lessons' });
        }}
      />
    );
  }

  return (
    <>
      {/* Вісім медалей за вісім таблиць. Кубок у кінці уроку зникає, а це
          лишається — видно і скільки пройдено, і скільки попереду. */}
      <div className="h-mt-medals">
        {LESSONS.filter((l) => l.kind === 'table').map((l) => (
          <span key={l.key} className={lessonProgress(l, prog) >= 1 ? 'is-on' : ''}>{l.table}</span>
        ))}
      </div>

      <div className="h-mt-top">
        <div className="h-cap">Вивчено прикладів</div>
        <div className="h-mt-big">{done}<span className="h-mt-of">/{total}</span></div>
        <div className="h-mt-bar"><i style={{ width: (total ? (done / total) * 100 : 0) + '%' }} /></div>
        <div className="h-mt-sub">
          {done === 0 ? 'Починайте з таблиці на 2 — далі кожен урок буде легшим за попередній.'
            : done >= total ? 'Уся таблиця вивчена. Лишилось довести до автоматизму.'
            : `Приклад вивчений, коли дався ${RUN} рази поспіль.`}
        </div>
        {done > 0 && (
          <>
            <div className="h-mt-two">
              <span><i>{fastN}</i> автоматом</span>
              {streak > 0 && <span><i>{streak}</i> {plur(streak, ['день', 'дні', 'днів'])} поспіль</span>}
            </div>
            {/* Два тижні крапками: пропуск видно одразу, і його не хочеться
                робити — це працює краще за будь-яке нагадування. */}
            <div className="h-mt-cal">
              {(() => {
                const was = new Set(practiceDays(prog));
                const p2 = (x) => String(x).padStart(2, '0');
                return [...Array(14)].map((_, k) => {
                  const d = new Date(stamp(today()) - (13 - k) * 86400000);
                  const key = `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
                  return <i key={key} className={was.has(key) ? 'is-on' : ''} title={key} />;
                });
              })()}
            </div>
          </>
        )}
      </div>

      {/*
        Одна кнопка на весь день. Розбирати самому, що зараз важливіше —
        помилки, повторення чи швидкість, — зайва робота: правильний
        порядок відомий заздалегідь, і його краще зібрати за людину.
      */}
      {done > 0 && (
        day.all.length > 0 ? (
          <button className={'h-mt-card' + (day.bad.length ? ' is-bad' : '')} onClick={() => setView({ s: 'day' })}>
            <span>Тренування дня</span>
            <span className="h-mt-card-b">
              {DAY_SIZE} питань · блоками по 5, кожен двічі
            </span>
            <span className="h-mt-card-b">
              {[
                day.fresh.length ? `${day.fresh.length} нових` : '',
                day.bad.length ? `${day.bad.length} з помилками` : '',
                day.rep.length ? `${day.rep.length} повторити` : '',
                day.slow.length ? `${day.slow.length} розігнати` : '',
                day.keep.length ? `${day.keep.length} закріпити` : '',
              ].filter(Boolean).join(' · ')}
            </span>
          </button>
        ) : (
          <div className="h-mt-clean">
            Поки нема чого повторювати — вивчіть перший урок, і тренування
            дня почне збиратись саме.
          </div>
        )
      )}

      {/*
        Повторити те, що сам вибрав.
        Уроки йдуть по черзі й відкриваються один за одним — це щоб вивчити
        з нуля. Але коли таблиця вже загалом відома, потрібне інше: ткнути
        «×7» і десять разів його проговорити, не питаючи дозволу. Тому
        плитки нічого не вимагають і ніколи не замкнені.
      */}
      {/*
        Аналітика. Не «скільки відсотків пройдено», а що саме зараз із
        таблицею: чого ще не бачив, що вчиться, що знаєш і що вже
        відповідається не думаючи. Чотири щаблі — і видно, куди рухається
        робота, а не лише те, скільки її лишилось.
      */}
      {(() => {
        const st = stats(prog);
        const next = nextNew(prog, NEW_PER_DAY);
        const parts = [
          ['auto', 'автомат', st.auto],
          ['known', 'знаю', st.known],
          ['learning', 'вчу', st.learning],
          ['new', 'не бачив', st.new],
        ];
        return (
          <>
            <div className="h-sec"><h3>Як справи</h3></div>
            <div className="h-mt-an">
              <div className="h-mt-an-bar">
                {parts.map(([k, , n]) => n > 0 && (
                  <i key={k} className={'is-' + k} style={{ flexGrow: n }} />
                ))}
              </div>
              <div className="h-mt-an-l">
                {parts.map(([k, label, n]) => (
                  <span key={k} className={'is-' + k}><b>{n}</b> {label}</span>
                ))}
              </div>
              <div className="h-mt-an-r">
                <span>Точність <b>{Math.round(st.accuracy * 100)}%</b>
                  {st.answers > 0 && <i> з {st.answers} відповідей</i>}</span>
                {st.timed > 0 && (
                  <span>Середній час <b>{st.avgTime.toFixed(1)} с</b>
                    <i> · до {FAST_SEC} с — {st.fast}</i></span>
                )}
              </div>
              {next.length > 0 && (
                <div className="h-mt-an-next">
                  Далі вчимо: <b>{next.map((x) => x.fact.key).join(', ')}</b>
                  {' — вони самі зʼявляться в тренуванні дня'}
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/*
        Важка дюжина. «Вивчено 12 із 72» — число чесне, але від нього руки
        опускаються; насправді більшість фактів закривається правилами, а
        пам'ятати доводиться дванадцять. До дванадцяти видимо близько.
      */}
      <div className="h-sec"><h3>Важка дюжина</h3></div>
      <button className="h-mt-doz" onClick={() => setView({ s: 'quick', tile: QUICK_TILES.find((t) => t.key === 'hard') })}>
        <span className="h-mt-doz-n">
          <b>{hardDone(prog)}</b> з {HARD.length}
        </span>
        <span className="h-mt-doz-g">
          {HARD.map((k) => (
            <i key={k} className={known(prog, k, 'mul') ? 'is-on' : ''}>{k}</i>
          ))}
        </span>
        <span className="h-mt-doz-c">
          Решта таблиці закривається правилами. Ці дванадцять доводиться
          саме памʼятати — вони й вирішують.
        </span>
      </button>

      <div className="h-sec"><h3>Повторити таблицю</h3></div>
      <div className="h-mt-tiles">
        {QUICK_TILES.map((t) => (
          <button key={t.key} className={'h-mt-tile' + (t.table ? '' : ' is-wide')}
            onClick={() => setView({ s: 'quick', tile: t })}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="h-mt-tiles-n">{QUICK_SIZE} прикладів · без таймера</div>

      <VoiceToggle />

      {done > 0 && (
        <button className="h-mt-arcade" onClick={() => setView({ s: 'arcade' })}>
          <span>🎮 Рівні</span>
          <span className="h-mt-quiz-b">
            {num(data.goals?.arcadeBest)
              ? `дійшли до ${num(data.goals.arcadeBest)}-го · лише вивчене, чистий рівень відкриває складніше`
              : 'лише вивчене · чистий рівень відкриває складніше'}
          </span>
        </button>
      )}

      <div className="h-sec"><h3>Уроки</h3></div>
      <div className="h-mt-steps">
        {LESSONS.map((l, i) => {
          const pct = Math.round(lessonProgress(l, prog) * 100);
          const locked = !open[i];
          const all = lessonFacts(l).length;
          const fresh = freshFacts(l).filter((f) => !known(prog, f.key, modesOf(l)[0])).length;
          return (
            <button
              key={l.key}
              className={'h-mt-step' + (locked ? ' is-lock' : '') + (pct === 100 ? ' is-done' : '')}
              disabled={locked}
              onClick={() => setView({ s: 'lesson', lesson: l })}
            >
              <span className="h-mt-step-h">
                <span className="h-mt-n">{pct === 100 ? '✓' : i + 1}</span>
                <span className="h-mt-title">{l.title}</span>
                <span className="h-mt-pct">{locked ? '🔒' : pct + '%'}</span>
              </span>
              <span className="h-mt-bar"><i style={{ width: pct + '%' }} /></span>
              <span className="h-mt-meta">
                {locked ? 'Спершу пройдіть попередній урок'
                  : l.kind !== 'table' ? `${all} прикладів`
                  : fresh > 0
                    ? `${fresh} ${plur(fresh, ['новий', 'нові', 'нових'])} · ${all - fresh} на повторення`
                    : `${all} прикладів на повторення`}
              </span>
            </button>
          );
        })}
      </div>

      {hard.length > 0 && (
        <>
          <div className="h-sec"><h3>Найважче саме вам</h3></div>
          <div className="h-mt-hard">
            {hard.map((h) => (
              <div key={h.fact.key + h.mode} className={h.done ? 'is-done' : ''}>
                <span className="h-mt-hard-q">
                  {h.mode === 'div'
                    ? `${h.fact.a * h.fact.b} ÷ ${h.fact.a} = ${h.fact.b}`
                    : `${h.fact.a} × ${h.fact.b} = ${h.fact.a * h.fact.b}`}
                </span>
                <span className="h-mt-hard-n">
                  {h.done ? 'закрито' : `${h.bad} ${plur(h.bad, ['промах', 'промахи', 'промахів'])}`}
                </span>
                {hookFor(h.fact.key) && <span className="h-mt-hard-h">{hookFor(h.fact.key)}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="h-sec"><h3>Що вже знаю</h3></div>
      <MultGrid prog={prog} />
      {saving && <div className="h-hint">Зберігаю прогрес…</div>}
    </>
  );
}

/** Уся таблиця однією картинкою: видно, де діри */
function MultGrid({ prog }) {
  const nums = [2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <div className="h-mt-grid-w">
      <table className="h-mt-grid">
        <thead>
          <tr><th />{nums.map((n) => <th key={n}>{n}</th>)}</tr>
        </thead>
        <tbody>
          {nums.map((a) => (
            <tr key={a}>
              <th>{a}</th>
              {nums.map((b) => {
                const k = keyOf(a, b);
                const run = runOf(prog, k, 'mul');
                const cls = known(prog, k, 'mul') ? 'is-known' : run > 0 ? 'is-now' : '';
                return (
                  <td
                    key={b}
                    className={cls + (known(prog, k, 'div') ? ' has-div' : '')}
                    title={`${a} × ${b} = ${a * b}\nмноження: ${run}/${RUN} поспіль\nділення: ${runOf(prog, k, 'div')}/${RUN}`}
                  >
                    {a * b}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="h-mt-leg">
        <span><i /> не вчили</span>
        <span><i className="is-now" /> вчимо</span>
        <span><i className="is-known" /> знаю</span>
        <span><i className="is-known has-div" /> і ділення</span>
      </div>
    </div>
  );
}

/** Урок: правило й список частин по три приклади */
function MultLesson({ lesson, prog, onBack, onLook, onDrill, onSession }) {
  const parts = partsOf(lesson);
  const table = lesson.kind === 'table';

  return (
    <>
      <div className="h-mt-learn-h">
        <button className="h-link" onClick={onBack}>← Уроки</button>
        <h2>{lesson.title}</h2>
      </div>

      <div className="h-mt-rule"><b>Правило</b>{lesson.rule}</div>

      {!table ? (
        <div className="h-addbar">
          <button className="h-add" onClick={onSession}>Тренувати →</button>
        </div>
      ) : (
        <>
          <div className="h-sec"><h3>Частини</h3></div>
          <div className="h-mt-parts">
            {parts.map((part, n) => {
              const pct = Math.round(partProgress(lesson, part, prog) * 100);
              const ready = pct === 100;
              return (
                <div key={n} className={'h-mt-part' + (ready ? ' is-done' : '')}>
                  <span className="h-mt-part-i">{ready ? '✓' : n + 1}</span>
                  <span className="h-mt-part-t">
                    <b>Частина {n + 1} з {parts.length}</b>
                    <i>{part.map((f) => `${lesson.table}×${f.a === lesson.table ? f.b : f.a}`).join(' · ')}</i>
                  </span>
                  <span className="h-mt-part-a">
                    <button className="h-btn" onClick={() => onLook(part, n)}>Подивись</button>
                    <button className={'h-btn' + (ready ? '' : ' h-btn-p')} onClick={() => onDrill(part, n)}>
                      {ready ? 'Повторити' : 'Відповідати'}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/**
 * «Подивись»: приклад показаний крапками й числовою стрічкою. Множення —
 * це повторне додавання, і поки це видно очима, запам'ятовувати доводиться
 * набагато менше.
 */
function MultLook({ lesson, part, n, onStart, onBack }) {
  const mults = partMultipliers(lesson, part);
  const [i, setI] = useState(0);
  const b = mults[i];
  const t = lesson.table;

  return (
    <div className="h-mt-look">
      <div className="h-mt-learn-h">
        <button className="h-link" onClick={onBack}>← Частини</button>
        <h2>Частина {n + 1}</h2>
      </div>

      <div className="h-mt-shot">
        <div className="h-mt-eqbig">{t} × {b} = <b>{t * b}</b></div>

        {/* Прямокутник замість купок по t. Купки показують, що множення —
            це додавання; прямокутник показує ще й як дійти до відповіді,
            не перелічуючи все з початку: п'ять стовпчиків і решта. */}
        <FactArray a={t} b={b} />

        <div className="h-mt-line">
          <div className="h-cap">Додавай по {t}</div>
          <div className="h-mt-chips">
            {[...Array(9)].map((_, k) => {
              const v = t * (k + 1);
              return (
                <span key={k} className={k + 1 === b ? 'is-now' : k + 1 < b ? 'is-past' : ''}>{v}</span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="h-mt-look-a">
        {i > 0 && <button className="h-btn" onClick={() => setI(i - 1)}>← Назад</button>}
        {i < mults.length - 1
          ? <button className="h-add" onClick={() => setI(i + 1)}>Далі →</button>
          : <button className="h-add" onClick={onStart}>Твоя черга →</button>}
      </div>
    </div>
  );
}

/**
 * Відповіді.
 *
 * У частині питаємо, доки кожен приклад не дасться чотири рази поспіль — це
 * й означає «вивчив». Помилка обнуляє серію: «знаю» — це коли не
 * помиляєшся, а не коли вгадав більше разів, ніж не вгадав.
 *
 * Варіантів три, і всі з тієї ж таблиці. Іноді пропуск стоїть ліворуч:
 * «▢ = 2 × 8». Це ламає звичку читати зліва направо й писати відповідь у
 * кінці — знак «дорівнює» означає «стільки ж», а не «зараз буде результат».
 */
function MultDrill({ lesson, part, n, prog, onBack, onDone }) {
  const mode = part ? 'part' : 'session';
  const [pool] = useState(() => (part ? partQueue(lesson, part) : null));
  const [queue] = useState(() => (part ? null : buildSession(lesson, prog, 12)));

  const [runs, setRuns] = useState(() => {
    const r = {};
    if (pool) pool.forEach((x) => { r[x.fact.key + x.mode] = 0; });
    return r;
  });
  /*
   * Відповіді й серії живуть у ref, а не лише в стані. Правильну відповідь
   * гортає setTimeout, а він тримає значення з того рендера, коли на неї
   * натиснули — тобто без неї самої. Через це остання відповідь підходу
   * губилась, і частина не закривалась, хоча всі приклади вже дались.
   */
  const resRef = useRef([]);
  const runRef = useRef(null);
  if (runRef.current === null) {
    runRef.current = {};
    if (pool) pool.forEach((x) => { runRef.current[x.fact.key + x.mode] = 0; });
  }
  const [q, setQ] = useState(() => (part ? nextFrom(pool, {}, null) : null));
  const [i, setI] = useState(0);
  const [fix, setFix] = useState(null);
  const [opts, setOpts] = useState([]);
  const [picked, setPicked] = useState(null);
  const [results, setResults] = useState([]);
  const started = useRef(Date.now());

  // перше питання й кожне наступне: варіанти рахуються один раз на питання
  const cur = (part || fix) ? q : queue?.[i];

  useEffect(() => {
    if (!cur) return;
    // «правда-неправда» й «що більше» малюють свої кнопки самі — числових
    // варіантів у них немає, і рахувати їх нема з чого
    setOpts(cur.kind === 'tf' || cur.kind === 'cmp'
      ? null
      : options(cur, lesson.kind === 'table' ? lesson.table : 0));
    setPicked(null);
    started.current = Date.now();
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps

  const need = fix ? FIXRUN : RUN;
  const total = fix ? fix.length * FIXRUN : part ? pool.length * RUN : queue.length;
  const doneRuns = (part || fix)
    ? Object.values(runs).reduce((s, v) => s + Math.min(v, need), 0)
    : i;

  if (!cur) {
    return (
      <div className="h-mt-drill">
        <div className="h-mt-drill-h"><button className="h-link" onClick={onBack}>← Вийти</button></div>
        <div className="h-empty">Тут поки нема чого питати.</div>
      </div>
    );
  }

  const answer = (v) => {
    if (picked !== null) return;
    const right = v === cur.answer;
    const k = cur.key + cur.mode;
    resRef.current = [...resRef.current, {
      key: cur.key, mode: cur.mode, right, ms: Date.now() - started.current,
      text: cur.text, answer: cur.answer,
    }];
    if (part || fix) runRef.current = { ...runRef.current, [k]: right ? (runRef.current[k] || 0) + 1 : 0 };
    sayFact(cur);
    setPicked(v);
    setResults(resRef.current);
    setRuns(runRef.current);
    // Правильну пропускаємо самі — пауза рівно щоб побачити зелене.
    // Помилку не пропускаємо: правильне число має бути прочитане.
    if (right) setTimeout(step, 500);
  };

  function step() {
    if (part || fix) {
      const p = fix || pool;
      const need = fix ? FIXRUN : RUN;
      const nxt = nextFrom(p, runRef.current, cur.key, need);
      if (!nxt) return onDone(resRef.current);
      setQ(nxt);
      return;
    }
    if (i + 1 >= queue.length) {
      /*
       * Черга скінчилась, але помилки лишились. Проїхати повз них —
       * значить закріпити саме те, що не вийшло: наступного разу приклад
       * трапиться нескоро, а помилковий слід уже ліг. Тому одразу коло
       * доробки — кожен завалений приклад, доки не дасться двічі поспіль.
       */
      const wrong = [];
      const seen = new Set();
      resRef.current.forEach((r) => {
        if (r.right) return;
        const k = r.key + r.mode;
        if (seen.has(k)) return;
        seen.add(k);
        const [x, y] = r.key.split('×').map(Number);
        wrong.push({ fact: { a: x, b: y, key: r.key }, mode: r.mode });
      });
      if (wrong.length) {
        const r0 = {};
        wrong.forEach((w) => { r0[w.fact.key + w.mode] = 0; });
        runRef.current = r0;
        setRuns(r0);
        setFix(wrong);
        setQ(nextFrom(wrong, r0, null, FIXRUN));
        return;
      }
      return onDone(resRef.current);
    }
    setI(i + 1);
  }

  return (
    <div className="h-mt-drill">
      <div className="h-mt-drill-h">
        <button className="h-link" onClick={onBack}>← Вийти</button>
        <span className="h-mt-where">
          {fix ? 'Робота над помилками' : part ? `Частина ${n + 1}` : lesson.title}
        </span>
      </div>

      <div className="h-mt-bar"><i style={{ width: Math.min(100, (doneRuns / total) * 100) + '%' }} /></div>

      {(part || fix) && (
        <div className="h-mt-stars">
          {[...Array(need)].map((_, k) => (
            <i key={k} className={k < (runs[cur.key + cur.mode] || 0) ? 'is-on' : ''}>★</i>
          ))}
        </div>
      )}

      {/*
        Питання показує AskBox — той самий, що в тренуванні дня й аркаді.
        Раніше урок малював рядок і варіанти сам, і це працювало доти, доки
        траплялись самі лише звичайні приклади. «Правда-неправда» й «що
        більше» приходили сюди з відповіддю true чи «eq» замість числа:
        рядок виходив порожній, а серед кнопок стояла порожня.
      */}
      <AskBox q={cur} state={picked === null ? '' : picked === cur.answer ? 'right' : 'wrong'}
        typed={picked === null ? '' : String(picked)}
        opts={opts} onAnswer={answer} disabled={picked !== null} />

      {picked !== null && picked !== cur.answer && (
        <div className="h-mt-fb">
          <div className="h-mt-fb-t">Не так. Правильно: <b>{answerLabel(cur)}</b></div>
          {(() => {
            // Зачіпка краща за обчислення: поки приклад рахують, його не
            // памʼятають. Якщо зачіпки немає — показуємо, як порахувати.
            const hook = hookFor(cur.key);
            if (hook) return <div className="h-mt-fb-h">💡 {hook}</div>;
            if (lesson.kind === 'table' && cur.mode === 'mul') {
              const [x, y] = cur.key.split('×').map(Number);
              return <div className="h-mt-fb-h">💡 {tipFor(lesson.table, x === lesson.table ? y : x)}</div>;
            }
            return null;
          })()}
          {/* і сам приклад прямокутником: слова пояснюють, картинка показує */}
          <FactArray {...factOf(cur.key)} small />
          <button className="h-add" onClick={() => step()}>Далі →</button>
        </div>
      )}
    </div>
  );
}

/**
 * Питання будь-якого виду — одним компонентом.
 *
 * Раніше кожен режим малював свій екран, і додати новий вид питання
 * означало правити три місця. Тепер вид описується в даних, а показує його
 * одне місце: і в тренуванні дня, і в аркаді питання виглядають однаково,
 * бо це буквально той самий код.
 */
/* ---------- Голос ---------- */

/**
 * Приклад, сказаний уголос.
 *
 * Прочитане очима й почуте вухами лягають у різну памʼять, і та, що чує,
 * у таблиці працює краще: «сім на вісім — пʼятдесят шість» згадується
 * ритмом, як рядок вірша, а не як картинка. Саме тому таблицю споконвіку
 * промовляли вголос, а не переписували.
 *
 * Синтез мовлення вбудований у браузер — ні ключів, ні мережі, ні
 * бібліотек. Українського голосу може не бути; тоді просто мовчимо, бо
 * читати українські слова англійським голосом гірше, ніж не читати.
 */
const SAY_KEY = 'oblik_mult_voice';

function voiceOk() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Чим говорити. Українського голосу в системі може не бути — на iOS його
 * треба окремо завантажити. Тоді беремо будь-який слов'янський: числа
 * ним читаються зрозуміло, а мовчати гірше, ніж мати легкий акцент.
 */
function ukVoice() {
  const all = window.speechSynthesis.getVoices() || [];
  return all.find((v) => /^uk/i.test(v.lang))
    || all.find((v) => /^(ru|be|pl)/i.test(v.lang))
    || all.find((v) => v.default)
    || all[0]
    || null;
}

function say(text) {
  if (!voiceOk()) return;
  const v = ukVoice();
  const u = new SpeechSynthesisUtterance(text);
  if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = 0.95;
  // нове питання перебиває попереднє: черга з десяти прикладів, які
  // дочитуються вже після того, як ви відповіли, — це не допомога
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/*
 * Прапорець читаємо просто зі сховища, а не тягнемо пропсом крізь п'ять
 * компонентів: це налаштування, яке нікого, крім самого голосу, не
 * стосується.
 */
const voiceOn = () => typeof window !== 'undefined' && localStorage.getItem(SAY_KEY) === '1';

/** «7×8» уголос: саме як приклад, а не як два числа поспіль */
function sayFact(q) {
  if (!q || !voiceOn()) return;
  if (q.kind && q.kind !== 'pick') return;
  const [x, y] = String(q.key).split('×').map(Number);
  if (!x || !y) return;
  if (q.mode === 'div') say(`${x * y} поділити на ${x} — ${y}`);
  else say(`${x} на ${y} — ${x * y}`);
}

/**
 * Вмикач голосу. Стоїть поруч із тренуваннями, а не в налаштуваннях: його
 * вмикають і вимикають залежно від того, де ви зараз — самі вдома чи в
 * кімнаті, де сплять.
 */
function VoiceToggle() {
  const [on, setOn] = useState(false);
  const [has, setHas] = useState(true);
  const [uk, setUk] = useState(true);

  useEffect(() => {
    if (!voiceOk()) { setHas(false); return; }
    setOn(voiceOn());
    // у частині браузерів список голосів приходить не одразу
    const check = () => {
      const all = window.speechSynthesis.getVoices() || [];
      setHas(all.length > 0);
      setUk(all.some((v) => /^uk/i.test(v.lang)));
    };
    check();
    window.speechSynthesis.addEventListener?.('voiceschanged', check);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', check);
  }, []);

  if (!has) return null;

  return (
    <button
      className={'h-mt-voice' + (on ? ' is-on' : '')}
      onClick={() => {
        const next = !on;
        localStorage.setItem(SAY_KEY, next ? '1' : '0');
        setOn(next);
        if (next) say('сім на вісім — пʼятдесят шість');
      }}
    >
      {on ? '🔊 Голос увімкнено' : '🔇 Голос вимкнено'}
      <span>
        {uk
          ? 'приклад звучить уголос — вухами таблиця вчиться краще'
          : 'українського голосу в системі немає, читає той, що є. '
            + 'iPhone: Налаштування → Універсальний доступ → Вимовляння → Голоси'}
      </span>
    </button>
  );
}

/**
 * Приклад як прямокутник, розрізаний по п'ятірці.
 *
 * Уся решта тренажера символьна: 7 × 8 — це два знаки й відповідь, яку
 * або згадав, або ні. Прямокутник із 56 крапок, розрізаний на 7×5 і 7×3,
 * показує, чому саме 56, і — головне — дає спосіб дійти до відповіді,
 * коли вона не спливла: 35 і ще 21.
 *
 * Ріжемо завжди по п'ятірці, хоч для дев'ятки й зручніше «десять мінус
 * одне». Один інструмент, застосовний до всього, кращий за вісім різних:
 * його встигаєш дістати, поки згадуєш, який із восьми тут потрібен.
 */
function FactArray({ a, b, small }) {
  // рядків беремо менший множник: прямокутник виходить широким, а не
  // високим, і на телефоні його видно цілком
  const rows = Math.min(a, b);
  const cols = Math.max(a, b);
  const cut = cols > 5 ? 5 : 0;
  const rest = cols - cut;

  const block = (n, cls) => (
    <div className={'h-fa-b ' + cls} style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      {[...Array(rows * n)].map((_, k) => <i key={k} />)}
    </div>
  );

  return (
    <div className={'h-fa' + (small ? ' is-small' : '')}>
      <div className="h-fa-pair">
        {cut ? (
          <>
            {block(cut, 'is-one')}
            <span className="h-fa-plus">+</span>
            {block(rest, 'is-two')}
          </>
        ) : block(cols, 'is-one')}
      </div>
      {/* Рядок суми потрібен рівно там, де є що розкладати. Коли множник
          не більший за п'ять, прямокутник видно цілком — і «2 × 2 = 4» під
          таким самим написом угорі лише займає місце. */}
      {cut > 0 && (
        <>
          <div className="h-fa-sum">
            <b className="is-one">{rows * cut}</b>
            <span>+</span>
            <b className="is-two">{rows * rest}</b>
            <span>=</span>
            <b>{a * b}</b>
          </div>
          <div className="h-fa-n">
            {rows} × {cut} = {rows * cut} · {rows} × {rest} = {rows * rest}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Правильна відповідь словами. У звичайного прикладу це число, у
 * «правда-неправда» — так чи ні, у порівняння — сам вираз: показати там
 * `true` означає не показати нічого.
 */
function answerLabel(q) {
  if (q.kind === 'tf') return q.answer ? 'правда' : 'неправда';
  if (q.kind === 'cmp') return q.answer === 'eq' ? 'порівну' : q.answer === 'left' ? q.left : q.right;
  return q.answer;
}

function AskBox({ q, state, typed, opts, onAnswer, disabled, quad }) {
  if (q.kind === 'tf') {
    return (
      <>
        <div className={'h-mt-qbox' + (state ? ' is-' + state : '')}>
          <div className="h-mt-tf-q">{q.shown}</div>
          <div className="h-mt-tf-c">Це правда?</div>
        </div>
        <div className="h-mt-tf">
          <button className="h-mt-tf-b is-no" onClick={() => onAnswer(false)} disabled={disabled}>✗</button>
          <button className="h-mt-tf-b is-yes" onClick={() => onAnswer(true)} disabled={disabled}>✓</button>
        </div>
      </>
    );
  }

  if (q.kind === 'cmp') {
    return (
      <>
        <div className={'h-mt-qbox' + (state ? ' is-' + state : '')}>
          <div className="h-mt-tf-c">Що більше?</div>
        </div>
        <div className="h-mt-opts">
          <button className="h-mt-opt" onClick={() => onAnswer('left')} disabled={disabled}>{q.left}</button>
          <button className="h-mt-opt is-eq" onClick={() => onAnswer('eq')} disabled={disabled}>порівну</button>
          <button className="h-mt-opt" onClick={() => onAnswer('right')} disabled={disabled}>{q.right}</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={'h-mt-qbox' + (state ? ' is-' + state : '')}>
        <QLine q={q} shown={typed} state={state === 'right' ? 'ok' : state === 'wrong' ? 'bad' : ''} />
      </div>
      {opts && (
        // чотири варіанти йдуть сіткою 2×2: так кнопки вдвічі більші й обидві
        // колонки дістаються великим пальцем, не переставляючи телефон
        <div className={'h-mt-opts' + (quad ? ' is-quad' : '')}>
          {opts.map((o) => (
            <button key={o}
              className={'h-mt-opt' + (state ? (o === q.answer ? ' is-ok' : String(o) === String(typed) ? ' is-bad' : ' is-dim') : '')}
              onClick={() => onAnswer(o)} disabled={disabled}>{o}</button>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Рядок питання. Пропуск стоїть або на місці відповіді («▢ = 6 × 7»), або
 * посередині («6 × ▢ = 42»). Друга форма питає не «порахуй», а «добери» —
 * це інша дія, вона ж наступний крок до ділення й до рівнянь.
 */
function QLine({ q, shown, state }) {
  return (
    <div className="h-mt-q2">
      {q.pre && <span className="h-mt-nums">{q.pre}</span>}
      <span className={'h-mt-blank' + (state ? ' is-' + state : '')}>{shown || ''}</span>
      <span className="h-mt-nums">{q.post}</span>
    </div>
  );
}

/** У колі доробки трохи менше, ніж при вивченні: приклад уже знайомий */
const FIXRUN = 3;

/**
 * Наступний приклад частини: той, у якого серія найкоротша, і не той
 * самий, що щойно був — інакше відповідь просто списується з екрана.
 */
function nextFrom(pool, runs, prevKey, need = RUN) {
  const left = pool.filter((x) => (runs[x.fact.key + x.mode] || 0) < need);
  if (!left.length) return null;
  const other = left.filter((x) => x.fact.key !== prevKey);
  const from = other.length ? other : left;
  const min = Math.min(...from.map((x) => runs[x.fact.key + x.mode] || 0));
  const cand = from.filter((x) => (runs[x.fact.key + x.mode] || 0) === min);
  const pick = cand[Math.floor(Math.random() * cand.length)];
  return question(pick.fact, pick.mode);
}

/** Кубок за таблицю — урок має мати кінець, і кінець має бути видно */
function MultWin({ lesson, onBack }) {
  return (
    <div className="h-mt-win">
      <div className="h-mt-cup">🏆</div>
      <h2>{lesson.kind === 'table' ? `Таблиця на ${lesson.table} вивчена!` : lesson.title + ' — пройдено!'}</h2>
      <p>
        {lesson.kind === 'table'
          ? 'Наступний урок буде легшим: частина прикладів у ньому вже ваша.'
          : 'Спробуйте вікторину на час — там усе разом і на швидкість.'}
      </p>
      <button className="h-add" onClick={onBack}>Далі →</button>
    </div>
  );
}

/**
 * Розгін: ті самі приклади, але з вводом замість вибору.
 *
 * Вибрати з трьох — це впізнати; набрати — згадати. Різні дії й різна
 * памʼять: у контрольній ніхто не пропонує варіантів. Тому останній щабель
 * саме такий, і саме тут вимірюється час: приклад вважається доведеним до
 * автоматизму, коли відповідь приходить швидше ніж за три секунди.
 */
function MultSpeed({ prog, items, onBack, onDone }) {
  const [queue] = useState(() => dayQueue(items, DAY_SIZE));
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const [state, setState] = useState('ask');
  const started = useRef(Date.now());
  const resRef = useRef([]);
  const [results, setResults] = useState([]);

  const cur = queue[i];

  useEffect(() => { started.current = Date.now(); setTyped(''); setState('ask'); }, [i]);

  if (!queue.length) {
    return (
      <div className="h-empty">
        Нема чого розганяти — спершу вивчіть хоч одну таблицю.{' '}
        <button className="h-link" onClick={onBack}>Назад</button>
      </div>
    );
  }

  if (i >= queue.length) {
    const fastN = resRef.current.filter((r) => r.right && r.ms <= FAST_SEC * 1000).length;
    return (
      <div className="h-mt-win">
        <div className="h-mt-cup">{fastN === resRef.current.length ? '⚡' : '⏱'}</div>
        <h2>{fastN} з {resRef.current.length} — швидко</h2>
        <p>
          Швидко — це до {FAST_SEC} секунд. Повільна правильна відповідь означає,
          що приклад рахують, а не памʼятають; такі повернуться сюди ще раз.
        </p>
        <button className="h-add" onClick={() => onDone(resRef.current)}>Зберегти й вийти</button>
      </div>
    );
  }

  const commit = (t) => {
    if (state !== 'ask') return;
    const ms = Date.now() - started.current;
    const right = cur.kind === 'pick' ? Number(t) === cur.answer : t === cur.answer;
    resRef.current = [...resRef.current, {
      key: cur.key, mode: cur.mode, right, ms, text: cur.text, answer: cur.answer,
    }];
    setResults(resRef.current);
    setState(right ? 'right' : 'wrong');
    if (right) setTimeout(() => setI((x) => x + 1), 380);
  };

  const press = (d) => {
    if (state !== 'ask') return;
    const t = (typed + d).slice(0, 3);
    setTyped(t);
    // Зараховуємо, щойно набрано стільки цифр, скільки в правильній
    // відповіді: окреме «готово» на кожен приклад — це зайвий дотик,
    // помножений на дванадцять.
    if (t.length >= String(cur.answer).length) setTimeout(() => commit(t), 50);
  };

  return (
    <div className="h-mt-drill">
      <div className="h-mt-drill-h">
        <button className="h-link" onClick={onBack}>← Вийти</button>
        <span className="h-mt-where">{i + 1} з {queue.length}</span>
      </div>
      <div className="h-mt-bar"><i style={{ width: (i / queue.length) * 100 + '%' }} /></div>

      <AskBox q={cur} state={state === 'right' ? 'right' : state === 'wrong' ? 'wrong' : ''}
        typed={typed} onAnswer={(v) => commit(v)} disabled={state !== 'ask'} />

      {state === 'wrong' ? (
        <div className="h-mt-fb">
          <div className="h-mt-fb-t">
            Не так. {cur.kind === 'pick' ? 'Правильно:' : 'Тут'} <b>{answerLabel(cur)}</b>
          </div>
          {hookFor(cur.key) && <div className="h-mt-fb-h">💡 {hookFor(cur.key)}</div>}
          <button className="h-add" onClick={() => setI(i + 1)}>Далі →</button>
        </div>
      ) : cur.kind === 'pick' ? (
        <div className="h-mt-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button key={d} onClick={() => press(String(d))} disabled={state !== 'ask'}>{d}</button>
          ))}
          <button className="is-soft" onClick={() => setTyped('')} disabled={state !== 'ask'}>С</button>
          <button onClick={() => press('0')} disabled={state !== 'ask'}>0</button>
          <button className="is-soft" onClick={() => setTyped((t) => t.slice(0, -1))} disabled={state !== 'ask'}>⌫</button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Швидкий повтор обраної таблиці.
 *
 * Найпростіший екран у тренажері, і це навмисно: питання, чотири великі
 * кнопки, лічильники правильних і промахів. Ні таймера, ні життів, ні
 * кнопки «далі» — відповів і поїхали. Саме така вправа виходить, коли є
 * вільна хвилина й немає бажання розбиратися, чого від тебе хочуть.
 *
 * Помилка не зупиняє: правильна відповідь підсвічується, під нею зачіпка,
 * і за півтори секунди йде наступне питання. Тиснути нічого не треба —
 * інакше половина повтору перетворюється на натискання «далі».
 */
function MultQuick({ tile, onBack, onDone }) {
  const [queue] = useState(() => quickQueue(tile, QUICK_SIZE));
  const [i, setI] = useState(0);
  const [opts, setOpts] = useState([]);
  const [picked, setPicked] = useState(null);
  const [state, setState] = useState('ask');
  const started = useRef(Date.now());
  const resRef = useRef([]);
  const cur = queue[i];

  useEffect(() => {
    if (!cur) return;
    setOpts(options(cur, tile.table, 4));
    setPicked(null);
    setState('ask');
    started.current = Date.now();
  }, [i]);

  if (!queue.length) {
    return <div className="h-empty">Нема чого повторювати. <button className="h-link" onClick={onBack}>Назад</button></div>;
  }

  const ok = resRef.current.filter((r) => r.right).length;
  const bad = resRef.current.length - ok;

  if (i >= queue.length) {
    return (
      <div className="h-mt-win">
        <div className="h-mt-cup">{bad === 0 ? '🏆' : ok >= queue.length - 2 ? '👍' : '🔁'}</div>
        <h2>{ok} з {queue.length}</h2>
        <p>
          {bad === 0
            ? 'Без жодного промаху. Саме так це й має відповідатись.'
            : `Промахів ${bad} — вони самі повернуться в тренування дня.`}
        </p>
        <button className="h-add" onClick={() => onDone(resRef.current)}>Зберегти й вийти</button>
      </div>
    );
  }

  const answer = (v) => {
    if (state !== 'ask') return;
    const right = v === cur.answer;
    resRef.current = [...resRef.current, {
      key: cur.key, mode: cur.mode, right,
      ms: Date.now() - started.current, text: cur.text, answer: cur.answer,
    }];
    setPicked(v);
    setState(right ? 'right' : 'wrong');
    // промах озвучуємо теж — саме тоді почути правильну відповідь
    // найкорисніше
    sayFact(cur);
    // Правильну гортаємо самі — пауза рівно щоб побачити зелене. Промах
    // не гортаємо: під ним стоїть розбір із прямокутником, і поки його
    // читають, екран не має тікати. Далі — коли людина сама скаже.
    if (right) setTimeout(() => setI((x) => x + 1), 520);
  };

  return (
    <div className="h-mt-drill">
      <div className="h-mt-drill-h">
        <button className="h-link" onClick={onBack}>← Вийти</button>
        <span className="h-mt-where">{i + 1} з {queue.length}</span>
        <span className="h-mt-tally">
          <b className="is-ok">{ok}</b>
          <b className="is-bad">{bad}</b>
        </span>
      </div>
      <div className="h-mt-bar"><i style={{ width: (i / queue.length) * 100 + '%' }} /></div>

      <AskBox q={cur} state={state === 'ask' ? '' : state}
        typed={picked === null ? '' : String(picked)}
        opts={opts} quad onAnswer={answer} disabled={state !== 'ask'} />

      {state === 'wrong' && (
        <div className="h-mt-fb">
          <div className="h-mt-fb-t">Не так. Правильно: <b>{cur.answer}</b></div>
          {hookFor(cur.key) && <div className="h-mt-fb-h">💡 {hookFor(cur.key)}</div>}
          <FactArray {...factOf(cur.key)} small />
          <button className="h-add" onClick={() => setI(i + 1)}>Далі →</button>
        </div>
      )}
    </div>
  );
}

/**
 * Аркада: гра «доки не програєш».
 *
 * Три життя, рівень із десяти правильних, і з кожним рівнем менше часу на
 * відповідь. Сенс не в змаганні: у звичайному підході людина сама вирішує,
 * коли їй досить, і зупиняється рівно там, де стало трохи важко. Тут
 * зупиняє гра — і тому повторів виходить утричі більше, ніж збирався
 * зробити той, хто заходив «просто повторити».
 *
 * Матеріал — саме вивчене: гра тут для того, щоб довести до блиску те, що
 * вже знаєш. Невивчене підмішується лише після рівня, закритого без жодного
 * промаху, — і теж лише з відкритих уроків: кидати 8×8 тому, хто дійшов до
 * п'ятірки, нечесно.
 */
function MultArcade({ prog, best, onBack, onDone }) {
  const [lvl, setLvl] = useState(1);
  const [idx, setIdx] = useState(0);          // питань на цьому рівні
  const [lives, setLives] = useState(ARCADE_LIVES);
  const [score, setScore] = useState(0);
  const [q, setQ] = useState(() => arcadeNext(prog, 1, 0, false));
  const [opts, setOpts] = useState([]);
  const [typed, setTyped] = useState('');
  const [state, setState] = useState('ask');  // ask | right | wrong | levelup | over
  const [left, setLeft] = useState(0);
  const started = useRef(Date.now());
  const resRef = useRef([]);
  const dead = useRef(false);
  /*
   * Чи був попередній рівень чистим. Поки ні — трапляється лише вивчене:
   * аркада тут для того, щоб довести до блиску знайоме. Пройшов рівень
   * без жодного промаху — заслужив складніше, і тоді підмішується те, що
   * знаєш гірше.
   */
  const clean = useRef(true);      // поточний рівень ще без промахів
  const [earned, setEarned] = useState(false);   // попередній закрито ідеально

  const cfg = arcadeLevel(lvl);

  /*
   * Скидання прив'язане саме до нового питання, а не до будь-якої зміни
   * стану. Інакше воно спрацьовувало й на екрані промаху: набране число
   * стиралось, і натиснутий неправильний варіант виглядав так, ніби час
   * вийшов, а годинник тим часом починався заново.
   */
  useEffect(() => {
    if (!q) return;
    setOpts(q.kind === 'pick' ? options(q) : []);
    setTyped('');
    setLeft(q.seconds);
    started.current = Date.now();
  }, [q]);

  // Годинник спільний для всіх рівнів: смуга тане, і коли скінчилась —
  // це така сама помилка, як неправильна відповідь. Інакше на важкому
  // прикладі можна сидіти скільки завгодно, і швидкість не тренується.
  useEffect(() => {
    if (state !== 'ask' || !q) return;
    const t = setInterval(() => {
      const gone = (Date.now() - started.current) / 1000;
      const rest = q.seconds - gone;
      setLeft(rest);
      if (rest <= 0) { clearInterval(t); miss(null); }
    }, 100);
    return () => clearInterval(t);
  }, [state, q]);

  if (!q) {
    return (
      <div className="h-empty">
        Спершу вивчіть хоч одну частину — в аркаді трапляється те, що вже знайоме.{' '}
        <button className="h-link" onClick={onBack}>Назад</button>
      </div>
    );
  }

  function record(right) {
    resRef.current = [...resRef.current, {
      key: q.key, mode: q.mode, right,
      ms: Math.min(Date.now() - started.current, q.seconds * 1000),
      text: q.text, answer: q.answer,
    }];
  }

  function miss(v) {
    if (dead.current) return;
    record(false);
    clean.current = false;
    setTyped(v === null ? '' : String(v));
    setState('wrong');
    const rest = lives - 1;
    setLives(rest);
    if (rest <= 0) { dead.current = true; setTimeout(() => setState('over'), 1200); }
  }

  function hit() {
    record(true);
    setScore((x) => x + 1);
    setState('right');
    const n = idx + 1;
    setTimeout(() => {
      if (n >= ARCADE_PER_LEVEL) {
        const won = clean.current;
        setEarned(won);
        setState('levelup');
        setTimeout(() => {
          clean.current = true;
          setLvl((l) => l + 1);
          setIdx(0);
          setQ(arcadeNext(prog, lvl + 1, 0, won));
          setState('ask');
        }, 1100);
      } else {
        setIdx(n);
        setQ(arcadeNext(prog, lvl, n, earned));
        setState('ask');
      }
    }, 340);
  }

  const answer = (v) => {
    if (state !== 'ask') return;
    if (v === q.answer) hit(); else miss(v);
  };

  const press = (d) => {
    if (state !== 'ask') return;
    const t = (typed + d).slice(0, 3);
    setTyped(t);
    if (t.length >= String(q.answer).length) setTimeout(() => answer(Number(t)), 50);
  };

  const next = () => {
    if (dead.current) return;
    const n = idx + 1;
    if (n >= ARCADE_PER_LEVEL) {
      // після промаху рівень уже не чистий — наступний знову зі знайомого
      setEarned(false);
      clean.current = true;
      setLvl((l) => l + 1); setIdx(0); setQ(arcadeNext(prog, lvl + 1, 0, false));
    } else {
      setIdx(n); setQ(arcadeNext(prog, lvl, n, earned));
    }
    setState('ask');
  };

  if (state === 'over') {
    const better = lvl > best;
    return (
      <div className="h-mt-win">
        <div className="h-mt-cup">{better ? '🏆' : '🎮'}</div>
        <h2>Рівень {lvl}</h2>
        <p>
          {score} {plur(score, ['правильна', 'правильні', 'правильних'])} поспіль.{' '}
          {better
            ? `Новий рекорд — до цього був ${best || 0}.`
            : `Рекорд ${best}. До нього ${best - lvl + 1} ${plur(best - lvl + 1, ['рівень', 'рівні', 'рівнів'])}.`}
        </p>
        <button className="h-add" onClick={() => onDone(resRef.current, lvl)}>Зберегти й вийти</button>
      </div>
    );
  }

  if (state === 'levelup') {
    return (
      <div className="h-mt-win">
        <div className="h-mt-cup">{earned ? '🏅' : '⚡'}</div>
        <h2>Рівень {lvl + 1}</h2>
        <p>
          {arcadeLevel(lvl + 1).seconds.toFixed(1)} с на відповідь
          {arcadeLevel(lvl + 1).withDiv && !cfg.withDiv ? ' · додається ділення' : ''}
          {arcadeLevel(lvl + 1).typed && !cfg.typed ? ' · тепер набираємо цифри' : ''}
        </p>
        {/* чистий рівень — єдиний спосіб дістати складніше: доки є промахи,
            аркада лишається повторенням знайомого */}
        <p className="h-mt-earned">
          {earned
            ? 'Рівень без жодного промаху — далі підмішаємо те, що знаєте гірше.'
            : 'Був промах — далі знову лише знайоме. Пройдіть рівень чисто, щоб додалося складніше.'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-mt-drill">
      <div className="h-mt-drill-h">
        <button className="h-link" onClick={onBack}>← Вийти</button>
        <span className="h-mt-arc-l">
          {[...Array(ARCADE_LIVES)].map((_, k) => (
            <i key={k} className={k < lives ? 'is-on' : ''}>♥</i>
          ))}
        </span>
        <span className="h-mt-where">рівень {lvl} · {score}</span>
      </div>

      <div className="h-mt-bar">
        <i className={left <= q.seconds * 0.3 ? 'is-hot' : ''}
          style={{ width: Math.max(0, (left / q.seconds) * 100) + '%', transition: 'none' }} />
      </div>
      <div className="h-mt-arc-n">
        {idx + (state === 'right' ? 1 : 0)} / {ARCADE_PER_LEVEL}
        {q.fresh && <b> · новий</b>}
      </div>

      <AskBox q={q} state={state === 'right' ? 'right' : state === 'wrong' ? 'wrong' : ''}
        typed={state === 'wrong' && !typed ? '—' : typed}
        opts={q.kind === 'pick' && !q.typed ? opts : null}
        onAnswer={answer} disabled={state !== 'ask'} />

      {state === 'wrong' ? (
        <div className="h-mt-fb">
          <div className="h-mt-fb-t">
            {typed ? 'Не так.' : 'Час вийшов.'} Правильно: <b>{answerLabel(q)}</b>
          </div>
          {hookFor(q.key) && <div className="h-mt-fb-h">💡 {hookFor(q.key)}</div>}
          {lives > 0 && <button className="h-add" onClick={next}>Далі →</button>}
        </div>
      ) : q.kind === 'pick' && q.typed ? (
        <div className="h-mt-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button key={d} onClick={() => press(String(d))} disabled={state !== 'ask'}>{d}</button>
          ))}
          <button className="is-soft" onClick={() => setTyped('')} disabled={state !== 'ask'}>С</button>
          <button onClick={() => press('0')} disabled={state !== 'ask'}>0</button>
          <button className="is-soft" onClick={() => setTyped((t) => t.slice(0, -1))} disabled={state !== 'ask'}>⌫</button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Вкладка «Код» ---------- */

/**
 * Пісочниця для JS-завдань. Виконується у Web Worker — окремому потоці,
 * а не в цій вкладці, — тож нескінченний цикл у власному коді підвісить
 * тільки воркер, який просто вб'ють по таймауту, а не сторінку.
 *
 * `console.log` усередині воркера підмінений: замість друку в консоль він
 * складає рядки в масив і повертає їх одним повідомленням.
 */
const WORKER_SRC = `
self.onmessage = (e) => {
  const logs = [];
  const put = (a) => a.map((x) => {
    if (typeof x === 'string') return x;
    try { return JSON.stringify(x); } catch { return String(x); }
  }).join(' ');
  const orig = console.log;
  console.log = (...a) => { logs.push(put(a)); };

  const done = (ok, error) => {
    console.log = orig;
    self.postMessage({ ok: ok, output: logs.join('\\n'), error: error });
  };

  try {
    const result = (0, eval)(e.data);
    // Коли останній рядок коду — виклик async-функції, у цю мить надруковано
    // ще нічого: обіцянка тільки видана. Чекаємо на неї, а потім даємо ще
    // один оберт черги — інакше загубиться друк із самого кінця ланцюжка.
    if (result && typeof result.then === 'function') {
      result.then(
        () => setTimeout(() => done(true), 0),
        (err) => done(false, String((err && err.message) || err))
      );
    } else {
      done(true);
    }
  } catch (err) {
    done(false, String((err && err.message) || err));
  }
};
`;

function runJS(code, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let worker;
    try {
      const blob = new Blob([WORKER_SRC], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      worker = new Worker(url);
      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve(r);
      };
      const timer = setTimeout(
        () => finish({ ok: false, output: '', error: 'Код виконувався надто довго — можливо, нескінченний цикл.' }),
        timeoutMs
      );
      worker.onmessage = (e) => finish(e.data);
      worker.onerror = (e) => finish({ ok: false, output: '', error: e.message || 'Помилка виконання' });
      worker.postMessage(code);
    } catch (e) {
      resolve({ ok: false, output: '', error: 'Браузер не підтримує виконання коду тут.' });
    }
  });
}

/**
 * Пісочниця для сторінкових завдань. Рамка без `allow-same-origin` — у
 * неї немає доступу ні до кукі, ні до застосунку, лише до того, що
 * написано в самому коді. Тому єдиний спосіб дізнатись, що вийшло, —
 * дочекатись, доки рамка сама розповість про себе через postMessage.
 */
function runPage(html, timeoutMs = 3000) {
  const ping = `<script>window.addEventListener('load',()=>{try{parent.postMessage({__lesson:true,text:document.body?document.body.innerText:''},'*');}catch(e){parent.postMessage({__lesson:true,text:''},'*');}});</script>`;
  const promise = new Promise((resolve) => {
    let done = false;
    const finish = (text) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      resolve(text);
    };
    const onMsg = (e) => {
      if (!e.data || !e.data.__lesson) return;
      finish(e.data.text || '');
    };
    const timer = setTimeout(() => finish(''), timeoutMs);
    window.addEventListener('message', onMsg);
  });
  return { promise, srcdoc: html + ping };
}

/**
 * Пісочниця для React.
 *
 * Та сама рамка, що й для сторінкових завдань, але спершу в неї
 * вантажиться зібраний файл із React, react-dom і перетворювачем JSX:
 * браузер JSX не розуміє, а React 19 більше не постачає готових файлів
 * для браузера. Збирає їх `scripts/build-sandbox.mjs`.
 *
 * Монтуємо компонент `App` самі — щоб урок був про компонент, а не про
 * три однакові рядки запуску, які в справжньому застосунку пише
 * фреймворк.
 *
 * `clicks` — селектори, по яких треба клацнути після показу. Саме це й
 * робить перевірку справжньою: видно не те, що написано, а те, що
 * сталося після натискання. Клацаємо по черзі з паузою, бо React
 * складає кілька змін в одному такті в одну.
 */
function runReact(code, clicks = [], timeoutMs = 6000) {
  const shell = `
<div id="root"></div>
<script src="/vendor/react-sandbox.js"><\/script>
<script>
(function () {
  var say = function (text, error) {
    try { parent.postMessage({ __lesson: true, text: text || '', error: error || '' }, '*'); } catch (e) {}
  };
  window.addEventListener('load', function () {
    if (!window.React) { say('', 'Не вдалося завантажити React — оновіть сторінку.'); return; }
    try {
      var js = window.__jsx(${JSON.stringify(code)});
      var make = new Function('React', 'ReactDOM', js + '\\n;return typeof App === "function" ? App : null;');
      var App = make(window.React, window.ReactDOM);
      if (!App) { say('', 'Не знайдено компонент App — назвіть свій компонент саме так.'); return; }
      window.ReactDOM.createRoot(document.getElementById('root'))
        .render(window.React.createElement(App));
      var list = ${JSON.stringify(clicks)};
      var step = function (i) {
        if (i >= list.length) { setTimeout(function () { say(document.body.innerText); }, 80); return; }
        var el = document.querySelector(list[i]);
        if (el) el.click();
        setTimeout(function () { step(i + 1); }, 60);
      };
      setTimeout(function () { step(0); }, 60);
    } catch (e) { say('', String((e && e.message) || e)); }
  });
})();
<\/script>`;

  const promise = new Promise((resolve) => {
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      resolve(r);
    };
    const onMsg = (e) => {
      if (!e.data || !e.data.__lesson) return;
      finish({ text: e.data.text || '', error: e.data.error || '' });
    };
    const timer = setTimeout(() => finish({ text: '', error: 'Не дочекались відповіді від рамки.' }), timeoutMs);
    window.addEventListener('message', onMsg);
  });
  return { promise, srcdoc: shell };
}

/** Підсвітка синтаксису для читання, не для редагування — просто фарбує рядки */
/** Розфарбовані шматки коду — спільні для редактора й показаних блоків */
function Painted({ code, mode }) {
  return tokenize(code, mode).map((x, i) => (
    x.t === 'txt' ? x.s : <span className={'hl-' + x.t} key={i}>{x.s}</span>
  ));
}

function CodeBlock({ code, mode = 'js' }) {
  return <pre className="cd-block"><code><Painted code={code} mode={mode} /></code></pre>;
}

/**
 * Поле, у якому пишуть код.
 *
 * Довго це був звичайний блокнот: сірий текст без номерів рядків, Tab
 * викидав із поля, а Enter не тримав відступ. Писати так можна, але
 * помилку в цьому не видно — а редактор для того й потрібен, щоб її було
 * видно раніше, ніж натиснули «Запустити».
 *
 * Розфарбування зроблене шаром: під прозорим текстом лежить точно такий
 * самий, але кольоровий. Тримається воно на тому, що обидва шари мають
 * однакові шрифт, розмір, міжрядковий інтервал і відступи, — тож CSS тут
 * не косметика, і будь-яка правка одного шару має повторитись в іншому.
 * Перенесення рядків вимкнене навмисно: із ним номер зліва перестав би
 * відповідати рядку справа.
 */
function CodeEditor({ value, onChange, mode, rows, onRun }) {
  const taRef = useRef(null);
  const backRef = useRef(null);
  const gutRef = useRef(null);

  // прокрутка трьох шарів разом: інакше кольори від'їжджають від тексту
  const sync = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (backRef.current) {
      backRef.current.scrollTop = ta.scrollTop;
      backRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutRef.current) gutRef.current.scrollTop = ta.scrollTop;
  };

  useEffect(sync, [value]);

  /*
   * Правка через сам браузер, а не через перемальовування поля.
   *
   * Спершу тут рахувався новий текст, а курсор ставився вже після
   * перемальовування — і на швидкому наборі це розсипалось: наступна
   * літера встигала прийти раніше, ніж курсор повертався на місце, і
   * «console.log(1);» перетворювалось на «console.log(1;)». Тепер вставку
   * робить сам браузер: курсор стає на місце тієї ж миті, а заразом
   * працює звичайне скасування останньої дії.
   */
  const edit = (ta, from, to, text, caret) => {
    ta.focus();
    ta.setSelectionRange(from, to);
    let done = false;
    try { done = document.execCommand('insertText', false, text); } catch { done = false; }
    if (!done) ta.setRangeText(text, from, to, 'end');
    if (caret !== undefined) ta.setSelectionRange(caret, caret);
    onChange(ta.value);
  };

  /** Просто переставити курсор: текст не змінюється, тож і стан не чіпаємо */
  const moveTo = (ta, at) => ta.setSelectionRange(at, at);

  const onKey = (e) => {
    const ta = e.target;
    const { selectionStart: a, selectionEnd: b } = ta;
    const val = ta.value;

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun?.();
      return;
    }

    // Tab у полі для коду має ставити відступ, а не викидати з поля.
    // Вийти з поля можна Escape — фокус не замикається назовсім.
    if (e.key === 'Tab') {
      e.preventDefault();
      if (a !== b) {
        const from = val.lastIndexOf('\n', a - 1) + 1;
        const block = val.slice(from, b);
        const moved = e.shiftKey
          ? block.replace(/^ {1,2}/gm, '')
          : block.replace(/^/gm, '  ');
        edit(ta, from, b, moved, undefined);
        ta.setSelectionRange(from, from + moved.length);
        return;
      }
      if (e.shiftKey) {
        const from = val.lastIndexOf('\n', a - 1) + 1;
        const cut = /^ {1,2}/.exec(val.slice(from));
        if (cut) edit(ta, from, from + cut[0].length, '', a - cut[0].length);
        return;
      }
      edit(ta, a, b, '  ');
      return;
    }

    if (e.key === 'Enter') {
      const from = val.lastIndexOf('\n', a - 1) + 1;
      const line = val.slice(from, a);
      const pad = (/^[ \t]*/.exec(line) || [''])[0];
      // після відкритої дужки рівень глибше, а закривальну зсуваємо назад
      const deeper = /[{([]\s*$/.test(line) ? '  ' : '';
      const closing = /^[)\]}]/.test(val.slice(b));
      e.preventDefault();
      if (deeper && closing) {
        // курсор лишається в порожньому рядку між дужками
        const text = '\n' + pad + deeper + '\n' + pad;
        edit(ta, a, b, text, a + 1 + pad.length + deeper.length);
        return;
      }
      edit(ta, a, b, '\n' + pad + deeper);
      return;
    }

    // Закривальну дужку набирають самі — і одразу поверх дописаної.
    // Пропускаємо її, замість того щоб класти другу.
    if (')]}\'"`'.includes(e.key) && a === b && val[a] === e.key) {
      e.preventDefault();
      moveTo(ta, a + 1);
      return;
    }

    const pair = { '(': ')', '[': ']', '{': '}', '\'': '\'', '"': '"', '`': '`' }[e.key];
    if (pair && a === b && /^$|[\s)\]},;]/.test(val[a] ?? '')) {
      e.preventDefault();
      edit(ta, a, b, e.key + pair, a + 1);
    }
  };

  return (
    <div className="cd-ed" style={{ '--cd-rows': rows }}>
      <div className="cd-ed-gut" ref={gutRef} aria-hidden="true">
        {Array.from({ length: lineCount(value) }, (_, i) => <span key={i}>{i + 1}</span>)}
      </div>
      <div className="cd-ed-box">
        <pre className="cd-ed-back" ref={backRef} aria-hidden="true">
          <code><Painted code={value} mode={mode} /></code>
          {/* останній рядок без переносу інакше не має куди прокрутитись */}
          {'\n'}
        </pre>
        <textarea
          ref={taRef}
          className="cd-ed-in"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={sync}
          onKeyDown={onKey}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          wrap="off"
        />
      </div>
    </div>
  );
}

/** Текст пояснення з `код` у зворотних лапках — підсвічений моноширинним */
function Prose({ text }) {
  const parts = String(text).split(/(`[^`]+`)/g);
  return (
    <p>
      {parts.map((p, i) => (p.startsWith('`')
        ? <code key={i} className="cd-inline">{p.slice(1, -1)}</code>
        : <span key={i}>{p}</span>))}
    </p>
  );
}

/**
 * Повторення.
 *
 * П'ять питань — це хвилини три. Стільки й має бути: повторення не
 * сідають робити окремо, його відкривають між справами, і те, що не
 * влазить у три хвилини, не відкривають зовсім.
 *
 * Питання тут не про слова, а про те місце, де новачок помиляється.
 * Тому після відповіді завжди видно пояснення — і після правильної теж:
 * угадати з трьох варіантів можна, зрозуміти — ні.
 */
function RecallRoom({ prog, onBack, onSave }) {
  const [queue] = useState(() => buildQueue(prog));
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState(null);
  const [right, setRight] = useState(0);
  /*
   * Відповіді складаємо тут, а в таблицю пишемо один раз — у кінці
   * підходу або коли з нього виходять. Той самий розрахунок, що й у
   * тренажері множення: запис після кожної відповіді з'їв би хвилинну
   * квоту Google на третьому питанні.
   */
  const done = useRef({});

  const flush = () => {
    const marks = done.current;
    done.current = {};
    if (Object.keys(marks).length) onSave(marks);
    onBack();
  };

  const item = queue[at];

  if (!queue.length) {
    return (
      <div className="cd-room">
        <button className="cd-back" onClick={onBack}>← до уроків</button>
        <div className="h-empty">
          Сьогодні повторювати нічого. Поняття повертаються за розкладом —
          спершу через день, далі рідше, а те, що згадали п'ять разів, —
          раз на місяць.
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="cd-room">
        <button className="cd-back" onClick={flush}>← до уроків</button>
        <div className="rc-done">
          <div className="rc-done-n">{right} з {queue.length}</div>
          <div className="rc-done-t">
            {right === queue.length
              ? 'Усе згадали. Ці поняття повернуться нескоро.'
              : 'Те, що не згадалось, повернеться вже завтра.'}
          </div>
          <button className="btn" onClick={flush}>До уроків</button>
        </div>
      </div>
    );
  }

  const q = item.question;
  const answered = picked !== null;
  const ok = picked === q.right;

  return (
    <div className="cd-room">
      {/* вихід посеред підходу теж зберігає: три відповіді, які людина
          встигла дати, не мають пропасти через те, що її покликали */}
      <button className="cd-back" onClick={flush}>← до уроків</button>

      <div className="rc-top">
        <span className="rc-count">{at + 1} з {queue.length}</span>
        <span className="rc-from">{lessonTitle(item.id)}</span>
      </div>

      <div className="rc-ask"><Prose text={q.ask} /></div>
      {q.code && <pre className="rc-code">{q.code}</pre>}

      <div className="rc-opts">
        {q.options.map((o, i) => (
          <button
            key={o}
            className={'rc-opt'
              + (answered && i === q.right ? ' is-right' : '')
              + (answered && i === picked && i !== q.right ? ' is-wrong' : '')}
            disabled={answered}
            onClick={() => {
              setPicked(i);
              const ok = i === q.right;
              if (ok) setRight((n) => n + 1);
              done.current[item.id] = nextLevel(item.level, ok);
            }}
          >
            {o}
          </button>
        ))}
      </div>

      {answered && (
        <>
          {/* пояснення показуємо й після правильної відповіді: угадати з
              трьох варіантів можна, зрозуміти — ні */}
          <div className={'rc-why' + (ok ? ' is-right' : '')}><Prose text={q.why} /></div>
          <button
            className="btn z-wide"
            onClick={() => { setAt(at + 1); setPicked(null); }}
          >
            {at + 1 < queue.length ? 'Далі' : 'Підсумок'}
          </button>
        </>
      )}
    </div>
  );
}

const lessonTitle = (id) => CODE_LESSONS.find((l) => l.id === id)?.title || id;

export function CodeTab({ data, reload, toast }) {
  const [prog, setProg] = useState(() => data.code || {});
  const [openId, setOpenId] = useState(null);
  const [saving, setSaving] = useState(false);
  // Курс проходять один раз, а довідник відкривають щотижня — тож це не
  // підрозділ уроків, а рівноправний режим вкладки.
  const [mode, setMode] = useState('learn');

  useEffect(() => { setProg(data.code || {}); }, [data.code]);

  const upIdx = openUpTo(prog);
  const stats = courseStats(prog);
  const diary = statsOf(data.practice || [], today());
  const rec = recallStats(prog);

  const save = async (next) => {
    // у посилку йде лише те, що змінилось відносно завантаженого:
    // інакше застарілий екран перезаписав би чужий прогрес
    const patch = changedOnly(data.code || {}, next);
    setProg(next);
    setSaving(true);
    try {
      await api('/api/health', { method: 'POST', body: { action: 'code', code: patch } });
      await reload();
    } catch (e) {
      toast?.(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (openId) {
    const idx = CODE_LESSONS.findIndex((l) => l.id === openId);
    const lesson = CODE_LESSONS[idx];
    return (
      <LessonRoom
        lesson={lesson}
        saved={prog[lesson.id]}
        locked={idx > upIdx}
        // питання показуємо лише тому, хто щойно здав урок уперше:
        // тому, хто повернувся подивитись, воно вже ні про що не питає
        why={prog[lesson.id]?.asked ? null : pickQuestion(lesson.id, 0)}
        onWhy={(right) => {
          const was = prog[lesson.id] || {};
          save({
            ...prog,
            [lesson.id]: {
              ...was,
              // зрозумів одразу — поняття починає з першого щабля, а не
              // з нульового: питати його завтра вже нема потреби
              level: nextLevel(0, right),
              asked: today(),
            },
          });
        }}
        onBack={() => setOpenId(null)}
        onNext={() => {
          const nxt = CODE_LESSONS[idx + 1];
          setOpenId(nxt ? nxt.id : null);
        }}
        onDone={async (code) => {
          const next = {
            ...prog,
            [lesson.id]: {
              // рівень і день повторення переносимо: урок, який
              // перепройшли, не має починати згадуватись наново
              ...(prog[lesson.id] || {}),
              id: lesson.id, state: 'done',
              date: new Date().toLocaleDateString('uk-UA'),
              tries: (prog[lesson.id]?.tries || 0) + 1,
              code,
            },
          };
          await save(next);
        }}
        onTry={async () => {
          const next = {
            ...prog,
            [lesson.id]: {
              ...(prog[lesson.id] || { id: lesson.id, state: '' }),
              tries: (prog[lesson.id]?.tries || 0) + 1,
            },
          };
          setProg(next);   // рахунок спроб не варто чекати на мережу
        }}
      />
    );
  }

  if (mode === 'recall') {
    return (
      <RecallRoom
        prog={prog}
        onBack={() => setMode('learn')}
        onSave={(marks) => {
          const next = { ...prog };
          Object.entries(marks).forEach(([id, level]) => {
            next[id] = { ...(next[id] || {}), level, asked: today() };
          });
          save(next);
        }}
      />
    );
  }

  if (mode === 'ref') {
    return <RefBook onBack={() => setMode('learn')} />;
  }

  if (mode === 'tour') {
    return <TourBook onBack={() => setMode('learn')} />;
  }

  if (mode === 'diary') {
    return (
      <Diary
        list={data.practice || []}
        canEdit={data.canEdit}
        onBack={() => setMode('learn')}
        onAdd={async (entry) => {
          await api('/api/health', { method: 'POST', body: { action: 'practice', entry } });
          await reload();
        }}
        toast={toast}
      />
    );
  }

  return (
    <div className="cd-home">
      <div className="cd-intro">
        {/* назва вкладки вже стоїть у шапці — другий заголовок зайвий */}
        <p>
          Одна мова — JavaScript: нею ж написано цей застосунок. Спершу
          сторінка, бо результат видно очима; скрипти й основи підключаються
          там, де без них уже не обійтись. Далі React — те, чим написані ці
          екрани, — і сервер, який віддає їм дані.
        </p>
      </div>

      {/* Повторення стоїть першим серед розділів навмисно: решта — про
          те, щоб дізнатись нове, а це єдине, що не дає забути старе.
          Курс без нього доводить до кінця людину, яка пам'ятає останні
          десять уроків із шістдесяти чотирьох. */}
      <button
        className={'cd-refb is-recall' + (rec.due > 0 ? ' is-now' : '')}
        onClick={() => setMode('recall')}
      >
        <span className="cd-refb-t">
          Повторення
          {rec.due > 0 && <em className="cd-refb-n">{Math.min(rec.due, RECALL_SIZE)}</em>}
        </span>
        <span className="cd-refb-d">
          {rec.total === 0
            ? 'З\'явиться, коли пройдете перший урок з основ'
            : rec.due > 0
              ? `${Math.min(rec.due, RECALL_SIZE)} ${plural(Math.min(rec.due, RECALL_SIZE), 'питання', 'питання', 'питань')} на сьогодні — хвилини три`
              : `Сьогодні нічого. Тримається ${rec.held} з ${rec.total}`}
        </span>
      </button>

      {/* Довідник — не додаток до уроків, а друга половина вкладки: уроки
          проходять один раз, а сюди повертаються щоразу, коли забули, як
          саме пишеться те, що вже колись робив. */}
      <button className="cd-refb" onClick={() => setMode('ref')}>
        <span className="cd-refb-t">Довідник</span>
        <span className="cd-refb-d">
          {REF_CARDS.length} карток: як поставити по центру, як перебрати
          список, як надіслати запит
        </span>
      </button>

      {/* Читати чуже — половина роботи розробника, і навчитись цього на
          вигаданих прикладах не можна: вигаданий приклад завжди зрозумілий,
          а робочий файл — ні. Тут розбирається код цього ж застосунку. */}
      <button className="cd-refb is-tour" onClick={() => setMode('tour')}>
        <span className="cd-refb-t">Розбір свого коду</span>
        <span className="cd-refb-d">
          {TOURS.length} розборів справжніх файлів «Обліку» — рядок за рядком,
          із поясненням, чому саме так
        </span>
      </button>

      {/* Третя частина вкладки — і найважливіша після того, як уроки
          скінчаться. Курс закінчується, довідник відповідає на питання,
          а вміння починається на першій зміні, якої ніхто не задавав. */}
      <button className="cd-refb is-diary" onClick={() => setMode('diary')}>
        <span className="cd-refb-t">
          Щоденник практики
          {diary.entries > 0 && <em className="cd-refb-n">{diary.entries}</em>}
        </span>
        <span className="cd-refb-d">
          {diary.entries > 0
            ? `${diary.entries} ${plural(diary.entries, 'зміна', 'зміни', 'змін')} за ${diary.days} ${plural(diary.days, 'день', 'дні', 'днів')}`
              + (diary.fixed ? `, з них ${diary.fixed} з розібраною поломкою` : '')
            : 'Свої зміни в цьому застосунку: що хотів, що зробив, на чому спіткнувся'}
        </span>
      </button>

      <div className="cd-prog">
        <div className="cd-prog-t">
          <div className="cd-prog-t">Пройдено</div>
          <b>{stats.done} з {stats.total}</b>
        </div>
        <div className="cd-prog-bar"><i style={{ width: `${(stats.done / stats.total) * 100}%` }} /></div>
      </div>

      {/* Три доріжки прогріваються по черзі: сторінка → скрипти → основи,
          коли без них уже не обійтись. Ділити список на три коробки за
          назвою доріжки означало б показати «наступний урок» унизу зовсім
          іншого розділу — тож список один, а доріжка лишається міткою на
          кожній картці, щоб було видно, звідки урок і що там ще лишилось. */}
      <div className="cd-track-legend">
        {stats.byTrack.map((t) => (
          <span key={t.key} className={'cd-tag is-' + t.key}>{t.label} {t.done}/{t.total}</span>
        ))}
      </div>

      <div className="cd-list">
        {CODE_LESSONS.map((l, i) => {
          const st = prog[l.id];
          const locked = i > upIdx;
          const done = st?.state === 'done';
          const current = i === upIdx && !done;
          const track = TRACKS.find((t) => t.key === l.track);
          return (
            <button
              key={l.id}
              className={'cd-item' + (done ? ' is-done' : '') + (locked ? ' is-locked' : '') + (current ? ' is-current' : '')}
              onClick={() => !locked && setOpenId(l.id)}
              disabled={locked}
            >
              <i className="cd-item-i">{done ? '✓' : locked ? '🔒' : i + 1}</i>
              <span className="cd-item-b">
                <b>{l.title}</b>
                <em>{l.goal}</em>
              </span>
              <span className={'cd-tag is-' + l.track}>{track.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Довідник.
 *
 * Побудований за питаннями, а не за темами: у роботі згадується не
 * «flexbox», а «як поставити по центру». Тому пошук іде і по назві, і по
 * питанню, і по самому коду — знайдеться і так, і так.
 *
 * У кожній картці є рядок «у застосунку»: приклад із підручника
 * забувається, а «ось так зроблено в моєму «Обліку» — ні.
 */
function RefBook({ onBack }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  const found = findCards(q);
  const searching = q.trim().length > 0;

  return (
    <div className="cd-ref">
      <div className="cd-ref-top">
        <button className="cd-back" onClick={onBack}>← До уроків</button>
        <input
          className="cd-ref-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Що потрібно згадати?"
        />
      </div>

      {searching && (
        <div className="cd-ref-n">
          {found.length === 0
            ? 'Нічого не знайшлось. Спробуйте іншими словами — пошук іде і по коду.'
            : `Знайдено: ${found.length}`}
        </div>
      )}

      {REF_GROUPS.map((g) => {
        const cards = found.filter((c) => c.g === g.key);
        if (!cards.length) return null;
        return (
          <div className="cd-ref-g" key={g.key}>
            <div className="cd-ref-h">
              <b>{g.label}</b>
              <em>{g.hint}</em>
            </div>
            <div className="cd-ref-list">
              {cards.map((c) => (
                <RefCard
                  key={c.id}
                  c={c}
                  open={open === c.id || searching}
                  onToggle={() => setOpen(open === c.id ? null : c.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Розбори власного коду.
 *
 * Уроки вчать писати, довідник нагадує як — а тут читають чуже. У роботі
 * це половина справи: правити наявне доводиться частіше, ніж писати з
 * нуля, і незнайомий файл лякає рівно доти, доки хтось не проведе по
 * ньому пальцем.
 */
function TourBook({ onBack }) {
  const [openId, setOpenId] = useState(null);
  const tour = openId ? tourById(openId) : null;

  if (tour) return <TourRoom tour={tour} onBack={() => setOpenId(null)} />;

  return (
    <div className="cd-ref">
      <div className="cd-ref-top">
        <button className="cd-back" onClick={onBack}>← До уроків</button>
      </div>

      <div className="cd-intro">
        <h2>Розбір свого коду</h2>
        <p>
          Тут не спрощені приклади, а справжні файли цього застосунку.
          Спрощений приклад завжди виглядає зрозумілим — а потім відкриваєш
          робочий файл, і він не схожий ні на що.
        </p>
      </div>

      <div className="cd-tours">
        {TOURS.map((t, i) => (
          <button className="cd-tour" key={t.id} onClick={() => setOpenId(t.id)}>
            <span className="cd-tour-n">{i + 1}</span>
            <span className="cd-tour-b">
              <b>{t.title}</b>
              <em>{t.goal}</em>
              <code>{t.file}</code>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Один розбір: вступ, кроки з кодом, висновок і одна зміна, яку варто спробувати */
function TourRoom({ tour, onBack }) {
  return (
    <div className="cd-troom">
      <button className="cd-back" onClick={onBack}>← До розборів</button>

      <div className="cd-thead">
        <h2>{tour.title}</h2>
        <code className="cd-tfile">{tour.file}</code>
        <div className="cd-tlevel">{tour.level}</div>
      </div>

      {tour.intro.map((p, i) => <p className="cd-tp" key={i}>{p}</p>)}

      <div className="cd-tsteps">
        {tour.steps.map((s, i) => (
          <div className="cd-tstep" key={i}>
            <pre className="cd-card-code">{s.code}</pre>
            <p className="cd-tsay"><Marked text={s.say} /></p>
          </div>
        ))}
      </div>

      <div className="cd-twhy">
        <h3>Що з цього забрати</h3>
        {tour.why.map((p, i) => <p key={i}><Marked text={p} /></p>)}
      </div>

      {/* Читання без спроби не лишається в голові, тож кожен розбір
          закінчується однією зміною, яку можна внести за хвилину. */}
      <div className="cd-ttry">
        <h3>Спробуйте</h3>
        <p>{tour.try}</p>
      </div>
    </div>
  );
}

/** Дві зірочки — жирним, зворотні лапки — кодом. Більше в поясненнях не треба. */
function Marked({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>;
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
        return p;
      })}
    </>
  );
}

/** Картка згорнута, поки не потрібна: список із тридцяти розгорнутих не гортається */
function RefCard({ c, open, onToggle }) {
  return (
    <div className={'cd-card' + (open ? ' is-open' : '')}>
      <button className="cd-card-h" onClick={onToggle}>
        <span className="cd-card-t">{c.t}</span>
        <span className="cd-card-q">{c.q}</span>
      </button>
      {open && (
        <div className="cd-card-b">
          <pre className="cd-card-code">{c.code}</pre>
          {c.note && <p className="cd-card-n">{c.note}</p>}
          {c.note2 && <p className="cd-card-n">{c.note2}</p>}
          {c.here && (
            <p className="cd-card-here"><b>У застосунку:</b> {c.here}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Кімната одного уроку. Пояснення й підказка ліворуч, редактор і
 * результат праворуч — на телефоні одне під одним. Перевірка не блокує
 * поле вводу: поки код виконується, можна вже читати, що вийшло минулого
 * разу.
 */
/**
 * Питання «чому» одразу після завдання.
 *
 * Перевірка уроку дивиться на вивід: розвʼязок можна відкрити, вставити —
 * і урок зарахується. Коли вчишся сам, це єдиний зворотний звʼязок, і він
 * перевіряє не те. Одне питання перетворює «я зробив» на «я зрозумів».
 *
 * Питання те саме, що потім прийде в повторенні: банк один, робіт дві.
 */
function WhyNow({ question, onAnswer }) {
  const [picked, setPicked] = useState(null);
  const answered = picked !== null;
  const ok = picked === question.right;

  return (
    <div className="cd-why">
      <div className="cd-why-h">Перевірка розуміння</div>
      <div className="rc-ask"><Prose text={question.ask} /></div>
      {question.code && <pre className="rc-code">{question.code}</pre>}
      <div className="rc-opts">
        {question.options.map((o, i) => (
          <button
            key={o}
            className={'rc-opt'
              + (answered && i === question.right ? ' is-right' : '')
              + (answered && i === picked && i !== question.right ? ' is-wrong' : '')}
            disabled={answered}
            onClick={() => { setPicked(i); onAnswer(i === question.right); }}
          >
            {o}
          </button>
        ))}
      </div>
      {answered && (
        <div className={'rc-why' + (ok ? ' is-right' : '')}>
          <Prose text={question.why} />
        </div>
      )}
    </div>
  );
}

function LessonRoom({ lesson, saved, locked, onBack, onNext, onDone, onTry, why: askAtOpen, onWhy }) {
  const [code, setCode] = useState(saved?.code || lesson.start);
  const [out, setOut] = useState(null);        // { ok, text }
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [passed, setPassed] = useState(saved?.state === 'done');
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [showExample, setShowExample] = useState(false);
  /*
   * Скільки разів не вийшло.
   *
   * Розвʼязок раніше відкривався тільки після успіху — тобто рівно тоді,
   * коли він уже не потрібен. Хто застряг, лишався сам на сам із
   * підказкою в один рядок, і саме там уроки й кидають. Тепер після двох
   * невдалих спроб можна подивитись, як це мало виглядати: підглянути
   * відповідь і розібрати її корисніше, ніж закрити вкладку.
   */
  const [fails, setFails] = useState(0);
  /*
   * Питання беремо один раз, коли урок відкрили, і далі тримаємо.
   *
   * Інакше воно зникає під час читання: відповідь одразу зберігається,
   * збереження перемальовує вкладку, і питання, яке вже «поставлене»,
   * щезає разом із поясненням — тобто саме з тим, заради чого воно й було.
   */
  const [why, setWhy] = useState(askAtOpen);
  const iframeRef = useRef(null);
  const STUCK = 2;

  useEffect(() => {
    setCode(saved?.code || lesson.start);
    setPassed(saved?.state === 'done');
    setOut(null); setErr(''); setShowHint(false); setShowSolution(false);
    setShowExample(false); setFails(0);
    setWhy(askAtOpen);
  }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (locked) {
    return (
      <div className="cd-room">
        <button className="cd-back" onClick={onBack}>← До уроків</button>
        <div className="h-empty">Цей урок ще закритий. Пройдіть попередні по черзі.</div>
      </div>
    );
  }

  /*
   * Чому не зарахувалось.
   *
   * Один текст на всі випадки повторює завдання й нічого не пояснює. У
   * «Умові» через це можна було застрягти надовго: гілку написано
   * правильно, а у виводі все одно «Важка» — бо `kg` лишилось 25, і до
   * нової гілки виконання просто не доходить. Тому `why` буває функцією
   * й дивиться, що саме людина написала.
   */
  const whyOf = (a, b) => {
    const w = typeof lesson.why === 'function' ? lesson.why(a, b) : lesson.why;
    return w || 'Поки що не те. Спробуйте ще.';
  };

  const run = async () => {
    setBusy(true); setErr(''); onTry?.();
    try {
      if (lesson.kind === 'js') {
        const r = await runJS(code);
        if (!r.ok && r.error) { setErr(r.error); setOut({ text: r.output }); }
        else {
          setOut({ text: r.output });
          const ok = lesson.check(r.output, code);
          if (ok) { setPassed(true); await onDone(code); }
          else { setFails((n) => n + 1); setErr(whyOf(r.output, code)); }
        }
      } else if (lesson.kind === 'react') {
        const { promise, srcdoc } = runReact(code, lesson.clicks);
        if (iframeRef.current) iframeRef.current.srcdoc = srcdoc;
        const r = await promise;
        if (r.error) setErr(r.error);
        else {
          const ok = lesson.check(code, r.text);
          if (ok) { setPassed(true); await onDone(code); }
          else { setFails((n) => n + 1); setErr(whyOf(code, r.text)); }
        }
      } else {
        const { promise, srcdoc } = runPage(code);
        // рамку монтуємо тут, а не через runPage: їй потрібен реальний DOM
        if (iframeRef.current) iframeRef.current.srcdoc = srcdoc;
        const text = await promise;
        const ok = lesson.check(code, text);
        if (ok) { setPassed(true); await onDone(code); }
        else { setFails((n) => n + 1); setErr(whyOf(code, text)); }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cd-room">
      <div className="cd-room-h">
        <button className="cd-back" onClick={onBack}>← До уроків</button>
        <b>{lesson.title}</b>
      </div>

      <div className="cd-intro-box">
        {lesson.intro.map((t, i) => <Prose key={i} text={t} />)}
      </div>

      {/* Та сама думка, показана працюючою. Пояснення словами каже, що
          робить `filter`; приклад показує, що з нього виходить — і саме
          цього бракувало між «прочитав» і «пиши сам». Згорнутий, щоб не
          заступати завдання тому, кому вже зрозуміло. */}
      {lesson.example && (
        <div className="cd-ex">
          <button className="cd-ex-h" onClick={() => setShowExample((v) => !v)}>
            <span className={'cd-ex-arr' + (showExample ? ' on' : '')}>▸</span>
            Ось як це працює
          </button>
          {showExample && (
            <div className="cd-ex-b">
              <CodeBlock code={lesson.example.code} mode={modeOf(lesson.kind)} />
              <div className="cd-ex-out">
                <span className="cd-ex-lab">Виходить</span>
                <pre>{lesson.example.out}</pre>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="cd-task">
        <b>Завдання.</b> <Prose text={lesson.task} />
        {/* Ціль була відома лише з тексту помилки, тобто вже після
            невдачі. Тепер її видно до того, як почали писати. */}
        {lesson.want && (
          <div className="cd-want"><b>Має вийти:</b> <Prose text={lesson.want} /></div>
        )}
      </div>

      <div className={'cd-work' + (lesson.kind === 'js' ? '' : ' is-page')}>
        <CodeEditor
          value={code}
          onChange={(v) => { setCode(v); setErr(''); }}
          mode={modeOf(lesson.kind)}
          rows={lesson.kind === 'js' ? 8 : 12}
          onRun={run}
        />
        {lesson.kind !== 'js' && (
          <iframe
            ref={iframeRef}
            className="cd-frame"
            sandbox="allow-scripts"
            title="Перегляд"
          />
        )}
      </div>

      {lesson.kind === 'js' && out && (
        <div className="cd-out">
          <div className="cd-out-h">Надруковано</div>
          <pre>{out.text || '(нічого не надруковано)'}</pre>
        </div>
      )}

      {err && <div className="cd-err">{err}</div>}
      {passed && !err && (
        <div className="cd-ok">✓ Зроблено. Можна йти далі — або лишитись і поекспериментувати.</div>
      )}

      {/* Питання ставимо лише там, де воно написане: урок без питання
          мовчить, а не показує порожню рамку. */}
      {passed && !err && why && (
        <WhyNow question={why} onAnswer={onWhy} />
      )}

      <div className="cd-actions">
        <button className="act-btn act-accept" onClick={run} disabled={busy}>
          {busy ? 'Виконую…' : 'Запустити'}
        </button>
        {passed && (
          <button className="act-btn act-accept" onClick={onNext}>Далі →</button>
        )}
        <button className="act-btn" onClick={() => setShowHint((v) => !v)}>
          {showHint ? 'Сховати підказку' : 'Підказка'}
        </button>
        {(passed || fails >= STUCK) && (
          <button className="act-btn" onClick={() => setShowSolution((v) => !v)}>
            {showSolution ? 'Сховати розвʼязок' : 'Показати розвʼязок'}
          </button>
        )}
      </div>

      {showHint && <div className="cd-hint"><Prose text={lesson.hint} /></div>}
      {showSolution && (
        <>
          {!passed && (
            <div className="cd-hint">
              Подивіться, розберіть по рядку — і напишіть у себе руками, а не
              копіюйте. Урок зарахується, коли запуститься ваш код.
            </div>
          )}
          <CodeBlock code={lesson.solution} mode={modeOf(lesson.kind)} />
        </>
      )}

      <NextRead lesson={lesson} done={passed} />
    </div>
  );
}

/**
 * Абетка: перелік того, що треба знати.
 *
 * Не урок і не довідник. Урок учить писати вперше, довідник нагадує, як
 * робиться конкретна дія, — а тут просто перелічено, що взагалі існує.
 * Незнання, про яке не підозрюєш, не заважає доти, доки не з'ясується,
 * що пів року писав без уявлення про якусь звичну річ.
 *
 * Позначки ставить сама людина, і чесність тут важливіша за цифру:
 * список потрібен, щоб бачити поле, а не щоб красиво заповнити його
 * галочками.
 */
export function AbcTab({ data, reload, toast, canEdit }) {
  const marks = data?.abc || {};
  const [busy, setBusy] = useState('');
  const [only, setOnly] = useState('');       // група; порожнє — усі
  const [mustOnly, setMustOnly] = useState(false);

  const p = abcProgress(marks);
  const next = suggestNext(marks);

  const mark = async (id) => {
    if (!canEdit || busy) return;
    setBusy(id);
    // тільки те, що змінилось: увесь стан перезаписав би відмітки,
    // поставлені тим часом з іншого пристрою
    const patch = { [id]: { id, state: cycleState(marks[id]?.state), date: today() } };
    try {
      await api('/api/health', { method: 'POST', body: { action: 'abc', abc: patch } });
      await reload();
    } catch (e) {
      toast?.(e.message);
    } finally {
      setBusy('');
    }
  };

  const groups = only ? ABC_GROUPS.filter((g) => g.key === only) : ABC_GROUPS;

  return (
    <div className="cd-room">
      <div className="cd-intro-box">
        <Prose text={'Перелік того, що треба знати веброзробнику. Не підручник і не довідник: тут не вчать і не нагадують синтаксис — тут видно поле цілком і місце, де ви на ньому стоїте.'} />
        <Prose text={'Тицяйте рядок, щоб перемикати: ще ні → вчу → знаю. Позначайте чесно — список потрібен, щоб бачити, куди йти, а не щоб виглядати добре.'} />
      </div>

      <div className="ab-sum">
        <div className="ab-stat">
          <b>{p.all.known}</b><span>знаю з {p.all.total}</span>
        </div>
        {p.all.learning > 0 && (
          <div className="ab-stat"><b>{p.all.learning}</b><span>вчу</span></div>
        )}
        <div className="ab-stat ab-must">
          <b>{p.must.known}</b><span>з {p.must.total} обовʼязкових</span>
        </div>
      </div>

      {next.length > 0 && (
        <div className="ab-next">
          <div className="ab-next-h">Узятись найближче</div>
          {next.map((x) => <span key={x.id}>{x.t}</span>)}
        </div>
      )}

      <div className="ab-filt">
        <button className={'z-chip' + (!only && !mustOnly ? ' on' : '')}
          onClick={() => { setOnly(''); setMustOnly(false); }}>Усе</button>
        <button className={'z-chip' + (mustOnly ? ' on' : '')}
          onClick={() => { setMustOnly((v) => !v); setOnly(''); }}>Обовʼязкове</button>
        {ABC_GROUPS.map((g) => (
          <button key={g.key} className={'z-chip' + (only === g.key ? ' on' : '')}
            onClick={() => { setOnly(only === g.key ? '' : g.key); setMustOnly(false); }}>
            {g.label}
          </button>
        ))}
      </div>

      {groups.map((g) => {
        const items = byGroup(g.key).filter((x) => !mustOnly || x.must);
        if (!items.length) return null;
        return (
          <div className="ab-group" key={g.key}>
            <div className="ab-group-h">
              <b>{g.label}</b>
              <span>{g.hint}</span>
            </div>
            {items.map((x) => {
              const st = stateOf(marks[x.id]);
              return (
                <button
                  key={x.id}
                  className={'ab-row is-' + (st || 'none') + (busy === x.id ? ' is-busy' : '')}
                  onClick={() => mark(x.id)}
                  disabled={!canEdit}
                >
                  <span className="ab-mark">{STATES.find((s) => s.key === st)?.short}</span>
                  <span className="ab-body">
                    <span className="ab-t">
                      {x.t}
                      {x.must && <span className="ab-must-tag">треба</span>}
                    </span>
                    <span className="ab-what"><Prose text={x.what} /></span>
                    <span className="ab-why">{x.why}</span>
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * План навчання.
 *
 * Уроки в цьому застосунку — не підручник, і це чесно сказано просто на
 * сторінці. Пояснення беруть там, де його роблять як слід, а сюди
 * приходять по те, чого немає в жодному курсі: справжній код, яким
 * щодня возять посилки.
 *
 * Показані три кроки, а не всі чотирнадцять. Список на пів року
 * попереду не допомагає — він лише каже, скільки ще не зроблено.
 */
export function PlanTab({ data }) {
  const [all, setAll] = useState(false);
  const done = data?.code || {};
  const { ready, total } = planProgress(done);
  const next = nextSteps(done);
  const show = all ? PLAN : next;

  return (
    <div className="cd-room">
      <div className="cd-intro-box">
        <Prose text={'Уроки тут — не підручник: його пишуть роками й вичищають на тисячах людей. Тому пояснення беріть там, де його роблять як слід, а сюди приходьте закріплювати — на своєму коді, а не на вигаданих задачах.'} />
        <Prose text={'Кожен крок однаковий: прочитати — знайти те саме у своєму застосунку — змінити щось маленьке й подивитись, що зламається. Останнє важливіше за перші два.'} />
      </div>

      <div className="pl-src">
        <div className="pl-src-h">Звідки вчити</div>
        <b>{COURSE.name}</b>
        <p>{COURSE.what}</p>
        <p className="pl-note">{COURSE.note}</p>
      </div>

      <div className="cd-sec-h">
        <span>{all ? 'Усі кроки' : 'Найближче'}</span>
        <span className="cd-cnt">{ready} з {total}</span>
      </div>

      {show.length === 0 ? (
        <div className="h-empty">Кроки закінчились. Далі — свої зміни в застосунку й щоденник практики.</div>
      ) : show.map((s) => {
        const lesson = lessonOf(s);
        const tour = tourOf(s);
        const passed = done[s.lesson]?.state === 'done';
        return (
          <div className={'pl-step' + (passed ? ' is-done' : '')} key={s.n}>
            <div className="pl-top">
              <span className="pl-n">{s.n}</span>
              <b>{s.topic}</b>
              {passed && <span className="pl-ok">✓</span>}
            </div>
            <div className="pl-why">{s.why}</div>

            <div className="pl-row">
              <span className="pl-lab">Прочитати</span>
              <span>{s.read}</span>
            </div>
            <div className="pl-row">
              <span className="pl-lab">Відкрити</span>
              <span><code className="cd-inline">{s.file}</code></span>
            </div>
            <div className="pl-row">
              <span className="pl-lab">Знайти</span>
              <span><Prose text={s.find} /></span>
            </div>
            <div className="pl-row">
              <span className="pl-lab">Зробити</span>
              <span><Prose text={s.task} /></span>
            </div>
            {(lesson || tour) && (
              <div className="pl-lesson">
                {lesson && <>Урок: «{lesson.title}»</>}
                {lesson && tour && ' · '}
                {tour && <>Розбір: «{tour.title}»</>}
              </div>
            )}
          </div>
        );
      })}

      <button className="act-btn z-wide" style={{ marginTop: 12 }} onClick={() => setAll((v) => !v)}>
        {all ? 'Показати тільки найближче' : `Показати всі ${total} кроків`}
      </button>
    </div>
  );
}

/**
 * Щоденник практики.
 *
 * Уроки закінчуються, і саме там зупиняється більшість. Вміння
 * починається на першій зміні, якої ніхто не задавав, — і от її треба
 * записати: що хотів, що зробив, на чому спіткнувся.
 *
 * Форма навмисно вимагає лише одне поле. Щоденник, який просить
 * заповнити сім клітинок, кидають на третьому записі.
 */
function Diary({ list, canEdit, onBack, onAdd, toast }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const s = statsOf(list, today());
  const ideas = freshIdeas(list);

  const send = async () => {
    if (!String(form.want || '').trim()) { toast?.('Напишіть, що саме хотіли зробити'); return; }
    setBusy(true);
    try {
      await onAdd(form);
      setForm({});
      setOpen(false);
    } catch (e) {
      toast?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cd-room">
      <div className="cd-room-h">
        <button className="cd-back" onClick={onBack}>← До уроків</button>
        <b>Щоденник практики</b>
      </div>

      <div className="cd-intro-box">
        <Prose text={'Сюди йдуть власні зміни в цьому застосунку, а не пройдені уроки. Через пів року це готова відповідь на «що ви робили», а вже наступного тижня — спосіб не витратити вечір на помилку, яку колись уже розібрали.'} />
      </div>

      {s.entries > 0 && (
        <div className="dy-stats">
          <div className="dy-stat"><b>{s.entries}</b><span>{plural(s.entries, 'зміна', 'зміни', 'змін')}</span></div>
          <div className="dy-stat"><b>{s.days}</b><span>{plural(s.days)}</span></div>
          {s.streak > 1 && <div className="dy-stat"><b>{s.streak}</b><span>поспіль</span></div>}
          {s.fixed > 0 && <div className="dy-stat"><b>{s.fixed}</b><span>розібраних поломок</span></div>}
          {s.hours > 0 && <div className="dy-stat"><b>{s.hours}</b><span>годин</span></div>}
        </div>
      )}

      {canEdit && !open && (
        <div className="cd-actions">
          <button className="act-btn act-accept" onClick={() => setOpen(true)}>Записати зміну</button>
        </div>
      )}

      {canEdit && open && (
        <div className="dy-form">
          {PRACTICE_FIELDS.map((f) => (
            <label key={f.key} className="dy-field">
              <span className="dy-lab">
                {f.label}
                {f.required && <i className="dy-req">обовʼязково</i>}
              </span>
              <textarea
                rows={f.key === 'want' || f.key === 'broke' ? 2 : 1}
                value={form[f.key] || ''}
                placeholder={f.example}
                onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              <em className="dy-hint">{f.hint}</em>
            </label>
          ))}
          <label className="dy-field is-short">
            <span className="dy-lab">Скільки часу зайняло, хв</span>
            <input
              type="number"
              inputMode="numeric"
              value={form.mins || ''}
              onChange={(e) => setForm((v) => ({ ...v, mins: e.target.value }))}
            />
          </label>
          <div className="cd-actions">
            <button className="act-btn act-accept" onClick={send} disabled={busy}>
              {busy ? 'Записую…' : 'Зберегти'}
            </button>
            <button className="act-btn" onClick={() => { setOpen(false); setForm({}); }}>Скасувати</button>
          </div>
        </div>
      )}

      {!open && (
        <div className="dy-ideas">
          <div className="dy-ideas-h">Якщо не знаєте, з чого почати</div>
          {ideas.map((i) => (
            <div key={i.t} className="dy-idea">
              <b>{i.t}</b>
              <span>{i.d}</span>
              <code>{i.where}</code>
            </div>
          ))}
        </div>
      )}

      {list.length === 0 && !open && (
        <div className="h-empty">
          Поки порожньо. Перший запис варто зробити навіть про однорядкову зміну —
          саме з них і починається рахунок.
        </div>
      )}

      <div className="dy-list">
        {list.map((e) => (
          <div key={e.row} className="dy-entry">
            <div className="dy-entry-h">
              <b>{e.want}</b>
              <span>{e.date}{e.mins ? ` · ${e.mins} хв` : ''}</span>
            </div>
            {e.did && <div className="dy-line"><i>Зробив</i>{e.did}</div>}
            {e.where && <div className="dy-line"><i>Де</i><code>{e.where}</code></div>}
            {e.broke && <div className="dy-line is-broke"><i>Зламалось</i>{e.broke}</div>}
            {e.learned && <div className="dy-line is-learn"><i>Зрозумів</i>{e.learned}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * «Що почитати далі». Стоїть унизу уроку й до розвʼязання виглядає
 * стримано: спершу треба зробити завдання руками, а вже потім читати,
 * як воно влаштоване насправді. Після «зроблено» посилання підсвічується —
 * саме тоді від нього найбільше користі.
 */
function NextRead({ lesson, done }) {
  const n = nextLink(lesson);
  if (!n) return null;
  return (
    <a
      className={'cd-next' + (done ? ' is-done' : '')}
      href={n.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="cd-next-l">
        Далі почитати{n.foreign && ' · англійською'}
      </span>
      <b><Prose text={n.t} /></b>
      {n.d && <span className="cd-next-d"><Prose text={n.d} /></span>}
    </a>
  );
}
