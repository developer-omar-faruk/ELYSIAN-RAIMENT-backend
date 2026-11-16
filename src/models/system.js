import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const adminSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 200 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['owner', 'admin'], default: 'admin' },
  active: { type: Boolean, default: true },
  failedLogins: { type: Number, default: 0 },
  lockUntil: Date,
  lastLoginAt: Date,
}, { timestamps: true });
// Only one owner can ever exist. This makes first-owner creation race-safe.
adminSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: 'owner' } });
export const Admin = model('Admin', adminSchema);

const sessionSchema = new Schema({
  admin: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
  refreshHash: { type: String, required: true, unique: true },
  prevRefreshHash: { type: String, index: true },
  prevValidUntil: Date,
  userAgent: String,
  ip: String,
  lastUsedAt: { type: Date, default: Date.now },
  revokedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}, { timestamps: true });
export const Session = model('Session', sessionSchema);

const zoneSchema = new Schema({
  id: { type: String, required: true },
  label: { type: String, required: true, trim: true },
  fee: { type: Number, required: true, min: 0 },
  note: { type: String, default: '' },
}, { _id: false });

const settingsSchema = new Schema({
  key: { type: String, default: 'store', unique: true },
  brand: { name: String, tagline: String, description: String, logo: String },
  contact: { phone: String, phoneDisplay: String, email: String, address: String, hours: String, facebook: String, instagram: String, whatsapp: String, youtube: String, tiktok: String },
  zones: { type: [zoneSchema], default: [] },
  policies: { delivery: String, exchange: String, returns: String, privacy: String, terms: String },
  newsletter: { title: String, text: String },
  lowStock: { type: Number, default: 5, min: 0 },
}, { timestamps: true });
export const Settings = model('Settings', settingsSchema);