import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { logger } from './config/logger.js';
import { corsMiddleware, globalLimiter, sanitize } from './middleware/security.js';
import { errorHandler, notFound } from './middleware/error.js';
import { env } from './config/env.js';
import publicRoutes from './routes/public.routes.js';
import adminRoutes from './routes/admin.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

  app.use(pinoHttp({
    logger,
    serializers: {
      req: (r) => ({ id: r.id, method: r.method, url: String(r.url).split('?')[0] }),
      res: (r) => ({ statusCode: r.statusCode }),
    },
  }));
  app.use(helmet());
  app.use(corsMiddleware);
  app.use(globalLimiter);
  app.use(cookieParser());

  // Small body limit everywhere except the image upload route, which parses its own (authenticated) body
  const smallJson = express.json({ limit: '100kb' });
  app.use((req, res, next) => (req.path === '/api/admin/upload' ? next() : smallJson(req, res, next)));
  app.use(sanitize);

  app.use('/api/admin', adminRoutes);
  app.use('/api', publicRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}