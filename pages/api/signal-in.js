import { sameSecret, keyFrom } from '../../lib/auth';
import { messageFrom, MAX_TEXT } from '../../lib/inbox';
import { addMessage } from '../../lib/inbox-store';
import { logChange } from '../../lib/log';
import { friendlyError, statusFor } from '../../lib/quota';

/**
 * Прийом повідомлень зі швидкої команди iPhone: «Поділитися» в Signal.
 *
 * Вмикається лише змінною SIGNAL_INGEST_TOKEN. Поки її немає або ключ коротший
 * за 16 символів, маршрут не існує. Ключ спільний, тож «Від» — це лише підпис,
 * який вказала сама команда, а не доказ, хто надіслав.
 */
export default async function handler(req, res) {
  const secret = process.env.SIGNAL_INGEST_TOKEN;
  if (!secret || secret.length < 16) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!sameSecret(String(keyFrom(req)), secret)) {
    return res.status(401).json({ error: 'Не той ключ' });
  }

  // Перевірка налаштувань: нічого не записує
  if (req.method === 'GET') {
    return res.json({ ok: true, message: 'Ключ правильний. Тепер надсилайте POST.', maxText: MAX_TEXT });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const m = messageFrom(req.body);
  if (m.error) return res.status(400).json({ error: m.error });

  try {
    const saved = await addMessage(m);
    // сам текст у «Журнал» не кладемо: туди дивляться інші люди й з інших причин
    await logChange({
      sheet: 'Вхідні', action: 'Надійшло з Signal', after: `${m.text.length} знаків`,
      who: `команда: ${m.from || 'без підпису'}`,
    });
    return res.json({ ok: true, id: saved.id, message: 'Надіслано у Вхідні' });
  } catch (e) {
    console.error(e);
    // маршрут без withAuth, тож перевищену квоту перекладаємо сам: відповідь
    // команди видно на телефоні, і «зачекайте хвилину» корисніше за «не вдалося»
    return res.status(statusFor(e)).json({ error: friendlyError(e) });
  }
}
