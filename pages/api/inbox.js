import { withAuth, currentActor } from '../../lib/auth';
import { isDone, visibleInbox } from '../../lib/inbox';
import { readInbox, markDone } from '../../lib/inbox-store';
import { logChange } from '../../lib/log';

/*
 * Вхідні з Signal. Читає й позначає кожен, хто увійшов, як і майно звʼязку,
 * але без `openGet`: це текст із закритої групи.
 */

const LIMIT = 500;

export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    return res.json({ items: visibleInbox(await readInbox(), LIMIT) });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, id } = req.body || {};
  if (action !== 'done') return res.status(400).json({ error: 'Невідома дія' });

  const items = await readInbox();
  const m = items.find((x) => x.id === String(id || ''));
  if (!m) return res.status(404).json({ error: 'Повідомлення не знайдено — оновіть сторінку' });
  // двоє могли натиснути одночасно: перше ім'я лишається
  if (isDone(m)) return res.json({ ok: true, already: true });

  await markDone(m.row, currentActor());
  await logChange({ sheet: 'Вхідні', row: m.row, action: 'Опрацьовано', field: m.from });
  return res.json({ ok: true });
});
