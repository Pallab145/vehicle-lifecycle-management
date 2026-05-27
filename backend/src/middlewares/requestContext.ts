import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '@/lib/logger';
import { extractRealIP } from '@/utils/extractRealIP';
import { env } from '@/config/env';
import { COOKIE_DEVICE_ID, DEVICE_COOKIE_MAX_AGE } from '@/config/constants';

export function requestContext(req: Request, res: Response, next: NextFunction): void {
    // ── Request ID ────────────────────────────────────────────────
    const requestId = randomUUID();
    res.setHeader('x-request-id', requestId);

    // ── Real IP ───────────────────────────────────────────────────
    const realIP = extractRealIP(req) ?? 'unknown';

    // ── Device ID ─────────────────────────────────────────────────
    let deviceId = req.cookies?.[COOKIE_DEVICE_ID] as string | undefined;

    if (!deviceId || !deviceId.startsWith('did_')) {
        deviceId = `did_${randomUUID().replace(/-/g, '')}`;
        
        res.cookie(COOKIE_DEVICE_ID, deviceId, {
            httpOnly: true,
            secure: env.NODE_ENV === 'production',
            sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
            domain: env.NODE_ENV === 'production' && env.APP_DOMAIN !== 'localhost'
                ? `.${env.APP_DOMAIN}`
                : undefined,
            maxAge: DEVICE_COOKIE_MAX_AGE,
            path: '/',
        });
    }

    // Populate the context object explicitly
    req.context = {
        requestId,
        realIP,
        deviceId,
    };

    next();
}