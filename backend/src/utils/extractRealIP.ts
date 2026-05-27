import type { Request } from 'express'
import { isValidIP } from './isValidIP'

/**
 * Extract real client IP (Cloudflare-aware).
 * Priority: cf-connecting-ip > x-forwarded-for > x-real-ip > req.ip
 */
export function extractRealIP(req: Request): string | null {
    // Check trust proxy setting
    const trustProxy = req.app.get('trust proxy');

    if (trustProxy) {
        // 1. Cloudflare's real IP header
        const cfIP = req.headers['cf-connecting-ip'];
        if (cfIP && typeof cfIP === 'string' && isValidIP(cfIP.trim())) {
            return cfIP.trim();
        }

        // 2. First IP in x-forwarded-for chain
        const xForwardedFor = req.headers['x-forwarded-for'];
        if (xForwardedFor) {
            const raw = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
            const firstIP = raw?.split(',')[0]?.trim();
            if (firstIP && isValidIP(firstIP)) return firstIP;
        }

        // 3. x-real-ip
        const xRealIP = req.headers['x-real-ip'];
        if (xRealIP && typeof xRealIP === 'string' && isValidIP(xRealIP.trim())) {
            return xRealIP.trim();
        }
    }

    // 4. Express req.ip (populated from socket or trusted proxy)
    if (req.ip && isValidIP(req.ip)) return req.ip;

    // 5. Socket address (last resort)
    const socketIP = req.socket?.remoteAddress;
    if (socketIP && isValidIP(socketIP)) return socketIP;

    return null;
}