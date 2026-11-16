import { Admin, Session } from '../models/system.js';
import { asyncHandler, HttpError } from '../utils/errors.js';
import { safeEqual } from '../utils/helpers.js';
import { csrfToken, rotateRefresh, setAuthCookies, signAccess, verifyAccess } from '../services/auth.service.js';

// Authenticates via the short-lived access cookie. If it is missing/expired, the refresh cookie is rotated transparently
// (the existing admin frontend has no refresh logic of its own).
export const requireAdmin = asyncHandler(async (req, res, next) => {
  let session = null;
  const at = req.cookies?.rg_at;
  if (at) {
    try {
      const p = verifyAccess(at);
      session = await Session.findOne({ _id: p.sid, revokedAt: null, expiresAt: { $gt: new Date() } });
    } catch { /* fall through to refresh */ }
  }
  let rotated = null;
  if (!session) {
    const rt = req.cookies?.rg_rt;
    if (typeof rt === 'string' && rt) {
      rotated = await rotateRefresh(rt);
      session = rotated?.session || null;
    }
  }
  if (!session) throw new HttpError(401, 'Please sign in.');
  const admin = await Admin.findById(session.admin);
  if (!admin || !admin.active) throw new HttpError(401, 'Please sign in.');
  if (rotated) setAuthCookies(res, { access: signAccess(admin, session), refresh: rotated.refresh });
  req.admin = admin;
  req.session = session;
  next();
});

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.admin.role)) throw new HttpError(403, 'You do not have permission to do that.');
  next();
};

export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.get('x-csrf-token') || '';
  if (!sent || !safeEqual(sent, csrfToken(req.session))) throw new HttpError(403, 'Invalid or missing CSRF token.');
  next();
}