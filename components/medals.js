import { LESSONS, lessonProgress, factOf } from '../lib/mult';

/**
 * Знаки за таблиці.
 *
 * Вісім таблиць — вісім знаків, і їх збирають. Раніше на їх місці стояли
 * просто цифри в кружечках: видно, скільки пройдено, але нема чого
 * впізнавати. Знак має власний силует, і той силует не випадковий —
 * у фігури рівно стільки сторін, скільки в таблиці: трійка трикутник,
 * шістка шестикутник, вісімка восьмикутник.
 *
 * Двійка й дев'ятка з ряду випадають, бо двосторонньої фігури не буває,
 * а дев'ятикутник на тридцяти чотирьох пікселях не відрізнити від кола.
 * Їм — два кружальця і сітка три на три.
 *
 * Цифра стоїть усередині багатокутників — без неї сьомий знак від
 * восьмого на такому розмірі відрізняє хіба що той, хто вже знає, що
 * шукати. Двійці й дев'ятці цифра не потрібна: їх ні з чим не сплутати,
 * а намальована поверх кружалець вона просто ховається в них.
 */

/** Вершини правильного багатокутника. Починаємо згори, щоб фігури стояли рівно. */
function poly(n, r = 7.6, cx = 10, cy = 10) {
  return [...Array(n)].map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

/** Силует знака — без цифри: її малює сам значок поверх */
function Shape({ table }) {
  if (table === 2) {
    return (
      <>
        <circle cx="5.6" cy="10" r="4.2" />
        <circle cx="14.4" cy="10" r="4.2" />
      </>
    );
  }
  if (table === 9) {
    const dots = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        dots.push(<circle key={`${r}${c}`} cx={5.2 + c * 4.8} cy={5.2 + r * 4.8} r="1.5" />);
      }
    }
    return <>{dots}</>;
  }
  return <polygon points={poly(table)} />;
}

/**
 * Один знак.
 *
 * `on` — здобутий, `now` — та таблиця, з якої зараз питання. Це дві
 * різні речі, і вони не заміняють одна одну: доки «зараз» малювалося
 * тією самою заливкою, що й «здобуто», ще не відкрита таблиця в мить
 * свого питання виглядала здобутою.
 */
export function Medal({ table, on = false, now = false, size = 34 }) {
  // цифра лише там, де силует сам по собі не однозначний
  const digit = table >= 3 && table <= 8;
  return (
    <span
      className={'medal' + (on ? ' is-on' : '') + (now ? ' is-now' : '')}
      title={`Таблиця на ${table}${on ? ' — здобуто' : ''}`}
    >
      <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true">
        <Shape table={table} />
      </svg>
      {digit && <i>{table}</i>}
    </span>
  );
}

/**
 * Ряд знаків.
 *
 * `active` — числа, з яких складено поточний приклад. Підсвічуємо обидва
 * множники, а не один: 6×7 належить і шостій таблиці, і сьомій, і
 * вибирати з них «головну» означало б збрехати.
 */
export function MedalRow({ prog, active = [], compact = false }) {
  // за числом, а не за порядком уроків: ряд знаків читають як лінійку
  const tables = LESSONS.filter((l) => l.kind === 'table')
    .slice()
    .sort((x, y) => x.table - y.table);
  return (
    <div className={'medals' + (compact ? ' is-compact' : '')}>
      {tables.map((l) => {
        const done = lessonProgress(l, prog) >= 1;
        const now = active.includes(l.table);
        return (
          <Medal key={l.key} table={l.table} on={done} now={now}
            size={compact ? 26 : 34} />
        );
      })}
    </div>
  );
}

/** Множники поточного питання — з них і виходить підсвітка ряду */
export function tablesOf(q) {
  if (!q?.key) return [];
  const { a, b } = factOf(q.key);
  return a === b ? [a] : [a, b];
}
