import { z } from 'zod';
import { STATUSES, PAYMENT_STATUSES } from '../utils/constants.js';

const t = (max) => z.string().trim().max(max);
const intish = z.coerce.number().int().min(0).max(10_000_000);
const posInt = z.coerce.number().int().min(1).max(10_000_000);
const urlish = t(2000).refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL');
const optUrl = t(500).refine((v) => v === '' || /^https?:\/\//i.test(v), 'Must be an http(s) URL').default('');
const dateStr = z.preprocess((v) => (v == null ? '' : v), z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]));
const list = (max = 30) => z.preprocess(
  (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((s) => String(s).trim()).filter(Boolean),
  z.array(z.string().max(60)).max(max),
);
export const objectId = z.string().regex(/^[a-f\d]{24}$/i);

export const normPhone = (p) => String(p).replace(/[\s-]/g, '').replace(/^\+?88(?=01)/, '');
export const phoneOk = (p) => /^01[3-9]\d{8}$/.test(normPhone(p));
const phone = t(25).refine(phoneOk, 'Enter a valid Bangladesh mobile number').transform(normPhone);

export const pageQuery = { page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(5000).default(20) };

// ---------- Auth ----------
export const setupSchema = z.object({
  token: z.string().min(1).max(300),
  name: t(100).min(1),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10, 'Password must be at least 10 characters').max(128),
});
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(128),
});
export const profileSchema = z.object({
  name: t(100).min(1).optional(),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  currentPassword: z.string().max(200).default(''),
  newPassword: z.string().max(128).refine((v) => v === '' || v.length >= 10, 'New password must be at least 10 characters').default(''),
});

// ---------- Products ----------
const variant = z.object({ _id: objectId.optional(), size: t(40).min(1), color: t(40).default(''), stock: intish });
export const productInput = z.object({
  id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/).optional().or(z.literal('')),
  sku: t(60).optional(),
  name: t(160).min(1),
  category: t(80).min(1),
  description: t(5000).default(''),
  fabric: t(200).default(''),
  price: posInt,
  oldPrice: z.preprocess((v) => (v === '' || v == null || Number(v) === 0 ? null : v), z.coerce.number().int().positive().max(10_000_000).nullable()),
  images: z.preprocess((a) => (Array.isArray(a) ? a.map((s) => String(s).trim()).filter(Boolean) : a), z.array(urlish).max(12)).default([]),
  sizes: list().refine((a) => a.length > 0, 'At least one size is required'),
  colors: list().default([]),
  tags: list(50).default([]),
  variants: z.array(variant).max(200).default([]),
  stock: intish.default(0),
  featured: z.boolean().default(false),
  trending: z.boolean().default(false),
  newArrival: z.boolean().default(false),
  published: z.boolean().default(true),
});
export const flagsInput = z.object({ published: z.boolean().optional(), featured: z.boolean().optional(), trending: z.boolean().optional(), newArrival: z.boolean().optional() });
export const productQuery = z.object({
  q: t(100).optional(), category: t(80).optional(),
  availability: z.enum(['in', 'low', 'out']).optional(), published: z.enum(['true', 'false']).optional(),
  minPrice: intish.optional(), maxPrice: intish.optional(),
  sort: z.enum(['-createdAt', 'createdAt', 'name', '-name', 'price', '-price', 'stock', '-stock']).default('-createdAt'),
  ...pageQuery,
});
export const homepageFlags = z.object({ featured: z.array(t(40)).max(500), trending: z.array(t(40)).max(500), newArrival: z.array(t(40)).max(500) });

// ---------- Catalog content ----------
export const categoryInput = z.object({ name: t(100).min(1), desc: t(300).default(''), image: optUrl, published: z.boolean().default(true) });
export const reorderCategories = z.object({ slugs: z.array(t(80)).max(200) });
export const bannerInput = z.object({
  title: t(200).min(1), subtitle: t(500).default(''), image: urlish, button: t(60).default(''),
  link: t(500).default('/shop').refine((l) => (l.startsWith('/') && !l.startsWith('//')) || /^https?:\/\//i.test(l), 'Invalid link'),
  pos: t(40).default('center'), active: z.boolean().default(true),
});
export const reorderBanners = z.object({ ids: z.array(objectId).max(100) });
export const couponInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Code must be 3-30 letters, numbers, - or _'),
  type: z.enum(['percent', 'flat']),
  value: posInt,
  minOrder: intish.default(0), maxDiscount: intish.default(0), usageLimit: intish.default(0),
  startsAt: dateStr.default(''), expiresAt: dateStr.default(''),
  active: z.boolean().default(true),
}).superRefine((c, ctx) => {
  if (c.type === 'percent' && c.value > 100) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Percent cannot exceed 100' });
  if (c.startsAt && c.expiresAt && c.startsAt > c.expiresAt) ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Expiry must be after start' });
});
export const couponValidateInput = z.object({ code: t(40).min(1), subtotal: z.coerce.number().min(0).max(100_000_000) });
export const reviewPatch = z.object({ approved: z.boolean() });

export const settingsInput = z.object({
  brand: z.object({ name: t(100).min(1), tagline: t(200).default(''), description: t(1000).default(''), logo: optUrl }),
  contact: z.object({
    phone: t(30).default(''), phoneDisplay: t(40).default(''), email: t(200).default(''), address: t(300).default(''), hours: t(100).default(''),
    facebook: optUrl, instagram: optUrl, whatsapp: optUrl, youtube: optUrl, tiktok: optUrl,
  }),
  zones: z.array(z.object({ id: t(40).default(''), label: t(80).min(1), fee: intish, note: t(200).default('') })).min(1).max(20),
  policies: z.object({ delivery: t(3000).default(''), exchange: t(3000).default(''), returns: t(3000).default(''), privacy: t(8000).default(''), terms: t(8000).default('') }).default({}),
  newsletter: z.object({ title: t(120).default(''), text: t(400).default('') }).default({}),
  lowStock: intish.default(5),
});

// ---------- Orders ----------
export const orderInput = z.object({
  customer: z.object({ name: t(100).min(1), phone, email: z.union([z.literal(''), t(150).email()]).default('') }),
  address: t(500).min(1), area: t(200).default(''), note: t(500).default(''),
  zone: t(40).min(1),
  items: z.array(z.object({ id: t(40).min(1), size: t(40).min(1), color: t(40).default(''), qty: z.coerce.number().int().min(1).max(20) })).min(1).max(30),
  coupon: t(40).default(''),
});
export const trackQuery = z.object({ ids: t(1000) });
export const orderListQuery = z.object({
  status: z.enum(STATUSES).optional(), q: t(100).optional(), from: dateStr.optional(), to: dateStr.optional(), ...pageQuery,
});
export const orderPatch = z.object({
  status: z.enum(STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  delivery: z.object({ name: t(100).min(1), phone, address: t(500).min(1), area: t(200).default(''), note: t(500).default('') }).optional(),
}).refine((o) => o.status || o.paymentStatus || o.delivery, 'Nothing to update');
export const noteInput = z.object({ text: t(1000).min(1) });
export const bulkInput = z.object({ ids: z.array(t(40)).min(1).max(100), status: z.enum(STATUSES) });

// ---------- Inventory / reports / customers ----------
export const adjustInput = z.object({
  id: t(40).min(1), vid: objectId.optional(), mode: z.enum(['add', 'set']),
  value: z.coerce.number().int().min(-1_000_000).max(10_000_000), reason: t(200).default(''),
});
export const inventoryQuery = z.object({ q: t(100).optional(), status: z.enum(['low', 'out']).optional() });
export const historyQuery = z.object({ q: t(100).optional(), page: pageQuery.page });
export const analyticsQuery = z.object({ from: dateStr.optional(), to: dateStr.optional(), group: z.enum(['day', 'week', 'month']).default('day') });
export const customerQuery = z.object({ q: t(100).optional(), page: pageQuery.page });
export const reviewQuery = z.object({ status: z.enum(['approved', 'hidden']).optional() });
export const uploadInput = z.object({ data: z.string().min(30).max(8_000_000) });