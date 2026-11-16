import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const hmac = (secret, value) => crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

export function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newOrderId() {
  const bytes = crypto.randomBytes(10);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % 32];
  return `RG-${s}`;
}

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}

export const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: env.STORE_TZ });
export const dayStart = (d) => new Date(`${d}T00:00:00.000${env.STORE_UTC_OFFSET}`);
export const dayEnd = (d) => new Date(`${d}T23:59:59.999${env.STORE_UTC_OFFSET}`);