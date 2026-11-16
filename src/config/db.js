import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

// line 6 to 10 for cnnect db virction node 24 extra neded
import { setServers } from 'node:dns';
setServers([
  '1.1.1.1',
  '8.8.8.8'
]);

mongoose.set('strictQuery', true);

export async function connectDb() {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000, maxPoolSize: 20 });
  await mongoose.connection.db.admin().ping();
  await mongoose.syncIndexes();
  logger.info('MongoDB connected');
}

export async function dbHealthy() {
  if (mongoose.connection.readyState !== 1) return false;
  try { await mongoose.connection.db.admin().ping(); return true; } catch { return false; }
}