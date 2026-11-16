import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { allowedOrigins, env } from '../config/env.js';
import { HttpError } from '../utils/errors.js';

export const corsMiddleware = cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // non-browser clients and same-origin
    if (allowedOrigins.includes(origin.replace(/\/$/, ''))) return cb(null, true);
    cb(new HttpError(403, 'Origin not allowed.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'],
  maxAge: 600,
});

const limiter = (windowMs, limit, extra = {}) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many requests. Please try again later.' }),
  ...extra,
});
export const globalLimiter = limiter(60_000, 300);
export const loginLimiter = limiter(15 * 60_000, env.LOGIN_MAX, { skipSuccessfulRequests: true });
export const setupLimiter = limiter(60 * 60_000, 5);
export const orderLimiter = limiter(60 * 60_000, 30);
export const trackLimiter = limiter(60_000, 40);
export const couponLimiter = limiter(10 * 60_000, 40);
export const adminLimiter = limiter(60_000, 600);

// Rejects Mongo operator injection: keys starting with "$" or containing "."
function scan(v, depth = 0) {
  if (depth > 8) throw new HttpError(400, 'Request is too deeply nested.');
  if (Array.isArray(v)) return v.forEach((x) => scan(x, depth + 1));
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v)) {
      if (k.startsWith('$') || k.includes('.') || k === '__proto__') throw new HttpError(400, 'Invalid characters in request.');
      scan(val, depth + 1);
    }
  }
}
export function sanitize(req, res, next) {
  scan(req.body); scan(req.query); scan(req.params);
  next();
}