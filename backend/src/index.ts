import 'dotenv/config';
import { createServer } from 'http';
import type { Server } from 'http';
import { createApp } from './app';
import { logger } from '@/lib/logger';
import { env } from '@/config/env';
import prisma, { disconnectDatabase } from '@/lib/prisma';
import { initializeWorkers } from '@/lib/worker-init';
import { workerManager } from '@/lib/worker-manager';
import { getRedisClient, disconnectRedis } from '@/lib/redis';

// ─── Startup Health Checks ────────────────────────────────────────

async function checkDependencies(): Promise<void> {
  try {
    // 1. Ping the database to ensure connection is alive
    await prisma.$queryRaw`SELECT 1`;
    logger.info({ event: 'db_connected' }, 'Database connection verified via Prisma');

    // 2. Ping Redis to ensure queue is alive
    const redis = getRedisClient();
    await redis.ping();
    logger.info({ event: 'redis_ping_success' }, 'Redis connection verified via ioredis');

  } catch (err) {
    logger.fatal({ event: 'dependency_check_failed', err }, 'Critical infrastructure connection failed — aborting startup');
    process.exit(1);
  }
}

// ─── Graceful Shutdown ────────────────────────────────────────────

async function gracefulShutdown(
  signal: string,
  httpServer: Server,
): Promise<void> {
  logger.info({ event: 'shutdown_initiated', signal }, `Received ${signal}, shutting down gracefully`);

  // Force exit safety net
  const forceExit = setTimeout(() => {
    logger.error({ event: 'shutdown_timeout' }, 'Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 30_000);

  forceExit.unref();

  // 1. Close HTTP server (stop accepting new connections)
  httpServer.close(async () => {
    logger.info({ event: 'http_server_closed' }, 'HTTP server closed');

    // 2. Shut down background workers gracefully
    try {
      await workerManager.shutdown();
    } catch (err) {
      logger.error({ event: 'worker_shutdown_error', err }, 'Error during background worker shutdown');
    }

    // 4. Disconnect Database safely
    try {
      await disconnectDatabase();
      logger.info({ event: 'db_disconnected' }, 'Prisma & pg pool disconnected safely');
    } catch (err) {
      logger.error({ event: 'db_disconnect_error', err }, 'Error disconnecting Prisma');
    }

    // 5. Disconnect Redis safely
    try {
      const { shutdownRedisSubscriber } = await import('@/modules/notification/redisSubscriber');
      await shutdownRedisSubscriber();
      await disconnectRedis();
    } catch (err) {
      logger.error({ event: 'redis_disconnect_error', err }, 'Error disconnecting Redis');
    }

    logger.info({ event: 'shutdown_complete' }, 'Graceful shutdown complete');
    clearTimeout(forceExit);
    process.exit(0);
  });
}

// ─── Unhandled Errors ─────────────────────────────────────────────

process.on('unhandledRejection', (reason) => {
  logger.error({ event: 'unhandled_rejection', reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ event: 'uncaught_exception', err }, 'Uncaught exception — exiting');
  process.exit(1);
});

// ─── Bootstrap ────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  logger.info({
    event: 'bootstrap_start',
    service: env.SERVICE_NAME ?? 'vehicle-lifecycle',
    port: env.PORT,
    env: env.NODE_ENV,
  }, 'Starting API Gateway...');

  // 1. Verify dependencies before starting
  await checkDependencies();

  // 2. Initialize Background Workers
  await initializeWorkers();

  // 3. Initialize SSE Redis Subscriber
  const { initRedisSubscriber } = await import('@/modules/notification/redisSubscriber');
  initRedisSubscriber();

  // 4. Create HTTP server
  const app = createApp();
  const httpServer = createServer(app);

  // 4. Start listening
  httpServer.listen(env.PORT, () => {
    logger.info({
      event: 'server_started',
      port: env.PORT,
      env: env.NODE_ENV,
      service: env.SERVICE_NAME ?? 'vehicle-lifecycle',
    }, `🚀 API Gateway listening on port ${env.PORT}`);
  });

  // 5. Wire shutdown signals
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM', httpServer));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT', httpServer));
}

// ─── Start ────────────────────────────────────────────────────────

bootstrap().catch((err) => {
  logger.fatal({ event: 'bootstrap_failed', err }, 'Failed to start API Gateway');
  process.exit(1);
});
