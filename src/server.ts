import { createApp } from './app';
import { config } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { logger } from './shared/logger';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const server = createApp().listen(config.PORT, config.HOST, () => {
    logger.info(
      { port: config.PORT, appEnv: config.APP_ENV, docs: config.apiDocsEnabled ? '/api/docs' : 'disabled' },
      'Metro CRM API started'
    );
  });

  server.on('error', (err) => {
    logger.fatal({ err }, 'HTTP server error');
    process.exit(1);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');

    setTimeout(() => {
      logger.error('Forced exit after shutdown timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    server.close(async () => {
      await disconnectDatabase().catch((err) => logger.error({ err }, 'Error while disconnecting database'));
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to start Metro CRM API');
  process.exit(1);
});
