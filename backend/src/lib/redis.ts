import Redis from 'ioredis';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';

let redis: Redis | null = null;

/**
 * Retrieves the global Redis client singleton.
 * Initializes a new connection to REDIS_URL if one does not exist.
 * The maxRetriesPerRequest option is set to null to satisfy BullMQ requirements.
 */
export function getRedisClient(): Redis {
    if (!redis) {
        logger.info({ event: 'redis_init', url: env.REDIS_URL }, 'Initializing global Redis connection...');
        redis = new Redis(env.REDIS_URL, {
            maxRetriesPerRequest: null, // Required by BullMQ
            enableReadyCheck: false,
        });

        redis.on('error', (err) => {
            logger.error({ event: 'redis_error', err }, 'Redis connection error');
        });

        redis.on('connect', () => {
            logger.info({ event: 'redis_connected' }, 'Successfully connected to Redis');
        });
    }

    return redis;
}

/**
 * Gracefully disconnects the global Redis client.
 */
export async function disconnectRedis(): Promise<void> {
    if (redis) {
        logger.info({ event: 'redis_disconnect' }, 'Disconnecting Redis client...');
        await redis.quit();
        redis = null;
        logger.info({ event: 'redis_disconnected' }, 'Redis client disconnected successfully');
    }
}
