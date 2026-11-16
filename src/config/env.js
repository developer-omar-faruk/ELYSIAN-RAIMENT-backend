import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  CLIENT_ORIGIN: z.string().min(1),
  MONGODB_URI: z.string().min(10),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  INITIAL_ADMIN_SETUP_TOKEN: z.string().min(24),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  STORE_TZ: z.string().default('Asia/Dhaka'),
  STORE_UTC_OFFSET: z.string().regex(/^[+-]\d{2}:\d{2}$/).default('+06:00'),
  LOGIN_MAX: z.coerce.number().int().min(1).default(10),
  REFRESH_GRACE_MS: z.coerce.number().int().min(0).default(10000),
  ALLOW_NO_TRANSACTIONS: z.enum(['true', 'false']).default('false'),
  LOG_LEVEL: z.string().default('info'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  OWNER_EMAIL: z.string().email().optional(),
  FROM_EMAIL: z.string().optional(),
});

const cleaned = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ''));
const parsed = schema.safeParse(cleaned);
if (!parsed.success) {
  throw new Error('Invalid environment configuration:\n' + parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n'));
}

export const env = parsed.data;
export const allowedOrigins = env.CLIENT_ORIGIN.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
if (env.NODE_ENV === 'production' && allowedOrigins.some((o) => !o.startsWith('https://'))) {
  throw new Error('CLIENT_ORIGIN must use https:// in production');
}
if (env.COOKIE_SAMESITE === 'none' && env.NODE_ENV !== 'production' && cleaned.ALLOW_INSECURE_NONE !== 'true') {
  // SameSite=None requires Secure cookies, which browsers only accept over HTTPS
}