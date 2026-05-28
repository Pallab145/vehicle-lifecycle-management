import { Queue } from 'bullmq';
import { getRedisClient } from '@/lib/redis';
import type { ConnectionOptions } from 'bullmq';

export const RECONCILIATION_QUEUE_NAME = 'blockchain-reconciliation';

export const reconciliationQueue = new Queue(RECONCILIATION_QUEUE_NAME, {
    connection: getRedisClient() as unknown as ConnectionOptions,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: {
            age: 24 * 3600, // Keep failed jobs for 24 hours
        }
    }
});

/**
 * Initializes the background Cron job for sweeping pending transactions.
 * Runs every 5 minutes by default.
 */
export async function scheduleReconciliationJob() {
    await reconciliationQueue.add('sweep-pending-transactions', null, {
        repeat: {
            pattern: '*/5 * * * *', // Every 5 minutes
        }
    });
}
