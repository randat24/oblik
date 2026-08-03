import { Readable } from 'node:stream';
import { get } from '@vercel/blob';
import { withAuth } from '../../lib/auth';

// Фото приватні: віддаємо їх лише тому, хто увійшов на сайт
export default withAuth(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const pathname = (req.query.p || '').toString();
  if (!pathname || !pathname.startsWith('sklad/') || pathname.includes('..')) {
    return res.status(400).json({ error: 'Некоректний шлях' });
  }

  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200) {
    return res.status(404).json({ error: 'Фото не знайдено' });
  }

  res.setHeader('Content-Type', result.blob.contentType || 'image/jpeg');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  Readable.fromWeb(result.stream).pipe(res);
});
