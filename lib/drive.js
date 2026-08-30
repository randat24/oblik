import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { getDriveAuth, driveAuthMode } from './googleAuth.js';

export const PHOTO_FOLDER_NAME = 'Облік майна — фото';

let cachedClient = null;

function getDriveClient() {
  if (!cachedClient) {
    cachedClient = google.drive({ version: 'v3', auth: getDriveAuth() });
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
  if (!folderId()) return false;
  if (driveAuthMode() === 'oauth') return true;
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

/**
 * Завантажує фото у теку GOOGLE_DRIVE_FOLDER_ID.
 * У режимі oauth файл створюється від імені живої людини й лягає на її Диск.
 * У решті режимів це робить сервісний акаунт, а він не має власного місця,
 * тож тека мусить лежати на Спільному диску.
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
