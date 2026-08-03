import { withAuth } from '../../lib/auth';
import { uploadPhoto, driveReady } from '../../lib/drive';

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

  const fileId = await uploadPhoto(buf, 'image/jpeg', `box-${Date.now()}.jpg`);
  res.json({ fileId });
});
