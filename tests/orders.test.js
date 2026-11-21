import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { adminAgent, boot } from './helpers.js';

let ctx, app, admin;
const customer = { name: 'Rima Akter', phone: '01712345678', email: '' };
const order = (over = {}) => ({ customer, address: 'House 1, Road 2, Dhaka', area: '', note: '', zone: 'dhaka', items: [{ id: 'tp1', size: 'M', color: '', qty: 1 }], coupon: '', ...over });
const stockOf = async () => (await admin.get('/api/admin/products?q=tp1')).body.items[0].stock;

beforeAll(async () => {
  ctx = await boot(); app = ctx.app; admin = await adminAgent(app);
  await admin.post('/api/admin/categories', { name: 'Tops', desc: '', image: '', published: true });
  const r = await admin.post('/api/admin/products', { id: 'tp1', name: 'Test Top', category: 'tops', price: 1000, oldPrice: '', images: [], sizes: 'M, L', colors: '', tags: '', variants: [], stock: 3, published: true });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  await admin.post('/api/admin/coupons', { code: 'TEST10', type: 'percent', value: 10 });
});
afterAll(async () => { await ctx?.stop(); });

describe('products', () => {
  it('does not publish unverified ratings or review counts', async () => {
    const { publicProduct } = await import('../src/services/product.service.js');
    const product = publicProduct({
      id: 'tp1', slug: 'test-top', name: 'Test Top', category: 'tops', price: 1000,
      sizes: ['M'], colors: [], stock: 3, images: [], rating: 4.9, reviewCount: 128,
      sold: 7, createdAt: new Date(), newArrival: false, trending: false, featured: false,
      description: 'A everyday test item.',
    });
    expect(product).toMatchObject({ rating: 0, reviews: 0, popularity: 7, description: 'An everyday test item.' });
  });

  it('publishes products publicly and paginates admin lists', async () => {
    const pub = await request(app).get('/api/public/bootstrap');
    const product = pub.body.products.find((p) => p.id === 'tp1');
    expect(product.price).toBe(1000);
    expect(product).toMatchObject({
      sizes: ['M', 'L'], colors: [], images: [], rating: 0, reviews: 0, popularity: 0, description: '', fabric: '',
    });
    expect(pub.body.reviews).toEqual([]);
    const list = await admin.get('/api/admin/products?limit=1&page=1');
    expect(list.body.items.length).toBe(1);
    expect((await admin.post('/api/admin/products', { name: '', price: -5 })).status).toBe(400);
  });

  it('invalidates cached storefront data after product changes', async () => {
    await request(app).get('/api/public/bootstrap');
    expect((await admin.patch('/api/admin/products/tp1/flags', { featured: true })).status).toBe(200);
    const refreshed = await request(app).get('/api/public/bootstrap');
    expect(refreshed.body.products.find((p) => p.id === 'tp1').featured).toBe(true);
  });

  it('updates the public slug when a product is renamed', async () => {
    const product = (await admin.get('/api/admin/products?q=tp1')).body.items[0];
    const updated = await admin.put('/api/admin/products/tp1', { ...product, name: 'Renamed Test Top' });
    expect(updated.status).toBe(200);
    const refreshed = await request(app).get('/api/public/bootstrap');
    expect(refreshed.body.products.find((p) => p.id === 'tp1').slug).toBe('renamed-test-top');
  });

  it('aggregates inventory without changing its summary or item shapes', async () => {
    const res = await admin.get('/api/admin/inventory?q=tp1');
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ products: 1, units: 3, low: 1, out: 0 });
    expect(Object.keys(res.body.summary).sort()).toEqual(['low', 'out', 'products', 'threshold', 'units']);
    expect(res.body.items).toMatchObject([{ id: 'tp1', sizes: ['M', 'L'], stock: 3, variants: [] }]);
  });
});

describe('orders', () => {
  it('ignores client-supplied prices and totals', async () => {
    const res = await request(app).post('/api/orders').send(order({ price: 1, total: 1, items: [{ id: 'tp1', size: 'M', color: '', qty: 2, price: 1 }] }));
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(2040); // 2 x 1000 + 40 delivery
    expect(await stockOf()).toBe(1);
  });

  it('rejects insufficient stock, bad quantities and unknown products', async () => {
    expect((await request(app).post('/api/orders').send(order({ items: [{ id: 'tp1', size: 'M', color: '', qty: 2 }], customer: { ...customer, phone: '01811111111' } }))).status).toBe(409);
    expect((await request(app).post('/api/orders').send(order({ items: [{ id: 'tp1', size: 'M', color: '', qty: 0 }] }))).status).toBe(400);
    expect((await request(app).post('/api/orders').send(order({ items: [{ id: 'nope', size: 'M', color: '', qty: 1 }] }))).status).toBe(400);
    expect((await request(app).post('/api/orders').send(order({ items: [{ id: 'tp1', size: 'XXL', color: '', qty: 1 }] }))).status).toBe(400);
    expect(await stockOf()).toBe(1);
  });

  it('is idempotent for retried submissions', async () => {
    const body = order({ customer: { ...customer, phone: '01911111111' }, coupon: 'TEST10' });
    const a = await request(app).post('/api/orders').set('Idempotency-Key', 'retry-key-0001').send(body);
    const b = await request(app).post('/api/orders').set('Idempotency-Key', 'retry-key-0001').send(body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    expect(a.body.total).toBe(940); // 1000 - 10% + 40
    expect(await stockOf()).toBe(0);
  });

  it('calculates customer analytics without returning all customer groups to Node', async () => {
    const res = await admin.get('/api/admin/analytics');
    expect(res.status).toBe(200);
    expect(res.body.customers).toMatchObject({ total: 2, newInRange: 2, returning: 0 });
  });

  it('tracks orders without exposing customer data', async () => {
    const list = (await admin.get('/api/admin/orders')).body.items;
    const t = await request(app).get(`/api/orders/track?ids=${list[0].id}`);
    expect(Object.keys(t.body[0]).sort()).toEqual(['cancelled', 'id', 'status']);
  });

  it('returns the established customer details from projected order fields', async () => {
    const res = await admin.get('/api/admin/customers/01712345678');
    expect(res.status).toBe(200);
    expect(res.body.customer).toMatchObject({ phone: '01712345678', orders: 1 });
    expect(res.body.orders[0]).toMatchObject({ items: [{ name: 'Renamed Test Top', qty: 2 }] });
  });

  it('protects admin order endpoints', async () => {
    expect((await request(app).get('/api/admin/orders')).status).toBe(401);
  });

  it('applies combined admin order edits atomically', async () => {
    const orderRecord = (await admin.get('/api/admin/orders')).body.items.find((item) => item.total === 2040);
    expect(orderRecord).toBeTruthy();
    const stockBeforePatch = await stockOf();
    const patch = await admin.patch(`/api/admin/orders/${orderRecord.id}`).send({
      delivery: { name: 'Updated Name', phone: customer.phone, address: 'New address', area: '', note: '' },
      paymentStatus: 'Paid',
      status: 'Delivered',
    });
    expect(patch.status).toBe(409);
    const saved = await admin.get(`/api/admin/orders/${orderRecord.id}`);
    expect(saved.body).toMatchObject({
      customer: { name: customer.name, phone: customer.phone },
      address: 'House 1, Road 2, Dhaka',
      paymentStatus: 'Unpaid',
      status: 'Pending',
    });
    expect(await stockOf()).toBe(stockBeforePatch);

    const updated = await admin.patch(`/api/admin/orders/${orderRecord.id}`).send({
      delivery: { name: 'Updated Name', phone: '01611111111', address: 'New address', area: 'Central', note: '' },
      paymentStatus: 'Paid',
      status: 'Processing',
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      customer: { name: 'Updated Name', phone: '01611111111' },
      address: 'New address',
      area: 'Central',
      paymentStatus: 'Paid',
      status: 'Processing',
    });
  });

  it('cancels once, restores stock once, and enforces transitions', async () => {
    const list = (await admin.get('/api/admin/orders')).body.items;
    const id = list.find((o) => o.total === 940).id;
    expect((await admin.patch(`/api/admin/orders/${id}`, { status: 'Cancelled' })).status).toBe(200);
    expect(await stockOf()).toBe(1);
    expect((await admin.patch(`/api/admin/orders/${id}`, { status: 'Cancelled' })).status).toBe(200);
    expect(await stockOf()).toBe(1); // not restored twice
    expect((await admin.patch(`/api/admin/orders/${id}`, { status: 'Processing' })).status).toBe(409);
  });
});