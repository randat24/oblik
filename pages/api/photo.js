import { Readable } from 'node:stream';
import { get } from '@vercel/blob';
import { withAuth } from '../../lib/auth';
import { blobOpts } from '../../lib/blob';

// Фото приватні: віддаємо їх лише тому, хто увійшов на сайт
export default withAuth(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const pathname = (req.query.p || '').toString();
  if (!pathname || !pathname.startsWith('sklad/') || pathname.includes('..')) {
    return res.status(400).json({ error: 'Некоректний шлях' });
  }

  const result = await get(pathname, blobOpts({ access: 'private' }));
  if (!result || result.statusCode !== 200) {
    return res.status(404).json({ error: 'Фото не знайдено' });
  }

  res.setHeader('Content-Type', result.blob.contentType || 'image/jpeg');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');

  // заголовки вже надіслані, тож на обриві лишається тільки закрити зʼєднання
  const stream = Readable.fromWeb(result.stream);
  stream.on('error', (err) => {
    console.error('Обрив потоку фото:', err.message);
    res.destroy(err);
  });
  stream.pipe(res);
});
