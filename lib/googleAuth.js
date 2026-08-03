import { google } from 'googleapis';

let cachedAuth = null;
let cachedDriveAuth = null;

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  // drive.file: доступ лише до файлів, створених самим застосунком
  'https://www.googleapis.com/auth/drive.file',
];

function buildJwt(subject) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY || '';
  // У змінних оточення Vercel переноси рядків зберігаються як \n
  key = key.replace(/\\n/g, '\n');

  if (!email || !key) {
    throw new Error(
      'Не задані GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY у змінних оточення'
    );
  }

  return new google.auth.JWT({ email, key, scopes: SCOPES, subject });
}

/** Автентифікація для Таблиць — завжди від імені самого сервісного акаунта */
export function getGoogleAuth() {
  if (!cachedAuth) cachedAuth = buildJwt(undefined);
  return cachedAuth;
}

/** Кого вдає застосунок під час роботи з Диском (якщо налаштовано делегування) */
export function impersonatedUser() {
  return (process.env.GOOGLE_IMPERSONATE_USER || '').trim() || null;
}

/**
 * Автентифікація для Диска. Окрема від Таблиць навмисно: якщо ввімкнути
 * делегування, воно вплине лише на Диск і не зачепить робочий доступ
 * до таблиці.
 *
 * Без делегування файли створює сам сервісний акаунт — а в нього немає
 * власного місця на Диску, тож папка мусить лежати на Спільному диску.
 * З делегуванням застосунок діє від імені вказаної людини, і місце
 * рахується їй — тоді підходить і звичайна папка.
 */
export function getDriveAuth() {
  if (!cachedDriveAuth) cachedDriveAuth = buildJwt(impersonatedUser() || undefined);
  return cachedDriveAuth;
}
