import mongoose from 'mongoose';
import { env } from './src/config/env.js';
import { logger } from './src/config/logger.js';
import { connectDb } from './src/config/db.js';
import { createApp } from './src/app.js';

async function main() {
  await connectDb();
  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'API listening'));

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'Shutting down');
    const force = setTimeout(() => process.exit(1), 10000);
    force.unref();
    server.close(async () => {
      await mongoose.disconnect().catch(() => {});
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => { logger.error({ err }, 'Unhandled rejection'); shutdown('unhandledRejection'); });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});