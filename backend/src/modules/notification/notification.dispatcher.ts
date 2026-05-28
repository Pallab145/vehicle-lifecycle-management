import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { getRedisClient } from '@/lib/redis';
import { RedisKeys } from '@/config/redis.keys';
import type { NotificationEvent, TxStatusChangeEvent } from './notification.types';

export class NotificationDispatcher {
    /**
     * Dispatches an event directly to a specific Citizen/User's personal channel.
     * Used for targeted B2C alerts (e.g. "Your Challan was issued", "Please approve this transfer").
     */
    async notifyUser(userId: string, event: NotificationEvent): Promise<void> {
        const channel = RedisKeys.NOTIFICATION_CHANNEL('user', userId);
        try {
            await getRedisClient().publish(channel, JSON.stringify(event));
            logger.debug({ channel, eventType: event.type }, 'Dispatched targeted User notification');
        } catch (err) {
            logger.error({ err, userId, eventType: event.type }, 'Failed to dispatch User notification');
        }
    }

    /**
     * Dispatches an event directly to a specific B2B Staff Member's personal channel.
     * Used for confirming backend-submitted transactions to the person who clicked "Submit".
     */
    async notifyMember(memberId: string, event: NotificationEvent): Promise<void> {
        const channel = RedisKeys.NOTIFICATION_CHANNEL('member', memberId);
        try {
            await getRedisClient().publish(channel, JSON.stringify(event));
            logger.debug({ channel, eventType: event.type }, 'Dispatched targeted Member notification');
        } catch (err) {
            logger.error({ err, memberId, eventType: event.type }, 'Failed to dispatch Member notification');
        }
    }

    /**
     * Dispatches an event globally to all connected staff of a given B2B Entity.
     * Used for entity-wide alerts or administrative broadcasts.
     */
    async notifyEntity(entityId: string, event: NotificationEvent): Promise<void> {
        const channel = RedisKeys.NOTIFICATION_CHANNEL('entity', entityId);
        try {
            await getRedisClient().publish(channel, JSON.stringify(event));
            logger.debug({ channel, eventType: event.type }, 'Dispatched global Entity notification');
        } catch (err) {
            logger.error({ err, entityId, eventType: event.type }, 'Failed to dispatch Entity notification');
        }
    }

    /**
     * Broadcasts a generic TX_STATUS_CHANGE confirmation.
     * Automatically routes to the Member or User based on who initiated the transaction.
     */
    async dispatchTxResult(
        txHash: string,
        actionType: string,
        status: 'MINED' | 'FAILED',
        initiatorMemberId?: string | null,
        initiatorUserId?: string | null
    ): Promise<void> {
        const event: TxStatusChangeEvent = {
            id: crypto.randomUUID(),
            type: 'TX_STATUS_CHANGE',
            timestamp: Date.now(),
            data: { txHash, actionType, status }
        };

        const promises: Promise<void>[] = [];

        if (initiatorMemberId) {
            promises.push(this.notifyMember(initiatorMemberId, event));
        }

        if (initiatorUserId) {
            promises.push(this.notifyUser(initiatorUserId, event));
        }

        await Promise.allSettled(promises);
    }
}

// Export a singleton instance for global use across Indexer and Reconciliation Worker
export const dispatcher = new NotificationDispatcher();
