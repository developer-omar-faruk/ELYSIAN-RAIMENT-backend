import { Product } from '../models/catalog.js';
import { Order, StockMovement } from '../models/commerce.js';
import { asyncHandler, HttpError } from '../utils/errors.js';
import { NOT_REVENUE } from '../utils/constants.js';
import { escapeRegex } from '../utils/helpers.js';
import { analytics } from '../services/analytics.service.js';
import { lowThreshold } from '../services/settings.service.js';
import { adjustStock, logMovement } from '../services/stock.service.js';
import { parseImageDataUrl, uploadImage } from '../services/upload.service.js';
import { atomic } from '../utils/tx.js';

export const analyticsRoute = asyncHandler(async (req, res) => res.json(await analytics(req.query)));

// ---------- Inventory ----------
export const inventory = asyncHandler(async (req, res) => {
  const threshold = await lowThreshold();
  const { q, status } = req.query;
  const all = await Product.find({}).select('id name images sizes colors variants stock').lean();
  const bySize = {}, byColor = {};
  let units = 0, low = 0, out = 0;
  for (const p of all) {
    units += p.stock;
    if (p.stock === 0) out++; else if (p.stock <= threshold) low++;
    for (const v of p.variants) {
      bySize[v.size] = (bySize[v.size] || 0) + v.stock;
      if (v.color) byColor[v.color] = (byColor[v.color] || 0) + v.stock;
    }
  }
  const re = q ? new RegExp(escapeRegex(q), 'i') : null;
  const items = all
    .filter((p) => (!re || re.test(p.name) || re.test(p.id)) && (!status || (status === 'out' ? p.stock === 0 : p.stock > 0 && p.stock <= threshold)))
    .slice(0, 500)
    .map((p) => ({ id: p.id, name: p.name, images: p.images, sizes: p.sizes, stock: p.stock, variants: p.variants.map((v) => ({ _id: String(v._id), size: v.size, color: v.color, stock: v.stock })) }));
  res.json({ summary: { units, products: all.length, low, out, threshold }, bySize, byColor, items });
});

export const inventoryHistory = asyncHandler(async (req, res) => {
  const { q, page } = req.query;
  const limit = 20;
  const f = q ? { $or: [{ name: new RegExp(escapeRegex(q), 'i') }, { reason: new RegExp(escapeRegex(q), 'i') }] } : {};
  const [items, total] = await Promise.all([StockMovement.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), StockMovement.countDocuments(f)]);
  res.json({ items, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

export const adjustInventory = asyncHandler(async (req, res) => {
  const { id, vid, mode, value, reason } = req.body;
  await atomic(async (session) => {
    const p = await Product.findOne({ id }).session(session);
    if (!p) throw new HttpError(404, 'Product not found.');
    let variant = null;
    if (p.variants.length) {
      if (!vid) throw new HttpError(400, 'Choose a variant to adjust.');
      variant = p.variants.id(vid);
      if (!variant) throw new HttpError(404, 'Variant not found.');
    } else if (vid) throw new HttpError(400, 'This product has no variants.');
    const cur = variant ? variant.stock : p.stock;
    const next = mode === 'set' ? value : cur + value;
    if (next < 0) throw new HttpError(400, 'Stock cannot go below zero.');
    const delta = next - cur;
    if (delta === 0) return;
    const filter = variant ? { _id: p._id, variants: { $elemMatch: { _id: variant._id, stock: cur } } } : { _id: p._id, stock: cur };
    const inc = variant ? { stock: delta, 'variants.$.stock': delta } : { stock: delta };
    const r = await Product.updateOne(filter, { $inc: inc }, { session });
    if (r.modifiedCount !== 1) throw new HttpError(409, 'Stock changed while you were editing. Please retry.');
    await logMovement({ productId: p.id, name: p.name, size: variant?.size, color: variant?.color, delta, after: next, reason: reason || 'Manual adjustment', by: req.admin.email }, session);
  });
  res.json({ ok: true });
});

// ---------- Customers (derived from orders) ----------
export const listCustomers = asyncHandler(async (req, res) => {
  const { q, page } = req.query;
  const limit = 20;
  const re = q ? new RegExp(escapeRegex(q), 'i') : null;
  const match = re ? { $or: [{ 'customer.name': re }, { 'customer.phone': re }, { 'customer.email': re }] } : {};
  const [r] = await Order.aggregate([
    { $match: match }, { $sort: { createdAt: -1 } },
    { $group: { _id: '$customer.phone', name: { $first: '$customer.name' }, email: { $first: '$customer.email' }, address: { $first: '$address' }, orders: { $sum: 1 }, spent: { $sum: { $cond: [{ $in: ['$status', NOT_REVENUE] }, 0, '$total'] } }, recentOrder: { $first: '$id' }, last: { $first: '$createdAt' } } },
    { $sort: { last: -1 } },
    { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'n' }] } },
  ]);
  const total = r.total[0]?.n || 0;
  res.json({ items: r.items, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

export const getCustomer = asyncHandler(async (req, res) => {
  if (!/^[0-9+]{6,20}$/.test(req.params.phone)) throw new HttpError(400, 'Invalid phone number.');
  const orders = await Order.find({ 'customer.phone': req.params.phone }).sort({ createdAt: -1 }).limit(200).lean();
  if (!orders.length) throw new HttpError(404, 'Customer not found.');
  const l = orders[0];
  res.json({
    customer: { name: l.customer.name, phone: l.customer.phone, email: l.customer.email, orders: orders.length, spent: orders.filter((o) => !NOT_REVENUE.includes(o.status)).reduce((s, o) => s + o.total, 0), address: l.address },
    orders: orders.map((o) => ({ id: o.id, createdAt: o.createdAt, items: o.items.map((i) => ({ name: i.name, qty: i.qty })), total: o.total, status: o.status })),
  });
});

// ---------- Upload ----------
export const upload = asyncHandler(async (req, res) => {
  const buf = parseImageDataUrl(req.body.data);
  res.status(201).json({ url: await uploadImage(buf) });
});