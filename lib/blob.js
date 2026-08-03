/**
 * Пошук токена сховища.
 *
 * Vercel називає змінну BLOB_READ_WRITE_TOKEN лише для першого підключеного
 * стора. Другий і наступні отримують префікс — BLOB_2_READ_WRITE_TOKEN тощо,
 * і SDK за замовчуванням їх не бачить. Тому шукаємо самі й передаємо явно.
 */
export function blobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const key = Object.keys(process.env)
    .filter((k) => /_READ_WRITE_TOKEN$/.test(k) && process.env[k])
    .sort()[0];
  return key ? process.env[key] : null;
}

/** Назва змінної, з якої взято токен — для діагностики */
export function blobTokenVar() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'BLOB_READ_WRITE_TOKEN';
  return Object.keys(process.env)
    .filter((k) => /_READ_WRITE_TOKEN$/.test(k) && process.env[k])
    .sort()[0] || null;
}

/** Опції для викликів SDK: явний токен замість пошуку в оточенні */
export function blobOpts(extra = {}) {
  const token = blobToken();
  return token ? { ...extra, token } : extra;
}
