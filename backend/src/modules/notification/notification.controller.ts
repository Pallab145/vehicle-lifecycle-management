import type { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sseManager } from './sseManager';
import { RedisKeys } from '@/config/redis.keys';

export const notificationController = {
    /**
     * GET /api/notifications/stream
     * 
     * Initiates a Server-Sent Events (SSE) connection.
     * Keeps the connection open forever and pushes real-time events.
     */
    stream: asyncHandler(async (req: Request, res: Response) => {
        // 1. JWT Authentication Context
        const caller = req.caller;
        if (!caller) {
            // Note: requireAuth middleware should guarantee this exists, but TypeScript needs it.
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // 2. Establish 1:1 Routing ID
        // If they are B2B (Staff), route them as member.
        // If they are B2C (Citizen), route them as user.
        const routingId = caller.role ? RedisKeys.NOTIFICATION_CHANNEL('member', caller.sub) : RedisKeys.NOTIFICATION_CHANNEL('user', caller.sub);

        // 3. Configure HTTP headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        // This stops Nginx from buffering the chunks before sending them
        res.setHeader('X-Accel-Buffering', 'no');
        
        // 4. Attach to global SSE Manager
        sseManager.addClient(routingId, res);

        // 5. Global Entity Broadcast Optimization
        // If this is a B2B staff member, subscribe their connection to the institution's global channel.
        // This allows the backend to broadcast 1 message to 10,000 staff members efficiently.
        if (caller.entityId) {
            sseManager.addClient(RedisKeys.NOTIFICATION_CHANNEL('entity', caller.entityId), res);
        }
        // Keep the connection open indefinitely.
        // The sseManager handles the 'close' event cleanup.
    })
};
