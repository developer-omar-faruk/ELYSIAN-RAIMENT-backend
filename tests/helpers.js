import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

export const ORIGIN = 'http://localhost:5173';
export const OWNER = { name: 'Owner', email: 'owner@example.com', password: 'a-very-long-password-123' };

export async function boot(extraEnv = {}) {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: repl.getUri(), CLIENT_ORIGIN: ORIGIN, LOG_LEVEL: 'silent',
    JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), COOKIE_SECRET: 'c'.repeat(40),
    INITIAL_ADMIN_SETUP_TOKEN: 't'.repeat(32), LOGIN_MAX: '50', REFRESH_GRACE_MS: '1', ...extraEnv,
  });
  const { createApp } = await import('../src/app.js');
  const { connectDb } = await import('../src/config/db.js');
  const mongoose = (await import('mongoose')).default;
  await connectDb();
  return { app: createApp(), stop: async () => { await mongoose.disconnect(); await repl.stop(); } };
}

export async function adminAgent(app) {
  const agent = request.agent(app);
  const res = await agent.post('/api/admin/setup').send({ ...OWNER, token: process.env.INITIAL_ADMIN_SETUP_TOKEN });
  if (res.status !== 201) throw new Error(`setup failed ${res.status} ${JSON.stringify(res.body)}`);
  const csrf = res.body.csrf;
  const call = (method, url, body) => {
    const r = agent[method](url).set('X-CSRF-Token', csrf);
    return body === undefined ? r : r.send(body);
  };
  return { agent, csrf, get: (u) => call('get', u), post: (u, b) => call('post', u, b), put: (u, b) => call('put', u, b), patch: (u, b) => call('patch', u, b), del: (u) => call('delete', u) };
}