// Imports the store's existing catalogue from the frontend data.js (read-only) into MongoDB.
// Usage: npm run seed -- [path/to/data.js]
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';
import { Banner, Category, Product } from '../src/models/catalog.js';
import { Coupon } from '../src/models/commerce.js';
import { Settings } from '../src/models/system.js';

const candidates = [process.argv[2], '../my-project/src/data.js'].filter(Boolean).map((p) => path.resolve(process.cwd(), p));
const file = candidates.find((p) => fs.existsSync(p));
if (!file) { console.error('Could not find data.js. Pass its path as the first argument.'); process.exit(1); }

// data.js has no imports, so it can be loaded from a data: URL regardless of the frontend package type
const src = fs.readFileSync(file, 'utf8');
const D = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);

await connectDb();
const now = Date.now();

for (const [i, c] of D.CATEGORIES.entries()) {
  await Category.updateOne({ slug: c.slug }, { $setOnInsert: { slug: c.slug, name: c.name, desc: c.desc, image: c.image, order: i, published: true } }, { upsert: true });
}
for (const [i, p] of D.PRODUCTS.entries()) {
  await Product.updateOne({ id: p.id }, { $setOnInsert: {
    id: p.id, slug: p.slug, sku: `ER-${p.id.toUpperCase()}`, name: p.name, category: p.category, price: p.price, oldPrice: p.oldPrice ?? null,
    sizes: p.sizes, colors: p.colors, stock: p.stock, images: p.images,
    newArrival: !!p.isNew, trending: !!p.trending, featured: !!p.featured, description: p.description, fabric: p.fabric, published: true,
    createdAt: new Date(now - i * 86_400_000), updatedAt: new Date(),
  } }, { upsert: true, timestamps: false });
}
if (!(await Banner.countDocuments())) {
  await Banner.insertMany(D.HERO_SLIDES.map((s, order) => ({ image: s.image, title: s.title, subtitle: s.text, pos: s.pos, button: 'Shop Now', link: '/shop', order })));
}
for (const [code, c] of Object.entries(D.COUPONS)) {
  await Coupon.updateOne({ code }, { $setOnInsert: { code, type: c.type, value: c.value } }, { upsert: true });
}
await Settings.updateOne({ key: 'store' }, { $setOnInsert: {
  key: 'store',
  brand: { name: D.BRAND.name, tagline: D.BRAND.tagline, description: D.BRAND.description },
  contact: D.CONTACT, zones: D.DELIVERY_ZONES, newsletter: D.NEWSLETTER,
  policies: { delivery: D.INFO_SECTIONS[0].text, exchange: D.INFO_SECTIONS[1].text },
  lowStock: 5,
} }, { upsert: true });

console.log(`Seeded ${D.PRODUCTS.length} products, ${D.CATEGORIES.length} categories from ${file}`);
await mongoose.disconnect();