import type { Request, Response, NextFunction } from 'express';
import createError from 'http-errors';
import crypto from 'crypto';
import { CSRF_EXEMPT_METHODS, CSRF_EXEMPT_PATHS, CSRF_TOKEN_LENGTH, COOKIE } from '@/config/constants';
import { logger } from '@/lib/logger';

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
    if (process.env.NODE_ENV !== 'production') {
        next();
        return;
    }

    // Skip safe HTTP methods — they must not mutate state (RFC 7231)
    if (CSRF_EXEMPT_METHODS.has(req.method)) {
        next();
        return;
    }

    // Skip exempt paths
    const normalizedPath = req.path === '/' ? '/' : req.path.replace(/\/$/, '');
    if (CSRF_EXEMPT_PATHS.has(normalizedPath)) {
        next();
        return;
    }

    const cookieToken = req.cookies[COOKIE.CSRF_TOKEN] as string | undefined;
    const headerToken = req.headers['x-csrf-token'];

    console.log('CSRF Check:', { cookieToken, headerToken, path: req.path });

    // Reject if either token is missing or wrong type
    if (
        typeof cookieToken !== 'string' ||
        cookieToken.length === 0 ||
        typeof headerToken !== 'string' ||
        headerToken.length === 0
    ) {
        logger.warn({
            event: 'csrf_rejected',
            reason: 'missing_tokens',
            ip: req.ip,
            path: req.path,
            timestamp: new Date().toISOString(),
        });
        next(createError(403, 'CSRF token missing'));
        return;
    }

    // Reject tokens that are not the expected length — fail fast on garbage input.
    // This also prevents crypto.timingSafeEqual from throwing on mismatched buffer lengths.
    if (cookieToken.length !== CSRF_TOKEN_LENGTH || headerToken.length !== CSRF_TOKEN_LENGTH) {
        logger.warn({
            event: 'csrf_rejected',
            reason: 'invalid_token_length',
            ip: req.ip,
            path: req.path,
            timestamp: new Date().toISOString(),
        });
        next(createError(403, 'CSRF token invalid'));
        return;
    }

    // Constant-time comparison — prevents timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
        logger.warn({
            event: 'csrf_rejected',
            reason: 'token_mismatch',
            ip: req.ip,
            path: req.path,
            timestamp: new Date().toISOString(),
        });
        next(createError(403, 'CSRF token invalid'));
        return;
    }

    next();
}
