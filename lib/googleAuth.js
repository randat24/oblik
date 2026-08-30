import { google } from 'googleapis';

let cachedAuth = null;
let cachedDriveAuth = null;

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', DRIVE_SCOPE];

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

/** Кого вдає застосунок під час роботи з Диском (лише для Workspace-делегування) */
export function impersonatedUser() {
  return (process.env.GOOGLE_IMPERSONATE_USER || '').trim() || null;
}

export function oauthConfigured() {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

/**
 * Як застосунок працює з Диском:
 *   oauth     — від імені живої людини за refresh-токеном (працює і зі звичайним gmail)
 *   delegated — сервісний акаунт вдає користувача Workspace
 *   service   — сам сервісний акаунт (потребує Спільного диска)
 */
export function driveAuthMode() {
  if (oauthConfigured() && process.env.GOOGLE_OAUTH_REFRESH_TOKEN) return 'oauth';
  if (impersonatedUser()) return 'delegated';
  return 'service';
}

/** Клієнт для самої процедури авторизації (ще без токена) */
export function getOAuthClient(redirectUri) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri
  );
}

/**
 * Автентифікація для Диска. Навмисно окрема від Таблиць: зміна способу
 * доступу до Диска не має зачіпати робочий доступ до таблиці.
 */
export function getDriveAuth() {
  if (cachedDriveAuth) return cachedDriveAuth;

  if (driveAuthMode() === 'oauth') {
    const client = getOAuthClient();
    client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
    cachedDriveAuth = client;
  } else {
    cachedDriveAuth = buildJwt(impersonatedUser() || undefined);
  }
  return cachedDriveAuth;
}
