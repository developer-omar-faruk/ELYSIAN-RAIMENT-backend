import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const variantSchema = new Schema({
  size: { type: String, required: true, trim: true },
  color: { type: String, default: '', trim: true },
  stock: { type: Number, default: 0, min: 0, validate: Number.isInteger },
});

const productSchema = new Schema({
  id: { type: String, required: true, unique: true, trim: true },
  slug: { type: String, required: true, unique: true },
  sku: { type: String, unique: true, sparse: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, required: true, index: true },
  description: { type: String, default: '' },
  fabric: { type: String, default: '' },
  price: { type: Number, required: true, min: 1, validate: Number.isInteger },
  oldPrice: { type: Number, default: null },
  images: { type: [String], default: [] },
  sizes: { type: [String], default: [] },
  colors: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  variants: { type: [variantSchema], default: [] },
  stock: { type: Number, default: 0, min: 0, validate: Number.isInteger },
  sold: { type: Number, default: 0, min: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0, min: 0 },
  featured: { type: Boolean, default: false },
  trending: { type: Boolean, default: false },
  newArrival: { type: Boolean, default: false },
  published: { type: Boolean, default: true },
}, { timestamps: true });
productSchema.index({ published: 1, createdAt: -1 });
productSchema.index({ name: 1 });
productSchema.pre('validate', function () {
  if (this.variants?.length) this.stock = this.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
});
export const Product = model('Product', productSchema);

const categorySchema = new Schema({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  desc: { type: String, default: '' },
  image: { type: String, default: '' },
  published: { type: Boolean, default: true },
  order: { type: Number, default: 0, index: true },
}, { timestamps: true });
export const Category = model('Category', categorySchema);

const bannerSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  subtitle: { type: String, default: '' },
  image: { type: String, required: true },
  button: { type: String, default: '' },
  link: { type: String, default: '/shop' },
  pos: { type: String, default: 'center' },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0, index: true },
}, { timestamps: true });
export const Banner = model('Banner', bannerSchema);