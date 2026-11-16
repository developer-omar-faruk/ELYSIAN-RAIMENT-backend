import { Banner, Category, Product } from '../models/catalog.js';
import { Order, Review } from '../models/commerce.js';
import { asyncHandler, HttpError } from '../utils/errors.js';
import { statusIndex } from '../utils/constants.js';
import { dbHealthy } from '../config/db.js';
import { getSettings } from '../services/settings.service.js';
import { publicProduct } from '../services/product.service.js';
import { createOrder, storefrontOrder } from '../services/order.service.js';
import { evalCoupon } from '../services/coupon.service.js';
import { notifyNewOrder } from '../services/email.service.js';

export const health = async (req, res) => {
  const ok = await dbHealthy();
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'unavailable', db: ok ? 'up' : 'down' });
};

const strip = (o) => { if (!o) return {}; const { _id, ...rest } = o; return rest; };

export const bootstrap = asyncHandler(async (req, res) => {
  const [products, categories, banners, reviews, s] = await Promise.all([
    Product.find({ published: true }).sort({ createdAt: -1 }).lean(),
    Category.find({ published: true }).sort({ order: 1 }).lean(),
    Banner.find({ active: true }).sort({ order: 1 }).lean(),
    Review.find({ approved: true }).sort({ createdAt: -1 }).limit(12).lean(),
    getSettings(),
  ]);
  const pub = products.map(publicProduct);
  res.set('Cache-Control', 'no-store').json({
    products: pub,
    categories: categories.map((c) => ({ slug: c.slug, name: c.name, desc: c.desc, image: c.image })),
    banners: banners.map((b) => ({ image: b.image, title: b.title, text: b.subtitle, pos: b.pos, button: b.button, link: b.link })),
    reviews: reviews.map((r) => ({ name: r.name, city: r.city, rating: r.rating, text: r.text, image: r.image })),
    home: { featuredIds: pub.filter((p) => p.featured).map((p) => p.id), trendingIds: pub.filter((p) => p.trending).map((p) => p.id) },
    brand: strip(s.brand), contact: strip(s.contact), policies: strip(s.policies), newsletter: strip(s.newsletter),
    zones: s.zones.map((z) => ({ id: z.id, label: z.label, fee: z.fee, note: z.note })),
  });
});

export const placeOrder = asyncHandler(async (req, res) => {
  const key = req.get('idempotency-key');
  if (key && !/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new HttpError(400, 'Invalid Idempotency-Key header.');
  const { order, duplicate } = await createOrder(req.body, { idemKey: key || undefined });
  if (!duplicate) notifyNewOrder(order);
  res.status(duplicate ? 200 : 201).json(storefrontOrder(order));
});

// Minimal data only: no customer details are ever returned here
export const trackOrders = asyncHandler(async (req, res) => {
  const ids = [...new Set(req.query.ids.split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]{6,40}$/.test(s)))].slice(0, 20);
  const list = ids.length ? await Order.find({ id: { $in: ids } }).select('id status').lean() : [];
  res.json(list.map((o) => ({ id: o.id, status: statusIndex(o.status), cancelled: o.status === 'Cancelled' })));
});

export const validateCoupon = asyncHandler(async (req, res) => {
  const c = await evalCoupon(req.body.code, req.body.subtotal);
  res.json({ code: c.code, label: c.label, value: c.value });
});