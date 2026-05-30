import { Worker, Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis';
import { SAFE_EXECUTION_QUEUE_NAME } from './safe-execution.queue';
import { logger } from '@/lib/logger';
import type { ConnectionOptions } from 'bullmq';
import { adminService } from '@/modules/admin/admin.service';

export function startSafeExecutionWorker() {
    const worker = new Worker(
        SAFE_EXECUTION_QUEUE_NAME,
        async (job: Job<{ proposalId: string }>) => {
            logger.info(`Processing safe execution job ${job.id} for proposal: ${job.data.proposalId}`);
            try {
                await adminService.executeSafeTxInternal(job.data.proposalId);
                logger.info(`Successfully executed safe tx for proposal: ${job.data.proposalId}`);
            } catch (error) {
                logger.error({ err: error, proposalId: job.data.proposalId }, `Safe execution failed for proposal`);
                throw error; // Let BullMQ retry
            }
        },
        {
            connection: getRedisClient() as unknown as ConnectionOptions,
            concurrency: 1, // Execute sequentially to prevent nonce collisions
        }
    );

    worker.on('failed', async (job, err) => {
        if (job) {
            logger.error(`Job ${job.id} failed: ${err.message}`);
            // If it's the last attempt, the adminService or here can mark it as failed
            if (job.attemptsMade >= (job.opts.attempts || 3)) {
                logger.error(`Job ${job.id} exhausted all retries. Marking proposal as EXECUTION_FAILED.`);
                await adminService.markProposalAsFailed(job.data.proposalId);
            }
        }
    });

    logger.info(`Worker for ${SAFE_EXECUTION_QUEUE_NAME} started.`);
    return worker;
}
