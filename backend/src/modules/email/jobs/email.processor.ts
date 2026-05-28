import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import { getRedisClient } from '@/lib/redis';
import { workerManager } from '@/lib/worker-manager';
import { emailService } from '../email.service';
import type { SendEmailJobData } from './email.queue';
import { EMAIL_QUEUE_NAME } from './email.queue';
import { logger } from '@/lib/logger';

/**
 * BullMQ background worker that processes email sending jobs.
 */
const emailWorker = new Worker<SendEmailJobData, void, string>(
    EMAIL_QUEUE_NAME,
    async (job: Job<SendEmailJobData, void, string>) => {
        const { to, subject, htmlBody } = job.data;
        
        // Log job attempt (job.attemptsMade is 0-indexed in BullMQ, so +1 for display)
        logger.info(
            { jobId: job.id, to, subject, attempt: job.attemptsMade + 1 }, 
            'Processing background email delivery...'
        );
        
        // Trigger the actual Resend API delivery
        await emailService.sendEmailDirect(to, subject, htmlBody);
    },
    { connection: getRedisClient() as unknown as ConnectionOptions }
);

emailWorker.on('completed', (job) => {
    logger.info({ jobId: job.id, queue: EMAIL_QUEUE_NAME }, 'Email job completed successfully');
});

emailWorker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, queue: EMAIL_QUEUE_NAME }, 'Email job failed');
});

// Track worker for graceful shutdown on server exit
workerManager.add(emailWorker);

export { emailWorker };
