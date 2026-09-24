import app from './app';
import { env } from './config/env';
import { connectDatabase, prisma } from './config/database';

async function bootstrap(): Promise<void> {
  try {
    console.log('🔄 Initializing Metro CRM Backend...');

    // 1. Database connection runs first
    await connectDatabase();

    // 2. Express listens on PORT 5000 and binds to 0.0.0.0
    const PORT = env.PORT || 5000;
    const HOST = '0.0.0.0';

    const server = app.listen(PORT, HOST, () => {
      console.log(`🚀 Metro CRM Backend running in [${env.NODE_ENV}] mode on http://${HOST}:${PORT}`);
      console.log(`📡 Health Check API: http://${HOST}:${PORT}/api/v1/health`);
      console.log(`📚 Swagger Docs:     http://${HOST}:${PORT}/api/docs`);
    });

    server.on('error', (error: Error) => {
      console.error('❌ Server encountered an error:', error);
      process.exit(1);
    });

    // 3. Graceful shutdown handling
    let isShuttingDown = false;
    const handleShutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        try {
          await prisma.$disconnect();
          console.log('Database connection closed.');
        } catch (dbErr) {
          console.error('Error during database disconnect:', dbErr);
        }
        process.exit(0);
      });

      // Force exit if not closed within 10 seconds
      setTimeout(() => {
        console.error('Forced exit after shutdown timeout.');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Fatal error during backend startup:', error);
    process.exit(1);
  }
}

// Global process error listeners to catch unexpected errors and exit with code 1
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// Start the server
bootstrap();
