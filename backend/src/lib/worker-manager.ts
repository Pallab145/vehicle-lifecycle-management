import { Worker } from 'bullmq';
import { logger } from '@/lib/logger';

class WorkerManager {
    private workers: Set<Worker> = new Set();
    private shuttingDown = false;
    private readonly SHUTDOWN_TIMEOUT_MS = 15000;

    private withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
        let timeoutId: NodeJS.Timeout;
        const timeoutPromise = new Promise<T>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(`Timeout closing worker: ${name}`)), ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    }

    /**
     * Track a worker for graceful shutdown.
     */
    add(worker: Worker) {
        if (this.shuttingDown) {
            logger.warn({ queue: worker.name }, 'Attempted to add worker during shutdown');
            return worker;
        }

        if (this.workers.has(worker)) {
            return worker;
        }

        this.workers.add(worker);
        return worker;
    }

    /**
     * Gracefully close all tracked workers.
     * Ensures active jobs are finished before the process exits.
     */
    async shutdown() {
        if (this.shuttingDown) return;
        this.shuttingDown = true;

        logger.info({ count: this.workers.size }, 'Shutting down background workers...');

        const closePromises = [...this.workers].map(async (worker) => {
            try {
                await this.withTimeout(worker.close(), this.SHUTDOWN_TIMEOUT_MS, worker.name);
            } catch (err) {
                logger.error({ err, queue: worker.name }, 'Failed to close worker gracefully');
            }
        });

        await Promise.all(closePromises);

        logger.info('All background workers closed');
        this.workers.clear();
    }
}

export const workerManager = new WorkerManager();
