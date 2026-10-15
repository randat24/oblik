// Розширення в імпортах сусідів стоїть навмисно: файл покритий тестами, а
// вбудований у Node запускач шукає модуль рівно за тим шляхом, який написали.

/**
 * Квота Google на читання таблиці.
 *
 * Обмеження — шістдесят читань на хвилину на користувача. Одне відкриття
 * головної робило їх близько дюжини: шість листів майна окремими
 * запитами, плюс склад, журнал, акти, звірки, доставки. Кілька переходів
 * поспіль — і сервіс відповідав «Quota exceeded», а застосунок показував
 * цей рядок англійською просто в шапці.
 *
 * Лікується це з двох боків. Перший — читати менше: кілька листів однієї
 * таблиці беруться одним `batchGet` замість N окремих запитів. Другий —
 * пережити сплеск: перевищення квоти не поломка, а «зараз зайнято», і
 * друга спроба за пів секунди здебільшого проходить.
 *
 * Тут лежить друга половина, сама по собі, без доступу до мережі й до
 * таблиць: як упізнати тимчасову відмову, скільки чекати перед наступною
 * спробою і що сказати людині, коли спроби скінчились.
 */

/**
 * Чи варто повторювати запит.
 *
 * Повторюємо лише те, що минає саме: перевищену квоту, тимчасову
 * недоступність сервісу і обрив з'єднання. Помилки доступу (401, 403 без
 * згадки про квоту), «немає такого листа» і хиби в самому запиті
 * повторювати марно — вони дадуть те саме.
 *
 * `403` у Google означає і «немає прав», і «вичерпано квоту» — розрізняє
 * їх лише текст. Тому дивимось не тільки на код.
 */
export function isRetryable(err) {
  if (!err) return false;

  const code = Number(err.code ?? err.status ?? err.response?.status);
  const text = [
    err.message,
    err.response?.data?.error?.message,
    err.errors?.[0]?.message,
    err.errors?.[0]?.reason,
  ].filter(Boolean).join(' ').toLowerCase();

  // обрив з'єднання — мережа, а не відповідь сервера
  const net = ['econnreset', 'etimedout', 'econnrefused', 'epipe', 'eai_again', 'socket hang up'];
  if (net.some((n) => text.includes(n)) || net.includes(String(err.code || '').toLowerCase())) {
    return true;
  }

  if (code === 429) return true;
  if (code >= 500 && code <= 599) return true;

  const quota = ['quota exceeded', 'rate limit', 'ratelimitexceeded', 'resource_exhausted',
    'userratelimitexceeded', 'too many requests'];
  if (quota.some((q) => text.includes(q))) return true;

  return false;
}

/**
 * Скільки чекати перед спробою номер `attempt` (рахуємо з одиниці).
 *
 * Подвоєння з розкидом. Розкид тут не окраса: коли сторінка відкриває
 * півдюжини запитів одночасно, усі вони впираються в квоту в ту саму
 * мить і без розкиду повторюються теж одночасно — і впираються знову.
 *
 * `rnd` віддається назовні, щоб тест міг перевірити межі, а не ловити
 * випадковість.
 */
export function backoffMs(attempt, rnd = Math.random) {
  const n = Math.max(1, Math.floor(attempt));
  const base = Math.min(400 * 2 ** (n - 1), 4000);
  return Math.round(base + base * 0.4 * rnd());
}

/** Текст помилки Google у вигляді, придатному для пошуку */
function textOf(err) {
  return [
    err?.message,
    err?.response?.data?.error?.message,
    err?.errors?.[0]?.message,
  ].filter(Boolean).join(' ');
}

/**
 * Що показати людині.
 *
 * «Quota exceeded for quota metric 'Read requests'…» нічого не каже тому,
 * хто просто відкрив налаштування. Причина тимчасова, дія очевидна —
 * так і пишемо, українською, без назви метрики й номера проєкту.
 *
 * Решту повідомлень лишаємо як є: вигадувати замість невідомої помилки
 * заспокійливу фразу гірше, ніж показати справжню.
 */
export function friendlyError(err) {
  const text = textOf(err);
  const low = text.toLowerCase();

  if (low.includes('quota exceeded') || low.includes('rate limit')
    || low.includes('ratelimitexceeded') || low.includes('resource_exhausted')
    || low.includes('too many requests')) {
    return 'Google обмежив читання таблиці — забагато запитів за хвилину. Зачекайте хвилину і спробуйте ще раз.';
  }
  if (low.includes('the caller does not have permission') || low.includes('permission_denied')) {
    return 'Немає доступу до таблиці — перевірте, чи відкрито її службовому акаунту.';
  }
  if (low.includes('requested entity was not found') || low.includes('unable to parse range')) {
    return 'Не знайдено лист у таблиці — можливо, вкладку перейменували.';
  }
  return text || 'Помилка сервера';
}

/** Код відповіді: перевищена квота — це 429, а не «щось зламалось» */
export function statusFor(err) {
  const low = textOf(err).toLowerCase();
  const code = Number(err?.code ?? err?.status ?? err?.response?.status);
  if (code === 429) return 429;
  if (low.includes('quota exceeded') || low.includes('rate limit')
    || low.includes('resource_exhausted') || low.includes('too many requests')) {
    return 429;
  }
  if (code === 403 || low.includes('permission')) return 403;
  return 500;
}

/**
 * Повторює дію, доки вона не вдасться або доки не скінчаться спроби.
 *
 * `sleep` і `rnd` віддаються назовні заради тестів: інакше перевірка
 * трьох спроб чекала б по-справжньому майже секунду.
 */
export async function withRetry(fn, { tries = 4, sleep = wait, rnd = Math.random } = {}) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i === tries || !isRetryable(err)) throw err;
      await sleep(backoffMs(i, rnd));
    }
  }
  throw last;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
