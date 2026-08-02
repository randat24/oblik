import { handleUpload } from '@vercel/blob/client';
import { isAuthed } from '../../lib/auth';

// Завантаження йде з браузера напряму у Vercel Blob, тож ліміт тіла
// запиту serverless-функції (4.5 МБ) не заважає великим фото
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: 'Не підключено Blob Storage у налаштуваннях Vercel' });
  }

  const authed = isAuthed(req);

  try {
    const result = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async () => {
        if (!authed) throw new Error('Не авторизовано');
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maximumSizeInBytes: 8 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Помилка завантаження' });
  }
}
