import { logger } from '@/lib/logger';

/**
 * Standardized worker initialization for the backend.
 * Handles background job processors.
 */
export async function initializeWorkers() {
    logger.info({ event: 'workers_init_start' }, '🚀 Initializing in-memory background workers...');

    try {
        // Register email worker (dynamically imported for better isolation)
        await import('@/modules/email/jobs/email.processor');

        // Start Blockchain Indexer Daemon
        const { indexerService } = await import('@/modules/indexer/indexer.service');
        await indexerService.start();

        // Start Blockchain Reconciliation Worker
        await import('@/jobs/reconciliation.worker');
        const { scheduleReconciliationJob } = await import('@/jobs/reconciliation.queue');
        await scheduleReconciliationJob();

        // Start Safe Execution Worker
        const { startSafeExecutionWorker } = await import('@/jobs/safe-execution.worker');
        startSafeExecutionWorker();

        logger.info({ event: 'workers_init_complete' }, '✅ In-memory background workers ready');
    } catch (err) {
        logger.error({ event: 'workers_init_failed', err }, 'Failed to initialize background workers');
        throw err;
    }
}
