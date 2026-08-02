import { setSessionCookie, clearSessionCookie, isAuthed } from '../../lib/auth';

export default function handler(req, res) {
  if (req.method === 'GET') {
    return res.json({ authed: isAuthed(req), required: !!process.env.APP_PASSWORD });
  }

  if (req.method === 'DELETE') {
    clearSessionCookie(res);
    return res.json({ ok: true });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body || {};
  if (!process.env.APP_PASSWORD) return res.json({ ok: true });

  if (password === process.env.APP_PASSWORD) {
    setSessionCookie(res);
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Невірний пароль' });
}
