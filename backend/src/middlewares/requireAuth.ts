import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { env } from '@/config/env';
import type { CallerIdentity } from '@/types';
import { COOKIE } from '@/config/constants';
import createError from 'http-errors';
import { asyncHandler } from '@/utils/asyncHandler';

/**
 * Extract access token from the Authorization header or Cookie.
 */
function extractAccessToken(req: Request): string | null {
    // 1. Try Cookie first
    const cookieToken = req.cookies?.[COOKIE.ACCESS_TOKEN] as string | undefined;
    if (typeof cookieToken === 'string' && cookieToken.length > 0) {
        return cookieToken;
    }

    // 2. Fallback to Authorization Header
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        if (token.length > 0) return token;
    }
    return null;
}

/**
 * Standard JWT Authentication Middleware
 */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractAccessToken(req);
    
    if (!token) {
        throw createError(401, 'Authentication required');
    }

    // Verify JWT signature and expiry
    let payload: CallerIdentity;
    try {
        payload = jwt.verify(token, env.JWT_SECRET, {
            algorithms: ['HS256'],
        }) as CallerIdentity;
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            throw createError(401, 'Token expired');
        }
        if (err instanceof jwt.JsonWebTokenError) {
            throw createError(401, 'Invalid token');
        }
        throw err;
    }

    // Attach identity payload to the request object
    req.caller = payload;
    next();
});
