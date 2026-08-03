import { google } from 'googleapis';

let cachedAuth = null;

/**
 * Спільна автентифікація сервісного акаунта — для Таблиць і для Диска.
 * drive.file: доступ лише до файлів, створених самим застосунком
 * (не до всього Диска чи Спільного диска).
 */
export function getGoogleAuth() {
  if (cachedAuth) return cachedAuth;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY || '';
  // У змінних оточення Vercel переноси рядків зберігаються як \n
  key = key.replace(/\\n/g, '\n');

  if (!email || !key) {
    throw new Error(
      'Не задані GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY у змінних оточення'
    );
  }

  cachedAuth = new google.auth.JWT({
    email,
    key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });
  return cachedAuth;
}
