import { setSessionCookie, clearSessionCookie, session } from '../../lib/auth';
import { readPeople, verifyPin } from '../../lib/people';

export default async function handler(req, res) {
  const required = !!process.env.APP_PASSWORD;

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
      expires: who?.expires || 0,
    });
  }

  if (req.method === 'DELETE') {
    clearSessionCookie(res);
    return res.json({ ok: true });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!required) return res.json({ ok: true });

  const { callsign, pin, password } = req.body || {};

  // Спільний пароль лишається — ним заходить адміністратор, який заводить людей.
  // Поки нікого не заведено, це єдиний спосіб увійти.
  if (password) {
    if (password !== process.env.APP_PASSWORD) {
      return res.status(401).json({ error: 'Невірний пароль' });
    }
    const end = setSessionCookie(res, { callsign: '', role: 'admin' });
    return res.json({ ok: true, role: 'admin', callsign: '', expires: end });
  }

  if (!callsign || !pin) return res.status(400).json({ error: 'Вкажіть позивний і PIN' });

  const person = verifyPin(await readPeople(), callsign, pin);
  if (!person) return res.status(401).json({ error: 'Невірний позивний або PIN' });

  const end = setSessionCookie(res, { callsign: person.callsign, role: person.role });
  return res.json({ ok: true, role: person.role, callsign: person.callsign, expires: end });
}
