import { Product } from '../models/catalog.js';
import { asyncHandler, HttpError } from '../utils/errors.js';
import { escapeRegex, randomToken } from '../utils/helpers.js';
import { lowThreshold } from '../services/settings.service.js';
import { adminProduct, buildProductFields, uniqueSlug } from '../services/product.service.js';
import { logMovement } from '../services/stock.service.js';
import { deleteImages } from '../services/upload.service.js';
import { invalidateBootstrapCache } from '../services/bootstrap-cache.js';
import { atomic } from '../utils/tx.js';

const SORTS = { '-createdAt': { createdAt: -1 }, createdAt: { createdAt: 1 }, name: { name: 1 }, '-name': { name: -1 }, price: { price: 1 }, '-price': { price: -1 }, stock: { stock: 1 }, '-stock': { stock: -1 } };

export const listProducts = asyncHandler(async (req, res) => {
  const { q, category, availability, published, minPrice, maxPrice, sort, page, limit } = req.query;
  const low = await lowThreshold();
  const f = {};
  if (q) { const re = new RegExp(escapeRegex(q), 'i'); f.$or = [{ name: re }, { id: re }, { sku: re }, { tags: re }]; }
  if (category) f.category = category;
  if (published) f.published = published === 'true';
  if (availability === 'in') f.stock = { $gt: low };
  if (availability === 'low') f.stock = { $gt: 0, $lte: low };
  if (availability === 'out') f.stock = 0;
  if (minPrice != null || maxPrice != null) f.price = { ...(minPrice != null && { $gte: minPrice }), ...(maxPrice != null && { $lte: maxPrice }) };
  const [items, total] = await Promise.all([
    Product.find(f).sort(SORTS[sort]).skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(f),
  ]);
  res.json({ items: items.map(adminProduct), total, page, pages: Math.max(1, Math.ceil(total / limit)), low });
});

export const createProduct = asyncHandler(async (req, res) => {
  const fields = await buildProductFields(req.body);
  const id = req.body.id || `p${Date.now().toString(36)}${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
  const product = await Product.create({ ...fields, id, slug: await uniqueSlug(fields.name), sku: req.body.sku || `ER-${id.toUpperCase()}` });
  invalidateBootstrapCache();
  res.status(201).json(adminProduct(product));
});

export const updateProduct = asyncHandler(async (req, res) => {
  const p = await Product.findOne({ id: req.params.id });
  if (!p) throw new HttpError(404, 'Product not found.');
  const fields = await buildProductFields(req.body);
  const nameChanged = fields.name !== p.name;
  const before = p.stock;
  const removed = p.images.filter((u) => !fields.images.includes(u));
  p.set({ ...fields, ...(req.body.sku ? { sku: req.body.sku } : {}) });
  if (nameChanged || !p.slug) p.slug = await uniqueSlug(fields.name, p.id);
  await p.save();
  if (p.stock !== before) await logMovement({ productId: p.id, name: p.name, delta: p.stock - before, after: p.stock, reason: 'Edited in product form', by: req.admin.email });
  invalidateBootstrapCache();
  deleteImages(removed);
  res.json(adminProduct(p));
});

export const patchFlags = asyncHandler(async (req, res) => {
  const p = await Product.findOneAndUpdate({ id: req.params.id }, { $set: req.body }, { new: true });
  if (!p) throw new HttpError(404, 'Product not found.');
  invalidateBootstrapCache();
  res.json(adminProduct(p));
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const p = await Product.findOneAndDelete({ id: req.params.id });
  if (!p) throw new HttpError(404, 'Product not found.');
  invalidateBootstrapCache();
  deleteImages(p.images);
  res.json({ ok: true });
});

export const setHomepageFlags = asyncHandler(async (req, res) => {
  const { featured, trending, newArrival } = req.body;
  await atomic(async (session) => {
    await Product.updateMany({}, { $set: { featured: false, trending: false, newArrival: false } }, { session });
    if (featured.length) await Product.updateMany({ id: { $in: featured } }, { $set: { featured: true } }, { session });
    if (trending.length) await Product.updateMany({ id: { $in: trending } }, { $set: { trending: true } }, { session });
    if (newArrival.length) await Product.updateMany({ id: { $in: newArrival } }, { $set: { newArrival: true } }, { session });
  });
  invalidateBootstrapCache();
  res.json({ ok: true });
});
