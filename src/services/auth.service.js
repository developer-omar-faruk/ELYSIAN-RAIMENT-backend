import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Session } from '../models/system.js';
import { hmac, randomToken } from '../utils/helpers.js';

export const ACCESS_MS = 15 * 60_000;
export const REFRESH_MS = 7 * 24 * 3600_000;
const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw) => argon2.hash(pw, ARGON);
export const verifyPassword = (hash, pw) => argon2.verify(hash, pw).catch(() => false);
// Used to keep login timing similar when the email does not exist
export const DUMMY_HASH = await argon2.hash('dummy-password-for-timing', ARGON);

const hashRefresh = (t) => hmac(env.JWT_REFRESH_SECRET, t);
export const csrfToken = (session) => hmac(env.COOKIE_SECRET, `csrf:${session._id}`);
export const adminDto = (a) => ({ id: String(a._id), name: a.name, email: a.email, role: a.role });

export const signAccess = (admin, session) =>
  jwt.sign({ sid: String(session._id), role: admin.role }, env.JWT_ACCESS_SECRET, { subject: String(admin._id), expiresIn: Math.floor(ACCESS_MS / 1000), issuer: 'rg-api', algorithm: 'HS256' });
export const verifyAccess = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'rg-api', algorithms: ['HS256'] });

const cookieBase = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production' || env.COOKIE_SAMESITE === 'none',
  sameSite: env.COOKIE_SAMESITE,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
};
export function setAuthCookies(res, { access, refresh }) {
  if (access) res.cookie('rg_at', access, { ...cookieBase, path: '/api', maxAge: ACCESS_MS });
  if (refresh) res.cookie('rg_rt', refresh, { ...cookieBase, path: '/api/admin', maxAge: REFRESH_MS });
}
export function clearAuthCookies(res) {
  res.clearCookie('rg_at', { ...cookieBase, path: '/api' });
  res.clearCookie('rg_rt', { ...cookieBase, path: '/api/admin' });
}

export async function startSession(admin, req) {
  const refresh = randomToken(48);
  const session = await Session.create({
    admin: admin._id, refreshHash: hashRefresh(refresh),
    userAgent: (req.get('user-agent') || '').slice(0, 200), ip: req.ip,
    expiresAt: new Date(Date.now() + REFRESH_MS),
  });
  return { session, access: signAccess(admin, session), refresh };
}

// Rotates the refresh token. Returns { session, refresh } or null.
// A just-rotated token is accepted for a short grace window (parallel requests); replaying it later revokes the session.
export async function rotateRefresh(token) {
  const h = hashRefresh(token);
  const now = new Date();
  const refresh = randomToken(48);
  const session = await Session.findOneAndUpdate(
    { refreshHash: h, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { refreshHash: hashRefresh(refresh), prevRefreshHash: h, prevValidUntil: new Date(Date.now() + env.REFRESH_GRACE_MS), lastUsedAt: now } },
    { new: true },
  );
  if (session) return { session, refresh };
  const prev = await Session.findOne({ prevRefreshHash: h, revokedAt: null, expiresAt: { $gt: now } });
  if (prev) {
    if (prev.prevValidUntil && prev.prevValidUntil > now) return { session: prev, refresh: null };
    await Session.updateOne({ _id: prev._id }, { $set: { revokedAt: now } });
  }
  return null;
}

export const revokeByRefresh = (token) => Session.updateOne({ $or: [{ refreshHash: hashRefresh(token) }, { prevRefreshHash: hashRefresh(token) }], revokedAt: null }, { $set: { revokedAt: new Date() } });