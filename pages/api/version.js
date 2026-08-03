import { withAuth } from '../../lib/auth';
import { driveReady, folderId } from '../../lib/drive';
import { driveAuthMode, oauthConfigured, impersonatedUser } from '../../lib/googleAuth';

/**
 * Діагностика: який код зараз живий і що налаштовано.
 * Значень секретів не віддає — лише «задано / не задано».
 */
export default withAuth(async (req, res) => {
  res.json({
    збірка: {
      коміт: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'невідомо',
      гілка: process.env.VERCEL_GIT_COMMIT_REF || 'невідомо',
      середовище: process.env.VERCEL_ENV || 'локально',
      опис: process.env.VERCEL_GIT_COMMIT_MESSAGE || '',
    },
    фото: {
      готово: driveReady(),
      режим: driveAuthMode(),
      тека: folderId() ? 'задано' : 'НЕ ЗАДАНО',
      oauth_клієнт: oauthConfigured() ? 'задано' : 'НЕ ЗАДАНО',
      refresh_токен: process.env.GOOGLE_OAUTH_REFRESH_TOKEN ? 'задано' : 'НЕ ЗАДАНО',
      impersonate_user: impersonatedUser() || 'не задано (це правильно для @gmail.com)',
    },
    таблиця: {
      id: process.env.SPREADSHEET_ID ? 'задано' : 'НЕ ЗАДАНО',
      сервісний_акаунт: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'НЕ ЗАДАНО',
    },
  });
});
