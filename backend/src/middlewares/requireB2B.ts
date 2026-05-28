import type { Request, Response, NextFunction } from 'express';
import createError from 'http-errors';
import { logger } from '@/lib/logger';
import { asyncHandler } from '@/utils/asyncHandler';

/**
 * Restricts access to B2B staff members only.
 * Ensures the caller has an associated `entityId`.
 */
export const requireB2B = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const caller = req.caller;

    if (!caller) {
        throw createError(401, 'Authentication required');
    }

    if (!caller.entityId || !caller.entityType) {
        logger.warn(
            { callerId: caller.sub, email: caller.email },
            'Forbidden access attempt: Caller is not a B2B Institutional member'
        );
        throw createError(403, 'Access denied: This endpoint is restricted to B2B Institutional staff only');
    }

    next();
});
