import {
  setSessionCookie, clearSessionCookie, session, isChief, signingReady, authRequired, sameSecret,
} from '../../lib/auth';
import { readPeople, verifyPin } from '../../lib/people';

/*
 * Пауза після невдалої спроби.
 *
 * Позивні екран входу показує всім, а PIN короткий — без паузи його
 * перебирають за хвилини. Секунда на кожну помилку людині непомітна, а
 * перебір робить у тисячі разів довшим. Від багатьох паралельних запитів
 * це не рятує — для того потрібне сховище лічильників, якого тут немає.
 */
const slowDown = () => new Promise((r) => setTimeout(r, 1000));

export default async function handler(req, res) {
  const required = authRequired();

  if (req.method === 'GET') {
    const who = session(req);
    // список позивних потрібен на екрані входу, щоб не згадувати написання
    let callsigns = [];
    if (required) {
      try {
        callsigns = (await readPeople()).filter((p) => p.active && p.hash).map((p) => p.callsign);
      } catch {
        callsigns = [];
      }
    }
    return res.json({
      authed: !!who,
      required,
      callsigns,
      callsign: who?.callsign || '',
      role: who?.role || 'admin',
      chief: isChief(who?.callsign),
      expires: who?.expires || 0,
    });
  }

  if (req.method === 'DELETE') {
    clearSessionCookie(res);
    return res.json({ ok: true });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!required) return res.json({ ok: true });
  if (!process.env.APP_PASSWORD) {
    return res.status(500).json({
      error: 'APP_PASSWORD не задано — вхід вимкнено. Додайте змінну в налаштуваннях і зробіть новий деплой.',
    });
  }

  /*
   * Пароль просять, а підписати сесію нічим.
   *
   * Мовчки підписати відомим рядком означало б видати всім робочий на
   * вигляд вхід, який підробляється з вихідників. Краще не пустити
   * нікого й сказати, чого бракує: це помітно за хвилину, а не за пів
   * року.
   */
  if (!signingReady()) {
    return res.status(500).json({
      error: 'SESSION_SECRET не задано — вхід вимкнено. Додайте змінну в налаштуваннях і зробіть новий деплой.',
    });
  }

  const { callsign, pin, password } = req.body || {};

  // Спільний пароль лишається — ним заходить адміністратор, який заводить людей.
  // Поки нікого не заведено, це єдиний спосіб увійти.
  if (password) {
    if (!sameSecret(password, process.env.APP_PASSWORD)) {
      await slowDown();
      return res.status(401).json({ error: 'Невірний пароль' });
    }
    const end = setSessionCookie(res, { callsign: '', role: 'admin' });
    return res.json({ ok: true, role: 'admin', callsign: '', expires: end });
  }

  if (!callsign || !pin) return res.status(400).json({ error: 'Вкажіть позивний і PIN' });

  const person = verifyPin(await readPeople(), callsign, pin);
  if (!person) {
    await slowDown();
    return res.status(401).json({ error: 'Невірний позивний або PIN' });
  }

  const end = setSessionCookie(res, { callsign: person.callsign, role: person.role });
  return res.json({ ok: true, role: person.role, callsign: person.callsign, expires: end });
}
