import type { Response } from 'express';
import { logger } from '@/lib/logger';
import type { NotificationEvent } from './notification.types';

/**
 * SSEManager
 * 
 * A singleton that holds active Server-Sent Event (SSE) HTTP connections.
 * It maps a Routing ID (e.g. `member:123` or `user:456`) to a Set of Express Responses.
 * A Set is used to handle multiple browser tabs open by the same user.
 */
class SSEManager {
    // Map of Routing ID to Set of active SSE connections
    private clients: Map<string, Set<Response>> = new Map();
    private heartbeatInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.startHeartbeat();
    }

    /**
     * Starts the global heartbeat interval to keep Cloudflare/Nginx from closing
     * the connections due to 30-second idle timeouts.
     * Sends a tiny comment `:\n\n` every 15 seconds to all active connections.
     */
    private startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.clients.forEach((responses, _routingId) => {
                responses.forEach(res => {
                    res.write(`:\n\n`); // SSE Comment
                });
            });
        }, 15000);
    }

    /**
     * Adds a new client connection to the manager.
     */
    public addClient(routingId: string, res: Response) {
        if (!this.clients.has(routingId)) {
            this.clients.set(routingId, new Set());
        }
        
        const set = this.clients.get(routingId)!;
        set.add(res);

        logger.info({ event: 'sse_connect', routingId, totalTabs: set.size }, 'New SSE stream connected');

        // Initial connection ping
        res.write(`event: CONNECTED\ndata: {"status": "ok"}\n\n`);

        // Handle client disconnect (e.g., closing browser tab)
        res.on('close', () => {
            set.delete(res);
            logger.info({ event: 'sse_disconnect', routingId, totalTabs: set.size }, 'SSE stream disconnected');
            
            // Cleanup map if no more tabs are open
            if (set.size === 0) {
                this.clients.delete(routingId);
            }
        });
    }

    /**
     * Broadcasts a typed NotificationEvent to all active tabs of a specific routing ID.
     */
    public broadcastTo(routingId: string, event: NotificationEvent) {
        const set = this.clients.get(routingId);
        if (!set || set.size === 0) {
            // User is offline, they will fetch state via standard REST endpoints when they login
            return;
        }

        const payload = `event: TRANSACTION_UPDATE\ndata: ${JSON.stringify(event)}\n\n`;
        
        set.forEach(res => {
            res.write(payload);
        });

        logger.info({ event: 'sse_broadcast', routingId, eventType: event.type }, 'Broadcasted SSE to active client');
    }

    /**
     * Graceful shutdown cleanup
     */
    public shutdown() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        this.clients.forEach(responses => {
            responses.forEach(res => res.end());
        });
        this.clients.clear();
    }
}

// Export singleton instance
export const sseManager = new SSEManager();
