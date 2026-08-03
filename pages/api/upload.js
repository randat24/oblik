import { withAuth } from '../../lib/auth';
import { uploadPhoto, driveReady, folderId } from '../../lib/drive';
import { driveAuthMode } from '../../lib/googleAuth';

const SETUP_HINT = 'Пройдіть разову авторизацію за адресою /api/oauth/start — '
  + 'вона видасть значення для GOOGLE_OAUTH_REFRESH_TOKEN і GOOGLE_DRIVE_FOLDER_ID.';

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
    return res.status(503).json({ error: `Не налаштовано сховище фото. ${SETUP_HINT}` });
  }

  const buf = await readBody(req);
  if (!buf.length) return res.status(400).json({ error: 'Порожній файл' });

  try {
    const fileId = await uploadPhoto(buf, 'image/jpeg', `box-${Date.now()}.jpg`);
    return res.json({ fileId });
  } catch (err) {
    const msg = err.message || '';
    const mode = driveAuthMode();

    // Найчастіші причини — краще сказати прямо, ніж віддавати текст Google як є
    if (/invalid_grant/i.test(msg)) {
      return res.status(400).json({
        error: mode === 'delegated'
          ? 'Делегування працює лише для акаунтів Google Workspace. На звичайному '
            + `@gmail.com воно неможливе — видаліть змінну GOOGLE_IMPERSONATE_USER. ${SETUP_HINT}`
          : `Токен доступу недійсний або відкликаний. ${SETUP_HINT}`,
      });
    }
    if (/File not found/i.test(msg)) {
      return res.status(400).json({
        error: mode === 'oauth'
          ? `Теку ${folderId()} не знайдено. Зі scope drive.file застосунок бачить лише те, `
            + `що створив сам, тож теку має завести він. ${SETUP_HINT}`
          : `Папку ${folderId()} не знайдено. Перевірте GOOGLE_DRIVE_FOLDER_ID і доступ `
            + `сервісного акаунта ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || ''} до неї.`,
      });
    }
    if (/storageQuotaExceeded|storage quota/i.test(msg)) {
      return res.status(400).json({
        error: 'У сервісного акаунта немає власного місця на Диску. На звичайному '
          + `@gmail.com це вирішується лише авторизацією від вашого імені. ${SETUP_HINT}`,
      });
    }
    if (/insufficient|forbidden|permission/i.test(msg)) {
      return res.status(400).json({
        error: `Немає прав на запис у теку. ${SETUP_HINT}`,
      });
    }
    throw err;
  }
});
