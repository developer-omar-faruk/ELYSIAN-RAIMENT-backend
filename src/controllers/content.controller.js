import { Banner, Category, Product } from '../models/catalog.js';
import { Coupon, Review } from '../models/commerce.js';
import { Settings } from '../models/system.js';
import { asyncHandler, HttpError } from '../utils/errors.js';
import { slugify, todayStr } from '../utils/helpers.js';
import { getSettings } from '../services/settings.service.js';
import { deleteImages } from '../services/upload.service.js';

// ---------- Categories ----------
export const listCategories = asyncHandler(async (req, res) => {
  const [cats, counts] = await Promise.all([Category.find({}).sort({ order: 1 }).lean(), Product.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }])]);
  const map = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  res.json({ items: cats.map((c) => ({ slug: c.slug, name: c.name, desc: c.desc, image: c.image, published: c.published, products: map[c.slug] || 0 })) });
});
export const createCategory = asyncHandler(async (req, res) => {
  const base = slugify(req.body.name);
  let slug = base;
  for (let n = 2; await Category.exists({ slug }); n++) slug = `${base}-${n}`;
  const last = await Category.findOne().sort({ order: -1 }).select('order').lean();
  const c = await Category.create({ ...req.body, slug, order: (last?.order ?? -1) + 1 });
  res.status(201).json(c);
});
export const updateCategory = asyncHandler(async (req, res) => {
  const old = await Category.findOne({ slug: req.params.slug });
  if (!old) throw new HttpError(404, 'Category not found.');
  const removed = old.image && old.image !== req.body.image ? [old.image] : [];
  old.set(req.body);
  await old.save();
  deleteImages(removed);
  res.json(old);
});
export const deleteCategory = asyncHandler(async (req, res) => {
  const n = await Product.countDocuments({ category: req.params.slug });
  if (n) throw new HttpError(409, `This category still has ${n} product(s). Move or delete them first.`);
  const c = await Category.findOneAndDelete({ slug: req.params.slug });
  if (!c) throw new HttpError(404, 'Category not found.');
  deleteImages([c.image]);
  res.json({ ok: true });
});
export const reorderCategories = asyncHandler(async (req, res) => {
  await Category.bulkWrite(req.body.slugs.map((slug, order) => ({ updateOne: { filter: { slug }, update: { $set: { order } } } })));
  res.json({ ok: true });
});

// ---------- Banners ----------
export const listBanners = asyncHandler(async (req, res) => res.json({ items: await Banner.find({}).sort({ order: 1 }).lean() }));
export const createBanner = asyncHandler(async (req, res) => {
  const last = await Banner.findOne().sort({ order: -1 }).select('order').lean();
  res.status(201).json(await Banner.create({ ...req.body, order: (last?.order ?? -1) + 1 }));
});
export const updateBanner = asyncHandler(async (req, res) => {
  const b = await Banner.findById(req.params.id);
  if (!b) throw new HttpError(404, 'Banner not found.');
  const removed = b.image !== req.body.image ? [b.image] : [];
  b.set(req.body);
  await b.save();
  deleteImages(removed);
  res.json(b);
});
export const deleteBanner = asyncHandler(async (req, res) => {
  const b = await Banner.findByIdAndDelete(req.params.id);
  if (!b) throw new HttpError(404, 'Banner not found.');
  deleteImages([b.image]);
  res.json({ ok: true });
});
export const reorderBanners = asyncHandler(async (req, res) => {
  await Banner.bulkWrite(req.body.ids.map((id, order) => ({ updateOne: { filter: { _id: id }, update: { $set: { order } } } })));
  res.json({ ok: true });
});

// ---------- Coupons ----------
export const listCoupons = asyncHandler(async (req, res) => res.json({ items: await Coupon.find({}).sort({ createdAt: -1 }).lean(), today: todayStr() }));
export const createCoupon = asyncHandler(async (req, res) => res.status(201).json(await Coupon.create(req.body)));
export const updateCoupon = asyncHandler(async (req, res) => {
  const c = await Coupon.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  if (!c) throw new HttpError(404, 'Coupon not found.');
  res.json(c);
});
export const deleteCoupon = asyncHandler(async (req, res) => {
  if (!(await Coupon.findByIdAndDelete(req.params.id))) throw new HttpError(404, 'Coupon not found.');
  res.json({ ok: true });
});

// ---------- Reviews ----------
export const listReviews = asyncHandler(async (req, res) => {
  const f = req.query.status ? { approved: req.query.status === 'approved' } : {};
  res.json({ items: await Review.find(f).sort({ createdAt: -1 }).limit(500).lean() });
});
export const patchReview = asyncHandler(async (req, res) => {
  const r = await Review.findByIdAndUpdate(req.params.id, { $set: { approved: req.body.approved } }, { new: true });
  if (!r) throw new HttpError(404, 'Review not found.');
  res.json(r);
});
export const deleteReview = asyncHandler(async (req, res) => {
  if (!(await Review.findByIdAndDelete(req.params.id))) throw new HttpError(404, 'Review not found.');
  res.json({ ok: true });
});

// ---------- Settings ----------
export const getAdminSettings = asyncHandler(async (req, res) => {
  const { _id, __v, key, createdAt, updatedAt, ...s } = await getSettings();
  res.json({ ...s, zones: s.zones.map((z) => ({ id: z.id, label: z.label, fee: z.fee, note: z.note })) });
});
export const putSettings = asyncHandler(async (req, res) => {
  const ids = new Set();
  const zones = req.body.zones.map((z) => {
    let id = z.id || slugify(z.label);
    for (let n = 2; ids.has(id); n++) id = `${slugify(z.label)}-${n}`;
    ids.add(id);
    return { ...z, id };
  });
  await getSettings();
  await Settings.updateOne({ key: 'store' }, { $set: { ...req.body, zones } });
  res.json({ ok: true });
});