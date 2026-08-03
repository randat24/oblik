import { withAuth } from '../../lib/auth';
import { cloudinary, cloudinaryReady } from '../../lib/cloudinary';

// Фото вже стиснуте в браузері (до ~1.5 МБ), тож приймаємо тіло напряму,
// без стандартного JSON bodyParser
export const config = { api: { bodyParser: false } };

const MAX_BYTES = 8 * 1024 * 1024;

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('Фото завелике (максимум 8 МБ)');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    return res.json({ ready: cloudinaryReady() });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!cloudinaryReady()) {
    return res.status(503).json({
      error: 'Не підключено Cloudinary у налаштуваннях Vercel. Додайте змінну CLOUDINARY_URL '
        + '(конектор Cloudinary робить це сам) і зробіть Redeploy.',
    });
  }

  const buf = await readBody(req);
  if (!buf.length) return res.status(400).json({ error: 'Порожній файл' });

  const publicId = `sklad/box-${Date.now()}`;
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: 'image', type: 'authenticated', overwrite: true },
      (err, uploaded) => (err ? reject(err) : resolve(uploaded))
    );
    stream.end(buf);
  });

  res.json({ publicId: result.public_id });
});
