import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { HttpError } from '../utils/errors.js';

const configured = !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
if (configured) cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });

const MAGIC = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
};

// Validates declared type AND real file signature. SVG and everything else is rejected.
export function parseImageDataUrl(s) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
  if (!m) throw new HttpError(400, 'Only JPEG, PNG or WebP images are allowed.');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > 5 * 1024 * 1024) throw new HttpError(400, 'Image must be smaller than 5 MB.');
  if (!MAGIC[m[1]](buf)) throw new HttpError(400, 'File content does not match an allowed image type.');
  return buf;
}

export async function uploadImage(buf) {
  if (!configured) throw new HttpError(503, 'Image uploads are not configured on the server (Cloudinary).');
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'r-garments', resource_type: 'image', allowed_formats: ['jpg', 'png', 'webp'], overwrite: false, unique_filename: true },
      (err, r) => (err ? reject(new HttpError(502, 'Image upload failed.')) : resolve(r.secure_url)),
    ).end(buf);
  });
}

// Best-effort removal of images that were uploaded through this API. External URLs are ignored.
export async function deleteImages(urls = []) {
  if (!configured) return;
  const re = new RegExp(`^https://res\\.cloudinary\\.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/(?:v\\d+/)?(r-garments/[A-Za-z0-9_-]+)\\.[a-z]+$`);
  for (const u of urls) {
    const m = re.exec(u || '');
    if (!m) continue;
    try { await cloudinary.uploader.destroy(m[1], { resource_type: 'image' }); } catch (e) { logger.warn({ msg: e.message }, 'image delete failed'); }
  }
}