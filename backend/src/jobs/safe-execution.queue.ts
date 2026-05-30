import { Queue } from 'bullmq';
import { getRedisClient } from '@/lib/redis';
import type { ConnectionOptions } from 'bullmq';

export const SAFE_EXECUTION_QUEUE_NAME = 'safe-execution';

export const safeExecutionQueue = new Queue(SAFE_EXECUTION_QUEUE_NAME, {
    connection: getRedisClient() as unknown as ConnectionOptions,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false, // Keep failed jobs so we can inspect them
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000, // 5s, 25s, 125s
        }
    }
});
