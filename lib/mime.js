// /api/photo віддає файл з Drive за ідентифікатором. Сервісний акаунт бачить
// не лише фото, тож без цієї перевірки через сайт можна було б відкрити
// будь-який файл, до якого він має доступ (і HTML на нашому ж домені).
const IMAGE = /^image\/(jpeg|png|gif|webp|heic|heif|avif)$/i;

export function isImageMime(mime) {
  return IMAGE.test((mime || '').toString().trim());
}
