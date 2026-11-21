import { Category, Product } from '../models/catalog.js';
import { HttpError } from '../utils/errors.js';
import { randomToken, slugify } from '../utils/helpers.js';

export const publicProduct = (p) => ({
  id: p.id, slug: p.slug, name: p.name, category: p.category, price: p.price, oldPrice: p.oldPrice ?? null,
  sizes: p.sizes, colors: p.colors, rating: 0, reviews: 0, stock: p.stock, images: p.images,
  isNew: p.newArrival, trending: p.trending, featured: p.featured, popularity: p.sold || 0,
  createdAt: +new Date(p.createdAt), description: p.description?.replace(/^A everyday\b/i, 'An everyday') || '', fabric: p.fabric,
});

export const adminProduct = (p) => ({
  id: p.id, sku: p.sku || '', name: p.name, category: p.category, description: p.description, fabric: p.fabric,
  price: p.price, oldPrice: p.oldPrice ?? null, images: p.images, sizes: p.sizes, colors: p.colors, tags: p.tags,
  variants: (p.variants || []).map((v) => ({ _id: String(v._id), size: v.size, color: v.color, stock: v.stock })),
  stock: p.stock, featured: p.featured, trending: p.trending, newArrival: p.newArrival, published: p.published, createdAt: p.createdAt,
});

export async function uniqueSlug(name, excludeId) {
  const base = slugify(name);
  for (let n = 0; n < 50; n++) {
    const slug = n ? `${base}-${n + 1}` : base;
    const hit = await Product.findOne({ slug }).select('id').lean();
    if (!hit || hit.id === excludeId) return slug;
  }
  return `${base}-${randomToken(3).toLowerCase()}`;
}

const uniq = (a) => [...new Set(a)];

// Converts validated input into the fields stored on a product
export async function buildProductFields(input) {
  if (!(await Category.exists({ slug: input.category }))) throw new HttpError(400, 'category: That category does not exist.');
  const variants = input.variants.map((v) => ({ ...(v._id ? { _id: v._id } : {}), size: v.size, color: v.color, stock: v.stock }));
  const keys = variants.map((v) => `${v.size}|${v.color}`);
  if (new Set(keys).size !== keys.length) throw new HttpError(400, 'variants: Duplicate size/colour combinations.');
  return {
    name: input.name, category: input.category, description: input.description, fabric: input.fabric,
    price: input.price, oldPrice: input.oldPrice && input.oldPrice > input.price ? input.oldPrice : null,
    images: input.images, tags: input.tags,
    sizes: uniq([...input.sizes, ...variants.map((v) => v.size)]),
    colors: uniq([...input.colors, ...variants.map((v) => v.color).filter(Boolean)]),
    variants, stock: input.stock,
    featured: input.featured, trending: input.trending, newArrival: input.newArrival, published: input.published,
  };
}