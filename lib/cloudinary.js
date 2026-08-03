import { v2 as cloudinary } from 'cloudinary';

let configured = false;

/**
 * CLOUDINARY_URL конфігурує SDK сам при імпорті — так працює конектор Vercel.
 * Окремі змінні лишаємо як запасний варіант для ручного налаштування.
 */
function ensureConfigured() {
  if (configured) return;
  if (!cloudinary.config().cloud_name && process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
  configured = true;
}

export function cloudinaryReady() {
  ensureConfigured();
  const c = cloudinary.config();
  return !!(c.cloud_name && c.api_key && c.api_secret);
}

ensureConfigured();
export { cloudinary };
