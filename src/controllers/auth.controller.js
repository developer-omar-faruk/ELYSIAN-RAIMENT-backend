import { Admin, Session } from '../models/system.js';
import { asyncHandler, HttpError } from '../utils/errors.js';
import { safeEqual } from '../utils/helpers.js';
import { env } from '../config/env.js';
import {
  DUMMY_HASH, adminDto, clearAuthCookies, csrfToken, hashPassword, revokeByRefresh, setAuthCookies, startSession, verifyPassword,
} from '../services/auth.service.js';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

async function respondWithSession(req, res, admin, status = 200) {
  const { session, access, refresh } = await startSession(admin, req);
  setAuthCookies(res, { access, refresh });
  res.status(status).json({ admin: adminDto(admin), csrf: csrfToken(session) });
}

export const setupStatus = asyncHandler(async (req, res) => {
  res.json({ needsSetup: (await Admin.countDocuments({ role: 'owner' })) === 0 });
});

export const setup = asyncHandler(async (req, res) => {
  if ((await Admin.countDocuments({ role: 'owner' })) > 0) throw new HttpError(409, 'Setup has already been completed.');
  if (!safeEqual(req.body.token, env.INITIAL_ADMIN_SETUP_TOKEN)) throw new HttpError(403, 'Invalid setup token.');
  let admin;
  try {
    admin = await Admin.create({ name: req.body.name, email: req.body.email, passwordHash: await hashPassword(req.body.password), role: 'owner' });
  } catch (e) {
    if (e.code === 11000) throw new HttpError(409, 'Setup has already been completed.'); // lost a race with another request
    throw e;
  }
  await respondWithSession(req, res, admin, 201);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email }).select('+passwordHash');
  if (!admin || !admin.active) {
    await verifyPassword(DUMMY_HASH, password);
    throw new HttpError(401, 'Invalid email or password.');
  }
  if (admin.lockUntil && admin.lockUntil > new Date()) throw new HttpError(429, 'Too many failed attempts. Please try again later.');
  if (!(await verifyPassword(admin.passwordHash, password))) {
    const upd = await Admin.findOneAndUpdate({ _id: admin._id }, { $inc: { failedLogins: 1 } }, { new: true });
    if (upd.failedLogins >= MAX_FAILS) await Admin.updateOne({ _id: admin._id }, { $set: { lockUntil: new Date(Date.now() + LOCK_MS), failedLogins: 0 } });
    throw new HttpError(401, 'Invalid email or password.');
  }
  await Admin.updateOne({ _id: admin._id }, { $set: { failedLogins: 0, lastLoginAt: new Date() }, $unset: { lockUntil: 1 } });
  await respondWithSession(req, res, admin);
});

export const logout = asyncHandler(async (req, res) => {
  const rt = req.cookies?.rg_rt;
  if (typeof rt === 'string' && rt) await revokeByRefresh(rt);
  clearAuthCookies(res);
  res.json({ ok: true });
});

export const me = (req, res) => res.json({ admin: adminDto(req.admin), csrf: csrfToken(req.session) });

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, email, currentPassword, newPassword } = req.body;
  const admin = await Admin.findById(req.admin._id).select('+passwordHash');
  const emailChanged = !!email && email !== admin.email;
  if (emailChanged || newPassword) {
    if (!currentPassword || !(await verifyPassword(admin.passwordHash, currentPassword))) throw new HttpError(403, 'Current password is incorrect.');
  }
  if (name) admin.name = name;
  if (emailChanged) admin.email = email;
  if (newPassword) admin.passwordHash = await hashPassword(newPassword);
  await admin.save();
  if (newPassword) await Session.updateMany({ admin: admin._id, _id: { $ne: req.session._id }, revokedAt: null }, { $set: { revokedAt: new Date() } });
  res.json({ admin: adminDto(admin) });
});