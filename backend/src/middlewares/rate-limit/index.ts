import rateLimit from 'express-rate-limit';
import type { Options as RateLimitOptions } from 'express-rate-limit';
import { extractRealIP } from '@/utils/extractRealIP';
import { env } from '@/config/env';
import type { Request, Response } from 'express';

// ─── Types ────────────────────────────────────────────────────────

interface RateLimitMeta {
    timestamp: string;
    retryAfter?: number;
    endpoint?: string;
}

// ─── Key Generator ────────────────────────────────────────────────

export function keyGenerator(req: Request): string {
    const scope = 'gateway';

    // If caller is authenticated, use their sub (User ID / Member ID)
    if (req.caller?.sub) return `${scope}:sub:${req.caller.sub}`;

    const ip = extractRealIP(req);
    // Note: In memory store, keys are local to the node process.
    return ip ? `${scope}:ip:${ip}` : `${scope}:unknown_ip`;
}

// ─── Shared Handler ───────────────────────────────────────────────

export function makeHandler(message: string) {
    return (req: Request, res: Response) => {
        const meta: RateLimitMeta = {
            timestamp: new Date().toISOString(),
            endpoint: req.path,
        };
        
        const retryAfter = res.getHeader('Retry-After');
        if (retryAfter) {
            const val = Array.isArray(retryAfter) ? retryAfter[0] : retryAfter;
            const num = typeof val === 'number' ? val : parseInt(String(val), 10);
            if (Number.isFinite(num)) meta.retryAfter = num;
        }

        res.status(429).json({
            success: false,
            error: message,
            meta,
        });
    };
}

// Shared options for all limiters
export const sharedOptions: Partial<RateLimitOptions> = {
    standardHeaders: true,   // RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
    legacyHeaders: false,    // Don't use deprecated X-RateLimit-* headers
    keyGenerator,
    skipFailedRequests: false,
};

// ─── 1. Global Gateway Rate Limit ─────────────────────────────────
// Applied to ALL requests passing through the gateway.
// More permissive than service-specific limits.

export const globalRateLimit = rateLimit({
    ...sharedOptions,
    windowMs: env.RATE_LIMIT_WINDOW_MS,       // Default 60 seconds
    max: env.RATE_LIMIT_MAX,                  // Default 200 requests/minute
    skip: (req: Request) =>
        req.path === '/health' ||
        req.path === '/api/health',
    handler: makeHandler('Too many requests. Please slow down.'),
});

// ─── 2. Per-Service Rate Limit Factory ────────────────────────────

export function createServiceRateLimit(serviceName: string) {
    return rateLimit({
        ...sharedOptions,
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        max: 50, // Stricter per-service limit
        // Unique prefix for this limiter's memory store
        keyGenerator: (req) => `${serviceName}:${keyGenerator(req)}`,
        handler: makeHandler(`Too many requests to ${serviceName} service.`),
    });
}
