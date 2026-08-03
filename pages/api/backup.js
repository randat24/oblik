import { Readable } from 'node:stream';
import { get } from '@vercel/blob';
import { isAuthed } from '../../lib/auth';
import { blobOpts, blobToken } from '../../lib/blob';
import { createBackup, listBackups, BACKUP_PREFIX } from '../../lib/backup';

/** Vercel Cron надсилає GET із заголовком Authorization: Bearer CRON_SECRET */
function isCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  const cron = isCron(req);
  const authed = cron || isAuthed(req);
  if (!authed) return res.status(401).json({ error: 'Не авторизовано' });

  if (!blobToken()) {
    return res.status(503).json({
      error: 'Резервні копії зберігаються у Vercel Blob, а сховище не підключене до проєкту. '
        + 'Storage → ваш стор → Projects → Connect, потім Redeploy.',
    });
  }

  try {
    // за розкладом приходить GET — тоді це створення копії, а не перегляд
    if (req.method === 'GET' && cron) {
      return res.json({ ok: true, ...(await createBackup()) });
    }

    if (req.method === 'GET') {
      const download = (req.query.download || '').toString();
      if (!download) return res.json({ backups: await listBackups() });

      if (!download.startsWith(BACKUP_PREFIX) || download.includes('..')) {
        return res.status(400).json({ error: 'Некоректний шлях' });
      }
      const result = await get(download, blobOpts({ access: 'private' }));
      if (!result || result.statusCode !== 200) {
        return res.status(404).json({ error: 'Копію не знайдено' });
      }

      const filename = download.slice(BACKUP_PREFIX.length);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      const stream = Readable.fromWeb(result.stream);
      stream.on('error', (err) => {
        console.error('Обрив потоку копії:', err.message);
        res.destroy(err);
      });
      return stream.pipe(res);
    }

    if (req.method === 'POST') {
      return res.json({ ok: true, ...(await createBackup()) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Помилка резервного копіювання:', err);
    return res.status(500).json({ error: err.message || 'Помилка резервного копіювання' });
  }
}
