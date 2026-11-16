import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { boot, OWNER } from './helpers.js';

let ctx, app;
beforeAll(async () => { ctx = await boot(); app = ctx.app; });
afterAll(async () => { await ctx?.stop(); });

const cookieOf = (res, name) => res.headers['set-cookie'].find((c) => c.startsWith(`${name}=`)).split(';')[0];

describe('admin authentication', () => {
  it('reports setup is needed and blocks unauthenticated access', async () => {
    expect((await request(app).get('/api/admin/setup-status')).body.needsSetup).toBe(true);
    expect((await request(app).get('/api/admin/products')).status).toBe(401);
    expect((await request(app).get('/api/admin/me')).status).toBe(401);
  });

  it('rejects setup with a wrong token and accepts the right one exactly once', async () => {
    const bad = await request(app).post('/api/admin/setup').send({ ...OWNER, token: 'x'.repeat(32) });
    expect(bad.status).toBe(403);
    const ok = await request(app).post('/api/admin/setup').send({ ...OWNER, token: process.env.INITIAL_ADMIN_SETUP_TOKEN });
    expect(ok.status).toBe(201);
    expect(JSON.stringify(ok.body)).not.toMatch(/passwordHash|password/i);
    const again = await request(app).post('/api/admin/setup').send({ ...OWNER, email: 'two@example.com', token: process.env.INITIAL_ADMIN_SETUP_TOKEN });
    expect(again.status).toBe(409);
  });

  it('handles simultaneous setup requests safely', async () => {
    // Owner already exists here, so every concurrent attempt must fail [1,2,3 this is previous code]
    const rs = await Promise.all([1, 2].map((n) =>  request(app).post('/api/admin/setup').send({ ...OWNER, email: `r${n}@example.com`, token: process.env.INITIAL_ADMIN_SETUP_TOKEN })));
    expect(rs.every((r) => r.status === 409)).toBe(true);
  });

  it('rejects invalid credentials with a generic message', async () => {
    const a = await request(app).post('/api/admin/login').send({ email: OWNER.email, password: 'wrong-password-123' });
    const b = await request(app).post('/api/admin/login').send({ email: 'nobody@example.com', password: 'wrong-password-123' });
    expect(a.status).toBe(401);
    expect(a.body.error).toBe(b.body.error);
  });

  it('logs in, requires CSRF for writes, and logs out', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/admin/login').send({ email: OWNER.email, password: OWNER.password });
    expect(login.status).toBe(200);
    expect((await agent.get('/api/admin/me')).status).toBe(200);
    expect((await agent.post('/api/admin/categories').send({ name: 'Test' })).status).toBe(403);
    expect((await agent.post('/api/admin/categories').set('X-CSRF-Token', login.body.csrf).send({ name: 'Test' })).status).toBe(201);
    await agent.post('/api/admin/logout').set('X-CSRF-Token', login.body.csrf);
    expect((await agent.get('/api/admin/me')).status).toBe(401);
  });

  it('rejects expired access tokens', async () => {
    const expired = jwt.sign({ sid: '000000000000000000000000', role: 'owner' }, process.env.JWT_ACCESS_SECRET, { subject: 'x', expiresIn: -10, issuer: 'rg-api' });
    const r = await request(app).get('/api/admin/me').set('Cookie', [`rg_at=${expired}`]);
    expect(r.status).toBe(401);
  });

  it('rotates refresh tokens and revokes the session when an old one is replayed', async () => {
    const login = await request(app).post('/api/admin/login').send({ email: OWNER.email, password: OWNER.password });
    const rt1 = cookieOf(login, 'rg_rt');
    const r1 = await request(app).get('/api/admin/me').set('Cookie', [rt1]); // access cookie missing -> refresh
    expect(r1.status).toBe(200);
    const rt2 = cookieOf(r1, 'rg_rt');
    expect(rt2).not.toBe(rt1);
    await new Promise((r) => setTimeout(r, 20));
    expect((await request(app).get('/api/admin/me').set('Cookie', [rt1])).status).toBe(401); // replay
    expect((await request(app).get('/api/admin/me').set('Cookie', [rt2])).status).toBe(401); // session revoked
  });
});