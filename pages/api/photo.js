import { withAuth } from '../../lib/auth';
import { cloudinary, cloudinaryReady } from '../../lib/cloudinary';

// Фото приватні: віддаємо посилання на них лише тому, хто увійшов на сайт
export default withAuth(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const publicId = (req.query.p || '').toString();
  if (!publicId || !/^sklad\/[A-Za-z0-9_-]+$/.test(publicId)) {
    return res.status(400).json({ error: 'Некоректний шлях' });
  }
  if (!cloudinaryReady()) {
    return res.status(503).json({ error: 'Не підключено Cloudinary у налаштуваннях Vercel' });
  }

  const url = cloudinary.url(publicId, {
    type: 'authenticated',
    sign_url: true,
    secure: true,
  });
  res.redirect(302, url);
});
