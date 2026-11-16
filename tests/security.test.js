import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { adminAgent, boot, OWNER, ORIGIN } from './helpers.js';

let ctx, app;
beforeAll(async () => { ctx = await boot({ LOGIN_MAX: '4' }); app = ctx.app; });
afterAll(async () => { await ctx?.stop(); });

describe('security', () => {
  it('reports healthy while the database is up', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('blocks disallowed origins and answers allowed ones', async () => {
    expect((await request(app).get('/api/public/bootstrap').set('Origin', 'https://evil.example')).status).toBe(403);
    const ok = await request(app).get('/api/public/bootstrap').set('Origin', ORIGIN);
    expect(ok.status).toBe(200);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rejects NoSQL operator injection', async () => {
    expect((await request(app).post('/api/admin/login').send({ email: { $ne: null }, password: { $ne: null } })).status).toBe(400);
    const o = await request(app).post('/api/orders').send({ customer: { name: 'A', phone: '01712345678' }, address: 'x', zone: 'dhaka', items: [{ id: { $ne: null }, size: 'M', qty: 1 }] });
    expect(o.status).toBe(400);
    expect((await request(app).get('/api/admin/orders?status[$ne]=x')).status).toBe(400);
  });

  it('rejects malformed payloads', async () => {
    expect((await request(app).post('/api/orders').send({})).status).toBe(400);
    expect((await request(app).post('/api/orders').set('Content-Type', 'application/json').send('{bad')).status).toBe(400);
  });

  it('rejects non-image uploads', async () => {
    const admin = await adminAgent(app);
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"></svg>'.repeat(5)).toString('base64')}`;
    expect((await admin.post('/api/admin/upload', { data: svg })).status).toBe(400);
    const fake = `data:image/png;base64,${Buffer.from('this is not really a png file at all!!').toString('base64')}`;
    expect((await admin.post('/api/admin/upload', { data: fake })).status).toBe(400);
    expect((await request(app).post('/api/admin/upload').send({ data: fake })).status).toBe(401);
  });

  it('rate limits repeated failed logins', async () => {
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await request(app).post('/api/admin/login').send({ email: OWNER.email, password: 'wrong-password-999' })).status);
    expect(codes).toContain(429);
  });
});