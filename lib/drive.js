import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { getGoogleAuth } from './googleAuth';

let cachedClient = null;

function getDriveClient() {
  if (!cachedClient) {
    cachedClient = google.drive({ version: 'v3', auth: getGoogleAuth() });
  }
  return cachedClient;
}

/**
 * Приймає і чистий ID папки, і будь-яке посилання на неї —
 * з адресного рядка зазвичай копіюють цілий шматок з "folders/".
 */
export function folderId() {
  const raw = (process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
  if (!raw) return '';
  const fromPath = raw.match(/folders\/([A-Za-z0-9_-]+)/);
  if (fromPath) return fromPath[1];
  const fromQuery = raw.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (fromQuery) return fromQuery[1];
  return raw.replace(/^\/+|\/+$/g, '');
}

export function driveReady() {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    folderId()
  );
}

/**
 * Завантажує фото у Спільний диск (Shared Drive).
 * Сервісний акаунт не має власного місця на звичайному Диску — тільки
 * на Спільному, тож папка з GOOGLE_DRIVE_FOLDER_ID має лежати саме там.
 */
export async function uploadPhoto(buffer, mimeType, name) {
  const drive = getDriveClient();
  const res = await drive.files.create({
    requestBody: {
      name,
      parents: [folderId()],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return res.data.id;
}

/** Стрімить вміст фото — для приватної віддачі через наш маршрут */
export async function getPhotoStream(fileId) {
  const drive = getDriveClient();
  const meta = await drive.files.get({
    fileId,
    fields: 'mimeType',
    supportsAllDrives: true,
  });
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );
  return { stream: res.data, mimeType: meta.data.mimeType || 'image/jpeg' };
}
