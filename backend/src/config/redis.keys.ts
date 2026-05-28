/**
 * Centralized Redis key definitions to ensure consistency across the application.
 */
export const RedisKeys = {
    /**
     * Pub/Sub channel for Server-Sent Events (SSE) user notifications.
     * @param role The role of the recipient (e.g., 'member' for staff, 'user' for citizens, 'entity' for global institution broadcast)
     * @param id The CUID of the recipient
     */
    NOTIFICATION_CHANNEL: (role: 'member' | 'user' | 'entity', id: string) => `notify:${role}:${id}`,

    /**
     * Pattern matcher for subscribing to all notification channels.
     */
    NOTIFICATION_PATTERN: 'notify:*',

    /**
     * Extracts the routing ID (e.g. 'member:cuid123') from a raw Redis channel string.
     */
    EXTRACT_ROUTING_ID: (channel: string) => channel.replace('notify:', '')
};
