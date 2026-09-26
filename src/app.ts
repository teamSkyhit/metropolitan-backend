import express, { type Express } from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { config } from './config/env';
import { createDocsRouter } from './config/swagger';
import { corsMiddleware, errorHandler, notFoundHandler, rateLimiters, requestLogger } from './middleware';
import { createApiRouter, modules } from './routes';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(requestLogger);
  if (config.apiDocsEnabled) app.use('/api', createDocsRouter(modules));

  app.use(helmet());
  app.use(corsMiddleware);
  if (config.STORAGE_DRIVER === 'local') {
    app.use(config.STORAGE_BASE_URL, express.static(path.resolve(config.STORAGE_LOCAL_DIR)));
  }
  app.use(express.json({ limit: config.BODY_LIMIT }));
  app.use('/api', rateLimiters.global);

  app.use('/api/v1', createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
