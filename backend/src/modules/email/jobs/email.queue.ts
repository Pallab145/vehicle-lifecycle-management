import { Queue } from 'bullmq';
import { getRedisClient } from '@/lib/redis';

export const EMAIL_QUEUE_NAME = 'email-queue';

export interface SendEmailJobData {
    to: string;
    subject: string;
    htmlBody: string;
}

import type { ConnectionOptions } from 'bullmq';

export const emailQueue = new Queue<SendEmailJobData, void, string>(EMAIL_QUEUE_NAME, {
    connection: getRedisClient() as unknown as ConnectionOptions, // Bypass TS interface mismatch between ioredis versions without using any
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: {
            age: 24 * 3600, // Keep failed jobs for 24 hours
        }
    }
});

/**
 * Enqueues an email sending task to be processed asynchronously in the background.
 */
export async function enqueueEmailJob(to: string, subject: string, htmlBody: string) {
    await emailQueue.add('send-email', { to, subject, htmlBody });
}
