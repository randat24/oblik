import test from 'node:test';
import assert from 'node:assert/strict';
import { isRetryable, backoffMs, friendlyError, statusFor, withRetry } from '../lib/quota.js';

/* Саме той об'єкт, який кидає googleapis, коли скінчилась квота */
const quotaErr = () => {
  const e = new Error("Quota exceeded for quota metric 'Read requests' and limit "
    + "'Read requests per minute per user' of service 'sheets.googleapis.com' "
    + "for consumer 'project_number:263257490376'.");
  e.code = 429;
  return e;
};

test('перевищену квоту повторюємо', () => {
  assert.equal(isRetryable(quotaErr()), true);
});

test('квоту впізнаємо і без коду 429 — Google віддає її як 403', () => {
  const e = new Error('Quota exceeded for quota metric ...');
  e.code = 403;
  assert.equal(isRetryable(e), true);
});

test('тимчасову недоступність сервісу повторюємо', () => {
  const e = new Error('The service is currently unavailable.');
  e.code = 503;
  assert.equal(isRetryable(e), true);
});

test('обрив з\'єднання повторюємо', () => {
  const e = new Error('socket hang up');
  e.code = 'ECONNRESET';
  assert.equal(isRetryable(e), true);
});

test('відмову в доступі не повторюємо — друга спроба дасть те саме', () => {
  const e = new Error('The caller does not have permission');
  e.code = 403;
  assert.equal(isRetryable(e), false);
});

test('невідомий лист не повторюємо', () => {
  const e = new Error('Unable to parse range: \'Кропиваа\'');
  e.code = 400;
  assert.equal(isRetryable(e), false);
});

test('порожню помилку не повторюємо', () => {
  assert.equal(isRetryable(null), false);
  assert.equal(isRetryable(undefined), false);
});

test('повідомлення знаходимо і всередині відповіді, а не лише в message', () => {
  const e = new Error('Request failed');
  e.response = { data: { error: { message: 'Quota exceeded for quota metric' } } };
  assert.equal(isRetryable(e), true);
});

test('пауза подвоюється і має стелю', () => {
  const noJitter = () => 0;
  assert.equal(backoffMs(1, noJitter), 400);
  assert.equal(backoffMs(2, noJitter), 800);
  assert.equal(backoffMs(3, noJitter), 1600);
  assert.equal(backoffMs(4, noJitter), 3200);
  // далі впирається в стелю, а не росте до хвилин
  assert.equal(backoffMs(9, noJitter), 4000);
});

test('розкид додає не більше сорока відсотків', () => {
  assert.equal(backoffMs(1, () => 1), 560);
  const v = backoffMs(2, () => 0.5);
  assert.ok(v > 800 && v <= 1120, `несподівана пауза: ${v}`);
});

test('квота пояснюється людською мовою, без назви метрики й номера проєкту', () => {
  const t = friendlyError(quotaErr());
  assert.ok(t.includes('Зачекайте хвилину'), t);
  assert.ok(!t.includes('quota metric'), t);
  assert.ok(!/\d{9}/.test(t), 'номер проєкту не для очей користувача');
});

test('відмова в доступі пояснює, що робити', () => {
  const e = new Error('The caller does not have permission');
  assert.ok(friendlyError(e).includes('службовому акаунту'));
});

test('перейменований лист пояснюється окремо', () => {
  const e = new Error('Unable to parse range: \'Старі радейки\'');
  assert.ok(friendlyError(e).includes('перейменували'));
});

test('незнайому помилку не підміняємо заспокійливою фразою', () => {
  assert.equal(friendlyError(new Error('Щось геть нове')), 'Щось геть нове');
});

test('квота — це 429, а не «щось зламалось»', () => {
  assert.equal(statusFor(quotaErr()), 429);
  assert.equal(statusFor(new Error('The caller does not have permission')), 403);
  assert.equal(statusFor(new Error('Щось геть нове')), 500);
});

test('повтор доводить справу до кінця, якщо відмова була тимчасова', async () => {
  let n = 0;
  const slept = [];
  const got = await withRetry(() => {
    n++;
    if (n < 3) throw quotaErr();
    return 'дані';
  }, { sleep: (ms) => { slept.push(ms); }, rnd: () => 0 });

  assert.equal(got, 'дані');
  assert.equal(n, 3);
  assert.deepEqual(slept, [400, 800]);
});

test('безнадійну помилку не повторюємо жодного разу', async () => {
  let n = 0;
  await assert.rejects(
    withRetry(() => { n++; throw new Error('Unable to parse range'); }, { sleep: async () => {} }),
    /Unable to parse range/,
  );
  assert.equal(n, 1);
});

test('коли спроби скінчились — віддаємо останню помилку, а не ковтаємо', async () => {
  let n = 0;
  await assert.rejects(
    withRetry(() => { n++; throw quotaErr(); }, { tries: 3, sleep: async () => {}, rnd: () => 0 }),
    /Quota exceeded/,
  );
  assert.equal(n, 3);
});
