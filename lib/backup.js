import { put, list, del } from '@vercel/blob';
import { SHEET_CONFIGS, readSheet } from './sheets';
import { LOG_SHEET } from './log';
import { blobOpts } from './blob';

export const BACKUP_PREFIX = 'backup/';
export const KEEP_BACKUPS = 30;

/** Знімок усіх листів разом із журналом */
export async function makeSnapshot() {
  const names = [...SHEET_CONFIGS.map((c) => c.name), LOG_SHEET];
  const sheets = {};
  const skipped = [];

  await Promise.all(
    names.map(async (name) => {
      try {
        sheets[name] = await readSheet(name);
      } catch (err) {
        // лист міг бути перейменований або ще не створений — копію це не спиняє
        skipped.push({ name, error: err.message });
      }
    })
  );

  const rows = Object.values(sheets).reduce((n, v) => n + v.length, 0);
  return { createdAt: new Date().toISOString(), rows, skipped, sheets };
}

function stamp() {
  const p = {};
  new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).forEach((x) => (p[x.type] = x.value));
  return `${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}`;
}

/** Створює копію й прибирає застарілі */
export async function createBackup() {
  const snapshot = await makeSnapshot();
  const pathname = `${BACKUP_PREFIX}oblik-${stamp()}.json`;

  const blob = await put(pathname, JSON.stringify(snapshot, null, 2), blobOpts({
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  }));

  const removed = await pruneBackups();
  return {
    pathname: blob.pathname,
    rows: snapshot.rows,
    sheets: Object.keys(snapshot.sheets).length,
    skipped: snapshot.skipped,
    removed,
  };
}

/** Список копій, найновіші зверху */
export async function listBackups() {
  const { blobs } = await list(blobOpts({ prefix: BACKUP_PREFIX, limit: 1000 }));
  return blobs
    .map((b) => ({ pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt }))
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

/** Лишає KEEP_BACKUPS найновіших копій */
export async function pruneBackups() {
  const all = await listBackups();
  const old = all.slice(KEEP_BACKUPS);
  if (!old.length) return 0;
  await del(old.map((b) => b.pathname), blobOpts());
  return old.length;
}
