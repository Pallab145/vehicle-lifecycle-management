import Redis from 'ioredis';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { sseManager } from './sseManager';
import type { NotificationEvent } from './notification.types';
import { RedisKeys } from '@/config/redis.keys';

let subscriber: Redis | null = null;

/**
 * Initializes the global Redis Subscriber.
 * 
 * Note: ioredis requires a dedicated connection for `psubscribe`. We cannot reuse
 * the standard global redis client if it is used for GET/SET operations.
 */
export function initRedisSubscriber() {
    if (subscriber) return;

    logger.info({ event: 'redis_sub_init' }, 'Initializing global Redis Subscriber for SSE...');
    
    subscriber = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    });

    // We subscribe to the pattern `notify:*` to catch all routing channels
    // Examples: `notify:member:cuid123` or `notify:user:cuid456`
    subscriber.psubscribe(RedisKeys.NOTIFICATION_PATTERN, (err, count) => {
        if (err) {
            logger.error({ event: 'redis_sub_error', err }, 'Failed to psubscribe to notification pattern');
            return;
        }
        logger.info({ event: 'redis_sub_active', count }, 'Successfully subscribed to notify:* pattern');
    });

    // When the Indexer publishes a message to a channel matching the pattern:
    subscriber.on('pmessage', (_pattern, channel, message) => {
        try {
            // channel string format: "notify:<routingId>"
            // e.g. "notify:member:cuid123" or "notify:entity:cuid456"
            const routingId = RedisKeys.EXTRACT_ROUTING_ID(channel);
            
            // The Indexer must publish a strictly typed NotificationEvent
            const payload = JSON.parse(message) as NotificationEvent;
            
            // Push to the SSE Manager to route it to the specific active user/member!
            sseManager.broadcastTo(routingId, payload);
            
        } catch (error) {
            logger.error({ event: 'redis_pmessage_error', channel, error }, 'Failed to parse incoming Redis PubSub message');
        }
    });

    subscriber.on('error', (err) => {
        logger.error({ event: 'redis_sub_connection_error', err }, 'Redis Subscriber connection error');
    });
}

export async function shutdownRedisSubscriber() {
    if (subscriber) {
        await subscriber.punsubscribe(RedisKeys.NOTIFICATION_PATTERN);
        await subscriber.quit();
        subscriber = null;
    }
}
