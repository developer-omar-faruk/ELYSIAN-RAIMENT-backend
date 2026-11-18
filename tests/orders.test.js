import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { adminAgent, boot } from './helpers.js';

let ctx, app, admin;
const customer = { name: 'Rima Akter', phone: '01712345678', email: 'rima@example.com' };
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
  it('publishes products publicly and paginates admin lists', async () => {
    const pub = await request(app).get('/api/public/bootstrap');
    expect(pub.body.products.find((p) => p.id === 'tp1').price).toBe(1000);
    const list = await admin.get('/api/admin/products?limit=1&page=1');
    expect(list.body.items.length).toBe(1);
    expect((await admin.post('/api/admin/products', { name: '', price: -5 })).status).toBe(400);
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

  it('tracks orders without exposing customer data', async () => {
    const list = (await admin.get('/api/admin/orders')).body.items;
    const t = await request(app).get(`/api/orders/track?ids=${list[0].id}`);
    expect(Object.keys(t.body[0]).sort()).toEqual(['cancelled', 'id', 'status']);
  });

  it('protects admin order endpoints', async () => {
    expect((await request(app).get('/api/admin/orders')).status).toBe(401);
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