import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';

// Validate before doing anything
const connectionString = env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
}

// Explicitly cap connections per service instance to prevent postgres pool
// exhaustion across a horizontally scaled microservice architecture.
const pool = new Pool({
    connectionString,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    options: `-c statement_timeout=30000 -c idle_in_transaction_session_timeout=10000 -c application_name=${env.SERVICE_NAME ?? 'vehicle-lifecycle'}`,
});

pool.on('error', (err) => logger.error({ err, event: 'db_pool_error' }, '[db] Pool error'));

const adapter = new PrismaPg(pool);

// Singleton — prevents multiple instances in dev hot reload
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

// Log Level Decisioning: Show queries only in debug/trace mode
const showQueries = ['debug', 'trace'].includes(env.LOG_LEVEL);

const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
        log: showQueries
            ? ['query', 'error', 'warn']
            : ['error'],
    });

if (env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

export default prisma;

// Disconnect pool logic is handled gracefully in index.ts
export async function disconnectDatabase() {
    await prisma.$disconnect();
    await pool.end();
}
