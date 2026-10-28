import { setSessionCookie, clearSessionCookie, isAuthed, checkPassword, authDisabled } from '../../lib/auth';

export default async function handler(req, res) {
  try {
    return await login(req, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Помилка сервера' });
  }
}

async function login(req, res) {
  if (req.method === 'GET') {
    return res.json({ authed: isAuthed(req), required: !authDisabled() });
  }

  if (req.method === 'DELETE') {
    clearSessionCookie(res);
    return res.json({ ok: true });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body || {};
  if (authDisabled()) return res.json({ ok: true });
  if (!process.env.APP_PASSWORD) throw new Error('Не заданий APP_PASSWORD у змінних оточення');

  if (checkPassword(password)) {
    setSessionCookie(res);
    return res.json({ ok: true });
  }
  // Пауза після невдалої спроби уповільнює перебір пароля
  await new Promise((r) => setTimeout(r, 1000));
  return res.status(401).json({ error: 'Невірний пароль' });
}
