/**
 * Вхід і права.
 *
 * Тут немає цифр, які можна звірити очима: помилка в цих функціях не
 * показує нічого дивного на екрані — вона просто пускає всередину того,
 * кого не мала. Ми таке вже ловили двічі: відкрите читання особистого
 * розділу й обхід `adminOnly` гостем. Обидва рази код виглядав правильно.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  makeToken, readToken, sameSecret, keyFrom, parseCookies,
  session, withAuth, windowEnd, isChief, chiefName, currentActor,
  WINDOW_HOURS, COOKIE_NAME,
} from '../lib/auth.js';

/* ── оточення тримаємо під контролем ───────────────────────────────────── */

/*
 * Оточення міняємо на час одного тесту й повертаємо назад.
 *
 * `await` тут обовʼязковий: без нього `finally` спрацьовує на поверненні
 * обіцянки, а не на її виконанні, — змінні встигають повернутись раніше,
 * ніж тест до них дійде, і перевірка мовчки міряє не те.
 */
const withEnv = async (vars, fn) => {
  const saved = {};
  Object.entries(vars).forEach(([k, v]) => {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  });
  try {
    return await fn();
  } finally {
    Object.entries(saved).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
  }
};

const SECRET = 'test-secret-not-a-real-one';

/* ── токен ─────────────────────────────────────────────────────────────── */

test('свій токен читається назад', async () => {
  await withEnv({ SESSION_SECRET: SECRET }, () => {
    const who = readToken(makeToken({ callsign: 'Fantomas', role: 'admin' }));
    assert.equal(who.callsign, 'Fantomas');
    assert.equal(who.role, 'admin');
    assert.ok(who.expires > Date.now());
  });
});

test('підмінений вміст токена не проходить', async () => {
  await withEnv({ SESSION_SECRET: SECRET }, () => {
    const token = makeToken({ callsign: 'Черговий', role: 'user' });
    const [, sig] = token.split('.');
    // той самий підпис, але позивний і роль переписані
    const forged = Buffer.from(JSON.stringify({
      t: Date.now(), c: 'Черговий', r: 'admin', e: Date.now() + 3600000,
    }), 'utf8').toString('base64url');
    assert.equal(readToken(`${forged}.${sig}`), null);
  });
});

test('підмінений підпис не проходить', async () => {
  await withEnv({ SESSION_SECRET: SECRET }, () => {
    const [payload, sig] = makeToken({ callsign: 'Fantomas' }).split('.');
    const other = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    assert.equal(readToken(`${payload}.${other}`), null);
  });
});

test('токен, підписаний іншим ключем, не проходить', async () => {
  const token = await withEnv({ SESSION_SECRET: SECRET }, () => makeToken({ callsign: 'Fantomas' }));
  await withEnv({ SESSION_SECRET: 'зовсім інший ключ' }, () => {
    assert.equal(readToken(token), null);
  });
});

test('підпис іншої довжини не проходить і не падає', async () => {
  await withEnv({ SESSION_SECRET: SECRET }, () => {
    const [payload] = makeToken({ callsign: 'Fantomas' }).split('.');
    assert.equal(readToken(`${payload}.коротко`), null);
  });
});

test('сміття замість токена — просто null', async () => {
  await withEnv({ SESSION_SECRET: SECRET }, () => {
    assert.equal(readToken(''), null);
    assert.equal(readToken(null), null);
    assert.equal(readToken('без крапки'), null);
    assert.equal(readToken('.'), null);
    assert.equal(readToken('не-base64.не-підпис'), null);
  });
});

test('прострочений токен не проходить, хоч підпис і правильний', async () => {
  await withEnv({ SESSION_SECRET: SECRET }, () => {
    // підписуємо руками payload із часом, що вже минув
    const past = Date.now() - 1000;
    const payload = Buffer.from(JSON.stringify({
      t: past - 3600000, c: 'Fantomas', r: 'admin', e: past,
    }), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    assert.equal(readToken(`${payload}.${sig}`), null);
  });
});

test('роль «user» зберігається — черговий не стає адміністратором', async () => {
  await withEnv({ SESSION_SECRET: SECRET }, () => {
    assert.equal(readToken(makeToken({ callsign: 'Черговий', role: 'user' })).role, 'user');
  });
});

test('невідома роль — не адміністратор', async () => {
  // правило має падати в безпечний бік: адміністратором стає лише те, що
  // записане адміністратором, а не «все, що не user»
  await withEnv({ SESSION_SECRET: SECRET }, () => {
    for (const role of ['guest', '', 'адмін', 'Admin', null]) {
      const payload = Buffer.from(JSON.stringify({
        t: Date.now(), c: 'Хтось', r: role, e: Date.now() + 3600000,
      }), 'utf8').toString('base64url');
      const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
      assert.equal(readToken(`${payload}.${sig}`).role, 'user', `роль ${JSON.stringify(role)}`);
    }
  });
});

test('роль задана явно — вона й лишається', async () => {
  // так її задають обидва місця, де видають токен: спільний пароль дає
  // адміністратора, вхід за позивним — роль із листа «Люди»
  await withEnv({ SESSION_SECRET: SECRET }, () => {
    assert.equal(readToken(makeToken({ callsign: '', role: 'admin' })).role, 'admin');
    assert.equal(readToken(makeToken({ callsign: 'Fantomas', role: 'admin' })).role, 'admin');
  });
});

test('роль забули передати — найменша, а не найбільша', async () => {
  await withEnv({ SESSION_SECRET: SECRET }, () => {
    assert.equal(readToken(makeToken({ callsign: 'Хтось' })).role, 'user');
    assert.equal(readToken(makeToken()).role, 'user');
  });
});

/* ── порівняння ключів ─────────────────────────────────────────────────── */

test('sameSecret: однакові — так, різні — ні', async () => {
  assert.equal(sameSecret('abc123', 'abc123'), true);
  assert.equal(sameSecret('abc123', 'abc124'), false);
});

test('sameSecret: різна довжина — ні, і без порівняння вмісту', async () => {
  assert.equal(sameSecret('abc', 'abcd'), false);
  assert.equal(sameSecret('', 'a'), false);
});

test('sameSecret: не рядок — завжди ні', async () => {
  // інакше `undefined === undefined` пустило б усередину того, хто просто
  // не передав ключа
  assert.equal(sameSecret(undefined, undefined), false);
  assert.equal(sameSecret(null, null), false);
  assert.equal(sameSecret(123, 123), false);
  assert.equal(sameSecret('abc', null), false);
});

test('sameSecret: два порожні рядки — так, тому ключ і перевіряють на довжину окремо', async () => {
  // саме через це маршрути вимагають від ключа мінімальної довжини:
  // порожній PACK_TOKEN інакше збігся б із порожнім ключем у посиланні
  assert.equal(sameSecret('', ''), true);
});

/* ── звідки береться ключ ──────────────────────────────────────────────── */

test('keyFrom: заголовок Bearer', async () => {
  assert.equal(keyFrom({ headers: { authorization: 'Bearer abc123' } }), 'abc123');
});

test('keyFrom: заголовок без «Bearer» теж читається', async () => {
  assert.equal(keyFrom({ headers: { authorization: 'abc123' } }), 'abc123');
});

test('keyFrom: тіло запиту й адреса', async () => {
  assert.equal(keyFrom({ headers: {}, body: { token: 'з-тіла' } }), 'з-тіла');
  assert.equal(keyFrom({ headers: {}, query: { token: 'з-адреси' } }), 'з-адреси');
});

test('keyFrom: заголовок головніший за тіло й адресу', async () => {
  assert.equal(keyFrom({
    headers: { authorization: 'Bearer з-заголовка' },
    body: { token: 'з-тіла' },
    query: { token: 'з-адреси' },
  }), 'з-заголовка');
});

test('keyFrom: ключа немає — порожній рядок, а не падіння', async () => {
  assert.equal(keyFrom({ headers: {} }), '');
});

/* ── куки ──────────────────────────────────────────────────────────────── */

test('parseCookies: кілька кук', async () => {
  const out = parseCookies({ headers: { cookie: 'a=1; b=2; c=3' } });
  assert.deepEqual(out, { a: '1', b: '2', c: '3' });
});

test('parseCookies: значення розкодовується', async () => {
  const out = parseCookies({ headers: { cookie: 'who=%D0%A4%D0%B0%D0%BD%D1%82%D0%BE%D0%BC' } });
  assert.equal(out.who, 'Фантом');
});

test('parseCookies: значення зі знаком «=» усередині не ріжеться', async () => {
  // токен закінчується на base64url і цілком може містити «=»
  const out = parseCookies({ headers: { cookie: 'token=abc.def==' } });
  assert.equal(out.token, 'abc.def==');
});

test('parseCookies: кук немає — порожньо, а не падіння', async () => {
  assert.deepEqual(parseCookies({ headers: {} }), {});
  assert.deepEqual(parseCookies({ headers: { cookie: '' } }), {});
});

/* ── сесія ─────────────────────────────────────────────────────────────── */

const reqWith = (token) => ({
  headers: token ? { cookie: `${COOKIE_NAME}=${token}` } : {},
  method: 'GET',
});

test('сесія читається з куки', async () => {
  await withEnv({ SESSION_SECRET: SECRET, APP_PASSWORD: 'пароль' }, () => {
    const who = session(reqWith(makeToken({ callsign: 'Fantomas', role: 'admin' })));
    assert.equal(who.callsign, 'Fantomas');
  });
});

test('без куки сесії немає', async () => {
  await withEnv({ SESSION_SECRET: SECRET, APP_PASSWORD: 'пароль' }, () => {
    assert.equal(session(reqWith(null)), null);
  });
});

test('без APP_PASSWORD застосунок відкритий — і це має бути видно', async () => {
  // не помилка, а свідоме рішення: поки пароля немає, застосунок ще не
  // налаштований. Тест стоїть тут, щоб цього не забули: варто змінній
  // зникнути з Vercel — і вхід перестає щось означати
  await withEnv({ APP_PASSWORD: undefined }, () => {
    const who = session(reqWith(null));
    assert.equal(who.role, 'admin');
  });
});

/* ── withAuth ──────────────────────────────────────────────────────────── */

function fakeRes() {
  const res = { code: 0, body: null, headers: {} };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}

const run = async (opts, req) => {
  const res = fakeRes();
  let reached = false;
  let seenActor = null;
  await withAuth(async () => {
    reached = true;
    seenActor = currentActor();
    return res.status(200).json({ ok: true });
  }, opts)(req, res);
  return { res, reached, seenActor };
};

test('без сесії маршрут не пускає', async () => {
  await withEnv({ SESSION_SECRET: SECRET, APP_PASSWORD: 'пароль' }, async () => {
    const { res, reached } = await run({}, reqWith(null));
    assert.equal(res.code, 401);
    assert.equal(reached, false);
  });
});

test('із сесією маршрут виконується, і журнал знає, хто це був', async () => {
  await withEnv({ SESSION_SECRET: SECRET, APP_PASSWORD: 'пароль' }, async () => {
    const { res, reached, seenActor } = await run({}, reqWith(makeToken({ callsign: 'Fantomas' })));
    assert.equal(res.code, 200);
    assert.equal(reached, true);
    assert.equal(seenActor, 'Fantomas');
  });
});

test('adminOnly не пускає чергового', async () => {
  await withEnv({ SESSION_SECRET: SECRET, APP_PASSWORD: 'пароль' }, async () => {
    const req = reqWith(makeToken({ callsign: 'Черговий', role: 'user' }));
    const { res, reached } = await run({ adminOnly: true }, req);
    assert.equal(res.code, 403);
    assert.equal(reached, false);
  });
});

test('adminOnly пускає адміністратора', async () => {
  await withEnv({ SESSION_SECRET: SECRET, APP_PASSWORD: 'пароль' }, async () => {
    const req = reqWith(makeToken({ callsign: 'Fantomas', role: 'admin' }));
    const { res, reached } = await run({ adminOnly: true }, req);
    assert.equal(res.code, 200);
    assert.equal(reached, true);
  });
});

test('гість не стає адміністратором — саме тут колись і була дірка', async () => {
  /*
   * Перевірка `adminOnly` починалась із `!guest`, тобто гість її й
   * оминав. Жоден маршрут тоді не поєднував `adminOnly` з `openGet`, тож
   * назовні це не вилізло — досить було додати `openGet` до адмінського
   * маршруту, і той відкрився б мовчки.
   */
  await withEnv({ SESSION_SECRET: SECRET, APP_PASSWORD: 'пароль' }, async () => {
    const { res, reached } = await run(
      { adminOnly: true, openGet: true },
      { ...reqWith(null), method: 'GET' },
    );
    assert.equal(res.code, 403);
    assert.equal(reached, false);
  });
});

test('openGet відкриває читання, але не запис', async () => {
  await withEnv({ SESSION_SECRET: SECRET, APP_PASSWORD: 'пароль' }, async () => {
    const get = await run({ openGet: true }, { ...reqWith(null), method: 'GET' });
    assert.equal(get.res.code, 200);

    const post = await run({ openGet: true }, { ...reqWith(null), method: 'POST' });
    assert.equal(post.res.code, 401);
    assert.equal(post.reached, false);
  });
});

test('помилка всередині маршруту стає 500, а не падінням процесу', async () => {
  await withEnv({ SESSION_SECRET: SECRET, APP_PASSWORD: 'пароль' }, async () => {
    const res = fakeRes();
    const quiet = console.error;
    console.error = () => {};
    try {
      await withAuth(async () => { throw new Error('щось пішло не так'); })(
        reqWith(makeToken({ callsign: 'Fantomas' })), res,
      );
    } finally {
      console.error = quiet;
    }
    assert.equal(res.code, 500);
    assert.equal(res.body.error, 'щось пішло не так');
  });
});

/* ── головний ──────────────────────────────────────────────────────────── */

test('без OWNER головного немає — правом не можна розжитись мовчки', async () => {
  await withEnv({ OWNER: undefined, HEALTH_OWNER: undefined }, () => {
    assert.equal(chiefName(), '');
    assert.equal(isChief('Fantomas'), false);
    assert.equal(isChief(''), false);
  });
});

test('позивний головного звіряється без огляду на регістр і пробіли', async () => {
  await withEnv({ OWNER: 'Fantomas', HEALTH_OWNER: undefined }, () => {
    assert.equal(isChief('Fantomas'), true);
    assert.equal(isChief('fantomas'), true);
    assert.equal(isChief('  FANTOMAS  '), true);
    assert.equal(isChief('Хтось інший'), false);
    assert.equal(isChief(null), false);
  });
});

/* ── вікно сесії ───────────────────────────────────────────────────────── */

test('вікно закінчується о рівній годині, а не через 4 години після входу', async () => {
  // усі виходять одночасно: це й є сенс вікна
  const end = windowEnd(Date.UTC(2026, 7, 20, 9, 37, 12));
  const kyiv = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(end));
  assert.equal(kyiv.slice(3), '00:00');
  assert.equal(Number(kyiv.slice(0, 2)) % WINDOW_HOURS, 0);
});

test('вікно завжди попереду й не довше за свою довжину', async () => {
  const now = Date.UTC(2026, 7, 20, 9, 37, 12);
  const end = windowEnd(now);
  assert.ok(end > now);
  assert.ok(end - now <= WINDOW_HOURS * 3600 * 1000);
});
