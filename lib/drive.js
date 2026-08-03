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

export function driveReady() {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
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
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
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
