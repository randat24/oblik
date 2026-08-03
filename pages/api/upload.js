import { withAuth } from '../../lib/auth';
import { uploadPhoto, driveReady, folderId } from '../../lib/drive';

// Фото вже стиснуте в браузері (до ~1.5 МБ), тож приймаємо тіло напряму,
// без стандартного JSON bodyParser
export const config = { api: { bodyParser: false } };

const MAX_BYTES = 8 * 1024 * 1024;

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('Фото завелике (максимум 8 МБ)');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    return res.json({ ready: driveReady() });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!driveReady()) {
    return res.status(503).json({
      error: 'Не підключено Google Drive для фото. Додайте змінну GOOGLE_DRIVE_FOLDER_ID '
        + '(ID папки на Спільному диску, до якої надано доступ сервісному акаунту) і зробіть Redeploy.',
    });
  }

  const buf = await readBody(req);
  if (!buf.length) return res.status(400).json({ error: 'Порожній файл' });

  try {
    const fileId = await uploadPhoto(buf, 'image/jpeg', `box-${Date.now()}.jpg`);
    return res.json({ fileId });
  } catch (err) {
    const msg = err.message || '';
    // Найчастіші причини — краще сказати прямо, ніж віддавати текст Google як є
    if (/File not found/i.test(msg)) {
      return res.status(400).json({
        error: `Папку ${folderId()} не знайдено. Перевірте, що GOOGLE_DRIVE_FOLDER_ID — це ID папки `
          + 'і що до неї (або до Спільного диска, де вона лежить) надано доступ сервісному акаунту '
          + `${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || ''} з правами «Менеджер контенту».`,
      });
    }
    if (/storageQuotaExceeded|storage quota/i.test(msg)) {
      return res.status(400).json({
        error: 'У сервісного акаунта немає власного місця на Диску, тож він не може '
          + 'створити файл у звичайній папці. Два способи це полагодити: '
          + '(1) перенести папку на Спільний диск (Shared Drive) — він у Google Диску '
          + 'в окремому розділі ліворуч, не всередині «Мій диск»; або '
          + '(2) увімкнути делегування і задати змінну GOOGLE_IMPERSONATE_USER '
          + 'з вашою робочою поштою — тоді файли створюватимуться від вашого імені.',
      });
    }
    if (/insufficient|forbidden|permission/i.test(msg)) {
      return res.status(400).json({
        error: 'Немає прав на запис у папку. Надайте сервісному акаунту '
          + `${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || ''} права «Менеджер контенту» на Спільному диску.`,
      });
    }
    throw err;
  }
});
