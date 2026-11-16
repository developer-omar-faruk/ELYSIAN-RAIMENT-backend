import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const noTx = (e) => e?.code === 20 || /replica set|Transaction numbers/i.test(e?.message || '');

// Runs fn inside a MongoDB transaction. fn receives (session, undo).
// On a standalone MongoDB (development only) it falls back to compensating undo actions.
export async function atomic(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    try {
      await session.withTransaction(async () => { result = await fn(session, []); });
      return result;
    } catch (e) {
      if (!noTx(e)) throw e;
      if (env.NODE_ENV === 'production' && env.ALLOW_NO_TRANSACTIONS !== 'true') throw e;
      logger.warn('MongoDB transactions unavailable, using compensating fallback (development only)');
    }
    const undo = [];
    try {
      return await fn(null, undo);
    } catch (e) {
      for (const u of undo.reverse()) { try { await u(); } catch { /* best effort */ } }
      throw e;
    }
  } finally {
    await session.endSession();
  }
}