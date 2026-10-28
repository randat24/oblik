import { withAuth } from '../../lib/auth';
import { getPhotoStream, driveReady } from '../../lib/drive';
import { isImageMime } from '../../lib/mime';

// Фото приватні: віддаємо їх лише тому, хто увійшов на сайт
export default withAuth(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const fileId = (req.query.p || '').toString();
  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return res.status(400).json({ error: 'Некоректний ідентифікатор' });
  }
  if (!driveReady()) {
    return res.status(503).json({ error: 'Не підключено Google Drive для фото' });
  }

  let stream, mimeType;
  try {
    ({ stream, mimeType } = await getPhotoStream(fileId));
  } catch {
    return res.status(404).json({ error: 'Фото не знайдено' });
  }

  if (!isImageMime(mimeType)) {
    stream.destroy();
    return res.status(404).json({ error: 'Фото не знайдено' });
  }

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');

  stream.on('error', (err) => {
    console.error('Обрив потоку фото:', err.message);
    res.destroy(err);
  });
  stream.pipe(res);
});
